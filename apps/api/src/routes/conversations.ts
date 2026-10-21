import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { publish } from '../services/realtime';
import { sendToClient } from '../services/messaging';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

export default async function conversationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get(
    '/api/tenants/me/conversations',
    { preHandler: requireTenant },
    async (request) => {
      const tenantId = tenantIdOf(request);
      const q = request.query as { status?: string; limit?: string };

      return prisma.conversation.findMany({
        where: {
          tenantId,
          ...(q.status ? { status: q.status } : {}),
        },
        include: {
          client: {
            select: { id: true, name: true, phone: true, instagramId: true, webSessionId: true },
          },
          messages: { orderBy: { createdAt: 'asc' }, take: 100 },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: Math.min(200, Number.parseInt(q.limit ?? '50', 10) || 50),
      });
    }
  );

  fastify.get('/api/tenants/me/conversations/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = await prisma.conversation.findFirst({
      where: { id, tenantId: tenantIdOf(request) },
      include: {
        client: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    return conversation;
  });

  /** Pause the bot and hand the chat to a human agent. */
  fastify.post(
    '/api/tenants/me/conversations/:id/takeover',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const existing = await prisma.conversation.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Conversation not found' });

      const updated = await prisma.conversation.update({
        where: { id },
        data: { humanTakeover: true },
      });

      publish({ type: 'conversation', tenantId, payload: updated });
      return updated;
    }
  );

  /** Release the chat back to the AI agent. */
  fastify.post(
    '/api/tenants/me/conversations/:id/release',
    { preHandler: requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const existing = await prisma.conversation.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Conversation not found' });

      const updated = await prisma.conversation.update({
        where: { id },
        data: { humanTakeover: false },
      });

      publish({ type: 'conversation', tenantId, payload: updated });
      return updated;
    }
  );

  /** Send a human-agent reply over the client's connected channel. */
  fastify.post(
    '/api/tenants/me/conversations/:id/messages',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = tenantIdOf(request);

      const parsed = z.object({ content: z.string().min(1).max(4000) }).safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id, tenantId },
        include: { client: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

      const message = await prisma.conversationMessage.create({
        data: { conversationId: id, role: 'human_agent', content: parsed.data.content },
      });

      await prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), humanTakeover: true },
      });

      const destination = conversation.client.phone ?? conversation.client.instagramId;
      if (destination) {
        const delivery = await sendToClient({
          tenantId,
          to: destination,
          message: parsed.data.content,
          platform: conversation.platform === 'instagram' ? 'instagram' : 'whatsapp',
        });

        if (!delivery.ok) {
          return reply.status(502).send({ error: delivery.error ?? 'Delivery failed', message });
        }
      }

      publish({ type: 'message', tenantId, conversationId: id, payload: message });
      return reply.status(201).send(message);
    }
  );
}
