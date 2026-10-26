import Stripe from 'stripe';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// ─── Pricing table ───────────────────────────────────────────────────────────
// Map GlamBot plan names to Stripe Price IDs. Populate via STRIPE_PRICE_* env vars.
const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  starter: env.STRIPE_PRICE_STARTER,
  pro: env.STRIPE_PRICE_PRO,
  enterprise: env.STRIPE_PRICE_ENTERPRISE,
};

let stripeClient: Stripe | null = null;

export function isStripeEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
      timeout: 15000,
      maxNetworkRetries: 2,
    });
  }
  return stripeClient;
}

export interface PaymentLinkResult {
  paymentId: string;
  url: string;
  amount: number;
  currency: string;
  expiresAt: Date | null;
}

/**
 * Create a Stripe Checkout Session for a booking and persist a Payment row.
 * Returns the hosted payment URL that can be sent over WhatsApp.
 *
 * ⚠️  IMPORTANT: Stripe does NOT support TND (Tunisian Dinar). For Tunisian
 * clinics, local payments (espèces, chèque, TPE, virement) are recorded
 * directly via `createLocalPaymentRecord`. Only use this function when the
 * tenant is configured with a Stripe-supported currency.
 */

/**
 * Currencies that carry three decimal places (smallest unit = 1/1000 of the
 * major unit).  Stripe `unit_amount` must be expressed in that smallest unit,
 * so we multiply by 1000 instead of the usual 100.
 * Reference: https://stripe.com/docs/currencies#three-decimal
 */
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD']);

/**
 * Currencies Stripe supports for live payment sessions (common ones relevant
 * to the MENA/EU expansion roadmap). TND is deliberately excluded because
 * Stripe does not process it.
 */
const STRIPE_SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR',
  'JOD', 'MAD', 'EGP', 'CAD', 'AUD', 'SGD',
]);

function toStripeAmount(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return Math.round(amount * 1000);
  return Math.round(amount * 100);
}

