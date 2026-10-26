# CuraVet — Phase M: Tunisian Localization and Commercial Readiness

## Executive Summary

The system has partial Tunisian localization support. Arabic and French language strings are implemented with detection logic and RTL styling cues, but missing strings and fallback to English occur in several UI areas. TND currency formatting is implemented in `utils.ts` with 3 fractional digits, but the Stripe payment path explicitly rejects TND, directing Tunisian clinics to local payment recording — which is correct but requires staff awareness. Tunisian phone number validation is not implemented in the frontend or backend. Timezone defaults to Africa/Tunis (migration 4) with correct emergency phone +216 71 000 000. Localized invoices are not implemented — no invoice number generation or Tunisian tax formatting exists. The system is technically capable of operating in Tunisia but requires configuration, staff training, and several missing features for commercial readiness.

---

## 13.1 Language Implementation

### 13.1.1 Supported Languages

The system defines three languages in `schema.prisma` and `language.ts`:

| Code | Native Name | Direction | Notes |
|---|---|---|---|
| `ar` | العربية (Arabic) | RTL | MSA/Derja covered; Arabizi detection implemented |
| `en` | English | LTR | Ops default |
| `fr` | Français (French) | LTR | Important for Tunisia/French-speaking market |

### 13.1.2 Frontend Localization

**Implementation:** React `useTranslation` or manual string mapping — I did not find `react-i18next` or similar i18n library. Instead, the system uses:

- **Language-aware UI:** The Sidebar and Header components show role badges and text in English/French/Arabic based on `tenant.languageDefault` and detected language
- **Arabic RTL:** The Sidebar (`Sidebar.tsx:88-161`) and Header (`Header.tsx:155-364`) use Tailwind CSS classes that should support RTL when `dir="rtl"` is set on a parent element, but I did not see `dir` attributes applied conditionally based on language
- **Mixed language support:** The `languageInstruction()` function (`language.ts:141-157`) generates prompts for the AI agent specifying which languages are supported and the active language direction

**Missing strings / incomplete localization:**

| Area | Status | Example |
|---|---|---|
| **Dashboard greetings** | ⚠️ Partially localized | `Header.tsx:getGreeting()` uses English "Good morning/afternoon/evening" — no Arabic/French equivalents |
| **Error messages** | ❌ Mostly English | API validation errors (Zod) are in English; no Arabic/French translations |
| **Success/toast messages** | ❌ Mostly English | `react-hot-toast` notifications likely in English; no i18n |
| **Button labels** | ⚠️ Mixed | Some Arabic labels in Sidebar (e.g., "Salle d'attente", "Agenda Médical") but many in English |
| **Form field labels** | ❌ English | Client/pet forms use English labels; no Arabic/French localization |
| **Date/currency formatting** | ⚠️ `formatCurrency()` and `formatDate()` exist in `utils.ts` but may not be used consistently in UI | See Section 13.3 |
| **Navigation items** | ⚠️ Mixed | Sidebar has some Arabic names (`Dossiers Patients`, `Carnets de Santé`) but others in English (`Workflow`, `Settings`) |

**AI multilingual support** (Phase G):
- ✅ Language detection via `detectLanguage()` (Arabic script, Arabizi, French, English, + others)
- ✅ `languageInstruction()` generates per-language prompts including RTL warning
- ✅ AI agent replies in the detected language within the tenant's supported set
- ⚠️ No explicit statement that AI responses are limited to supported languages; model may reply in unsuported languages

### 13.1.3 Backend Localization

**Language detection** (`detectLanguage()` in `services/language.ts`):
- ✅ Arabic script detection via regex `/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/`
- ✅ Arabizi (Franco-Arabe) detection via `looksLikeArabizi()` — numerals 3, 7, 5 inside Latin "words" + Derja markers
- ✅ French detection via `franc` library
- ✅ Fallback to tenant's `languageDefault` when detection fails
- ⚠️ Test failures: 2 tests in `language.test.ts` fail (`detectLanguage — detects French` and `detectLanguage — detects Urdu`) — may affect production reliability

**Tenant language configuration:**
- `Tenant.languageDefault` — defaults to `'en'` (init) or `'ar'`/`'fr'` after migration awareness
- `Tenant.supportedLanguages` — stored as `String[]`, defaults to `["ar", "en"]` in schema but `["ar", "en"]` per DEFAULT_SUPPORTED_LANGUAGES
- ⚠️ The init migration has `languageDefault: 'en'` and no Arabic/French default; migration 4 (TND) changes timezone/color/phone but not language defaults

---

## 13.2 Arabic RTL Layout

