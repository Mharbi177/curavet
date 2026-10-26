import { PrismaClient } from '@curavet/db';
import { hashPassword } from 'D:/curavet/apps/api/src/services/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Seeding CuraVet Platform with All Roles & Data...');

  // 1. Upsert Demo Clinic Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'curavet-demo' },
    update: {
      name: 'CuraVet Animal Hospital & Surgical Center',
      brandName: 'CuraVet Veterinary Hospital',
      plan: 'enterprise',
      timezone: 'America/New_York',
      languageDefault: 'en',
      primaryColor: '#059669',
      welcomeMessage: 'Welcome to CuraVet Animal Hospital! I am your 24/7 Veterinary Assistant. How can we care for your companion today?',
      webWidgetKey: 'wgt_curavet_demo',
      webWidgetEnabled: true,
      aiProvider: 'groq',
      aiModel: 'llama-3.1-8b-instant',
      aiTemperature: 0.2,
      remindersEnabled: true,
      reviewsEnabled: true,
      waitlistEnabled: true,
      upsellEnabled: true,
      emergencyPhone: '+1-800-CURA-VET',
      clinicType: 'companion_animal',
      isActive: true,
    },
    create: {
      name: 'CuraVet Animal Hospital & Surgical Center',
      slug: 'curavet-demo',
      brandName: 'CuraVet Veterinary Hospital',
      plan: 'enterprise',
      timezone: 'America/New_York',
      languageDefault: 'en',
      primaryColor: '#059669',
      welcomeMessage: 'Welcome to CuraVet Animal Hospital! I am your 24/7 Veterinary Assistant. How can we care for your companion today?',
      webWidgetKey: 'wgt_curavet_demo',
      webWidgetEnabled: true,
      aiProvider: 'groq',
      aiModel: 'llama-3.1-8b-instant',
      aiTemperature: 0.2,
      remindersEnabled: true,
      reviewsEnabled: true,
      waitlistEnabled: true,
      upsellEnabled: true,
      emergencyPhone: '+1-800-CURA-VET',
      clinicType: 'companion_animal',
      isActive: true,
    },
  });
  console.log('[SEED] Tenant ready:', tenant.id);

  // 2. Users with All Distinct Roles
  const superAdminHash = hashPassword('SuperAdmin123!');
  const clinicAdminHash = hashPassword('ClinicAdmin123!');
  const staffHash = hashPassword('VetStaff123!');

  const usersToSeed = [
    {
      email: 'superadmin@curavet.io',
      name: 'Antigravity Super Admin',
      passwordHash: superAdminHash,
      role: 'super_admin' as const,
      tenantId: null,
    },
    {
      email: 'maziz.jlassi@curavet.io',
      name: 'Mohamed Aziz Jlassi',
      passwordHash: superAdminHash,
      role: 'super_admin' as const,
      tenantId: null,
    },
    {
      email: 'admin@curavet.io',
      name: 'Dr. Sarah Mitchell, Clinic Owner & Director',
      passwordHash: clinicAdminHash,
      role: 'doctor' as const,
      tenantId: tenant.id,
    },
    {
      email: 'owner@curavet.io',
      name: 'Dr. Sarah Mitchell, Clinic Owner',
      passwordHash: clinicAdminHash,
      role: 'doctor' as const,
      tenantId: tenant.id,
    },
    {
      email: 'dr.marcus@curavet.io',
      name: 'Dr. Marcus Vance, DVM',
      passwordHash: staffHash,
      role: 'receptionist' as const,
      tenantId: tenant.id,
    },
    {
      email: 'chloe.tanaka@curavet.io',
      name: 'Chloe Tanaka, RVT',
      passwordHash: staffHash,
      role: 'receptionist' as const,
      tenantId: tenant.id,
    },
  ];

  for (const u of usersToSeed) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash: u.passwordHash,
        role: u.role,
        tenantId: u.tenantId,
        isActive: true,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: u.passwordHash,
        role: u.role,
        tenantId: u.tenantId,
        isActive: true,
      },
    });
    console.log('[SEED] User configured:', u.email, `[${u.role}]`);
  }

  // 3. Medical Staff Records
  const staffMembers = [
    { name: 'Dr. Sarah Mitchell, DVM' },
    { name: 'Dr. Marcus Vance, DVM' },
    { name: 'Chloe Tanaka, RVT' },
  ];

  const dbStaff: Record<string, string> = {};
  for (const sm of staffMembers) {
    let s = await prisma.staff.findFirst({
      where: { tenantId: tenant.id, name: sm.name },
    });
    if (!s) {
      s = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          name: sm.name,
          skillsJson: JSON.stringify([]),
          isActive: true,
          workingHoursJson: JSON.stringify({
            Monday: [{ start: '08:00', end: '18:00' }],
            Tuesday: [{ start: '08:00', end: '18:00' }],
            Wednesday: [{ start: '08:00', end: '18:00' }],
            Thursday: [{ start: '08:00', end: '18:00' }],
            Friday: [{ start: '08:00', end: '18:00' }],
            Saturday: [{ start: '09:00', end: '15:00' }],
          }),
        },
      });
    }
    dbStaff[sm.name] = s.id;
  }

  // 4. Clinical Services Catalog
  const catalog = [
    { nameEn: 'Comprehensive Physical & Wellness Exam', nameAr: 'Full Wellness Exam', durationMinutes: 30, price: 75.0, category: 'Wellness' },
    { nameEn: 'Canine Core Vaccines (Rabies + DHPP)', nameAr: 'Canine Vaccines', durationMinutes: 20, price: 65.0, category: 'Vaccinations' },
    { nameEn: 'Feline Core Vaccines (Rabies + FVRCP)', nameAr: 'Feline Vaccines', durationMinutes: 20, price: 60.0, category: 'Vaccinations' },
    { nameEn: 'Dental Ultrasonic Scaling & Polishing', nameAr: 'Dental Cleaning', durationMinutes: 60, price: 240.0, category: 'Dental' },
    { nameEn: 'Microchipping & Lifetime Registration', nameAr: 'Microchip ID', durationMinutes: 15, price: 45.0, category: 'Identification' },
    { nameEn: 'Spay / Neuter Pre-Surgical Consultation', nameAr: 'Spay Neuter Consult', durationMinutes: 30, price: 85.0, category: 'Surgery' },
    { nameEn: 'Senior Pet Geriatric Bloodwork Panel', nameAr: 'Senior Panel', durationMinutes: 45, price: 165.0, category: 'Diagnostics' },
    { nameEn: 'Therapeutic Medicated Bath & Groom', nameAr: 'Medicated Bath', durationMinutes: 45, price: 55.0, category: 'Spa & Grooming' },
  ];

  const dbServices: Record<string, string> = {};
  for (const item of catalog) {
    let svc = await prisma.service.findFirst({
      where: { tenantId: tenant.id, nameEn: item.nameEn },
    });
    if (!svc) {
      svc = await prisma.service.create({
        data: {
          tenantId: tenant.id,
          nameEn: item.nameEn,
          nameAr: item.nameAr,
          durationMinutes: item.durationMinutes,
          price: item.price,
          category: item.category,
          isActive: true,
        },
      });
    }
    dbServices[item.nameEn] = svc.id;
  }

  // 5. Clients and Pets
  const clientData = [
    { name: 'Sarah Connor', phone: '+1-555-019-2834', petName: 'Buddy', species: 'Dog', breed: 'Golden Retriever', weight: 32.5, gender: 'Neutered Male', notes: 'Allergic to grass pollen' },
    { name: 'David Miller', phone: '+1-555-024-9182', petName: 'Luna', species: 'Cat', breed: 'Siamese', weight: 4.2, gender: 'Spayed Female', notes: 'Needs gentle handling for blood draw' },
    { name: 'Elena Rostova', phone: '+1-555-038-1729', petName: 'Max', species: 'Dog', breed: 'German Shepherd', weight: 38.0, gender: 'Intact Male', notes: 'Routine wellness checkup' },
    { name: 'James Wilson', phone: '+1-555-042-8371', petName: 'Bella', species: 'Dog', breed: 'French Bulldog', weight: 11.2, gender: 'Spayed Female', notes: 'Pre-surgery clearance' },
  ];

  const dbClients: Record<string, { clientId: string; petId: string }> = {};
  for (const c of clientData) {
    let client = await prisma.client.findFirst({
      where: { tenantId: tenant.id, phone: c.phone },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: c.name,
          phone: c.phone,
          notes: 'Owner of ' + c.petName,
        },
      });
    }

    let pet = await prisma.pet.findFirst({
      where: { tenantId: tenant.id, name: c.petName, ownerId: client.id },
    });
    if (!pet) {
      pet = await prisma.pet.create({
        data: {
          tenantId: tenant.id,
          ownerId: client.id,
          name: c.petName,
          species: c.species,
          breed: c.breed,
          weightKg: c.weight,
          gender: c.gender,
          medicalNotes: c.notes,
        },
      });
    }
    dbClients[c.name] = { clientId: client.id, petId: pet.id };
  }

  // 6. Schedule Appointments for Today & Tomorrow
  const now = new Date();
  const todayAt = (h: number, m: number) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const tomorrowAt = (h: number, m: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const bookingsToSeed = [
    {
      staff: 'Dr. Marcus Vance, DVM',
      service: 'Dental Ultrasonic Scaling & Polishing',
      client: 'Sarah Connor',
      time: todayAt(9, 30),
      duration: 60,
      status: 'confirmed',
      notes: 'Buddy annual dental cleaning. Fasted since midnight.',
    },
    {
      staff: 'Dr. Marcus Vance, DVM',
      service: 'Comprehensive Physical & Wellness Exam',
      client: 'Elena Rostova',
      time: todayAt(11, 15),
      duration: 30,
      status: 'confirmed',
      notes: 'Max 3-year health checkup & heartworm check.',
    },
    {
      staff: 'Dr. Marcus Vance, DVM',
      service: 'Spay / Neuter Pre-Surgical Consultation',
      client: 'James Wilson',
      time: todayAt(14, 0),
      duration: 30,
      status: 'pending',
      notes: 'Bella pre-op exam and anesthesia risk assessment.',
    },
    {
      staff: 'Dr. Sarah Mitchell, DVM',
      service: 'Senior Pet Geriatric Bloodwork Panel',
      client: 'David Miller',
      time: todayAt(10, 0),
      duration: 45,
      status: 'confirmed',
      notes: 'Luna senior panel (kidney/thyroid monitoring).',
    },
    {
      staff: 'Chloe Tanaka, RVT',
      service: 'Therapeutic Medicated Bath & Groom',
      client: 'Sarah Connor',
      time: tomorrowAt(10, 30),
      duration: 45,
      status: 'confirmed',
      notes: 'Buddy chlorhexidine bath for skin allergy relief.',
    },
  ];

  for (const b of bookingsToSeed) {
    const staffId = dbStaff[b.staff];
    const serviceId = dbServices[b.service];
    const clientInfo = dbClients[b.client];
    if (!staffId || !serviceId || !clientInfo) continue;

    const existing = await prisma.booking.findFirst({
      where: {
        tenantId: tenant.id,
        clientId: clientInfo.clientId,
        serviceId,
        scheduledAt: b.time,
      },
    });

    if (!existing) {
      const endsAt = new Date(b.time.getTime() + b.duration * 60000);
      await prisma.booking.create({
        data: {
          tenantId: tenant.id,
          staffId,
          serviceId,
          clientId: clientInfo.clientId,
          petId: clientInfo.petId,
          scheduledAt: b.time,
          endsAt,
          status: b.status,
          source: 'web_portal',
          notes: b.notes,
          price: catalog.find(x => x.nameEn === b.service)?.price ?? 75.0,
          currency: 'USD',
        },
      });
      console.log('[BOOKING] Scheduled:', b.client, 'with', b.staff, 'at', b.time.toLocaleTimeString());
    }
  }

  console.log('[SUCCESS] CuraVet Platform is 100% seeded with all roles and live data.');
}

main()
  .catch((e) => {
    console.error('Fatal seeder error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
