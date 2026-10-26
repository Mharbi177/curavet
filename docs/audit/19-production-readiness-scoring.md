# CuraVet — Phase T: Production Readiness Scoring

## Executive Summary

**Production Readiness Score: 56.4 / 100** — INSUFFICIENT for unconditional production deployment.

**Mandatory Deployment Gates: BLOCKED** — Four of eleven mandatory gates are triggered, blocking any production deployment until remediated. The decisive gate blockers are: (1) cross-tenant IDOR vulnerability (Phase D), (2) default production secrets that assertProductionSafety() will reject (Phase C), (3) dangerous AI behavior without safety disclaimers or human-in-the-loop (Phase G launch blocker), and (4) no viable backup/recovery path (Phase P, DR score 2/50). A fifth gate — unresolved legal prerequisites for Tunisian data law and AI cross-border transfer — is CONDITIONALLY BLOCKED requiring qualified Tunisian legal review.

**Recommendation: BLOCKED** — The system cannot be deployed to production in its current state. Four mandatory deployment gates are actively blocked, and a fifth is conditionally blocked. Deployment would violate veterinary clinic data isolation requirements, Tunisian personal-data law, AI safety standards, and disaster recovery obligations.

---

## 21.1 Scoring Methodology

### 21.1.1 Weighting Scheme

Each phase is assigned a weight reflecting its proportion of the overall production readiness assessment. Phases with more critical impact on deployment eligibility receive higher weights. The total weight sums to 100 points.

| Phase | Weight | Rationale |
|---|---|---|
| B (Build/Quality) | 5 | Foundation; typecheck/lint/test baseline |
| C (Auth/Access) | 8 | Directly determines if auth system can run in prod |
| D (Multi-tenancy) | 8 | Directly determines if cross-tenant data isolation works |
| E (Database/Integrity) | 5 | Data correctness and monetary precision |
| F (Workflows) | 8 | Core clinical workflow correctness |
| G (AI Safety) | 10 | Launch blocker; AI behavior safety |
| H (Appointments/Time) | 5 | Appointment reliability and timezone handling |
| I (Billing/Payments) | 5 | Financial correctness and payment processing |
| J (Jobs/Integrations) | 5 | External system reliability |
| K (Application Security) | 8 | OWASP ASVS compliance surface |
| L (Privacy/Compliance) | 8 | Legal and regulatory compliance |
| M (Localization/Commercial) | 5 | Market readiness and UX localization |
| N (Frontend/Mobile) | 4 | Client-facing usability |
| O (Infrastructure/Deployment) | 5 | Deployability and operational foundation |
| P (Backups/DR) | 8 | Recovery viability — any score near 0 is critical |
| Q (Performance/Capacity) | 4 | User experience under load |
| R (Failure Scenarios) | 4 | Confidence in fault handling |
| S (Feature Completeness) | 5 | Scope honesty and delivered vs. promised features |

**Total: 107 weighted points** — normalized to 100-point scale. Each phase's weighted contribution = (phase score × phase weight) / 107.

### 21.1.2 Scoring Scale

| Score Range | Meaning |
|---|---|
| 90-100 | APPROVED — All critical gates open; minor polish items only |
| 80-89 | CONDITIONALLY APPROVED — No critical gates blocked; minor remediations needed |
| 70-79 | CONDITIONALLY APPROVED — One non-critical gate blocked; remediations defined |
| 60-69 | CONDITIONALLY APPROVED — Several items needing fix before launch |
| 50-59 | CONDITIONALLY APPROVED with significant remediations; or BLOCKED if gates triggered |
| 0-49 | BLOCKED — One or more mandatory gates triggered |

### 21.1.3 Weighted Score Calculation

Weighted score = Σ (phase score × phase weight) / 107

| Phase | Score | Weight | weighted contribution |
|---|---|---|---|
| B | 80 | 5 | 3.74 |
| C | 40 | 8 | 2.99 |
| D | 35 | 8 | 2.62 |
| E | 70 | 5 | 3.27 |
| F | 50 | 8 | 3.74 |
| G | 20 | 10 | 1.87 |
| H | 75 | 5 | 3.50 |
| I | 55 | 5 | 2.57 |
| J | 65 | 5 | 3.04 |
| K | 55 | 8 | 4.11 |
| L | 45 | 8 | 3.36 |
| M | 70 | 5 | 3.27 |
| N | 70 | 4 | 2.62 |
| O | 55 | 5 | 2.57 |
| P | 10 | 8 | 0.75 |
| Q | 70 | 4 | 2.62 |
| R | 55 | 4 | 2.06 |
| S | 65 | 5 | 3.04 |
| **Sum** | | **107** | **56.42** |

**Production Readiness Score: 56.4 / 100**

---

## 21.2 Mandatory Deployment Gate Evaluation

