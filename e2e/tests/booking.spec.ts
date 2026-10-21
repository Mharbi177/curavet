import { expect, test } from '@playwright/test';
import { API_URL, nextWorkdayIso, seedSalon } from './helpers';

test.describe('booking rules', () => {
  test('rejects an overlapping booking for the same staff member', async ({ request }) => {
    const salon = await seedSalon(`book-${Date.now()}`);
    const headers = { Authorization: `Bearer ${salon.token}`, 'Content-Type': 'application/json' };
    const date = nextWorkdayIso();

    const first = await request.post(`${API_URL}/api/tenants/me/bookings`, {
      headers,
      data: {
        clientId: salon.clientId,
        staffId: salon.staffId,
        serviceId: salon.serviceId,
        date,
        time: '10:00',
      },
    });
    expect(first.ok()).toBeTruthy();

    // A 30-minute overlap on a 45-minute service must be refused.
    const overlap = await request.post(`${API_URL}/api/tenants/me/bookings`, {
      headers,
      data: {
        clientId: salon.clientId,
        staffId: salon.staffId,
        serviceId: salon.serviceId,
        date,
        time: '10:30',
      },
    });

    expect([409, 422, 400]).toContain(overlap.status());
  });

  test('rejects a booking for a staff member outside working hours', async ({ request }) => {
    const salon = await seedSalon(`hours-${Date.now()}`);
    const headers = { Authorization: `Bearer ${salon.token}`, 'Content-Type': 'application/json' };
    const date = nextWorkdayIso();

    const late = await request.post(`${API_URL}/api/tenants/me/bookings`, {
      headers,
      data: {
        clientId: salon.clientId,
        staffId: salon.staffId,
        serviceId: salon.serviceId,
        date,
        time: '23:00',
      },
    });

    // 422 from the shared working-hours guard inside `createBooking`.
    expect([400, 409, 422]).toContain(late.status());
  });

  test('accepts a booking inside the published shift', async ({ request }) => {
    const salon = await seedSalon(`shift-${Date.now()}`);
    const headers = { Authorization: `Bearer ${salon.token}`, 'Content-Type': 'application/json' };
    const date = nextWorkdayIso();

    const res = await request.post(`${API_URL}/api/tenants/me/bookings`, {
      headers,
      data: {
        clientId: salon.clientId,
        staffId: salon.staffId,
        serviceId: salon.serviceId,
        date,
        time: '09:30',
      },
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as { reference: string };
    expect(body.reference).toMatch(/^BKG-/);
  });
});

