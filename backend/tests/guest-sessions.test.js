import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CryptoService } from '../src/identity/crypto.js';
import { GuestSessions } from '../src/identity/guest-sessions.js';
import { normalizePhone } from '../src/identity/phone.js';
import { ApiException } from '../src/common/api-exception.js';

function makeCrypto() {
  const a = Buffer.alloc(32, 1).toString('base64');
  const b = Buffer.alloc(32, 2).toString('base64');
  return new CryptoService(a, b);
}

test('order cookie does not grant checkout scope', () => {
  const sessions = new GuestSessions(makeCrypto());
  const id = crypto.randomUUID();
  const cookie = sessions.order(id);
  assert.equal(sessions.orderActor(cookie).guestOrderId, id);
  assert.throws(() => sessions.checkoutActor(cookie), ApiException);
});

test('expired checkout is rejected', () => {
  const c = makeCrypto();
  const sessions = new GuestSessions(c);
  // Forge a token with expired epoch timestamp (now - 100 seconds)
  const expiredPayload = `checkout|${crypto.randomUUID()}|${Math.floor(Date.now() / 1000) - 100}`;
  const expiredCookie = c.sign(expiredPayload);
  assert.throws(() => sessions.checkoutActor(expiredCookie), (err) => {
    return err instanceof ApiException && err.code === 'SESSION_EXPIRED';
  });
});

test('Vietnamese phone normalization', () => {
  assert.equal(normalizePhone('+84 901-234-567'), '0901234567');
  assert.equal(normalizePhone('0901.234.567'), '0901234567');
  assert.equal(normalizePhone('(0901) 234 567'), '0901234567');
  assert.throws(() => normalizePhone('123'), ApiException);
  assert.throws(() => normalizePhone('090123456789'), ApiException);
  assert.throws(() => normalizePhone(''), ApiException);
});
