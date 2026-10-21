/**
 * Phase 6.1 — SaaS Subscription Billing Routes
 *
 * Exposes:
 *  POST /api/billing/checkout   — redirect a tenant admin to Stripe Checkout
 *  POST /api/billing/portal     — open the Stripe Customer Portal
 *  GET  /api/billing/status     — current subscription status for a tenant
 *
 * All routes require an authenticated salon_admin or super_admin token.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireSuperAdmin, requireTenantAccess } from '../plugins/auth';
import { isStripeEnabled, createSubscriptionCheckout, createBillingPortalSession } from '../services/payments';
import { prisma } from '../lib/prisma';
import { env } from '../env';

const PLAN_PRICES_AED: Record<string, number> = {
  starter: 299,
  pro: 499,
  enterprise: 999,
};

export default async function billingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /api/billing/checkout
   * Generates a Stripe Checkout URL for a tenant subscribing to a plan.
   * Body: { tenantId, plan }
   * Returns: { checkoutUrl }
   */
  fastify.post(
    '/api/billing/checkout',
    {
      schema: {
        tags: ['billing'],
        summary: 'Create a Stripe Checkout session for a SaaS subscription',
        body: {
          type: 'object',
          required: ['tenantId', 'plan'],
          properties: {
            tenantId: { type: 'string' },
            plan: { type: 'string', enum: ['starter', 'pro', 'enterprise'] },
          },
        },
      },
    },
    async (request, reply) => {
      // Only super-admins can create subscriptions on behalf of tenants.
      if (request.user?.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Super admin privileges required' });
      }

      if (!isStripeEnabled()) {
        return reply.status(503).send({ error: 'Stripe is not configured on this server.' });
      }

      const parsed = z
        .object({
          tenantId: z.string().min(1),
          plan: z.enum(['starter', 'pro', 'enterprise']),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      const { tenantId, plan } = parsed.data;

      // Fetch the primary admin email to pre-fill Stripe's email field.
      const adminUser = await prisma.user.findFirst({
        where: { tenantId, isActive: true },
        select: { email: true },
        orderBy: { createdAt: 'asc' },
      });

      try {
        const result = await createSubscriptionCheckout({
          tenantId,
          plan,
          adminEmail: adminUser?.email,
          successUrl: `${env.PUBLIC_API_URL}/billing/success?plan=${plan}`,
          cancelUrl: `${env.PUBLIC_API_URL}/billing/cancelled`,
        });

        return reply.send(result);
      } catch (error) {
        const err = error as Error & { statusCode?: number };
        return reply.status(err.statusCode ?? 500).send({ error: err.message });
      }
    }
  );

  /**
   * POST /api/billing/portal
   * Returns a Stripe Customer Portal URL for a tenant to manage their subscription.
   * The tenant must have previously gone through /api/billing/checkout.
   */
  fastify.post(
    '/api/billing/portal',
    {
      schema: {
        tags: ['billing'],
        summary: 'Open the Stripe Customer Portal for a tenant',
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string' },
            returnUrl: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.user?.role !== 'super_admin') {
        return reply.status(403).send({ error: 'Super admin privileges required' });
      }

      if (!isStripeEnabled()) {
        return reply.status(503).send({ error: 'Stripe is not configured on this server.' });
      }

      const parsed = z
        .object({
          tenantId: z.string().min(1),
          returnUrl: z.string().url().optional(),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Invalid payload', details: parsed.error.flatten().fieldErrors });
      }

      try {
        const result = await createBillingPortalSession({
          tenantId: parsed.data.tenantId,
          returnUrl: parsed.data.returnUrl ?? env.PUBLIC_API_URL,
        });
        return reply.send(result);
      } catch (error) {
        const err = error as Error & { statusCode?: number };
        return reply.status(err.statusCode ?? 500).send({ error: err.message });
      }
    }
  );

  /**
   * GET /api/billing/status/:tenantId
   * Returns the current plan, Stripe customer ID presence and billing amounts.
   * Accessible by super_admin or the tenant's own admin.
   */
  fastify.get(
    '/api/billing/status/:tenantId',
    {
      preHandler: [authenticate, requireTenantAccess],
      schema: {
        tags: ['billing'],
        summary: 'Get billing status for a tenant',
      },
    },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          plan: true,
          isActive: true,
          paddleCustomerId: true,
          createdAt: true,
        },
      });

      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

      return reply.send({
        tenantId: tenant.id,
        plan: tenant.plan,
        isActive: tenant.isActive,
        hasStripeCustomer: Boolean(tenant.paddleCustomerId),
        stripeEnabled: isStripeEnabled(),
        pricing: PLAN_PRICES_AED,
        currentPlanPrice: PLAN_PRICES_AED[tenant.plan] ?? 0,
      });
    }
  );
}
