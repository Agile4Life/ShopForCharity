import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/common/db.js';
import { ApiException } from '../src/common/api-exception.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { OrderService } from '../src/order/order-service.js';
import { OrderAccess } from '../src/order/order-access.js';
import { IdempotencyService } from '../src/infrastructure/idempotency-service.js';
import { AuditService } from '../src/audit/audit-service.js';
import { SellerReadService } from '../src/audit/seller-read-service.js';
import { OrderEmailService, getOrderEmailService } from '../src/infrastructure/order-email-service.js';
import { orderConfirmationEmail } from '../src/order/order-confirmation-email.js';
import { futurePickupTime } from './pickup-fixtures.js';

test('confirmation template escapes buyer/catalog data and uses confirmed Vietnam pickup time', () => {
  const email = orderConfirmationEmail({
    order_code: 'SHOP-123', buyer_name: '<script>alert(1)</script>', buyer_email: ' guest@example.com ',
    total: 20000, confirmed_at: '2026-11-01T03:30:00Z', pickup_name: 'Cổng <A>',
    pickup_instructions: 'Gọi người bán', payment_method: 'BANK_TRANSFER', payment_status: 'REPORTED',
  }, [{ name_snapshot: '<img src=x onerror=alert(1)>', quantity: 2, unit_price: 10000, line_total: 20000 }],
  { name: 'Shop & Charity', contact_phone: '0123456789', contact_email: 'shop@example.com' });
  assert.deepEqual(email.to, ['guest@example.com']);
  assert.equal(email.reply_to, 'shop@example.com');
  assert.match(email.text, /10:30/);
  assert.match(email.text, /20\.000/);
  assert.match(email.text, /đang chờ đối soát/);
  assert.match(email.text, /Số điện thoại cửa hàng: 0123456789/);
  assert.match(email.text, /Email hỗ trợ: shop@example.com/);
  assert.match(email.html, /shop@example.com/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&lt;img/);
  assert.doesNotMatch(email.html, /<script>|<img/);
});

test('confirmation template preserves new and legacy codes, pickup instructions and payment snapshots', () => {
  for (const orderCode of ['ORD-8K3M7P2Q', 'ORD-ABCDEF1234567890']) {
    for (const [method, status, methodLabel, statusLabel] of [
      ['CASH', 'UNPAID', 'Tiền mặt', 'Chưa thanh toán'],
      ['BANK_TRANSFER', 'REPORTED', 'Chuyển khoản QR', 'Đã báo chuyển khoản, đang chờ đối soát'],
      ['BANK_TRANSFER', 'PAID', 'Chuyển khoản QR', 'Đã thanh toán'],
    ]) {
      const email = orderConfirmationEmail({
        order_code: orderCode, buyer_name: 'Khách Test', buyer_email: 'buyer@example.com',
        total: 20000, confirmed_at: '2026-11-01T03:30:00Z', pickup_point_id: null,
        pickup_name: 'Sảnh nhà B <tầng 2>', pickup_instructions: 'Ghế đá số 3.\nGọi khi đến.',
        payment_method: method, payment_status: status,
        guest_access_token: 'private-guest-token', internal_note: 'private-seller-note',
      }, [{ name_snapshot: 'Bánh Test', quantity: 2, unit_price: 10000, line_total: 20000 }],
      { name: 'Gói Ấm Trao Em', contact_phone: ' 0389414659 ', contact_email: ' dieuntt1402@gmail.com ' });
      assert.equal(email.subject, `Đơn hàng ${orderCode} đã được xác nhận thành công`);
      assert.equal(email.reply_to, 'dieuntt1402@gmail.com');
      assert.ok(email.text.includes(`Mã đơn hàng: ${orderCode}`));
      assert.ok(email.html.includes(orderCode));
      assert.ok(email.text.includes(`Phương thức thanh toán: ${methodLabel}`));
      assert.ok(email.text.includes(`Trạng thái thanh toán: ${statusLabel}`));
      assert.ok(email.text.includes('Sảnh nhà B <tầng 2>'));
      assert.ok(email.text.includes('Ghế đá số 3.\nGọi khi đến.'));
      assert.ok(email.text.includes('Gói Ấm Trao Em'));
      assert.match(email.html, /Sảnh nhà B &lt;tầng 2&gt;/);
      assert.match(email.html, /10:30/);
      assert.match(email.html, /Số lượng: 2/);
      assert.match(email.html, /Đơn giá: 10\.000/);
      assert.doesNotMatch(`${email.text}\n${email.html}`, /private-guest-token|private-seller-note/);
    }
  }
});

