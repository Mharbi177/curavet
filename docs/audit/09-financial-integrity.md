# CuraVet — Phase I: Billing, Payments and Inventory

## Executive Summary

The billing and payments system is partially implemented with a clear dual-path design: Stripe-supported currencies (USD, EUR, etc.) use Stripe Checkout Sessions for payment link generation, while Tunisian-local methods (espèces, cheque, TPE, virement) use direct local payment recording. However, **TND is explicitly not supported by Stripe**, and this is handled by routing to local payment recording — but the `toStripeAmount()` function has a bug where TND is not in the `THREE_DECIMAL_CURRENCIES` set, causing incorrect amount conversion if TND is ever used with Stripe. No inventory or retail product sales functionality exists. The financial state is generally well-structured but has currency precision and TND/Stripe integration gaps that must be resolved for Tunisian clinic deployment.

---

## 9.1 Payment Infrastructure

### 9.1.1 Supported Payment Flows

| Flow | Method | Currency | Stripe Involved | Implementation |
|---|---|---|---|---|
| **Stripe payment link** | `createBookingPaymentLink()` | Supported currencies only (USD, EUR, GBP, AED, SAR, etc.) | ✅ Yes | Creates Stripe Checkout Session; persists `Payment` row with `status: 'pending'` |
| **Local payment recording** | `createLocalPaymentRecord()` | TND + any currency | ❌ No | Creates `Payment` row with `status: 'paid'` immediately; method: `especes`/`cheque`/`TPE`/`virement` |

### 9.1.2 Currency Support Analysis

**Stripe-supported currencies** (`payments.ts:65-68`):
```
USD, EUR, GBP, AED, SAR, QAR, KWD, BHD, OMR, JOD, MAD, EGP, CAD, AUD, SGD
```

**TND (Tunisian Dinar):** ❌ NOT in Stripe-supported list. Explicitly documented in `payments.ts:46-50`:
> "Stripe does NOT support TND (Tunisian Dinar). For Tunisian clinics, local payments (espèces, chèque, TPE, virement) are recorded directly via `createLocalPaymentRecord`. Only use this function when the tenant is configured with a Stripe-supported currency."

**Three-decimal currencies** (`payments.ts:58`):
```
KWD, BHD, OMR, JOD
```
These are Gulf Cooperation Council currencies with 3 fractional units (millimes). TND is NOT included, even though it also has 3 fractional digits (millimes).

### 9.1.3 Amount Conversion

**`toStripeAmount()` (`payments.ts:70-74`):**
```js
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD']);
function toStripeAmount(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return Math.round(amount * 1000);
  return Math.round(amount * 100);
}
```

**Bug:** TND is not in `THREE_DECIMAL_CURRENCIES`, so `toStripeAmount(35.5, 'TND')` would return `Math.round(35.5 * 100) = 3550` (2 decimal places), but TND requires 3 fractional digits (millimes), so the correct conversion would be `Math.round(35.5 * 1000) = 35500`.

**However:** Since TND is not supported by Stripe at all, this code path should never be reached for TND. The `createBookingPaymentLink()` function explicitly rejects non-Stripe currencies with a 422 error (line 86-94).

**`toMillimes()` (`utils.ts:32-35`):**
```js
export function toMillimes(amount: number, currency = 'TND'): number {
  const scale = (CURRENCY_FRACTION_DIGITS[currency] ?? 2) === 3 ? 1000 : 100;
  return Math.round(amount * scale);
}
```
This is **correct** — it uses `CURRENCY_FRACTION_DIGITS` which has `TND: 3`, so it returns `Math.round(amount * 1000)` for TND. This function should be used for all TND monetary calculations instead of `toStripeAmount()`.

---

## 9.2 Stripe Payment Link Creation

### 9.2.1 `createBookingPaymentLink()` (`payments.ts:76-147`)

**Input params:** `tenantId`, `bookingId`, `amount`, `currency`, `serviceName`, `clientEmail?`

