import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';
import { formatInTimeZone } from 'date-fns-tz';
import { env } from '../env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { jobsProcessedTotal } from './metrics';
import { sendToClient, trackMessageSent } from './messaging';
import { buildReviewRequest } from './reviews';
import { offerFreedSlot } from './waitlist';

export const QUEUE_NAMES = {
  REMINDERS: 'glambot-reminders',
  OUTBOUND: 'glambot-outbound',
  BROADCAST: 'glambot-broadcast',
  LIFECYCLE: 'glambot-lifecycle',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job payload contracts ───────────────────────────────────────────────────
export interface ReminderJobData {
  bookingId: string;
  tenantId: string;
  type: '1h' | '24h';
}

export interface OutboundJobData {
  tenantId: string;
  to: string;
  message: string;
  platform?: 'whatsapp' | 'instagram';
}

export interface BroadcastJobData {
  broadcastId: string;
  tenantId: string;
}

export interface LifecycleJobData {
  kind: 'review_request' | 'waitlist_offer';
  tenantId: string;
  bookingId?: string;
}

/**
 * BullMQ connection options.
 *
 * When `REDIS_URL` is set we let ioredis parse it, which supports `rediss://`
 * and per-URL credentials (common on managed Redis). Otherwise we fall back to
 * the discrete host/port/password form.
 */
const connection: ConnectionOptions = env.redis.url
  ? // BullMQ requires blocking connections to disable the request retry limit.
    { url: env.redis.url, maxRetriesPerRequest: null }
  : {
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password || undefined,
      maxRetriesPerRequest: null,
    };

const queues: Queue[] = [];
const workers: Worker[] = [];
let started = false;
let redisHealthy = true;

export function isRedisHealthy(): boolean {
  return redisHealthy;
}

function markUnhealthy(scope: string, error: Error): void {
  if (redisHealthy) {
    logger.warn(`[queue] Redis unavailable (${scope}): ${error.message}. Jobs will be skipped until Redis recovers.`);
  }
  redisHealthy = false;
}

function makeQueue(name: QueueName): Queue {
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  });

  queue.on('error', (error) => markUnhealthy(queue.name, error));
  queues.push(queue);
  return queue;
}

let reminderQueueInstance: Queue | null = null;
let outboundQueueInstance: Queue | null = null;
let broadcastQueueInstance: Queue | null = null;
let lifecycleQueueInstance: Queue | null = null;

export function getReminderQueue(): Queue {
  reminderQueueInstance ??= makeQueue(QUEUE_NAMES.REMINDERS);
  return reminderQueueInstance;
}

export function getOutboundQueue(): Queue {
  outboundQueueInstance ??= makeQueue(QUEUE_NAMES.OUTBOUND);
  return outboundQueueInstance;
}

export function getBroadcastQueue(): Queue {
  broadcastQueueInstance ??= makeQueue(QUEUE_NAMES.BROADCAST);
  return broadcastQueueInstance;
}

export function getLifecycleQueue(): Queue {
  lifecycleQueueInstance ??= makeQueue(QUEUE_NAMES.LIFECYCLE);
  return lifecycleQueueInstance;
}

// ─── Producer API ────────────────────────────────────────────────────────────

/**
 * Queue the 24h and 1h reminders for a confirmed booking.
 * Idempotent: BullMQ job ids prevent duplicate reminders on retries/redeploys.
 */
export async function scheduleBookingReminders(bookingId: string): Promise<void> {
  if (!env.queueEnabled) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, tenantId: true, scheduledAt: true, status: true },
  });

  if (!booking || booking.status === 'cancelled') return;

  const now = Date.now();
  const queue = getReminderQueue();

  const windows: Array<{ type: '24h' | '1h'; offsetMs: number }> = [
    { type: '24h', offsetMs: 24 * 60 * 60 * 1000 },
    { type: '1h', offsetMs: 60 * 60 * 1000 },
  ];

  for (const window of windows) {
    const fireAt = booking.scheduledAt.getTime() - window.offsetMs;
    if (fireAt <= now) continue;

    try {
      await queue.add(
        'send-reminder',
        { bookingId: booking.id, tenantId: booking.tenantId, type: window.type } satisfies ReminderJobData,
        { delay: fireAt - now, jobId: `reminder-${window.type}-${booking.id}` }
      );
    } catch (error) {
      logger.warn(`[queue] could not schedule ${window.type} reminder for ${booking.id}`, (error as Error).message);
    }
  }
}

