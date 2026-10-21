import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { processInboundMessage } from '../services/inbound';
import { logger } from '../lib/logger';

const BRAND_SELECT = {
  id: true,
  name: true,
  slug: true,
  brandName: true,
  logoUrl: true,
  primaryColor: true,
  welcomeMessage: true,
  timezone: true,
  languageDefault: true,
  customDomain: true,
  webWidgetEnabled: true,
} as const;

/**
 * Public, unauthenticated surface.
 *
 * Everything here is reachable from a browser widget, so the rules are strict:
 * a tenant is only ever resolved by its public widget key or custom domain, and
 * no internal data (clients, bookings, credentials) is ever returned.
 */
export default async function publicRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/public/resolve?domain=bot.example.com
   * White-label resolution for a custom domain (Phase 5.1).
   */
  fastify.get<{ Querystring: { domain?: string; slug?: string } }>(
    '/api/public/resolve',
    async (request, reply) => {
      const { domain, slug } = request.query;

      if (!domain && !slug) {
        return reply.status(400).send({ error: 'Provide either domain or slug' });
      }

      const tenant = await prisma.tenant.findFirst({
        where: {
          isActive: true,
          ...(domain ? { customDomain: domain.toLowerCase() } : { slug }),
        },
        select: BRAND_SELECT,
      });

      if (!tenant) return reply.status(404).send({ error: 'Salon not found' });

      return {
        name: tenant.brandName || tenant.name,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor || '#ec4899',
        welcomeMessage: tenant.welcomeMessage,
        timezone: tenant.timezone,
        language: tenant.languageDefault,
      };
    }
  );

  /**
   * GET /api/public/widget/config?key=wgt_...
   * Bootstrap payload the embeddable widget uses to render itself (Phase 4.3).
   */
  fastify.get<{ Querystring: { key?: string } }>('/api/public/widget/config', async (request, reply) => {
    const key = request.query.key;
    if (!key) return reply.status(400).send({ error: 'key is required' });

    const tenant = await prisma.tenant.findFirst({
      where: { webWidgetKey: key, isActive: true, webWidgetEnabled: true },
      select: {
        ...BRAND_SELECT,
        services: {
          where: { isActive: true },
          select: { id: true, nameEn: true, nameAr: true, price: true, currency: true, durationMinutes: true },
          orderBy: { price: 'asc' },
        },
      },
    });

    if (!tenant) return reply.status(404).send({ error: 'Widget not found or disabled' });

    return {
      tenantId: tenant.id,
      name: tenant.brandName || tenant.name,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor || '#ec4899',
      welcomeMessage:
        tenant.welcomeMessage ??
        `Hi! I'm the ${tenant.brandName || tenant.name} assistant. How can I help you book today?`,
      language: tenant.languageDefault,
      services: tenant.services,
    };
  });

  /**
   * POST /api/public/widget/chat
   * Message intake for the embeddable widget. Scoped by widget key + session id.
   */
  fastify.post(
    '/api/public/widget/chat',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: { type: 'object', additionalProperties: true } },
    },
    async (request, reply) => {
      const parsed = z
        .object({
          key: z.string().min(8).max(120),
          sessionId: z.string().min(8).max(120),
          message: z.string().min(1).max(2000),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenant = await prisma.tenant.findFirst({
        where: { webWidgetKey: parsed.data.key, isActive: true, webWidgetEnabled: true },
        select: { id: true },
      });

      if (!tenant) return reply.status(404).send({ error: 'Widget not found or disabled' });

      const result = await processInboundMessage({
        tenantId: tenant.id,
        platform: 'web',
        from: parsed.data.sessionId,
        text: parsed.data.message,
      });

      if (!result) {
        logger.warn(`Widget chat failed for tenant ${tenant.id}`);
        return reply.status(502).send({ error: 'The assistant is temporarily unavailable' });
      }

      return { reply: result.reply, conversationId: result.conversationId };
    }
  );
}
