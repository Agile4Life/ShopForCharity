import test from 'node:test';
import assert from 'node:assert/strict';
import { IdempotencyService } from '../src/infrastructure/idempotency-service.js';
import { CryptoService } from '../src/identity/crypto.js';

// Mock DB Client
class MockDbClient {
  constructor() {
    this.storage = new Map(); // key: "scope:key" -> record
  }

  async query(sql, params) {
    if (sql.includes('SELECT * FROM shop.idempotency_keys')) {
      const [scope, key] = params;
      const rec = this.storage.get(`${scope}:${key}`);
      return { rows: rec ? [rec] : [] };
    }
    if (sql.includes('INSERT INTO shop.idempotency_keys')) {
      const [id, scope, key, hash, encrypted, expiresAt] = params;
      this.storage.set(`${scope}:${key}`, {
        id,
        caller_scope_hash: scope,
        key,
        request_hash: hash,
        encrypted_response: encrypted,
        expires_at: expiresAt,
        version: 0,
      });
      return { rowCount: 1 };
    }
    if (sql.includes('DELETE FROM shop.idempotency_keys')) {
      const [id] = params;
      for (const [k, v] of this.storage.entries()) {
        if (v.id === id) {
          this.storage.delete(k);
          break;
        }
      }
      return { rowCount: 1 };
    }
    throw new Error(`Unhandled query: ${sql}`);
  }
}

function makeKey(byteVal) {
  return Buffer.alloc(32, byteVal).toString('base64');
}

test('IdempotencyService validates idempotency key format', async () => {
  const cryptoSvc = new CryptoService(makeKey(1), makeKey(2));
  const service = new IdempotencyService(cryptoSvc);
  const client = new MockDbClient();
  const actor = { scope: 'user:123' };

  // Too short (< 22 chars)
  await assert.rejects(
    async () => service.run(client, actor, '/checkout', 'short_key', {}, () => ({ ok: true })),
    (err) => err.code === 'INVALID_IDEMPOTENCY_KEY' && err.status === 400
  );

  // Invalid characters
  await assert.rejects(
    async () => service.run(client, actor, '/checkout', 'key_with_spaces_and_illegal_chars!@#$%^', {}, () => ({ ok: true })),
    (err) => err.code === 'INVALID_IDEMPOTENCY_KEY' && err.status === 400
  );
});

test('IdempotencyService caches and replays responses', async () => {
  const cryptoSvc = new CryptoService(makeKey(1), makeKey(2));
  const service = new IdempotencyService(cryptoSvc);
  const client = new MockDbClient();
  const actor = { scope: 'user:123' };
  const key = 'a'.repeat(32);
  const payload = { amount: 50000, items: ['item-1'] };

  let callCount = 0;
  const op = async () => {
    callCount++;
    return { orderId: 'ord-123', status: 'PLACED' };
  };

  // First run
  const res1 = await service.run(client, actor, '/checkout', key, payload, op);
  assert.equal(callCount, 1);
  assert.deepEqual(res1, { orderId: 'ord-123', status: 'PLACED' });

  // Second run with identical payload - must replay from cache without calling op
  const res2 = await service.run(client, actor, '/checkout', key, payload, op);
  assert.equal(callCount, 1); // No new execution
  assert.deepEqual(res2, { orderId: 'ord-123', status: 'PLACED' });
});

test('IdempotencyService detects payload mismatch for same key', async () => {
  const cryptoSvc = new CryptoService(makeKey(1), makeKey(2));
  const service = new IdempotencyService(cryptoSvc);
  const client = new MockDbClient();
  const actor = { scope: 'user:123' };
  const key = 'b'.repeat(32);

  await service.run(client, actor, '/checkout', key, { foo: 'bar' }, async () => ({ res: 1 }));

  // Re-run with changed payload
  await assert.rejects(
    async () => service.run(client, actor, '/checkout', key, { foo: 'baz' }, async () => ({ res: 2 })),
    (err) => err.code === 'IDEMPOTENCY_MISMATCH' && err.status === 409
  );
});

test('IdempotencyService replaces expired keys', async () => {
  const cryptoSvc = new CryptoService(makeKey(1), makeKey(2));
  const service = new IdempotencyService(cryptoSvc);
  const client = new MockDbClient();
  const actor = { scope: 'user:123' };
  const key = 'c'.repeat(32);

  let runCount = 0;
  await service.run(client, actor, '/checkout', key, { test: 1 }, async () => {
    runCount++;
    return { val: 1 };
  });
  assert.equal(runCount, 1);

  // Manually expire the key in the mock DB
  const scope = CryptoService.hash(`${actor.scope}:/checkout`);
  const record = client.storage.get(`${scope}:${key}`);
  record.expires_at = new Date(Date.now() - 1000); // in the past

  // Run again: should delete expired record and execute fresh
  const res = await service.run(client, actor, '/checkout', key, { test: 1 }, async () => {
    runCount++;
    return { val: 2 };
  });
  assert.equal(runCount, 2);
  assert.deepEqual(res, { val: 2 });
});
