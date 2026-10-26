import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addMinutes } from 'date-fns';
import { prisma } from '../lib/prisma';
import { bookingDuration, bookingsTotal } from './metrics';

/** A single `HH:mm`–`HH:mm` window inside `Staff.workingHoursJson`. */
interface Shift {
  start?: unknown;
  end?: unknown;
}

/**
 * Parse `HH:mm` into minutes since local midnight. Returns null for anything
 * that is not a valid 24h time so malformed shifts fail closed.
 */
function toMinutes(value: unknown): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Decide whether a proposed appointment fits the staff member's published shift
 * for that weekday, evaluated in the salon's timezone.
 *
 * Deliberately tolerant of legacy data: a staff row with no working hours at all
 * (or unparseable JSON) is treated as always available, because those rows
 * predate shift configuration and the salon dashboard must keep working. Once a
 * week *is* configured, a missing day or a short shift rejects the booking, which
 * is the guarantee the AI agent and the calendar UI both advertise.
 */
export function isWithinWorkingHours(
  workingHoursJson: string | null | undefined,
  timezone: string,
  scheduledAt: Date,
  endsAt: Date
): boolean {
  let hours: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(workingHoursJson || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      hours = parsed as Record<string, unknown>;
    }
  } catch {
    return true; // legacy malformed JSON must never block bookings
  }

  const configuredDays = Object.values(hours).filter((value) => Array.isArray(value));
  if (configuredDays.length === 0) return true;

  const weekday = formatInTimeZone(scheduledAt, timezone, 'EEEE');
  const shifts = hours[weekday];
  if (!Array.isArray(shifts) || shifts.length === 0) return false;

  const startMinutes = toMinutes(formatInTimeZone(scheduledAt, timezone, 'HH:mm'));
  const endMinutes = toMinutes(formatInTimeZone(endsAt, timezone, 'HH:mm'));
  if (startMinutes === null || endMinutes === null) return false;

  return (shifts as Shift[]).some((shift) => {
    const shiftStart = toMinutes(shift?.start);
    const shiftEnd = toMinutes(shift?.end);
    if (shiftStart === null || shiftEnd === null) return false;
    return startMinutes >= shiftStart && endMinutes <= shiftEnd;
  });
}

export interface CreateBookingInput {
  tenantId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  /** Appointment start in the salon's local timezone, `YYYY-MM-DD`. */
  date: string;
  /** Appointment start in the salon's local timezone, `HH:mm` (24h). */
  time: string;
  source?: string;
  status?: 'pending' | 'confirmed';
  notes?: string | null;
  price?: number | null;
  /** Linked patient (Pet) for clinical bookings. */
  petId?: string | null;
}

export type FailureCode =
  | 'service_missing'
  | 'staff_missing'
  | 'tenant_missing'
  | 'invalid_time'
  | 'conflict'
  | 'inactive_staff'
  | 'outside_working_hours';

export type CreateBookingResult =
  | { ok: true; bookingId: string; reference: string; scheduledAt: Date; endsAt: Date }
  | { ok: false; code: FailureCode; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Create a booking with race-free conflict detection.
 *
 * The overlap check and the insert run inside a single Prisma transaction so two
 * simultaneous requests cannot both succeed for the same staff member. Used by
 * the AI agent and the salon dashboard so their rules can never diverge.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const stopTimer = bookingDuration.startTimer({ source: input.source });

  try {
    return await createBookingInner(input);
  } finally {
    stopTimer();
  }
}

async function createBookingInner(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const reject = (code: FailureCode, message: string): CreateBookingResult => {
    bookingsTotal.inc({ outcome: code, source: input.source });
    return { ok: false, code, message };
  };

  if (!DATE_RE.test(input.date) || !TIME_RE.test(input.time)) {
    return reject('invalid_time', 'Date must be YYYY-MM-DD and time must be HH:mm.');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, timezone: true, isActive: true },
  });
  if (!tenant || !tenant.isActive) {
    return reject('tenant_missing', 'Tenant not found or suspended.');
  }

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, tenantId: input.tenantId, isActive: true },
  });
  if (!service) {
    return reject('service_missing', 'Service not found or inactive.');
  }

  const staff = await prisma.staff.findFirst({
    where: { id: input.staffId, tenantId: input.tenantId },
  });
  if (!staff) {
    return reject('staff_missing', 'Staff member not found.');
  }
  if (!staff.isActive) {
    return reject('inactive_staff', 'Staff member is not currently active.');
  }

  // Validate the staff member is actually trained for this service.
  try {
    const skills: string[] = JSON.parse(staff.skillsJson || '[]');
    if (Array.isArray(skills) && skills.length > 0 && !skills.includes(service.id)) {
      return reject('staff_missing', `${staff.name} is not trained for this service.`);
    }
  } catch {
    // Tolerate legacy malformed skillsJson rather than blocking bookings.
  }

  const scheduledAt = fromZonedTime(`${input.date} ${input.time}:00`, tenant.timezone);
  const endsAt = addMinutes(scheduledAt, service.durationMinutes + service.bufferMinutes);

  if (Number.isNaN(scheduledAt.getTime())) {
    return reject('invalid_time', 'Could not interpret that local time.');
  }
  if (endsAt.getTime() <= Date.now()) {
    return reject('invalid_time', 'That time is already in the past.');
  }

  // A staff member's published shifts are the contract the AI agent advertises,
  // so the manual dashboard path must honour exactly the same rule.
  if (!isWithinWorkingHours(staff.workingHoursJson, tenant.timezone, scheduledAt, endsAt)) {
    return reject(
      'outside_working_hours',
      `${staff.name} is not scheduled to work that time.`
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          staffId: input.staffId,
          status: { in: ['pending', 'confirmed'] },
          AND: [{ scheduledAt: { lt: endsAt } }, { endsAt: { gt: scheduledAt } }],
        },
        select: { id: true },
      });

      if (conflict) return { conflict: true as const };

      const booking = await tx.booking.create({
        data: {
          tenantId: input.tenantId,
          clientId: input.clientId,
          staffId: input.staffId,
          serviceId: input.serviceId,
          scheduledAt,
          endsAt,
          status: input.status ?? 'confirmed',
          source: input.source ?? 'manual',
          notes: input.notes ?? null,
          price: input.price ?? service.price,
          currency: service.currency,
          petId: input.petId ?? null,
        },
      });

      return { conflict: false as const, booking };
    });

    if (result.conflict || !result.booking) {
      return reject('conflict', 'That time slot is no longer available.');
    }

    bookingsTotal.inc({ outcome: 'created', source: input.source });

    return {
      ok: true,
      bookingId: result.booking.id,
      reference: `BKG-${result.booking.id.slice(0, 8).toUpperCase()}`,
      scheduledAt,
      endsAt,
    };
  } catch (error) {
    // Unique constraint / serialization failures surface as generic conflicts
    // so the client is asked to pick another slot rather than seeing a stack trace.
    console.error('[booking] transaction failed', error);
    bookingsTotal.inc({ outcome: 'error', source: input.source });
    return { ok: false, code: 'conflict', message: 'That time slot is no longer available.' };
  }
}
