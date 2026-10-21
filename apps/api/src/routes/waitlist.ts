import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { expireStaleOffers, hasAvailability, joinWaitlist } from '../services/waitlist';
import { enqueueOutbound } from '../services/queue';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

const JoinSchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().nullish(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).nullish(),
  notes: z.string().max(500).nullish(),
});

/** Phase 5.6 — Waitlist management endpoints. */
export default async function waitlistRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/api/tenants/me/waitlist', { preHandler: requireTenant }, async (request) => {
    return prisma.waitlistEntry.findMany({
      where: { tenantId: tenantIdOf(request) },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, nameEn: true, nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  fastify.post(
    '/api/tenants/me/waitlist',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = JoinSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      try {
        const result = await joinWaitlist({
          tenantId: tenantIdOf(request),
          clientId: parsed.data.clientId,
          serviceId: parsed.data.serviceId,
          staffId: parsed.data.staffId ?? null,
          preferredDate: parsed.data.preferredDate ?? null,
          preferredTimeOfDay: parsed.data.preferredTimeOfDay ?? 'any',
          notes: parsed.data.notes ?? null,
        });
        return reply.status(201).send(result);
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  /** Check capacity before the bot offers the waitlist instead of a booking. */
  fastify.post(
    '/api/tenants/me/waitlist/has-availability',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = z
        .object({ serviceId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const available = await hasAvailability({
        tenantId: tenantIdOf(request),
        serviceId: parsed.data.serviceId,
        date: parsed.data.date,
      });
      return { available };
    }
  );

  fastify.patch(
    '/api/tenants/me/waitlist/:id',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = z
        .object({ status: z.enum(['waiting', 'offered', 'booked', 'expired', 'cancelled']) })
        .safeParse(request.body);

      if (!parsed.success) return reply.status(400).send({ error: 'Invalid payload' });

      const existing = await prisma.waitlistEntry.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Waitlist entry not found' });

      return prisma.waitlistEntry.update({ where: { id }, data: { status: parsed.data.status } });
    }
  );

  fastify.delete('/api/tenants/me/waitlist/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await prisma.waitlistEntry
      .delete({ where: { id, tenantId: tenantIdOf(request) } })
      .catch(() => null);

    if (!deleted) return reply.status(404).send({ error: 'Waitlist entry not found' });
    return reply.status(204).send();
  });

  /** Housekeeping: expire stale offers so the slot can move down the list. */
  fastify.post('/api/tenants/me/waitlist/expire-stale', { preHandler: requireTenant }, async (request) => {
    const expired = await expireStaleOffers(tenantIdOf(request));
    return { expired };
  });

  /** Manually re-run "freed slot" matching for a waitlisted client. */
  fastify.post('/api/tenants/me/waitlist/:id/notify', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenantIdOf(request);

    const entry = await prisma.waitlistEntry.findFirst({
      where: { id, tenantId },
      include: { client: true, service: true, staff: true },
    });

    if (!entry) return reply.status(404).send({ error: 'Waitlist entry not found' });
    if (!entry.client.phone) {
      return reply.status(400).send({ error: 'Client has no reachable phone number' });
    }
    if (entry.status !== 'waiting') {
      return reply.status(409).send({ error: `Entry is already ${entry.status}` });
    }

    const message =
      (entry.client.languagePreference || 'en') === 'ar'
        ? `مرحباً ${entry.client.name ?? ''}، نود إبلاغك أن موعداً لـ${entry.service.nameAr} أصبح متاحاً. أرسلي "نعم" للمزيد من التفاصيل.`.trim()
        : `Hi ${entry.client.name ?? ''}, a slot for ${entry.service.nameEn} is now available. Reply "yes" for details.`;

    await enqueueOutbound({ tenantId, to: entry.client.phone, message });

    await prisma.waitlistEntry.update({
      where: { id },
      data: { status: 'offered', notifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
    });

    return { notified: true };
  });
}
