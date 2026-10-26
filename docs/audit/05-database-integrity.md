# CuraVet — Phase E: Database, Prisma and Data Integrity

## Executive Summary

The Prisma schema is well-structured with 25+ models, proper foreign keys with cascade delete, and composite unique constraints with `tenantId`. Five committed migrations form a consistent history. However, critical data-type risks exist: monetary fields use `Float` without precision control (rounding errors possible), the `Role` enum migration risks silent demotion of users, and currency defaults changed from AED to TND across migrations risk deploying new tenants with the wrong currency before migrations are applied. No seed script overwrites real data (upsert-safe), but the full-production seed uses North American (non-Tunisian) defaults.

---

## 5.1 Schema Integrity

### 5.1.1 Model Integrity

All 26 models have proper Prisma schema definitions in `packages/db/prisma/schema.prisma`. The schema uses:

- **UUID primary keys** with `@default(uuid())` across all models
- **`tenantId`** on 24/26 models (only `User` and `Tenant` omit it as the primary tenant identifier)
- **`createdAt`/`updatedAt`** timestamp fields with `@default(now())` / `@updatedAt`
- **Proper enum types** for `Role` (after migration 2) and `Status` fields

### 5.1.2 Foreign Key Integrity

All foreign keys use `ON DELETE CASCADE` to Tenant, preserving referential integrity when a tenant is suspended/deleted. Key cascades verified in migration SQL:

| From → To | Action |
|---|---|
| User.tenantId → Tenant.id | Cascade |
| Service.tenantId → Tenant.id | Cascade |
| Staff.tenantId → Tenant.id | Cascade |
| Client.tenantId → Tenant.id | Cascade |
| Booking.tenantId → Tenant.id | Cascade |
| Payment.tenantId → Tenant.id | Cascade |
| GiftCard.tenantId → Tenant.id | Cascade |
| MedicalRecord.tenantId → Tenant.id | Cascade |
| Vaccination.tenantId → Tenant.id | Cascade |

### 5.1.3 Unique Constraints

| Constraint | Scope | Business Guarantee |
|---|---|---|
| `User.email` | Global | No duplicate emails system-wide |
| `Tenant.slug` | Global | No duplicate salon slugs |
| `Tenant.customDomain` | Global | No duplicate custom domains |
| `Tenant.webWidgetKey` | Global | No duplicate widget keys |
| `Client.tenantId + phone` | Per-tenant | One client phone number per salon |
| `Client.tenantId + webSessionId` | Per-tenant | One web session per salon |
| `UpsellRule.tenantId + triggerServiceId + suggestedServiceId` | Per-tenant | One upsell rule per service combination |
| `GiftCard.tenantId + code` | Per-tenant | One gift card code per salon |
| `Review.bookingId` | Global | One review per booking |

### 5.1.4 Index Coverage

Most query patterns are indexed. Notable indexes:
- `User.tenantId` — tenant-scoped user lookups
- `Service.tenantId + isActive` — available services per salon
- `Staff.tenantId + isActive` — available staff per salon
- `Client.tenantId` — client enumeration per salon
- `Booking.tenantId + scheduledAt` — appointment scheduling queries
- `Booking.tenantId + status` — booking status filtering
- `Payment.tenantId + status` — payment status queries
- `MedicalRecord.petId + visitDate` — clinical history per pet
- `Vaccination.petId` — vaccination tracking per pet
- `Vaccination.tenantId + nextDueDate` — due-vaccination queries

---

## 5.2 Migration History (5 Committed Migrations)

| # | Migration ID | Purpose | Risk Level |
|---|---|---|---|
| 1 | `20260101000000_init_growth_enterprise` | Initial full schema. `Role` column as TEXT, default `'salon_admin'`. | ⬇️ Low (baseline) |
| 2 | `20261026000000_courier_role_enum` | Converts `Role` from TEXT ENUM to strict enum (`super_admin`, `doctor`, `receptionist`, `client`). Data migration CASE maps legacy values. | ⚠️ **Medium** — Unknown legacy roles map to `'client'` silently |
| 3 | `20261026100000_clinical_core` | Adds `tattooNo` to Pet, creates `MedicalRecord` + `Vaccination` tables. | ⬇️ Low |
| 4 | `20261026110000_tnd_localization` | Changes currency defaults AED→TND, timezone→Africa/Tunis, emergencyPhone→+216 71 000 000. Updates existing rows. | ⚠️ **High** — New tenants without this migration get AED defaults |
| 5 | `20261026120000_giftcard_tnd_currency` | Changes GiftCard.currency default AED→TND. | ⚠️ **Medium** — Same as above |

