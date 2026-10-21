import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { getUpsellSuggestion, validateUpsellRuleServices } from '../services/upsell';
import type { SupportedLanguage } from '../services/language';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

const UpsellRuleSchema = z.object({
  triggerServiceId: z.string().min(1),
  suggestedServiceId: z.string().min(1),
  messageEn: z.string().min(1).max(1000),
  messageAr: z.string().min(1).max(1000),
  discountPercent: z.number().int().min(0).max(90).default(0),
  priority: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});

/** Phase 5.4 — AI upsell engine configuration. */
export default async function upsellRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/api/tenants/me/upsell-rules', { preHandler: requireTenant }, async (request) => {
    const tenantId = tenantIdOf(request);

    const [rules, services] = await Promise.all([
      prisma.upsellRule.findMany({
        where: { tenantId },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.service.findMany({
        where: { tenantId },
        select: { id: true, nameEn: true, nameAr: true, price: true },
      }),
    ]);

    const byId = new Map(services.map((s) => [s.id, s]));

    return rules.map((rule) => ({
      ...rule,
      triggerService: byId.get(rule.triggerServiceId) ?? null,
      suggestedService: byId.get(rule.suggestedServiceId) ?? null,
    }));
  });

  fastify.post(
    '/api/tenants/me/upsell-rules',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = UpsellRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenantId = tenantIdOf(request);
      const check = await validateUpsellRuleServices(
        tenantId,
        parsed.data.triggerServiceId,
        parsed.data.suggestedServiceId
      );
      if (!check.ok) return reply.status(400).send({ error: check.error });

      try {
        const rule = await prisma.upsellRule.create({ data: { ...parsed.data, tenantId } });
        return reply.status(201).send(rule);
      } catch {
        return reply.status(409).send({ error: 'This upsell rule already exists' });
      }
    }
  );

  fastify.patch(
    '/api/tenants/me/upsell-rules/:id',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = UpsellRuleSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const existing = await prisma.upsellRule.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Upsell rule not found' });

      return prisma.upsellRule.update({ where: { id }, data: parsed.data });
    }
  );

  fastify.delete('/api/tenants/me/upsell-rules/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await prisma.upsellRule
      .delete({ where: { id, tenantId: tenantIdOf(request) } })
      .catch(() => null);

    if (!deleted) return reply.status(404).send({ error: 'Upsell rule not found' });
    return reply.status(204).send();
  });

  /** Preview which suggestion the agent would make after a given service. */
  fastify.post(
    '/api/tenants/me/upsell-rules/preview',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = z
        .object({
          triggerServiceId: z.string().min(1),
          language: z.enum(['ar', 'en', 'fr', 'ur', 'tl']).default('en'),
        })
        .safeParse(request.body);

      if (!parsed.success) return reply.status(400).send({ error: 'Invalid payload' });

      const suggestion = await getUpsellSuggestion({
        tenantId: tenantIdOf(request),
        triggerServiceId: parsed.data.triggerServiceId,
        language: parsed.data.language as SupportedLanguage,
      });
      return { suggestion };
    }
  );
}