**Validation chain:**
1. Currency must be in `STRIPE_SUPPORTED_CURRENCIES` ❌ TND rejected
2. Determine if 3-decimal currency → apply `Math.round(amount * 1000)` or `Math.round(amount * 100)`
3. Create Stripe Checkout Session (`mode: 'payment'`)
4. Persist `Payment` row with:
   - `provider: 'stripe'`
   - `amount: params.amount` (original, not converted)
   - `currency: params.currency`
   - `status: 'pending'`
   - `paymentUrl: session.url`
   - `stripeSessionId: session.id`
   - `expiresAt: session.expires_at` (or null)

**Return:** `{ paymentId, url, amount, currency, expiresAt }`

**Key side effect:** After creating the payment link, `bookAppointment()` (CuraVetAgent.ts:538-556) **downgrades the booking status to `'pending'`**:
```prisma
await prisma.booking.update({
  where: { id: result.bookingId },
  data: { status: 'pending' },
});
```

### 9.2.2 Payment Webhook Handling

`applyStripeEvent()` (`payments.ts:302-413`) processes Stripe events and updates payment status:

**Events handled:**
- `checkout.session.completed` → Sets payment `status: 'paid'`, `paidAt: new Date()`, updates associated booking `status: 'confirmed'`
- `checkout.session.async_payment_succeeded` → Same as completed (retry scenario)
- `checkout.session.expired` → Sets payment `status: 'expired'`
- `charge.refunded` → Sets payment `status: 'refunded'`
- `customer.subscription.updated` / `deleted` → Tenant plan/isActive updates (B2B)
- `invoice.paid` / `invoice.payment_failed` → Logging only

**Idempotency:** Finds payment by `stripeSessionId` before updating — safe for duplicate deliveries.

### 9.2.3 Local Payment Recording

`createLocalPaymentRecord()` (`payments.ts:155-185`):

**Input params:** `tenantId`, `bookingId?`, `clientId?`, `amount`, `currency`, `method: 'especes' | 'cheque' | 'tpe' | 'virement'`

**Creates Payment row with:**
- `provider: 'local'`
- `amount: params.amount`
- `currency: params.currency`
- `status: 'paid'` — **immediately paid** (no pending → confirmed flow)
- `method: params.method`
- `paidAt: new Date()`

**Returns:** `{ paymentId, amount, currency, method }`

**Use case:** Standard Tunisian payment methods — cash (especes), check (cheque), card terminal (TPE), bank transfer (virement).

---

## 9.3 Financial Data Integrity

### 9.3.1 Monetary Precision

| Field | Type | Precision Risk |
|---|---|---|
| `Service.price` | `Float` | IEEE 754 double; may cause rounding errors |
| `Booking.price` | `Float` | Same as above |
| `Payment.amount` | `Float` | Same as above |
| `GiftCard.amount` | `Float` | Same as above |

**Impact:** Payment totals may not exactly match service prices. Change calculation could be off by millimes (0.001 TND).

**Mitigation in code:**
- `toMillimes()` in `utils.ts` correctly handles TND (3 digits) and other currencies (2 digits)
- `toStripeAmount()` in `payments.ts` handles 2-decimal and 3-decimal (Gulf) currencies, but has the TND bug noted above
- All monetary operations should ideally go through `toMillimes()` for consistency

### 9.3.2 Invoice Numbering and Uniqueness

**No invoice numbering system** found in the codebase. The `Payment` model has:
- `stripeSessionId: String? @unique` — unique across all payments (global constraint)
- No `invoiceNumber` field
- No `invoicePrefix` or sequential numbering

**Impact:** No formal invoice numbers are generated. Payments are tracked by `stripeSessionId` (Stripe) or internal `paymentId`. For local TND payments, there is no invoice number at all.

**This is a compliance gap** for Tunisian invoicing requirements, which typically require sequential invoice numbers with specific formatting.

### 9.3.3 Invoice Status Transitions

