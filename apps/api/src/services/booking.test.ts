import { describe, expect, it } from 'vitest';
import { createBooking, isWithinWorkingHours } from './booking';

/**
 * `createBooking` performs input validation before touching the database, so
 * these guards are testable without a live Postgres instance. The conflict /
 * transaction paths are covered by the API smoke test against a real database.
 */
describe('createBooking — input validation', () => {
  const base = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    staffId: 'staff-1',
    serviceId: 'service-1',
    source: 'whatsapp',
  };

  it('rejects a malformed date before querying the database', async () => {
    const result = await createBooking({ ...base, date: '05-01-2099', time: '10:00' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_time');
  });

  it('rejects a time with minutes above 59', async () => {
    const result = await createBooking({ ...base, date: '2099-01-05', time: '10:75' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_time');
  });

  it('rejects an hour above 23', async () => {
    const result = await createBooking({ ...base, date: '2099-01-05', time: '25:00' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_time');
  });

  it('rejects an empty time', async () => {
    const result = await createBooking({ ...base, date: '2099-01-05', time: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_time');
  });
});

/**
 * Working-hours guard: the same rule the AI agent's `check_availability` tool
 * advertises must also hold for bookings created from the dashboard, otherwise
 * a salon can be double-promised a slot its staff never works.
 */
describe('isWithinWorkingHours', () => {
  const TZ = 'Asia/Dubai'; // UTC+4 year-round, so local time == UTC+4.
  // 2099-01-05 is a Monday.
  const monday = (time: string) => new Date(`2099-01-05T${time}:00.000+04:00`);
  const hours = JSON.stringify({ Monday: [{ start: '09:00', end: '18:00' }] });

  it('accepts an appointment inside a published shift', () => {
    const start = monday('10:00');
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    expect(isWithinWorkingHours(hours, TZ, start, end)).toBe(true);
  });

  it('accepts an appointment that ends exactly at shift close', () => {
    const start = monday('17:30');
    const end = monday('18:00');
    expect(isWithinWorkingHours(hours, TZ, start, end)).toBe(true);
  });

  it('rejects a start before the shift opens', () => {
    const start = monday('08:30');
    const end = monday('09:15');
    expect(isWithinWorkingHours(hours, TZ, start, end)).toBe(false);
  });

  it('rejects an appointment that runs past shift close', () => {
    const start = monday('17:45');
    const end = monday('18:30');
    expect(isWithinWorkingHours(hours, TZ, start, end)).toBe(false);
  });

  it('rejects a day the staff member does not work', () => {
    const tuesday = new Date('2099-01-06T10:00:00.000+04:00');
    const end = new Date(tuesday.getTime() + 45 * 60 * 1000);
    expect(isWithinWorkingHours(hours, TZ, tuesday, end)).toBe(false);
  });

  it('honours split shifts', () => {
    const split = JSON.stringify({
      Monday: [
        { start: '09:00', end: '13:00' },
        { start: '14:00', end: '18:00' },
      ],
    });
    const lunchStart = monday('13:15');
    const lunchEnd = monday('14:00');
    const afternoonStart = monday('15:00');
    const afternoonEnd = monday('15:45');

    expect(isWithinWorkingHours(split, TZ, lunchStart, lunchEnd)).toBe(false);
    expect(isWithinWorkingHours(split, TZ, afternoonStart, afternoonEnd)).toBe(true);
  });

  it('treats staff with no configured hours as always available (legacy rows)', () => {
    const start = monday('23:00');
    const end = monday('23:45');
    expect(isWithinWorkingHours('{}', TZ, start, end)).toBe(true);
    expect(isWithinWorkingHours(null, TZ, start, end)).toBe(true);
  });

  it('tolerates malformed working-hours JSON rather than blocking bookings', () => {
    const start = monday('10:00');
    const end = monday('10:45');
    expect(isWithinWorkingHours('{not-json', TZ, start, end)).toBe(true);
  });

  it('fails closed when a shift has an unparseable time', () => {
    const broken = JSON.stringify({ Monday: [{ start: '9am', end: '6pm' }] });
    const start = monday('10:00');
    const end = monday('10:45');
    expect(isWithinWorkingHours(broken, TZ, start, end)).toBe(false);
  });

  it('evaluates shifts in the salon timezone, not UTC', () => {
    // 18:30 UTC on Monday is 22:30 in Dubai — outside the 09:00–18:00 shift.
    const start = new Date('2099-01-05T18:30:00.000Z');
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    expect(isWithinWorkingHours(hours, TZ, start, end)).toBe(false);
  });
});
