import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRoles, requireTenant } from '../plugins/auth';

/**
 * Phase 3 — Clinical & patient management.
 *
 * Pets are the patients, Clients are the owners. Doctors write medical
 * records and vaccinations; receptionists register/manage pets and owners
 * but cannot author clinical notes.
 */

function tenantIdOf(request: { tenantId?: string }): string {
  if (!request.tenantId) throw Object.assign(new Error('Tenant context required'), { statusCode: 403 });
  return request.tenantId;
}

function userIdOf(request: { user?: { sub: string } }): string {
  return request.user?.sub ?? '';
}

const PetSelect = {
  id: true,
  name: true,
  species: true,
  breed: true,
  gender: true,
  dateOfBirth: true,
  weightKg: true,
  microchipNo: true,
  tattooNo: true,
  allergies: true,
  medicalNotes: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, phone: true, email: true } },
} as const;

const CreatePetSchema = z.object({
  ownerId: z.string().min(1),
  name: z.string().min(1).max(80),
  species: z.string().min(1).max(40),
  breed: z.string().max(80).nullish(),
  gender: z.enum(['M', 'F', 'MN', 'FS']).nullish(),
  dateOfBirth: z.coerce.date().nullish(),
  weightKg: z.number().positive().nullish(),
  microchipNo: z.string().regex(/^\d{15}$/).nullish(),
  tattooNo: z.string().max(40).nullish(),
  allergies: z.string().max(2000).nullish(),
  medicalNotes: z.string().max(5000).nullish(),
});

const UpdatePetSchema = CreatePetSchema.partial().omit({ ownerId: true });

const CreateMedicalRecordSchema = z.object({
  bookingId: z.string().min(1).nullish(),
  symptoms: z.string().min(1).max(5000),
  diagnosis: z.string().min(1).max(5000),
  treatmentPlan: z.string().min(1).max(5000),
  weightAtVisit: z.number().positive().nullish(),
  temperatureC: z.number().min(25).max(45).nullish(),
});

const CreateVaccinationSchema = z.object({
  vaccineName: z.string().min(1).max(120),
  diseaseTarget: z.string().min(1).max(120),
  batchNumber: z.string().min(1).max(120),
  administeredDate: z.coerce.date().nullish(),
  nextDueDate: z.coerce.date(),
});

const PetSearchSchema = z.object({
  q: z.string().max(200).nullish(),
  ownerId: z.string().min(1).nullish(),
});

export default async function petRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Search by pet name, microchip or owner phone.
  fastify.get('/api/tenants/me/pets', { preHandler: [requireTenant, requireRoles('super_admin', 'doctor', 'receptionist')] }, async (request) => {
    const tenantId = tenantIdOf(request);
    const q = PetSearchSchema.parse(request.query ?? {});

    const where = {
      tenantId,
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' as const } },
              { microchipNo: q.q.trim() || undefined },
              { owner: { phone: { contains: q.q } } },
              { owner: { name: { contains: q.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const pets = await prisma.pet.findMany({ where, select: PetSelect, orderBy: { name: 'asc' }, take: 200 });
    return pets;
  });

  fastify.post('/api/tenants/me/pets', { preHandler: [requireTenant, requireRoles('super_admin', 'doctor', 'receptionist')] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    const body = CreatePetSchema.parse(request.body);

    const owner = await prisma.client.findFirst({ where: { id: body.ownerId, tenantId }, select: { id: true } });
    if (!owner) return reply.status(404).send({ error: 'Client not found' });

    const pet = await prisma.pet.create({
      data: {
        ...body,
        ownerId: body.ownerId,
        tenantId,
      },
      select: PetSelect,
    });
    return reply.status(201).send(pet);
  });

  // Full medical history, weight curve and vaccinations.
  fastify.get('/api/tenants/me/pets/:id', { preHandler: [requireTenant, requireRoles('super_admin', 'doctor', 'receptionist')] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    const { id } = request.params as { id: string };

    const pet = await prisma.pet.findFirst({ where: { id, tenantId }, select: PetSelect });
    if (!pet) return reply.status(404).send({ error: 'Pet not found' });

    const [medicalRecords, vaccinations, bookings] = await Promise.all([
      prisma.medicalRecord.findMany({ where: { petId: id, tenantId }, orderBy: { visitDate: 'desc' }, take: 100 }),
      prisma.vaccination.findMany({ where: { petId: id, tenantId }, orderBy: { administeredDate: 'desc' }, take: 100 }),
      prisma.booking.findMany({
        where: { petId: id, tenantId },
        orderBy: { scheduledAt: 'desc' },
        take: 50,
        select: { id: true, scheduledAt: true, status: true, service: { select: { nameEn: true, nameAr: true } } },
      }),
    ]);

    return { ...pet, medicalRecords, vaccinations, bookings };
  });

  fastify.patch('/api/tenants/me/pets/:id', { preHandler: [requireTenant, requireRoles('super_admin', 'doctor', 'receptionist')] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    const { id } = request.params as { id: string };
    const body = UpdatePetSchema.parse(request.body);

    const existing = await prisma.pet.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Pet not found' });

    const pet = await prisma.pet.update({ where: { id }, data: body, select: PetSelect });
    return pet;
  });

  // Doctor consultation notes.
  fastify.post('/api/tenants/me/pets/:id/medical-records', { preHandler: [requireTenant, requireRoles('super_admin', 'doctor')] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    const { id } = request.params as { id: string };
    const body = CreateMedicalRecordSchema.parse(request.body);

    const pet = await prisma.pet.findFirst({ where: { id, tenantId }, select: { id: true, weightKg: true } });
    if (!pet) return reply.status(404).send({ error: 'Pet not found' });

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.medicalRecord.create({
        data: {
          tenantId,
          petId: id,
          doctorId: userIdOf(request),
          symptoms: body.symptoms,
          diagnosis: body.diagnosis,
          treatmentPlan: body.treatmentPlan,
          weightAtVisit: body.weightAtVisit ?? null,
          temperatureC: body.temperatureC ?? null,
          bookingId: body.bookingId ?? undefined,
        },
      });
      // Keep the weight curve current: the visit weight wins over the
      // stored profile weight when a consultation records one.
      if (body.weightAtVisit) {
        await tx.pet.update({ where: { id }, data: { weightKg: body.weightAtVisit } });
      }
      return created;
    });
    return reply.status(201).send(record);
  });

  // Log a vaccine with lot number and next due date.
  fastify.post('/api/tenants/me/pets/:id/vaccinations', { preHandler: [requireTenant, requireRoles('super_admin', 'doctor')] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    const { id } = request.params as { id: string };
    const body = CreateVaccinationSchema.parse(request.body);

    const pet = await prisma.pet.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!pet) return reply.status(404).send({ error: 'Pet not found' });

    const vaccination = await prisma.vaccination.create({
      data: {
        tenantId,
        petId: id,
        administeredById: userIdOf(request),
        vaccineName: body.vaccineName,
        diseaseTarget: body.diseaseTarget,
        batchNumber: body.batchNumber,
        administeredDate: body.administeredDate ?? new Date(),
        nextDueDate: body.nextDueDate,
      },
    });
    return reply.status(201).send(vaccination);
  });
}
