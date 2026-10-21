import { env } from '../env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVELS[(env.LOG_LEVEL as LogLevel) in LEVELS ? (env.LOG_LEVEL as LogLevel) : 'info'];

function emit(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    service: env.OTEL_SERVICE_NAME,
    msg: message,
    ...(meta !== undefined ? { meta } : {}),
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Structured JSON logger used by background workers, services and bootstrap code.
 * Fastify keeps its own pino logger for HTTP request logging.
 */
export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};

export type Logger = typeof logger;