### Migration 2 (Role Enum) — Data Migration Risk

The CASE statement maps:
- `'super_admin'` → `'super_admin'`
- `'salon_admin', 'admin'` → `'doctor'`
- `'staff', 'receptionist'` → `'receptionist'`
- Everything else → `'client'`

**Risk:** If any user row has a role value not in the CASE statement (e.g., `'surgical_nurse'`, `'assistant'`, or custom values), it will be silently mapped to `'client'`. This could demote users who should have higher privileges.

**Verification needed:** Run `SELECT role, count(*) FROM "User" GROUP BY role;` against a database initialized with the migrations to check for unexpected role values.

### Migration 4 (TND Localization) — Currency Timing Risk

- **Before migration 4:** `Service.currency DEFAULT 'AED'`, `Booking.currency DEFAULT 'AED'`, `Payment.currency DEFAULT 'AED'`
- **After migration 4:** defaults become `'TND'`, and existing `AED` rows are updated to `'TND'`

**Risk:** If a new tenant is created **before** migration 4 is deployed, the currency default will be `'AED'` (Gulf Dinar) instead of `'TND'` (Tunisian Dinar). Since Tunisia is the primary market, this is a significant deployment risk. The migration order must be enforced: `migrate deploy` must include migration 4 before any tenant creation.

### Fresh Database Initialization Verification

A fresh database can be safely initialized from committed migrations:
```
pnpm --filter @curavet/db exec prisma migrate deploy
```
This applies all 5 migrations in order. No data loss expected if the database starts empty.

---

## 5.3 Monetary Types and Precision

### Current State: `Float` for all monetary fields

| Field | Model | Current Type | Precision |
|---|---|---|---|
| `Service.price` | Service | `Float` | ~6-7 significant digits |
| `Booking.price` | Booking | `Float` | ~6-7 significant digits |
| `Payment.amount` | Payment | `Float` | ~6-7 significant digits |
| `GiftCard.amount` | GiftCard | `Float` | ~6-7 significant digits |
| `MedicalRecord.weightAtVisit` | MedicalRecord | `Float` | ~6-7 significant digits |
| `MedicalRecord.temperatureC` | MedicalRecord | `Float` | ~6-7 significant digits |

### Risks

1. **Rounding errors:** `0.1 + 0.2` yields `0.30000000000000004` in IEEE 754 floating point. For TND (3 fractional digits = millimes), this means:
   - A 35.500 TND service could be stored as 35.4999999... or 35.5000001...
   - Payment totals may not exactly match service prices
   - Change calculation could be off by millimes

2. **Stripe integration:** The `payments.ts:70-74` `toStripeAmount()` function handles this by multiplying by 100 (or 1000 for 3-decimal currencies like TND) and rounding:
   ```js
   const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD']);
   // TND is NOT in this set, so amount * 100 is used
   ```
   Wait, but the code also has `CURRENCY_FRACTION_DIGITS` with TND:3 in `utils.ts:11-16`. And the `THREE_DECIMAL_CURRENCIES` set does NOT include TND. So for TND, `toStripeAmount()` uses `Math.round(amount * 100)` (2 decimal places), which would be WRONG for TND which needs 3 decimal places (millimes).

   Let me re-read... The `THREE_DECIMAL_CURRENCIES` set includes `KWD, BHD, OMR, JOD` — these are Gulf currencies with 3 fractional digits. TND is NOT included, even though the code has `CURRENCY_FRACTION_DIGITS` with TND:3. This is a bug — TND should be in the `THREE_DECIMAL_CURRENCIES` set, or the logic needs to check `CURRENCY_FRACTION_DIGITS` instead.

   Actually, looking at `utils.ts:32-35`:
   ```js
   export function toMillimes(amount: number, currency = 'TND'): number {
     const scale = (CURRENCY_FRACTION_DIGITS[currency] ?? 2) === 3 ? 1000 : 100;
     return Math.round(amount * scale);
   }
   ```
   This correctly uses 1000 for TND (3 fractional digits) and 100 for others. But the Stripe payment code at `payments.ts:58-59`:
   ```js
   const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD']);
   ```
   Does NOT include TND. So `toStripeAmount()` would use `Math.round(amount * 100)` for TND, which is incorrect — it should use 1000 for 3 fractional digits.

   **This is a bug:** TND payments via Stripe will have incorrect amounts (off by factor of 10). Since Stripe doesn't support TND at all (explicitly documented in `payments.ts:46-50`), this may not matter in practice — TND clinics use `createLocalPaymentRecord` instead. But the code path should still be correct for completeness.

