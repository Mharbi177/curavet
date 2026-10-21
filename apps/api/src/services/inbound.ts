import { prisma } from '../lib/prisma';
import { CuraVetAgent, type ProcessContext } from '../ai/CuraVetAgent';
import { detectLanguage, DEFAULT_SUPPORTED_LANGUAGES, type SupportedLanguage } from './language';
import { webhookEventsTotal } from './metrics';
import { publish } from './realtime';
import { logger } from '../lib/logger';

export type InboundPlatform = 'whatsapp' | 'instagram' | 'web';

export interface InboundMessage {
  tenantId: string;
  platform: InboundPlatform;
  /** Sender identifier: phone number, Instagram-scoped id, or web session id. */
  from: string;
  text: string;
  externalAccountId?: string | null;
}

/**
 * Shared inbound-message pipeline used by the WhatsApp webhook, the Instagram
 * webhook and the embeddable web widget.
 *
 * Resolves the client + conversation, loads a bounded history, persists the
 * inbound message, runs the tenant's AI agent, then persists and publishes the
 * reply. Never throws — callers run inside webhooks that must stay alive.
 */
export async function processInboundMessage(
  message: InboundMessage
): Promise<{ reply: string; conversationId: string } | null> {
  const { tenantId, platform, from, text } = message;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, isActive: true, languageDefault: true, supportedLanguages: true },
    });

    if (!tenant || !tenant.isActive) {
      webhookEventsTotal.inc({ platform, outcome: 'tenant_inactive' });
      return null;
    }

    const client = await resolveClient(tenantId, platform, from);

    // Language detection updates the client preference for future replies.
    const supported = (tenant.supportedLanguages?.length
      ? tenant.supportedLanguages
      : DEFAULT_SUPPORTED_LANGUAGES) as SupportedLanguage[];
    const detection = await detectLanguage(
      text,
      supported,
      (tenant.languageDefault as SupportedLanguage) || 'en'
    );

    if (detection.language && detection.language !== client.languagePreference) {
      await prisma.client.update({
        where: { id: client.id },
        data: { languagePreference: detection.language },
      });
    }

    let conversation = await prisma.conversation.findFirst({
      where: { tenantId, clientId: client.id, platform, status: 'active' },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { tenantId, clientId: client.id, platform },
      });
    }

    const historyRows = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const history = historyRows
      .reverse()
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const userMessage = await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: text },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    publish({ type: 'message', tenantId, conversationId: conversation.id, payload: userMessage });

    // If a human agent has taken over, don't run the AI.
    if (conversation.humanTakeover) {
      webhookEventsTotal.inc({ platform, outcome: 'human_takeover' });
      return { reply: '', conversationId: conversation.id };
    }

    const agent = await CuraVetAgent.forTenant(tenantId);

    if (!agent) {
      webhookEventsTotal.inc({ platform, outcome: 'no_llm' });
      logger.warn(`[inbound] no LLM provider configured for tenant ${tenantId}; message not answered.`);
      return { reply: '', conversationId: conversation.id };
    }

    const ctx: ProcessContext = {
      clientPhone: platform === 'web' ? undefined : from,
      clientName: client.name ?? undefined,
      platform,
      conversationId: conversation.id,
    };

    const reply = await agent.processMessage(text, history, ctx);

    // Empty reply means a human agent has taken over — do not duplicate.
    if (reply) {
      const assistantMessage = await prisma.conversationMessage.create({
        data: { conversationId: conversation.id, role: 'assistant', content: reply },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      publish({
        type: 'message',
        tenantId,
        conversationId: conversation.id,
        payload: assistantMessage,
      });
    }

    webhookEventsTotal.inc({ platform, outcome: 'answered' });
    return { reply, conversationId: conversation.id };
  } catch (error) {
    webhookEventsTotal.inc({ platform, outcome: 'error' });
    logger.error(`[inbound] failed to process ${platform} message`, (error as Error)?.message);
    return null;
  }
}

async function resolveClient(tenantId: string, platform: InboundPlatform, from: string) {
  if (platform === 'web') {
    const existing = await prisma.client.findFirst({ where: { tenantId, webSessionId: from } });
    if (existing) {
      await prisma.client.update({ where: { id: existing.id }, data: { lastContactAt: new Date() } });
      return existing;
    }
    return prisma.client.create({ data: { tenantId, webSessionId: from } });
  }

  if (platform === 'instagram') {
    const existing = await prisma.client.findFirst({ where: { tenantId, instagramId: from } });
    if (existing) {
      await prisma.client.update({ where: { id: existing.id }, data: { lastContactAt: new Date() } });
      return existing;
    }
    return prisma.client.create({ data: { tenantId, instagramId: from } });
  }

  const existing = await prisma.client.findFirst({ where: { tenantId, phone: from } });
  if (existing) {
    await prisma.client.update({ where: { id: existing.id }, data: { lastContactAt: new Date() } });
    return existing;
  }
  return prisma.client.create({ data: { tenantId, phone: from } });
}
