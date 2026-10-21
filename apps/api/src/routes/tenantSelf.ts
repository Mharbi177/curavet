import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';
import { TENANT_PUBLIC_FIELDS } from './auth';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

/** Validate that a string parses as JSON of the expected top-level type. */
function safeJsonParse(value: string, kind: 'object' | 'array'): boolean {
  try {
    const parsed = JSON.parse(value);
    if (kind === 'object') return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

const ServiceSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(1440),
  bufferMinutes: z.number().int().min(0).max(480).default(0),
  price: z.number().min(0),
  currency: z.string().length(3).default('AED'),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  category: z.string().optional(),
  isActive: z.boolean().default(true),
});

const StaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  workingHoursJson: z.string(),
  skillsJson: z.string(),
  isActive: z.boolean().default(true),
});

const ClientSchema = z.object({
  phone: z.string().min(3),
  name: z.string().optional(),
  languagePreference: z.string().default('en'),
  isVip: z.boolean().default(false),
  notes: z.string().optional(),
});

export default async function tenantSelfRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ─── Profile ───────────────────────────────────────────────────────────────
  fastify.get('/api/tenants/me', { preHandler: [authenticate, requireTenant] }, async (request, reply) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdOf(request) },
      select: TENANT_PUBLIC_FIELDS,
    });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    return tenant;
  });

  fastify.patch('/api/tenants/me', { preHandler: [authenticate, requireTenant] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(2).optional(),
      timezone: z.string().min(3).optional(),
      languageDefault: z.string().optional(),
      // White-label fields (Phase 5.1)
      brandName: z.string().max(80).nullable().optional(),
      logoUrl: z.string().url().nullable().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      welcomeMessage: z.string().max(500).nullable().optional(),
      customDomain: z
        .string()
        .regex(/^(?!https?:\/\/)[a-z0-9.-]+\.[a-z]{2,}$/i, 'Must be a bare hostname, e.g. bot.example.com')
        .nullable()
        .optional(),
      // AI selector (Phase 4.5)
      aiProvider: z.enum(['auto', 'openai', 'groq']).optional(),
      aiModel: z.string().max(80).nullable().optional(),
      aiTemperature: z.number().min(0).max(2).optional(),
      supportedLanguages: z.array(z.enum(['ar', 'en', 'fr', 'ur', 'tl'])).min(1).optional(),
      // Feature flags
      remindersEnabled: z.boolean().optional(),
      reviewsEnabled: z.boolean().optional(),
      upsellEnabled: z.boolean().optional(),
      waitlistEnabled: z.boolean().optional(),
      webWidgetEnabled: z.boolean().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
    }

    const tenantId = tenantIdOf(request);

    if (parsed.data.customDomain) {
      const clash = await prisma.tenant.findFirst({
        where: { customDomain: parsed.data.customDomain, NOT: { id: tenantId } },
        select: { id: true },
      });
      if (clash) return reply.status(409).send({ error: 'That custom domain is already in use' });
    }

    try {
      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: parsed.data,
        select: TENANT_PUBLIC_FIELDS,
      });
      return updated;
    } catch {
      return reply.status(500).send({ error: 'Failed to update tenant settings' });
    }
  });

  // ─── Settings alias used by the salon dashboard ────────────────────────────
  fastify.get('/api/tenants/me/settings', { preHandler: [authenticate, requireTenant] }, async (request) => {
    return prisma.tenant.findUnique({
      where: { id: tenantIdOf(request) },
      select: TENANT_PUBLIC_FIELDS,
    });
  });

  fastify.patch('/api/tenants/me/settings', { preHandler: [authenticate, requireTenant] }, async (request, reply) => {
    const schema = z.object({
      timezone: z.string().min(3).optional(),
      languageDefault: z.string().optional(),
      supportedLanguages: z.array(z.enum(['ar', 'en', 'fr', 'ur', 'tl'])).min(1).optional(),
      aiProvider: z.enum(['auto', 'openai', 'groq']).optional(),
      aiModel: z.string().max(80).nullable().optional(),
      remindersEnabled: z.boolean().optional(),
      reviewsEnabled: z.boolean().optional(),
      upsellEnabled: z.boolean().optional(),
      waitlistEnabled: z.boolean().optional(),
      notificationPreferences: z.record(z.string(), z.boolean()).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
    }

    const { notificationPreferences, ...rest } = parsed.data;
    void notificationPreferences; // persisted per tenant in a future notification store

    const updated = await prisma.tenant.update({
      where: { id: tenantIdOf(request) },
      data: rest,
      select: TENANT_PUBLIC_FIELDS,
    });
    return updated;
  });

  // ─── Services (Phase 3.3 — salon owns its service menu) ────────────────────
  fastify.get('/api/tenants/me/services', { preHandler: requireTenant }, async (request) => {
    return prisma.service.findMany({
      where: { tenantId: tenantIdOf(request) },
      orderBy: [{ isActive: 'desc' }, { nameEn: 'asc' }],
    });
  });

  fastify.post(
    '/api/tenants/me/services',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = ServiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const service = await prisma.service.create({
        data: { ...parsed.data, tenantId: tenantIdOf(request) },
      });
      return reply.status(201).send(service);
    }
  );

  fastify.patch(
    '/api/tenants/me/services/:id',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = ServiceSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const existing = await prisma.service.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Service not found' });

      return prisma.service.update({ where: { id }, data: parsed.data });
    }
  );

  fastify.delete('/api/tenants/me/services/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenantIdOf(request);

    const hasBookings = await prisma.booking.count({
      where: { serviceId: id, tenantId, status: { in: ['pending', 'confirmed'] } },
    });

    if (hasBookings > 0) {
      // Deactivate instead of hard-deleting so historical bookings stay intact.
      await prisma.service.update({ where: { id }, data: { isActive: false } });
      return reply.send({ deactivated: true, reason: 'Upcoming bookings exist for this service' });
    }

    await prisma.service.delete({ where: { id } }).catch(() => undefined);
    return reply.send({ deleted: true });
  });

  // ─── Staff ─────────────────────────────────────────────────────────────────
  fastify.get('/api/tenants/me/staff', { preHandler: requireTenant }, async (request) => {
    return prisma.staff.findMany({
      where: { tenantId: tenantIdOf(request) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  });

  fastify.post(
    '/api/tenants/me/staff',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const parsed = StaffSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      // Validate JSON blobs up-front; malformed hours crash the scheduler.
      if (!safeJsonParse(parsed.data.workingHoursJson, 'object')) {
        return reply.status(400).send({ error: 'workingHoursJson must be a valid JSON object' });
      }
      if (!safeJsonParse(parsed.data.skillsJson, 'array')) {
        return reply.status(400).send({ error: 'skillsJson must be a valid JSON array' });
      }

      const staff = await prisma.staff.create({
        data: { ...parsed.data, tenantId: tenantIdOf(request) },
      });
      return reply.status(201).send(staff);
    }
  );

  fastify.patch(
    '/api/tenants/me/staff/:id',
    { preHandler: requireTenant, schema: { body: { type: 'object', additionalProperties: true } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = StaffSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const existing = await prisma.staff.findFirst({
        where: { id, tenantId: tenantIdOf(request) },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Staff member not found' });

      if (parsed.data.workingHoursJson && !safeJsonParse(parsed.data.workingHoursJson, 'object')) {
        return reply.status(400).send({ error: 'workingHoursJson must be a valid JSON object' });
      }
      if (parsed.data.skillsJson && !safeJsonParse(parsed.data.skillsJson, 'array')) {
        return reply.status(400).send({ error: 'skillsJson must be a valid JSON array' });
      }

      return prisma.staff.update({ where: { id }, data: parsed.data });
    }
  );

  fastify.delete('/api/tenants/me/staff/:id', { preHandler: requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const upcoming = await prisma.booking.count({
      where: { staffId: id, tenantId: tenantIdOf(request), status: { in: ['pending', 'confirmed'] } },
    });

    if (upcoming > 0) {
      await prisma.staff.update({ where: { id }, data: { isActive: false } });
      return reply.send({ deactivated: true, reason: 'Upcoming bookings exist for this staff member' });
    }

    await prisma.staff.delete({ where: { id } }).catch(() => undefined);
    return reply.send({ deleted: true });
  });
}
