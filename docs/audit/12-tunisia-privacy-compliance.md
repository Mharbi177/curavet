# CuraVet — Phase L: Privacy and Tunisian Compliance Readiness

## Executive Summary

This audit performs a technical compliance-readiness review, not a legal certification. The system processes personal data including owner names/contact info, addresses, appointment history, payment/billing records, staff information, messages/communication metadata, and identifiable attachments/exports. The data is stored in PostgreSQL with Prisma ORM, partitioned by `tenantId` for multi-tenancy. Redis is used for session management and BullMQ queue backing. Third-party AI providers (OpenAI/Groq/OpenRouter) receive data including conversation history, client identifiers, pet names, symptoms, and diagnoses. Stripe processes payment data for supported currencies (not TND). The system has technical controls (tenant isolation, data minimization in some areas, export capabilities via the API) but several gaps exist: no formal data subject request (DSR) workflow, no explicit data retention/purge policy in the codebase, no documented legal basis for each data category, and AI provider data flows cross border (to US/third-party providers) without explicit user consent mechanisms. The system is technically capable of handling individual clinic data isolation but lacks the procedural and policy infrastructure for Tunisian personal-data law compliance.

---

## 12.1 Tunisian Legal Framework Context

### 12.1.1 Organic Law No. 2004-63 on Personal Data Protection

This is Tunisia's foundational data protection law, establishing the **INPDP** (Instance Nationale de la Protection des Données — National Data Protection Authority). Key principles relevant to CuraVet:

- **Lawfulness, fairness, and transparency** — Data must be collected for specified, explicit purposes
- **Limitation of purpose** — Data may only be used for the purposes specified at collection
- **Data minimization** — Only data necessary for the specified purpose may be collected
- **Accuracy** — Data must be kept accurate and up to date
- **Storage limitation** — Data may not be kept longer than necessary for the purpose
- **Integrity and confidentiality** — Appropriate technical and organizational measures must be ensured
- **Accountability** — Data controller must demonstrate compliance

**Data subject rights** under this law include:
- Right to access their personal data
- Right to rectification (correction) of inaccurate data
- Right to erasure (deletion) under certain conditions
- Right to data portability
- Right to object to processing

### 12.1.2 Law No. 97-47 and Veterinary Profession Code

Law No. 97-47 governs the veterinary profession in Tunisia. The veterinary professional ethics code adds clinical confidentiality obligations that overlap with but are distinct from personal-data protection law. Key considerations:

- **Veterinary records** are subject to confidentiality obligations
- **Client data** (owner + patient) must be protected per professional ethics
- **Medical information** (symptoms, diagnoses, treatment plans) has heightened sensitivity

### 12.1.3 Electronic Commerce and Invoicing Requirements

- Invoicing must include specific elements (vendor info, client info, date, description, amounts, taxes)
- Electronic records must be retainable for audit purposes
- Cross-border data flows for payment processing (Stripe) must comply with applicable regulations

---

## 12.2 Personal Data Inventory

### 12.2.1 Data Categories Processed by CuraVet

| Data Category | Source | Processed For | Legal Basis (estimated) | Sensitivity |
|---|---|---|---|---|
| **Owner names** | Client registration, WhatsApp messages | Appointment booking, communications, invoicing | Contractual / Consent | Medium |
| **Owner contact info** (phone, email, address) | Client registration, WhatsApp metadata | Appointment booking, reminders, notifications, invoicing | Contractual / Consent | High (PII) |
| **Owner Instagram ID** | Instagram integration | Client identification, messaging | Contractual | Medium |
| **Appointment history** | Booking records | Analytics, reminders, follow-up care | Contractual | Medium |
| **Payment/billing records** | Stripe webhooks, local payment recording | Revenue, tax compliance, invoicing | Contractual / Legal | High (financial PII) |
| **Staff information** | Admin dashboard | HR, scheduling, accountability | Employment | Medium |
| **Messages and communication metadata** | WhatsApp/Instagram messages, conversations | Patient care, records, billing | Contractual | High (communication privacy) |
| **Identifiable attachments** | Media sent via WhatsApp/Instagram | Patient records, care history | High (context-dependent) |
| **AI prompts and conversation history** | Inbound messages processed by LLM | AI-assisted triage and booking | Consent / Contractual | High (medical + personal) |
| **Pet names, species, breed** | Pet registration, medical records | Clinical care, appointment matching | Contractual | Medium |
| **Medical symptoms and diagnoses** | Medical records, vaccination records | Clinical care, treatment planning, AI triage | Medical / Highly sensitive |
| **Treatment plans** | Medical records | Clinical continuity | Medical | High |
| **Vaccination records** (disease targets, batch numbers) | Vaccination logging | Public health, clinical records | Medium |
| **Owner identifiers** (microchip No., tattoo No.) | Pet registration | Patient identification, tracking | Medium (can be PII) |
| **Payment method** (especes, cheque, TPE, virement, card, stripe) | Payment recording | Revenue, compliance | Medium |
| **Currency and amounts** | All payment transactions | Invoicing, tax reporting | Financial | Medium |

