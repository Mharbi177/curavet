import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { buildReviewRequest, parseRatingToken, ratingAggregate, recordReview } from '../services/reviews';
import { enqueueOutbound } from '../services/queue';
import { publish } from '../services/realtime';
import { DEFAULT_SUPPORTED_LANGUAGES, type SupportedLanguage } from '../services/language';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

/** Phase 4.6 — Review and feedback collection. */
export default async function reviewRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/api/tenants/me/reviews/aggregate', { preHandler: requireTenant }, async (request) => {
    return ratingAggregate(tenantIdOf(request));
  });

  fastify.get('/api/tenants/me/reviews', { preHandler: requireTenant }, async (request) => {
    return prisma.review.findMany({
      where: { tenantId: tenantIdOf(request) },
      include: { client: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  fastify.post(
    '/api/tenants/me/reviews',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = z
        .object({
          bookingId: z.string().nullish(),
          clientId: z.string().nullish(),
          rating: z.coerce.number().int().min(1).max(5),
          comment: z.string().max(2000).nullish(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      try {
        const result = await recordReview({
          tenantId: tenantIdOf(request),
          bookingId: parsed.data.bookingId ?? null,
          clientId: parsed.data.clientId ?? null,
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
          source: 'manual',
        });
        publish({ type: 'review', tenantId: tenantIdOf(request), payload: result });
        return reply.status(201).send(result);
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  /** Parse a raw chat reply ("5", "rating 4/5") into a rating. */
  fastify.post(
    '/api/tenants/me/reviews/parse',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = z.object({ text: z.string() }).safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid payload' });
      return { rating: parseRatingToken(parsed.data.text) };
    }
  );

  /** Send the "how was it?" prompt for a completed booking on demand. */
  fastify.post(
    '/api/tenants/me/bookings/:id/request-review',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const booking = await prisma.booking.findFirst({
        where: { id, tenantId },
        include: { client: true },
      });
      if (!booking) return reply.status(404).send({ error: 'Booking not found' });
      if (booking.status !== 'completed') {
        return reply.status(400).send({ error: 'Only completed bookings can be reviewed' });
      }
      if (!booking.client.phone) {
        return reply.status(400).send({ error: 'Client has no reachable phone number' });
      }

      const prompt = await buildReviewRequest({
        tenantId,
        bookingId: id,
        languageCode: booking.client.languagePreference || 'en',
      });

      if (!prompt) {
        return reply
          .status(409)
          .send({ error: 'A review was already requested or reviews are disabled' });
      }

      await enqueueOutbound({ tenantId, to: booking.client.phone, message: prompt.message });
      return { requested: true };
    }
  );

  /** Language capability probe (Phase 5.2). */
  fastify.get('/api/tenants/me/languages', { preHandler: requireTenant }, async (request) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdOf(request) },
      select: { supportedLanguages: true, languageDefault: true },
    });

    return {
      supported: (tenant?.supportedLanguages ?? DEFAULT_SUPPORTED_LANGUAGES) as SupportedLanguage[],
      default: tenant?.languageDefault ?? 'en',
    };
  });
}