/**
 * Remove pending reminders when a booking is cancelled or rescheduled.
 */
export async function cancelBookingReminders(bookingId: string): Promise<void> {
  if (!env.queueEnabled) return;

  const queue = getReminderQueue();
  for (const type of ['24h', '1h'] as const) {
    try {
      const job = await queue.getJob(`reminder-${type}-${bookingId}`);
      if (job) await job.remove();
    } catch (error) {
      logger.warn(`[queue] could not remove ${type} reminder for ${bookingId}`, (error as Error).message);
    }
  }
}

/**
 * Queue an outbound client message.
 */
export async function enqueueOutbound(data: OutboundJobData, delayMs = 0): Promise<void> {
  if (!env.queueEnabled) return;

  try {
    await getOutboundQueue().add('send-message', data, delayMs > 0 ? { delay: delayMs } : undefined);
  } catch (error) {
    logger.warn('[queue] could not enqueue outbound message', (error as Error).message);
  }
}

/**
 * Queue a broadcast campaign for delivery.
 */
export async function enqueueBroadcast(broadcastId: string, tenantId: string, delayMs = 0): Promise<void> {
  if (!env.queueEnabled) return;

  try {
    await getBroadcastQueue().add(
      'send-broadcast',
      { broadcastId, tenantId } satisfies BroadcastJobData,
      { ...(delayMs > 0 ? { delay: delayMs } : {}), jobId: `broadcast-${broadcastId}` }
    );
  } catch (error) {
    logger.warn('[queue] could not enqueue broadcast', (error as Error).message);
  }
}

/**
 * Queue a lifecycle follow-up (review request after completion, waitlist offer
 * after a cancellation).
 */
export async function enqueueLifecycle(data: LifecycleJobData, delayMs = 0): Promise<void> {
  if (!env.queueEnabled) return;

  try {
    const jobId =
      data.kind === 'review_request'
        ? `review-${data.bookingId}`
        : `waitlist-${data.bookingId}`;

    await getLifecycleQueue().add('lifecycle', data, {
      ...(delayMs > 0 ? { delay: delayMs } : {}),
      jobId,
    });
  } catch (error) {
    logger.warn('[queue] could not enqueue lifecycle job', (error as Error).message);
  }
}


// ─── Worker implementations ──────────────────────────────────────────────────

async function processReminder(job: Job<ReminderJobData>): Promise<void> {
  const { bookingId, tenantId, type } = job.data;

  // The repeatable sweeper job re-queues missed reminders as individual jobs.
  if (bookingId === 'sweep') {
    const count = await sweepDueReminders();
    if (count > 0) {
      logger.info(`[queue] reminder sweep enqueued ${count} due reminder(s).`);
    }
    return;
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, tenantId },
    include: { client: true, service: true, staff: true, tenant: true },
  });

  if (!booking) return;
  if (!booking.tenant.remindersEnabled) return;
  if (booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'no_show') return;

  const alreadySent = type === '24h' ? booking.reminder24hSent : booking.reminder1hSent;
  // Guard against duplicate sends when a job is retried after partial failure.
  if (alreadySent) return;

  const phone = booking.client.phone;
  if (!phone) return;

  const timezone = booking.tenant.timezone;
  const timeStr = formatInTimeZone(booking.scheduledAt, timezone, 'HH:mm');
  const dateStr = formatInTimeZone(booking.scheduledAt, timezone, 'EEEE, MMM d');
  const isArabic = (booking.client.languagePreference || 'en') === 'ar';

  const message = type === '24h'
    ? isArabic
      ? `تذكير: موعدك لـ${booking.service.nameAr} مع ${booking.staff.name} غداً الساعة ${timeStr} (${dateStr}). نتطلع لرؤيتك!`
      : `Reminder: your appointment for ${booking.service.nameEn} with ${booking.staff.name} is tomorrow at ${timeStr} (${dateStr}). See you then!`
    : isArabic
      ? `موعدك لـ${booking.service.nameAr} مع ${booking.staff.name} بعد ساعة واحدة، الساعة ${timeStr}. بانتظارك!`
      : `Your appointment for ${booking.service.nameEn} with ${booking.staff.name} is in 1 hour at ${timeStr}. We look forward to seeing you!`;

  const result = await sendToClient({ tenantId, to: phone, message });

  if (!result.ok) {
    // Throwing lets BullMQ retry with backoff instead of silently dropping the reminder.
    throw new Error(result.error || 'Reminder delivery failed');
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: type === '24h' ? { reminder24hSent: true } : { reminder1hSent: true },
  });
}

