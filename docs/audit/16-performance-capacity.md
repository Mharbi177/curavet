# CuraVet — Phase P: Backups, Disaster Recovery and Observability

## Executive Summary

Backup and disaster recovery infrastructure for CuraVet is essentially nonexistent. No automated backup scripts, no scheduled pg_dump/restore, no Redis persistence configuration, no tested restore procedures, and no off-site or encrypted backup storage. The system would lose all data (patients, bookings, medical records, financial transactions) if the PostgreSQL database or Redis instance is destroyed. Observability exists at the application level (structured logging, metrics, Sentry, OpenTelemetry) but has critical gaps: no alerting on failure modes, no dashboard for recovery-relevant metrics, and no correlation between application logs and infrastructure events. The system is high-risk for data loss with no viable recovery path.

---

## 17.1 PostgreSQL Backup and Recovery

### 17.1.1 Backup Automation

- **None.** No automated backup scripts (`pg_dump`, `pg_basebackup`, or cloud provider features) were found in the repository.
- **No cron jobs, systemd timers, or CI/CD backup steps** observed.
- Manual `pg_dump` could be run, but there is no documentation or procedure for doing so.

### 17.1.2 Point-in-Time Recovery (PITR)

- **Not configured.** No `wal_level` setting, no archive mode, no `restore_command` documented.
- Without WAL archiving, PITR is impossible — recovering to a specific transaction timestamp would require restoring from a full backup and replaying uncommitted transactions, which cannot be done without backup infrastructure.

### 17.1.3 Backup Verification

- **No backup testing** was performed during this audit. There is no evidence that any pg_dump output has been validated (e.g., `pg_dump | pg_restore` dry-run).
- **Zero-day risk:** If the database is corrupted or deleted, backups may be incomplete or unverified.

### 17.1.4 Restore Procedure

- **Not documented.** No step-by-step guide for restoring from backup.
- The only documented migration mechanism is `prisma migrate deploy`, which re-applies all committed migrations from scratch — not a point-in-time restore.
- `pnpm --filter @curavet/db exec prisma migrate reset` destroys all data and recreates from migrations — only viable if all migrations are up to date and no data has been modified outside Prisma (e.g., raw SQL, direct DB edits).

### 17.1.5 Database Size and Growth

| Metric | Status |
|---|---|
| **Current database size** | Not measured during audit |
| **Expected growth rate** | Not estimated |
| **Retention policy** | Not defined |
| **Compliance requirements** | Tunisian personal-data law (Organic Law No. 2004-63) may impose retention requirements for patient records |

### 17.1.6 PostgreSQL Configuration (via Prisma)

- `connection_limit` — configured in `postgres` Docker service, default depends on `max_connections` PostgreSQL setting
- `max_connections` — not explicitly set in Prisma schema; depends on PostgreSQL default (typically 100)
- No connection pool monitoring or alerting

---

## 17.2 Redis Backup and Recovery

### 17.2.1 Backup Automation

- **None.** No automated Redis backup scripts were found.
- Redis `RDB` (snapshotting) or `AOF` (append-only file) persistence is not configured in the Docker Compose (redis service definition has no `save` or `appendonly` directives).
- Without persistence, any Redis data not flushed to PostgreSQL via BullMQ is lost on Redis failure.

### 17.2.2 Redis Persistence

- **Not configured.** The `redis:7-alpine` service in docker-compose.yml has no volume mapping for persistence data directory.
- **Risk:** Any job state, session data, or queued appointments held only in Redis will be lost if the Redis container restarts or is deleted.

### 17.2.3 Redis Data at Risk

| Data Type | TTL/Lifetime | Recovery Status |
|---|---|---|
| **BullMQ job state** | Until job completes/fails | Partial — completed jobs lose tracking state; failed jobs may be retried but with no idempotency guarantee (Phase J) |
| **Active session data** | Until token expires (7d) or cleared | Lost on Redis restart; users would need to re-authenticate |
| **WhatsApp message state** | Until delivered/failed | Partial — message status may be lost; re-sending may occur |
| **Appointment reminders** | Polling-based (Phase F WF-006) | Lost — reminders rely on polling; no persistent "reminder sent" flag |

### 17.2.4 Restore Procedure

