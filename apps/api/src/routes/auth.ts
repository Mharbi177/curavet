import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { authenticate } from '../plugins/auth';
import { AuthService, hashPassword, verifyPassword, type TokenPayload } from '../services/auth';

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional(),
  role: z.enum(['super_admin', 'salon_admin', 'staff']).default('salon_admin'),
  tenantId: z.string().optional(),
});

/**
 * Narrow the free-form `User.role` string from Prisma onto the token role union.
 * Unknown values are treated as least-privilege rather than trusted.
 */
function normaliseRole(role: string | null | undefined): TokenPayload['role'] {
  if (role === 'super_admin' || role === 'salon_admin' || role === 'staff') return role;
  return 'staff';
}

export const TENANT_PUBLIC_FIELDS = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  plan: true,
  isActive: true,
  languageDefault: true,
  brandName: true,
  logoUrl: true,
  primaryColor: true,
  customDomain: true,
  aiProvider: true,
  aiModel: true,
  supportedLanguages: true,
  remindersEnabled: true,
  reviewsEnabled: true,
  upsellEnabled: true,
  waitlistEnabled: true,
  webWidgetEnabled: true,
  createdAt: true,
} as const;

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/auth/login
   * Supports platform super-admins (env credentials or `super_admin` users) and
   * salon admins (User rows linked to a tenant).
   */
  fastify.post(
    '/api/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange credentials for a bearer token',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
            tenantSlug: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = z
        .object({
          email: z.string().email(),
          password: z.string().min(1),
          tenantSlug: z.string().optional(),
          tenantId: z.string().optional(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const { email, password, tenantSlug, tenantId } = parsed.data;
      const lowerEmail = email.trim().toLowerCase();

      const userWhere = {
        email: lowerEmail,
        isActive: true,
        ...(tenantSlug || tenantId
          ? {
              tenant: {
                ...(tenantSlug ? { slug: tenantSlug } : {}),
                ...(tenantId ? { id: tenantId } : {}),
              },
            }
          : {}),
      };

      const user = await prisma.user.findFirst({ where: userWhere, include: { tenant: true } });

      // Bootstrap super-admin from environment on first run.
      const isEnvSuperAdmin =
        !user &&
        lowerEmail === env.SUPERADMIN_EMAIL.toLowerCase() &&
        password === env.SUPERADMIN_PASSWORD;

      if (!user && !isEnvSuperAdmin) {
        // Spend comparable time on failure so "unknown email" and "bad password"
        // are indistinguishable to an attacker.
        verifyPassword(password, 'scrypt$16384$00$00');
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      if (user) {
        if (!verifyPassword(password, user.passwordHash)) {
          return reply.status(401).send({ error: 'Invalid email or password' });
        }
        if (user.tenant && !user.tenant.isActive) {
          return reply.status(403).send({ error: 'Tenant is suspended' });
        }
      }

      let resolvedTenant = user?.tenant ?? null;
      let resolvedTenantId = user?.tenantId ?? null;

      if (isEnvSuperAdmin && (tenantSlug || tenantId)) {
        resolvedTenant = await prisma.tenant.findFirst({
          where: {
            ...(tenantSlug ? { slug: tenantSlug } : {}),
            ...(tenantId ? { id: tenantId } : {}),
          },
        });
        resolvedTenantId = resolvedTenant?.id ?? null;
      }

      const effectiveUser = user ?? {
        id: 'env-super-admin',
        email: lowerEmail,
        role: 'super_admin' as const,
        tenantId: resolvedTenantId,
        name: 'Super Admin',
        tenant: resolvedTenant,
      };

      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      }

      const role = normaliseRole(effectiveUser.role);

      const token = AuthService.signToken(
        {
          sub: effectiveUser.id,
          email: effectiveUser.email,
          role,
          ...(effectiveUser.tenantId ? { tenantId: effectiveUser.tenantId } : {}),
        },
        env.JWT_SECRET,
        env.jwtTtlSeconds
      );

      reply.setCookie('access_token', token, {
        path: '/',
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: env.jwtTtlSeconds,
      });

      const csrfToken = await reply.generateCsrf();

      return reply.send({
        token,
        csrfToken,
        user: {
          id: effectiveUser.id,
          email: effectiveUser.email,
          role,
          tenantId: effectiveUser.tenantId,
          name: effectiveUser.name,
        },
        tenant: effectiveUser.tenant
          ? {
              id: effectiveUser.tenant.id,
              name: effectiveUser.tenant.name,
              slug: effectiveUser.tenant.slug,
              timezone: effectiveUser.tenant.timezone,
              plan: effectiveUser.tenant.plan,
              isActive: effectiveUser.tenant.isActive,
            }
          : null,
      });
    }
  );

  /** GET /api/csrf-token — issues a CSRF token for forms before login. */
  fastify.get('/api/csrf-token', async (request, reply) => {
    const token = await reply.generateCsrf();
    return reply.send({ csrfToken: token });
  });

  /** POST /api/auth/logout — clears the auth cookies. */
  fastify.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('_csrf', { path: '/' });
    return reply.send({ message: 'Logged out' });
  });

  /** GET /api/auth/me — current identity plus the linked tenant profile. */
  fastify.get('/api/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const payload = request.user;
    if (!payload) return reply.status(401).send({ error: 'Authentication required' });

    const user =
      payload.sub === 'env-super-admin'
        ? null
        : await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, name: true, role: true, tenantId: true, isActive: true },
          });

    if (user && !user.isActive) {
      return reply.status(403).send({ error: 'Account is disabled' });
    }

    const tenantId = payload.tenantId ?? user?.tenantId ?? undefined;
    const tenant = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_PUBLIC_FIELDS })
      : null;

    return reply.send({
      user: user ?? {
        id: payload.sub,
        email: payload.email,
        name: 'Super Admin',
        role: payload.role,
        tenantId: null,
        isActive: true,
      },
      tenant,
    });
  });

  /** POST /api/users — provision a salon admin (super-admin only). */
  fastify.post(
    '/api/users',
    {
      preHandler: authenticate,
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            name: { type: 'string' },
            role: { type: 'string' },
            tenantId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.user?.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Super admin privileges required' });
      }

      const parsed = CreateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const data = parsed.data;
      const email = data.email.trim().toLowerCase();

      if (data.role !== 'super_admin' && !data.tenantId) {
        return reply
          .status(400)
          .send({ error: 'tenantId is required for non super-admin roles' });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ error: 'A user with this email already exists' });
      }

      const created = await prisma.user.create({
        data: {
          email,
          passwordHash: hashPassword(data.password),
          name: data.name,
          role: data.role,
          tenantId: data.role === 'super_admin' ? null : data.tenantId,
        },
        select: { id: true, email: true, name: true, role: true, tenantId: true, createdAt: true },
      });

      return reply.status(201).send(created);
    }
  );
}
