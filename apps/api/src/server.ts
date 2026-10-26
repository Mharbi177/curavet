import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';

import { env, assertProductionSafety } from './env';
import { prisma, disconnectPrisma } from './lib/prisma';
import { logger } from './lib/logger';
import { recordRoute } from './lib/routeRegistry';
import { captureError, initSentry } from './services/sentry';
import { initTelemetry, shutdownTelemetry } from './services/telemetry';
import { registerRealtimeRoutes } from './services/realtime';
import { registerRepeatableJobs, startWorkers, stopQueues } from './services/queue';
import { httpRequestDuration, httpRequestsTotal } from './services/metrics';
import registerRoutes from './routes';
import whatsappWebhookRoutes from './webhooks/whatsapp';
import instagramWebhookRoutes from './webhooks/instagram';
import stripeWebhookRoutes from './webhooks/stripe';

import fastifyRawBody from 'fastify-raw-body';
import fastifyHelmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrfProtection from '@fastify/csrf-protection';

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  // Webhook HMAC signatures (Meta, Stripe) must be computed over the EXACT raw
  // request bytes. Fastify's default JSON parser re-serializes the body, which
  // changes key order/whitespace and breaks signature verification. This plugin
  // stashes the original bytes on `request.rawBody` for routes that opt in via
  // `config: { rawBody: true }`.
  app.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    runFirst: true,
  });

  app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Too restrictive by default unless we configure it explicitly
  });

  app.register(fastifyCookie, {
    secret: env.JWT_SECRET,
    hook: 'onRequest',
  });

  app.register(fastifyCsrfProtection, {
    cookieOpts: { signed: true, httpOnly: true, sameSite: 'lax', secure: env.isProduction },
  });

app.register(cors, {
    origin: ['https://api.curavet.com', 'https://clinic.curavet.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

  app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Webhooks burst by design; probes and scrapers must never be throttled.
    allowList: (req) =>
      req.url.startsWith('/webhooks/') || req.url === '/metrics' || req.url === '/health',
  });

  app.register(websocket);

  // Keep a flat, machine-readable list of every route for tests and diagnostics.
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    const url = routeOptions.url ?? '';
    for (const method of methods) recordRoute(String(method), url);
  });

  if (env.docsEnabled) {
    app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'CuraVet Veterinary API',
          version: process.env.APP_VERSION ?? '1.0.0',
          description:
            'Multi-tenant WhatsApp / Instagram / web booking platform for beauty salons. Tenant routes require `Authorization: Bearer <token>`.',
        },
        servers: [{ url: env.PUBLIC_API_URL }],
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        },
        security: [{ bearerAuth: [] }],
        tags: [
          { name: 'auth', description: 'Authentication and user management' },
          { name: 'meta', description: 'Ingestion endpoints (webhooks, widget)' },
        ],
      },
    });

    app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list' } });
  }

  // Serve the embeddable widget when a build is present.
  const widgetDir = path.resolve(__dirname, '../../widget/dist');
  if (existsSync(widgetDir)) {
    app.register(fastifyStatic, { root: widgetDir, prefix: '/widget/', decorateReply: false });
  }

  // ── Observability ──────────────────────────────────────────────────────────
  app.addHook('onRequest', async (request) => {
    (request as unknown as { _startedAt?: bigint })._startedAt = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = (request as unknown as { _startedAt?: bigint })._startedAt;
    const route = request.routeOptions?.url ?? 'unmatched';
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };

    httpRequestsTotal.inc(labels);

    if (startedAt) {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      httpRequestDuration.observe(labels, seconds);
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) captureError(error, { url: request.url, method: request.method });

    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : error.message,
      ...(env.isProduction ? {} : { detail: error.message }),
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: `Route ${request.method} ${request.url} not found` });
  });

  return app;
}

export async function createApp(): Promise<FastifyInstance> {
  const app = buildServer();

  await app.register(registerRoutes);
  await app.register(registerRealtimeRoutes);
  await app.register(whatsappWebhookRoutes);
  await app.register(instagramWebhookRoutes);
  await app.register(stripeWebhookRoutes);

  return app;
}

export async function main(): Promise<void> {
  const warnings = assertProductionSafety();
  warnings.forEach((w) => logger.warn(w));

  initSentry();
  await initTelemetry();

  const app = await createApp();
  await app.listen({ port: env.port, host: env.HOST });

  logger.info(`CuraVet Veterinary API listening on ${env.HOST}:${env.port}`);
  if (env.docsEnabled) logger.info(`OpenAPI docs at ${env.PUBLIC_API_URL}/docs`);

  startWorkers();
  await registerRepeatableJobs();

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Received ${signal} — shutting down gracefully`);

    // Never hang a deploy: force-exit if in-flight work takes too long.
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 15_000);
    timer.unref();

    try {
      await stopQueues();
      await app.close();
      await disconnectPrisma();
      await shutdownTelemetry();
    } catch (error) {
      logger.error('Error during shutdown', (error as Error)?.message);
    } finally {
      clearTimeout(timer);
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', String(reason));
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error.message);
    void shutdown('uncaughtException');
  });
}

if (require.main === module) {
  void main();
}
