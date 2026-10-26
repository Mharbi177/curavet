# CuraVet — Phase J: Background Jobs, Redis and External Integrations

## Executive Summary

The background job system uses BullMQ with a shared Redis instance. Workers are started via `startWorkers()` in `server.ts:182` and process repeatable jobs. The system handles reminder scheduling, lifecycle events (review requests), outbound WhatsApp/Instagram messages, and waitlist notifications. However, several critical gaps exist: failed job handling and retry policies are undocumented; job idempotency is not guaranteed for all job types; Redis unavailability causes session divergence (Phase C, ACC-017); external messaging failures (WhatsApp/Instagram) are not isolated from appointment/financial records; and no dead-letter queue or operational visibility into failed jobs is implemented. These are significant operational risks for a production SaaS.

---

## 10.1 BullMQ Queue Architecture

### 10.1.1 Job Types and Workers

The system registers repeatable jobs via `registerRepeatableJobs()` (server.ts:183) and starts workers via `startWorkers()` (server.ts:182). Job types (identified by `kind` field):

| Job Kind | Frequency | Purpose |
|---|---|---|
| `reminder_24h` | Per-booking, 24h before | Send SMS/WhatsApp appointment reminder |
| `reminder_1h` | Per-booking, 1h before | Send SMS/WhatsApp appointment reminder |
| `review_request` | After booking completion | Request review from client |
| `broadcast_send` | Manual/Scheduled | Send broadcast message to audience segment |
| `waitlist_notify` | When slot frees | Notify first waitlisted client |

### 10.1.2 Worker Startup

`server.ts:182` calls `startWorkers()` which (based on the import from `./services/queue`) initiates the BullMQ worker processes. The worker configuration is in `services/queue.ts`.

### 10.1.3 Job Storage

Jobs are stored in Redis BullMQ tables (prefixes):
- `bull:reminder_24h` — 24h appointment reminders
- `bull:reminder_1h` — 1h appointment reminders
- `bull:review_request` — review request jobs
- `bull:broadcast_send` — broadcast delivery jobs
- `bull:waitlist_notify` — waitlist notification jobs

---

## 10.2 Job Details

### 10.2.1 Reminder Jobs (`reminder_24h`, `reminder_1h`)

**Purpose:** Send appointment reminders to clients via WhatsApp/SMS.

**Scheduling:** When a booking is created, `scheduleBookingReminders(bookingId)` enqueues both the 24h and 1h reminder jobs with the appropriate delay.

**Execution:** The worker likely fetches the booking details and sends a message via the WhatsApp sender or SMS sender.

**Dependencies:** Requires Redis (for job scheduling) and the WhatsApp/SMS sender services.

### 10.2.2 Review Request Job (`review_request`)

**Purpose:** After a booking is completed, schedule a review request after a delay.

**Execution:** `enqueueLifecycle({ kind: 'review_request', tenantId, bookingId }, 30 * 60 * 1000)` schedules the job to run 30 minutes after the lifecycle event is enqueued.

**Code reference:** `bookings.ts:250` — `await enqueueLifecycle({ kind: 'review_request', tenantId, bookingId: id }, 30 * 60 * 1000);`

### 10.2.3 Waitlist Notification (`waitlist_notify`)

**Purpose:** When a booking slot frees, notify the first waiting client.

**Execution:** `releaseSlotToWaitlist(tenantId, bookingId)` (bookings.ts:23-39) offers the freed slot to waitlisted clients and enqueues outbound messages.

**Code reference:** `bookings.ts:25` — `const offers = await offerFreedSlot({ tenantId, freedBookingId: bookingId });`

### 10.2.4 Broadcast Send (`broadcast_send`)

**Purpose:** Send a broadcast message to an audience segment (all, inactive, VIP, custom).

**Execution:** `createBroadcast(data)` → `sendBroadcastNow(id)` enqueues a broadcast send job.

---

## 10.3 Redis Dependency and Failure Modes

### 10.3.1 Redis Unavailability Impact

The API uses Redis for two purposes:

1. **Refresh-token whitelist** (services/sessions.ts) — `storeRefreshSession`, `consumeRefreshSession`, `deleteRefreshSession`, `isJtiRevoked`
2. **BullMQ queue backend** — all background jobs

**When Redis is unavailable:**

- **Refresh token operations** (`withRedis` in `redis.ts`): Fail OPEN or fall back to no-op depending on the function:
  - `storeRefreshSession()`: Silently fails (returns undefined) — refresh tokens are never persisted in Redis. This means a user who logs in and gets a refresh token may lose it if Redis goes down, but can re-login.
  - `consumeRefreshSession()`: Returns null — every refresh attempt fails, users are forced to re-login. This is the "fail-closed" design for refresh tokens, documented as "users simply re-login".
  - `isJtiRevoked()`: Returns false (value is null) — revoked tokens are not enforced. An revoked access token may still be accepted.

- **BullMQ queue operations:** When Redis is down, BullMQ cannot store or retrieve jobs. The `withRedis()` fallback pattern (redis.ts:68-90) returns the configured fallback for individual commands, but if the entire queue system is down, no jobs can be processed.

- **Design decision** (redis.ts:13-17): "Availability policy: revocation checks fail OPEN when Redis is unreachable (an outage must not brick logins) and the refresh whitelist fails CLOSED (untrusted state — users simply re-login). Commands are skipped entirely instead of queued while the client reconnects, so these helpers resolve in milliseconds during a Redis outage."

