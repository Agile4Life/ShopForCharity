import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePickupTime } from '../src/order/pickup-time.js';

const now = new Date('2026-10-14T00:00:00Z');

test('delivery starts October 18 with inclusive 08:00 and 17:00 Vietnam boundaries', () => {
  for (const value of ['2026-10-18T08:00:00+07:00', '2026-10-18T17:00:00+07:00',
    '2026-10-18T01:00:00Z', '2026-10-18T10:00:00Z', '2026-11-01T10:30:00+07:00']) {
    assert.equal(validatePickupTime(value, now).toISOString(), new Date(value).toISOString());
  }
});

test('rejects October 17, before opening, after closing and malformed times', () => {
  for (const value of ['2026-10-17T17:00:00+07:00', '2026-10-17T10:00:00Z',
    '2026-10-18T07:59:59+07:00', '2026-10-18T17:00:00.001+07:00', '2026-10-18T17:01:00+07:00',
    '2026-10-18T00:59:59Z', '2026-10-18T10:00:01Z', '2026-10-18T10:30:00',
    'invalid', '', null, 123, {}]) {
    assert.throws(() => validatePickupTime(value, now), { code: 'INVALID_PICKUP_TIME', status: 400 }, String(value));
  }
});

test('allowed delivery hours must still be in the future', () => {
  const atOpening = new Date('2026-10-18T01:00:00Z');
  assert.throws(() => validatePickupTime('2026-10-18T08:00:00+07:00', atOpening), { code: 'INVALID_PICKUP_TIME' });
  assert.throws(() => validatePickupTime('2026-10-18T08:00:00+07:00', new Date('2026-10-19T00:00:00Z')), { code: 'INVALID_PICKUP_TIME' });
});
