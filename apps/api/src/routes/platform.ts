import type { FastifyInstance } from 'fastify';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../plugins/auth';
import { ratingAggregate } from '../services/reviews';
import { isRedisHealthy } from '../services/queue';

const PLAN_PRICES: Record<string, number> = { starter: 299, pro: 499, enterprise: 999 };

/** Super-admin analytics, billing rollups and runtime diagnostics. */
export default async function platformRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireSuperAdmin);

  // ── Platform analytics ─────────────────────────────────────────────────────
  fastify.get('/api/analytics', async () => {
    const monthYear = `${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}`;

    const [totalTenants, totalBookings, totalConversations, activeTenants, totalClients, usage, byPlatform] =
      await Promise.all([
        prisma.tenant.count(),
        prisma.booking.count(),
        prisma.conversation.count(),
        prisma.tenant.count({ where: { isActive: true } }),
        prisma.client.count(),
        prisma.usageRecord.aggregate({
          _sum: { aiInteractionsCount: true, messagesSentCount: true, broadcastSentCount: true },
        }),
        prisma.conversation.groupBy({ by: ['platform'], _count: { id: true } }),
      ]);

    return {
      totalTenants,
      totalBookings,
      totalConversations,
      totalClients,
      activeTenants,
      monthYear,
      aiInteractions: usage._sum.aiInteractionsCount ?? 0,
      messagesSent: usage._sum.messagesSentCount ?? 0,
      broadcastsSent: usage._sum.broadcastSentCount ?? 0,
      conversationsByPlatform: Object.fromEntries(byPlatform.map((r) => [r.platform, r._count.id])),
    };
  });

  // ── Global reviews rollup (Phase 4.6) ─────────────────────────────────────
  fastify.get('/api/reviews', async () => {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    const rows = await Promise.all(
      tenants.map(async (t) => ({ ...t, ...(await ratingAggregate(t.id)) }))
    );

    const totalReviews = rows.reduce((sum, r) => sum + r.totalReviews, 0);
    const weighted = rows.reduce((sum, r) => sum + r.averageRating * r.totalReviews, 0);

    return {
      platformAverage: totalReviews === 0 ? 0 : Number((weighted / totalReviews).toFixed(2)),
      totalReviews,
      tenants: rows.sort((a, b) => b.totalReviews - a.totalReviews),
    };
  });

  // ── Billing overview ──────────────────────────────────────────────────────
  fastify.get('/api/billing/overview', async () => {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        plan: true,
        isActive: true,
        usageRecords: { select: { aiInteractionsCount: true, messagesSentCount: true } },
      },
    });

    let mrr = 0;
    const invoices = tenants.map((t, idx) => {
      const price = PLAN_PRICES[t.plan] ?? 299;
      if (t.isActive) mrr += price;

      const usage = t.usageRecords.reduce(
        (acc, u) => ({
          ai: acc.ai + u.aiInteractionsCount,
          messages: acc.messages + u.messagesSentCount,
        }),
        { ai: 0, messages: 0 }
      );

      return {
        id: `INV-${new Date().getFullYear()}-${String(idx + 1).padStart(4, '0')}`,
        tenantId: t.id,
        salon: t.name,
        plan: t.plan,
        status: t.isActive ? 'Paid' : 'Suspended',
        amountCents: price * 100,
        amount: `AED ${price}`,
        aiInteractions: usage.ai,
        messagesSent: usage.messages,
        date: new Date().toISOString().slice(0, 10),
      };
    });

    return { mrr: `AED ${mrr.toLocaleString('en-US')}`, mrrCents: mrr * 100, invoices };
  });

  // ── Runtime diagnostics ───────────────────────────────────────────────────
  fastify.get('/api/system/status', async () => {
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

    return {
      database: dbOk ? 'up' : 'down',
      queue: env.queueEnabled ? (isRedisHealthy() ? 'up' : 'degraded') : 'disabled',
      stripe: Boolean(env.STRIPE_SECRET_KEY),
      metaSignatureVerification: Boolean(env.META_APP_SECRET),
      sentry: Boolean(env.SENTRY_DSN),
      tracing: env.otelEnabled,
      timestamp: new Date().toISOString(),
    };
  });
}
