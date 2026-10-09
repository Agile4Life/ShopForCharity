import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiException } from '../common/api-exception.js';

export class CryptoService {
  constructor(encryption = config.encryptionKey, signing = config.signingKey) {
    if (!encryption || !signing) {
      throw new Error('Configure independent base64 32-byte encryption/signing keys');
    }
    this.encryptionKey = Buffer.from(encryption, 'base64');
    this.signingKey = Buffer.from(signing, 'base64');

    if (
      this.encryptionKey.length !== 32 ||
      this.signingKey.length !== 32 ||
      crypto.timingSafeEqual(this.encryptionKey, this.signingKey)
    ) {
      throw new Error('Configure independent base64 32-byte encryption/signing keys');
    }
  }

  token() {
    return crypto.randomBytes(32).toString('base64url');
  }

  static hash(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  mac(text) {
    return crypto.createHmac('sha256', this.signingKey).update(text, 'utf8').digest();
  }

  sign(payload) {
    const data = Buffer.from(payload, 'utf8').toString('base64url');
    const signature = this.mac(data).toString('base64url');
    return `${data}.${signature}`;
  }

  verify(token) {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token');
      }
      const parts = token.split('.');
      if (parts.length !== 2) {
        throw new Error('Invalid token format');
      }
      const [data, signatureB64] = parts;
      const expectedMac = this.mac(data);
      const actualMac = Buffer.from(signatureB64, 'base64url');

      if (expectedMac.length !== actualMac.length || !crypto.timingSafeEqual(expectedMac, actualMac)) {
        throw new Error('Signature mismatch');
      }
      return Buffer.from(data, 'base64url').toString('utf8');
    } catch {
      throw new ApiException(401, 'INVALID_SESSION', 'Phiên truy cập không hợp lệ.');
    }
  }

  encrypt(text) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([nonce, ciphertext, tag]);
    return combined.toString('base64url');
  }

  decrypt(text) {
    try {
      const data = Buffer.from(text, 'base64url');
      if (data.length < 12 + 16) {
        throw new Error('Invalid ciphertext length');
      }
      const nonce = data.subarray(0, 12);
      const tag = data.subarray(data.length - 16);
      const ciphertext = data.subarray(12, data.length - 16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, nonce);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new Error('Cannot decrypt idempotency record');
    }
  }
}

let defaultCrypto = null;
export function getCrypto() {
  if (!defaultCrypto) {
    defaultCrypto = new CryptoService();
  }
  return defaultCrypto;
}
