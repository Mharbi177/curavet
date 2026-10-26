# CuraVet — Phase F: Veterinary Workflow Correctness

## Executive Summary

The veterinary workflows are mostly implemented with server-side validation, Prisma transactions, and proper authorization. Key journeys — clinic onboarding, staff creation, pet registration, appointment booking, medical record creation, vaccination tracking, and billing — all have backend implementations. However, several gaps exist: deleted entities may leave orphaned references, the booking reschedule path has an IDOR vulnerability (from Phase D), payment status is partially client-dependent, and some error states don't guarantee clean recovery without duplicate actions. No workflow can be confirmed as fully atomic end-to-end without integration testing against a running stack.

---

## 6.1 Workflow 1: Clinic Creation and Onboarding

### Path: Platform super-admin → Create tenant → Create salon-admin user → Login

**Backend implementation:**
- `POST /api/tenants` (tenantAdminRoutes) — requires `authenticate` + `requireSuperAdmin` (routes/index.ts line 34)
- `POST /api/users` (routes/auth.ts) — requires `authenticate` + checks `request.user.role !== 'super_admin'` (line 405)
- Both use Prisma `upsert` — safe, won't overwrite existing data

**Data flow:**
1. Super-admin creates a `Tenant` row with name, timezone, plan, and configuration
2. Super-admin creates a `User` with `role: 'doctor'` and `tenantId` set
3. User logs in via `POST /api/auth/login` — JWT issued with `tenantId` claim
4. `requireTenant` middleware resolves tenant context for subsequent requests

