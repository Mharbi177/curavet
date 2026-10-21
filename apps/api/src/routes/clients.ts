import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

const ClientSchema = z.object({
  phone: z.string().min(3),
  name: z.string().max(120).optional(),
  languagePreference: z.string().default('en'),
  isVip: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});

export default async function clientAndInsightsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ─── Clients ───────────────────────────────────────────────────────────────
  fastify.get(
    '/api/tenants/me/clients',
    { preHandler: requireTenant },
    async (request) => {
      const query = request.query as {
        search?: string;
        page?: string;
        limit?: string;
        vip?: string;
      };

      const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
      const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit ?? '25', 10) || 25));
      const search = query.search?.trim();

      const where = {
        tenantId: tenantIdOf(request),
        ...(query.vip === 'true' ? { isVip: true } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
                { instagramId: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [total, items] = await Promise.all([
        prisma.client.count({ where }),
        prisma.client.findMany({
          where,
          orderBy: { lastContactAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          // Lifetime value + visit count drive the salon CRM view.
          include: {
            _count: { select: { bookings: true } },
            bookings: {
              where: { status: { not: 'cancelled' } },
              select: { price: true },
            },
          },
        }),
      ]);

      const clients = items.map(({ bookings, _count, ...client }) => ({
        ...client,
        bookingCount: _count.bookings,
        totalSpent: bookings.reduce((sum, b) => sum + (b.price ?? 0), 0),
      }));

      return { clients, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
  );

  fastify.post(
    '/api/tenants/me/clients',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = ClientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenantId = tenantIdOf(request);
      const phone = parsed.data.phone.trim();

      const existing = await prisma.client.findFirst({ where: { tenantId, phone } });
      if (existing) {
        return reply.status(409).send({ error: 'A client with this phone number already exists', id: existing.id });
      }

      const client = await prisma.client.create({
        data: { ...parsed.data, phone, tenantId },
      });
      return reply.status(201).send(client);
    }
  );

  fastify.get(
    '/api/tenants/me/clients/:id',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const client = await prisma.client.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        include: {
          bookings: {
            include: { service: true, staff: true },
            orderBy: { scheduledAt: 'desc' },
            take: 50,
          },
          reviews: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!client) return reply.status(404).send({ error: 'Client not found' });
      return client;
    }
  );

  fastify.patch(
    '/api/tenants/me/clients/:id',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = ClientSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const existing = await prisma.client.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Client not found' });

      // Changing a phone number must not collide with another client in the
      // same salon, otherwise conversations get merged into the wrong person.
      if (parsed.data.phone) {
        const phone = parsed.data.phone.trim();
        const clash = await prisma.client.findFirst({
          where: { tenantId: tenantIdOf(request), phone, NOT: { id } },
          select: { id: true },
        });
        if (clash) {
          return reply.status(409).send({
            error: 'Another client in this salon already uses that phone number',
          });
        }
        parsed.data.phone = phone;
      }

      return prisma.client.update({ where: { id }, data: parsed.data });
    }
  );

  fastify.delete(
    '/api/tenants/me/clients/:id',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const hasBookings = await prisma.booking.count({
        where: { clientId: id, tenantId, status: { in: ['pending', 'confirmed'] } },
      });
      if (hasBookings > 0) {
        return reply
          .status(409)
          .send({ error: 'Client has upcoming bookings. Cancel them first.' });
      }

      const existing = await prisma.client.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Client not found' });

      await prisma.client.delete({ where: { id } }).catch(() => undefined);
      return reply.status(204).send();
    }
  );
}