async function processOutbound(job: Job<OutboundJobData>): Promise<void> {
  const { tenantId, to, message, platform } = job.data;
  const result = await sendToClient({ tenantId, to, message, platform });

  if (!result.ok) {
    throw new Error(result.error || 'Outbound delivery failed');
  }

  await trackMessageSent(tenantId);
}

async function processBroadcast(job: Job<BroadcastJobData>): Promise<void> {
  const { broadcastId, tenantId } = job.data;

  const broadcast = await prisma.broadcast.findFirst({ where: { id: broadcastId, tenantId } });
  if (!broadcast) return;
  if (broadcast.status === 'sent' || broadcast.status === 'sending') return;

  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'sending' } });

  const recipients = await resolveAudience(tenantId, broadcast.audience, broadcast.customClientIds);

  let sent = 0;
  let failed = 0;

  for (const client of recipients) {
    const phone = client.phone;
    if (!phone) {
      failed += 1;
      continue;
    }

    const personalised = broadcast.message
      .replace(/\{\{name\}\}/g, client.name || 'there')
      .replace(/\{\{phone\}\}/g, phone);

    const result = await sendToClient({ tenantId, to: phone, message: personalised });

    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: failed > 0 && sent === 0 ? 'failed' : 'sent',
      sentAt: new Date(),
      recipientCount: recipients.length,
      deliveredCount: sent,
      failedCount: failed,
    },
  });

  await prisma.usageRecord.upsert({
    where: { tenantId_monthYear: { tenantId, monthYear: currentMonthYear() } },
    create: { tenantId, monthYear: currentMonthYear(), broadcastSentCount: sent },
    update: { broadcastSentCount: { increment: sent } },
  });
}

function currentMonthYear(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
}

/**
 * Segment a tenant's client list for a broadcast campaign.
 * Phase 4.4 — audience segmentation.
 */
export async function resolveAudience(
  tenantId: string,
  audience: string,
  customClientIds: string[] = []
) {
  switch (audience) {
    case 'vip':
      return prisma.client.findMany({ where: { tenantId, isVip: true } });
    case 'inactive': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return prisma.client.findMany({
        where: { tenantId, lastContactAt: { lt: thirtyDaysAgo } },
      });
    }
    case 'custom':
      return prisma.client.findMany({
        where: { tenantId, id: { in: customClientIds } },
      });
    case 'all':
    default:
      return prisma.client.findMany({ where: { tenantId } });
  }
}


async function processLifecycle(job: Job<LifecycleJobData>): Promise<void> {
  const { kind, tenantId, bookingId } = job.data;
  if (!bookingId) return;

  if (kind === 'review_request') {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { tenant: true, client: true },
    });

    if (!booking || !booking.tenant.reviewsEnabled) return;
    if (booking.status !== 'completed') return;

    const phone = booking.client.phone;
    if (!phone) return;

    const request = await buildReviewRequest({
      tenantId,
      bookingId,
      languageCode: booking.client.languagePreference || 'en',
    });

    if (!request) return;
    await sendToClient({ tenantId, to: phone, message: request.message });
    return;
  }

  if (kind === 'waitlist_offer') {
    const offers = await offerFreedSlot({ tenantId, freedBookingId: bookingId });

    for (const offer of offers) {
      if (!offer.clientPhone) continue;

      const isArabic = offer.languageCode === 'ar';
      const timeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(offer.slot);

      const message = isArabic
        ? `خبر سعيد! توفر موعد لـ${offer.serviceName} مع ${offer.staffName} الساعة ${timeStr}. أرسلي "نعم" لتأكيد الحجز. العرض صالح لمدة ساعة.`
        : `Good news! A slot just opened for ${offer.serviceName} with ${offer.staffName} at ${timeStr}. Reply "yes" to claim it — this offer is valid for 1 hour.`;

      await sendToClient({ tenantId, to: offer.clientPhone, message });
    }
  }
}

