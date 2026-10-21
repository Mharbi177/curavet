import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { enqueueBroadcast, resolveAudience } from '../services/queue';
import { publish } from '../services/realtime';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

const BroadcastSchema = z.object({
  name: z.string().min(1).max(120),
  message: z.string().min(1).max(1024),
  audience: z.enum(['all', 'inactive', 'vip', 'custom']),
  customClientIds: z.array(z.string()).optional().default([]),
  scheduledAt: z.string().datetime().nullish(),
});

export default async function broadcastRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/api/tenants/me/broadcasts', { preHandler: requireTenant }, async (request) => {
    return prisma.broadcast.findMany({
      where: { tenantId: tenantIdOf(request) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  fastify.post(
    '/api/tenants/me/broadcasts',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = BroadcastSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenantId = tenantIdOf(request);
      const data = parsed.data;

      if (data.audience === 'custom' && data.customClientIds.length === 0) {
        return reply.status(400).send({ error: 'customClientIds is required for the custom audience' });
      }

      // Pre-compute the audience so the salon sees the true reach before sending.
      const recipients = await resolveAudience(tenantId, data.audience, data.customClientIds);

      const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
      const isFuture = scheduledAt ? scheduledAt.getTime() > Date.now() + 60_000 : false;

      const broadcast = await prisma.broadcast.create({
        data: {
          tenantId,
          name: data.name,
          message: data.message,
          audience: data.audience,
          customClientIds: data.customClientIds,
          scheduledAt,
          status: isFuture ? 'scheduled' : 'draft',
          recipientCount: recipients.length,
          createdByUserId: request.user?.sub,
        },
      });

      if (!isFuture) {
        await enqueueBroadcast(broadcast.id, tenantId);
        await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: 'scheduled' } });
      }

      publish({ type: 'conversation', tenantId, payload: { broadcast } });
      return reply.status(201).send({ ...broadcast, audienceSize: recipients.length });
    }
  );

  /** Preview how many clients a given audience segment resolves to. */
  fastify.post(
    '/api/tenants/me/broadcasts/audience-size',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = z
        .object({
          audience: z.enum(['all', 'inactive', 'vip', 'custom']),
          customClientIds: z.array(z.string()).optional().default([]),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const recipients = await resolveAudience(
        tenantIdOf(request),
        parsed.data.audience,
        parsed.data.customClientIds
      );
      return { count: recipients.length };
    }
  );

  fastify.post(
    '/api/tenants/me/broadcasts/:id/send',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const broadcast = await prisma.broadcast.findFirst({ where: { id, tenantId } });
      if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' });
      if (broadcast.status === 'sent' || broadcast.status === 'sending') {
        return reply.status(409).send({ error: 'This broadcast has already been sent' });
      }

      const recipients = await resolveAudience(tenantId, broadcast.audience, broadcast.customClientIds);
      if (recipients.length === 0) {
        return reply.status(400).send({ error: 'No recipients match this audience' });
      }

      await prisma.broadcast.update({
        where: { id },
        data: { status: 'scheduled', scheduledAt: new Date(), recipientCount: recipients.length },
      });
      await enqueueBroadcast(id, tenantId);

      return reply.send({ id, status: 'scheduled', recipientCount: recipients.length });
    }
  );

  fastify.delete('/api/tenants/me/broadcasts/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const broadcast = await prisma.broadcast.findFirst({
      where: { id, tenantId: tenantIdOf(request) },
      select: { id: true, status: true },
    });
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' });
    if (broadcast.status === 'sending' || broadcast.status === 'sent') {
      return reply.status(409).send({ error: 'Sent broadcasts cannot be deleted' });
    }

    await prisma.broadcast.delete({ where: { id } });
    return reply.status(204).send();
  });
}