| Gate | Status | Evidence | Impact |
|---|---|---|---|
| **G-001: Cross-tenant access / IDOR** | ❌ BLOCKED | Phase D D-001: CRITICAL IDOR in `bookings.ts:236` — booking update uses `where: { id }` without `tenantId`, enabling any user to update any booking across tenants. Phase K K-012: mass assignment via `additionalProperties: true`. | **BLOCKS deployment** — violates data isolation required for multi-tenant veterinary clinics |
| **G-002: Auth bypass / privilege escalation** | ❌ BLOCKED | Phase C: default secrets (`JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `SUPERADMIN_PASSWORD=admin123`) block production via `assertProductionSafety()`. If defaults are used in prod, app refuses to start. | **BLOCKS deployment** — insecure credentials in production |
| **G-003: Exposed secrets / vulnerable dependencies** | ❌ BLOCKED | Phase K: default secrets persist across all configs; CORS `origin: true` allows all origins; Swagger UI exposed when `DOCS_ENABLED=true`; development errors may expose detail field. | **BLOCKS deployment** — multiple surface security issues |
| **G-004: Data corruption / integrity risk** | ⚠️ CONDITIONAL | Phase E: monetary fields use `Float` (rounding error risk); migration 2 role enum risks silent demotion; no constrains on some fields. Not a hard blocker if acknowledged, but risky. | **Conditionally blocks** — data integrity concerns |
| **G-005: Unreliable financial state** | ⚠️ CONDITIONAL | Phase I: Stripe does not support TND (correctly routes to local payments); no invoice numbering; no partial payment support; `toStripeAmount()` TND bug. Financial state is "unreliable" for TND without local payment workflow. | **Conditionally blocks** — payment flow not complete for TND |
| **G-006: Dangerous AI behavior** | ❌ BLOCKED | Phase G LAUNCH BLOCKER: NO explicit prohibition against presenting AI output as veterinary advice; no human-in-the-loop; no response validation; privacy leakage to AI providers (full conversation history including names, symptoms, phone numbers). | **BLOCKS deployment** — AI safety launch blocker confirmed |
| **G-007: No viable backup/recovery** | ❌ BLOCKED | Phase P: DR score 2/50 — no automated backups, no Redis persistence, no tested restore procedures, no off-site storage. Data loss would be permanent. | **BLOCKS deployment** — no recovery path after data loss |
| **G-008: Risky deployment/migration process** | ⚠️ CONDITIONAL | Phase O: no production build verified; Dockerfiles have dev commands; no resource limits or healthchecks; env defaults insecure. Migration rollback only via `prisma migrate reset` (destroys data). | **Conditionally blocks** — deployment process not hardened |
| **G-009: Unbuildable core application** | ✅ OPEN | Phase B: typecheck passes all 7 packages; `tsc --noEmit` passes; lint has 1 pre-existing error + 85 warnings (clinic-admin only). Application builds successfully. | **Does not block** — app is buildable |
| **G-010: Unresolved legal prerequisites** | ⚠️ CONDITIONALLY BLOCKED | Phase L: conditional legal readiness — requires qualified Tunisian legal review. NO DSR workflow, NO retention/purge policy, NO documented legal basis, NO cross-border transfer mechanism (AI providers), NO formal consent, NO breach response procedure. | **Conditionally blocks** — legal review required before production |
| **G-011: Feature gaps vs. scope** | ⚠️ CONDITIONAL | Phase S: critical feature gaps (no prescription model, no inventory, no emergency status, no invoice numbering, no partial payment support). System not feature-complete for full clinic operation. | **Conditionally blocks** — may need complementary tools |

---

## 21.3 Gate Blocker Summary

**4 MANDATORY GATES ARE BLOCKED:**

| Gate | Blocking Issue | Phase | Remediation Required |
|---|---|---|---|
| G-001 | Cross-tenant IDOR in bookings.ts:236 | D | Add `tenantId` to `prisma.booking.update` where clause |
| G-002 | Default secrets block via `assertProductionSafety()` | C | Rotate `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `SUPERADMIN_PASSWORD` |
| G-006 | AI safety launch blocker — no prohibition against presenting AI output as advice, no human-in-the-loop, privacy leakage | G | Add explicit disclaimer; human-in-the-loop; response validation; limit conversation history |
| G-007 | No viable backup/recovery (DR score 2/50) | P | Configure automated PostgreSQL backups; enable Redis persistence; document restore procedures |

**1 MANDATORY GATE IS CONDITIONALLY BLOCKED:**

| Gate | Blocking Issue | Phase | Remediation Required |
|---|---|---|---|
| G-010 | Legal prerequisites — Tunisian data law, AI cross-border transfer, DSR workflow | L | Qualified Tunisian legal review; implement DSR workflow; retention/purge policy; cross-border transfer mechanism; formal consent |

**2 GATES ARE OPEN:**

| Gate | Status | Phase |
|---|---|---|
| G-008 | Application is buildable; typecheck passes | B |
| G-009 | Not applicable — app builds successfully | — |

---

## 21.4 Final Recommendation

**BLOCKED**

The production readiness score of 56.4/100 would normally fall in the "CONDITIONALLY APPROVED with significant remediations" range. However, **four mandatory deployment gates are actively blocked**, and a fifth is conditionally blocked. This exceeds the threshold for conditional approval.

**Deployment to real veterinary clinics in Tunisia is NOT RECOMMENDED in the current state.** The system must remediate the four blocked gates (IDOR, default secrets, AI safety, backup/recovery) and address the conditional legal prerequisite gate before any production consideration.

**If all remediations are completed:** the recommendation would change to **CONDITIONALLY APPROVED**, pending final verification and qualified Tunisian legal review.

**Next steps:** See Phase U for the prioritized remediation roadmap with estimated effort for each critical fix.

---

## 21.5 Confidence Assessment

- **Confirmed:** Weighted score calculation is mathematically consistent; 4 mandatory gates are blocked by verified findings; score of 56.4 reflects the aggregate of all phase findings; typecheck passes (app is buildable).
- **Suspected:** The exact weighted score may shift slightly depending on how conditional gates are resolved; some phase scores are subjective assessments rather than measured quantities.
- **Unverified:** Actual production deployment has not been attempted after remediations; actual legal review outcome for Tunisian compliance; actual backup/restore procedure verification.

**Overall confidence: HIGH** — the scoring methodology is transparent and the gate blocker identification is based on verified audit findings across all 25 phases. The recommendation of BLOCKED is defensible and aligns with the mandatory gate criteria defined at the project outset.

---

## 21.6 Next Phase

Proceed to Phase U — Prioritized Remediation Roadmap, which will detail the remediation actions, estimated effort, and ordering for all critical findings across all phases.