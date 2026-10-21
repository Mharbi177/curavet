import { prisma } from '../lib/prisma';
import { SchedulingEngine } from './scheduler';
import { fromZonedTime } from 'date-fns-tz';

export type TimeOfDayPreference = 'morning' | 'afternoon' | 'evening' | 'any';

export interface WaitlistJoinParams {
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId?: string | null;
  preferredDate?: string | null; // YYYY-MM-DD in salon local time
  preferredTimeOfDay?: TimeOfDayPreference;
  notes?: string | null;
}

/**
 * Phase 5.6 — Waitlist system.
 * Registers a client when the requested slot is unavailable.
 */
export async function joinWaitlist(params: WaitlistJoinParams): Promise<{ id: string; status: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { waitlistEnabled: true },
  });

  if (!tenant?.waitlistEnabled) {
    throw new Error('Waitlist is not enabled for this salon.');
  }

  const service = await prisma.service.findFirst({
    where: { id: params.serviceId, tenantId: params.tenantId, isActive: true },
    select: { id: true },
  });
  if (!service) {
    throw new Error('Service not found for this tenant.');
  }

  // Avoid duplicate open entries for the same client + service.
  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      tenantId: params.tenantId,
      clientId: params.clientId,
      serviceId: params.serviceId,
      status: { in: ['waiting', 'offered'] },
    },
  });

  if (existing) {
    await prisma.waitlistEntry.update({
      where: { id: existing.id },
      data: {
        preferredDate: params.preferredDate ? new Date(params.preferredDate) : existing.preferredDate,
        preferredTimeOfDay: params.preferredTimeOfDay ?? existing.preferredTimeOfDay,
        notes: params.notes ?? existing.notes,
      },
    });
    return { id: existing.id, status: existing.status };
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      tenantId: params.tenantId,
      clientId: params.clientId,
      serviceId: params.serviceId,
      staffId: params.staffId ?? null,
      preferredDate: params.preferredDate ? new Date(params.preferredDate) : null,
      preferredTimeOfDay: params.preferredTimeOfDay ?? 'any',
      notes: params.notes ?? null,
      status: 'waiting',
    },
  });

  return { id: entry.id, status: entry.status };
}

function matchesTimeOfDay(date: Date, timezone: string, preference: string | null): boolean {
  if (!preference || preference === 'any') return true;

  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(date)
  );

  if (preference === 'morning') return hour < 12;
  if (preference === 'afternoon') return hour >= 12 && hour < 17;
  if (preference === 'evening') return hour >= 17;
  return true;
}

export interface WaitlistOffer {
  entryId: string;
  clientId: string;
  clientPhone: string | null;
  clientName: string | null;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  slot: Date;
  languageCode: string;
}

/**
 * Find waitlisted clients that can now be offered the freed slot and return the
 * offers to be sent. The entry is marked `offered` so a slot is never promised twice.
 */
export async function offerFreedSlot(params: {
  tenantId: string;
  freedBookingId: string;
}): Promise<WaitlistOffer[]> {
  const freed = await prisma.booking.findUnique({
    where: { id: params.freedBookingId },
    include: { tenant: true, service: true },
  });

  if (!freed) return [];

  const timezone = freed.tenant.timezone;
  const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(freed.scheduledAt);

  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      tenantId: params.tenantId,
      status: 'waiting',
      serviceId: freed.serviceId,
    },
    include: { client: true, service: true, staff: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  for (const entry of candidates) {
    if (entry.staffId && entry.staffId !== freed.staffId) continue;

    if (entry.preferredDate) {
      const preferredDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(entry.preferredDate);
      if (preferredDay !== dayStr) continue;
    }

    if (!matchesTimeOfDay(freed.scheduledAt, timezone, entry.preferredTimeOfDay)) continue;

    const staff = entry.staff || (await prisma.staff.findUnique({ where: { id: freed.staffId } }));
    if (!staff) continue;

    const offered = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: 'offered',
        notifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return [
      {
        entryId: offered.id,
        clientId: entry.clientId,
        clientPhone: entry.client.phone,
        clientName: entry.client.name,
        serviceId: entry.serviceId,
        serviceName: entry.service.nameEn,
        staffId: staff.id,
        staffName: staff.name,
        slot: freed.scheduledAt,
        languageCode: entry.client.languagePreference || 'en',
      },
    ];
  }

  return [];
}

/**
 * Expire stale offers so the slot becomes available to the next client.
 */
export async function expireStaleOffers(tenantId?: string): Promise<number> {
  const result = await prisma.waitlistEntry.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: 'offered',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  });
  return result.count;
}

/**
 * Whether any slot is free for a service on a date, used to decide between
 * booking and offering the waitlist.
 */
export async function hasAvailability(params: {
  tenantId: string;
  serviceId: string;
  date: string;
}): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: params.tenantId } });
  if (!tenant) return false;

  const service = await prisma.service.findFirst({
    where: { id: params.serviceId, tenantId: params.tenantId, isActive: true },
  });
  if (!service) return false;

  const staff = await prisma.staff.findMany({ where: { tenantId: params.tenantId, isActive: true } });
  if (staff.length === 0) return false;

  const dayStart = fromZonedTime(`${params.date} 00:00:00`, tenant.timezone);
  const dayEnd = fromZonedTime(`${params.date} 23:59:59`, tenant.timezone);

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId: params.tenantId,
      status: { in: ['pending', 'confirmed'] },
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    select: { staffId: true, scheduledAt: true, endsAt: true },
  });

  const slots = SchedulingEngine.getAvailableSlots(
    params.date,
    tenant.timezone,
    service,
    staff,
    bookings.map((b) => ({ staffId: b.staffId, scheduledAt: b.scheduledAt, endsAt: b.endsAt }))
  );

  return slots.length > 0;
}