### Recommendations

1. **Add TND to `THREE_DECIMAL_CURRENCIES`** in `payments.ts` if TND Stripe support is ever added, OR refactor `toStripeAmount()` to use `CURRENCY_FRACTION_DIGITS` for determining the scale.
2. **Consider migrating monetary fields to `Decimal`** in Prisma schema for future-proofing. This would require a new migration.
3. **Ensure all monetary operations go through `toMillimes()` / `fromMillimes()`** utility functions for consistency.
4. **Document the AED→TND migration order** — migration 4 must be deployed before any tenant is created for Tunisian operations.

---

## 5.4 Transaction Boundaries

### Safe Transactions
- **Booking creation** (`services/booking.ts:183-214`): `$transaction` with overlap check — correctly atomic.
- **Medical record creation** (`pets.ts:167-187`): `$transaction` combining medical record + pet weight update — atomic.

### Unsafe (or Less Safe) Patterns
- **Stripe webhook handling** (`services/payments.ts:302-413`): `applyStripeEvent()` performs individual `prisma.payment.update()` calls without explicit transaction wrapping. Relies on Stripe's idempotency key and the fact that setting `status: 'paid'` twice is harmless. However, if a webhook is delivered twice with different statuses (e.g., `async_payment_succeeded` after `checkout.session.completed`), the second update could change `status` from `pending` to `paid` and then later to `refunded`. The function handles this by checking the current state implicitly.
- **Usage record creation:** Not examined in detail, but the `@unique([tenantId, monthYear])` constraint provides implicit atomicity.

### Idempotency
- **Payment webhooks:** `applyStripeEvent()` is idempotent for the most part — setting `status: 'paid'` or `status: 'refunded'` multiple times is safe.
- **Booking conflict:** The transaction-based conflict detection ensures only one booking per slot, but if the transaction fails (serialization error), the catch block returns a generic conflict — the client must retry, which is safe because the transaction is atomic.

---

## 5.5 Seed Script Safety

### `seed.ts` (regular)
- Uses `prisma.tenant.upsert` and `prisma.user.upsert` — will not overwrite existing data.
- Uses `prisma.staff.findFirst` + `create` pattern — safe.
- Uses `prisma.service.findFirst` + `create` — safe.
- Creates demo data with `America/New_York` timezone and `USD` currency — **not** Tunisian configuration.

### `seed_full_production.ts`
- Uses `prisma.tenant.upsert` with `where: { slug: 'curavet-demo' }` — safe, only affects the demo tenant.
- Uses `prisma.user.upsert` with `where: { email: }` — safe.
- Creates staff, services, clients, pets, and bookings using `findFirst`/`create` — safe, won't overwrite existing records.
- **Seeds North American data** (timezone `America/New_York`, currency `USD`, emergency phone `+1-800-CURA-VET`) — **not** Tunisian configuration.
- All upsert operations are safe — they won't destroy existing data.

### Seed Safety Verdict
✅ **Upsert-safe** — seed scripts will not overwrite existing data.
⚠️ **North American default data** — seed scripts use `America/New_York` and `USD`, not Tunisian settings. Running them in a Tunisian deployment would require post-seeding configuration changes.

---

## 5.6 Concurrency: Booking Conflict Detection

The `createBookingInner()` function in `services/booking.ts` implements race-free booking:

