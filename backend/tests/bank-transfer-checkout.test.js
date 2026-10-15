import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../src/common/db.js';
import { config } from '../src/config.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { CheckoutService } from '../src/order/checkout-service.js';
import { OrderService } from '../src/order/order-service.js';
import { PaymentService } from '../src/payment/payment-service.js';
import { futurePickupTime } from './pickup-fixtures.js';

test('bank transfer checkout exposes the bank and waits for seller reconciliation and acceptance', async t => {
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
  const payments = new PaymentService(undefined, undefined, orders, undefined, undefined,
    { async signed() { return 'https://storage.example.com/qr.png'; } });
  const seller = { id: randomUUID(), type: 'SELLER', scope: 'seller:bank-test' };
  const customer = { id: randomUUID(), type: 'CUSTOMER', scope: 'customer:bank-test' };
  const guest = { id: null, type: 'GUEST', scope: 'guest:bank-test' };
  const productId = randomUUID(), assetId = randomUUID(), settingsId = randomUUID(), pickupId = randomUUID();
  const items = [{ kind: 'PRODUCT', catalogId: productId, quantity: 1 }];
  const bank = { bankName: 'Test Bank', accountNumber: '001234567890', accountHolder: 'TEST SHOP' };
  const create = async (actor, method = 'BANK_TRANSFER') => checkout.create(actor, randomUUID(), {
    items, quoteToken: (await checkout.quote({ items, paymentMethod: method })).quoteToken,
    buyer: { fullName: 'Khách Test', phone: '0912345678' },
    pickupPointId: pickupId, paymentMethod: method,
  });
  try {
    await applyMigrations({ query: sql });
    for (const actor of [seller, customer]) await db.query(
      `INSERT INTO shop.profiles(id,auth_user_id,role,active,created_at,updated_at)
       VALUES($1,$2,$3,true,now(),now())`, [actor.id, randomUUID(), actor.type]);
    await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,created_at,updated_at)
      VALUES($1,$2,'00000000-0000-0000-0000-000000000011','bank-test','Bánh Test',10000,'ACTIVE',now(),now())`, [productId, config.shopId]);
    await db.query(`INSERT INTO shop.product_inventory(id,stock_on_hand,stock_reserved,created_at,updated_at)
      VALUES($1,20,0,now(),now())`, [productId]);
    await db.query(`INSERT INTO shop.pickup_points(id,shop_id,name,instructions,active,created_at,updated_at)
      VALUES($1,$2,'Cổng trường','Gặp tại cổng',true,now(),now())`, [pickupId, config.shopId]);
    await db.query('UPDATE shop.shops SET accepting_orders=true WHERE id=$1', [config.shopId]);
    await assert.rejects(checkout.quote({ items, paymentMethod: 'BANK_TRANSFER' }), { code: 'BANK_NOT_CONFIGURED' });
    await db.query(`INSERT INTO shop.assets(id,shop_id,bucket,object_path,type,mime,size,created_at,updated_at)
      VALUES($1,$2,'test','bank-qr.png','PAYMENT_QR','image/png',100,now(),now())`, [assetId, config.shopId]);
    await db.query(`INSERT INTO shop.payment_settings_versions(id,shop_id,bank_name,account_number,account_holder,qr_asset_id,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,now(),now())`, [settingsId, config.shopId, bank.bankName, bank.accountNumber, bank.accountHolder, assetId]);
    await db.query('UPDATE shop.shops SET payment_settings_version_id=$1 WHERE id=$2', [settingsId, config.shopId]);
    assert.deepEqual((await checkout.quote({ items, paymentMethod: 'BANK_TRANSFER' })).bankTransfer, bank);
    assert.equal((await checkout.quote({ items, paymentMethod: 'CASH' })).bankTransfer, null);

    for (const buyer of [guest, customer]) await t.test(`${buyer.type} transfers before acceptance`, async () => {
      const created = await create(buyer);
      const owner = buyer.type === 'GUEST' ? { ...buyer, guestOrderId: created.orderId } : buyer;
      const instructions = await payments.instructions(owner, created.orderId);
      assert.equal(instructions.accountNumber, bank.accountNumber);
      assert.equal(instructions.transferContent, created.orderCode);
      assert.equal(instructions.waitForAcceptance, false);
      await assert.rejects(payments.instructions({ ...guest, guestOrderId: randomUUID() }, created.orderId), { code: 'NOT_FOUND' });
      const key = randomUUID();
      const reported = await payments.action(owner, created.orderId, false, 'payment-report', key, { expectedVersion: 0 });
      assert.equal(reported.status, 'PENDING_CONTACT');
      assert.equal(reported.paymentStatus, 'REPORTED');
      assert.deepEqual(await payments.action(owner, created.orderId, false, 'payment-report', key, { expectedVersion: 0 }), reported);
      assert.equal((await db.query('SELECT received_amount FROM shop.orders WHERE id=$1', [created.orderId])).rows[0].received_amount, '0');
      assert.equal((await db.query("SELECT count(*)::int AS count FROM shop.notifications WHERE order_id=$1 AND type='PAYMENT_REPORTED'", [created.orderId])).rows[0].count, 1);
      await assert.rejects(payments.action(owner, created.orderId, false, 'confirm-payment', randomUUID(), { expectedVersion: 1, amount: 10000 }), { code: 'SELLER_REQUIRED' });
      await assert.rejects(payments.action(owner, created.orderId, false, 'payment-report', randomUUID(), { expectedVersion: 1 }), { code: 'INVALID_PAYMENT_TRANSITION' });
      const confirmed = await payments.action(seller, created.orderId, true, 'confirm-payment', randomUUID(), { expectedVersion: 1, amount: 10000 });
      assert.equal(confirmed.status, 'PENDING_CONTACT');
      assert.equal(confirmed.paymentStatus, 'PAID');
      await orders.contact(seller, created.orderId, randomUUID(), { expectedVersion: 2, channel: 'PHONE', outcome: 'SUCCESS' });
      const accepted = await orders.action(seller, created.orderId, true, 'accept', randomUUID(), {
        expectedVersion: 3, confirmedPickupPointId: pickupId, confirmedPickupAt: futurePickupTime(),
      });
      assert.equal(accepted.status, 'ACCEPTED');
      assert.equal(accepted.paymentStatus, 'PAID');
    });

    const cancelled = await create(guest);
    const owner = { ...guest, guestOrderId: cancelled.orderId };
    await orders.action(owner, cancelled.orderId, false, 'cancel', randomUUID(), { expectedVersion: 0, reason: 'Đặt nhầm' });
    await assert.rejects(payments.action(owner, cancelled.orderId, false, 'payment-report', randomUUID(), { expectedVersion: 1 }), { code: 'INVALID_PAYMENT_TRANSITION' });
    const cash = await create(guest, 'CASH');
    await assert.rejects(payments.action({ ...guest, guestOrderId: cash.orderId }, cash.orderId, false, 'payment-report', randomUUID(), { expectedVersion: 0 }), { code: 'INVALID_PAYMENT_TRANSITION' });
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
    await db.close();
  }
});
