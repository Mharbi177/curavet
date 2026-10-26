
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { processInboundMessage } from '../services/inbound';
import { logger } from '../lib/logger';

/**
 * POST /api/tenants/me/ai-chat
 *
 * Authenticated staff/admin endpoint so the dashboard can talk to the
 * clinic's own AI agent. The session is scoped to the signed-in user so
 * conversations don't bleed across logins.
 */
export default async function aiChatRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/tenants/me/ai-chat',
    {
      preHandler: [authenticate, requireTenant],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { body: { type: 'object', additionalProperties: true } },
    },
    async (request, reply) => {
      const parsed = z
        .object({
          message: z.string().min(1).max(2000),
          sessionId: z.string().min(4).max(120).optional(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenantId = request.tenantId!;
      // Use the authenticated user's id as the stable session so the AI keeps context
      const sessionId = parsed.data.sessionId ?? `staff-${request.user!.sub}`;

      const result = await processInboundMessage({
        tenantId,
        platform: 'web',
        from: sessionId,
        text: parsed.data.message,
      });

      if (!result) {
        logger.warn('AI chat failed in dashboard', { tenantId, sessionId });
        return reply.status(502).send({ error: 'The AI assistant is temporarily unavailable' });
      }

      return { reply: result.reply, conversationId: result.conversationId };
    }
  );

  /**
   * GET /api/tenants/me/ai-chat/today-context
   *
   * Returns a lightweight today-context summary the AI panel can show
   * before the user types anything (today's bookings count, next appt, etc.)
   */
  fastify.get(
    '/api/tenants/me/ai-chat/today-context',
    { preHandler: [authenticate, requireTenant] },
    async (request) => {
      const tenantId = request.tenantId!;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [bookingCount, emergencyCount, staffList] = await Promise.all([
        prisma.booking.count({
          where: {
            tenantId,
            scheduledAt: { gte: todayStart, lte: todayEnd },
            status: { in: ['pending', 'confirmed'] },
          },
        }),
        prisma.booking.count({
          where: {
            tenantId,
            scheduledAt: { gte: todayStart, lte: todayEnd },
            status: 'pending',
            notes: { contains: 'emergency' },
          },
        }),
        prisma.staff.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true },
          take: 10,
        }),
      ]);

      return { bookingCount, emergencyCount, staffCount: staffList.length, staff: staffList };
    }
  );
}