### 12.2.2 Data Subjects

- **Primary:** Pet owners (natural persons, Tunisian residents or otherwise)
- **Secondary:** Veterinary staff (employees, whose data includes name, email, phone, role)
- **Tertiary:** Platform users (super-admin, clinic admins — their data is processed by the platform)

### 12.2.3 Data Controllers

- **Platform-level:** CuraVet SAS (SaaS owner, multi-tenant controller)
- **Clinic-level:** Each Tunisian clinic using CuraVet is a co-controller for its own tenant data

---

## 12.3 Data Flow Mapping

### 12.3.1 Collection Flow

1. **Client registration** (frontend → API → Prisma → PostgreSQL):
   - Owner name, phone, email, Instagram ID
   - Pet name, species, breed, birth date, medical notes
   - Protected by `tenantId` isolation

2. **WhatsApp/Instagram inbound messages** (Meta → API webhook → `processInboundMessage()` → Prisma → PostgreSQL + AI provider):
   - Message content, sender phone/ID
   - Language detection → updates client `languagePreference`
   - AI provider receives: full conversation history, client phone, pet names, symptoms, diagnosis (if previously recorded), clinic name, service menu
   - **Cross-border:** Data sent to OpenAI/Groq/OpenRouter (likely US-based)

3. **Appointment booking** (frontend → API → Prisma transaction → PostgreSQL + BullMQ):
   - Date, time, service, staff, client, pet
   - Prices, currency (TND or supported currency)
   - Payment link if high-value

4. **Medical record creation** (frontend → API → Prisma transaction → PostgreSQL):
   - Symptoms, diagnosis, treatment plan
   - Weight at visit, temperature
   - Linked to pet and booking
   - Linked doctor (user ID)

5. **Payment recording** (Stripe webhook or local payment API → Prisma → PostgreSQL):
   - Amount, currency, method, status
   - Linked to booking and/or client
   - Stripe: `stripeSessionId` (unique), `paymentUrl`, `stripePaymentIntentId`

6. **AI-assisted triage** (user message → `processInboundMessage()` → `CuraVetAgent.processMessage()` → OpenAI/Groq/OpenRouter):
   - System prompt + conversation history + user message
   - Tools called: `check_availability`, `book_appointment`, `get_schedule_and_appointments`
   - AI response includes recommendation, possible booking, payment link

---

## 12.4 Storage and Processing

### 12.4.1 Database Storage

- **PostgreSQL** via Prisma ORM
- All personal data tables have `tenantId` for multi-tenant isolation
- Encryption at rest: Not explicitly configured in Prisma or PostgreSQL settings visible in the codebase — relies on PostgreSQL-level `pgcrypto` or OS-level encryption
- **No field-level encryption** observed — data is stored in plaintext within the database

### 12.4.2 Queue and Session Storage

- **Redis** for:
  - Refresh-token whitelist (JTI-based revocation)
  - BullMQ queue backend (background jobs)
- **No encryption** specified for Redis data in transit or at rest
- **TLS** not configured in the default Redis connection (redis.ts:30-35 uses discrete host/port/password, no `REDIS_URL` with `rediss://`)

### 12.4.3 Third-Party Processing

