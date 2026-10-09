import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentService } from '../src/payment/payment-service.js';
import { ApiException } from '../src/common/api-exception.js';

test('PaymentService reference checks for duplicate bank reference', async () => {
  const service = new PaymentService({}, {}, {}, {}, {}, {});

  const mockClient = {
    async query(sql, params) {
      if (params[1] === 'DUP-REF-123') {
        return { rows: [{ count: '1' }] };
      }
      return { rows: [{ count: '0' }] };
    }
  };

  // Valid non-duplicate reference
  const ref = await service.reference(mockClient, 'NEW-REF-999');
  assert.equal(ref, 'NEW-REF-999');

  // Duplicate reference throws 409 BANK_REFERENCE_DUPLICATE
  await assert.rejects(
    async () => service.reference(mockClient, 'DUP-REF-123'),
    (err) => err.code === 'BANK_REFERENCE_DUPLICATE' && err.status === 409
  );

  // Blank reference returns null without querying
  const blank = await service.reference(mockClient, '   ');
  assert.equal(blank, null);
});
