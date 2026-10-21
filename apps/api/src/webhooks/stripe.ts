import type { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger';
import { applyStripeEvent, constructStripeEvent } from '../services/payments';
import { publish } from '../services/realtime';
import { prisma } from '../lib/prisma';

/**
 * Phase 5.3 + 6.1 — Stripe webhook.
 *
 * Handles one-time B2C booking deposits (Phase 5.3) and recurring B2B SaaS
 * subscription lifecycle events (Phase 6.1).
 *
 * The raw body is required for signature verification, so this route is
 * registered with a content-type parser that preserves the exact bytes.
 */
export default async function stripeWebhookRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/webhooks/stripe',
    {
      config: { rawBody: true, rateLimit: false },
      schema: {
        body: { type: 'string', description: 'Raw Stripe event JSON' },
      },
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string | undefined;

      // Prefer the raw buffer; fall back to the parsed body for safety.
      const raw =
        (request as unknown as { rawBody?: Buffer }).rawBody ??
        Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));

      let event;
      try {
        event = constructStripeEvent(raw, signature);
      } catch (error) {
        logger.warn(`Rejected Stripe webhook: ${(error as Error).message}`);
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      try {
        const result = await applyStripeEvent(event);

        if (result.handled && result.paymentId) {
          const payment = await prisma.payment.findUnique({
            where: { id: result.paymentId },
            select: { tenantId: true, bookingId: true, status: true, amount: true, currency: true },
          });

          if (payment) {
            publish({
              type: 'booking',
              tenantId: payment.tenantId,
              payload: {
                bookingId: payment.bookingId,
                paymentStatus: payment.status,
                amount: payment.amount,
                currency: payment.currency,
              },
            });
          }
        }

        // ── B2B: subscription status changed ─────────────────────────────────
        // Publish a platform-wide event so the super-admin dashboard refreshes
        // tenant plan/status in real time without polling.
        const SUBSCRIPTION_EVENTS = [
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'checkout.session.completed',
          'invoice.paid',
          'invoice.payment_failed',
        ];

        if (result.handled && SUBSCRIPTION_EVENTS.includes(event.type)) {
          publish({
            type: 'conversation', // reuses existing type; payload carries the discriminator
            tenantId: 'platform',
            payload: { event: event.type },
          });
        }

        return reply.send({ received: true, handled: result.handled });
      } catch (error) {
        logger.error('Stripe event handling failed', (error as Error)?.message);
        // 500 makes Stripe retry, which is what we want for transient DB errors.
        return reply.status(500).send({ error: 'Event processing failed' });
      }
    }
  );
}
