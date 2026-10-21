import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin, requireTenantAccess } from '../plugins/auth';
import { CryptoService } from '../services/crypto';

function tenantIdParam(request: { params?: unknown }): string {
  return (request.params as { id: string }).id;
}

const IntegrationSchema = z.object({
  provider: z.string().min(1).max(40),
  platform: z.enum(['whatsapp', 'instagram', 'web']),
  externalAccountId: z.string().max(120).nullish(),
  credentials: z.string().min(10).max(2000).nullish(),
  status: z.enum(['active', 'pending', 'revoked']).default('pending'),
});

const INTEGRATION_SELECT = {
  id: true,
  tenantId: true,
  provider: true,
  platform: true,
  externalAccountId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Super-admin platform surface: messaging integrations. */
export default async function integrationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireSuperAdmin);

  fastify.get(
    '/api/tenants/:id/integrations',
    { preHandler: [authenticate, requireTenantAccess] },
    async (request) => {
      return prisma.tenantIntegration.findMany({
        where: { tenantId: tenantIdParam(request) },
        select: INTEGRATION_SELECT,
        orderBy: { createdAt: 'desc' },
      });
    }
  );

  fastify.post(
    '/api/tenants/:id/integrations',
    {
      preHandler: [authenticate, requireTenantAccess],
      schema: { body: { type: 'object', required: ['provider', 'platform'], additionalProperties: true } },
    },
    async (request, reply) => {
      const parsed = IntegrationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const tenantId = tenantIdParam(request);
      const data = parsed.data;

      // Credentials are encrypted at rest and never returned to any client.
      const encryptedCredentials = data.credentials
        ? CryptoService.encrypt(data.credentials, env.CREDENTIALS_ENCRYPTION_KEY)
        : null;

      try {
        const integration = await prisma.tenantIntegration.create({
          data: {
            tenantId,
            provider: data.provider,
            platform: data.platform,
            externalAccountId: data.externalAccountId ?? null,
            encryptedCredentials,
            status: data.status,
          },
          select: INTEGRATION_SELECT,
        });
        return reply.status(201).send(integration);
      } catch (error) {
        const message = (error as { message?: string }).message ?? '';
        if (message.includes('Unique constraint')) {
          return reply
            .status(409)
            .send({ error: 'An integration with that platform and account already exists' });
        }
        return reply.status(500).send({ error: 'Failed to create integration' });
      }
    }
  );

  fastify.delete(
    '/api/tenants/:id/integrations/:integrationId',
    { preHandler: [authenticate, requireTenantAccess] },
    async (request, reply) => {
      const { integrationId } = request.params as { integrationId: string };
      const deleted = await prisma.tenantIntegration
        .delete({ where: { id: integrationId, tenantId: tenantIdParam(request) } })
        .catch(() => null);

      if (!deleted) return reply.status(404).send({ error: 'Integration not found' });
      return reply.status(204).send();
    }
  );
}
