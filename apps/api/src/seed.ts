import { PrismaClient } from '@curavet/db';
import { hashPassword } from './services/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding CuraVet Veterinary Platform...');

  const passwordHash = hashPassword('CuraVet2026!Secure');

  // 1. Create Demo Veterinary Hospital
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'curavet-demo' },
    update: {},
    create: {
      name: 'CuraVet Animal Hospital',
      slug: 'curavet-demo',
      brandName: 'CuraVet Pet Hospital & Surgery Center',
      plan: 'enterprise',
      timezone: 'America/New_York',
      languageDefault: 'en',
      primaryColor: '#059669',
      welcomeMessage: 'Welcome to CuraVet Animal Hospital! How can we care for your companion today? 🐾',
      emergencyPhone: '+1-800-CURA-VET',
      clinicType: 'companion_animal',
      webWidgetEnabled: true,
      remindersEnabled: true,
      reviewsEnabled: true,
      waitlistEnabled: true,
      upsellEnabled: true,
    },
  });

  // 2. Admin User
  await prisma.user.upsert({
    where: { email: 'admin@curavet.io' },
    update: { passwordHash },
    create: {
      email: 'admin@curavet.io',
      name: 'Dr. Sarah Mitchell, DVM',
      passwordHash,
      role: 'doctor',
      tenantId: tenant.id,
    },
  });

  // 3. Veterinary Medical Staff
  const vets = [
    { name: 'Dr. Sarah Mitchell, DVM' },
    { name: 'Dr. Marcus Vance, DVM' },
    { name: 'Chloe Tanaka, RVT' },
  ];

  for (const v of vets) {
    const existing = await prisma.staff.findFirst({
      where: { tenantId: tenant.id, name: v.name },
    });
    if (!existing) {
      await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          name: v.name,
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
  }

  // 4. Veterinary Treatment Catalog
  const services = [
    { nameEn: 'Comprehensive Physical & Wellness Exam', nameAr: 'فحص شامل للحيوان', durationMinutes: 30, price: 75.0 },
    { nameEn: 'Canine Core Vaccines (Rabies + DHPP)', nameAr: 'تطعيمات الكلاب الأساسية', durationMinutes: 20, price: 65.0 },
    { nameEn: 'Feline Core Vaccines (Rabies + FVRCP)', nameAr: 'تطعيمات القطط الأساسية', durationMinutes: 20, price: 60.0 },
    { nameEn: 'Dental Ultrasonic Scaling & Polishing', nameAr: 'تنظيف وتلميع أسنان', durationMinutes: 60, price: 240.0 },
    { nameEn: 'Microchipping & Lifetime Registration', nameAr: 'تركيب شريحة إلكترونية', durationMinutes: 15, price: 45.0 },
    { nameEn: 'Spay / Neuter Pre-Surgical Consultation', nameAr: 'استشارة تعقيم جراحية', durationMinutes: 30, price: 85.0 },
    { nameEn: 'Senior Pet Geriatric Bloodwork Panel', nameAr: 'تحليل دم شامل لكبار السن', durationMinutes: 45, price: 165.0 },
    { nameEn: 'Therapeutic Medicated Bath & Groom', nameAr: 'حمام طبي وعناية', durationMinutes: 45, price: 55.0 },
  ];

  for (const s of services) {
    const existing = await prisma.service.findFirst({
      where: { tenantId: tenant.id, nameEn: s.nameEn },
    });
    if (!existing) {
      await prisma.service.create({
        data: {
          tenantId: tenant.id,
          nameEn: s.nameEn,
          nameAr: s.nameAr,
          durationMinutes: s.durationMinutes,
          price: s.price,
          isActive: true,
        },
      });
    }
  }

  // 5. Create Sample Pet Owners & Patients
  let owner = await prisma.client.findFirst({
    where: { tenantId: tenant.id, phone: '+1-555-019-2834' },
  });

  if (!owner) {
    owner = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        name: 'Sarah Connor',
        phone: '+1-555-019-2834',
        notes: 'Preferred client, owner of Buddy.',
      },
    });
  }

  const pet = await prisma.pet.findFirst({
    where: { tenantId: tenant.id, name: 'Buddy' },
  });

  if (!pet) {
    await prisma.pet.create({
      data: {
        tenantId: tenant.id,
        ownerId: owner.id,
        name: 'Buddy',
        species: 'Dog',
        breed: 'Golden Retriever',
        gender: 'Neutered Male',
        weightKg: 32.5,
        medicalNotes: 'Up to date on DHPP and Rabies. Mild seasonal grass allergy.',
      },
    });
  }

  console.log('🎉 CuraVet seed completed successfully! Clinic ID: ' + tenant.id);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