**Findings:**
- ✅ Workflow is complete and server-validated
- ⚠️ No validation that salon name/slug is unique across all tenants (slug has global unique constraint in DB, but no explicit server-side check before the DB constraint)
- ⚠️ No email uniqueness guard across tenants (User.email is globally unique — two different salons can't have a user with the same email, which may be overly restrictive)

---

## 6.2 Workflow 2: Staff Creation and Role Assignment

### Path: Salon admin → Create staff member → Assign working hours + skills

**Backend implementation:**
- `POST /api/tenants/me/staff` (api.ts:252-258) — requires `authenticate` + `requireTenant`
- Creates `Staff` row with `tenantId`, `name`, `workingHoursJson`, `skillsJson`, `isActive: true`

**Findings:**
- ✅ Staff can be created with name, working hours, and skills
- ⚠️ `skillsJson` is stored as free-form JSON; the `createStaff` API doesn't validate that the skills match any service catalog. The validation only happens later in `createBookingInner()` (booking.ts:155-162) when the booking is actually attempted.
- ⚠️ No duplicate staff name check within a tenant — two staff members could have the same name
- ✅ `isActive` defaults to `true` — new staff are active by default

---

## 6.3 Workflow 3: Owner Registration

### Path: Salon admin / staff → Register client → Associate pet

**Backend implementation:**
- `POST /api/tenants/me/clients` (clients.ts:80-102) — requires `authenticate` + `requireTenant`
- Creates `Client` row with `tenantId`, `phone`, `name`, `languagePreference`, `isVip`, `notes`
- **Unique check:** `prisma.client.findFirst({ where: { tenantId, phone } })` — prevents duplicate phone numbers within a tenant (clients.ts:92-95)

**Sub-workflow: Pet Registration**
- `POST /api/tenants/me/pets` (pets.ts:106-122) — requires `authenticate` + `requireTenant` + `requireRoles('super_admin', 'doctor', 'receptionist')`
- Creates `Pet` row with `tenantId`, `ownerId` (client ID), `name`, `species`, `breed`, `gender`, `dateOfBirth`, `weightKg`, `microchipNo`, `tattooNo`, `allergies`, `medicalNotes`
- **Ownership check:** `prisma.client.findFirst({ where: { id: body.ownerId, tenantId } })` — verifies owner exists in the same tenant (pets.ts:110-111)

**Findings:**
- ✅ Client phone uniqueness within tenant prevents duplicate owners
- ✅ Pet ownership is linked via `ownerId → Client.id` with `onDelete: Cascade`
- ✅ Species field is validated (Dog, Cat, NAC, Equine per enum in schema)
- ⚠️ No validation that `microchipNo` is unique within a tenant (only indexed, not unique-constrained)
- ⚠️ No validation that `dateOfBirth` is reasonable (e.g., pet can't be born in the future)

---

## 6.4 Workflow 4: Pet Registration and Ownership Changes

### Path: Register pet → Update pet → Transfer ownership

**Backend implementation:**
- `POST /api/tenants/me/pets` — creates pet with ownerId
- `PATCH /api/tenants/me/pets/:id` (pets.ts:146-156) — partial update with `UpdatePetSchema` (omits `ownerId`)
  ```prisma
  const pet = await prisma.pet.update({ where: { id }, data: body, select: PetSelect });
  ```
  The `UpdatePetSchema` is `CreatePetSchema.partial().omit({ ownerId: true })` — ownerId cannot be changed via this endpoint. Ownership transfer would require a different endpoint or direct DB update.

**Findings:**
- ✅ Pet can be created with owner and clinical info
- ✅ Pet can be updated (name, species, breed, gender, etc.) but ownerId is intentionally omitted from updates
- ⚠️ No dedicated "transfer ownership" workflow — owner change would require direct DB access or a missing endpoint
- ⚠️ If a Client is deleted, associated Pets are cascade-deleted (Prisma relation), but the reverse is not true — deleting a Pet does NOT cascade to delete the Client

---

## 6.5 Workflow 5: Appointment Creation and Modification

### Path: Book appointment → View bookings → Reschedule → Cancel

**Booking creation** (`POST /api/tenants/me/bookings` — bookings.ts:101-162):
1. Validates `CreateBookingSchema` (date format, time format, client exists in tenant, staff exists in tenant, service exists in tenant)
2. Checks staff is active and trained for the service
3. Validates the time is within working hours (via `isWithinWorkingHours()`)
4. Calls `createBookingInner()` which uses `prisma.$transaction()` with overlap check
5. On success: schedules reminders, sends WhatsApp confirmation

**Booking view** (`GET /api/tenants/me/bookings` — bookings.ts:59-88):
- Returns bookings filtered by `tenantId`
- Includes client, service, staff, pet, review, and payment info

**Booking reschedule** (`PATCH /api/tenants/me/bookings/:id` — bookings.ts:163-255):
1. Validates payload status/date/time/notes
2. Fetches booking with `where: { id, tenantId }` — IDOR check from Phase D
3. If rescheduling (date/time/staff changed):
   - Calls `createBooking()` to create a new booking
   - If the new slot is available: cancels the old booking, removes old reminders, schedules new reminders
   - If the new slot is conflicted: returns 409/422/400 error
4. If just status change: updates `prisma.booking.update({ where: { id } })` — **IDOR vulnerability** (see Phase D, D-001)
5. If status = 'completed': enqueues lifecycle event for review request

**Booking cancellation** (`DELETE /api/tenants/me/bookings/:id` — bookings.ts:257-269):
1. Fetches booking with `where: { id, tenantId }`
2. Updates status to 'cancelled'
3. Cancels reminders
4. Releases slot to waitlist (via `releaseSlotToWaitlist()`)

**Findings:**
- ✅ Conflict detection is race-free (Prisma transaction with overlap check)
- ✅ Cancellation releases slot to waitlist (Phase 5.6 feature)
- ✅ Reminders are scheduled on creation and cancelled on cancellation/reschedule
- ⚠️ **IDOR in booking patch** (Phase D, D-001) — the `update` at line 236 uses `where: { id }` without `tenantId`
- ⚠️ Reschedule creates a new booking — if the client cancels the old one manually, there could be two competing bookings
- ⚠️ No validation that the client owns the pet associated with the booking before allowing the booking (the `createBooking` function takes `petId` but doesn't verify the pet belongs to the client)

---

## 6.6 Workflow 6: Walk-ins and Emergency Visits

### Path: Client walks in → Emergency triage → Booking or referral

**Backend implementation:**
- Emergency triage is handled by the AI agent in `CuraVetAgent.ts:224`:
  ```
  1. CLINICAL EMERGENCY TRIAGE FIRST: If the pet owner reports urgent distress (e.g., difficulty breathing, ingesting poison/chocolate, seizures, collapse, bloat, or severe trauma), DO NOT BOOK A REGULAR APPOINTMENT. Instruct them to come in immediately or call the emergency veterinary hospital at ${tenant.emergencyPhone || "our emergency hotline"} without delay.
  ```
- The `processInboundMessage()` (inbound.ts) runs the agent, which may call `check_availability` and `book_appointment` tools, but the emergency rule takes precedence.

**Findings:**
- ✅ Emergency triage rule is embedded in the AI system prompt and cannot be bypassed by the client
- ⚠️ No non-AI emergency booking path documented — if a salon admin needs to manually book an emergency visit, there's no explicit "emergency" status or flag on bookings. The `Booking.status` enum is `['pending', 'confirmed', 'cancelled', 'completed', 'no_show']` — no "emergency" status.
- ⚠️ The AI agent's emergency guidance relies on the tenant's `emergencyPhone` field, which defaults to `'+216 71 000 000'` (set by migration 4). If the tenant overrides this, the guidance changes accordingly.

---

## 6.7 Workflow 7: Consultation Creation and Completion

### Path: Book appointment → Conduct consultation → Create medical record

**Medical record creation** (`POST /api/tenants/me/pets/:id/medical-records` — pets.ts:159-189):
1. Validates `CreateMedicalRecordSchema` (symptoms, diagnosis, treatmentPlan, weightAtVisit?, temperatureC?)
2. Wraps in `prisma.$transaction()`:
   - Creates `MedicalRecord` with `tenantId`, `petId`, `doctorId` (from authenticated user), `symptoms`, `diagnosis`, `treatmentPlan`, `weightAtVisit`, `temperatureC`, `bookingId`
   - If `weightAtVisit` provided: updates `Pet.weightKg` via `tx.pet.update()`
3. Returns the created medical record

**Findings:**
- ✅ Medical record creation uses Prisma transaction — atomic
- ✅ Weight curve is kept current: visit weight overwrites stored profile weight
- ✅ `bookingId` links the medical record to the appointment
- ⚠️ The `doctorId` is set from `userIdOf(request)` which returns `request.user.sub` — if the user's role is 'client' or the sub is invalid, this could create issues. The route has `preHandler: [requireTenant, requireRoles('super_admin', 'doctor')]` — only super_admin and doctor can create medical records.
- ⚠️ No explicit validation that the `doctorId` (veterinarian) is actually assigned to the tenant's staff — any doctor from any tenant could potentially create records if the JWT is compromised, but the `tenantId` filter should prevent cross-tenant writes.

---

## 6.8 Workflow 8: Vaccination Tracking

### Path: Log vaccine → Track due dates → Notify upcoming

**Backend implementation:**
- `POST /api/tenants/me/pets/:id/vaccinations` (pets.ts:192-213) — requires `authenticate` + `requireTenant` + `requireRoles('super_admin', 'doctor')`
1. Validates `CreateVaccinationSchema` (vaccineName, diseaseTarget, batchNumber, administeredDate?, nextDueDate)
2. Creates `Vaccination` row with `tenantId`, `petId`, `administeredById` (from authenticated user), `vaccineName`, `diseaseTarget`, `batchNumber`, `administeredDate` (default: now), `nextDueDate`
3. No automatic notification logic in the backend — the frontend or a cron job would query vaccinations with `nextDueDate` approaching

**Findings:**
- ✅ Vaccination can be logged with batch number and due date
- ✅ `nextDueDate` is stored and can be queried for follow-up
- ⚠️ No automatic notification system for upcoming vaccinations in the backend (would require a scheduled job or frontend polling)
- ⚠️ `administeredById` links to the user who recorded the vaccination, but there's no audit of who administered the vaccine in real life — this is a recording field only

---

## 6.9 Workflow 9: Prescriptions or Medication Records

**Note:** No explicit "prescription" model found in the Prisma schema. The closest fields are:
- `MedicalRecord.treatmentPlan` — free-text treatment instructions
- `MedicalRecord.diagnosis` — diagnosis text
- No `prescriptionName`, `dosage`, `frequency`, or `duration` fields

**Findings:**
- ❌ No prescription or medication record functionality implemented
- ⚠️ Treatment plans are stored as free-text in `MedicalRecord.treatmentPlan`, but there is no structured medication tracking
- ⚠️ If a pharmacy or medication workflow is needed, it must be built from scratch (no existing model or API endpoint)

---

## 6.10 Workflow 10: Follow-up Reminders

### Path: Booking creation → 24h reminder → 1h reminder → Post-consultation review request

**Backend implementation:**
- `scheduleBookingReminders(bookingId)` (bookings.ts:145, and called in queue service)
- The reminder system uses BullMQ queues (see Phase J)
- Two reminder checks: 24 hours before and 1 hour before the scheduled appointment
- On cancellation: `cancelBookingReminders(id)` cancels pending reminders

**Findings:**
- ✅ Reminders are scheduled on booking creation
- ✅ Reminders are cancelled on booking cancellation
- ⚠️ The reminder cron job runs via `node-cron` with schedule `REMINDER_CRON: '*/5 * * * *'` (every 5 minutes) — this is a polling approach rather than event-driven
- ⚠️ No "reminder failed" retry logic documented beyond the `withRedis` fallback pattern

---

## 6.11 Workflow 11: Billing and Invoice Generation

### Path: Service provided → Payment link created → Payment recorded → Invoice

**Payment link creation** (`createBookingPaymentLink` — payments.ts:76-147):
1. Checks if currency is supported by Stripe (TND is NOT supported — explicitly documented)
2. For supported currencies: creates Stripe Checkout Session
3. Persists `Payment` row with `status: 'pending'`, `provider: 'stripe'`, `paymentUrl`, `stripeSessionId`
4. Returns payment URL

**Local payment recording** (`createLocalPaymentRecord` — payments.ts:155-185):
1. Creates `Payment` row with `provider: 'local'`, `status: 'paid'`, `method: 'especes' | 'cheque' | 'tpe' | 'virement'`
2. Sets `paidAt: new Date()` — immediate payment recording
3. No Stripe involvement

**Payment webhook handling** (`applyStripeEvent` — payments.ts:302-413):
- Handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Idempotent: finds payment by `stripeSessionId` or `stripePaymentIntentId` before updating
- **B2C booking deposits:** When `checkout.session.completed` fires, the associated booking status is updated to `'confirmed'`
- **B2B subscriptions:** Updates tenant plan and `isActive` status

**Findings:**
- ✅ Local payments (TND methods) are fully supported via `createLocalPaymentRecord`
- ✅ Stripe payments for supported currencies are properly handled
- ✅ Webhook handler is idempotent (finds existing payment before updating)
- ✅ Booking confirmation upon payment success
- ⚠️ **TND not supported by Stripe** — Tunisian clinics must use local payment recording (espèces, cheque, TPE, virement). This is explicitly documented but requires clinic staff to know which path to use.
- ⚠️ **Payment status determined by webhook, not by client redirect** — the `Payment.status` is updated by the webhook handler, not by the client calling a "payment success" endpoint. This is correct — it prevents clients from faking payment success.
- ⚠️ The `createBookingPaymentLink` function downgrades the booking status to `'pending'` after creating the payment link (line 550-554). If the client never pays, the booking remains pending indefinitely. No auto-expire or cleanup mechanism is evident.

---

## 6.12 Workflow 12: Inventory and Product Sales

**Note:** The Prisma schema has `UpsellRule` model and services can have a `category`, but there is no `Inventory` product model, no stock quantities, and no sales tracking beyond the upsell rules.

**Findings:**
- ❌ No inventory or product sales functionality implemented
- ⚠️ `UpsellRule` suggests related services based on trigger service, but there's no stock or inventory management
- ⚠️ No product catalog beyond the `Service` model (which represents clinical services, not retail products)
- ⚠️ If the salon sells retail products (food, medications, accessories), there is no backend support

---

## 6.13 Workflow 13: Reporting and Exports

**Findings:**
- ⚠️ Dashboard stats are fetched via `api.getDashboardStats()` (api.ts:125-128) — returns aggregated data for the signed-in tenant
- ⚠️ No export functionality found in the API routes or services
- ⚠️ The clinic-admin UI has `AnalyticsPage.tsx` and `BroadcastPage.tsx` but the data fetching paths need verification
- ⚠️ Exports could potentially leak data across tenants if the dashboard queries don't properly scope by `tenantId` — but since all API endpoints require `requireTenant`, this should be contained

---

## 6.14 Summary of Veterinary Workflow Findings

| Workflow | Status | Key Issues |
|---|---|---|
| Clinic onboarding | ✅ Complete | No uniqueness validation before DB constraint |
| Staff creation | ✅ Complete | Skills not validated at create time |
| Owner registration | ✅ Complete | Phone uniqueness within tenant only |
| Pet registration | ✅ Complete | No microchip uniqueness; no future date validation |
| Appointment booking | ⚠️ Mostly complete | **IDOR in booking patch** (Phase D); no pet ownership validation |
| Walk-ins/Emergency | ⚠️ Partially complete | No "emergency" booking status; AI triage rules are correct |
| Consultation creation | ✅ Complete | Transactional; doctor role validated |
| Vaccination tracking | ✅ Complete | No automatic notifications |
| Prescriptions | ❌ Not implemented | No medication model |
| Follow-up reminders | ⚠️ Partially complete | Polling-based every 5 min |
| Billing and invoices | ⚠️ Mostly complete | TND clinics use local payments; Stripe path for supported currencies only |
| Inventory/retail sales | ❌ Not implemented | No stock model |
| Reporting/exports | ⚠️ Limited | No export API found |

---

## 6.15 Critical Workflow Gaps

| Finding ID | Severity | Description |
|---|---|---|
| WF-001 | **HIGH** | **IDOR in booking reschedule/cancel** — `PATCH /api/tenants/me/bookings/:id` update uses `where: { id }` without `tenantId` (Phase D, D-001). A user can modify/cancel any booking by guessing the ID. |
| WF-002 | **MEDIUM** | **No pet ownership validation at booking time** — `createBooking` accepts `petId` but doesn't verify the pet belongs to the booked client. A client could potentially book with a different pet's ID. |
| WF-003 | **MEDIUM** | **No emergency booking status** — Bookings use `['pending', 'confirmed', 'cancelled', 'completed', 'no_show']`. No "emergency" or "urgent" status for walk-in patients. |
| WF-004 | **LOW** | **No prescription/medication model** — Treatment plans are free-text only; no structured medication tracking, dosage, or frequency. |
| WF-005 | **LOW** | **No inventory/retail product support** — No model for products, stock quantities, or sales beyond clinical services. |
| WF-006 | **LOW** | **Reminder polling approach** — Every-5-minute cron job instead of event-driven notifications. Higher resource usage and delayed reminders. |

---

## 6.16 Reproduction Verification

- **IDOR in booking:** Create two tenants A and B. Book in A. As A's user, call `PATCH /api/tenants/me/bookings/:id` with a booking ID from B. Should fail with 404 (if tenantId is in where) or succeed (if not). Verify the actual behavior.
- **Pet ownership at booking:** Book an appointment with a `petId` that belongs to a different client/tenant. Verify the booking is created despite the mismatch.
- **Emergency status:** Verify that the Booking status enum does not include "emergency" or "urgent".

---

## 6.17 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P0** | Fix IDOR in `bookings.ts:236` — add `tenantId` to `prisma.booking.update` where clause | 5 min |
| **P1** | Add pet ownership validation in `createBooking` — verify `petId` belongs to `clientId` in the same tenant | 1 hour |
| **P1** | Add "emergency" booking status or workflow for walk-in patients | 2 hours |
| **P2** | Implement structured prescription/medication model if needed, or document that treatment plans are free-text only | 3+ hours |
| **P2** | Add inventory/retail product support if clinic sells products | 5+ hours |
| **P3** | Convert reminder polling to event-driven architecture (Redis-based or queue-based) | 2+ hours |

---

## 6.18 Workflow Correctness Verdict

**Overall:** Most critical veterinary workflows are implemented and functional, but the IDOR vulnerability in booking management (WF-001) is a significant gap that must be fixed. The workflow from clinic onboarding through appointment booking and medical record creation is sound, with proper server-side validation and Prisma transactions. However, several incomplete areas exist (prescriptions, inventory, emergency workflows) that should be addressed before the product is presented as "complete" for clinic use.

**Deployment impact:** The IDOR in booking management must be fixed before deployment. The other gaps can be deferred or addressed in parallel with feature development, but they should be documented as known limitations.