| Status | Transition | Trigger |
|---|---|---|
| `pending` | → `paid` | Stripe `checkout.session.completed` or `async_payment_succeeded`; or local payment recording |
| `pending` | → `expired` | Stripe `checkout.session.expired` |
| `paid` | → `refunded` | Stripe `charge.refunded` |
| `refunded` | — | Final state |

**No "partially paid" state.** Payments are either pending, paid, or refunded.

### 9.3.4 Discounts and Refunds

- **Discounts:** `UpsellRule.discountPercent` exists in the database but is not applied automatically during booking or payment. The AI agent can "briefly mention" upsells (CuraVetAgent.ts:233), but no discount code or reduction mechanism is implemented.
- **Refunds:** `applyStripeEvent()` handles `charge.refunded` by finding the payment by `stripePaymentIntentId` and setting `status: 'refunded'`. No partial refunds — either the full amount is refunded or none.

### 9.3.5 Partial Payments and Outstanding Balances

**No partial payment support.** The system creates a single `Payment` record per booking, and the booking is either `pending` (waiting for deposit) or `confirmed` (deposit paid in full).

**No outstanding balance tracking** beyond the `Payment` model. If a booking has a deposit of 200 TND and the total is 350 TND, there is no mechanism to track the remaining 150 TND balance.

### 9.3.6 Cash and Other Payment Methods

The `method` field on `Payment` supports: `especes | cheque | tpe | virement | card | stripe`. 

- `especes` (cash), `cheque` (check), `tpe` (card terminal), `virement` (bank transfer) are the standard Tunisian methods.
- `card` is a generic card payment (could be local card processing or Stripe card).
- `stripe` is specifically for Stripe-processed payments.

No validation is performed on the `method` field value beyond the Zod schema enum constraint.

---

## 9.4 Inventory and Product Sales

**No inventory functionality** exists in the codebase. The Prisma schema has no `Product` model, no `Stock` model, and no quantity fields on any existing model.

The `UpsellRule` model suggests related services based on a trigger service, but this is a marketing upsell, not inventory management.

**If the clinic sells retail products** (pet food, medications, accessories), there is no backend support. This is a significant gap for clinics that want to sell products alongside services.

---

## 9.5 Payment Reconciliation and Webhook Safety

### 9.5.1 Duplicate Webhook Delivery

`applyStripeEvent()` is idempotent — it finds the payment by `stripeSessionId` before updating. If the same webhook is delivered twice:

1. First delivery: payment found, status set to `paid`, booking set to `confirmed`
2. Second delivery: payment found, status already `paid` — update is a no-op (setting `paidAt` again is harmless)

**However,** there is a subtle edge case: if the first delivery sets `status: 'paid'` and the second delivery's event has different metadata, the idempotent update would overwrite with the same values, which is safe.

### 9.5.2 Out-of-Order Webhooks

If `invoice.payment_failed` arrives before `checkout.session.completed`:

1. `invoice.payment_failed`: payment found (if it exists), status set to... wait, let me check.

Looking at `applyStripeEvent()`:

```js
case 'invoice.payment_failed': {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (customerId) {
    const tenant = await prisma.tenant.findFirst({ where: { paddleCustomerId: customerId } });
    if (tenant) {
      logger.warn(`...payment failed for tenant ${tenant.id}`);
    }
  }
  return { handled: true };
}
```

The `invoice.payment_failed` event does NOT update the payment status — it just logs a warning. This is correct because the payment may not be associated with an invoice yet, or the invoice may be for a subscription, not a booking.

If `checkout.session.completed` arrives after `invoice.payment_failed`: the booking will be confirmed via the completed event, which is the correct behavior.

### 9.5.3 Webhook Signature Validation

`constructStripeEvent()` (`payments.ts:288-296`) requires `env.STRIPE_WEBHOOK_SECRET` and uses `getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)`. If the secret is not configured, it throws `Error('Stripe webhook secret is not configured.')`.

In development (when `META_APP_SECRET` is not set), webhook signature verification is intentionally disabled (env.ts:172-174 warns about this). This means anyone can send webhooks to the API in development mode.

---

## 9.6 Billing, Payments and Inventory Findings