// ─── Worker bootstrap ────────────────────────────────────────────────────────
function makeWorker<T>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<void>,
  concurrency: number
): Worker<T> {
  const worker = new Worker<T>(name, processor, { connection, concurrency });
  worker.on('error', (error) => markUnhealthy(name, error));
  worker.on('failed', (job, error) => {
    jobsProcessedTotal.inc({ queue: name, outcome: 'failed' });
    logger.error(`[worker:${name}] job ${job?.id ?? 'unknown'} failed: ${error.message}`);
  });
  worker.on('completed', () => {
    jobsProcessedTotal.inc({ queue: name, outcome: 'success' });
  });
  workers.push(worker as unknown as Worker);
  return worker;
}

/**
 * Start all BullMQ workers.
 *
 * Safe to call when Redis is down: connections retry in the background and the
 * HTTP API keeps serving traffic. Returns false when queues are disabled.
 */
export function startWorkers(): boolean {
  if (!env.queueEnabled) {
    logger.info('[queue] QUEUE_ENABLED=false — background workers not started.');
    return false;
  }
  if (started) return true;

  makeWorker<ReminderJobData>(QUEUE_NAMES.REMINDERS, processReminder, 5);
  makeWorker<OutboundJobData>(QUEUE_NAMES.OUTBOUND, processOutbound, 10);
  makeWorker<BroadcastJobData>(QUEUE_NAMES.BROADCAST, processBroadcast, 2);
  makeWorker<LifecycleJobData>(QUEUE_NAMES.LIFECYCLE, processLifecycle, 5);

  started = true;
  logger.info('[queue] BullMQ workers started (reminders, outbound, broadcast, lifecycle).');
  return true;
}

/**
 * Register the repeatable sweeper that catches bookings created before the queue
 * existed, plus bookings whose delayed job was lost (e.g. Redis data loss).
 */
export async function registerRepeatableJobs(): Promise<void> {
  if (!env.queueEnabled) return;

  try {
    await getReminderQueue().add(
      'sweep-due-reminders',
      { bookingId: 'sweep', tenantId: 'sweep', type: '1h' } satisfies ReminderJobData,
      {
        repeat: { pattern: env.REMINDER_CRON },
        jobId: 'reminder-sweeper',
      }
    );
    logger.info(`[queue] reminder sweeper registered with cron "${env.REMINDER_CRON}".`);
  } catch (error) {
    logger.warn('[queue] could not register reminder sweeper', (error as Error).message);
  }
}

/**
 * Safety net: find bookings whose reminder window has arrived but the flag is
 * still false and ensure a job exists for them.
 */
export async function sweepDueReminders(): Promise<number> {
  const now = new Date();
  let enqueued = 0;

  for (const type of ['1h', '24h'] as const) {
    const offsetMs = type === '24h' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const from = new Date(now.getTime() + offsetMs - 10 * 60 * 1000);
    const to = new Date(now.getTime() + offsetMs);

    const due = await prisma.booking.findMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        scheduledAt: { gte: from, lte: to },
        ...(type === '24h' ? { reminder24hSent: false } : { reminder1hSent: false }),
        tenant: { remindersEnabled: true },
      },
      select: { id: true, tenantId: true },
      take: 200,
    });

    for (const booking of due) {
      await enqueueOutboundSafeReminder(booking.id, booking.tenantId, type);
      enqueued += 1;
    }
  }

  return enqueued;
}

async function enqueueOutboundSafeReminder(
  bookingId: string,
  tenantId: string,
  type: '1h' | '24h'
): Promise<void> {
  try {
    await getReminderQueue().add(
      'send-reminder',
      { bookingId, tenantId, type } satisfies ReminderJobData,
      { jobId: `reminder-${type}-${bookingId}` }
    );
  } catch {
    // Ignore: the next sweep will retry.
  }
}

/**
 * Close every queue and worker. Called from the graceful shutdown hook so
 * in-flight jobs finish before the process exits.
 */
export async function stopQueues(): Promise<void> {
  await Promise.allSettled([
    ...workers.map((worker) => worker.close()),
    ...queues.map((queue) => queue.close()),
  ]);
  workers.length = 0;
  queues.length = 0;
  reminderQueueInstance = null;
  outboundQueueInstance = null;
  broadcastQueueInstance = null;
  lifecycleQueueInstance = null;
  started = false;
}

