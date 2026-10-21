import * as Sentry from '@sentry/node';
import { env } from '../env';

let sentryEnabled = false;

/**
 * Initialise Sentry error reporting. Safe no-op when SENTRY_DSN is absent.
 */
export function initSentry(): boolean {
  if (!env.SENTRY_DSN) {
    return false;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.APP_VERSION || '1.0.0',
    tracesSampleRate: env.isProduction ? 0.1 : 1.0,
    attachStacktrace: true,
  });

  sentryEnabled = true;
  return true;
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (sentryEnabled) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
    return;
  }
  // Fallback so errors are never silently swallowed.
  console.error('[error]', error, context ?? '');
}

export { Sentry };
