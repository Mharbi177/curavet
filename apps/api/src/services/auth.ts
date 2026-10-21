import { createHmac, timingSafeEqual } from 'crypto';

export interface TokenPayload {
  sub: string;
  email: string;
  role: 'super_admin' | 'salon_admin' | 'staff';
  tenantId?: string;
  iat?: number;
  exp?: number;
}

/**
 * Lightweight, zero-dependency HS256 JWT implementation compliant with standard JWT structure.
 */
export class AuthService {
  private static base64UrlEncode(str: string | Buffer): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private static base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Generates a signed HS256 JWT token. Default expiration: 24 hours.
   */
  static signToken(payload: TokenPayload, secret: string, expiresInSeconds = 86400): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: TokenPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', secret)
      .update(dataToSign)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${dataToSign}.${signature}`;
  }

  /**
   * Validates token signature and expiration. Returns payload if valid, null otherwise.
   */
  static verifyToken(token: string, secret: string): TokenPayload | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = createHmac('sha256', secret)
      .update(dataToSign)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expSigBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expSigBuf.length || !timingSafeEqual(sigBuf, expSigBuf)) {
      return null;
    }

    try {
      const payload: TokenPayload = JSON.parse(this.base64UrlDecode(encodedPayload));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && now > payload.exp) {
        return null; // Token expired
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Extracts Bearer token from HTTP Authorization header.
   */
  static extractBearerToken(authHeader: string | undefined | null): string | null {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
    return null;
  }
}

// ─── Password hashing (node:crypto scrypt — no third-party dependency) ───────

import { scryptSync, randomBytes } from 'crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

function toHex(buffer: Buffer): string {
  return buffer.toString('hex');
}

/**
 * Hash a password with scrypt. Format: `scrypt$N$salt$hash`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_COST}$${toHex(salt)}$${toHex(derived)}`;
}

/**
 * Verify a password against a stored hash in constant time.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, cost, saltHex, hashHex] = stored.split('$');

    if (scheme !== 'scrypt' || !cost || !saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number.parseInt(cost, 10),
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    });

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
