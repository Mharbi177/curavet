import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, requireTenant } from '../plugins/auth';

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export default async function insightsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /** GET /api/tenants/me/dashboard — today's operational snapshot. */
  fastify.get('/api/tenants/me/dashboard', { preHandler: requireTenant }, async (request) => {
    const tenantId = tenantIdOf(request);
    const today = startOfToday();

    const [
      todayBookings,
      todayRevenue,
      newClients,
      pendingBookings,
      activeChats,
      recentBookings,
      recentClients,
    ] = await Promise.all([
      prisma.booking.count({
        where: { tenantId, scheduledAt: { gte: today }, status: { in: ['pending', 'confirmed'] } },
      }),
      prisma.booking.aggregate({
        where: { tenantId, scheduledAt: { gte: today }, status: { in: ['pending', 'confirmed'] } },
        _sum: { price: true },
      }),
      prisma.client.count({ where: { tenantId, firstContactAt: { gte: startOfMonth() } } }),
      prisma.booking.count({ where: { tenantId, status: 'pending' } }),
      prisma.conversation.count({ where: { tenantId, status: 'active' } }),
      prisma.booking.findMany({
        where: { tenantId },
        orderBy: { scheduledAt: 'asc' },
        take: 8,
        include: {
          service: true,
          staff: true,
          client: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.client.findMany({
        where: { tenantId },
        orderBy: { lastContactAt: 'desc' },
        take: 8,
        include: { _count: { select: { bookings: true } } },
      }),
    ]);

    return {
      todayBookings,
      todayRevenue: todayRevenue._sum.price ?? 0,
      newClientsThisMonth: newClients,
      pendingBookings,
      activeConversations: activeChats,
      recentBookings,
      recentClients: recentClients.map(({ _count, ...client }) => ({
        ...client,
        bookingCount: _count.bookings,
      })),
    };
  });

  /** GET /api/tenants/me/analytics — bookings series for the last 30 days. */
  fastify.get('/api/tenants/me/analytics', { preHandler: requireTenant }, async (request) => {
    const tenantId = tenantIdOf(request);
    const query = request.query as { startDate?: string; endDate?: string };

    const end = query.endDate ? new Date(query.endDate) : new Date();
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [bookings, clients, conversations, usage, reviews, topServices] = await Promise.all([
      prisma.booking.findMany({
        where: { tenantId, createdAt: { gte: start, lte: end } },
        select: { id: true, scheduledAt: true, status: true, price: true, source: true },
      }),
      prisma.client.count({ where: { tenantId, firstContactAt: { gte: start, lte: end } } }),
      prisma.conversation.count({ where: { tenantId, lastMessageAt: { gte: start, lte: end } } }),
      prisma.usageRecord.aggregate({
        where: { tenantId, createdAt: { gte: start } },
        _sum: { aiInteractionsCount: true, messagesSentCount: true, broadcastSentCount: true },
      }),
      prisma.review.aggregate({ where: { tenantId }, _avg: { rating: true }, _count: { rating: true } }),
      prisma.booking.groupBy({
        by: ['serviceId'],
        where: { tenantId, createdAt: { gte: start, lte: end } },
        _count: { id: true },
        _sum: { price: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    const buckets = new Map<string, { date: string; bookings: number; revenue: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, bookings: 0, revenue: 0 });
    }

    for (const booking of bookings) {
      const key = booking.scheduledAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.bookings += 1;
      bucket.revenue += booking.price ?? 0;
    }

    const completed = bookings.filter((b) => b.status === 'completed').length;
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
    const conversion = bookings.length === 0 ? 0 : Math.round((completed / bookings.length) * 100);

    const serviceNames = await prisma.service.findMany({
      where: { tenantId, id: { in: topServices.map((s) => s.serviceId) } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    const nameById = new Map(serviceNames.map((s) => [s.id, s]));

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      totals: {
        bookings: bookings.length,
        completed,
        cancelled,
        conversionRate: conversion,
        newClients: clients,
        conversations,
        aiInteractions: usage._sum.aiInteractionsCount ?? 0,
        messagesSent: usage._sum.messagesSentCount ?? 0,
        broadcastsSent: usage._sum.broadcastSentCount ?? 0,
        averageRating: reviews._avg.rating ? Number(reviews._avg.rating.toFixed(2)) : null,
        totalReviews: reviews._count.rating,
      },
      series: [...buckets.values()],
      topServices: topServices.map((s) => ({
        serviceId: s.serviceId,
        name: nameById.get(s.serviceId)?.nameEn ?? 'Unknown',
        nameAr: nameById.get(s.serviceId)?.nameAr ?? null,
        bookings: s._count.id,
        revenue: s._sum.price ?? 0,
      })),
    };
  });
}
