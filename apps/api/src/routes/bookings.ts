import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { createBooking } from '../services/booking';
import {
  cancelBookingReminders,
  enqueueLifecycle,
  enqueueOutbound,
  scheduleBookingReminders,
} from '../services/queue';
import { offerFreedSlot } from '../services/waitlist';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

/**
 * Hand a freed slot to the first matching waitlisted client (Phase 5.6).
 * Failures are logged, never propagated — cancelling must always succeed.
 */
async function releaseSlotToWaitlist(tenantId: string, bookingId: string): Promise<void> {
  try {
    const offers = await offerFreedSlot({ tenantId, freedBookingId: bookingId });
    for (const offer of offers) {
      if (!offer.clientPhone) continue;
      const isArabic = offer.languageCode === 'ar';
      await enqueueOutbound({
        tenantId,
        to: offer.clientPhone,
        message: isArabic
          ? `توفر موعد لـ${offer.serviceName} مع ${offer.staffName}. أرسلي "نعم" لتأكيد الحجز خلال ساعة.`
          : `A slot opened up for ${offer.serviceName} with ${offer.staffName}. Reply "yes" within the hour to claim it.`,
      });
    }
  } catch (error) {
    console.error('[waitlist] failed to release slot', error);
  }
}

export const BOOKING_STATUS = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const;

const CreateBookingSchema = z.object({
  clientId: z.string().min(1),
  staffId: z.string().min(1),
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  notes: z.string().max(2000).nullish(),
  price: z.number().min(0).nullish(),
  status: z.enum(['pending', 'confirmed']).default('confirmed'),
});

export default async function bookingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/api/tenants/me/bookings', { preHandler: requireTenant }, async (request) => {
    const tenantId = tenantIdOf(request);
    const q = request.query as { startDate?: string; endDate?: string; status?: string };

    const where = {
      tenantId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.startDate || q.endDate
        ? {
            scheduledAt: {
              ...(q.startDate ? { gte: new Date(q.startDate) } : {}),
              ...(q.endDate ? { lte: new Date(q.endDate) } : {}),
            },
          }
        : {}),
    };

    return prisma.booking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, phone: true, languagePreference: true } },
        service: true,
        staff: { select: { id: true, name: true } },
        review: { select: { rating: true, comment: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
  });

  fastify.get('/api/tenants/me/bookings/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const booking = await prisma.booking.findFirst({
      where: { id, tenantId: tenantIdOf(request) },
      include: { client: true, service: true, staff: true, payments: true, review: true },
    });
    if (!booking) return reply.status(404).send({ error: 'Booking not found' });
    return booking;
  });

  /** Manual booking created by the salon admin (Phase 3.3). */
  fastify.post(
    '/api/tenants/me/bookings',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = CreateBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenantId = tenantIdOf(request);
      const client = await prisma.client.findFirst({
        where: { id: parsed.data.clientId, tenantId },
        select: { id: true, phone: true },
      });
      if (!client) return reply.status(404).send({ error: 'Client not found' });

      const result = await createBooking({
        tenantId,
        clientId: client.id,
        staffId: parsed.data.staffId,
        serviceId: parsed.data.serviceId,
        date: parsed.data.date,
        time: parsed.data.time,
        source: 'manual',
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
        price: parsed.data.price ?? null,
      });

      if (!result.ok) {
        const status =
          result.code === 'conflict'
            ? 409
            : result.code === 'invalid_time'
              ? 400
              : result.code === 'outside_working_hours'
                ? 422
                : 404;
        return reply.status(status).send({ error: result.message, code: result.code });
      }

      await scheduleBookingReminders(result.bookingId);

      if (client.phone) {
        await enqueueOutbound({
          tenantId,
          to: client.phone,
          message: `Your appointment is confirmed. Reference ${result.reference} on ${parsed.data.date} at ${parsed.data.time}.`,
        });
      }

      return reply.status(201).send({
        id: result.bookingId,
        reference: result.reference,
        scheduledAt: result.scheduledAt.toISOString(),
        endsAt: result.endsAt.toISOString(),
      });
    }
  );
  fastify.patch(
    '/api/tenants/me/bookings/:id',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const parsed = z
        .object({
          status: z.enum(BOOKING_STATUS).optional(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
          staffId: z.string().optional(),
          notes: z.string().max(2000).nullish(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const booking = await prisma.booking.findFirst({ where: { id, tenantId } });
      if (!booking) return reply.status(404).send({ error: 'Booking not found' });

      const nextStatus = parsed.data.status;
      const reschedule = Boolean(parsed.data.date || parsed.data.time || parsed.data.staffId);

      if (reschedule) {
        const date = parsed.data.date ?? new Intl.DateTimeFormat('en-CA').format(booking.scheduledAt);
        const time =
          parsed.data.time ??
          new Intl.DateTimeFormat('en-GB', {
            timeZone: 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(booking.scheduledAt);
        const staffId = parsed.data.staffId ?? booking.staffId;

        const recreate = await createBooking({
          tenantId,
          clientId: booking.clientId,
          staffId,
          serviceId: booking.serviceId,
          date,
          time,
          source: booking.source,
          status: booking.status === 'pending' ? 'pending' : 'confirmed',
          notes: booking.notes,
          price: booking.price,
        });

        if (!recreate.ok) {
          const status =
            recreate.code === 'conflict'
              ? 409
              : recreate.code === 'outside_working_hours'
                ? 422
                : 400;
          return reply.status(status).send({ error: recreate.message, code: recreate.code });
        }

        await prisma.booking.update({ where: { id }, data: { status: 'cancelled' } });
        await cancelBookingReminders(id);
        await scheduleBookingReminders(recreate.bookingId);

        const replacement = await prisma.booking.findUnique({ where: { id: recreate.bookingId } });
        return reply.send({ ...replacement, rescheduledFrom: id });
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        },
      });

      if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
        await cancelBookingReminders(id);
        await releaseSlotToWaitlist(tenantId, id);
      }

      if (nextStatus === 'completed') {
        await enqueueLifecycle({ kind: 'review_request', tenantId, bookingId: id }, 30 * 60 * 1000);
      }

      return updated;
    }
  );

  fastify.delete('/api/tenants/me/bookings/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenantIdOf(request);

    const booking = await prisma.booking.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!booking) return reply.status(404).send({ error: 'Booking not found' });

    await prisma.booking.update({ where: { id }, data: { status: 'cancelled' } });
    await cancelBookingReminders(id);
    await releaseSlotToWaitlist(tenantId, id);

    return reply.status(204).send();
  });
}
