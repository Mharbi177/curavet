import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual, createHmac } from 'crypto';

/**
 * AES-256-GCM Encryption / Decryption utility for sensitive credentials (e.g. WhatsApp API tokens).
 */
export class CryptoService {
  /**
   * Derive a 32-byte key from the provided secret using SHA-256.
   */
  private static deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypt plaintext string into iv:authTag:ciphertext (base64 encoded).
   */
  static encrypt(plaintext: string, secret: string): string {
    const key = this.deriveKey(secret);
    const iv = randomBytes(12); // Standard 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt iv:authTag:ciphertext back into plaintext string.
   * Returns null if decryption fails or authentication tag does not match.
   */
  static decrypt(ciphertextWithMetadata: string, secret: string): string | null {
    try {
      const parts = ciphertextWithMetadata.split(':');
      if (parts.length !== 3) return null;

      const [ivB64, tagB64, encryptedData] = parts;
      const key = this.deriveKey(secret);
      const iv = Buffer.from(ivB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return null;
    }
  }

  /**
   * Compute Meta X-Hub-Signature-256 HMAC for payload verification.
   */
  static computeHmacSignature(rawBody: string | Buffer, appSecret: string): string {
    const hmac = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    return `sha256=${hmac}`;
  }

  /**
   * Constant-time comparison between received Meta X-Hub-Signature-256 header and expected HMAC.
   */
  static verifyWebhookSignature(rawBody: string | Buffer, headerSignature: string | undefined | null, appSecret: string): boolean {
    if (!headerSignature || typeof headerSignature !== 'string') {
      return false;
    }

    const expectedSignature = this.computeHmacSignature(rawBody, appSecret);
    const headerBuf = Buffer.from(headerSignature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (headerBuf.length !== expectedBuf.length) {
      return false;
    }

    return timingSafeEqual(headerBuf, expectedBuf);
  }
}