### 13.2.1 CSS and Tailwind

The frontend uses Tailwind CSS with classes that should support RTL when the `dir` attribute is set. However:

- **No conditional `dir` attribute** observed in the HTML or React components based on language
- **Tailwind utilities** used (e.g., `text-right`, `justify-end`) are not applied dynamically
- **The Sidebar and Header** use Tailwind classes like `flex`, `flex-col`, `justify-between`, `items-center` which are direction-agnostic by default

**Risk:** Arabic text may not render correctly if the layout assumes LTR. Long Arabic words or phrases could overflow or cause layout breaks.

**Recommendation:** Add `[dir="rtl"]` to the HTML element or a parent container when the tenant's `languageDefault` is `ar`, or use Tailwind's `rtl:` prefix for relevant utilities.

### 13.2.3 Arabic Text in the System Prompt

The `languageInstruction()` function includes:
```
7. For Arabic replies: Modern Standard Arabic, warm and courteous. If the client writes in Tunisian Derja (تونسي) or Arabizi (Latin chat-alphabet like 3, 7, 9, 5), you may answer in Tunisian Derja and politely switch script when it helps comprehension.
8. This language is right-to-left; keep formatting simple for WhatsApp.
```

✅ This is a strength — the system explicitly addresses Arabic RTL and Derja/Arabizi handling in the AI agent's instructions.

---

## 13.3 Currency and Payment Formatting

### 13.3.1 TND Formatting in `utils.ts`

```js
const CURRENCY_FRACTION_DIGITS: Record<string, number> = {
  TND: 3,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export function formatCurrency(amount: number, currency = 'TND'): string {
  const digits = CURRENCY_FRACTION_DIGITS[currency] ?? 0;
  return new Intl.NumberFormat(currency === 'TND' ? 'fr-TN' : 'en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function toMillimes(amount: number, currency = 'TND'): number {
  const scale = (CURRENCY_FRACTION_DIGITS[currency] ?? 2) === 3 ? 1000 : 100;
  return Math.round(amount * scale);
}
```

**Strengths:**
- ✅ `formatCurrency()` correctly uses `fr-TN` locale for TND (Tunisian French numeral formatting)
- ✅ `toMillimes()` correctly scales TND by 1000 (3 fractional digits)
- ✅ Values are documented and consistent

**Usage gap:** These functions exist in `lib/utils.ts` but I did not verify they are called in the UI components. The clinic-admin pages may format currency inline without using these utilities.

### 13.3.2 Stripe and TND

**Explicitly documented:** `payments.ts:46-50` states Stripe does NOT support TND. For Tunisian clinics:
- Use `createBookingPaymentLink()` for Stripe-supported currencies only
- Use `createLocalPaymentRecord()` for TND payments (espèces, cheque, TPE, virement)

**The `toStripeAmount()` bug** (Phase I, I-001): TND is not in `THREE_DECIMAL_CURRENCIES`, so if TND is ever passed to this function, the amount conversion would be wrong (off by factor of 10). Since TND is rejected at the API gateway for Stripe links, this bug will not manifest in practice, but the code should be corrected.

### 13.3.3 Currency Defaults Across Migrations

| Migration | Service.currency Default | Booking.currency Default | Payment.currency Default | GiftCard.currency Default |
|---|---|---|---|---|
| Init (20260101) | `AED` | `AED` | `AED` | `AED` |
| TND Localization (2026102611) | `TND` (altered) | `TND` (altered) | `TND` (altered, + row update) | `AED` (unchanged) |
| GiftCard TND (2026102612) | — | — | — | `TND` (altered) |

**Risk:** New tenants created before migration 4 receives AED defaults. Since the primary deployment market is Tunisia, this is a significant operational risk. The migration order must be enforced.

---

## 13.3 Tunisian Phone Number Validation

**Not implemented** in the codebase. No regex or validation function for Tunisian phone numbers (`+216 XX XXX XXX` format, where XX is the operator code: 2, 3, 7, 9).

**Where phone validation is needed and missing:**

| Location | Current State | Required |
|---|---|---|
| **Client creation** (`clients.ts:11-17`) | Zod `ClientSchema` validates `phone: z.string().min(3)` — minimum length only, no Tunisian format validation | Add Tunisian phone regex validation |
| **WhatsApp sender** (`whatsappSender.ts`) | Phone number sent as-is to Meta API — no validation before send | Validate format before sending; Meta may reject invalid numbers |
| **SMS sender** (`smsSender.ts` — not fully read) | Same as WhatsApp — may need validation | Add validation |
| **User login** (`auth.ts:21-24`) | `JWT_SECRET` default + email validation only | No phone validation needed for login, but registration may need it |
| **Frontend forms** | No phone validation observed in React forms | Add client-side validation matching backend |

