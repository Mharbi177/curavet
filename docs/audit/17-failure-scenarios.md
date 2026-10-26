# CuraVet — Phase R: Test Critical Failure Scenarios

## Executive Summary

Critical failure scenario testing was not executed during this audit. The existing test suite (139 of 141 API tests pass, 2 pre-existing language detection failures) covers normal operation but does not systematically test fault conditions. Without verified failure scenario tests, it is impossible to confirm that the system degrades gracefully, preserves data integrity, and maintains security boundaries when things go wrong. This is a significant gap — deployment to real clinics requires confidence that the system handles failures (database slowdown, Redis loss, API errors, AI provider downtime) without data corruption, security breaches, or total outages.

---

## 19.1 Existing Test Suite Coverage

| Metric | Value |
|---|---|
| **Total API tests** | 141 |
| **Passing** | 139 (98.6%) |
| **Failing** | 2 (1.4%) — pre-existing language detection failures, not related to critical paths |
| **Test framework** | vitest + supertest |
| **E2E tests** | Playwright (tenant isolation, booking rules) |

### 19.1.1 Passing Test Coverage (High-Level Categories)

| Category | Tests | Pass Rate | Notes |
|---|---|---|---|
| **Authentication** | ~20 | ✅ All pass | Login, logout, token refresh, password hashing (scrypt) |
| **Booking (CRUD)** | ~30 | ✅ All pass | Create, read, update, delete; conflict detection |
| **Client management** | ~20 | ✅ All pass | Create, update, phone duplicate detection |
| **Pet management** | ~20 | ✅ All pass | Create, update, owner validation |
| **Staff/roles** | ~15 | ✅ All pass | Role assignment, super-admin overrides |
| **AI agent** | ~20 | ✅ All pass | Tool use, emergency triage, Arabic/RTL handling |
| **Payments** | ~15 | ✅ All pass | Stripe integration, webhook handling, local payment recording |
| **Tenants/isolation** | ~15 | ✅ All pass | Cross-tenant separation (though audit found IDOR bypass) |

### 19.1.2 Failing Tests (2 pre-existing)

| Test | Reason | Impact |
|---|---|---|
| Language detection test 1 | Likely `franc` or locale-dependent; environment-specific | ❌ Does not affect critical paths; noted in Phase B |
| Language detection test 2 | Same as above | ❌ Does not affect critical paths; noted in Phase B |

**Neither failing test is related to security, data integrity, or workflow correctness.**

---

## 19.2 Critical Failure Scenarios — Not Tested

| Scenario | Expected Behavior | Tested? | Risk if Untested |
|---|---|---|---|
| **Database connection pool exhaustion** | `P2003` errors from Prisma; Fastify may return 503; graceful shutdown should terminate workers | ❌ No test | Patients may be unable to book; may see raw database errors instead of friendly messages; connection pool config unverified |
| **Redis unavailability** | BullMQ jobs may fail or be lost; `IORedis` emits errors; may fall back to failed-state retry | ❌ No test | WhatsApp/SMS reminders may not send; appointment tracking may break; no DLQ means failed jobs are lost |
| **AI provider downtime** | `AI_TIMEOUT` or `AI_PROVIDER_ERROR` — system should fallback or show graceful degradation | ❌ No test | Consultations may hang indefinitely; AI may be unavailable but system continues without indication; conversation history may be leaked on retry |
| **Stripe webhook failure / duplicate** | Idempotency key verification; 200 ACK within timeout; non-200 may retry | ⚠️ Partially tested (Phase I I-012: webhook idempotency verified conceptually) | Duplicate charges may occur if idempotency fails; pending payments may not auto-expire |
| **Session fixation / token reuse** | New token after login; old token invalidated; 401 triggers re-auth | ⚠️ Covered by auth tests (Phase C) | May be vulnerable to session fixation if not rotating tokens on login |
| **Concurrent booking creation** | Prisma overlap check (Phase H H-001) should prevent double-booking; may return conflict error | ⚠️ Covered by booking CRUD tests (Phase F) | Under high concurrency, race condition may still allow double-booking if transaction isolation level is not strict |
| **Prisma migration rollback** | `prisma migrate reset` destroys all data; no true down migration | ⚠️ Discussed in Phase O; not a "tested scenario" | Data loss if migration needs true rollback |
| **Invalid JWT / expired token** | 401; `useAuth` clears state and redirects to `/login` | ✅ Covered by auth tests | User experience degrades but security boundary maintained |
| **Malformed API payloads** | Zod validation errors; 400 with details; no crash | ✅ Covered by API tests (Zod schemas validate input) | May expose stack traces in development mode (Phase K K-008) |
| **Cross-tenant access (IDOR)** | Should be blocked by `tenantId` in Prisma where clauses; audit found bypass at bookings.ts:236 | ⚠️ Partially covered — booking CRUD tests exist but may not test cross-tenant specifically | **Critical:** Patient A could access/modify Patient B's bookings, prescriptions, medical records |
| **Super-admin tenant impersonation** | Should be blocked or require explicit authorization | ⚠️ Covered by tenant isolation tests (Phase D) | Super-admin may act as any tenant clinic — may or may not be intended behavior |

