import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  // Auth
  //
  // These have insecure development defaults so `pnpm dev` works out of the box,
  // and `assertProductionSafety()` hard-fails the process in production if the
  // defaults are ever reached. That is deliberate: failing loudly at boot is far
  // safer than booting with a guessable signing key.
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('curavet_super_jwt_secret_change_in_production_2026'),
  // Access tokens are short-lived (15 min); sessions survive via refresh tokens.
  JWT_TTL_SECONDS: z.string().default('900'),
  JWT_REFRESH_TTL_SECONDS: z.string().default('604800'),
  SUPERADMIN_EMAIL: z.string().default('admin@curavet.io'),
  SUPERADMIN_PASSWORD: z.string().default('admin123'),

  // Crypto
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(16, 'CREDENTIALS_ENCRYPTION_KEY must be at least 16 characters')
    .default('curavet_aes256_encryption_master_key_2026'),

  // AI
  AI_PROVIDER: z.enum(['auto', 'openai', 'groq', 'openrouter']).default('auto'),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  // Meta / WhatsApp / Instagram
  META_VERIFY_TOKEN: z.string().min(1, 'META_VERIFY_TOKEN is required'),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  INSTAGRAM_TOKEN: z.string().optional(),

  // SMS
  // Platform-level provider config. Per-tenant tokens can still override the
  // Twilio auth token via encrypted TenantIntegration credentials.
  //   provider=twilio -> requires TWILIO_ACCOUNT_SID + (TWILIO_AUTH_TOKEN or tenant token)
  //   provider=http   -> generic Tunisian gateway JSON POST (SMS_HTTP_ENDPOINT)
  //   provider=none   -> local dev / tests: sends nothing
  SMS_PROVIDER: z.enum(['twilio', 'http', 'none']).default('none'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  SMS_HTTP_ENDPOINT: z.string().optional(),
  SMS_HTTP_API_KEY: z.string().optional(),

  // Email (SendGrid)
  SENDGRID_API_KEY: z.string().optional(),

  // Queue / Redis
  //
  // `REDIS_URL` is the preferred form and takes precedence; the discrete
  // host/port/password variables remain for managed-Redis setups that only
  // hand out a hostname.
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  QUEUE_ENABLED: z.string().default('true'),
  REMINDER_CRON: z.string().default('*/5 * * * *'),

  // Payments
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // SaaS Subscription Price IDs — one per plan (Phase 6.1).
  // Create these in the Stripe Dashboard under Products → Prices.
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  PUBLIC_API_URL: z.string().default('http://localhost:3000'),
  PUBLIC_FRONTEND_URL: z.string().default('http://localhost:3001'),

  // Observability
  OTEL_ENABLED: z.string().default('false'),
  OTEL_SERVICE_NAME: z.string().default('curavet-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),

  // Docs
  DOCS_ENABLED: z.string().default('false'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

const raw = parsed.data;

function bool(value: string): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Resolve Redis connection settings.
 *
 * A `REDIS_URL` wins outright; otherwise the discrete host/port/password
 * variables are combined, so both compose (`REDIS_URL`) and managed-Redis
 * (`REDIS_HOST`) deployments work without extra configuration.
 */
function resolveRedis(raw: z.infer<typeof EnvSchema>): {
  url?: string;
  host: string;
  port: number;
  password?: string;
} {
  if (raw.REDIS_URL) {
    return { url: raw.REDIS_URL, host: raw.REDIS_HOST, port: Number.parseInt(raw.REDIS_PORT, 10), password: raw.REDIS_PASSWORD };
  }
  return {
    host: raw.REDIS_HOST,
    port: Number.parseInt(raw.REDIS_PORT, 10),
    password: raw.REDIS_PASSWORD,
  };
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: Number.parseInt(raw.PORT, 10),
  jwtTtlSeconds: Number.parseInt(raw.JWT_TTL_SECONDS, 10),
  jwtRefreshTtlSeconds: Number.parseInt(raw.JWT_REFRESH_TTL_SECONDS, 10),
  queueEnabled: bool(raw.QUEUE_ENABLED),
  otelEnabled: bool(raw.OTEL_ENABLED),
  docsEnabled: bool(raw.DOCS_ENABLED),
  redis: resolveRedis(raw),
} as const;

export type Env = typeof env;

/**
 * Guard that prevents insecure defaults from reaching production.
 * Called during server bootstrap so deployment fails fast instead of leaking data.
 */
export function assertProductionSafety(): string[] {
  const warnings: string[] = [];

  if (!env.isProduction) return warnings;

  if (env.JWT_SECRET === 'curavet_super_jwt_secret_change_in_production_2026') {
    throw new Error('Refusing to start in production with the default JWT_SECRET.');
  }
  if (env.CREDENTIALS_ENCRYPTION_KEY === 'curavet_aes256_encryption_master_key_2026') {
    throw new Error('Refusing to start in production with the default CREDENTIALS_ENCRYPTION_KEY.');
  }
  if (env.SUPERADMIN_PASSWORD === 'admin123') {
    throw new Error('Refusing to start in production with the default SUPERADMIN_PASSWORD.');
  }
  if (!env.META_APP_SECRET) {
    warnings.push('META_APP_SECRET is not set — inbound webhook signature verification is DISABLED.');
  }
  if (!env.STRIPE_SECRET_KEY) {
    warnings.push('STRIPE_SECRET_KEY is not set — WhatsApp payment links are DISABLED.');
  }
  if (env.SMS_PROVIDER === 'twilio' && (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN)) {
    warnings.push('SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are missing — SMS falls back to a no-op sink.');
  }
  if (env.SMS_PROVIDER === 'http' && !env.SMS_HTTP_ENDPOINT) {
    warnings.push('SMS_PROVIDER=http but SMS_HTTP_ENDPOINT is missing — SMS falls back to a no-op sink.');
  }
  if (!env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is not set — error reporting is DISABLED.');
  }
  if (env.jwtTtlSeconds > 3600) {
    warnings.push(
      `JWT_TTL_SECONDS=${env.jwtTtlSeconds} exceeds 1h — production access tokens should be short-lived (default 900s) with refresh rotation.`
    );
  }
  if (!env.OTEL_ENABLED) {
    warnings.push('OTEL_ENABLED=false — distributed tracing is DISABLED.');
  }

  return warnings;
}
