import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { AuthService, type TokenPayload, type UserRole } from '../services/auth';
import { isJtiRevoked } from '../services/sessions';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
    tenantId?: string;
  }
}

/**
 * Verify the JWT from the `access_token` cookie or `Authorization: Bearer <jwt>` header.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies.access_token ?? AuthService.extractBearerToken(request.headers.authorization);

  if (!token) {
    return reply.status(401).send({ error: 'Missing or malformed access token' });
  }

  const payload = AuthService.verifyToken(token, env.JWT_SECRET);
  if (!payload) {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  // Refresh tokens are credentials for minting pairs at /api/auth/refresh —
  // they never authenticate API calls directly.
  if (payload.typ === 'refresh') {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  // Server-side revocation (logout, ban): reject revoked jtis.
  if (payload.jti && (await isJtiRevoked(payload.jti))) {
    return reply.status(401).send({ error: 'Session revoked' });
  }

  request.user = payload;
}

/**
 * Reject anything that is not a platform super-admin.
 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  if (request.user.role !== 'super_admin') {
    return reply.status(403).send({ error: 'Super admin privileges required' });
  }
}

/**
 * Reusable role guard factory for the 4-role RBAC model.
 * Usage: `{ preHandler: [authenticate, requireRoles('doctor', 'receptionist')] }`.
 * Token without a recognized role is treated as least-privilege (`client`).
 */
export function requireRoles(...allowed: UserRole[]) {
  const allowedSet = new Set<UserRole>(allowed);
  return async function requireRolesHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    // Legacy/unknown token roles are never honored as staff-level roles.
    const role = request.user.role as UserRole;
    const isKnown =
      role === 'super_admin' || role === 'doctor' || role === 'receptionist' || role === 'client';
    if (!isKnown || !allowedSet.has(role)) {
      return reply.status(403).send({ error: 'Insufficient role privileges' });
    }
  };
}

/**
 * Resolve the caller's tenant and reject salon-scoped requests that have none.
 *
 * Super-admins may impersonate a tenant by passing `?tenantId=` — useful for
 * support, but every response is still scoped to that single tenant.
 */
export async function requireTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const query = request.query as { tenantId?: string } | undefined;
  const candidate = request.user.tenantId || query?.tenantId;

  if (!candidate && request.user.role !== 'super_admin') {
    return reply.status(403).send({ error: 'Account is not linked to a tenant' });
  }

  if (candidate) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: candidate },
      select: { id: true, isActive: true },
    });

    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }
    if (!tenant.isActive) {
      return reply.status(403).send({ error: 'Tenant is suspended' });
    }

    request.tenantId = tenant.id;
    return;
  }

  // Super-admin without an explicit tenant id.
  request.tenantId = undefined;
}

/**
 * Guard for `/api/tenants/:id/*` routes: the path tenant must match the caller
 * unless the caller is a super-admin.
 */
export async function requireTenantAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const { id } = request.params as { id?: string };
  if (!id) {
    return reply.status(400).send({ error: 'Tenant id is required' });
  }

  if (request.user.role === 'super_admin') {
    request.tenantId = id;
    return;
  }

  if (request.user.tenantId !== id) {
    return reply.status(403).send({ error: 'Access denied for this tenant' });
  }

  request.tenantId = id;
}

/**
 * Register Fastify metadata for request.user / request.tenantId.
 */
export async function registerAuthDecorators(fastify: FastifyInstance): Promise<void> {
  // Nothing to register at runtime; declaration merging carries the types.
  void fastify;
}

export type { TokenPayload };