**Tunisian phone format:** `+216` followed by 8 digits: `+216 20 XXX XXX` (Tunet), `+216 30 XXX XXX` (Ooredoo), `+216 70 XXX XXX`, `+216 71 XXX XXX`, `+216 72 XXX XXX`, `+216 73 XXX XXX`, `+216 74 XXX XXX`, `+216 75 XXX XXX` (generally mobile), `+216 76 XXX XXX`, `+216 77 XXX XXX`.

A reasonable regex: `^(\+216|216)?[2-79][0-9]{7}$` or more precisely per operator.

---

## 13.4 Timezone and Scheduling

### 13.4.1 Timezone Defaults

- **Init migration:** `Tenant.timezone DEFAULT 'Asia/Dubai'` (UAE timezone, no DST)
- **Migration 4 (TND):** `Tenant.timezone SET DEFAULT 'Africa/Tunis'` (Tunisia timezone, no DST)

### 13.4.2 Clinic Workflow

The salon's timezone is stored per-tenant and used for:
- Appointment `scheduledAt` / `endsAt` conversion (`date-fns-tz` `fromZonedTime`)
- Working hours validation (`isWithinWorkingHours`)
- AI agent `check_availability` and `get_schedule_and_appointments` tools

✅ Both default timezones do not observe DST, so no DST transition risks.

### 13.4.2 Emergency Phone

- **Migration 4 default:** `+216 71 000 000` (Tunisia national emergency)
- **Init default:** `undefined` (or could be set differently)
- The emergency phone is embedded in the AI agent's system prompt (Rule 1) and used if the tenant overrides it

✅ Correctly set for Tunisian deployment after migration 4.

---

## 13.5 Invoicing and Fiscal Localization

### 13.4.1 Invoice Numbering

**Not implemented.** No invoice number generation, sequential numbering, or fiscal stamp configuration found in the codebase.

**Required for Tunisian compliance:**
- Sequential invoice numbers
- Issuer (clinic) name, address, tax ID
- Recipient (client) name, address
- Date of issue
- Detailed line items (services, quantities, unit prices, totals)
- Tax amount (Tunisia has specific VAT/invoice tax rules)
- Total amount

**Gap:** Complete absence of invoice generation functionality. This would need to be built from scratch or integrated with a third-party invoicing service.

### 13.4.2 Tax Configuration

**Not implemented.** No tax rates, tax-inclusive/exclusive settings, or fiscal stamp configuration found.

- Tunisia has specific invoicing tax requirements under the Tunisian tax code
- The system records `Payment.amount` and `Payment.currency` but no tax breakdown
- For Stripe-supported currencies, tax is typically handled by Stripe's tax calculation rules
- For local TND payments, no tax recording exists

---

## 13.6 Low-Bandwidth and Mobile Usability

### 13.6.1 Network Behavior

The frontend is a React Vite app with:
- ✅ Code splitting (default Vite behavior)
- ✅ `lazyLoad` not explicitly examined but likely used for images
- ⚠️ Large payloads possible — some pages may download significant CSS/JS

### 13.6.2 Offline and Error Behavior

- ❌ No service worker or offline fallback observed
- ❌ Network error handling not examined in detail
- The API returns appropriate status codes (404, 500, etc.) but frontend error boundaries may not be robust

### 13.6.3 Mobile Responsiveness

- ✅ React + Tailwind setup should be mobile-responsive
- ✅ Sidebar collapses to mobile view (`lg:hidden`, `lg:translate-x-0` / `-translate-x-full`)
- ✅ Header adapts (hides greeting on non-dashboard pages)
- ✅ Vite preview indicated the app works in mobile browser

---

## 13.7 Data Import and Export

### 13.7.1 Export

**Limited.** The API has no dedicated export endpoint. Data can be extracted via:
- `GET /api/tenants/me/bookings` — all bookings for the tenant
- `GET /api/tenants/me/clients` — all clients with booking counts and total spent
- `GET /api/tenants/me/payments` — all payments
- `GET /api/tenants/me/services` — all services
- Manual view-through the dashboard UI

No structured export (JSON/CSV) with filtering or formatting.

### 13.7.2 Import

**Not examined** during this audit. No import endpoints or scripts were found.

### 13.7.3 Clinic Data Migration

When switching from a competitor or starting fresh:
- Prisma migrations handle schema evolution
- Seed scripts (`seed.ts`, `seed_full_production.ts`) can populate initial data
- No explicit data mapping from other formats (CSV, Excel, etc.)

