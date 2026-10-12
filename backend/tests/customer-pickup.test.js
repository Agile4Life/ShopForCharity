import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../src/common/db.js';
import { config } from '../src/config.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { CheckoutService } from '../src/order/checkout-service.js';
import { OrderService } from '../src/order/order-service.js';
import { ShopService } from '../src/shop/shop-service.js';

test('customer pickup: checkout persists destinations, validates choices and seller keeps the requested location', async t => {
  const db = new PGlite();
  const originalConnect = pool.connect, originalQuery = pool.query;
  const sql = async (text, params) => {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  };
  pool.connect = async () => ({ query: sql, release() {} });
  pool.query = sql;
  const checkout = new CheckoutService();
  const orders = new OrderService(undefined, undefined, undefined, undefined, undefined, undefined,
    { async image() { return null; }, async imageUrl() { return null; } },
    { async enqueue() {}, async deliverSafely() {} });
  const guest = { id: null, type: 'GUEST', scope: 'guest:checkout:pickup-test' };
  const seller = { id: randomUUID(), type: 'SELLER', scope: 'seller:pickup-test' };
  const productId = randomUUID(), pickupId = randomUUID();
  const input = async location => ({
    items: [{ kind: 'PRODUCT', catalogId: productId, quantity: 1 }],
    buyer: { fullName: 'Khách Test', phone: '0912345678', email: 'buyer@example.com' },
    paymentMethod: 'CASH', ...location,
    quoteToken: (await checkout.quote({ items: [{ kind: 'PRODUCT', catalogId: productId, quantity: 1 }], paymentMethod: 'CASH' })).quoteToken,
  });
  try {
    await applyMigrations({ query: sql });
    await db.query('UPDATE shop.shops SET accepting_orders=true WHERE id=$1', [config.shopId]);
    await db.query(`INSERT INTO shop.profiles(id,auth_user_id,role,active,created_at,updated_at)
      VALUES($1,$2,'SELLER',true,now(),now())`, [seller.id, randomUUID()]);
    await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,created_at,updated_at)
      VALUES($1,$2,'00000000-0000-0000-0000-000000000011','pickup-test','Bánh Test',10000,'ACTIVE',now(),now())`, [productId, config.shopId]);
    await db.query(`INSERT INTO shop.product_inventory(id,stock_on_hand,stock_reserved,created_at,updated_at)
      VALUES($1,20,0,now(),now())`, [productId]);

    await t.test('custom destination works with no suggestions, is trimmed and survives replay and acceptance', async () => {
      assert.equal((await new ShopService().points()).length, 0);
      const body = await input({ customPickupLocation: '  Sảnh nhà B  ', customPickupInstructions: '  Ghế đá số 3.\nGọi khi đến.  ' });
      const key = randomUUID();
      const created = await checkout.create(guest, key, body);
      assert.deepEqual(await checkout.create(guest, key, body), created);
      const row = (await db.query('SELECT * FROM shop.orders WHERE id=$1', [created.orderId])).rows[0];
      assert.equal(row.pickup_point_id, null);
      assert.equal(row.pickup_name, 'Sảnh nhà B');
      assert.equal(row.pickup_instructions, 'Ghế đá số 3.\nGọi khi đến.');
      assert.equal((await db.query('SELECT stock_reserved FROM shop.product_inventory WHERE id=$1', [productId])).rows[0].stock_reserved, 1);
      assert.equal((await new ShopService().points()).length, 0, 'customer locations must not become shop suggestions');
      const detail = await orders.detail({ guestOrderId: created.orderId, type: 'GUEST' }, created.orderId);
      assert.equal(detail.pickupPointName, row.pickup_name);
      assert.equal(detail.pickupInstructions, row.pickup_instructions);
      await orders.contact(seller, created.orderId, randomUUID(), { expectedVersion: 0, channel: 'PHONE', outcome: 'SUCCESS' });
      const accepted = await orders.action(seller, created.orderId, true, 'accept', randomUUID(), {
        expectedVersion: 1, confirmedPickupAt: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.equal(accepted.status, 'ACCEPTED');
      assert.equal(accepted.pickupPointId, null);
      assert.equal(accepted.pickupPointName, row.pickup_name);
      assert.equal(accepted.pickupInstructions, row.pickup_instructions);
    });

    await t.test('shop suggestions still snapshot name/instructions and reject inactive or missing points', async () => {
      await db.query(`INSERT INTO shop.pickup_points(id,shop_id,name,instructions,active,created_at,updated_at)
        VALUES($1,$2,'Cổng trường','Gặp tại cổng',true,now(),now())`, [pickupId, config.shopId]);
      const created = await checkout.create(guest, randomUUID(), await input({ pickupPointId: pickupId }));
      const row = (await db.query('SELECT * FROM shop.orders WHERE id=$1', [created.orderId])).rows[0];
      assert.equal(row.pickup_point_id, pickupId);
      assert.equal(row.pickup_name, 'Cổng trường');
      assert.equal(row.pickup_instructions, 'Gặp tại cổng');
      await db.query('UPDATE shop.pickup_points SET active=false WHERE id=$1', [pickupId]);
      await assert.rejects(checkout.create(guest, randomUUID(), await input({ pickupPointId: pickupId })), { code: 'INVALID_PICKUP_POINT' });
      await assert.rejects(checkout.create(guest, randomUUID(), await input({ pickupPointId: randomUUID() })), { status: 404 });
    });

    await t.test('invalid or ambiguous pickup data rolls back without reserving stock', async () => {
      for (const choice of [ {}, { customPickupLocation: '   ' }, { customPickupLocation: 'A' },
        { customPickupLocation: 'A'.repeat(201) }, { customPickupLocation: {} }, { pickupPointId: 'invalid' },
        { pickupPointId: pickupId, customPickupLocation: 'Sảnh B' },
        { customPickupLocation: 'Sảnh B', customPickupInstructions: 'A'.repeat(501) },
        { customPickupLocation: 'Sảnh B', customPickupInstructions: 12 },
        { pickupPointId: pickupId, customPickupInstructions: 'riêng' },
      ]) {
        await assert.rejects(checkout.create(guest, randomUUID(), await input(choice)), { code: 'INVALID_PICKUP', status: 400 });
      }
      assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.orders')).rows[0].count, 2);
      assert.equal((await db.query('SELECT stock_reserved FROM shop.product_inventory WHERE id=$1', [productId])).rows[0].stock_reserved, 2);
    });
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
    await db.close();
  }
});
