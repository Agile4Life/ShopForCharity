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

test('order confirmation: transactional outbox, post-commit send, replay, failures and worker recovery', async t => {
  const db = new PGlite();
  const originalConnect = pool.connect, originalQuery = pool.query;
  let tail = Promise.resolve(), inTransaction = false, failStatusRead = false;
  const sql = async (text, params) => {
    if (failStatusRead && !inTransaction && text.startsWith('SELECT status, sent_at')) throw new Error('status-read-failed');
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
    if (text === 'BEGIN') inTransaction = true;
    if (text === 'COMMIT' || text === 'ROLLBACK') inTransaction = false;
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  };
  const acquire = async () => {
    const previous = tail; let release;
    tail = new Promise(resolve => { release = resolve; }); await previous; return release;
  };
  pool.connect = async () => ({ query: sql, release: await acquire() });
  pool.query = async (...args) => { const release = await acquire(); try { return await sql(...args); } finally { release(); } };
  const settings = { shopId: config.shopId, email: { apiKey: 'test-key', from: 'Shop <orders@example.com>' } };
  const requests = [];
  let mode = 'success';
  const email = new OrderEmailService(settings, async (url, options) => {
    assert.equal(inTransaction, false, 'provider must be called after transaction commits');
    assert.equal(url, 'https://api.resend.com/emails');
    requests.push(options);
    if (mode === 'network') throw new Error('private-provider-error');
    if (mode === 'busy') return new Response('{}', { status: 429 });
    if (mode === 'invalid') return new Response('private-provider-error', { status: 422 });
    return new Response(JSON.stringify({ id: `provider-${requests.length}` }), { status: 200 });
  });
  const seller = { id: randomUUID(), type: 'SELLER', scope: 'seller-test' };
  const customer = { id: randomUUID(), type: 'CUSTOMER', scope: 'customer-test' };
  const pickupId = randomUUID(), productId = randomUUID();
  let failView = false;
  const orders = new OrderService({ seller(actor) { ApiException.check(actor.type === 'SELLER', 403, 'FORBIDDEN', 'Forbidden'); } },
    new OrderAccess(), { async pickup(id, client) { return (await client.query('SELECT * FROM shop.pickup_points WHERE id=$1', [id])).rows[0]; } },
    { async settle() {} }, new IdempotencyService(), new AuditService(),
    { async image() { if (failView) throw new Error('view-failed'); return null; }, async imageUrl() { return null; } }, email);
  const input = { expectedVersion: 0, confirmedPickupPointId: pickupId, confirmedPickupAt: new Date(Date.now() + 3600000).toISOString() };
  const makeOrder = async (registered = false, contact = true) => {
    const id = randomUUID();
    await db.query(`INSERT INTO shop.orders(id,shop_id,order_code,customer_id,buyer_name,buyer_phone,buyer_email,
      pickup_point_id,pickup_name,payment_method,payment_status,status,subtotal,total,received_amount,
      reservation_expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,'Khách Test','0123456789','buyer@example.com',
      $5,'Điểm nhận ban đầu','CASH','UNPAID','PENDING_CONTACT',20000,20000,0,now()+interval '1 day',now(),now())`,
    [id, config.shopId, `SHOP-${id}`, registered ? customer.id : null, pickupId]);
    await db.query(`INSERT INTO shop.order_items(id,order_id,kind,product_id,name_snapshot,unit_price,quantity,line_total,created_at,updated_at)
      VALUES($1,$2,'PRODUCT',$3,'Bánh Test',10000,2,20000,now(),now())`, [randomUUID(), id, productId]);
    if (contact) await db.query(`INSERT INTO shop.order_contact_attempts(id,order_id,seller_id,channel,outcome,created_at,updated_at)
      VALUES($1,$2,$3,'PHONE','SUCCESS',now(),now())`, [randomUUID(), id, seller.id]);
    return id;
  };
  const outbox = async id => (await db.query('SELECT * FROM shop.order_email_outbox WHERE order_id=$1', [id])).rows[0];
  const due = id => db.query("UPDATE shop.order_email_outbox SET next_attempt_at=now()-interval '1 second' WHERE order_id=$1", [id]);
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE shop_runtime;');
    await applyMigrations({ query: sql });
    for (const actor of [seller, customer]) await db.query(`INSERT INTO shop.profiles(id,auth_user_id,role,active,created_at,updated_at)
      VALUES($1,$2,$3,true,now(),now())`, [actor.id, randomUUID(), actor.type]);
    await db.query(`INSERT INTO shop.pickup_points(id,shop_id,name,instructions,active,created_at,updated_at)
      VALUES($1,$2,'Cổng trường','Mang theo mã đơn',true,now(),now())`, [pickupId, config.shopId]);
    await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,created_at,updated_at)
      VALUES($1,$2,'00000000-0000-0000-0000-000000000011','email-test','Bánh mới',10000,'ACTIVE',now(),now())`, [productId, config.shopId]);

    await t.test('guest and registered orders send to checkout email exactly once after successful acceptance', async () => {
      for (const registered of [false, true]) {
        const id = await makeOrder(registered), key = randomUUID(), before = requests.length;
        const accepted = await orders.action(seller, id, true, 'accept', key, input);
        assert.equal(accepted.status, 'ACCEPTED');
        assert.equal(accepted.confirmationEmail.status, 'SENT');
        assert.ok(accepted.confirmationEmail.sentAt);
        assert.deepEqual((await orders.detail(seller, id, true)).confirmationEmail, accepted.confirmationEmail);
        const buyerDetail = await orders.detail(registered ? customer : { guestOrderId: id, type: 'GUEST' }, id);
        assert.equal(Object.hasOwn(buyerDetail, 'confirmationEmail'), false);
        assert.equal((await outbox(id)).status, 'SENT');
        const body = JSON.parse(requests.at(-1).body);
        assert.deepEqual(body.to, ['buyer@example.com']);
        assert.match(body.text, /Bánh Test × 2/);
        assert.match(body.text, /Cổng trường/);
        assert.doesNotMatch(body.text, /Điểm nhận ban đầu|Bánh mới|guestAccessToken/);
        assert.equal(body.from, settings.email.from);
        assert.equal(requests.at(-1).headers.Authorization, 'Bearer test-key');
        assert.ok(requests.at(-1).signal instanceof AbortSignal);
        assert.deepEqual(await orders.action(seller, id, true, 'accept', key, input), accepted);
        assert.equal(requests.length, before + 1);
        await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), input));
        assert.equal(requests.length, before + 1);
      }
    });
    await t.test('post-commit email status read failure still returns successful confirmation without duplicate mail', async () => {
      const id = await makeOrder(), key = randomUUID(), before = requests.length;
      failStatusRead = true;
      let accepted;
      try { accepted = await orders.action(seller, id, true, 'accept', key, input); }
      finally { failStatusRead = false; }
      assert.equal(accepted.status, 'ACCEPTED');
      assert.equal(accepted.confirmationEmail, null);
      assert.equal((await outbox(id)).status, 'SENT');
      const replay = await orders.action(seller, id, true, 'accept', key, input);
      assert.equal(replay.confirmationEmail.status, 'SENT');
      assert.equal(requests.length, before + 1);
    });
    await t.test('invalid acceptance, wrong role and rollback never create/send an email', async () => {
      const before = requests.length, id = await makeOrder(), noContact = await makeOrder(false, false);
      await assert.rejects(orders.action(customer, id, true, 'accept', randomUUID(), input));
      await assert.rejects(orders.action(seller, noContact, true, 'accept', randomUUID(), input));
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), { ...input, expectedVersion: 9 }));
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), { expectedVersion: 0 }));
      failView = true;
      await assert.rejects(orders.action(seller, id, true, 'accept', randomUUID(), input), /view-failed/);
      failView = false;
      assert.equal(await outbox(id), undefined);
      assert.equal((await db.query('SELECT status FROM shop.orders WHERE id=$1', [id])).rows[0].status, 'PENDING_CONTACT');
      await orders.action(seller, id, true, 'reject', randomUUID(), { expectedVersion: 0, reason: 'Không thể giao' });
      assert.equal(await outbox(id), undefined);
      assert.equal(requests.length, before);
    });
    await t.test('network failure preserves acceptance and retries identical message/key after config/catalog changes', async () => {
      const id = await makeOrder(); mode = 'network';
      const accepted = await orders.action(seller, id, true, 'accept', randomUUID(), input);
      assert.equal(accepted.status, 'ACCEPTED');
      assert.equal(accepted.confirmationEmail.status, 'PENDING');
      const row = await outbox(id), first = requests.at(-1);
      assert.equal(row.status, 'PENDING'); assert.equal(row.last_error, 'PROVIDER_UNAVAILABLE');
      assert.equal(await email.deliver(id), false);
      settings.email.from = 'Changed <new@example.com>';
      await db.query("UPDATE shop.orders SET buyer_email='changed@example.com',pickup_name='Changed' WHERE id=$1", [id]);
      await due(id); mode = 'success';
      await email.deliver(id);
      assert.equal(requests.at(-1).body, first.body);
      assert.equal(requests.at(-1).headers['Idempotency-Key'], first.headers['Idempotency-Key']);
      assert.equal((await outbox(id)).status, 'SENT');
      assert.equal((await orders.detail(seller, id, true)).confirmationEmail.status, 'SENT');
    });
    await t.test('missing email config queues safely and a later worker sends; overlapping workers claim once', async () => {
      const id = await makeOrder(); settings.email.apiKey = '';
      const before = requests.length;
      const accepted = await orders.action(seller, id, true, 'accept', randomUUID(), input);
      assert.equal(accepted.confirmationEmail.status, 'PENDING');
      assert.equal((await outbox(id)).status, 'PENDING');
      assert.equal((await outbox(id)).attempts, 0);
      assert.equal(requests.length, before);
      settings.email.apiKey = 'test-key';
      await Promise.all([email.deliver(id), email.deliver(id)]);
      assert.equal(requests.length, before + 1);
      assert.equal((await outbox(id)).status, 'SENT');
    });
    await t.test('rate limits retry, permanent failures stop and expired dedup windows require review', async () => {
      const busy = await makeOrder(); mode = 'busy';
      await orders.action(seller, busy, true, 'accept', randomUUID(), input);
      assert.equal((await outbox(busy)).status, 'PENDING');
      await db.query("UPDATE shop.order_email_outbox SET first_attempt_at=now()-interval '25 hours' WHERE order_id=$1", [busy]);
      await due(busy);
      const before = requests.length;
      await email.deliver(busy);
      assert.equal(requests.length, before);
      assert.equal((await outbox(busy)).last_error, 'RETRY_WINDOW_EXPIRED');
      assert.equal((await outbox(busy)).status, 'FAILED');
      const invalid = await makeOrder(); mode = 'invalid';
      await orders.action(seller, invalid, true, 'accept', randomUUID(), input);
      assert.equal((await outbox(invalid)).status, 'FAILED');
      assert.equal((await outbox(invalid)).last_error, 'PROVIDER_HTTP_422');
      mode = 'success';
    });
    await t.test('crashed worker lease recovers with the same persisted request', async () => {
      const id = await makeOrder(); settings.email.apiKey = '';
      await orders.action(seller, id, true, 'accept', randomUUID(), input);
      settings.email.apiKey = 'test-key';
      const claimed = await email.claim(id);
      assert.equal(await email.deliver(id), false);
      await due(id);
      await email.deliver(id);
      assert.equal(requests.at(-1).body, claimed.body);
      assert.equal(requests.at(-1).headers['Idempotency-Key'], `order-confirmation/${claimed.id}`);
      assert.equal((await outbox(id)).status, 'SENT');
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
    await t.test('private outbox grants deny browser roles and cron needs its own secret', async () => {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [role, 'shop.order_email_outbox', 'SELECT'])).rows[0].allowed, false);
      }
      assert.equal((await db.query("SELECT has_table_privilege('shop_runtime','shop.order_email_outbox','UPDATE') AS allowed")).rows[0].allowed, true);
      const { default: app } = await import('../src/app.js');
      const service = getOrderEmailService(), original = service.flush, originalSecret = config.cronSecret;
      let calls = 0;
      service.flush = async () => { calls++; return { processed: 1, configured: true }; };
      config.cronSecret = 'test-email-cron';
      try {
        const path = '/api/v1/cron/order-emails';
        assert.equal((await request(app).get(path)).status, 401);
        assert.equal((await request(app).get(path).set('Authorization', 'Bearer wrong')).status, 401);
        assert.equal(calls, 0);
        assert.equal((await request(app).get(path).set('Authorization', 'Bearer test-email-cron')).status, 200);
        assert.equal(calls, 1);
        assert.equal((await request(app).head(path).set('Authorization', 'Bearer test-email-cron')).status, 405);
        config.cronSecret = '';
        assert.equal((await request(app).get(path)).status, 503);
      } finally { service.flush = original; config.cronSecret = originalSecret; }
    });
  } finally {
    pool.connect = originalConnect; pool.query = originalQuery;
    await db.close(); await pool.end();
  }
});
