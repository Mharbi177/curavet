import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { env } from '../env';

let sdk: NodeSDK | null = null;

/**
 * Boot OpenTelemetry tracing.
 *
 * Deliberately defensive: if the SDK or exporter cannot be initialised the API
 * still boots and serves traffic — observability must never be a single point
 * of failure for a booking platform.
 */
export async function initTelemetry(): Promise<boolean> {
  if (!env.otelEnabled) {
    return false;
  }

  try {
    if (!env.isProduction) {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
    }

    const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: env.NODE_ENV,
      }),
      traceExporter: endpoint
        ? new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` })
        : undefined,
    });

    await sdk.start();
    return true;
  } catch (error) {
    console.warn('[telemetry] OpenTelemetry initialisation failed; continuing without tracing.', error);
    sdk = null;
    return false;
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (error) {
    console.warn('[telemetry] shutdown failed', error);
  } finally {
    sdk = null;
  }
}

export function getTracer(name = 'glambot-api') {
  return trace.getTracer(name);
}

/**
 * Convenience wrapper that records a span for an async operation.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      span.setAttributes(attributes);
      const result = await fn();
      span.setStatus({ code: 1 });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error)?.message });
      throw error;
    } finally {
      span.end();
    }
  });
}

export { trace };
