import type { FastifyInstance } from 'fastify';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { processInboundMessage } from '../services/inbound';
import { sendToClient } from '../services/messaging';
import { webhookEventsTotal } from '../services/metrics';
import { verifyMetaSignature } from './whatsapp';

interface InstagramEvent {
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    message?: { text?: string; is_echo?: boolean };
  }>;
  postback?: { payload?: string; sender?: { id?: string } };
}

function firstText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 4096 ? trimmed : undefined;
}

/**
 * Phase 4.2 — Instagram Messaging (DM) webhook.
 *
 * Shares the WhatsApp signature check, conversation pipeline and AI agent; only
 * the payload shape and the outbound sender differ.
 */
export default async function instagramWebhookRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: Record<string, string> }>('/webhooks/instagram', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
      logger.info('Instagram webhook verified');
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send({ error: 'Forbidden' });
  });

  fastify.post(
    '/webhooks/instagram',
    { config: { rateLimit: { max: 2000, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const rawBody = JSON.stringify(request.body ?? {});

      if (!verifyMetaSignature(rawBody, request.headers['x-hub-signature-256'] as string | undefined)) {
        webhookEventsTotal.inc({ platform: 'instagram', outcome: 'invalid_signature' });
        logger.warn('Rejected Instagram webhook with invalid X-Hub-Signature-256');
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }

      const body = request.body as {
        object?: string;
        entry?: Array<{
          id?: string;
          messaging?: InstagramEvent['messaging'];
          changes?: Array<{ value?: InstagramEvent }>;
        }>;
      };

      if (body?.object !== 'instagram') {
        return reply.status(404).send({ error: 'Unexpected object type' });
      }

      const envelope = body.entry?.[0];
      const events = envelope?.messaging ?? envelope?.changes?.[0]?.value?.messaging ?? [];

      // The Instagram professional account id used for outbound replies.
      const igUserId = envelope?.id;
      if (!igUserId || events.length === 0) {
        webhookEventsTotal.inc({ platform: 'instagram', outcome: 'non_message' });
        return reply.status(200).send('EVENT_RECEIVED');
      }

      reply.status(200).send('EVENT_RECEIVED');

      for (const event of events) {
        // Echoes are messages the business account itself sent — ignore them
        // or the bot will talk to itself.
        if (event.message?.is_echo) {
          webhookEventsTotal.inc({ platform: 'instagram', outcome: 'echo' });
          continue;
        }

        const text = firstText(event.message?.text);
        const from = event.sender?.id;

        if (!text || !from) {
          webhookEventsTotal.inc({ platform: 'instagram', outcome: 'non_message' });
          continue;
        }

        setImmediate(async () => {
          try {
            const integration = await prisma.tenantIntegration.findFirst({
              where: {
                externalAccountId: igUserId,
                platform: 'instagram',
                status: 'active',
              },
              select: { tenantId: true },
            });

            if (!integration) {
              webhookEventsTotal.inc({ platform: 'instagram', outcome: 'unknown_tenant' });
              logger.warn(`No active Instagram integration for ig user id ${igUserId}`);
              return;
            }

            const result = await processInboundMessage({
              tenantId: integration.tenantId,
              platform: 'instagram',
              from,
              text,
              externalAccountId: igUserId,
            });

            if (result?.reply) {
              await sendToClient({
                tenantId: integration.tenantId,
                to: from,
                message: result.reply,
                platform: 'instagram',
              });
            }
          } catch (error) {
            webhookEventsTotal.inc({ platform: 'instagram', outcome: 'error' });
            logger.error('Instagram background processing failed', (error as Error)?.message);
          }
        });
      }

      return reply;
    }
  );
}