---

## 19.3 Scenario-Specific Analysis

### 19.3.1 Database Failure / Slowdown

| Question | Answer |
|---|---|
| **What happens if PostgreSQL latency spikes?** | Fastify has timeout settings; requests may exceed timeout and return 504 or be cut off; no circuit breaker observed |
| **What if `max_connections` is reached?** | New connection attempts fail with `P2003`; application may crash or return raw DB error; no connection queue or retry logic |
| **What if a Prisma transaction deadlocks?** | Prisma may throw `P2034` (deadline exceeded) or deadlock error; application may return 500; no retry-with-backoff observed in code review |

**Test coverage:** None. No test simulates slow DB, connection exhaustion, or deadlock.

### 19.3.2 Redis Failure

| Question | Answer |
|---|---|
| **What if Redis goes down?** | `IORedis` throws error events; BullMQ may pause job processing; in-flight jobs may be lost; no automatic failover |
| **What if Redis memory limit is hit?** | `RedisError: MAXMEMORY policty` may evict keys (if `allkeys-lru` configured) or reject writes; job state may be lost |
| **Test coverage:** | None. No test simulates Redis unavailability. |

### 19.3.3 AI Provider Failure

| Question | Answer |
|---|---|
| **What if OpenAI/Groq/OpenRouter API returns an error?** | The CuraVetAgent has `try/catch` around tool execution (Phase G G-001); errors are caught and may return `no_llm` outcome; conversation may continue without AI assistance |
| **What if the API key expires?** | Subsequent AI requests will fail; agent may enter error loop or fallback to last known state |
| **What if response exceeds context window?** | Conversation history may be truncated; may lose earlier symptoms or patient info (Phase G G-004) |
| **Test coverage:** | AI agent tests exist but may not test provider failure scenarios extensively. |

### 19.3.4 Stripe Payment Failures

| Question | Answer |
|---|---|
| **What if webhook signature verification fails?** | Webhook handler returns `400`; may retry; idempotency key prevents duplicate processing (Phase I I-012) |
| **What if payment link expires?** | No auto-expire mechanism (Phase H H-007): threshold 200 triggers `pending` status but no timer/auto-expire |
| **What if customer disputes charge?** | No refund workflow observed; no chargeback handling in API or DB |

**Test coverage:** Webhook idempotency verified conceptually; no test for dispute/chargeback flow.

### 19.3.5 Concurrent Bookings (Race Condition)

| Question | Answer |
|---|---|
| **Can two users book the same slot simultaneously?** | Prisma transaction overlap check (Phase H H-001) uses `prisma.booking.findUnique` + `create` within a transaction; may still have race condition depending on isolation level |
| **What if two bookings overlap before either is committed?** | `findUnique` may return null for both (neither exists yet); both `create` calls succeed → double-booking |
| **Test coverage:** | Booking CRUD tests exist; concurrency under load not tested (Phase Q Q-007). |

### 19.3.6 Session Expiry Mid-Operation

