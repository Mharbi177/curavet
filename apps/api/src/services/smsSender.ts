import { env } from '../env';

/**
 * SMS outbound layer.
 *
 * Supported provider backends:
 *  - `twilio`  — international SMS, priced per message (default).
 *  - `http`    — any local Tunisian gateway (WinSMS, Tunisianet SMS, etc.)
 *                that accepts a simple authenticated JSON POST. This is far
 *                cheaper in TND than Twilio for start-up clinics.
 *  - `none`    — no-op sink for local development and tests.
 *
 * Selection is env-driven so no account is required to run the stack; the
 * integration stays mock-friendly until real credentials exist.
 */

export interface SmsSendRequest {
  /** Clinic sender identity: an E.164 number or messaging-service identifier. */
  from: string;
  /** Recipient in E.164, e.g. +216XXXXXXXX. */
  to: string;
  message: string;
}

export interface SmsProvider {
  send(request: SmsSendRequest): Promise<void>;
}

/** Twilio Programmable Messaging over the REST v2010-04-01 API. */
export class TwilioSmsProvider implements SmsProvider {
  private readonly sid: string;
  private readonly token: string;

  constructor(accountSid: string, authToken: string) {
    this.sid = accountSid;
    this.token = authToken;
  }

  async send({ from, to, message }: SmsSendRequest): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const params = new URLSearchParams({
        To: to,
        Body: message.slice(0, 1600), // single-segment fallback guard
      });

      // A messaging service sid replaces the explicit sender number when set.
      if (env.TWILIO_MESSAGING_SERVICE_SID) {
        params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
      } else if (from || env.TWILIO_FROM_NUMBER) {
        params.set('From', from || String(env.TWILIO_FROM_NUMBER));
      }

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        // Twilio uses HTTP Basic auth: base64(account_sid:auth_token).
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }
        console.error('Failed to send SMS:', JSON.stringify(errorBody));
        throw new Error(`Twilio SMS error: ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Generic HTTP gateway adapter for local Tunisian SMS providers.
 * Expects a JSON POST: `{ to, from, text }` returning 2xx on success.
 * Endpoint/credentials are env-configured; nothing is required to boot.
 */
export class HttpSmsProvider implements SmsProvider {
  async send({ from, to, message }: SmsSendRequest): Promise<void> {
    const endpoint = env.SMS_HTTP_ENDPOINT;
    if (!endpoint) {
      throw new Error('SMS_HTTP_ENDPOINT is required when SMS_PROVIDER=http');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(env.SMS_HTTP_API_KEY ? { Authorization: `Bearer ${env.SMS_HTTP_API_KEY}` } : {}),
        },
        body: JSON.stringify({ to, from, text: message.slice(0, 1600) }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error(`SMS gateway error ${response.status}: ${detail}`);
        throw new Error(`SMS gateway error: ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Dev/test sink: never sends, never throws. */
export class NoopSmsProvider implements SmsProvider {
  async send(): Promise<void> {
    // Intentionally silent — used when no provider is configured.
  }
}

function resolveProvider(authToken?: string): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'twilio': {
      const accountSid = env.TWILIO_ACCOUNT_SID;
      const token = authToken || env.TWILIO_AUTH_TOKEN;
      if (!accountSid || !token) {
        return new NoopSmsProvider();
      }
      return new TwilioSmsProvider(accountSid, token);
    }
    case 'http':
      return env.SMS_HTTP_ENDPOINT ? new HttpSmsProvider() : new NoopSmsProvider();
    case 'none':
    default:
      return new NoopSmsProvider();
  }
}

export class SmsSender {
  private readonly provider: SmsProvider;

  /**
   * @param authToken Optional per-tenant Twilio auth token (from the tenant's
   *                  encrypted integration credentials). Env token is used as
   *                  the platform-level fallback.
   */
  constructor(authToken?: string) {
    this.provider = resolveProvider(authToken);
  }

  /**
   * @param from Clinic sender number / messaging-service sid (twilio) or the
   *             tenant's sender id on the local gateway.
   */
  async sendTextMessage(from: string, to: string, message: string): Promise<void> {
    // No sender identity and no service sid configured -> nothing to deliver.
    if (!from && !env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_NUMBER) {
      throw new Error('No SMS sender identity configured for this tenant.');
    }
    await this.provider.send({ from, to, message });
  }
}
