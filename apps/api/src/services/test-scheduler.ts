import { SchedulingEngine, WorkingHours, Service, StaffMember, Booking } from './scheduler';

// 1. Mock inputs
const service: Service = {
  id: 'srv_1',
  durationMinutes: 45,
  bufferMinutes: 15, // Total 60 mins needed
};

const workingHours: WorkingHours = {
  Monday: [
    { start: '09:00', end: '13:00' }, // Morning shift
    { start: '14:00', end: '18:00' }  // Afternoon shift
  ]
};

const staff: StaffMember[] = [
  {
    id: 'staff_1',
    workingHoursJson: JSON.stringify(workingHours),
    skillsJson: JSON.stringify(['srv_1'])
  },
  {
    id: 'staff_2',
    workingHoursJson: JSON.stringify(workingHours),
    skillsJson: JSON.stringify(['srv_1'])
  }
];

// Existing bookings for staff_1 on that Monday
const todayDateStr = '2099-09-28'; // A future Monday
const existingBookings: Booking[] = [
  {
    staffId: 'staff_1',
    scheduledAt: new Date(`${todayDateStr}T10:00:00.000+04:00`),
    endsAt: new Date(`${todayDateStr}T11:00:00.000+04:00`),
  },
  {
    staffId: 'staff_1',
    scheduledAt: new Date(`${todayDateStr}T15:00:00.000+04:00`),
    endsAt: new Date(`${todayDateStr}T16:00:00.000+04:00`),
  }
];

console.log('--- GlamBot Scheduling Engine Test ---');
console.log('Service duration: 45m + 15m buffer');
console.log('Staff 1 & 2 Working hours: 09:00-13:00, 14:00-18:00');
console.log('Staff 1 booked: 10:00-11:00, 15:00-16:00 (Staff 2 is completely free)\n');

// 2. Run engine
const availableSlots = SchedulingEngine.getAvailableSlots(
  todayDateStr,
  'Asia/Dubai',
  service,
  staff,
  existingBookings,
  new Date('2099-01-01T00:00:00Z')
);

// 3. Print results
console.log('Available slots for ' + todayDateStr + ':');
availableSlots.forEach(slotInfo => {
  const localTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(slotInfo.slot);

  console.log(`- ${localTimeStr} (with staff: ${slotInfo.staffId})`);
});