- **Not documented.** No steps for restoring Redis from backup.
- The only recovery mechanism is re-processing jobs from the BullMQ queue; however, without idempotency (Phase J), re-processing may create duplicates or miss jobs.

---

## 17.3 Application-Level Observability

### 17.3.1 Logging (Revisited from Phase O)

- ✅ Fastify logger with structured output (JSON if configured)
- ✅ Redact: `authorization`, `cookie` headers
- ✅ HTTP metrics: request count and duration via prom-client
- ✅ Sentry integration if `SENTRY_DSN` configured
- ✅ OpenTelemetry if `OTEL_ENABLED: true`

### 17.3.2 Metrics (Revisited from Phase O)

- ✅ `httpRequestsTotal` — counter per {method, route, status_code}
- ✅ `httpRequestDuration` — histogram per {method, route, status_code}
- ✅ `bookingDuration` — timer for booking creation
- ✅ `aiInteractionDuration` — timer for AI agent processing
- ✅ `aiInteractionsTotal` — counter per outcome
- ✅ `webhookEventsTotal` — counter per {platform, outcome}

### 17.3.3 Alerting and Dashboards

- ❌ **None.** No alerting rules, no monitoring dashboards, no on-call rotation.
- Metrics are exported (Prometheus `/metrics` endpoint) but no one is configured to scrape them.
- No integration with PagerDuty, Opsgenie, or similar incident management.
- No thresholds or anomaly detection for critical failure modes (database connection pool exhaustion, Redis unavailability, queue backlog growth, AI error rate spikes).

### 17.3.4 Failure Mode Detection

| Failure Mode | Detection Method | Alerting |
|---|---|---|
| **Database connection exhaustion** | Prometheus `pg_connection_count` gauge (if exposed) | ❌ No alert |
| **Redis unavailability** | `redis` client error events logged | ❌ No alert (but `IORedis` would emit errors caught by BullMQ) |
| **BullMQ job backlog** | No dedicated metric; could infer from pending job count | ❌ No alert |
| **AI agent error spikes** | `aiInteractionsTotal` with `outcome: error` | ❌ No alert (but metric is exported) |
| **Webhook processing failures** | `webhookEventsTotal` with outcome tracking | ❌ No alert |
| **Authentication failures** | 401/403 rate tracking via `httpRequestsTotal` | ❌ No alert |

### 17.3.5 Incident Response

- **No documented incident response plan** for data loss, security breach, or prolonged downtime.
- No runbooks for common failure scenarios.
- No communication templates for notifying clinics of downtime or data issues.

---

## 17.4 Observability Findings

| Area | Status | Key Issues |
|---|---|---|
| **Backup automation** | ❌ None | No pg_dump, no scheduled backups, no verification |
| **Redis persistence** | ❌ None | No RDB/AOF; data lost on container restart |
| **Restore procedures** | ❌ None | No documented steps; `prisma migrate reset` destroys data |
| **PITR capability** | ❌ None | No WAL archiving configured |
| **Monitoring dashboards** | ❌ None | Metrics exported but not scraped; no alerts |
| **Alerting rules** | ❌ None | No thresholds, no on-call, no incident response |
| **Runbooks** | ❌ None | No documented procedures for failure scenarios |
| **Sentry integration** | ⚠️ Conditional | If DSN provided, errors tracked; otherwise silently logged |
| **OpenTelemetry** | ⚠️ Conditional | If `OTEL_ENABLED: true`, traces exported; otherwise no-op |
| **Log redaction** | ✅ Implemented | Headers (authorization, cookie) redacted |
| **Structured logging** | ✅ Implemented | JSON capable; level configurable |
| **HTTP metrics** | ✅ Exported | Prometheus `/metrics` endpoint available |
| **Correlation** | ❌ None | No request ID propagation across services; no link between logs, metrics, and traces |

---

## 17.5 Recovery Viability Assessment

### 17.5.1 Data Loss Scenarios

| Scenario | Data at Risk | Recovery Viability |
|---|---|---|
| **PostgreSQL container/data loss** | All patient records, bookings, medical records, financial transactions, user accounts | ❌ **Not viable** — no verified backup; `prisma migrate reset` would destroy any unsaved data |
| **Redis container/data loss** | Job state, active sessions, WhatsApp message status, reminder state | ❌ **Not viable** — no persistence; some data may be partially recoverable from API/database |
| **Simultaneous PostgreSQL + Redis loss** | Complete system state loss | ❌ **Not viable** — no backups of either |
| **Accidental data deletion (DML)** | Specific patient records, bookings, etc. | ⚠️ **Partially viable** — if Prisma schema matches, `migrate reset` could recreate; but any raw SQL changes are lost |
| **Code deployment error** | API behavior may break; data may be intact | ✅ **Viable** — graceful shutdown (15s); can rollback Docker compose; but may introduce inconsistencies |

