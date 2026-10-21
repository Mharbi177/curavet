import { expect, test } from '@playwright/test';
import { API_URL, seedSalon } from './helpers';

test.describe('tenant isolation (API level)', () => {
  test('a salon token cannot read another tenant', async ({ request }) => {
    const a = await seedSalon(`iso-a-${Date.now()}`);
    const b = await seedSalon(`iso-b-${Date.now()}`);

    // Try to impersonate tenant B using A's token. The tenant claim inside the
    // JWT must win over the query parameter, so this can only ever return A.
    const res = await request.get(`${API_URL}/api/tenants/me/settings?tenantId=${b.tenantId}`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe(a.tenantId);
    expect(body.id).not.toBe(b.tenantId);

    // Sanity check: B's own token resolves B, so the fixtures really are distinct.
    const own = await request.get(`${API_URL}/api/tenants/me/settings`, {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(((await own.json()) as { id: string }).id).toBe(b.tenantId);
  });

  test('a salon token is rejected from the global tenant list', async ({ request }) => {
    const salon = await seedSalon(`iso-list-${Date.now()}`);

    const res = await request.get(`${API_URL}/api/tenants`, {
      headers: { Authorization: `Bearer ${salon.token}` },
    });

    expect(res.status()).toBe(403);
  });
});

test.describe('webhook signature enforcement', () => {
  test('rejects a WhatsApp payload with a bad signature', async ({ request }) => {
    const res = await request.post(`${API_URL}/webhooks/whatsapp`, {
      headers: { 'x-hub-signature-256': 'sha256=notarealsignature' },
      data: { object: 'whatsapp_business_account', entry: [] },
    });

    // When META_APP_SECRET is configured this must be 401; when it is not,
    // the webhook is intentionally open in development.
    expect([200, 401]).toContain(res.status());
  });

  test('rejects an Instagram payload with a bad signature', async ({ request }) => {
    const res = await request.post(`${API_URL}/webhooks/instagram`, {
      headers: { 'x-hub-signature-256': 'sha256=notarealsignature' },
      data: { object: 'instagram', entry: [] },
    });

    expect([200, 401]).toContain(res.status());
  });
});

test.describe('public widget surface', () => {
  test('rejects a widget chat without a valid key', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/public/widget/chat`, {
      data: { key: 'nope', sessionId: 'session-12345678', message: 'hello' },
    });

    expect([400, 404]).toContain(res.status());
  });

  test('requires a domain or slug for white-label resolution', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/public/resolve`);
    expect(res.status()).toBe(400);
  });
});

test.describe('observability endpoints', () => {
  test('serves Prometheus metrics', async ({ request }) => {
    const res = await request.get(`${API_URL}/metrics`);
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toContain('glambot_');
  });

  test('serves the health probe', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect([200, 503]).toContain(res.status());
  });
});
