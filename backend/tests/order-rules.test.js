import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderRules } from '../src/order/order-rules.js';
import { ApiException } from '../src/common/api-exception.js';

test('acceptance requires successful contact', () => {
  assert.throws(
    () => OrderRules.transition('PENDING_CONTACT', 'ACCEPTED', 'UNPAID', true, false),
    error => error instanceof ApiException && error.code === 'INVALID_TRANSITION'
      && error.message === 'Cần ghi nhận liên hệ thành công với khách trước khi chấp nhận đơn.'
  );
  assert.doesNotThrow(
    () => OrderRules.transition('PENDING_CONTACT', 'ACCEPTED', 'UNPAID', true, true)
  );
});

test('completion requires ready and paid', () => {
  for (const status of ['PENDING_CONTACT', 'ACCEPTED', 'PREPARING']) {
    assert.throws(
      () => OrderRules.transition(status, 'COMPLETED', 'PAID', true, true),
      ApiException
    );
  }

  for (const payment of ['UNPAID', 'REPORTED', 'REFUND_PENDING', 'REFUNDED']) {
    assert.throws(
      () => OrderRules.transition('READY', 'COMPLETED', payment, true, true),
      ApiException
    );
  }

  assert.doesNotThrow(
    () => OrderRules.transition('READY', 'COMPLETED', 'PAID', true, true)
  );
});

test('customer can only cancel pending unpaid', () => {
  assert.doesNotThrow(
    () => OrderRules.transition('PENDING_CONTACT', 'CANCELLED', 'UNPAID', false, false)
  );
  assert.throws(
    () => OrderRules.transition('ACCEPTED', 'CANCELLED', 'UNPAID', false, true),
    ApiException
  );
  assert.throws(
    () => OrderRules.transition('PENDING_CONTACT', 'CANCELLED', 'REPORTED', false, false),
    ApiException
  );
});

test('terminal orders cannot transition again', () => {
  for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED']) {
    assert.throws(
      () => OrderRules.transition(status, 'CANCELLED', 'UNPAID', true, true),
      ApiException
    );
    assert.throws(
      () => OrderRules.transition(status, 'ACCEPTED', 'UNPAID', true, true),
      ApiException
    );
  }
});

test('reported or received money never automatically expires', () => {
  for (const payment of ['REPORTED', 'PAID', 'REFUND_PENDING']) {
    assert.throws(
      () => OrderRules.transition('PENDING_CONTACT', 'EXPIRED', payment, false, false),
      ApiException
    );
  }

  assert.doesNotThrow(
    () => OrderRules.transition('PENDING_CONTACT', 'EXPIRED', 'UNPAID', false, false)
  );
});