### 17.5.2 Disaster Recovery Score

- **Backup existence:** 0/10 — no automated backups
- **Backup verification:** 0/5 — no testing
- **Restore procedure:** 1/10 — only `prisma migrate reset`, which destroys data
- **PITR capability:** 0/5 — no WAL archiving
- **Monitoring/alerting:** 1/10 — metrics exported but no alerts or dashboards
- **Runbooks/incident response:** 0/5 — none documented
- **Redis persistence:** 0/5 — no RDB/AOF
- **Overall DR score:** **2/50** — extremely high risk

---

## 17.6 Recommendations — Immediate (Before Any Production Deployment)

| Priority | Action | Effort |
|---|---|---|
| **P0** | **Configure PostgreSQL automated backups** — set up `pg_dump` cron job or cloud provider automated backup (e.g., AWS RDS automated backups, hourly or daily); configure `wal_level = minimal` and `archive_mode = on` if PITR is needed | 1-2 hours |
| **P0** | **Enable Redis persistence** — add a volume for Redis data directory; configure `save` (RDB) or `appendonly yes` (AOF) in Docker Compose; or use a managed Redis service (Redis Labs, AWS ElastiCache) with built-in persistence | 30 min |
| **P0** | **Define and document restore procedure** — write step-by-step restore from backup for both PostgreSQL and Redis; test the restore in a staging environment | 2-3 hours |
| **P0** | **Configure monitoring and alerting** — set up Prometheus + Grafana (or cloud equivalent) to scrape `/metrics`; define alerts for: database connection pool exhaustion, Redis connection failures, job backlog > 50, AI error rate > 5% | 2-4 hours |
| **P0** | **Write incident response runbooks** — document procedures for: database restore, Redis recovery, prolonged downtime, security breach notification to clinics | 2-3 hours |
| **P1** | **Enable Sentry/DNS error tracking** — if not already provided, configure Sentry for crash and error tracking with source map integration | 30 min |
| **P1** | **Configure OpenTelemetry** — enable tracing for request correlation across API, database, Redis, and AI provider calls | 1-2 hours |
| **P2** | **Add request ID propagation** — generate correlation ID per request; propagate through logs, metrics, and traces for end-to-end debugging | 1-2 hours |
| **P2** | **Set up regular backup verification** — monthly `pg_dump | pg_restore` dry-run; verify Redis RDB snapshot integrity | 1 hour/month |

---

## 17.7 Observability Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P0** | **Set up automated PostgreSQL backups** with verified restore procedure | 1-2 hours |
| **P0** | **Enable Redis persistence or use managed Redis** | 30 min |
| **P0** | **Define documented restore procedures** and test in staging | 2-3 hours |
| **P0** | **Configure Prometheus alerting** for critical failure modes | 2-4 hours |
| **P1** | **Enable Sentry error tracking** (if DSN available) | 30 min |
| **P1** | **Enable OpenTelemetry tracing** for request correlation | 1-2 hours |
| **P2** | **Add request ID propagation** across all service boundaries | 1-2 hours |
| **P3** | **Write incident response runbooks** for common failure scenarios | 2-3 hours |

---

## 17.8 Confidence Assessment

- **Confirmed:** Application-level logging, metrics, and Sentry/OpenTelemetry are configured (conditionally); Fastify logger redaction works; HTTP metrics exported via `/metrics`.
- **Suspected:** No automated backups exist; Redis has no persistence; no restore procedures; no monitoring dashboards or alerting; no runbooks.
- **Unverified:** Actual database size; actual Redis data volumes; whether any manual backups have ever been performed; actual monitoring infrastructure availability.

**Overall:** The backup and disaster recovery infrastructure is essentially non-existent. This is a critical operational risk — the system cannot be reliably recovered after data loss. **This must be remediated before any production deployment.**

---

## 17.9 Next Phase

