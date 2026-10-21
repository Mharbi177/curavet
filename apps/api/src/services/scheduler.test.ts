import { describe, expect, it } from 'vitest';
import { SchedulingEngine, type Booking, type Service, type StaffMember } from './scheduler';

/**
 * The scheduling engine is the highest-risk pure logic in the platform:
 * an off-by-one or a missing staff filter produces double bookings and lost
 * revenue. These tests lock in the guarantees the AI agent depends on.
 */
describe('SchedulingEngine.getAvailableSlots', () => {
  const service: Service = { id: 'svc-1', durationMinutes: 45, bufferMinutes: 15 };

  const hours = {
    Monday: [
      { start: '09:00', end: '13:00' },
      { start: '14:00', end: '18:00' },
    ],
  };

  const staffA: StaffMember = { id: 'staff-a', workingHoursJson: JSON.stringify(hours) };
  const staffB: StaffMember = { id: 'staff-b', workingHoursJson: JSON.stringify(hours) };

  // 2099-01-05 is a Monday; far enough ahead that "in the past" never interferes.
  const MONDAY = '2099-01-05';
  const TUESDAY = '2099-01-06';
  const now = new Date('2099-01-01T00:00:00Z');

  function slotIso(time: string): string {
    // Asia/Dubai is UTC+4 year-round.
    const [h, m] = time.split(':').map(Number);
    return new Date(Date.UTC(2099, 0, 5, h - 4, m)).toISOString();
  }

  it('does not let one staff member’s booking block another staff member', () => {
    const bookings: Booking[] = [
      {
        staffId: 'staff-a',
        scheduledAt: new Date(`${MONDAY}T10:00:00.000+04:00`),
        endsAt: new Date(`${MONDAY}T11:00:00.000+04:00`),
      },
    ];

    const slots = SchedulingEngine.getAvailableSlots(
      MONDAY,
      'Asia/Dubai',
      service,
      [staffA, staffB],
      bookings,
      now
    );

    const freeForB = slots.some(
      (s) => s.staffId === 'staff-b' && s.slot.toISOString() === slotIso('10:00')
    );
    const blockedForA = slots.some(
      (s) => s.staffId === 'staff-a' && s.slot.toISOString() === slotIso('10:00')
    );

    expect(freeForB).toBe(true);
    expect(blockedForA).toBe(false);
  });

  it('excludes slots for staff who are not trained on the service', () => {
    const qualified: StaffMember = {
      id: 'qualified',
      workingHoursJson: JSON.stringify(hours),
      skillsJson: JSON.stringify(['svc-1']),
    };
    const unqualified: StaffMember = {
      id: 'unqualified',
      workingHoursJson: JSON.stringify(hours),
      skillsJson: JSON.stringify(['svc-other']),
    };

    const slots = SchedulingEngine.getAvailableSlots(
      MONDAY,
      'Asia/Dubai',
      service,
      [qualified, unqualified],
      [],
      now
    );

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.staffId === 'qualified')).toBe(true);
  });

  it('treats an empty skills list as "qualified for everything"', () => {
    const generalist: StaffMember = {
      id: 'generalist',
      workingHoursJson: JSON.stringify(hours),
      skillsJson: JSON.stringify([]),
    };

    const slots = SchedulingEngine.getAvailableSlots(
      MONDAY,
      'Asia/Dubai',
      service,
      [generalist],
      [],
      now
    );

    expect(slots.length).toBeGreaterThan(0);
  });

  it('never returns a slot that starts before now', () => {
    const cutoff = new Date('2099-01-05T12:00:00Z'); // 16:00 Dubai
    const slots = SchedulingEngine.getAvailableSlots(
      MONDAY,
      'Asia/Dubai',
      service,
      [staffA],
      [],
      cutoff
    );

    expect(slots.every((s) => s.slot.getTime() >= cutoff.getTime())).toBe(true);
  });

  it('respects the service duration plus buffer when fitting inside a shift', () => {
    const longService: Service = { id: 'svc-long', durationMinutes: 300, bufferMinutes: 0 };
    const shortShift: StaffMember = {
      id: 'busy',
      workingHoursJson: JSON.stringify({ Monday: [{ start: '09:00', end: '13:00' }] }),
    };

    const slots = SchedulingEngine.getAvailableSlots(
      MONDAY,
      'Asia/Dubai',
      longService,
      [shortShift],
      [],
      now
    );

    // A 5h service cannot fit a 4h shift at all.
    expect(slots).toHaveLength(0);
  });

  it('tolerates malformed working-hours JSON without throwing', () => {
    const broken: StaffMember = { id: 'broken', workingHoursJson: '{not-json' };

    expect(() =>
      SchedulingEngine.getAvailableSlots(MONDAY, 'Asia/Dubai', service, [broken], [], now)
    ).not.toThrow();
  });

  it('returns no slots on a day the staff does not work', () => {
    // Working hours only define Monday.
    const slots = SchedulingEngine.getAvailableSlots(
      TUESDAY,
      'Asia/Dubai',
      service,
      [staffA],
      [],
      now
    );

    expect(slots).toHaveLength(0);
  });

  it('sorts results chronologically', () => {
    const slots = SchedulingEngine.getAvailableSlots(
      MONDAY,
      'Asia/Dubai',
      service,
      [staffA, staffB],
      [],
      now
    );

    const times = slots.map((s) => s.slot.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
