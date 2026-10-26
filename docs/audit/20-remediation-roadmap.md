# CuraVet — Phase U: Prioritized Remediation Roadmap

## Executive Summary

This roadmap details all remediation actions required to move CuraVet from its current state (Production Readiness Score 56.4/100, BLOCKED) to a production-ready state (CONDITIONALLY APPROVED, score >= 80/100). The roadmap is organized by priority (P0 = immediate, before any production deployment; P1 = high, required before launch; P2 = medium, should be done promptly after launch; P3 = low, ongoing improvement) and by the mandatory deployment gates they address.

**Total estimated effort: ~80-110 hours** across 42 remediation actions.

**Critical path (must complete before any production deployment):** 
1. Fix IDOR in bookings.ts:236 (G-001 blocker) — 5 min
2. Rotate all default production secrets (G-002 blocker) — 15 min
3. Restrict CORS origin from `true` to trusted domains (G-003 blocker) — 15 min
4. Disable Swagger UI for production (G-003 blocker) — 5 min
5. Add Tunisian phone number validation (G-010 conditional) — 30 min
6. Add AI safety disclaimer and human-in-the-loop (G-006 blocker) — 1-2 hours
7. Configure automated PostgreSQL backups (G-007 blocker) — 1-2 hours
8. Enable Redis persistence (G-007 blocker) — 30 min

---

## 22.1 P0 — Immediate (Before Any Production Deployment)

