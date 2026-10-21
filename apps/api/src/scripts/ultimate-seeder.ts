import { PrismaClient } from '@curavet/db';
import { hashPassword } from '../services/auth';

const prisma = new PrismaClient();

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

async function main() {
  console.log('🌟 Running the Ultimate Seeder for Bashayr Glamour...');

  const tenantSlug = 'bashayr-glamour';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  
  if (!tenant) {
    throw new Error(`Tenant ${tenantSlug} not found! Please run bootstrap-demo.ts first.`);
  }

  const tenantId = tenant.id;

  // 1. Clear existing data for this tenant (except Tenant and User)
  console.log('🧹 Cleaning up old data...');
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.review.deleteMany({ where: { tenantId } });
  await prisma.broadcast.deleteMany({ where: { tenantId } });
  await prisma.waitlistEntry.deleteMany({ where: { tenantId } });
  await prisma.upsellRule.deleteMany({ where: { tenantId } });
  await prisma.usageRecord.deleteMany({ where: { tenantId } });
  await prisma.conversationMessage.deleteMany({ where: { conversation: { tenantId } } });
  await prisma.conversation.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.staff.deleteMany({ where: { tenantId } });
  await prisma.service.deleteMany({ where: { tenantId } });
  await prisma.client.deleteMany({ where: { tenantId } });

  // 2. Create Services
  console.log('💇‍♀️ Creating Services...');
  const servicesData = [
    { nameEn: 'Acrylic Nails', nameAr: 'أظافر أكريليك', category: 'Nails', durationMinutes: 60, price: 250 },
    { nameEn: 'Gel Manicure', nameAr: 'مناكير جل', category: 'Nails', durationMinutes: 45, price: 120 },
    { nameEn: 'Spa Pedicure', nameAr: 'سبا بديكير', category: 'Nails', durationMinutes: 60, price: 150 },
    { nameEn: 'Hair Blowdry', nameAr: 'سشوار شعر', category: 'Hair', durationMinutes: 45, price: 150 },
    { nameEn: 'Hair Coloring', nameAr: 'صبغة شعر', category: 'Hair', durationMinutes: 120, price: 400 },
    { nameEn: 'Keratin Treatment', nameAr: 'كيراتين', category: 'Hair', durationMinutes: 180, price: 800 },
    { nameEn: 'Full Body Massage', nameAr: 'مساج كامل', category: 'Spa', durationMinutes: 90, price: 350 },
    { nameEn: 'Moroccan Bath', nameAr: 'حمام مغربي', category: 'Spa', durationMinutes: 60, price: 250 },
  ];

  const services: Record<string, string> = {};
  for (const s of servicesData) {
    const created = await prisma.service.create({
      data: {
        tenantId,
        ...s,
        isActive: true,
      },
    });
    services[s.nameEn] = created.id;
  }

  // 3. Create Staff
  console.log('👩‍🔧 Creating Staff...');
  const workingHoursJson = JSON.stringify({
    Sunday: [{ start: '10:00', end: '20:00' }],
    Monday: [{ start: '10:00', end: '20:00' }],
    Tuesday: [{ start: '10:00', end: '20:00' }],
    Wednesday: [{ start: '10:00', end: '20:00' }],
    Thursday: [{ start: '10:00', end: '20:00' }],
    Friday: [{ start: '14:00', end: '22:00' }],
    Saturday: [{ start: '10:00', end: '20:00' }],
  });

  const staffData = [
    { name: 'Sarah', skills: [services['Acrylic Nails'], services['Gel Manicure'], services['Spa Pedicure']] },
    { name: 'Fatima', skills: [services['Hair Blowdry'], services['Hair Coloring'], services['Keratin Treatment']] },
    { name: 'Elena', skills: [services['Full Body Massage'], services['Moroccan Bath']] },
    { name: 'Aisha', skills: [services['Gel Manicure'], services['Hair Blowdry']] }, // multi-skilled
  ];

  const staff: Record<string, string> = {};
  for (const s of staffData) {
    const created = await prisma.staff.create({
      data: {
        tenantId,
        name: s.name,
        skillsJson: JSON.stringify(s.skills),
        workingHoursJson,
        isActive: true,
      },
    });
    staff[s.name] = created.id;
  }

  // 3b. Create login accounts for each staff member
  const staffUsers = [
    { name: 'Sarah', email: 'sarah@glambot.io', password: 'sarah123' },
    { name: 'Fatima', email: 'fatima@glambot.io', password: 'fatima123' },
    { name: 'Elena', email: 'elena@glambot.io', password: 'elena123' },
    { name: 'Aisha', email: 'aisha@glambot.io', password: 'aisha123' },
  ];

  for (const su of staffUsers) {
    await prisma.user.upsert({
      where: { email: su.email },
      update: { tenantId, isActive: true, passwordHash: hashPassword(su.password), name: su.name },
      create: {
        email: su.email,
        passwordHash: hashPassword(su.password),
        role: 'staff',
        name: su.name,
        tenantId,
        isActive: true,
      },
    });
  }
  console.log(`✅ Staff login accounts: sarah@glambot.io / sarah123, fatima@glambot.io / fatima123, etc.`);

  // 4. Create Clients
  console.log('👥 Creating Clients...');
  const clientsData = [
    { name: 'Layla Ahmed', phone: '+971501234567', isVip: true },
    { name: 'Nour Hassan', phone: '+971509876543', isVip: false },
    { name: 'Mariam Ali', phone: '+971501112233', isVip: true },
    { name: 'Salma Khan', phone: '+971504445566', isVip: false },
    { name: 'Jasmine Rose', phone: '+971507778899', isVip: false },
    { name: 'Reem Saeed', phone: '+971503334455', isVip: true },
    { name: 'Alya Omar', phone: '+971506667788', isVip: false },
  ];

  const clients: Record<string, string> = {};
  for (const c of clientsData) {
    const created = await prisma.client.create({
      data: {
        tenantId,
        ...c,
      },
    });
    clients[c.name] = created.id;
  }

  // 5. Create Bookings (Past, Present, Future)
  console.log('📅 Creating Bookings & Payments & Reviews...');
  const now = new Date();
  
  // Helpers
  const getStaffForService = (serviceId: string) => {
    return Object.values(staff)[Math.floor(Math.random() * Object.values(staff).length)]; // simplified, might not match skills perfectly but good enough for UI
  };

  const bookingConfigs = [
    // Past bookings (Completed)
    ...Array.from({ length: 30 }).map(() => {
      const scheduledAt = randomDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), now);
      const serviceObj = servicesData[Math.floor(Math.random() * servicesData.length)];
      return {
        status: 'completed',
        scheduledAt,
        serviceId: services[serviceObj.nameEn],
        duration: serviceObj.durationMinutes,
        price: serviceObj.price,
      };
    }),
    // Future bookings (Confirmed)
    ...Array.from({ length: 15 }).map(() => {
      const scheduledAt = randomDate(now, new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000));
      const serviceObj = servicesData[Math.floor(Math.random() * servicesData.length)];
      return {
        status: 'confirmed',
        scheduledAt,
        serviceId: services[serviceObj.nameEn],
        duration: serviceObj.durationMinutes,
        price: serviceObj.price,
      };
    }),
    // Pending bookings
    ...Array.from({ length: 5 }).map(() => {
      const scheduledAt = randomDate(now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
      const serviceObj = servicesData[Math.floor(Math.random() * servicesData.length)];
      return {
        status: 'pending',
        scheduledAt,
        serviceId: services[serviceObj.nameEn],
        duration: serviceObj.durationMinutes,
        price: serviceObj.price,
      };
    }),
    // Cancelled bookings
    ...Array.from({ length: 5 }).map(() => {
      const scheduledAt = randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
      const serviceObj = servicesData[Math.floor(Math.random() * servicesData.length)];
      return {
        status: 'cancelled',
        scheduledAt,
        serviceId: services[serviceObj.nameEn],
        duration: serviceObj.durationMinutes,
        price: serviceObj.price,
      };
    })
  ];

  for (const config of bookingConfigs) {
    const clientName = Object.keys(clients)[Math.floor(Math.random() * Object.keys(clients).length)];
    const clientId = clients[clientName];
    // Find staff who has this skill
    const staffEntry = staffData.find(s => s.skills.includes(config.serviceId)) || staffData[0];
    const staffId = staff[staffEntry.name];

    const booking = await prisma.booking.create({
      data: {
        tenantId,
        clientId,
        staffId,
        serviceId: config.serviceId,
        scheduledAt: config.scheduledAt,
        endsAt: addMinutes(config.scheduledAt, config.duration),
        status: config.status,
        source: Math.random() > 0.5 ? 'whatsapp' : 'instagram',
        price: config.price,
      },
    });

    if (config.status === 'completed') {
      // 80% chance of payment
      if (Math.random() > 0.2) {
        await prisma.payment.create({
          data: {
            tenantId,
            bookingId: booking.id,
            amount: config.price,
            status: 'succeeded',
            currency: 'AED',
            stripePaymentIntentId: `pi_test_${Math.random().toString(36).substring(7)}`,
            provider: 'stripe',
            paidAt: new Date(),
          }
        });
      }

      // 40% chance of review
      if (Math.random() > 0.6) {
        await prisma.review.create({
          data: {
            tenantId,
            clientId,
            bookingId: booking.id,
            rating: Math.floor(Math.random() * 2) + 4, // 4 or 5 stars
            comment: ['Amazing service!', 'Loved my hair.', 'Will come back again.', 'Sarah was great!'][Math.floor(Math.random() * 4)],
            source: 'whatsapp',
          }
        });
      }
    }
  }

  // 6. Create Conversations (Chat history using real AI via OpenRouter)
  console.log('💬 Creating Real AI Conversations (Concurrent)...');
  const { processInboundMessage } = require('../services/inbound');
  
  const aiPrompts = [
    'Hi, do you do acrylic nails? How much are they?',
    'I want to book a hair coloring session for tomorrow.',
    'Can I get a full body massage this weekend?',
    'What are your working hours on Friday?',
    'I have an appointment tomorrow but I need to cancel it.'
  ];

  // We run these concurrently to simulate burst traffic
  const chatPromises = aiPrompts.map(async (prompt, i) => {
    const clientName = Object.keys(clients)[Math.floor(Math.random() * Object.keys(clients).length)];
    const clientPhone = clientsData.find(c => c.name === clientName)?.phone || `+97150000000${i}`;
    
    try {
      console.log(`Sending to AI: "${prompt}"`);
      await processInboundMessage({
        tenantId,
        platform: 'whatsapp',
        from: clientPhone,
        text: prompt,
      });
    } catch (err) {
      console.error(`AI Chat failed for "${prompt}":`, err);
    }
  });

  await Promise.all(chatPromises);
  console.log('✅ AI Conversations complete!');

  // 7. Create Waitlist Entries
  console.log('⏳ Creating Waitlist...');
  for (let i = 0; i < 3; i++) {
    const clientName = Object.keys(clients)[Math.floor(Math.random() * Object.keys(clients).length)];
    await prisma.waitlistEntry.create({
      data: {
        tenantId,
        clientId: clients[clientName],
        serviceId: services['Acrylic Nails'],
        status: 'waiting',
        preferredDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        preferredTimeOfDay: 'morning'
      }
    });
  }

  // 8. Create Upsell Rules
  console.log('📈 Creating Upsell Rules...');
  await prisma.upsellRule.createMany({
    data: [
      {
        tenantId,
        triggerServiceId: services['Gel Manicure'],
        suggestedServiceId: services['Spa Pedicure'],
        messageEn: 'Add a Spa Pedicure for the perfect combo! Get 10% off.',
        messageAr: 'أضف سبا بديكير للحصول على 10٪ خصم!',
        discountPercent: 10,
        isActive: true
      },
      {
        tenantId,
        triggerServiceId: services['Hair Blowdry'],
        suggestedServiceId: services['Moroccan Bath'],
        messageEn: 'Treat yourself to a Moroccan Bath before your blowdry. 15% off today.',
        messageAr: 'استمتع بحمام مغربي بخصم 15٪.',
        discountPercent: 15,
        isActive: true
      }
    ]
  });

  // 9. Create Broadcasts
  console.log('📣 Creating Broadcasts...');
  await prisma.broadcast.create({
    data: {
      tenantId,
      name: 'Eid Special Promotion',
      message: 'Happy Eid! Enjoy 20% off all hair services this week. Book now!',
      audience: 'all',
      status: 'sent',
      sentAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      recipientCount: 150,
      deliveredCount: 145,
      readCount: 120,
    }
  });

  await prisma.broadcast.create({
    data: {
      tenantId,
      name: 'VIP Keratin Offer',
      message: 'Exclusive VIP Offer: Book Keratin Treatment today and get a free haircut.',
      audience: 'vip',
      status: 'draft',
    }
  });

  // 10. Usage Records (for dashboard charts)
  console.log('📊 Creating Usage Records...');
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  await prisma.usageRecord.createMany({
    data: [
      { tenantId, monthYear: lastMonth, aiInteractionsCount: 450, messagesSentCount: 900 },
      { tenantId, monthYear: currentMonth, aiInteractionsCount: 210, messagesSentCount: 420 },
    ]
  });

  console.log('✅ Ultimate Seeder completed successfully!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
