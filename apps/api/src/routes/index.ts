import type { FastifyInstance } from 'fastify';

import authRoutes from './auth';
import tenantAdminRoutes from './tenants';
import integrationRoutes from './integrations';
import platformRoutes from './platform';
import systemRoutes from './system';
import publicRoutes from './public';
import tenantSelfRoutes from './tenantSelf';
import clientAndInsightsRoutes from './clients';
import insightsRoutes from './insights';
import bookingRoutes from './bookings';
import conversationRoutes from './conversations';
import broadcastRoutes from './broadcasts';
import waitlistRoutes from './waitlist';
import upsellRoutes from './upsell';
import reviewRoutes from './reviews';
import paymentRoutes from './payments';
import billingRoutes from './billing';
import aiChatRoutes from './aiChat';

/**
 * Registers every HTTP route module.
 *
 * Order matters only in that the public/system routes are registered first so
 * health and metrics stay reachable even if a later module throws during boot.
 */
export default async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(systemRoutes);
  await fastify.register(publicRoutes);

  // Platform + super-admin
  await fastify.register(authRoutes);
  await fastify.register(tenantAdminRoutes);
  await fastify.register(integrationRoutes);
  await fastify.register(platformRoutes);

  // Salon-scoped (`/api/tenants/me/*`)
  await fastify.register(tenantSelfRoutes);
  await fastify.register(clientAndInsightsRoutes);
  await fastify.register(insightsRoutes);
  await fastify.register(bookingRoutes);
  await fastify.register(conversationRoutes);
  await fastify.register(broadcastRoutes);
  await fastify.register(waitlistRoutes);
  await fastify.register(upsellRoutes);
  await fastify.register(reviewRoutes);
  await fastify.register(paymentRoutes);
  await fastify.register(billingRoutes);
  await fastify.register(aiChatRoutes);
}