- **AI providers** (OpenAI, Groq, OpenRouter): Receive full conversation context including personal data. Located primarily in the US.
- **Stripe** (for supported currencies): Receives payment-related data (amount, currency, stripeSessionId, metadata {tenantId, bookingId}). Stripe is certified under EU-US Privacy Shield (as of 2023) and has data processing agreements available.
- **Meta** (WhatsApp/Instagram): Receives and processes messages per Meta's terms. The system uses Meta's Graph API v22.0.
- **SendGrid** (email): Receives email content if SendGrid is used for notifications.

---

## 12.5 Technical Compliance Gaps

### 12.4.1 Data Subject Request (DSR) Workflow

**No implemented workflow** for handling data subject requests (access, rectification, erasure, portability). 

- **Right to access:** A clinic owner or patient could theoretically request their data via the API, but there is no dedicated endpoint for `GET /api/me/data` or similar. The `GET /api/tenants/me/*` endpoints return tenant-Scoped data, but not a consolidated export of all personal data.
- **Right to rectification:** No API endpoint to update or correct personal data beyond the existing update paths (client update, pet update, etc.). These paths have broader scope than just "rectification" and may overwrite other data.
- **Right to erasure:** No "delete my data" endpoint. Deletion would need to be done through the existing `deleteClient`, `deleteService`, etc., which have cascading effects and dependency checks (e.g., `deleteClient` checks for upcoming bookings).
- **Right to data portability:** No structured export (JSON/CSV) of a user's complete data set.

### 12.4.2 Data Retention and Purge Policy

**No automated retention policy** observed in the codebase:

- **Booking records:** No `retentionDate` or `autoDelete` flag. Bookings persist indefinitely unless manually cancelled/deleted.
- **Medical records:** No retention period configured. Persist for the life of the tenant.
- **Payment records:** No retention period. Persist indefinitely.
- **Conversation history:** No TTL or auto-archival. Persists indefinitely.
- **Usage records:** Have `@unique([tenantId, monthYear])` and seem intended for monthly aggregation, but no automatic cleanup.

**Risk:** The system may retain personal data longer than required by Tunisian law, especially if no deletion procedures are established.

### 12.4.3 Consent and Authorization

**No formal consent mechanism** observed:

- **Owner consent:** When a client registers via WhatsApp, there is no explicit "I consent to data processing" step. The registration collects data implicitly.
- **AI data processing:** No opt-in/opt-out for AI provider data processing. If `AI_PROVIDER` is configured, all inbound messages are processed through the LLM — no per-client opt-out.
- **Marketing/SMS:** `remindersEnabled`, `reviewsEnabled`, `upsellEnabled`, `waitlistEnabled` flags exist on the `Tenant` model, but these are platform configuration flags, not per-consent records.

### 12.4.4 Data Minimization

**Partial compliance:**

- **Collected:** Owner name, phone, appointment history, payment records, medical symptoms/diagnoses/treatment plans, pet details
- **Not collected:** No obvious over-collection; all fields serve a clear operational purpose (booking, care, billing)
- **Could be minimized:** AI prompts send the full conversation history; only the current message and perhaps the last few exchanges would be needed for most triage scenarios

### 12.4.5 Cross-Border Data Transfers

**Confirmed:** Personal data is transferred to third-party AI providers (OpenAI/Groq/OpenRouter), likely located outside Tunisia (potentially US). 

- **No adequacy decision** or Standard Contractual Clauses (SCC) apparent in the codebase
- **No user notification** or consent mechanism for cross-border transfers
- **Mitigation:** The AI can be disabled per-tenant (`aiProvider: 'auto'` with no key configured → no AI processing). But if enabled, data crosses borders without documented legal basis.

### 12.4.6 Security of Processing

**Technical measures present:**
- `tenantId`-based isolation (most queries scoped by tenant)
- Password hashing with scrypt
- JWT with HS256 + Redis revocation
- Helmet security headers
- Rate limiting
- Redis connection with `lazyConnect` and error fallback

**Technical gaps:**
- No field-level encryption for particularly sensitive data (medical symptoms, diagnoses)
- No Redis TLS configuration
- No data-at-rest encryption configuration visible
- Error messages in dev mode may leak data (Phase K, K-001)

---

## 12.7 Compliance Evidence Matrix