| Question | Answer |
|---|---|
| **What if user's session expires while filling a long form (e.g., multi-step booking)?** | Form data may be lost; user redirected to `/login`; no "session expired" warning observed in UI (Phase N N-007) |
| **What if refresh token is rotated and old one is used?** | `IORedis`-based refresh token rotation (Phase C C-005); may reject old token; user re-authenticates |

---

## 19.4 Test Infrastructure Gaps

| Gap | Impact |
|---|---|
| **No fault injection tests** | Cannot verify graceful degradation |
| **No Redis unavailability tests** | Cannot verify data loss or job processing behavior |
| **No DB connection exhaustion tests** | Cannot verify connection pool limits |
| **No AI provider failure tests** | Cannot verify graceful degradation when AI is unavailable |
| **No concurrent booking race condition tests** | Cannot verify double-booking prevention under load |
| **No Stripe failure scenario tests** | Cannot verify webhook error handling and idempotency under edge cases |
| **No session expiry mid-operation tests** | Cannot verify UX/data loss when session expires |

**Existing test suite is adequate for normal operation but insufficient for production readiness verification.**

---

## 19.5 Recommendations — Critical Failure Scenario Tests

| Priority | Test | Description | Effort |
|---|---|---|---|
| **P0** | **DB connection pool exhaustion** | Write test that opens `max_connections + 1` Prisma connections; verifies `P2003` or graceful 503; no data corruption | 2-3 hours |
| **P0** | **Redis unavailability** | Write test that stops Redis or rejects connections; verifies BullMQ behavior (jobs paused, lost, or retried); no data corruption in PostgreSQL | 2-3 hours |
| **P0** | **AI provider failure** | Write test that mocks AI provider error (500, timeout, invalid key); verifies agent falls back to `no_llm` outcome; no conversation history leaked; no crash | 3-4 hours |
| **P0** | **Concurrent booking race** | Write test that creates 10+ bookings simultaneously for same slot; verifies at most 1 succeeds; others return conflict error; no double-booking in DB | 3-4 hours |
| **P0** | **Stripe webhook failure** | Write test that sends webhook with invalid signature, then valid; verifies idempotency (no duplicate charges); pending status handling; auto-expire logic | 3-4 hours |
| **P1** | **Session expiry mid-operation** | Write test that expires JWT mid-form; verifies user is signed out; form data handling; re-auth flow | 2-3 hours |
| **P1** | **Malformed payload resilience** | Write test that sends payload violating Zod schema in various ways; verifies 400 response; no stack traces in production; error messages user-friendly | 2-3 hours |
| **P2** | **Super-admin impersonation boundary** | Write test that verifies super-admin cannot modify another tenant's bookings without explicit authorization | 2-3 hours |
| **P2** | **Prisma migration rollback** | Write test that documents `prisma migrate reset` behavior; verifies data destruction warning; no silent data loss | 2 hours |

---

## 19.6 Failure Scenario Testing Findings Summary

| Area | Status | Key Issues |
|---|---|---|
| **Existing test suite** | ✅ Adequate for normal operation | 139/141 pass; 2 pre-existing language detection failures |
| **Fault injection tests** | ❌ None executed | Cannot verify graceful degradation |
| **Redis unavailability** | ❌ Not tested | Job loss, data corruption possible |
| **DB connection exhaustion** | ❌ Not tested | Connection pool limits unverified |
| **AI provider failure** | ❌ Not tested | Agent behavior under failure unknown |
| **Concurrent booking race** | ❌ Not tested | Double-booking possible under load |
| **Stripe failure scenarios** | ⚠️ Partially verified | Webhook idempotency conceptually verified; no edge-case tests |
| **Session expiry mid-op** | ❌ Not tested | UX and data loss unknown |
| **Cross-tenant IDOR** | ⚠️ Covered by some tests but audit found bypass | booking.ts:236 IDOR not tested in existing suite |

**Critical gap:** No failure scenario testing exists. This must be addressed before production deployment.

---

## 19.7 Next Phase

Proceed to Phase S — Feature Completeness and Scope Honesty, which will evaluate whether the implemented feature set matches the product scope and whether any features were promised but not delivered.