Proceed to Phase Q — Performance and Capacity, which will evaluate whether the system can handle expected clinic workloads and what performance benchmarks exist.</think>
<tool_call>
<function=write>
<parameter=content>
# CuraVet — Phase Q: Performance and Capacity

## Executive Summary

Performance testing was not executed during this audit. The system has not been benchmarked against expected clinic workloads. The architecture suggests reasonable capacity for small-to-medium veterinary clinics (single-tenant or low-count multi-tenant), but critical capacity questions remain: unknown connection pool sizing, unknown Redis/BullMQ throughput, unknown AI provider latency and cost per interaction, and no load testing. The API uses Fastify (known for good performance) and Prisma with PostgreSQL, which can scale well with proper connection pooling and indexing. However, without concrete benchmarks, it is impossible to verify that the system will meet clinic requirements during peak times (multiple simultaneous bookings, WhatsApp reminders, AI-assisted consultations). **Performance and capacity must be verified before deployment to avoid poor clinic experience or system downtime.**

---

## 18.1 API Performance Baseline (Unverified)

| Metric | Expected | Actual (audit scope) | Notes |
|---|---|---|---|
| **Average request latency** | Not measured | Not measured | Fastify is performant; typical Node.js APIs see 20-100ms for simple queries, 100-300ms for DB-backed operations |
| **95th percentile latency** | Not measured | Not measured | Critical for UI responsiveness; may spike under load or with slow DB queries |
| **Requests/second (throughput)** | Not measured | Not measured | Depends on DB latency, business logic complexity, Redis availability |
| **Concurrent connections** | Not measured | Not configured | `max_connections` in PostgreSQL (default 100); connection pool limit not set in Prisma |
| **Startup time** | Not measured | Not measured | Docker image `node dist/server.js` cold start ~1-3s; health check may time out before app ready |

### 18.1.1 Database Query Performance

Prisma generates SQL queries from the schema. Key observations:

- ✅ **Composite unique constraints** with `tenantId` on `Booking`, `Pet`, `Client` — good for query planning and preventing cross-tenant data leaks
- ✅ **Indexes** likely created by Prisma for `id` (primary key) and `tenantId` (foreign key) on most tables
- ⚠️ **No query profiling** was performed during audit; slow queries may not be evident without `EXPLAIN ANALYZE`
- ⚠️ **Monetary fields use `Float`** (Phase E E-008) — rounding errors may compound in financial calculations; indexing on `Float` is possible but rounding semantics may cause incorrect results

### 18.1.2 Indexing Status

| Table | Indexes (expected from Prisma) | Gaps |
|---|---|---|
| `Client` | `id` (PK), `tenantId` (FK) | No index on `phone` — may be slow for phone-based lookups (common in clinic workflows) |
| `Pet` | `id` (PK), `tenantId` (FK), `ownerId` (FK) | No index on `tattooNo` — may be slow for tattoo-based searches; unique constraint may exist but not indexed |
| `Booking` | `id` (PK), `tenantId` (FK) | No index on `status` — filtering by `status` (e.g., "pending", "confirmed") may be slow; no index on `scheduledAt` — date-range queries may be slow without covering index |
| `MedicalRecord` | `id` (PK), `tenantId` (FK), `bookingId` (FK) | No index on `createdAt` — historical record queries may be slow |
| `Vaccination` | `id` (PK), `tenantId` (FK) | No additional indexes beyond PK/FK |
| `Appointment` | `id` (PK), `tenantId` (FK) | See `Booking` — may be the same table; same gaps |

### 18.1.3 Connection Pool

- Prisma connection pool is configured via `DATABASE_URL` and environment variables (`prisma` `connectionPool` block not observed in `schema.prisma`; defaults used)
- `connection_pool.max` — not explicitly set; defaults to PostgreSQL's `max_connections` (typically 100)
- `connection_pool.min` — not set; Prisma connects on first use and may hold idle connections
- No connection pool monitoring or alerting (Phase P)
- **Risk:** Under load, connection pool may be exhausted, causing `P2003` (connection limit reached) errors

---

## 18.2 BullMQ and Job Processing Capacity

### 18.2.1 Job Types and Expected Volume

