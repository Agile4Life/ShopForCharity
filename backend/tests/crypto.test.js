import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoService } from '../src/identity/crypto.js';
import { ApiException } from '../src/common/api-exception.js';

function makeKey(byteVal) {
  const buf = Buffer.alloc(32, byteVal);
  return buf.toString('base64');
}

test('signed payload cannot be altered', () => {
  const c = new CryptoService(makeKey(1), makeKey(2));
  const token = c.sign('order|id|100');
  assert.equal(c.verify(token), 'order|id|100');
  assert.throws(() => c.verify('X' + token.substring(1)), ApiException);
});

test('credential encryption uses fresh nonce and rejects tampering', () => {
  const c = new CryptoService(makeKey(1), makeKey(2));
  const a = c.encrypt('guest-secret');
  const b = c.encrypt('guest-secret');
  assert.notEqual(a, b);
  assert.ok(!a.includes('guest-secret'));
  assert.equal(c.decrypt(a), 'guest-secret');
  assert.throws(() => c.decrypt('X' + a.substring(1)));
});

test('key reuse is rejected', () => {
  assert.throws(() => new CryptoService(makeKey(1), makeKey(1)));
});

test('guest tokens have 256 bits and distinct hashes', () => {
  const c = new CryptoService(makeKey(1), makeKey(2));
  const a = c.token();
  const b = c.token();
  assert.equal(Buffer.from(a, 'base64url').length, 32);
  assert.notEqual(a, b);
  assert.notEqual(CryptoService.hash(a), CryptoService.hash(b));
});