test('confirmation template omits empty contacts and invalid reply addresses, and escapes shop/pickup data', () => {
  const order = {
    order_code: 'ORD-8K3M7P2Q', buyer_name: 'Khách', buyer_email: 'buyer@example.com', total: 0,
    confirmed_at: '2026-11-01T03:30:00Z', pickup_name: '<script>pickup</script>',
    pickup_instructions: '<img src=x onerror=alert(1)>', payment_method: 'CASH', payment_status: 'UNPAID',
  };
  for (const contactEmail of [null, ' ', 'invalid', 'shop@example.com\r\nBcc: other@example.com']) {
    const email = orderConfirmationEmail(order, [], {
      name: '<script>shop</script>', contact_phone: ' ', contact_email: contactEmail,
    });
    assert.equal(Object.hasOwn(email, 'reply_to'), false);
    assert.doesNotMatch(email.text, /Số điện thoại cửa hàng|Email hỗ trợ|Bcc:/);
    assert.match(email.html, /&lt;script&gt;shop&lt;\/script&gt;/);
    assert.match(email.html, /&lt;script&gt;pickup&lt;\/script&gt;/);
    assert.match(email.html, /&lt;img/);
    assert.doesNotMatch(email.html, /<script>|<img/);
  }
});

test('order confirmation: accepts orders with shop pickup point without queuing or sending confirmation emails', async t => {
  const db = new PGlite();
  const originalConnect = pool.connect, originalQuery = pool.query;
  let tail = Promise.resolve();
  const sql = async (text, params) => {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  };
  const acquire = async () => {
    const previous = tail; let release;
    tail = new Promise(resolve => { release = resolve; }); await previous; return release;
  };
  pool.connect = async () => ({ query: sql, release: await acquire() });
  pool.query = async (...args) => { const release = await acquire(); try { return await sql(...args); } finally { release(); } };
  const seller = { id: randomUUID(), type: 'SELLER', scope: 'seller-test' };
  const customer = { id: randomUUID(), type: 'CUSTOMER', scope: 'customer-test' };
  const pickupId = randomUUID(), productId = randomUUID();
  let failView = false;
  const orders = new OrderService({ seller(actor) { ApiException.check(actor.type === 'SELLER', 403, 'FORBIDDEN', 'Forbidden'); } },
    new OrderAccess(), { async pickup(id, client) { return (await client.query('SELECT * FROM shop.pickup_points WHERE id=$1', [id])).rows[0]; } },
    { async settle() {} }, new IdempotencyService(), new AuditService(),
    { async image() { if (failView) throw new Error('view-failed'); return null; }, async imageUrl() { return null; } });
  const input = { expectedVersion: 0, confirmedPickupPointId: pickupId, confirmedPickupAt: futurePickupTime() };
  const makeOrder = async (registered = false, contact = true) => {
    const id = randomUUID();
    await db.query(`INSERT INTO shop.orders(id,shop_id,order_code,customer_id,buyer_name,buyer_phone,buyer_email,
      pickup_point_id,pickup_name,payment_method,payment_status,status,subtotal,total,received_amount,
      reservation_expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,'Khách Test','0123456789','',
      $5,'Điểm nhận ban đầu','CASH','UNPAID','PENDING_CONTACT',20000,20000,0,now()+interval '1 day',now(),now())`,
    [id, config.shopId, `SHOP-${id}`, registered ? customer.id : null, pickupId]);
    await db.query(`INSERT INTO shop.order_items(id,order_id,kind,product_id,name_snapshot,unit_price,quantity,line_total,created_at,updated_at)
      VALUES($1,$2,'PRODUCT',$3,'Bánh Test',10000,2,20000,now(),now())`, [randomUUID(), id, productId]);
    if (contact) await db.query(`INSERT INTO shop.order_contact_attempts(id,order_id,seller_id,channel,outcome,created_at,updated_at)
      VALUES($1,$2,$3,'PHONE','SUCCESS',now(),now())`, [randomUUID(), id, seller.id]);
    return id;
  };
  const outbox = async id => (await db.query('SELECT * FROM shop.order_email_outbox WHERE order_id=$1', [id])).rows[0];
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE shop_runtime;');
    await applyMigrations({ query: sql });
    for (const actor of [seller, customer]) await db.query(`INSERT INTO shop.profiles(id,auth_user_id,role,active,created_at,updated_at)
      VALUES($1,$2,$3,true,now(),now())`, [actor.id, randomUUID(), actor.type]);
    await db.query(`INSERT INTO shop.pickup_points(id,shop_id,name,instructions,active,created_at,updated_at)
      VALUES($1,$2,'Cổng trường','Mang theo mã đơn',true,now(),now())`, [pickupId, config.shopId]);
    await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,created_at,updated_at)
      VALUES($1,$2,'00000000-0000-0000-0000-000000000011','email-test','Bánh mới',10000,'ACTIVE',now(),now())`, [productId, config.shopId]);

    await t.test('guest and registered orders accept without queuing confirmation emails', async () => {
      for (const registered of [false, true]) {
        const id = await makeOrder(registered), key = randomUUID();
        const accepted = await orders.action(seller, id, true, 'accept', key, input);
        assert.equal(accepted.status, 'ACCEPTED');
        assert.equal(accepted.pickupPointId, pickupId);
        assert.equal(accepted.pickupPointName, 'Cổng trường');
        assert.equal(Object.hasOwn(accepted, 'confirmationEmail'), false);
        assert.equal(Object.hasOwn(await orders.detail(seller, id, true), 'confirmationEmail'), false);
        const buyerDetail = await orders.detail(registered ? customer : { guestOrderId: id, type: 'GUEST' }, id);
        assert.equal(Object.hasOwn(buyerDetail, 'confirmationEmail'), false);
        assert.equal(await outbox(id), undefined);
        assert.deepEqual(await orders.action(seller, id, true, 'accept', key, input), accepted);
        await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), input));
      }
    });

    await t.test('invalid acceptance, wrong role and rollback keep order in PENDING_CONTACT', async () => {
      const id = await makeOrder(), noContact = await makeOrder(false, false);
      await assert.rejects(orders.action(customer, id, true, 'accept', randomUUID(), input));
      await assert.rejects(orders.action(seller, noContact, true, 'accept', randomUUID(), input));
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), { ...input, expectedVersion: 9 }));
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), { expectedVersion: 0, confirmedPickupAt: input.confirmedPickupAt }));
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), { expectedVersion: 0 }));
      failView = true;
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), input), /view-failed/);
      failView = false;
      assert.equal(await outbox(id), undefined);
      assert.equal((await db.query('SELECT status FROM shop.orders WHERE id=$1', [id])).rows[0].status, 'PENDING_CONTACT');
      await orders.action(seller, id, true, 'reject', randomUUID(), { expectedVersion: 0, reason: 'Không thể giao' });
      assert.equal(await outbox(id), undefined);
    });

    await t.test('dashboard treats confirmed orders as resolved and paid confirmed orders as revenue', async () => {
      const id = await makeOrder();
      const reads = new SellerReadService({ seller() {} });
      const before = await reads.dashboard(seller);
      await orders.action(seller, id, true, 'accept', randomUUID(), input);
      const confirmed = await reads.dashboard(seller);
      assert.equal(confirmed.pendingCount, before.pendingCount - 1);
      assert.equal(confirmed.resolvedCount, before.resolvedCount + 1);
      assert.equal(confirmed.completedRevenue, before.completedRevenue);
      await db.query("UPDATE shop.orders SET payment_status='PAID', received_amount=total WHERE id=$1", [id]);
      const paid = await reads.dashboard(seller);
      assert.equal(paid.completedRevenue, before.completedRevenue + 20000);
      assert.equal(paid.pendingRevenue, before.pendingRevenue);
      assert.equal((await orders.detail(seller, id, true)).status, 'ACCEPTED');
    });

    await t.test('order email cron endpoint is disabled', async () => {
      const { default: app } = await import('../src/app.js');
      assert.equal((await request(app).get('/api/v1/cron/order-emails')).status, 404);
    });
  } finally {
    pool.connect = originalConnect; pool.query = originalQuery;
    await db.close(); await pool.end();
  }
});