| Job Type | Description | Estimated Frequency |
|---|---|---|
| **Review jobs** | AI review / follow-up processing | Unknown; depends on AI interaction volume |
| **WhatsApp reminder jobs** | Send appointment reminder via WhatsApp | 1 per appointment (scheduled hours before) |
| **SMS reminder jobs** | Send appointment reminder via SMS | 1 per appointment (scheduled hours before); default `'none'` |
| **Payment reminder jobs** | Stripe payment link expiry / pending status follow-up | Unknown; depends on payment volume |
| **Background cleanup** | Any periodic maintenance | Unknown |

### 18.2.2 Concurrency and Worker Configuration

- **BullMQ workers** — 5 job types, each may have its own worker process
- **Worker count** — not explicitly configured; defaults to concurrency of the BullMQ `Worker` instance
- **No rate limiting** on job addition (global 300/min from Phase J applies, but no per-queue limit)
- **No dead-letter queue** — failed jobs are retried according to BullMQ retry config; no separate queue for permanently failed jobs
- **Redis bottleneck** — all job state, locks, and progress tracking goes through Redis; Redis single-threaded nature may limit throughput under extreme load

### 18.2.3 Expected Throughput (Unverified)

| Metric | Estimate | Confidence |
|---|---|---|
| **Jobs/second** | Unknown | Very low confidence — depends on job type (WhatsApp API call vs. simple DB update) |
| **Concurrent appointments** | Unknown | Depends on DB connection pool, Prisma transaction speed, WhatsApp API rate limits |
| **AI interactions/second** | Unknown | Very low confidence — depends on AI provider (OpenAI/Groq/OpenRouter), API key rate limits, prompt complexity |
| **WhatsApp messages/minute** | Unknown | WhatsApp Business API has per-message rate limits (typically 1 per second per template, higher for free-form); may block under high volume |

### 18.2.4 Memory and Resource Usage

- **Not measured** during audit. Node.js process memory depends on:
  - Number of concurrent BullMQ workers
  - Size of job data (booking details, patient records, AI conversation history)
  - Redis memory usage (RDB snapshots, AOF logs)
- **No resource limits** set in docker-compose (Phase O P1); containers may consume all available host memory under load

---

## 18.3 AI Provider Performance and Cost

### 18.3.1 Provider Configuration

| Provider | API Key | Model | Status |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | configurable via `AI_MODEL` | Optional |
| Groq | `GROQ_API_KEY` | configurable via `AI_MODEL` | Optional |
| OpenRouter | `OPENROUTER_API_KEY` | configurable via `AI_MODEL` | Optional |

### 18.3.2 Latency (Unverified)

- **Typical LLM API latency:** 200ms - 2s per request (depends on model, load, network)
- **Context window size:** varies by model; CuraVet's conversation history may grow unbounded (Phase G G-004 leakage issue)
- **Rate limits:** per-API-key limits apply (e.g., OpenAI GPT-4o mini: ~10rpm, GPT-4: ~5rpm; Groq: higher throughput)

### 18.3.3 Cost Per Interaction (Unverified)

- **Not calculated** during audit. Cost depends on:
  - Model selected (token pricing: input vs. output)
  - Average conversation length (messages × tokens per message)
  - Provider chosen
- **Tunisia clinic context:** cost per consultation may be a fraction of typical veterinary visit cost, but unlimited interactions could accumulate significant expense

---

## 18.4 Load Testing Status

**None executed.** No `k6`, `artillery`, `locust`, or `wrk` benchmarks were run during this audit. The following remain untested:

- API under simultaneous booking creation (concurrent `POST /api/bookings`)
- API under WhatsApp/SMS reminder dispatch (BullMQ queue flooding)
- API under AI interaction load (concurrent LLM requests)
- Database under complex query load (multi-tenant filtering, date-range searches)
- Redis under concurrent job state access

---

## 18.5 Scalability Assessment

| Dimension | Status | Notes |
|---|---|---|
| **Horizontal scaling (multiple API instances)** | ⚠️ Possible but untested | Fastify + Prisma + BullMQ can scale horizontally if: (a) PostgreSQL connection pool is shared/pooled across instances, (b) Redis is centralised (already the case in compose), (c) BullMQ workers connect to same Redis, (d) No in-memory state outside DB/Redis |
| **Vertical scaling (larger instances)** | ✅ Straightforward | Increase Docker resource limits; PostgreSQL `max_connections`; Redis memory |
| **Database sharding** | ❌ Not considered | Multi-tenant architecture uses `tenantId` but no sharding strategy; all tenants in one PostgreSQL instance |
| **Read replicas** | ❌ Not configured | Prisma supports read replicas via `DATABASE_URL` connection strings; not configured |
| **Cache layer** | ⚠️ Partial | HTTP metrics exported; no application-level caching (Redis could be used for session/cache but not observed) |

