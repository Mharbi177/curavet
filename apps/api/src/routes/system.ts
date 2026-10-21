import type { FastifyInstance } from 'fastify';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../plugins/auth';
import { metricsContentType, metricsText } from '../services/metrics';
import { refreshConversationGauge, realtimeSubscriberCount } from '../services/realtime';
import { isRedisHealthy } from '../services/queue';
import { availableModelCatalog } from '../ai/agentFactory';

const startedAt = new Date();

/** Health, Prometheus metrics and runtime diagnostics. */
export default async function systemRoutes(fastify: FastifyInstance) {
  /** Liveness/readiness probe used by Docker, Kubernetes and load balancers. */
  fastify.get('/health', async (_request, reply) => {
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

    if (!dbOk) {
      return reply.status(503).send({
        status: 'degraded',
        service: 'curavet-api',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      service: 'curavet-api',
      version: process.env.APP_VERSION ?? '1.0.0',
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    };
  });

  /** Prometheus scrape endpoint. Unauthenticated by convention (network-restricted). */
  fastify.get('/metrics', async (_request, reply) => {
    await refreshConversationGauge().catch(() => undefined);
    return reply.header('Content-Type', metricsContentType).send(await metricsText());
  });

  /** Detailed runtime status for the dashboards. */
  fastify.get(
    '/api/system/info',
    { preHandler: [authenticate, requireSuperAdmin] },
    async () => {
      const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

      return {
        service: env.OTEL_SERVICE_NAME,
        environment: env.NODE_ENV,
        version: process.env.APP_VERSION ?? '1.0.0',
        uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
        database: dbOk ? 'up' : 'down',
        queue: env.queueEnabled ? (isRedisHealthy() ? 'up' : 'degraded') : 'disabled',
        realtimeSubscribers: realtimeSubscriberCount(),
        integrations: {
          whatsapp: Boolean(env.WHATSAPP_TOKEN),
          instagram: Boolean(env.INSTAGRAM_TOKEN),
          stripe: Boolean(env.STRIPE_SECRET_KEY),
        },
        observability: {
          sentry: Boolean(env.SENTRY_DSN),
          tracing: env.otelEnabled,
          metrics: true,
        },
        models: availableModelCatalog(),
        timestamp: new Date().toISOString(),
      };
    }
  );
}
