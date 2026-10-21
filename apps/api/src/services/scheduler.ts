import { addMinutes, isBefore, isAfter, areIntervalsOverlapping } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface WorkingHours {
  [dayOfWeek: string]: { start: string; end: string }[]; 
}

export interface Booking {
  staffId: string;
  scheduledAt: Date;
  endsAt: Date;
}

export interface StaffMember {
  id: string;
  workingHoursJson: string;
  skillsJson?: string;
}

export interface Service {
  id: string;
  durationMinutes: number;
  bufferMinutes: number;
}

export class SchedulingEngine {
  /**
   * Calculates available appointment slots for a given service on a specified date in the salon's timezone.
   * - Filters existing bookings PER STAFF MEMBER (fixes critical bug where one staff member's booking blocked other staff).
   * - Filters staff members by service skill compatibility when skillsJson is present.
   * - Verifies shifts and slot intervals in local salon time before converting to UTC.
   */
  static getAvailableSlots(
    targetDateStr: string, // YYYY-MM-DD
    timezone: string, // e.g., 'Asia/Dubai'
    service: Service,
    staffMembers: StaffMember[],
    existingBookings: Booking[],
    now: Date = new Date()
  ): Array<{ slot: Date; staffId: string }> {
    const availableSlots: Array<{ slot: Date; staffId: string }> = [];
    const totalDuration = service.durationMinutes + service.bufferMinutes;
    const slotIntervalMinutes = 30; 

    // Find the day of the week in the salon's local timezone
    const targetDateLocalObj = fromZonedTime(`${targetDateStr} 12:00:00`, timezone);
    const dayOfWeek = formatInTimeZone(targetDateLocalObj, timezone, 'EEEE'); 

    for (const staff of staffMembers) {
      // 1. Verify staff skill qualification if skills are defined
      if (staff.skillsJson) {
        try {
          const qualifiedServices: string[] = JSON.parse(staff.skillsJson);
          if (Array.isArray(qualifiedServices) && qualifiedServices.length > 0 && !qualifiedServices.includes(service.id)) {
            continue; // Staff is not qualified to perform this service
          }
        } catch {
          // If JSON parse fails, continue with assignment
        }
      }

      let workingHours: WorkingHours = {};
      try {
        workingHours = JSON.parse(staff.workingHoursJson || '{}');
      } catch {
        workingHours = {};
      }

      const todayShifts = workingHours[dayOfWeek] || [];
      if (todayShifts.length === 0) continue;

      // Filter existing bookings specifically for THIS staff member
      const thisStaffBookings = existingBookings
        .filter(b => b.staffId === staff.id)
        .map(b => ({
          start: new Date(b.scheduledAt),
          end: new Date(b.endsAt)
        }));

      for (const shift of todayShifts) {
        let currentSlotTime = fromZonedTime(`${targetDateStr} ${shift.start}:00`, timezone);
        const shiftEndTime = fromZonedTime(`${targetDateStr} ${shift.end}:00`, timezone);

        while (isBefore(currentSlotTime, shiftEndTime)) {
          const proposedEndTime = addMinutes(currentSlotTime, totalDuration);

          if (isAfter(proposedEndTime, shiftEndTime)) {
            currentSlotTime = addMinutes(currentSlotTime, slotIntervalMinutes);
            continue;
          }

          const hasOverlap = thisStaffBookings.some(booking => 
            areIntervalsOverlapping(
              { start: currentSlotTime, end: proposedEndTime },
              { start: booking.start, end: booking.end }
            )
          );

          // Check if slot is in the past
          const isPast = isBefore(currentSlotTime, now);

          if (!hasOverlap && !isPast) {
            availableSlots.push({
              slot: currentSlotTime,
              staffId: staff.id
            });
          }

          currentSlotTime = addMinutes(currentSlotTime, slotIntervalMinutes);
        }
      }
    }

    // Sort chronologically ascending
    availableSlots.sort((a, b) => a.slot.getTime() - b.slot.getTime());

    return availableSlots;
  }
}