---

## 18.6 Performance Findings Summary

| Area | Status | Key Issues |
|---|---|---|
| **API benchmarks** | ❌ None executed | No load testing; no performance baselines |
| **Database indexing** | ⚠️ Partial | Composite unique keys with `tenantId` are good; missing indexes on `phone`, `tattooNo`, `status`, `createdAt` may cause slow queries under load |
| **Connection pooling** | ⚠️ Default Prisma settings | No explicit pool sizing; may exhaust under load; `max_connections` not configured |
| **BullMQ throughput** | ⚠️ Unevaluated | No job type timing; no worker concurrency config; no rate limits; no DLQ |
| **AI provider latency/cost** | ❌ Not measured | No benchmarking; depends on provider and model choice |
| **Redis performance** | ⚠️ Not measured | No throughput testing; no persistence (Phase P); single-threaded may bottleneck |
| **Horizontal scalability** | ⚠️ Conditional | Possible with centralized Redis and shared DB; untested; no connection pool coordination strategy |
| **Read replicas** | ❌ Not configured | Prisma supports but not set up |
| **Application caching** | ❌ None observed | No Redis-based caching beyond BullMQ job state |

---

## 18.7 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P0** | **Run API load tests** — use `wrk` or `k6` to benchmark: concurrent bookings, API request latency, 95th percentile under expected clinic load; test WhatsApp reminder dispatch concurrency | 2-4 hours |
| **P0** | **Verify database indexing** — run `EXPLAIN ANALYZE` on critical queries (booking by patient, filter by status, date-range searches); add missing indexes on `phone`, `tattooNo`, `status`, `createdAt` if queries are slow | 1-2 hours |
| **P0** | **Configure Prisma connection pool** — set `connectionPool.max` and `connectionPool.min` in `schema.prisma` or via `DATABASE_URL` parameters; monitor for connection exhaustion | 30 min |
| **P1** | **Benchmark AI provider latency and cost** — measure average response time and token cost per interaction for each configured provider/model; establish SLOs (e.g., < 2s latency, < $0.01 per interaction) | 2-3 hours |
| **P1** | **Configure BullMQ worker concurrency** — set appropriate `concurrency` per job type based on API rate limits (WhatsApp: ~1 msg/sec per template); add dead-letter queue for failed jobs (Phase J remediation) | 30 min |
| **P1** | **Set Redis resource limits** — add memory limits in docker-compose; configure maxmemory-policy (no-keysample, allkeys-lru) | 30 min |
| **P2** | **Evaluate read replicas** — if clinic growth expected, configure Prisma read replica connection for read-heavy workloads (calendar view, client lists) | 1-2 hours |
| **P2** | **Add application-level caching** — use Redis for: session data, frequently accessed clinic settings, calendar date ranges, to reduce DB load | 2-4 hours |
| **P3** | **Plan horizontal scaling** — if multiple API instances needed, design connection pool sharing strategy; consider session affinity or distributed session store | 2-4 hours |

---

## 18.8 Confidence Assessment

- **Confirmed:** Fastify is a performant framework; Prisma composite unique keys with `tenantId` support good query planning; Docker resource limits would constrain (or enable) scaling; the architecture is capable of scaling with proper configuration.
- **Suspected:** No performance benchmarks exist; database indexing may be suboptimal for clinic workflows (phone lookups, status filters); connection pool defaults may not match expected load; AI provider costs and latency are unknown.
- **Unverified:** Actual clinic workload patterns (how many bookings per day? how many AI interactions?); actual Redis throughput; actual API request patterns under concurrency.

**Overall:** The system has a solid architectural foundation for performance, but **no performance benchmarks exist** and several capacity questions remain unanswered. **Load testing and indexing verification are required before production deployment.**

---

## 18.9 Next Phase

Proceed to Phase R — Test Critical Failure Scenarios, which will evaluate the system's behavior under fault conditions (database failure, Redis unavailability, API errors, AI failures).