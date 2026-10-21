import client from 'prom-client';

/**
 * Prometheus metrics registry. Exposed at GET /metrics for scraping.
 */
export const registry = new client.Registry();

client.collectDefaultMetrics({
  register: registry,
  prefix: 'glambot_',
});

export const httpRequestDuration = new client.Histogram({
  name: 'glambot_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'glambot_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const aiInteractionsTotal = new client.Counter({
  name: 'glambot_ai_interactions_total',
  help: 'Total AI agent interactions',
  labelNames: ['tenant_id', 'outcome'],
  registers: [registry],
});

export const aiInteractionDuration = new client.Histogram({
  name: 'glambot_ai_interaction_duration_seconds',
  help: 'Duration of AI agent processing in seconds',
  labelNames: ['tenant_id', 'platform'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30],
  registers: [registry],
});

export const jobsProcessedTotal = new client.Counter({
  name: 'glambot_jobs_processed_total',
  help: 'Total background jobs processed',
  labelNames: ['queue', 'outcome'],
  registers: [registry],
});

export const messagesSentTotal = new client.Counter({
  name: 'glambot_messages_sent_total',
  help: 'Total outbound platform messages',
  labelNames: ['tenant_id', 'platform', 'outcome'],
  registers: [registry],
});

export const webhookEventsTotal = new client.Counter({
  name: 'glambot_webhook_events_total',
  help: 'Total inbound webhook events',
  labelNames: ['platform', 'outcome'],
  registers: [registry],
});

export const queueDepth = new client.Gauge({
  name: 'glambot_queue_depth',
  help: 'Number of waiting jobs per queue',
  labelNames: ['queue'],
  registers: [registry],
});

export const bookingsTotal = new client.Counter({
  name: 'glambot_bookings_total',
  help: 'Booking creation attempts by outcome and source',
  labelNames: ['outcome', 'source'],
  registers: [registry],
});

export const bookingDuration = new client.Histogram({
  name: 'glambot_booking_duration_seconds',
  help: 'Wall-clock time to create a booking, including conflict checks',
  labelNames: ['source'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const activeConversations = new client.Gauge({
  name: 'glambot_active_conversations',
  help: 'Number of active conversations',
  registers: [registry],
});

export async function metricsText(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;

export { client as promClient };
