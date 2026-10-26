import { env } from '../env';
import { withRedis } from '../lib/redis';

/**
 * JWT session management backed by Redis.
 *
 *  - Refresh tokens are stored under a whitelist: a refresh token is only
 *    accepted while its `jti` row exists. Rotation atomically deletes the old
 *    row, so a replayed refresh token is rejected.
 *  - Access-token `jti`s can be individually revoked (logout / ban) until their
 *    natural expiry.
 *
 * Availability policy: revocation checks fail OPEN when Redis is unreachable
 * (an outage must not brick logins) and the refresh whitelist fails CLOSED
 * (unknown state is untrusted — users simply re-login). Commands are skipped
 * entirely instead of queued while the client reconnects, so these helpers
 * resolve in milliseconds during a Redis outage.
 */

const REFRESH_PREFIX = 'curavet:refresh:';
const REVOKE_PREFIX = 'curavet:revoke:';

export interface RefreshSession {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

export async function storeRefreshSession(jti: string, session: RefreshSession): Promise<void> {
  await withRedis(
    (redis) => redis.set(`${REFRESH_PREFIX}${jti}`, JSON.stringify(session), 'EX', env.jwtRefreshTtlSeconds),
    undefined as unknown as string
  );
}

/**
 * Atomically read + delete a refresh session (rotation). Returns null when the
 * session is unknown — meaning it expired, was already rotated, or Redis is
 * unavailable (fail-closed).
 */
export async function consumeRefreshSession(jti: string): Promise<RefreshSession | null> {
  const raw = await withRedis(
    // GETDEL (Redis >= 6.2): atomic read-and-delete, the essence of rotation.
    (redis) => redis.getdel(`${REFRESH_PREFIX}${jti}`),
    null
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RefreshSession;
  } catch {
    return null;
  }
}

export async function deleteRefreshSession(jti: string): Promise<void> {
  await withRedis((redis) => redis.del(`${REFRESH_PREFIX}${jti}`), 0);
}

/** Revoke an access-token jti until it would naturally expire. */
export async function revokeJti(jti: string, expiresAtEpochSeconds: number): Promise<void> {
  const ttl = expiresAtEpochSeconds - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return; // Already expired; nothing to revoke.

  await withRedis(
    (redis) => redis.set(`${REVOKE_PREFIX}${jti}`, '1', 'EX', ttl),
    undefined as unknown as string
  );
}

/** Returns true when the jti has been revoked. Fails open on Redis outage. */
export async function isJtiRevoked(jti: string): Promise<boolean> {
  const value = await withRedis((redis) => redis.get(`${REVOKE_PREFIX}${jti}`), null);
  return value !== null;
}