| Requirement | Evidence | Gap | Responsible Reviewer | Verification Needed |
|---|---|---|---|---|
| **Data classification** | Personal data inventory identified (this section) | None — inventory is comprehensive for the codebase | Lead auditor | Verify against actual deployed data |
| **Legal basis for processing** | Not documented in code | ⚠️ No legal basis documented for each data category | Lead auditor | Consult legal counsel (Tunisian data protection law) |
| **Data subject rights workflow** | No endpoint for DSRs; export possible via API aggregation | ❌ No dedicated DSR workflow | Lead auditor | Implement DSR endpoints; test with synthetic requests |
| **Retention and purge policy** | No automatic retention/purge; data persists indefinitely | ❌ No retention policy | Lead auditor | Define retention periods; implement purge jobs or manual process |
| **Consent mechanism** | No consent captured at collection; flags exist but are platform-level only | ❌ No per-client consent records | Lead auditor | Add consent collection at registration; add opt-out for AI processing |
| **Cross-border transfer** | AI provider data flows to US (OpenAI/Groq/OpenRouter) | ⚠️ No SCC or adequacy mechanism documented | Lead auditor + legal counsel | Add consent/notice for AI data processing; or disable AI per-client |
| **Data subject access** | API can return tenant data via `GET /api/tenants/me/*`; no consolidated export | ⚠️ No "right to access" endpoint | Lead auditor | Implement data export endpoint; test access request fulfillment |
| **Data breach notification** | No breach detection or notification procedure | ❌ No incident response plan for data breaches | Lead auditor + security team | Develop breach response procedure; notify INPDP within 48h if required |
| **Technical security measures** | Helmet, scrypt hashing, JWT, tenant isolation, rate limiting | ✅ Good baseline | Lead auditor | Verify all production-deployed controls are active |
| **Vendor/processor agreements** | Stripe has DPA; AI provider terms unknown; Meta Terms of Service apply | ⚠️ AI provider DPA not verified; Meta TOS may not cover B2B SaaS | Legal counsel | Review AI provider TOS/DPA; add data processing addendum if needed |

---

## 12.8 Privacy and Compliance Readiness Verdict

**Technical readiness:** PARTIAL — The system has technical controls that support compliance (tenant isolation, audit trails via Prisma, data minimization in collection, exportable via API). However, several critical gaps exist:

- ❌ No data subject request workflow
- ❌ No retention/purge policy
- ❌ No documented legal basis for data categories
- ❌ No cross-border transfer mechanism (AI providers)
- ❌ No formal consent collection
- ⚠️ No data retention controls
- ⚠️ No breach response procedure
- ⚠️ Dev-mode error messages may leak data

**Legal readiness:** UNKNOWN — This audit is technical, not legal. A qualified Tunisian legal professional must review the system against Organic Law No. 2004-63, INPDP guidance, Law No. 97-47, and the veterinary ethics code.

**Overall compliance readiness:** **CONDITIONALLY READY** — Technical controls can be enhanced with relatively straightforward additions (DSR endpoints, retention policy, consent mechanism, cross-border notice). Legal review is essential before deployment.

**Recommended next steps:**
1. Consult qualified legal counsel on Tunisian data protection law application to veterinary SaaS
2. Implement data subject access/export endpoint
3. Define and implement retention/purge policy
4. Add consent mechanism at clinic onboarding and per-client level
5. Document legal basis for each data category (with legal counsel)
6. Add cross-border transfer notice/consent if AI provider is used
7. Develop data breach response procedure per INPDP requirements
8. Consider field-level encryption for particularly sensitive medical data

---

## 12.9 Confidence Assessment

- **Confirmed:** Personal data inventory is comprehensive; data flows can be traced from collection through API to database and third-party providers; tenant isolation works for API queries; Redis is used for sessions and queues; Stripe processes payment data for supported currencies; AI provider data flows cross-border.
- **Suspected:** No DSR workflow exists; no retention policy; no consent mechanism at collection; cross-border AI data transfers lack legal basis; dev error messages may leak data.
- **Unverified:** Cannot test actual DSR fulfillment or data export without running the system; actual data retention periods in production; INPDP specific requirements applicability.

**Overall:** The system is technically capable of supporting Tunisian data protection compliance with appropriate additions and legal review. The gaps are primarily procedural/policy rather than fundamental architectural flaws.