export async function createBookingPaymentLink(params: {
  tenantId: string;
  bookingId: string;
  amount: number;
  currency: string;
  serviceName: string;
  clientEmail?: string | null;
}): Promise<PaymentLinkResult> {
  const upper = params.currency.toUpperCase();

  if (!STRIPE_SUPPORTED_CURRENCIES.has(upper)) {
    throw Object.assign(
      new Error(
        `Currency "${params.currency}" is not supported by Stripe. ` +
        `For local payments (espèces, chèque, TPE, virement), use createLocalPaymentRecord instead.`
      ),
      { statusCode: 422 }
    );
  }

  const stripe = getStripe();
  const currency = upper.toLowerCase();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${env.PUBLIC_API_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.PUBLIC_API_URL}/pay/cancelled`,
    customer_email: params.clientEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: toStripeAmount(params.amount, upper),
          product_data: {
            name: params.serviceName,
            metadata: { tenantId: params.tenantId, bookingId: params.bookingId },
          },
        },
      },
    ],
    metadata: {
      tenantId: params.tenantId,
      bookingId: params.bookingId,
    },
  });

  const expirySeconds = session.expires_at ?? null;
  const expiresAt = expirySeconds ? new Date(expirySeconds * 1000) : null;

  const payment = await prisma.payment.create({
    data: {
      tenantId: params.tenantId,
      bookingId: params.bookingId,
      provider: 'stripe',
      amount: params.amount,
      currency: params.currency,
      status: 'pending',
      paymentUrl: session.url,
      stripeSessionId: session.id,
      expiresAt,
    },
  });

  return {
    paymentId: payment.id,
    url: session.url || '',
    amount: params.amount,
    currency: params.currency,
    expiresAt,
  };
}

/**
 * Record a local (non-Stripe) payment for clinics using cash, cheque, TPE, or
 * bank transfer (virement) — the standard payment methods in Tunisia.
 *
 * method: 'especes' | 'cheque' | 'tpe' | 'virement'
 */
export async function createLocalPaymentRecord(params: {
  tenantId: string;
  bookingId?: string | null;
  clientId?: string | null;
  amount: number;
  currency: string;
  method: 'especes' | 'cheque' | 'tpe' | 'virement';
}): Promise<{ paymentId: string; amount: number; currency: string; method: string }> {
  const payment = await prisma.payment.create({
    data: {
      tenantId: params.tenantId,
      bookingId: params.bookingId ?? null,
      clientId: params.clientId ?? null,
      provider: 'local',
      amount: params.amount,
      currency: params.currency,
      status: 'paid',
      method: params.method,
      paidAt: new Date(),
    },
  });

  logger.info('[payments] local payment recorded', { paymentId: payment.id, method: params.method });

  return {
    paymentId: payment.id,
    amount: params.amount,
    currency: params.currency,
    method: params.method,
  };
}

// ─── SaaS Subscription (Phase 6.1) ───────────────────────────────────────────

export interface SubscriptionCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

/**
 * Create a Stripe Checkout Session for a tenant subscribing to a SaaS plan.
 * If the tenant already has a Stripe customer ID, reuse it so their payment
 * history is preserved across plan changes.
 */
export async function createSubscriptionCheckout(params: {
  tenantId: string;
  plan: 'starter' | 'pro' | 'enterprise';
  successUrl: string;
  cancelUrl: string;
  adminEmail?: string;
}): Promise<SubscriptionCheckoutResult> {
  const stripe = getStripe();

  const priceId = PLAN_PRICE_IDS[params.plan];
  if (!priceId) {
    throw Object.assign(
      new Error(`No Stripe Price ID configured for plan "${params.plan}". Set STRIPE_PRICE_${params.plan.toUpperCase()}.`),
      { statusCode: 400 }
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { paddleCustomerId: true, name: true },
  });

  // `paddleCustomerId` is reused as the Stripe customer ID field since the
  // schema already has this column and the original Paddle integration was
  // never completed. A migration adding a dedicated `stripeCustomerId` column
  // is preferred for a production environment.
  let customerId = tenant?.paddleCustomerId ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: params.adminEmail,
      name: tenant?.name,
      metadata: { tenantId: params.tenantId },
    });
    customerId = customer.id;
    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: { paddleCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { tenantId: params.tenantId, plan: params.plan },
    subscription_data: { metadata: { tenantId: params.tenantId, plan: params.plan } },
    allow_promotion_codes: true,
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

/**
 * Open the Stripe Customer Portal so a tenant can manage their subscription,
 * update their credit card, or download past invoices — without any custom UI.
 */
export async function createBillingPortalSession(params: {
  tenantId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { paddleCustomerId: true },
  });

  if (!tenant?.paddleCustomerId) {
    throw Object.assign(
      new Error('No Stripe customer found for this tenant. They must subscribe first.'),
      { statusCode: 404 }
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.paddleCustomerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

/**
 * Verify and normalise an inbound Stripe webhook event.
 * Throws when the signature is invalid so the route can return 400.
 */
export function constructStripeEvent(rawBody: Buffer | string, signature: string | undefined): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured.');
  }
  if (!signature) {
    throw new Error('Missing stripe-signature header.');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Apply a Stripe event to local payment state. Idempotent by session id.
 * Now handles both B2C payment links (Phase 5.3) and B2B subscriptions (Phase 6.1).
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<{ handled: boolean; paymentId?: string }> {
  switch (event.type) {
    // ── B2C: one-time booking deposits ──────────────────────────────────────
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;

      // B2B subscription checkout — handled separately below.
      if (session.mode === 'subscription') {
        const tenantId = session.metadata?.tenantId;
        const plan = session.metadata?.plan;
        if (tenantId && plan) {
          await prisma.tenant.update({ where: { id: tenantId }, data: { plan, isActive: true } });
          logger.info(`[stripe] Tenant ${tenantId} subscribed to ${plan} plan.`);
        }
        return { handled: true };
      }

      // B2C payment deposit for a booking.
      const payment = await prisma.payment.findUnique({ where: { stripeSessionId: session.id } });
      if (!payment) return { handled: false };

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          stripePaymentIntentId:
            typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        },
      });

      // Confirm the held booking now that the deposit is paid.
      if (payment.bookingId) {
        await prisma.booking.update({
          where: { id: payment.bookingId },
          data: { status: 'confirmed' },
        });
      }

      return { handled: true, paymentId: payment.id };
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await prisma.payment.findUnique({ where: { stripeSessionId: session.id } });
      if (!payment) return { handled: false };

      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'expired' } });
      return { handled: true, paymentId: payment.id };
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!intentId) return { handled: false };

      const payment = await prisma.payment.findFirst({ where: { stripePaymentIntentId: intentId } });
      if (!payment) return { handled: false };

      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'refunded' } });
      return { handled: true, paymentId: payment.id };
    }

    // ── B2B: subscription lifecycle ─────────────────────────────────────────
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return { handled: false };

      const plan = sub.metadata?.plan ?? 'starter';
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      await prisma.tenant.update({ where: { id: tenantId }, data: { plan, isActive } });
      logger.info(`[stripe] Tenant ${tenantId} subscription updated: ${sub.status}, plan=${plan}`);
      return { handled: true };
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return { handled: false };

      // Soft-suspend instead of hard-delete: the tenant's data is preserved
      // and they can reactivate by subscribing again.
      await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });
      logger.info(`[stripe] Tenant ${tenantId} subscription cancelled — tenant suspended.`);
      return { handled: true };
    }

    case 'invoice.paid': {
      // Could be used to reset usage quotas or send payment receipt via WhatsApp.
      // No-op for now but logged for audit.
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`[stripe] Invoice ${invoice.id} paid for customer ${invoice.customer}.`);
      return { handled: true };
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const tenant = await prisma.tenant.findFirst({ where: { paddleCustomerId: customerId } });
        if (tenant) {
          logger.warn(`[stripe] Invoice payment failed for tenant ${tenant.id} — consider notifying the owner.`);
        }
      }
      return { handled: true };
    }

    default:
      return { handled: false };
  }
}
