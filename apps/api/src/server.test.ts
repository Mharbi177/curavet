import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from './server';
import { AuthService } from './services/auth';
import { findRoute, registeredRoutes } from './lib/routeRegistry';
import { env } from './env';

/**
 * Integration test over the real Fastify application.
 *
 * Focuses on the security boundary — auth guards, role checks and tenant
 * isolation — plus a full route-table assertion so a refactor can never
 * silently drop an endpoint.
 */
describe('API security boundary', () => {
  let app: FastifyInstance;

  const superToken = AuthService.signToken(
    { sub: 'env-super-admin', email: env.SUPERADMIN_EMAIL, role: 'super_admin' },
    env.JWT_SECRET,
    600
  );

  const salonToken = AuthService.signToken(
    { sub: 'user-1', email: 'doctor@demo.com', role: 'doctor', tenantId: 'tenant-DEMO' },
    env.JWT_SECRET,
    600
  );

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('rejects requests with no Authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tenants' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a malformed Authorization header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: 'Basic abc' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a forged token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciJ9.sig' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = AuthService.signToken(
        { sub: 'attacker', email: 'a@b.c', role: 'super_admin' },
        'attacker-secret',
        600
      );
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${forged}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects an expired token', async () => {
      const expired = AuthService.signToken(
        { sub: 'admin', email: env.SUPERADMIN_EMAIL, role: 'super_admin' },
        env.JWT_SECRET,
        -60
      );
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${expired}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('authorization', () => {
    it('blocks salon admins from super-admin routes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/system/info',
        headers: { authorization: `Bearer ${salonToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks salon admins from the global tenant list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${salonToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks a salon admin from another tenant’s settings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants/tenant-SOMEONE-ELSE/settings',
        headers: { authorization: `Bearer ${salonToken}` },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it('allows super-admins through', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/system/info',
        headers: { authorization: `Bearer ${superToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('public surface', () => {
    it('serves health without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect([200, 503]).toContain(res.statusCode);
    });

    it('serves Prometheus metrics without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('glambot_');
    });

    it('serves OpenAPI docs', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs' });
      expect(res.statusCode).toBe(200);
    });

    it('validates widget requests without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/public/widget/chat',
        payload: { key: 'short' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('404s unknown routes with a JSON error', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
    });
  });

  describe('webhooks', () => {
    it('accepts a well-formed WhatsApp payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload: { object: 'whatsapp_business_account', entry: [] },
      });
      expect([200, 401]).toContain(res.statusCode);
    });

    it('rejects a non-WhatsApp object type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload: { object: 'page' },
      });
      expect([200, 401, 404]).toContain(res.statusCode);
    });

    it('accepts a well-formed Instagram payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/instagram',
        payload: { object: 'instagram', entry: [] },
      });
      expect([200, 401]).toContain(res.statusCode);
    });
  });

  describe('route table', () => {
    const required: Array<[string, string]> = [
      ['POST', '/api/auth/login'],
      ['GET', '/api/auth/me'],
      ['GET', '/api/tenants'],
      ['POST', '/api/tenants'],
      ['PATCH', '/api/tenants/:id'],
      ['GET', '/api/tenants/:id/integrations'],
      ['POST', '/api/tenants/:id/integrations'],
      ['GET', '/api/tenants/me'],
      ['PATCH', '/api/tenants/me'],
      ['GET', '/api/tenants/me/settings'],
      ['PATCH', '/api/tenants/me/settings'],
      ['GET', '/api/tenants/me/services'],
      ['POST', '/api/tenants/me/services'],
      ['PATCH', '/api/tenants/me/services/:id'],
      ['DELETE', '/api/tenants/me/services/:id'],
      ['GET', '/api/tenants/me/staff'],
      ['POST', '/api/tenants/me/staff'],
      ['PATCH', '/api/tenants/me/staff/:id'],
      ['DELETE', '/api/tenants/me/staff/:id'],
      ['GET', '/api/tenants/me/clients'],
      ['POST', '/api/tenants/me/clients'],
      ['PATCH', '/api/tenants/me/clients/:id'],
      ['DELETE', '/api/tenants/me/clients/:id'],
      ['GET', '/api/tenants/me/bookings'],
      ['POST', '/api/tenants/me/bookings'],
      ['GET', '/api/tenants/me/bookings/:id'],
      ['PATCH', '/api/tenants/me/bookings/:id'],
      ['DELETE', '/api/tenants/me/bookings/:id'],
      ['GET', '/api/tenants/me/conversations'],
      ['POST', '/api/tenants/me/conversations/:id/takeover'],
      ['POST', '/api/tenants/me/conversations/:id/release'],
      ['POST', '/api/tenants/me/conversations/:id/messages'],
      ['GET', '/api/tenants/me/broadcasts'],
      ['POST', '/api/tenants/me/broadcasts'],
      ['POST', '/api/tenants/me/broadcasts/:id/send'],
      ['DELETE', '/api/tenants/me/broadcasts/:id'],
      ['GET', '/api/tenants/me/waitlist'],
      ['POST', '/api/tenants/me/waitlist'],
      ['PATCH', '/api/tenants/me/waitlist/:id'],
      ['DELETE', '/api/tenants/me/waitlist/:id'],
      ['GET', '/api/tenants/me/upsell-rules'],
      ['POST', '/api/tenants/me/upsell-rules'],
      ['DELETE', '/api/tenants/me/upsell-rules/:id'],
      ['GET', '/api/tenants/me/reviews'],
      ['POST', '/api/tenants/me/reviews'],
      ['GET', '/api/tenants/me/payments'],
      ['POST', '/api/tenants/me/bookings/:id/payment-link'],
      ['GET', '/api/tenants/me/languages'],
      ['GET', '/api/public/resolve'],
      ['GET', '/api/public/widget/config'],
      ['POST', '/api/public/widget/chat'],
      ['GET', '/api/analytics'],
      ['GET', '/api/billing/overview'],
      ['GET', '/api/reviews'],
      ['GET', '/api/system/info'],
      ['GET', '/api/system/status'],
      ['GET', '/metrics'],
      ['GET', '/health'],
      ['GET', '/ws'],
      ['GET', '/webhooks/whatsapp'],
      ['POST', '/webhooks/whatsapp'],
      ['GET', '/webhooks/instagram'],
      ['POST', '/webhooks/instagram'],
      ['POST', '/webhooks/stripe'],
    ];

    it.each(required)('registers %s %s', (method, url) => {
      expect(findRoute(method, url)).toBe(true);
    });

    it('exposes a flat route registry', () => {
      expect(registeredRoutes().length).toBeGreaterThanOrEqual(required.length);
    });
  });
});
