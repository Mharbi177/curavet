import type { FastifyInstance } from 'fastify';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { CryptoService } from '../services/crypto';
import { processInboundMessage } from '../services/inbound';
import { sendToClient } from '../services/messaging';
import { webhookEventsTotal } from '../services/metrics';

interface WhatsAppEvent {
  messaging_product?: string;
  message?: { from?: string; text?: { body?: string } };
  status?: { status?: string; recipient_id?: string };
  errors?: unknown[];
}

/**
 * Validate Meta's `X-Hub-Signature-256` header.
 *
 * Returns `true` when verification is not configured, so local development and
 * self-hosted deployments without a Meta app secret keep working. Production
 * deployments are blocked from booting without META_APP_SECRET by
 * `assertProductionSafety`.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signature: string | undefined
): boolean {
  if (!env.META_APP_SECRET) return true;
  return CryptoService.verifyWebhookSignature(rawBody, signature, env.META_APP_SECRET);
}

/**
 * Phase 4.1 — WhatsApp Cloud API webhook.
 *
 * Meta requires a 200 response within ~5s, so the route acknowledges immediately
 * and processes the message (AI + persistence + reply) in the background.
 */
export default async function whatsappWebhookRoutes(fastify: FastifyInstance) {
  // ── Verification handshake ────────────────────────────────────────────────
  fastify.get<{ Querystring: Record<string, string> }>('/webhooks/whatsapp', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
      logger.info('WhatsApp webhook verified');
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send({ error: 'Forbidden' });
  });

  // ── Inbound events ────────────────────────────────────────────────────────
  fastify.post(
    '/webhooks/whatsapp',
    {
      config: {
        // Preserve the exact raw bytes for X-Hub-Signature-256 verification.
        rawBody: true,
        // Meta bursts deliveries; this limit exists only to stop abuse.
        rateLimit: { max: 2000, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      // HMAC must be computed over the raw payload, never the re-serialized body.
      const rawBody = request.rawBody ?? '';
      if (!rawBody) {
        return reply.status(400).send({ error: 'Request body is required' });
      }

      if (!verifyMetaSignature(rawBody, request.headers['x-hub-signature-256'] as string | undefined)) {
        webhookEventsTotal.inc({ platform: 'whatsapp', outcome: 'invalid_signature' });
        logger.warn('Rejected WhatsApp webhook with invalid X-Hub-Signature-256');
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }

      const body = request.body as {
        object?: string;
        entry?: Array<{ changes?: Array<{ value?: WhatsAppEvent & { metadata?: { phone_number_id?: string } } }> }>;
      };

      if (body?.object !== 'whatsapp_business_account') {
        return reply.status(404).send({ error: 'Unexpected object type' });
      }

      const value = body.entry?.[0]?.changes?.[0]?.value;

      // Delivery status read receipts and error events are informational.
      if (!value?.message?.text?.body || !value?.message?.from) {
        webhookEventsTotal.inc({ platform: 'whatsapp', outcome: 'non_message' });
        return reply.status(200).send('EVENT_RECEIVED');
      }

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        return reply.status(200).send('EVENT_RECEIVED');
      }

      // Acknowledge first — everything below runs after the response is flushed.
      reply.status(200).send('EVENT_RECEIVED');

      const from = value.message!.from as string;
      const text = value.message!.text!.body as string;

      setImmediate(async () => {
        try {
          const integration = await prisma.tenantIntegration.findFirst({
            where: {
              externalAccountId: phoneNumberId,
              platform: 'whatsapp',
              status: 'active',
            },
            select: { tenantId: true },
          });

          if (!integration) {
            webhookEventsTotal.inc({ platform: 'whatsapp', outcome: 'unknown_tenant' });
            logger.warn(`No active WhatsApp integration for phone_number_id ${phoneNumberId}`);
            return;
          }

          const result = await processInboundMessage({
            tenantId: integration.tenantId,
            platform: 'whatsapp',
            from,
            text,
            externalAccountId: phoneNumberId,
          });

          if (result?.reply) {
            await sendToClient({
              tenantId: integration.tenantId,
              to: from,
              message: result.reply,
              platform: 'whatsapp',
            });
          }
        } catch (error) {
          webhookEventsTotal.inc({ platform: 'whatsapp', outcome: 'error' });
          logger.error('WhatsApp background processing failed', (error as Error)?.message);
        }
      });

      return reply;
    }
  );
}