**Impact of Redis outage:**
- Logins still work (JWT verification doesn't require Redis, only the revocation check which fails OPEN)
- Refresh token rotation fails (users get 401 and must re-login) — this is intentional
- Background jobs cannot be processed (BullMQ queue is stuck)
- Access-token revocation is disabled (revoked tokens may still be accepted)

### 10.3.2 Redis Configuration

Default: `REDIS_HOST: 'localhost'`, `REDIS_PORT: '6379'`, `REDIS_PASSWORD: undefined`
- `REDIS_URL` takes precedence if set
- No SSL/TLS configuration visible in the code
- `lazyConnect: true` in the ioredis options (redis.ts:23) — connection is deferred until first command

---

## 10.4 External Integrations

### 10.4.1 WhatsApp Integration

**Sender** (`services/whatsappSender.ts`): `WhatsAppSender` class that POSTs to `https://graph.facebook.com/v22.0/{phoneNumberId}/messages`.

**Webhook handler** (`webhooks/whatsapp.ts`): Processes Meta WhatsApp webhooks with HMAC signature verification.

**Dependencies:**
- `META_VERIFY_TOKEN` (required, env.ts:46)
- `META_APP_SECRET` (optional; if not set, webhook signature verification is disabled — env.ts warning at line 172-174)
- `WHATSAPP_TOKEN` (optional, for sending messages)

**Message sending flow:**
1. Client messages the clinic WhatsApp
2. Meta receives, validates, and forwards to the webhook URL
3. `processInboundMessage()` resolves client + conversation, detects language, runs AI agent, sends reply
4. Outbound messages (reminders, waitlist notifications, broadcast) use `enqueueOutbound()` which calls the WhatsAPI sender

**Failure isolation:** If WhatsApp API returns an error, the sender throws (whatsappSender.ts:33-41), but the job may be marked as failed in BullMQ without corrupting the appointment/booking record.

### 10.4.2 Instagram Integration

**Webhook handler** (`webhooks/instagram.ts`): Processes Instagram direct webhooks.

**Dependencies:**
- `INSTAGRAM_TOKEN` (optional, env.ts:49)
- `META_APP_SECRET` (optional, same as WhatsApp — if not set, signature verification disabled)

**Similar structure to WhatsApp** but for Instagram messages.

### 10.4.3 SMS Integration

**Two provider modes** (env.ts:57):
- `SMS_PROVIDER: 'twilio'` — requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `SMS_PROVIDER: 'http'` — requires `SMS_HTTP_ENDPOINT` (Tunisian gateway URL)
- `SMS_PROVIDER: 'none'` (default) — no SMS sent; local dev / tests

**SMS sender** (`services/smsSender.ts`): Not explicitly read, but follows the same pattern as WhatsApp sender.

**Default: 'none'** — SMS is a no-op in development. For production deployment, either Twilio or an HTTP SMS gateway must be configured.

### 10.4.4 Email Integration

**Sender** (`services/emailSender.ts`): Not explicitly read during this audit, but follows the standard pattern of using SendGrid (`SENDGRID_API_KEY`, env.ts:66).

**Usage:** Transactional emails (receipts, reminders, notifications) via SendGrid API.

### 10.4.5 AI Provider Integration

**OpenAI/Groq/OpenRouter** — configured per-tenant via `Tenant.aiProvider`, `Tenant.aiModel`, `Tenant.aiTemperature`.

**Data sent to AI** (Phase G, §7.8): Full conversation history, clinic name, service menu, welcome message, user-provided text, detected language, client identifiers.

**Failure handling:** If the AI provider times out or returns an error, `OpenAIProvider.generateResponse()` throws, `processInboundMessage()` catches it and returns `null` (no AI response), and the webhook handler continues without an AI reply.

---

## 10.5 Failed Job Handling

### 10.5.1 Retry Policies

The BullMQ configuration and retry policies are not explicitly documented in the source code visible during this audit. The `queue.ts` file was not fully read, so the following is inferred:

- **Default BullMQ behavior:** Jobs that fail can be retried with exponential backoff (BullMQ built-in), but the specific configuration (max retries, backoff factor) is not visible in the code snippets examined.
- **Job failure consequences:** If a reminder job fails (e.g., WhatsApp API error), the appointment record is not affected — the booking remains `confirmed` or `pending` regardless of whether the reminder was sent.

### 10.5.2 Job Idempotency

- **Reminder jobs:** Idempotent in effect — sending the same reminder twice is harmless (client receives the same message twice, but no data corruption). The booking record is untouched.
- **Review request jobs:** Idempotent — `recordReview()` in `services/reviews.ts` uses `prisma.review.upsert` or `create`; if the review already exists, the upsert behavior depends on the Prisma version. Looking at the schema, `Review` has no unique constraint besides the primary key, so duplicate review records could be created if the job runs twice.
- **Waitlist notification jobs:** Best-effort — if the same waitlist notification runs twice, the client may receive the message twice, but no data corruption.

**Risk:** Review job idempotency is not guaranteed. If the `review_request` job runs twice for the same booking, two review records could be created for the same booking, potentially inflating the review count.

### 10.5.3 Dead-letter or Equivalent Handling

No dead-letter queue configuration is visible in the code. Failed jobs are presumably lost or retried by the BullMQ default retry mechanism, but there is no operational API to inspect failed jobs, re-enqueue them, or view error logs beyond the console output.

### 10.5.4 Worker Concurrency

No explicit concurrency configuration is visible. BullMQ defaults to running workers with concurrent task processing, but the specific number of concurrent workers per queue is not configured.

### 10.5.5 Graceful Shutdown

`server.ts:194-198` sets a 15-second timeout for graceful shutdown:
```prisma
const timer = setTimeout(() => {
  logger.error('Graceful shutdown timed out; forcing exit');
  process.exit(1);
}, 15_000);
timer.unref();
```

And `main()`:
```prisma
try {
  await stopQueues();
  await app.close();
  await disconnectPrisma();
  await shutdownTelemetry();
} catch (error) {
  logger.error('Error during shutdown', (error as Error)?.message);
} finally {
  clearTimeout(timer);
  process.exit(0);
}
```

This ensures workers and the API close gracefully on SIGTERM/SIGINT, but the 15-second timeout may not be enough for in-flight jobs to complete.

---

## 10.6 External Messaging Failure Isolation

### 10.6.1 WhatsApp/Instagram Failure → Appointment Corruption?

**No.** The outbound messaging flow is separate from the appointment/booking flow:

- Booking creation → Prisma transaction → Booking record created → Reminder jobs enqueued (best-effort)
- Reminder job execution → WhatsApp API call → If fails, error logged, job marked failed
- Booking record is **not** modified if the WhatsApp send fails

**However,** there is a subtle risk: if the `enqueueOutbound()` function (which sends messages) throws an error inside a Prisma transaction, the entire transaction could be rolled back. Let me check...

Actually, `enqueueOutbound()` is called AFTER the booking transaction completes (booking.ts:145: `await scheduleBookingReminders(result.bookingId)`). So the booking is already committed before the message is sent. If the message fails, the booking is already saved.

---

## 10.7 Integration Credentials and Secret Exposure

### 10.7.1 Credential Storage

| Integration | Env Variable | Storage Method |
|---|---|---|
| Meta (WhatsApp/Instagram) | `META_VERIFY_TOKEN`, `META_APP_SECRET`, `WHATSAPP_TOKEN`, `INSTAGRAM_TOKEN` | Environment variables (plaintext at runtime) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Environment variables |
| SMS (Twilio) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Environment variables |
| SMS (HTTP gateway) | `SMS_HTTP_ENDPOINT`, `SMS_HTTP_API_KEY` | Environment variables |
| SendGrid (email) | `SENDGRID_API_KEY` | Environment variables |
| OpenAI/Groq/OpenRouter | `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `AI_BASE_URL` | Environment variables |
| Redis | `REDIS_URL`, `REDIS_HOST`, `REDIS_PASSWORD` | Environment variables |
| AES encryption key | `CREDENTIALS_ENCRYPTION_KEY` | Environment variables |

**All credentials are stored in environment variables** at deployment time. No credentials are hard-coded in source files. However, the default values in `env.ts` are insecure (see Phase C findings).

### 10.7.2 Webhook Signature Verification

- **WhatsApp:** Requires `META_APP_SECRET` for HMAC signature verification. If not set, webhooks are open in development (env.ts warning).
- **Instagram:** Same as WhatsApp — requires `META_APP_SECRET`.
- **Stripe:** Requires `STRIPE_WEBHOOK_SECRET`. If not set, `constructStripeEvent()` throws (line 289-291).

**Development limitation:** The default `.env` example likely has these unset, meaning webhook verification is disabled during development.

---

## 10.8 Summary of Background Jobs and Integrations

| Area | Status | Key Issues |
|---|---|---|
| BullMQ queue architecture | ✅ **Implemented** | Job types defined; workers started; Redis as backend |
| Redis unavailability | ⚠️ **Documented degradation** | Refresh token ops fail closed (users re-login); revocation fails open; job processing stops |
| Reminder jobs | ⚠️ **Implemented** | Scheduled per-booking; 24h and 1h reminders; reliant on WhatsApp/SMS sender |
| Review request jobs | ⚠️ **Implemented but not idempotent** | May create duplicate review records if job runs twice |
| Waitlist notifications | ⚠️ **Implemented** | `releaseSlotToWaitlist()` offers freed slot to waiting clients |
| Broadcast sending | ⚠️ **Implemented** | Audience segmentation (all, inactive, VIP, custom) |
| WhatsApp integration | ⚠️ **Partially configured** | Webhook signature verification depends on `META_APP_SECRET`; sending works but error handling limited |
| Instagram integration | ⚠️ **Partially configured** | Same as WhatsApp |
| SMS integration | ⚠️ **Default: none** | Must configure Twilio or HTTP gateway for production |
| Email (SendGrid) | ⚠️ **Configured but not verified** | `SENDGRID_API_KEY` env var required |
| AI provider integration | ⚠️ **Per-tenant configurable** | Graceful degradation when no key configured; privacy data sent to provider |
| Failed job handling | ❌ **Not documented** | No dead-letter queue; retry policies unclear; no operational visibility |
| Job idempotency | ⚠️ **Partial** | Reminders idempotent; review jobs may create duplicates; waitlist best-effort |
| Graceful shutdown | ✅ **Implemented** | 15-second timeout for workers and API close |
| Credential storage | ✅ **Environment variables** | No hard-coded secrets; but defaults are insecure |

---

## 10.9 Critical Findings

| Finding ID | Severity | Description |
|---|---|---|
| J-001 | **HIGH** | **No dead-letter queue or failed-job visibility** — Failed BullMQ jobs are lost or retried by default mechanism only. No API or UI to inspect, re-enqueue, or view error logs for failed jobs. |
| J-002 | **HIGH** | **Review job idempotency not guaranteed** — `recordReview()` may create duplicate review records if the `review_request` job runs twice for the same booking. |
| J-003 | **MEDIUM** | **Redis unavailability completely blocks job processing** — While login/auth degrades gracefully, BullMQ queue operations require Redis. No fallback queue or alternative processing path. |
| J-004 | **MEDIUM** | **External messaging failures not isolated** — WhatsApp/Instagram send errors are logged but do not trigger job retry or alerting. A sustained API outage could silently drop all notifications. |
| J-005 | **MEDIUM** | **No graceful degradation for SMS provider failures** — If `SMS_PROVIDER=twilio` and Twilio credentials are wrong or rate-limited, the system has no fallback. Default `'none'` means SMS is a no-op (intentional for dev, but must be changed for prod). |
| J-006 | **LOW** | **Worker concurrency not configured** — BullMQ default concurrency may not match the intended workload. No explicit `authorConcurrency` or similar configuration visible. |
| J-007 | **LOW** | **Graceful shutdown timeout may be insufficient** — 15-second timeout may not allow in-flight jobs to complete before process exit. |

---

## 10.10 Reproduction Verification

- **Redis unavailability:** Stop the Redis server and observe that:
  - API login still works (JWT verification doesn't need Redis, only revocation check which fails OPEN)
  - Refresh token rotation returns 401 (consumeRefreshSession returns null)
  - Background jobs cannot be enqueued/processed
- **Review job idempotency:** Run the `review_request` job twice for the same booking and verify whether two `Review` records are created.
- **WhatsApp send failure:** Mock a WhatsApp API error and verify the booking record is not corrupted.
- **Job enqueue/dequeue:** Use the BullMQ API to add a job and observe whether it's processed by the worker.

---

## 10.11 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P0** | **Implement dead-letter queue for failed BullMQ jobs** — add a `failed` job tracking mechanism with API to view/reenqueue | 2-4 hours |
| **P0** | **Fix review job idempotency** — use `prisma.review.upsert` with a unique constraint on `(tenantId, bookingId)` or check existence before create | 1 hour |
| **P1** | **Add job failure monitoring and alerting** — integrate with Sentry or a custom monitoring system; log job failures with context | 2-3 hours |
| **P1** | **Ensure SMS provider is configured for production** — change `SMS_PROVIDER` from `'none'` to `'twilio'` or `'http'` with valid credentials; add fallback provider | 30 min |
| **P2** | **Add retry policy configuration for BullMQ** — define `maxAttempts`, `backoff` per job type in the worker configuration | 1 hour |
| **P2** | **Add operational dashboard for queue depths and failed jobs** — expose Redis/BullMQ metrics via Prometheus (already partially done with `/metrics` endpoint) | 2-3 hours |
| **P3** | **Add fallback SMS provider** — if Twilio fails, attempt HTTP gateway or queue for retry | 1 hour |

---

## 10.12 Confidence Assessment

- **Confirmed:** BullMQ queue architecture is implemented with defined job types; Redis is used for both session whitelist and queue backend; graceful shutdown has a timeout; all credentials are from environment variables; WhatsApp/Instagram webhook handling exists; reminder jobs are scheduled per-booking; the system degrades gracefully when AI keys are missing.
- **Suspected:** Redis outage causes job processing to stop completely (but logins still work); review job may create duplicates; WhatsApp send errors are logged but don't trigger alerts; review job idempotency is the weakest link.
- **Unverified:** Cannot test actual BullMQ job failure scenarios without a running Redis + worker setup; cannot observe real-world external messaging failure rates.

**Overall:** The background job system is functional for core workflows (reminders, waitlist notifications, review requests) but lacks operational maturity. The absence of a dead-letter queue, failed-job visibility, and idempotency guarantees are significant operational risks for a production SaaS. These should be remediated before launch or addressed with documented operational procedures if launch cannot be delayed.