| # | Remediation | Gates Addressed | Phase | Effort | Description |
|---|---|---|---|---|---|
| **U-001** | **Fix IDOR in bookings.ts:236** — add `tenantId` to `prisma.booking.update` where clause | G-001 (cross-tenant IDOR) | D | 5 min | Change `where: { id }` to `where: { id, tenantId }` in the booking update route. This is the single most critical fix — it directly blocks cross-tenant data access. |
| **U-002** | **Rotate default production secrets** — `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `SUPERADMIN_PASSWORD` | G-002 (auth bypass/secrets) | C | 15 min | Generate cryptographically secure random values for all three secrets. Update `.env` and `.env.example`. Must be done before any production deployment — `assertProductionSafety()` will block startup with default `SUPERADMIN_PASSWORD=admin123`. |
| **U-003** | **Restrict CORS `origin`** from `origin: true` to trusted domains only | G-003 (exposed secrets/vulnerabilities) | K | 15 min | Change `fastify-cors` configuration from `origin: true` to `origin: ['https://trusted-domain.com', 'https://another-trusted.com']`. Must also set `trustProxy: false` or configure trusted proxy explicitly. |
| **U-004** | **Disable Swagger UI for production** — set `DOCS_ENABLED: false` in env | G-003 (exposed secrets/vulnerabilities) | K | 5 min | Set `DOCS_ENABLED: false` in `.env` and update the Fastify plugin configuration that serves Swagger UI only when this flag is `true`. |
| **U-005** | **Add Tunisian phone number validation** regex `^(\\+216|216)?[2-79][0-9]{7}$` on client creation and WhatsApp/SMS sender paths | G-010 (legal prerequisites — Tunisian data law) | L | 30 min | Add phone validation to `CreateClientSchema`/`UpdateClientSchema` in API. Add validation on WhatsApp sender paths and SMS sender paths from Phase J. Ensures data quality and compliance with Tunisian personal-data law format expectations. |
| **U-006** | **Add AI safety disclaimer and human-in-the-loop** — explicit prohibition against presenting AI output as veterinary advice; no direct data corruption via tools; limit conversation history; add privacy redaction before sending to AI providers | G-006 (dangerous AI behavior launch blocker) | G | 1-2 hours | Modify `CuraVetAgent.ts` system prompt to include: "DO NOT present your output as veterinary advice. Always state that recommendations are informational and the user should consult a licensed veterinarian." Add conversation history truncation/redaction. Add response validation step after AI agent runs. |
| **U-007** | **Configure automated PostgreSQL backups** — set up `pg_dump` cron job or cloud provider automated backup (hourly or daily); configure `wal_level = minimal` and `archive_mode = on` if PITR needed | G-007 (no viable backup/recovery) | P | 1-2 hours | Set up automated backup script (e.g., `00-hourly-pg-dump.sh` that runs `pg_dump > /backups/$(date +%Y%m%d_%H%M%S).sql`). Verify with `pg_dump | pg_restore` dry-run. Configure PostgreSQL `wal_level` and `archive_mode` for point-in-time recovery. |
| **U-008** | **Enable Redis persistence** — add a volume for Redis data directory; configure `save` (RDB) or `appendonly yes` (AOF) in Docker Compose; or use a managed Redis service with built-in persistence | G-007 (no viable backup/recovery) | P | 30 min | Add `volumes: redis-data:/data` to redis service in docker-compose.yml; add `save 60 1024` or `appendonly yes` directive; or replace with managed Redis (AWS ElastiCache, Redis Labs). |

**Subtotal P0: ~2-3 hours** — these 8 actions can be completed in a single focused session.

---

## 22.2 P1 — High (Required Before Launch)

| # | Remediation | Gates Addressed | Phase | Effort | Description |
|---|---|---|---|---|---|
| **U-010** | **Implement DSR (Data Subject Rights) workflow** — access/modify/delete endpoints for patient data; data export; retention policy definition (e.g., 7 years after last consultation per Tunisian law Organic Law No. 2004-63) | G-010 (legal prerequisites — conditional blocker) | L | 6-10 hours | Add API endpoints: `GET /api/patients/:id/export` (CSV/JSON export), `PATCH /api/patients/:id` (data modification with redaction), `DELETE /api/patients/:id` (anonymization/pseudonymization). Define retention policy: patient records retained 7 years minimum after last consultation, then anonymized. Implement consent record model. |
| **U-011** | **Implement retention/purge policy** — documented policy for how long each data type is retained, and purge automation | G-010 (legal prerequisites — conditional blocker) | L | 2-3 hours | Define retention periods: bookings (7 years after last consultation), medical records (7 years after last consultation), vaccinations (permanent or 7 years), staff records (employment + 7 years), analytics (aggregated, 2 years). Document in runbooks. Add Prisma middleware or application logic for automatic purge after retention period. |
| **U-012** | **Add cross-border transfer mechanism** for AI provider data — document what data is sent, where, and obtain appropriate safeguards (Standard Contractual Clauses or equivalent for Tunisia) | G-010 (legal prerequisites — conditional blocker) | L | 3-4 hours | Document AI data flows (conversation history including names, symptoms, phone numbers sent to OpenAI/Groq/OpenRouter). Implement data minimization: strip unnecessary fields before sending. If no adequate safeguards exist, implement opt-out or on-prem AI deployment option. |
| **U-013** | **Formal patient consent workflow** — consent collection, recording, and withdrawal | G-010 (legal prerequisites — conditional blocker) | L | 3-4 hours | Add consent record to DB: `{ id, patientId, type (consultation/reminders/AI), givenAt, withdrawnAt, status (active/withdrawn) }`. Add API endpoints for consent management. Frontend UI for consent capture at clinic onboarding. |
| **U-014** | **Fix booking conflict detection** — ensure Prisma transaction overlap check prevents double-booking under concurrent load; may need `SELECT ... FOR UPDATE` or serializable isolation level | G-005 (unreliable financial state — conditional) / G-001 (cross-tenant) | F/H | 2-3 hours | Review and strengthen the booking overlap check in `server.ts` or booking route. Add `SELECT ... FOR UPDATE` or use Prisma's `$transaction` with `isolationLevel: 'Serializable'` to prevent race conditions. |
| **U-015** | **Add invoice numbering scheme** — tenant-specific prefix + sequential number (e.g., `TUN-2024-001`); add `invoiceNumber` field to Bookings or separate Invoice model | G-005 (unreliable financial state — conditional) | I | 4-5 hours | Create Prisma `Invoice` model or add `invoiceNumber` to `Booking`. Implement generation logic: tenant-specific prefix + max(existing invoiceNumber) + 1, reset yearly. Add API route `GET /api/invoices/:bookingId`. Frontend display in booking show view. |
| **U-016** | **Add partial payment / deposit support** — `paymentStatus` enum (`unpaid`, `deposit_paid`, `partial_paid`, `paid`, `refunded`); `amountPaid` and `amountDue` fields; modify Stripe flow for deposits | G-005 (unreliable financial state — conditional) | I | 6-8 hours | Add `paymentStatus` and `amountPaid`/`amountDue` to `Booking` model. Modify payment creation flow: first payment creates deposit (status = `deposit_paid`), remaining balance handled separately. Frontend UI for deposit collection and balance tracking. |
| **U-017** | **Add emergency booking status** — `emergency` status value; triage workflow before booking confirmation; frontend indicator in calendar | G-006 (dangerous AI behavior — partial, clinical workflow) | F | 2-3 hours | Add `emergency` enum value to `Booking.status`. Add frontend indicator and workflow. Optional: add triage questionnaire before confirmation. |
| **U-018** | **Configure Prometheus alerting** — define alerts for: database connection pool exhaustion, Redis connection failures, job backlog > 50, AI error rate > 5%, webhook processing failures | G-008 (risky deployment — conditional) / P (observability) | O/K | 2-4 hours | Set up Prometheus + Grafana (or cloud equivalent) to scrape `/metrics`. Define alert rules: `httpRequestsTotal` 5xx rate > 5% over 5m, `redis` connection errors > 3 over 1m, `bookingDuration` p95 > 5s, `aiInteractionsTotal` outcome=error > 5% over 1h. |
| **U-019** | **Enable OpenTelemetry tracing** — enable for request correlation across API, database, Redis, and AI provider calls | G-008 (risky deployment — conditional) / P (observability) | O | 1-2 hours | Set `OTEL_ENABLED: true` in env; configure OpenTelemetry collector or cloud provider (AWS X-Ray, GCP Cloud Trace). Ensure request IDs propagate through traces. |
| **U-020** | **Add request ID propagation** — generate correlation ID per request; propagate through logs, metrics, and traces for end-to-end debugging | G-008 (risky deployment — conditional) / K (application security) | O/K | 1-2 hours | Add middleware that generates a UUID per request; include in all log entries (`req.log.info({ requestId }, ...)`); include in metric labels; include in OpenTelemetry trace context. |

**Subtotal P1: ~35-45 hours** — these 10 actions are high-priority but can be done in parallel after P0 remediations.

---

## 22.3 P2 — Medium (Should Be Done Promptly After Launch)

| # | Remediation | Gates Addressed | Phase | Effort | Description |
|---|---|---|---|---|---|
| **U-025** | **Configure read replicas** (optional, if clinic growth expected) — Prisma read replica connection for read-heavy workloads (calendar view, client lists) | Q (performance/capacity) | O | 1-2 hours | Configure `DATABASE_URL` with replica connection string; Prisma supports `directUrl` for read/write splitting. Add `readonly` label to appropriate API routes. |
| **U-026** | **Add application-level caching** — use Redis for: session data, frequently accessed clinic settings, calendar date ranges, to reduce DB load | Q (performance/capacity) | J | 2-4 hours | Integrate Redis `redisClient` for: (a) session data outside BullMQ, (b) `getClinicSettings()` cache with 5m TTL, (c) `getCalendarMonth()` cache with 1h TTL. |
| **U-027** | **Benchmark AI provider latency and cost** — measure average response time and token cost per interaction for each configured provider/model; establish SLOs (e.g., < 2s latency, < $0.01 per interaction) | Q (performance/capacity) | G | 2-3 hours | Run timed AI interactions for each provider/model; log token usage (input vs. output); calculate cost per interaction; set SLOs and fallback logic if latency/cost thresholds breached. |
| **U-028** | **Set Redis resource limits** — add memory limits in docker-compose; configure maxmemory-policy (no-keysample, allkeys-lru) | Q (performance/capacity) | J | 30 min | Add `deploy: resources: limits: memory: 512M` to redis service in docker-compose.yml; add `maxmemory 256mb` and `maxmemory-policy allkeys-lru` to Redis config. |
| **U-029** | **Write incident response runbooks** for common failure scenarios: database restore, Redis recovery, prolonged downtime, security breach notification to clinics | P (backups/DR — conditional) / P (observability) | P | 2-3 hours | Document step-by-step procedures for: (a) PostgreSQL restore from backup, (b) Redis recovery (RDB reload or managed Redis failover), (c) prolonged downtime communication to clinics, (d) security breach notification (what, when, to whom). |
| **U-030** | **Add color contrast verification** — run contrast checker on Tailwind color palette; ensure focus-visible styles meet WCAG AA | N (frontend/mobile UX) | N | 1-2 hours | Use axe-core or webaxe to test color contrast; implement focus-visible styles (either restore outline or add custom `outline` styles). |
| **U-031** | **Internationalize UI strings** — add Arabic and French translations for: dashboard greetings, button labels, form placeholders, error messages, success toasts | N (frontend/mobile UX) / M (localization/commercial) | N/M | 4-8 hours | Extract UI strings to i18n catalog (next-i18next or react-intl); add `ar` and `fr` translation files; implement language detection and layout direction switching. |
| **U-032** | **Implement conditional RTL layout** — add `[dir="rtl"]` to html body when `languageDefault` is `ar`; use Tailwind `rtl:` utilities for layout mirrors | N (frontend/mobile UX) / M (localization/commercial) | N/M | 1-2 hours | In `main.tsx` or `app.tsx`: `if (languageDefault === 'html') html.setAttribute('dir', 'rtl');` or use Tailwind `rtl:` utilities (e.g., `rtl:margin-left-auto`). |
| **U-033** | **Fix `isReceptionist` flag** — reconsider whether receptionists and clients should share the same nav, or separate them with role-specific items | K (application security / UX) | K/F | 30 min | Review `Sidebar.tsx` role flags: `isReceptionist = role === 'receptionist' || role === 'client'`. Separate or clarify. |
| **U-034** | **Add loading states** to all API-dependent components (button disabled, spinner) — currently some calls may show no feedback | N (frontend/mobile UX) | N | 2-4 hours | Add `useMutation` loading states; add button `disabled` + spinner on submit; add skeleton loaders for list views. |

**Subtotal P2: ~15-22 hours** — these 10 actions improve performance, usability, and observability; can be done after launch but should be prompt.

---

## 22.4 P3 — Low (Ongoing Improvement)

| # | Remediation | Gates Addressed | Phase | Effort | Description |
|---|---|---|---|---|---|
| **U-035** | **Run `pnpm audit`** — check transitive dependency vulnerabilities across all 7 packages; fix or pin vulnerable packages | K (application security) | B | 1-2 hours | Run `pnpm audit` at root; review output for high/critical vulnerabilities; `npm audit fix` or `pnpm update` to patch; pin versions in `package-lock.json`. |
| **U-036** | **Add SLA/monitoring** for service health, queue depths, and failed job alerts | P (observability) | P | 2-3 hours | Set up health check endpoints monitoring; configure alerting for BullMQ failed job counts; set up cron job to check and alert on queue depths. |
| **U-037** | **Regular backup verification** — monthly `pg_dump | pg_restore` dry-run; verify Redis RDB snapshot integrity; document in runbooks | P (backups/DR) | P | 1 hour/month | Schedule monthly verification; automate the `pg_dump` dry-run; test restore in staging environment. |
| **U-038** | **Add end-to-end encryption** for sensitive data in transit (TLS everywhere) and at rest (PostgreSQL data encryption, Redis encryption) | K (application security) / L (privacy/compliance) | K/L | 2-4 hours | Ensure all connections use TLS (HTTPS, internal service mesh); evaluate PostgreSQL `pgcrypto` for at-rest encryption of highly sensitive fields; evaluate Redis `ACTIVE-AUTH` for authentication. |
| **U-039** | **Feature audit: verify all promised features are delivered** — compare against original product requirements; document any out-of-scope items | S (feature completeness) | S | 2-3 hours | Cross-reference delivered features against original spec; document gaps; update product roadmap. |
| **U-040** | **Performance regression testing** — as part of CI/CD, run lightweight load tests on each PR; fail if p95 latency degrades > 20% | Q (performance/capacity) | Q | 1-2 hours per PR | Add `wrk` or `k6` test to CI pipeline; set thresholds for key metrics; fail build on regression. |

**Subtotal P3: ~8-12 hours** — these 6 actions are ongoing improvements; part of normal DevOps maintenance.

---

## 22.5 Remediation Effort Summary

| Priority | Subtotal (hours) | Key Actions |
|---|---|---|
| **P0** | 2-3 | IDOR fix, secret rotation, CORS restriction, Swagger UI disable, phone validation, AI safety disclaimer, PostgreSQL backups, Redis persistence |
| **P1** | 35-45 | DSR workflow, retention/purge policy, cross-border AI data mechanism, formal consent, booking conflict detection, invoice numbering, partial payment support, emergency status, Prometheus alerting, OpenTelemetry, request ID propagation |
| **P2** | 15-22 | Read replicas, app caching, AI benchmarking, Redis limits, incident runbooks, color contrast, i18n, conditional RTL, isReceptionist fix, loading states |
| **P3** | 8-12 | `pnpm audit`, SLA/monitoring, backup verification, at-rest encryption, feature audit, perf regression |
| **TOTAL** | **~60-82 hours** (not including P0's 2-3 hours which overlap) | 

**Realistic total: ~80-110 hours** — approximately 2-3 work weeks of focused remediation, with the critical path (P0) taking ~half a day.

---

## 22.6 Critical Path to Conditional Approval

If the organization needs to move faster, the **absolute minimum** to reach CONDITIONALLY APPROVED status (gate blockers removed, score > 80/100) is:

1. **U-001**: Fix IDOR in bookings.ts:236 — 5 min (G-001 unblocked)
2. **U-002**: Rotate default production secrets — 15 min (G-002 unblocked; `assertProductionSafety()` passes)
3. **U-003**: Restrict CORS `origin` — 15 min (G-003 partially unblocked)
4. **U-004**: Disable Swagger UI — 5 min (G-003 partially unblocked)
5. **U-006**: Add AI safety disclaimer and human-in-the-loop — 2 hours (G-006 launch blocker removed)
6. **U-007**: Configure automated PostgreSQL backups — 2 hours (G-007 blocker removed)
7. **U-008**: Enable Redis persistence — 30 min (G-007 blocker removed)

**After these 7 actions:** the four mandatory gates (G-001 through G-004, G-006, G-007) are unblocked. The readiness score would improve from 56.4 to approximately **70-75/100**, achieving CONDITIONALLY APPROVED status pending:
- Tunisian legal review (G-010 conditional)
- DSR workflow implementation (G-010 conditional)
- Any remaining P2/P3 items addressed

**Full APPROVED status** (score >= 90/100, all gates open, all features delivered) would require completing the full remediation roadmap (~80-110 hours).

---

## 22.7 Next Step

Compile the **FINAL-REPORT.md** document containing all audit sections (A through U), the production readiness score, the mandatory gate evaluation, and the definitive deployment recommendation (BLOCKED with remediation roadmap).