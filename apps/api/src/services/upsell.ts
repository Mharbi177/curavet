import { prisma } from '../lib/prisma';
import type { SupportedLanguage } from './language';

export interface UpsellSuggestion {
  ruleId: string;
  suggestedServiceId: string;
  serviceName: string;
  price: number;
  currency: string;
  discountPercent: number;
  message: string;
}

/**
 * Phase 5.4 — AI upsell engine.
 *
 * After a booking is confirmed the agent asks for the highest-priority active
 * rule triggered by the booked service. Only suggestions for active services
 * that the client is not already booking are returned.
 */
export async function getUpsellSuggestion(params: {
  tenantId: string;
  triggerServiceId: string;
  language: SupportedLanguage;
  excludeServiceIds?: string[];
}): Promise<UpsellSuggestion | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { upsellEnabled: true },
  });

  if (!tenant?.upsellEnabled) return null;

  const exclude = new Set([params.triggerServiceId, ...(params.excludeServiceIds ?? [])]);

  const rules = await prisma.upsellRule.findMany({
    where: {
      tenantId: params.tenantId,
      triggerServiceId: params.triggerServiceId,
      isActive: true,
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 5,
  });

  for (const rule of rules) {
    if (exclude.has(rule.suggestedServiceId)) continue;

    const service = await prisma.service.findFirst({
      where: { id: rule.suggestedServiceId, tenantId: params.tenantId, isActive: true },
    });

    if (!service) continue;

    const discounted = rule.discountPercent > 0
      ? service.price * (1 - rule.discountPercent / 100)
      : service.price;

    const template = params.language === 'ar' ? rule.messageAr : rule.messageEn;

    const message = template
      .replace(/\{\{service\}\}/g, service.nameEn)
      .replace(/\{\{serviceAr\}\}/g, service.nameAr)
      .replace(/\{\{price\}\}/g, discounted.toFixed(2))
      .replace(/\{\{currency\}\}/g, service.currency)
      .replace(/\{\{discount\}\}/g, String(rule.discountPercent));

    return {
      ruleId: rule.id,
      suggestedServiceId: service.id,
      serviceName: service.nameEn,
      price: Number(discounted.toFixed(2)),
      currency: service.currency,
      discountPercent: rule.discountPercent,
      message,
    };
  }

  return null;
}

/**
 * Validate upsell rule payloads before they reach the database.
 */
export async function validateUpsellRuleServices(
  tenantId: string,
  triggerServiceId: string,
  suggestedServiceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (triggerServiceId === suggestedServiceId) {
    return { ok: false, error: 'A service cannot upsell itself.' };
  }

  const found = await prisma.service.findMany({
    where: { tenantId, id: { in: [triggerServiceId, suggestedServiceId] } },
    select: { id: true },
  });

  if (found.length !== 2) {
    return { ok: false, error: 'Both trigger and suggested services must belong to this tenant.' };
  }

  return { ok: true };
}
