import crypto from 'node:crypto';
import { ApiException } from '../common/api-exception.js';
import { CryptoService, getCrypto } from '../identity/crypto.js';

export class IdempotencyService {
  constructor(cryptoInstance = getCrypto()) {
    this.crypto = cryptoInstance;
  }

  async run(client, actor, route, key, input, operation) {
    ApiException.check(
      key && /^[A-Za-z0-9_-]{22,128}$/.test(key),
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Cần Idempotency-Key ngẫu nhiên tối thiểu 128-bit.'
    );

    const scope = CryptoService.hash(`${actor.scope}:${route}`);
    const hash = CryptoService.hash(JSON.stringify(input !== undefined ? input : {}));

    const existingRes = await client.query(
      `SELECT * FROM shop.idempotency_keys
       WHERE caller_scope_hash = $1 AND key = $2`,
      [scope, key]
    );

    const now = new Date();

    if (existingRes.rows.length > 0) {
      const record = existingRes.rows[0];
      const expiresAt = new Date(record.expires_at);

      if (expiresAt > now) {
        ApiException.check(
          record.request_hash === hash,
          409,
          'IDEMPOTENCY_MISMATCH',
          'Key đã được dùng với dữ liệu khác.'
        );

        const decrypted = this.crypto.decrypt(record.encrypted_response);
        return JSON.parse(decrypted);
      }

      await client.query(
        'DELETE FROM shop.idempotency_keys WHERE id = $1',
        [record.id]
      );
    }

    const result = await operation(client);

    const recordId = crypto.randomUUID();
    const encrypted = this.crypto.encrypt(JSON.stringify(result));
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await client.query(
      `INSERT INTO shop.idempotency_keys (id, caller_scope_hash, key, request_hash, encrypted_response, expires_at, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW())`,
      [recordId, scope, key, hash, encrypted, expiresAt]
    );

    return result;
  }
}

let defaultIdempotencyService = null;
export function getIdempotencyService() {
  if (!defaultIdempotencyService) {
    defaultIdempotencyService = new IdempotencyService();
  }
  return defaultIdempotencyService;
}