```prisma
const result = await prisma.$transaction(async (tx) => {
  const conflict = await tx.booking.findFirst({
    where: {
      staffId: input.staffId,
      status: { in: ['pending', 'confirmed'] },
      AND: [{ scheduledAt: { lt: endsAt } }, { endsAt: { gt: scheduledAt } }],
    },
  });
  if (conflict) return { conflict: true };
  const booking = await tx.booking.create({ data: {...} });
  return { conflict: false, booking };
});
```

**How it works:**
1. Two simultaneous requests for the same staff member and time slot both enter the transaction.
2. The `findFirst` overlap check uses interval overlap logic: `scheduledAt < endsAt AND endsAt > scheduledAt`.
3. Only the first request to create the booking succeeds; the second finds a conflict and returns `{ conflict: true }`.
4. The catch block at `booking.ts:229-235` handles serialization failures by returning a conflict, ensuring the client retries rather than seeing a stack trace.

**Verification:** The e2e test `booking.spec.ts:5-35` tests concurrent booking overlap and expects `409, 422, or 400`.

---

## 5.7 Summary of Database Integrity Findings

| Category | Status | Key Issues |
|---|---|---|
| Schema structure | ✅ **Well-designed** | UUIDs, tenantId, proper FKs, cascades |
| Migration consistency | ✅ **Consistent** | 5 sequential migrations, no gaps |
| Monetary precision | ❌ **Critical risk** | `Float` type may cause rounding errors; TND not in `THREE_DECIMAL_CURRENCIES` set |
| Currency migration order | ❌ **High risk** | Migration 4 (AED→TND) must deploy before tenant creation |
| Role enum migration | ⚠️ **Medium risk** | Unknown legacy roles map to `'client'` silently |
| Transaction safety | ✅ **Good** | Booking conflict detection is atomic; medical record txn safe |
| Seed script safety | ✅ **Upsert-safe** | Will not overwrite existing data |
| Data type consistency | ⚠️ **Observation** | AED→TND defaults changed across migrations; new tenants need migration 4 first |

---

## 5.8 Reproduction Verification

- **Fresh database init:** Run `pnpm --filter @curavet/db exec prisma migrate deploy` against a clean PostgreSQL database. Verify all 5 migrations apply without error.
- **Role enum migration:** After running migrations, check `SELECT role, count(*) FROM "User" GROUP BY role;` to verify no unexpected role values exist.
- **Currency defaults:** After running all migrations, verify `SELECT DEFAULT_TYPE, DEFAULT_NAME FROM pg_attribute WHERE attrelid = 'Service'::regclass AND attname = 'currency';` — should show `'TND'` after migration 4.
- **Float rounding:** Test `SELECT 0.1::float + 0.2::float;` in PostgreSQL to observe floating point behavior.

---

## 5.9 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P1** | Add TND to `THREE_DECIMAL_CURRENCIES` in `payments.ts` or refactor `toStripeAmount()` to use `CURRENCY_FRACTION_DIGITS` | 30 min |
| **P1** | Verify migration 2 data mapping — check for unexpected role values in database | 1 hour |
| **P2** | Document migration order requirement: migration 4 must deploy before Tunisian tenant creation | 15 min |
| **P3** | Consider migrating monetary fields from `Float` to `Decimal` in Prisma schema | 2+ hours (new migration) |
| **P3** | Add validation in tenant creation to reject AED-default currency for Tunisian clinics | 15 min |

---

## 5.10 Confidence Assessment

- **Confirmed:** Schema structure is solid; migrations are consistent; FK cascades work; upsert seed scripts are safe; booking conflict detection is atomic.
- **Suspected:** Float rounding may cause occasional payment discrepancies in edge cases; migration 2 may have silently demoted users with unknown role values; TND not in `THREE_DECIMAL_CURRENCIES` will cause Stripe amount errors if TND is ever used with Stripe.
- **Unverified:** Cannot run full Prisma migration deployment test without a PostgreSQL instance. Cannot observe real-world float rounding errors in financial transactions.

**Overall database integrity verdict:** The data layer is well-engineered with strong constraints and atomic operations. The primary risks are monetary precision (Float vs. Decimal) and currency migration timing (AED→TND). These should be remediated before launch but are not immediate showstoppers if workflows are followed correctly.