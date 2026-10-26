import { Redis } from 'ioredis';
import { env } from '../env';

/**
 * Shared Redis connection for non-BullMQ concerns (session revocation,
 * refresh-token whitelist).
 *
 * BullMQ keeps its own connections (see services/queue.ts). This client is:
 *  - lazy       — tests and dev machines without Redis never pay connection cost;
 *  - short-fuse — commands issued while the client is not `ready` are not sent
 *                 at all, so callers fail in milliseconds instead of waiting on
 *                 a connect retry loop (which previously dead-locked webhook
 *                 and auth tests for the full ioredis retry window).
 */
let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;

  try {
    const options: Record<string, unknown> = {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      connectTimeout: 2_000,
    };

    if (env.redis.url) {
      client = new Redis(env.redis.url, options);
    } else {
      client = new Redis({
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password || undefined,
        ...options,
      });
    }

    client.on('error', (error) => {
      console.warn(`[redis] connection error: ${error.message}`);
    });
  } catch (error) {
    console.warn(`[redis] unavailable: ${(error as Error).message}`);
    client = null;
  }

  return client;
}

/**
 * Kick off a background connection attempt. Safe to call repeatedly; it never
 * throws and never blocks the caller. Callers that need the connection simply
 * poll `withRedis`, which short-circuits until `ready`.
 */
export function ensureRedisConnecting(): void {
  const redis = getRedis();
  if (!redis) return;
  if (redis.status === 'wait' || redis.status === 'end') {
    void redis.connect().catch(() => {
      // Retry hop: next withRedis() call kicks again if Redis came back up.
    });
  }
}

/**
 * Run a command only when the client is ready; otherwise return the fallback.
 * Also guards against a command blocking forever by racing a soft timeout.
 */
export async function withRedis<T>(
  fn: (redis: Redis) => Promise<T>,
  fallback: T,
  softTimeoutMs = 500
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fallback;

  ensureRedisConnecting();

  // Not ready yet (or connection dropped): skip the command entirely.
  if (redis.status !== 'ready') return fallback;

  try {
    return await Promise.race([
      fn(redis),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), softTimeoutMs)),
    ]);
  } catch (error) {
    console.warn(`[redis] command failed: ${(error as Error)?.message}`);
    return fallback;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => client?.disconnect());
    client = null;
  }
}
