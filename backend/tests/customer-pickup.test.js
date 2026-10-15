import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../src/common/db.js';
import { config } from '../src/config.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { CheckoutService } from '../src/order/checkout-service.js';
import { OrderService } from '../src/order/order-service.js';
import { futurePickupTime } from './pickup-fixtures.js';

test('shop-managed pickup: checkout requires an active shop pickup point, allows omitting buyer email, and seller confirms pickup point without email', async t => {
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
    { async image() { return null; }, async imageUrl() { return null; } });
  const guest = { id: null, type: 'GUEST', scope: 'guest:checkout:pickup-test' };
  const seller = { id: randomUUID(), type: 'SELLER', scope: 'seller:pickup-test' };
  const productId = randomUUID(), pickupId = randomUUID(), secondPickupId = randomUUID();
  const input = async location => ({
    items: [{ kind: 'PRODUCT', catalogId: productId, quantity: 1 }],
    buyer: { fullName: 'Khách Test', phone: '0912345678' },
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
    await db.query(`INSERT INTO shop.pickup_points(id,shop_id,name,instructions,active,created_at,updated_at)
      VALUES($1,$2,'Cổng trường','Gặp tại cổng',true,now(),now()),
            ($3,$2,'Sảnh nhà B','Ghế đá số 3',true,now(),now())`, [pickupId, config.shopId, secondPickupId]);

    await t.test('shop pickup point works without buyer email, survives replay and seller acceptance', async () => {
      const body = await input({ pickupPointId: pickupId });
      const key = randomUUID();
      const created = await checkout.create(guest, key, body);
      assert.match(created.orderCode, /^ORD-[2-9A-HJ-NP-Z]{8}$/);
      assert.equal((await orders.access.code(created.orderCode, { guestOrderId: created.orderId, type: 'GUEST' })).id, created.orderId);
      assert.deepEqual(await checkout.create(guest, key, body), created);
      const row = (await db.query('SELECT * FROM shop.orders WHERE id=$1', [created.orderId])).rows[0];
      assert.equal(row.buyer_email, '');
      assert.equal(row.pickup_point_id, pickupId);
      assert.equal(row.pickup_name, 'Cổng trường');
      assert.equal(row.pickup_instructions, 'Gặp tại cổng');
      assert.equal((await db.query('SELECT stock_reserved FROM shop.product_inventory WHERE id=$1', [productId])).rows[0].stock_reserved, 1);
      const detail = await orders.detail({ guestOrderId: created.orderId, type: 'GUEST' }, created.orderId);
      assert.equal(detail.pickupPointId, pickupId);
      assert.equal(detail.pickupPointName, 'Cổng trường');
      assert.equal(detail.pickupInstructions, 'Gặp tại cổng');
      await orders.contact(seller, created.orderId, randomUUID(), { expectedVersion: 0, channel: 'PHONE', outcome: 'SUCCESS' });
      const keyAccept = randomUUID();
      const confirmation = { expectedVersion: 1, confirmedPickupPointId: secondPickupId, confirmedPickupAt: futurePickupTime() };
      for (const invalidTime of ['2026-10-17T09:00:00+07:00', confirmation.confirmedPickupAt.replace('T02:', 'T00:'),
        confirmation.confirmedPickupAt.replace('T02:', 'T11:')]) {
        await assert.rejects(orders.action(seller, created.orderId, true, 'accept', randomUUID(),
          { ...confirmation, confirmedPickupAt: invalidTime }), { status: 400 });
      }
      await assert.rejects(orders.action(seller, created.orderId, true, 'accept', randomUUID(),
        { expectedVersion: 1, confirmedPickupAt: confirmation.confirmedPickupAt }), { status: 400 });
      const unchanged = (await db.query('SELECT status,version,confirmed_at FROM shop.orders WHERE id=$1', [created.orderId])).rows[0];
      assert.equal(unchanged.status, 'PENDING_CONTACT');
      assert.equal(unchanged.version, 1);
      assert.equal(unchanged.confirmed_at, null);
      const accepted = await orders.action(seller, created.orderId, true, 'accept', keyAccept, confirmation);
      assert.equal(accepted.status, 'ACCEPTED');
      assert.equal(accepted.pickupPointId, secondPickupId);
      assert.equal(accepted.pickupPointName, 'Sảnh nhà B');
      assert.equal(accepted.pickupInstructions, 'Ghế đá số 3');
      assert.equal(Object.hasOwn(accepted, 'confirmationEmail'), false);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.order_email_outbox')).rows[0].count, 0);
      assert.deepEqual(await orders.action(seller, created.orderId, true, 'accept', keyAccept, confirmation), accepted);
    });

    await t.test('shop pickup points reject inactive or missing points', async () => {
      await db.query('UPDATE shop.pickup_points SET active=false WHERE id=$1', [pickupId]);
      await assert.rejects(checkout.create(guest, randomUUID(), await input({ pickupPointId: pickupId })), { code: 'INVALID_PICKUP_POINT' });
      await assert.rejects(checkout.create(guest, randomUUID(), await input({ pickupPointId: randomUUID() })), { status: 404 });
      await db.query('UPDATE shop.pickup_points SET active=true WHERE id=$1', [pickupId]);
    });

    await t.test('custom or missing pickup data is rejected and rolls back without reserving stock', async () => {
      for (const choice of [
        {},
        { customPickupLocation: 'Sảnh nhà B' },
        { pickupPointId: 'invalid' },
        { pickupPointId: pickupId, customPickupLocation: 'Sảnh B' },
        { pickupPointId: pickupId, customPickupInstructions: 'riêng' },
      ]) {
        await assert.rejects(checkout.create(guest, randomUUID(), await input(choice)), { code: 'INVALID_PICKUP', status: 400 });
      }
      assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.orders')).rows[0].count, 1);
      assert.equal((await db.query('SELECT stock_reserved FROM shop.product_inventory WHERE id=$1', [productId])).rows[0].stock_reserved, 1);
    });

    await t.test('checkout rejects invalid delivery schedules without creating orders or reserving stock', async () => {
      const validTime = futurePickupTime();
      for (const requestedPickupAt of ['2026-10-17T09:00:00+07:00', validTime.replace('T02:', 'T00:'),
        validTime.replace('T02:', 'T11:'), 'invalid']) {
        await assert.rejects(checkout.create(guest, randomUUID(), await input({ pickupPointId: pickupId, requestedPickupAt })),
          { code: 'INVALID_PICKUP_TIME', status: 400 });
      }
      assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.orders')).rows[0].count, 1);
      assert.equal((await db.query('SELECT stock_reserved FROM shop.product_inventory WHERE id=$1', [productId])).rows[0].stock_reserved, 1);
      const created = await checkout.create(guest, randomUUID(), await input({ pickupPointId: pickupId, requestedPickupAt: validTime }));
      const row = (await db.query('SELECT requested_at FROM shop.orders WHERE id=$1', [created.orderId])).rows[0];
      assert.equal(new Date(row.requested_at).toISOString(), validTime);
    });

    await t.test('shop configures referrers and checkout saves valid referrer or rejects unknown referrer', async () => {
      const shopState = await checkout.settings.get(true, seller);
      assert.deepEqual(shopState.referrers, []);
      const updatedShop = await checkout.settings.update(seller, {
        expectedVersion: shopState.version,
        referrers: [' Nguyễn Minh Anh - 12A1 ', 'Trần Bảo Ngọc - 11B2', 'Nguyễn Minh Anh - 12A1'],
      });
      assert.deepEqual(updatedShop.referrers, ['Nguyễn Minh Anh - 12A1', 'Trần Bảo Ngọc - 11B2']);
      assert.deepEqual((await checkout.settings.get(false, null)).referrers, ['Nguyễn Minh Anh - 12A1', 'Trần Bảo Ngọc - 11B2']);

      await assert.rejects(
        checkout.create(guest, randomUUID(), await input({ pickupPointId: pickupId, referrer: 'Người lạ' })),
        { code: 'INVALID_REFERRER', status: 400 }
      );

      const created = await checkout.create(
        guest,
        randomUUID(),
        await input({ pickupPointId: pickupId, referrer: 'Nguyễn Minh Anh - 12A1' })
      );
      const detail = await orders.detail(seller, created.orderId, true);
      assert.equal(detail.referrer, 'Nguyễn Minh Anh - 12A1');
    });
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
    await db.close();
  }
});
