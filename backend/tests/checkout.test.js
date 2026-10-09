import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckoutService } from '../src/order/checkout-service.js';
import { CryptoService } from '../src/identity/crypto.js';
import { ApiException } from '../src/common/api-exception.js';

function makeKey(byteVal) {
  return Buffer.alloc(32, byteVal).toString('base64');
}

test('CheckoutService resolves cart demand accurately for products and combos', async () => {
  const cryptoSvc = new CryptoService(makeKey(1), makeKey(2));

  // Mock catalog service
  const mockCatalog = {
    async product(id) {
      if (id === 'prod-1') return { id: 'prod-1', name: 'Bút bi xanh', price: 5000, version: 1 };
      if (id === 'prod-2') return { id: 'prod-2', name: 'Vở ô ly', price: 10000, version: 1 };
      throw new ApiException(404, 'NOT_FOUND', 'Not found');
    },
    async combo(id) {
      if (id === 'combo-1') return { id: 'combo-1', name: 'Combo học tập', price: 22000, version: 1 };
      throw new ApiException(404, 'NOT_FOUND', 'Not found');
    },
    async components(comboId) {
      if (comboId === 'combo-1') {
        return [
          { product_id: 'prod-1', quantity: 2 }, // 2 bút
          { product_id: 'prod-2', quantity: 1 }, // 1 vở
        ];
      }
      return [];
    }
  };

  const mockShop = {};
  const mockInv = {};
  const mockIdem = {};
  const mockAudit = {};

  const checkout = new CheckoutService(
    mockShop,
    mockCatalog,
    mockInv,
    mockIdem,
    cryptoSvc,
    mockAudit
  );

  // Mock client query for shop
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM shop.shops')) {
        return {
          rows: [{
            id: 'default',
            version: 1,
            payment_settings_version_id: 'ps-1',
            accepting_orders: true,
          }]
        };
      }
      return { rows: [] };
    }
  };

  // Cart with:
  // - 1 x combo-1 (needs 2 prod-1, 1 prod-2) = 22,000
  // - 3 x prod-1 (needs 3 prod-1) = 3 * 5,000 = 15,000
  // Total demand: prod-1 = 2 + 3 = 5; prod-2 = 1
  // Total price = 37,000
  const cart = [
    { kind: 'COMBO', catalogId: 'combo-1', quantity: 1 },
    { kind: 'PRODUCT', catalogId: 'prod-1', quantity: 3 }
  ];

  const resolved = await checkout.resolve(cart, mockClient);
  assert.equal(resolved.total, 37000);
  assert.equal(resolved.demand['prod-1'], 5);
  assert.equal(resolved.demand['prod-2'], 1);
  assert.ok(resolved.fingerprint);
  assert.equal(resolved.lines.length, 2);

  // Determinism check: same cart in reverse order gives identical fingerprint and demand
  const reverseCart = [
    { kind: 'PRODUCT', catalogId: 'prod-1', quantity: 3 },
    { kind: 'COMBO', catalogId: 'combo-1', quantity: 1 }
  ];
  const resolved2 = await checkout.resolve(reverseCart, mockClient);
  assert.equal(resolved.fingerprint, resolved2.fingerprint);
  assert.deepEqual(resolved.demand, resolved2.demand);
});

test('CheckoutService validates cart boundaries and duplicates', async () => {
  const cryptoSvc = new CryptoService(makeKey(1), makeKey(2));
  const dummyCatalog = {
    async product() { return { id: 'p', name: 'p', price: 10, version: 1 }; },
  };
  const checkout = new CheckoutService({}, dummyCatalog, {}, {}, cryptoSvc, {});

  // Empty cart
  await assert.rejects(
    async () => checkout.resolve([], null),
    (err) => err.code === 'INVALID_CART' && err.status === 400
  );

  // Duplicate cart lines
  await assert.rejects(
    async () => checkout.resolve([
      { kind: 'PRODUCT', catalogId: 'prod-1', quantity: 1 },
      { kind: 'PRODUCT', catalogId: 'prod-1', quantity: 2 },
    ], null),
    (err) => err.code === 'DUPLICATE_CART_LINE' && err.status === 400
  );

  // Invalid quantity (>20)
  await assert.rejects(
    async () => checkout.resolve([
      { kind: 'PRODUCT', catalogId: 'prod-1', quantity: 21 },
    ], null),
    (err) => err.code === 'INVALID_QUANTITY' && err.status === 400
  );
});