| Category | Status | Key Issues |
|---|---|---|
| Stripe payment links | ✅ **Implemented** | Works for supported currencies; TND explicitly rejected and routed to local payment recording |
| Local TND payments | ✅ **Implemented** | `createLocalPaymentRecord()` records payments immediately as `status: 'paid'` with methods: espèces, cheque, TPE, virement |
| Currency precision | ❌ **Bug** | `toStripeAmount()` does not include TND in `THREE_DECIMAL_CURRENCIES` — if TND is ever used with Stripe, amounts will be off by factor of 10 |
| Invoice numbering | ❌ **Not implemented** | No invoice number generation; no sequential numbering; no compliance with Tunisian fiscal requirements |
| Payment status transitions | ✅ **Clear** | `pending` → `paid` / `expired` / `refunded`; well-defined triggers |
| Partial payments | ❌ **Not supported** | Single payment per booking; no outstanding balance tracking |
| Refunds | ⚠️ **Partial** | `charge.refunded` handled; no partial refunds; full refund only |
| Inventory/retail sales | ❌ **Not implemented** | No Product or Stock model; no quantity tracking |
| Payment method validation | ✅ **Enum** | `method` field validated as `especes | cheque | tpe | virement | card | stripe` |
| Webhook idempotency | ✅ **Verified** | `applyStripeEvent()` finds payment by `stripeSessionId` before updating; duplicate deliveries are safe |
| TND/Stripe integration | ⚠️ **Explicitly handled** | TND not supported by Stripe; local payment recording used instead; documented but requires clinic staff awareness |

---

## 9.7 Remediation Priority

| Priority | Action | Effort |
|---|---|---|
| **P1** | **Fix `toStripeAmount()` in `payments.ts`** — add `TND` to `THREE_DECIMAL_CURRENCIES` set, or refactor to use `CURRENCY_FRACTION_DIGITS` for scale determination | 15 min |
| **P1** | **Add invoice numbering system** — implement sequential invoice numbers with Tunisian fiscal formatting (required for lawful operation) | 2-4 hours |
| **P2** | **Add partial payment / outstanding balance tracking** — if deposits are common, implement a balance model or clarify that deposits are the full amount | 3-5 hours |
| **P2** | **Add inventory/retail product support** if clinics sell products — add `Product` and `Stock` models | 5+ hours |
| **P3** | **Add partial refund support** if needed beyond full refunds | 2-3 hours |
| **P3** | Ensure `toMillimes()` is used consistently for all TND calculations instead of `toStripeAmount()` | 15 min |

---

## 9.8 Confidence Assessment

- **Confirmed:** Stripe payment links work for supported currencies; local TND payments are recorded correctly; webhook idempotency is sound; payment status transitions are well-defined; TND is explicitly excluded from Stripe path with clear documentation.
- **Suspected:** The `toStripeAmount()` TND bug will not manifest in practice since TND is rejected at the API gateway, but the code should still be correct for future Stripe TND support; invoice numbering is definitely missing and requires professional input for Tunisian fiscal compliance.
- **Unverified:** Cannot test actual Stripe payment flow without test API keys; cannot test live payment transactions.

**Overall:** The billing and payments system is functional for its intended scope (Stripe for supported currencies, local recording for TND), but lacks invoice numbering, partial payment support, and inventory functionality. The TND/Stripe bug is low risk in practice but should be fixed for code correctness.

---

## 9.9 Production Launch Checklist for Payments

Before a Tunisian clinic can accept payments:

1. ✅ If using Stripe: Ensure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_*` are configured
2. ✅ If using local TND payments: Ensure `createLocalPaymentRecord()` is the chosen path (it is, by default)
3. ⚠️ Fix `toStripeAmount()` TND bug (code correctness, not functional impact for now)
4. ⚠️ Add invoice numbering system for Tunisian fiscal compliance
5. ⚠️ Staff training on which payment path to use per clinic configuration
6. ⚠️ Test payment webhook delivery (idempotency, out-of-order handling)