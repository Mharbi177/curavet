# CuraVet — Phase A: System Inventory

## Repository Overview

- **Root:** `D:\curavet`
- **Package manager:** `pnpm@10.34.5`
- **Monorepo structure:** `apps/`, `packages/`, `e2e/`
- **Node.js projects:** 7 packages + e2e

## Applications

| Application | Technology | Entry Point | Key Notes |
|---|---|---|---|
| `apps/api` | Fastify + TypeScript | `src/server.ts` | Main REST/JSON API. Routes under `/api/`. See `apps/api/src/routes/` for all endpoint groups. |
| `apps/clinic-admin` | React + Vite + Tailwind | `src/main.tsx` | Salon admin dashboard. UI for clinic operations. |
| `apps/super-admin` | React + Vite + Tailwind | `src/main.tsx` | Platform console for tenant management. |
| `apps/mobile` | React Native + Expo | `index.ts` | Mobile client for WhatsApp booking. |
| `apps/widget` | Framework-free embeddable | `build.mjs` | Public booking widget. |

## Packages

| Package | Technology | Entry Point | Dependencies |
|---|---|---|---|
| `packages/db` | Prisma ORM | `index.ts` | `@prisma/client@5.22.0`, `prisma@5.22.0` |
| `e2e/` | Playwright + Node | `tests/` | E2E test infrastructure. |

## API Routes (surface area)

`apps/api/src/routes/`:
- `auth.ts` — login, refresh, logout, me, user provisioning
- `bookings.ts` — create/get/cancel/reschedule bookings
- `clients.ts` — CRUD clients, search, delete
- `pets.ts` — CRUD pets, medical records, vaccinations
- `aiChat.ts` — AI chat with tenant-scoped agent
- `conversations.ts` — messaging, conversations
- `billing.ts` / `payments.ts` — payment links, local payments, Stripe webhooks
- `tenants.ts` / `tenantSelf.ts` — tenant management
- `integrations.ts` — webhook/config management
- `aiChat.ts` — AI chat endpoint
- `platform.ts`, `system.ts`, `insights.ts`, `upsell.ts`, `waitlist.ts`, `reviews.ts`

## Prisma Schema

- **25+ models:** `User`, `Tenant`, `TenantIntegration`, `Service`, `Staff`, `Client`, `Booking`, `Conversation`, `ConversationMessage`, `UsageRecord`, `Broadcast`, `Review`, `UpsellRule`, `WaitlistEntry`, `Payment`, `GiftCard`, `Pet`, `MedicalRecord`, `Vaccination`
- **5 committed migrations** (all reviewed):
  1. `20260101000000_init_growth_enterprise` — full initial schema
  2. `20261026000000_courier_role_enum` — Role enum conversion
  3. `20261026100000_clinical_core` — Pet.tattooNo, MedicalRecord, Vaccination
  4. `20261026110000_tnd_localization` — TND default, Africa/Tunis timezone
  5. `20261026120000_giftcard_tnd_currency` — GiftCard.currency default TND

## External Providers

| Provider | Integration | Status |
|---|---|---|
| OpenAI | `openai` npm pkg, `OPENAI_API_KEY` | Configurable, not configured by default |
| Groq | `groq` npm pkg, `GROQ_API_KEY` | Configurable, not configured by default |
| OpenRouter | `openrouter` npm pkg, `OPENROUTER_API_KEY` | Configurable, not configured by default |
| Stripe | `stripe` npm pkg, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments; TND not supported — local payment recording used |
| Meta WhatsApp | `META_VERIFY_TOKEN`, `META_APP_SECRET` | Webhook verification |
| Instagram | `INSTAGRAM_TOKEN` | Webhook |
| SendGrid | `SENDGRID_API_KEY` | Email |
| Redis | `ioredis` | Session revocation, refresh-token whitelist |
| Twilio (optional) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS, default: 'none' |

## Key Data Flows

1. **Authentication**: JWT access token + refresh token rotation via Redis. Passwords hashed with scrypt. Cookies: `access_token` (httpOnly, secure in prod), `refresh_token`.
2. **Tenant isolation**: All Prisma queries scoped by `tenantId`. Middleware `requireTenant` enforces tenant context. `requireTenantAccess` blocks non-super-admins from accessing other tenants' paths.
3. **Booking**: Race-free conflict detection via Prisma `$transaction` with temporal overlap check. Working hours validation per staff member.
4. **Inbound messaging**: WhatsApp/Instagram/web hooks → `processInboundMessage` → language detection → CuraVetAgent (tool-driven) → reply.
5. **Payment**: Stripe Checkout for supported currencies; local payment recording for TND (espèces, cheque, TPE, virement).
6. **AI**: Per-tenant model selection (OpenAI/Groq/OpenRouter). Tool-driven booking with `check_availability` → `book_appointment`. Emergency triage rules in system prompt.

## Development Configuration

- **Default JWT_SECRET**: `curavet_super_jwt_secret_change_in_production_2026` — will cause `assertProductionSafety()` to fail in prod
- **Default CREDENTIALS_ENCRYPTION_KEY**: `curavet_aes256_encryption_master_key_2026` — same
- **Default SUPERADMIN_PASSWORD**: `admin123` — same
- **Default SMS_PROVIDER**: `none` — SMS is a no-op in dev
- **Default REDIS_HOST**: `localhost`
- **Development defaults are deliberately insecure** — `assertProductionSafety()` hard-fails on these

## Test Infrastructure

- **Unit tests:** Vitest in `apps/api/src/services/`. 139 pass, 2 fail (language detection).
- **E2E tests:** Playwright in `e2e/tests/`. Covers auth, booking rules, tenant isolation, super-admin.
- **Test fixtures:** `e2e/tests/helpers.ts` — `seedSalon()` bootstraps a full tenant+admin+service+staff+client.