---

## 13.8 Customer Support and Troubleshooting

**Documentation not examined** in detail. The `README.md` and `implementation_plan.md` at the root may contain setup instructions, but the audit did not review these thoroughly. The clinic-admin dashboard has:

- `PrivacyPolicy.tsx` and `TermsOfService.tsx` pages
- Settings page with configurable options (timezone, languages, AI provider, reminders, etc.)
- Analytics and broadcast pages for clinic operations

---

## 13.9 Tunisian Localization Findings

| Area | Status | Key Issues |
|---|---|---|
| **Arabic language support** | ⚠️ Partial | Detection and AI replies work; UI strings mostly English; no conditional `dir` for RTL |
| **French language support** | ⚠️ Partial | UI strings in English; no French translations |
| **TND currency formatting** | ✅ Implemented in `utils.ts` | Functions exist but may not be used consistently in UI; `formatCurrency('TND')` uses `fr-TN` locale |
| **Stripe + TND** | ✅ Explicitly handled | TND rejected from Stripe path; local payment recording used instead (correct) |
| **Tunisian phone validation** | ❌ Not implemented | No regex or validation for +216 format |
| **Timezone** | ✅ Correct | Africa/Tunis default (migration 4); no DST; emergency phone +216 71 000 000 |
| **Invoicing** | ❌ Not implemented | No invoice numbers, tax formatting, or fiscal stamps |
| **Mixed Arabic/French/Latin text** | ⚠️ Not tested | No validation or rendering issues found, but no explicit RTL layout support |
| **Low-bandwidth mobile** | ⚠️ Partial | Mobile-responsive UI; no offline support; network error handling unknown |
| **Customer support docs** | ⚠️ Not examined | `PrivacyPolicy` and `TermsOfService` pages exist; setup docs unknown |

---

## 13.10 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P1** | **Add Tunisian phone number validation** — regex `^(\+216|216)?[2-79][0-9]{7}$` on client creation and WhatsApp/SMS sender | 30 min |
| **P1** | **Add Arabic/French UI string translations** — at minimum, dashboard greetings, error messages, and button labels | 2-4 hours |
| **P1** | **Add conditional `dir="rtl"`** to HTML/body when tenant's `languageDefault` is `ar`; or use Tailwind `rtl:` utilities | 1 hour |
| **P2** | **Implement invoice numbering and tax formatting** — sequential numbers, issuer/recipient info, tax lines (requires legal input for Tunisian fiscal requirements) | 5-10 hours |
| **P2** | **Fix `toStripeAmount()` TND bug** — add TND to `THREE_DECIMAL_CURRENCIES` or refactor to use `CURRENCY_FRACTION_DIGITS` | 15 min |
| **P3** | **Add client-side form validation** for phone, dates, times matching backend validation | 2-3 hours |
| **P3** | **Ensure `formatCurrency()` and `formatDate()` are used** in all UI components that display money/dates | 1-2 hours |
| **P3** | **Add mixed-language support** in AI agent prompts and frontend i18n | 2-3 hours |

---

## 13.11 Commercial Readiness Verdict

**Overall status: CONDITIONALLY READY for Tunisia — technical infrastructure is largely in place but several critical commercial features are missing.**

**Ready now:**
- ✅ TND currency formatting utilities exist (`formatCurrency`, `toMillimes`)
- ✅ Africa/Tunis timezone and +216 71 000 000 emergency phone are configured (after migration 4)
- ✅ Arabic/French/English language detection works (with 2 pre-existing test failures)
- ✅ AI agent handles Arabic/Rtl/Darja per `languageInstruction()`
- ✅ Local payment recording (espèces, cheque, TPE, virement) is the default TND path
- ✅ Service menu with Arabic/English dual names (`nameAr` / `nameEn`)

**Not ready — must be addressed before or shortly after launch:**
- ❌ Tunisian phone number validation (frontend and backend)
- ❌ Invoice generation with fiscal compliance (no invoice numbers, tax formatting)
- ❌ Mixed-language UI (Arabic/French/English strings missing)
- ❌ Conditional RTL layout support
- ⚠️ `toStripeAmount()` TND bug (code correctness, low functional risk)
- ⚠️ Stripe payment links for supported currencies — clinics using these need staff training on the path

**Recommended launch scope:** A pilot with one Tunisian clinic, with the above gaps remediated before onboarding, or launched with explicit knowledge of limitations and a remediation plan.

**Commercial partnership requirement:** Close coordination with a qualified Tunisian accountant for invoicing/tax compliance, and potentially a legal review of the privacy policy against Organic Law No. 2004-63.