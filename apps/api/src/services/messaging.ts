import { prisma } from '../lib/prisma';
import { env } from '../env';
import { CryptoService } from './crypto';
import { WhatsAppSender } from './whatsappSender';
import { InstagramSender } from './instagramSender';
import { SmsSender } from './smsSender';
import { EmailSender } from './emailSender';
import { messagesSentTotal } from './metrics';

export type OutboundPlatform = 'whatsapp' | 'instagram' | 'sms' | 'email';

export interface ResolvedChannel {
  platform: OutboundPlatform;
  externalAccountId?: string; // SMS uses phone number, Email uses verified sender
  accessToken: string; // For email, this is the SendGrid API Key
}

/**
 * Resolve the outbound channel for a tenant and decrypt its stored credentials.
 *
 * Credentials in `TenantIntegration.encryptedCredentials` are AES-256-GCM
 * ciphertext written by `POST /api/tenants/:id/integrations`. Legacy plaintext
 * rows are detected and still accepted so existing deployments keep working.
 */
export async function resolveChannel(
  tenantId: string,
  preferred: OutboundPlatform = 'whatsapp'
): Promise<ResolvedChannel | null> {
  const order: OutboundPlatform[] = preferred === 'whatsapp' ? ['whatsapp', 'instagram', 'sms', 'email'] : ['instagram', 'whatsapp', 'sms', 'email'];

  for (const platform of order) {
    const integration = await prisma.tenantIntegration.findFirst({
      where: { tenantId, platform, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });

    if (!integration) continue;

    const resolvedExternalAccountId = integration.externalAccountId;
    if (!resolvedExternalAccountId) continue;

    const stored = integration.encryptedCredentials;
    const decrypted = stored ? CryptoService.decrypt(stored, env.CREDENTIALS_ENCRYPTION_KEY) : null;

    const fallback =
      platform === 'whatsapp'
        ? env.WHATSAPP_TOKEN
        : platform === 'instagram'
          ? env.INSTAGRAM_TOKEN
          : platform === 'sms'
            ? env.TWILIO_AUTH_TOKEN
            : env.SENDGRID_API_KEY;

    const accessToken = decrypted || (stored && !decrypted && looksLikePlainToken(stored) ? stored : null) || fallback;

    if (!accessToken) continue;

    return { platform, resolvedExternalAccountId, accessToken };
  }

  return null;
}

/**
 * Legacy rows written before encryption was introduced still hold raw tokens.
 * Those are long opaque strings without the `iv:tag:ciphertext` separator.
 */
function looksLikePlainToken(value: string): boolean {
  return value.split(':').length !== 3 && value.length > 20;
}

export interface SendResult {
  ok: boolean;
  platform: OutboundPlatform | null;
  error?: string;
}

/**
 * Send a text message to a client over whichever channel the tenant has connected.
 * Never throws — callers are background workers and webhook handlers that must
 * record the failure instead of crashing.
 */
export async function sendToClient(params: {
  tenantId: string;
  to: string;
  message: string;
  platform?: OutboundPlatform;
}): Promise<SendResult> {
  let platform: OutboundPlatform | null = null;

  try {
    const channel = await resolveChannel(params.tenantId, params.platform ?? 'whatsapp');
    if (!channel) {
      messagesSentTotal.inc({ tenant_id: params.tenantId, platform: 'none', outcome: 'no_channel' });
      return { ok: false, platform: null, error: 'No active messaging integration for tenant.' };
    }

    platform = channel.platform;

    if (channel.platform === 'whatsapp') {
      const sender = new WhatsAppSender(channel.accessToken);
      await sender.sendTextMessage(channel.resolvedExternalAccountId, params.to, params.message);
    } else if (channel.platform === 'sms') {
      const sender = new SmsSender(channel.accessToken);
      await sender.sendTextMessage(channel.resolvedExternalAccountId, params.to, params.message);
    } else if (channel.platform === 'email') {
      const sender = new EmailSender(channel.accessToken);
      await sender.sendEmail(params.to, 'GlamBot message', params.message, params.message);
    } else {
      const sender = new InstagramSender(channel.accessToken);
      await sender.sendTextMessage(channel.resolvedExternalAccountId, params.to, params.message);
    }

    messagesSentTotal.inc({ tenant_id: params.tenantId, platform: channel.platform, outcome: 'sent' });
    return { ok: true, platform: channel.platform };
  } catch (error) {
    messagesSentTotal.inc({ tenant_id: params.tenantId, platform: platform ?? 'unknown', outcome: 'failed' });
    return {
      ok: false,
      platform,
      error: error instanceof Error ? error.message : 'Unknown messaging error',
    };
  }
}

/**
 * Increment the monthly outbound message counter used for billing.
 */
export async function trackMessageSent(tenantId: string, count = 1): Promise<void> {
  const now = new Date();
  const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  await prisma.usageRecord.upsert({
    where: { tenantId_monthYear: { tenantId, monthYear } },
    create: { tenantId, monthYear, messagesSentCount: count },
    update: { messagesSentCount: { increment: count } },
  });
}

/**
 * Increment the monthly AI interaction counter used for billing.
 */
export async function trackAiInteraction(tenantId: string, count = 1): Promise<void> {
  const now = new Date();
  const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  await prisma.usageRecord.upsert({
    where: { tenantId_monthYear: { tenantId, monthYear } },
    create: { tenantId, monthYear, aiInteractionsCount: count },
    update: { aiInteractionsCount: { increment: count } },
  });
}
