import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, requireTenantAccess } from '../plugins/auth';

function tenantIdParam(request: { params?: unknown }): string {
  return (request.params as { id: string }).id;
}

const CreateTenantSchema = z.object({
  name: z.string().min(2).max(120),
  timezone: z.string().min(3).default('Asia/Dubai'),
  plan: z.string().default('starter'),
  languageDefault: z.string().default('en'),
  supportedLanguages: z.array(z.enum(['ar', 'en', 'fr', 'ur', 'tl'])).min(1).optional(),
});

/** Platform super-admin surface: tenant lifecycle. */
export default async function tenantAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireSuperAdmin);

  fastify.get('/api/tenants', async () => {
    const tenants = await prisma.tenant.findMany({
      include: {
        services: { select: { id: true } },
        staff: { select: { id: true } },
        bookings: { select: { price: true, status: true } },
        _count: { select: { conversations: true, clients: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tenants.map((t) => {
      const billable = t.bookings.filter((b) => b.status !== 'cancelled');
      const revenue = billable.reduce((sum, b) => sum + (b.price ?? 0), 0);

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isActive: t.isActive,
        timezone: t.timezone,
        status: t.isActive ? 'Active' : 'Inactive',
        convos: t._count.conversations.toString(),
        clients: t._count.clients,
        revenue: `AED ${revenue.toFixed(2)}`,
        servicesCount: t.services.length,
        staffCount: t.staff.length,
        aiModel: t.aiModel,
        createdAt: t.createdAt,
      };
    });
  });

  fastify.get('/api/tenants/:id', { preHandler: [authenticate, requireTenantAccess] }, async (request, reply) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdParam(request) },
      include: {
        services: { orderBy: { nameEn: 'asc' } },
        staff: { orderBy: { name: 'asc' } },
        integrations: {
          select: {
            id: true,
            tenantId: true,
            provider: true,
            platform: true,
            externalAccountId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: { select: { clients: true, bookings: true, conversations: true } },
      },
    });

    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    return tenant;
  });

  fastify.post(
    '/api/tenants',
    { schema: { body: { type: 'object', required: ['name'], additionalProperties: true } } },
    async (request, reply) => {
      const parsed = CreateTenantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const name = parsed.data.name.trim();
      const baseSlug =
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'salon';

      // Guarantee slug uniqueness even for duplicate salon names.
      let slug = baseSlug;
      for (let attempt = 1; attempt < 50; attempt += 1) {
        const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
        if (!clash) break;
        slug = `${baseSlug}-${attempt + 1}`;
      }

      const tenant = await prisma.tenant.create({
        data: {
          name,
          slug,
          timezone: parsed.data.timezone,
          plan: parsed.data.plan,
          languageDefault: parsed.data.languageDefault,
          ...(parsed.data.supportedLanguages ? { supportedLanguages: parsed.data.supportedLanguages } : {}),
          webWidgetKey: `wgt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
        },
      });

      return reply.status(201).send(tenant);
    }
  );

  fastify.patch(
    '/api/tenants/:id',
    {
      preHandler: [authenticate, requireTenantAccess],
      schema: { body: { type: 'object', additionalProperties: true } },
    },
    async (request, reply) => {
      const parsed = z
        .object({
          name: z.string().min(2).max(120).optional(),
          timezone: z.string().min(3).optional(),
          plan: z.string().optional(),
          isActive: z.boolean().optional(),
          languageDefault: z.string().optional(),
          supportedLanguages: z.array(z.enum(['ar', 'en', 'fr', 'ur', 'tl'])).min(1).optional(),
          aiProvider: z.enum(['auto', 'openai', 'groq']).optional(),
          aiModel: z.string().max(80).nullish(),
          aiTemperature: z.number().min(0).max(2).optional(),
          brandName: z.string().max(80).nullish(),
          logoUrl: z.string().url().nullish(),
          primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
          welcomeMessage: z.string().max(500).nullish(),
          customDomain: z
            .string()
            .regex(/^(?!https?:\/\/)[a-z0-9.-]+\.[a-z]{2,}$/i)
            .nullish(),
          webWidgetEnabled: z.boolean().optional(),
          remindersEnabled: z.boolean().optional(),
          reviewsEnabled: z.boolean().optional(),
          upsellEnabled: z.boolean().optional(),
          waitlistEnabled: z.boolean().optional(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const id = tenantIdParam(request);

      if (parsed.data.customDomain) {
        const clash = await prisma.tenant.findFirst({
          where: { customDomain: parsed.data.customDomain, NOT: { id } },
          select: { id: true },
        });
        if (clash) return reply.status(409).send({ error: 'That custom domain is already in use' });
      }

      const tenant = await prisma.tenant.update({ where: { id }, data: parsed.data });
      return tenant;
    }
  );

  fastify.delete(
    '/api/tenants/:id',
    { preHandler: [authenticate, requireTenantAccess] },
    async (request, reply) => {
      // Suspend rather than hard-delete so customer history is never destroyed.
      const tenant = await prisma.tenant.update({
        where: { id: tenantIdParam(request) },
        data: { isActive: false },
      });
      return reply.send({ suspended: true, tenant });
    }
  );
}
