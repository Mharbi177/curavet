import { describe, expect, it } from 'vitest';
import { CryptoService } from './crypto';
import { AuthService, hashPassword, verifyPassword } from './auth';

describe('CryptoService — credential encryption', () => {
  const SECRET = 'unit-test-encryption-key';

  it('round-trips a token with the same secret', () => {
    const encrypted = CryptoService.encrypt('wa-token-abc123', SECRET);
    expect(encrypted).not.toContain('wa-token-abc123');
    expect(CryptoService.decrypt(encrypted, SECRET)).toBe('wa-token-abc123');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = CryptoService.encrypt('same-input', SECRET);
    const b = CryptoService.encrypt('same-input', SECRET);
    expect(a).not.toBe(b);
  });

  it('refuses to decrypt with the wrong secret', () => {
    const encrypted = CryptoService.encrypt('secret', SECRET);
    expect(CryptoService.decrypt(encrypted, 'other-secret')).toBeNull();
  });

  it('returns null for malformed ciphertext instead of throwing', () => {
    expect(CryptoService.decrypt('not-valid', SECRET)).toBeNull();
    expect(CryptoService.decrypt('a:b:c', SECRET)).toBeNull();
  });

  it('detects tampering with the auth tag', () => {
    const encrypted = CryptoService.encrypt('secret', SECRET);
    const [iv, , data] = encrypted.split(':');
    expect(CryptoService.decrypt(`${iv}:deadbeef:${data}`, SECRET)).toBeNull();
  });
});

describe('CryptoService — Meta webhook signature verification', () => {
  it('accepts a valid signature', () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account' });
    const sig = CryptoService.computeHmacSignature(body, 'meta-secret');
    expect(CryptoService.verifyWebhookSignature(body, sig, 'meta-secret')).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const body = JSON.stringify({ object: 'a' });
    const sig = CryptoService.computeHmacSignature(body, 'meta-secret');
    expect(CryptoService.verifyWebhookSignature(JSON.stringify({ object: 'b' }), sig, 'meta-secret')).toBe(
      false
    );
  });

  it('rejects a wrong app secret', () => {
    const body = JSON.stringify({ object: 'a' });
    const sig = CryptoService.computeHmacSignature(body, 'meta-secret');
    expect(CryptoService.verifyWebhookSignature(body, sig, 'other-secret')).toBe(false);
  });

  it('rejects missing, malformed and wrong-length headers', () => {
    const body = '{"a":1}';
    expect(CryptoService.verifyWebhookSignature(body, undefined, 's')).toBe(false);
    expect(CryptoService.verifyWebhookSignature(body, null, 's')).toBe(false);
    expect(CryptoService.verifyWebhookSignature(body, 'garbage', 's')).toBe(false);
    expect(CryptoService.verifyWebhookSignature(body, 'sha256=abc', 's')).toBe(false);
  });
});

describe('AuthService — JWT', () => {
  const SECRET = 'unit-test-jwt-secret';

  it('issues and validates a token', () => {
    const token = AuthService.signToken(
      { sub: 'admin-1', email: 'admin@glambot.io', role: 'super_admin' },
      SECRET,
      60
    );

    const payload = AuthService.verifyToken(token, SECRET);
    expect(payload?.sub).toBe('admin-1');
    expect(payload?.role).toBe('super_admin');
  });

  it('carries the tenant id so salon tokens stay scoped', () => {
    const token = AuthService.signToken(
      { sub: 'u', email: 'e', role: 'salon_admin', tenantId: 'tenant-x' },
      SECRET,
      60
    );
    expect(AuthService.verifyToken(token, SECRET)?.tenantId).toBe('tenant-x');
  });

  it('rejects a token signed with a different secret', () => {
    const token = AuthService.signToken({ sub: 'a', email: 'e', role: 'staff' }, SECRET, 60);
    expect(AuthService.verifyToken(token, 'another-secret')).toBeNull();
  });

  it('rejects a tampered token', () => {
    const token = AuthService.signToken({ sub: 'a', email: 'e', role: 'staff' }, SECRET, 60);
    expect(AuthService.verifyToken(`${token}xyz`, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = AuthService.signToken({ sub: 'a', email: 'e', role: 'staff' }, SECRET, -10);
    expect(AuthService.verifyToken(token, SECRET)).toBeNull();
  });

  it('rejects structurally invalid tokens', () => {
    expect(AuthService.verifyToken('', SECRET)).toBeNull();
    expect(AuthService.verifyToken('not.a.token', SECRET)).toBeNull();
    expect(AuthService.verifyToken('a.b', SECRET)).toBeNull();
  });

  it('extracts only well-formed bearer headers', () => {
    expect(AuthService.extractBearerToken('Bearer abc123')).toBe('abc123');
    expect(AuthService.extractBearerToken('bearer abc123')).toBe('abc123');
    expect(AuthService.extractBearerToken('Basic abc')).toBeNull();
    expect(AuthService.extractBearerToken('abc')).toBeNull();
    expect(AuthService.extractBearerToken(undefined)).toBeNull();
  });
});

describe('AuthService — password hashing', () => {
  it('verifies a correct password', () => {
    const hash = hashPassword('correct horse battery');
    expect(verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const hash = hashPassword('correct horse battery');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('salts each hash so identical passwords differ', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('returns false for malformed stored hashes', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
    expect(verifyPassword('x', 'scrypt$16384$onlysalt')).toBe(false);
  });
});
