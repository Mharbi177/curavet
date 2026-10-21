/**
 * bootstrap-demo.ts
 * Creates the demo salon tenant + a proper salon_admin user so the
 * salon-admin dashboard can be logged into without the env super-admin hack.
 *
 * Safe to run multiple times — upserts on slug.
 */
import { PrismaClient } from '@curavet/db';
import { hashPassword } from '../services/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bootstrapping demo salon...');

  // Upsert the tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'bashayr-glamour' },
    update: { isActive: true },
    create: {
      name: 'Bashayr Glamour',
      slug: 'bashayr-glamour',
      timezone: 'Asia/Dubai',
      plan: 'pro',
      isActive: true,
      languageDefault: 'ar',
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // Upsert the salon admin user
  const email = 'salon@glambot.io';
  const password = 'salon123';

  await prisma.user.upsert({
    where: { email },
    update: { tenantId: tenant.id, isActive: true, passwordHash: hashPassword(password) },
    create: {
      email,
      passwordHash: hashPassword(password),
      role: 'salon_admin',
      name: 'Salon Admin',
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log(`✅ Salon admin user: ${email} / ${password}`);

  // Upsert services
  const nails = await prisma.service.upsert({
    where: { id: 'seed-nails' },
    update: {},
    create: {
      id: 'seed-nails',
      tenantId: tenant.id,
      nameAr: 'أظافر أكريليك',
      nameEn: 'Acrylic Nails',
      durationMinutes: 60,
      bufferMinutes: 15,
      price: 250,
    },
  });

  const hair = await prisma.service.upsert({
    where: { id: 'seed-hair' },
    update: {},
    create: {
      id: 'seed-hair',
      tenantId: tenant.id,
      nameAr: 'سشوار شعر',
      nameEn: 'Hair Blowdry',
      durationMinutes: 45,
      bufferMinutes: 15,
      price: 150,
    },
  });
  console.log(`✅ Services: ${nails.nameEn}, ${hair.nameEn}`);

  // Upsert staff
  await prisma.staff.upsert({
    where: { id: 'seed-sarah' },
    update: {},
    create: {
      id: 'seed-sarah',
      tenantId: tenant.id,
      name: 'Sarah',
      skillsJson: JSON.stringify([nails.id, hair.id]),
      workingHoursJson: JSON.stringify({
        Sunday:    [{ start: '09:00', end: '17:00' }],
        Monday:    [{ start: '09:00', end: '17:00' }],
        Tuesday:   [{ start: '09:00', end: '17:00' }],
        Wednesday: [{ start: '09:00', end: '17:00' }],
        Thursday:  [{ start: '09:00', end: '17:00' }],
      }),
    },
  });
  console.log('✅ Staff: Sarah');

  console.log('\n🎉 Done! Login credentials:');
  console.log(`   Super Admin (http://localhost:3001): admin@glambot.io / admin123`);
  console.log(`   Salon Admin (http://localhost:3002): ${email} / ${password}  (no slug needed)`);
  console.log(`   Or use super-admin creds on salon-admin with slug: bashayr-glamour`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
