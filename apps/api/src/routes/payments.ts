import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { createBookingPaymentLink, isStripeEnabled } from '../services/payments';
import { enqueueOutbound } from '../services/queue';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

/** Phase 5.3 — Stripe payment links delivered over the client's channel. */
export default async function paymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/api/tenants/me/payments', { preHandler: requireTenant }, async (request) => {
    return prisma.payment.findMany({
      where: { tenantId: tenantIdOf(request) },
      include: { booking: { select: { id: true, scheduledAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  fastify.post(
    '/api/tenants/me/bookings/:id/payment-link',
    { preHandler: requireTenant },
    async (request, reply) => {
      if (!isStripeEnabled()) {
        return reply.status(503).send({ error: 'Payments are not configured on this platform' });
      }

      const { id } = request.params as { id: string };
      const booking = await prisma.booking.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        include: { service: true, client: true },
      });

      if (!booking) return reply.status(404).send({ error: 'Booking not found' });
      if (booking.status === 'cancelled') {
        return reply.status(400).send({ error: 'Cannot take payment for a cancelled booking' });
      }

      const amount = booking.price ?? booking.service.price;
      if (amount <= 0) {
        return reply.status(400).send({ error: 'This booking has no chargeable amount' });
      }

      try {
        const result = await createBookingPaymentLink({
          tenantId: booking.tenantId,
          bookingId: booking.id,
          amount,
          currency: booking.currency || booking.service.currency || 'AED',
          serviceName: booking.service.nameEn,
          clientEmail: null,
        });

        if (booking.client.phone) {
          await enqueueOutbound({
            tenantId: booking.tenantId,
            to: booking.client.phone,
            message: `Payment link for ${booking.service.nameEn} (${result.amount} ${result.currency}): ${result.url}`,
          });
        }

        return result;
      } catch (error) {
        request.log.error({ err: error }, 'payment link failed');
        return reply.status(502).send({ error: 'Payment provider rejected the request' });
      }
    }
  );

  fastify.post(
    '/api/tenants/me/bookings/:id/mark-paid',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const booking = await prisma.booking.findFirst({
        where: { id, tenantId },
        include: { service: true },
      });
      if (!booking) return reply.status(404).send({ error: 'Booking not found' });

      // Cash / card-on-terminal settlement recorded by the salon.
      await prisma.payment.create({
        data: {
          tenantId,
          bookingId: booking.id,
          provider: 'manual',
          amount: booking.price ?? booking.service.price,
          currency: booking.currency || booking.service.currency || 'AED',
          status: 'paid',
          paidAt: new Date(),
        },
      });

      return { markedPaid: true };
    }
  );
}
