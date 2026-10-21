/**
 * Runtime smoke test: boots the real Fastify app and asserts that auth guards,
 * tenant isolation, public routes and the full route table behave correctly.
 *
 * Run with: node --import tsx scripts/smoke.ts
 */
import { createApp } from '../src/server';
import { AuthService } from '../src/services/auth';
import { findRoute } from '../src/lib/routeRegistry';
import { env } from '../src/env';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const app = await createApp();
  await app.ready();

  // ── Health & metrics ─────────────────────────────────────────────────────
  const health = await app.inject({ method: 'GET', url: '/health' });
  check('GET /health responds', [200, 503].includes(health.statusCode), `status=${health.statusCode}`);

  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  check(
    'GET /metrics exposes Prometheus text',
    metrics.statusCode === 200 && metrics.body.includes('glambot_'),
    `status=${metrics.statusCode}`
  );

  // ── Auth guards ──────────────────────────────────────────────────────────
  const unauth = await app.inject({ method: 'GET', url: '/api/tenants' });
  check('Unauthenticated /api/tenants is rejected', unauth.statusCode === 401, `status=${unauth.statusCode}`);

  const badToken = await app.inject({
    method: 'GET',
    url: '/api/tenants',
    headers: { authorization: 'Bearer not-a-real-token' },
  });
  check('Invalid bearer token is rejected', badToken.statusCode === 401, `status=${badToken.statusCode}`);

  const superToken = AuthService.signToken(
    { sub: 'env-super-admin', email: env.SUPERADMIN_EMAIL, role: 'super_admin' },
    env.JWT_SECRET,
    600
  );

  const salonToken = AuthService.signToken(
    { sub: 'user-1', email: 'salon@demo.com', role: 'salon_admin', tenantId: 'tenant-DEMO' },
    env.JWT_SECRET,
    600
  );

  // ── Docs ─────────────────────────────────────────────────────────────────
  const docs = await app.inject({ method: 'GET', url: '/docs' });
  check('OpenAPI docs are served', docs.statusCode === 200, `status=${docs.statusCode}`);

  // ── Public routes must not require auth ──────────────────────────────────
  const resolveNoParam = await app.inject({ method: 'GET', url: '/api/public/resolve' });
  check(
    'Public resolve validates input without auth',
    resolveNoParam.statusCode === 400,
    `status=${resolveNoParam.statusCode}`
  );

  const widgetNoKey = await app.inject({ method: 'GET', url: '/api/public/widget/config' });
  check('Widget config requires a key', widgetNoKey.statusCode === 400, `status=${widgetNoKey.statusCode}`);

  const widgetBad = await app.inject({
    method: 'POST',
    url: '/api/public/widget/chat',
    payload: { key: 'short', sessionId: 'x', message: 'hi' },
  });
  check('Widget chat validates payload', widgetBad.statusCode === 400, `status=${widgetBad.statusCode}`);

  // ── Tenant isolation ─────────────────────────────────────────────────────
  const ownTenant = await app.inject({
    method: 'GET',
    url: '/api/tenants/me/settings',
    headers: { authorization: `Bearer ${salonToken}` },
  });
  // 404 here just means the demo tenant is not in this database; the guard passed.
  check(
    'Salon token passes the tenant guard',
    [200, 404].includes(ownTenant.statusCode) && ownTenant.statusCode !== 403,
    `status=${ownTenant.statusCode}`
  );

  const crossTenant = await app.inject({
    method: 'GET',
    url: '/api/tenants/tenant-SOMEONE-ELSE/settings',
    headers: { authorization: `Bearer ${salonToken}` },
  });
  check(
    'Salon token cannot read another tenant',
    [403, 404].includes(crossTenant.statusCode),
    `status=${crossTenant.statusCode}`
  );

  const salonAsSuper = await app.inject({
    method: 'GET',
    url: '/api/system/info',
    headers: { authorization: `Bearer ${salonToken}` },
  });
  check('System info rejects non super-admins', salonAsSuper.statusCode === 403, `status=${salonAsSuper.statusCode}`);

  const infoAsSuper = await app.inject({
    method: 'GET',
    url: '/api/system/info',
    headers: { authorization: `Bearer ${superToken}` },
  });
  check('System info allows super-admins', infoAsSuper.statusCode === 200, `status=${infoAsSuper.statusCode}`);

  // ── Webhooks reachable, signature enforced when configured ──────────────
  const webhook = await app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp',
    headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
    payload: { object: 'whatsapp_business_account', entry: [] },
  });
  check('WhatsApp webhook responds', [200, 401].includes(webhook.statusCode), `status=${webhook.statusCode}`);

  const igWebhook = await app.inject({
    method: 'POST',
    url: '/webhooks/instagram',
    headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
    payload: { object: 'instagram', entry: [] },
  });
  check('Instagram webhook responds', [200, 401].includes(igWebhook.statusCode), `status=${igWebhook.statusCode}`);

  // ── Route table sanity ───────────────────────────────────────────────────
  const required: Array<[string, string]> = [
    ['POST', '/api/auth/login'],
    ['GET', '/api/auth/me'],
    ['GET', '/api/tenants'],
    ['POST', '/api/tenants'],
    ['GET', '/api/tenants/:id/integrations'],
    ['POST', '/api/tenants/:id/integrations'],
    ['GET', '/api/tenants/me'],
    ['PATCH', '/api/tenants/me'],
    ['GET', '/api/tenants/me/settings'],
    ['GET', '/api/tenants/me/services'],
    ['POST', '/api/tenants/me/services'],
    ['GET', '/api/tenants/me/staff'],
    ['GET', '/api/tenants/me/clients'],
    ['GET', '/api/tenants/me/bookings'],
    ['POST', '/api/tenants/me/bookings'],
    ['PATCH', '/api/tenants/me/bookings/:id'],
    ['GET', '/api/tenants/me/conversations'],
    ['POST', '/api/tenants/me/conversations/:id/takeover'],
    ['POST', '/api/tenants/me/conversations/:id/messages'],
    ['GET', '/api/tenants/me/broadcasts'],
    ['POST', '/api/tenants/me/broadcasts'],
    ['POST', '/api/tenants/me/broadcasts/:id/send'],
    ['GET', '/api/tenants/me/waitlist'],
    ['POST', '/api/tenants/me/waitlist'],
    ['GET', '/api/tenants/me/upsell-rules'],
    ['POST', '/api/tenants/me/upsell-rules'],
    ['GET', '/api/tenants/me/reviews'],
    ['POST', '/api/tenants/me/bookings/:id/payment-link'],
    ['GET', '/api/tenants/me/payments'],
    ['GET', '/api/tenants/me/languages'],
    ['POST', '/api/public/widget/chat'],
    ['GET', '/api/public/widget/config'],
    ['GET', '/api/public/resolve'],
    ['GET', '/api/analytics'],
    ['GET', '/api/billing/overview'],
    ['GET', '/api/reviews'],
    ['GET', '/api/system/info'],
    ['GET', '/api/system/status'],
    ['GET', '/metrics'],
    ['GET', '/health'],
    ['GET', '/ws'],
    ['POST', '/webhooks/whatsapp'],
    ['GET', '/webhooks/whatsapp'],
    ['POST', '/webhooks/instagram'],
    ['GET', '/webhooks/instagram'],
    ['POST', '/webhooks/stripe'],
  ];

  for (const [method, url] of required) {
    check(`Route registered: ${method} ${url}`, findRoute(method, url));
  }

  await app.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
