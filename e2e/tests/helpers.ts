/**
 * Shared e2e fixtures.
 *
 * Lives outside `*.spec.ts` because Playwright forbids a test file importing
 * another test file — the specs previously imported `auth.spec` and the runner
 * refused to load them.
 *
 * Seeding mirrors the real platform flow:
 *   1. A platform super-admin creates the tenant and its salon-admin user
 *      (`POST /api/tenants` and `POST /api/users` are super-admin only).
 *   2. The salon admin signs in and owns the tenant-scoped `/api/tenants/me/*`
 *      surface used by the dashboard.
 */

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** Bootstrap credentials, matching the API's documented development defaults. */
export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? 'admin@glambot.io';
export const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? 'admin123';

export interface SeededSalon {
  email: string;
  password: string;
  /** Bearer token for the salon admin (carries the tenant claim). */
  token: string;
  tenantId: string;
  tenantSlug: string;
  serviceId: string;
  staffId: string;
  clientId: string;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }

  return ((await res.json()) as { token: string }).token;
}

export function superAdminToken(): Promise<string> {
  return login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`Failed to create ${what}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Next `YYYY-MM-DD` at least `daysAhead` away that is a Monday–Friday, so the
 * seeded 09:00–18:00 shifts always cover the requested slot. Weekends are
 * deliberately excluded: the fixture staff do not work them, and `createBooking`
 * now enforces published shifts for the dashboard exactly as it does for the AI
 * agent.
 */
export function nextWorkdayIso(daysAhead = 14): string {
  const cursor = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);

  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return cursor.toISOString().slice(0, 10);
}

const WORKING_HOURS = JSON.stringify({
  Monday: [{ start: '09:00', end: '18:00' }],
  Tuesday: [{ start: '09:00', end: '18:00' }],
  Wednesday: [{ start: '09:00', end: '18:00' }],
  Thursday: [{ start: '09:00', end: '18:00' }],
  Friday: [{ start: '09:00', end: '18:00' }],
});

export async function seedSalon(suffix: string): Promise<SeededSalon> {
  const password = 'TestPassw0rd!';
  const email = `e2e-${suffix}@glambot.test`;
  const root = await superAdminToken();

  const tenant = await json<{ id: string; slug: string }>(
    await fetch(`${API_URL}/api/tenants`, {
      method: 'POST',
      headers: authHeaders(root),
      body: JSON.stringify({ name: `E2E Salon ${suffix}`, timezone: 'Asia/Dubai' }),
    }),
    'tenant'
  );

  await json(
    await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: authHeaders(root),
      body: JSON.stringify({
        email,
        password,
        name: 'E2E Owner',
        role: 'salon_admin',
        tenantId: tenant.id,
      }),
    }),
    'salon admin user'
  );

  const token = await login(email, password);

  const service = await json<{ id: string }>(
    await fetch(`${API_URL}/api/tenants/me/services`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        nameEn: 'Gel Manicure',
        nameAr: 'منيكيير جل',
        durationMinutes: 45,
        price: 120,
      }),
    }),
    'service'
  );

  const staff = await json<{ id: string }>(
    await fetch(`${API_URL}/api/tenants/me/staff`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Layla',
        workingHoursJson: WORKING_HOURS,
        skillsJson: JSON.stringify([service.id]),
      }),
    }),
    'staff'
  );

  const client = await json<{ id: string }>(
    await fetch(`${API_URL}/api/tenants/me/clients`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ phone: `+9715${Date.now().toString().slice(-8)}`, name: 'E2E Client' }),
    }),
    'client'
  );

  return {
    email,
    password,
    token,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    serviceId: service.id,
    staffId: staff.id,
    clientId: client.id,
  };
}

