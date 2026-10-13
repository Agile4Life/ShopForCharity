import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/common/db.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { SellerReadService } from '../src/audit/seller-read-service.js';

test('confirmed order history: successful orders, Vietnam confirmation dates, summary and seller-only API', async t => {
  const db = new PGlite();
  const originalQuery = pool.query, originalConnect = pool.connect;
  const originalJwt = { ...config.jwt };
  const sql = async (text, params) => {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  };
  pool.query = sql;
  pool.connect = async () => ({ query: sql, release() {} });
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'confirmed-history-test', alg: 'ES256' };
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${server.address().port}`;
  config.jwt.issuer = issuer; config.jwt.jwksUri = `${issuer}/jwks`;
  const seller = { id: randomUUID(), type: 'SELLER' }, customer = { id: randomUUID(), type: 'CUSTOMER' };
  const disabled = { id: randomUUID(), type: 'SELLER' };
  const service = new SellerReadService();
  const entries = [];
  const addOrder = async (status, total, paymentStatus, acceptedAt, shopId = config.shopId) => {
    const id = randomUUID(), orderCode = entries.length ? `ORD-HIST${entries.length}` : 'ORD-8K3M7P2Q';
    await db.query(`INSERT INTO shop.orders(id,shop_id,order_code,buyer_name,buyer_phone,buyer_email,
      pickup_name,pickup_instructions,payment_method,payment_status,status,subtotal,total,received_amount,
      confirmed_at,reservation_expires_at,created_at,updated_at)
      VALUES($1,$2,$3,'Khách Test','0912345678','buyer@example.com','Sảnh nhà B','Gọi khi đến',
        'CASH',$4,$5,$6,$6,$7,'2026-11-01T03:30:00Z','2026-11-02T00:00:00Z','2026-10-01T00:00:00Z',now())`,
    [id, shopId, orderCode, paymentStatus, status, total, paymentStatus === 'PAID' ? total : 0]);
    if (acceptedAt) await db.query(`INSERT INTO shop.order_status_history(id,order_id,from_status,to_status,
      actor_id,actor_type,created_at,updated_at) VALUES($1,$2,'PENDING_CONTACT','ACCEPTED',$3,'SELLER',$4,$4)`,
    [randomUUID(), id, seller.id, acceptedAt]);
    const entry = { id, orderCode };
    entries.push(entry);
    return entry;
  };
  try {
    await applyMigrations({ query: sql });
    for (const actor of [seller, customer, disabled]) {
      actor.authId = randomUUID();
      await db.query(`INSERT INTO shop.profiles(id,auth_user_id,role,active,full_name,created_at,updated_at)
        VALUES($1,$2,$3,$4,'Người bán Test',now(),now())`, [actor.id, actor.authId, actor.type, actor !== disabled]);
      actor.token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
        .setSubject(actor.authId).setAudience('authenticated').setIssuer(issuer).setExpirationTime('1h').sign(privateKey);
    }
    const first = await addOrder('ACCEPTED', 10000, 'PAID', '2026-10-12T17:00:00Z');
    await addOrder('COMPLETED', 20000, 'UNPAID', '2026-10-13T16:59:59.999Z');
    await addOrder('PREPARING', 30000, 'REPORTED', '2026-10-13T17:00:00Z');
    await addOrder('READY', 40000, 'PAID', '2026-10-12T16:59:59.999Z');
    const legacy = await addOrder('ACCEPTED', 50000, 'UNPAID', null);
    await addOrder('CANCELLED', 60000, 'REFUNDED', '2026-10-12T18:00:00Z');
    await addOrder('PENDING_CONTACT', 70000, 'UNPAID', null);
    await addOrder('REJECTED', 80000, 'UNPAID', null);
    await addOrder('EXPIRED', 90000, 'UNPAID', null);
    const otherShop = randomUUID();
    await db.query('INSERT INTO shop.shops(id,name,accepting_orders,created_at,updated_at) VALUES($1,$2,false,now(),now())', [otherShop, 'Other Shop']);
    await addOrder('ACCEPTED', 99999, 'PAID', '2026-10-12T18:00:00Z', otherShop);
    await db.query(`INSERT INTO shop.order_status_history(id,order_id,to_status,actor_id,actor_type,created_at,updated_at)
      VALUES($1,$2,'ACCEPTED',$3,'SELLER','2026-10-11T10:00:00Z','2026-10-11T10:00:00Z')`, [randomUUID(), first.id, seller.id]);

    await t.test('each successful order appears once; other shops and unsuccessful statuses are excluded', async () => {
      const history = await service.confirmedOrders(seller);
      assert.equal(history.totalElements, 5);
      assert.equal(history.content.length, 5);
      assert.equal(new Set(history.content.map(o => o.id)).size, 5);
      assert.deepEqual(history.summary, { totalValue: 150000, paidValue: 50000 });
      assert.deepEqual(history.content.map(o => o.status), ['PREPARING', 'COMPLETED', 'ACCEPTED', 'READY', 'ACCEPTED']);
      const order = history.content.find(o => o.id === first.id);
      assert.equal(order.acceptedAt, '2026-10-12T17:00:00.000Z');
      assert.equal(order.pickupAt, '2026-11-01T03:30:00.000Z');
      assert.equal(order.acceptedBy, 'Người bán Test');
      assert.equal(order.pickupPointName, 'Sảnh nhà B');
      assert.equal(Object.hasOwn(order, 'buyerEmail'), false);
      assert.equal(history.content.find(o => o.id === legacy.id).acceptedAt, null);
    });
    await t.test('Vietnam date uses the confirmation event, not order creation or pickup appointment', async () => {
      const history = await service.confirmedOrders(seller, { date: '2026-10-13' });
      assert.equal(history.totalElements, 2);
      assert.deepEqual(history.summary, { totalValue: 30000, paidValue: 10000 });
      assert.deepEqual(history.content.map(o => o.id), [entries[1].id, first.id]);
    });
    await t.test('summary covers all pages; search accepts lowercase/grouped codes; empty results have zero totals', async () => {
      const pages = await Promise.all([0, 1, 2].map(page => service.confirmedOrders(seller, { page, size: 2 })));
      assert.deepEqual(pages.map(p => p.content.length), [2, 2, 1]);
      for (const page of pages) {
        assert.equal(page.totalElements, 5); assert.equal(page.totalPages, 3);
        assert.deepEqual(page.summary, { totalValue: 150000, paidValue: 50000 });
      }
      assert.equal(new Set(pages.flatMap(p => p.content.map(o => o.id))).size, 5);
      const searched = await service.confirmedOrders(seller, { orderCode: ' ord-8k3m 7p2q ' });
      assert.deepEqual(searched.content.map(o => o.id), [first.id]);
      const empty = await service.confirmedOrders(seller, { date: '2026-11-01' });
      assert.equal(empty.totalElements, 0); assert.equal(empty.totalPages, 0);
      assert.deepEqual(empty.content, []); assert.deepEqual(empty.summary, { totalValue: 0, paidValue: 0 });
    });
    await t.test('invalid filters and non-sellers are rejected', async () => {
      for (const date of ['2026-02-30', '2026-13-01', 'invalid', '2026-1-01', ['2026-10-13']]) {
        await assert.rejects(service.confirmedOrders(seller, { date }), error => error.code === 'INVALID_DATE');
      }
      for (const page of [-1, NaN, 1.5, 100001]) {
        await assert.rejects(service.confirmedOrders(seller, { page }), error => error.code === 'INVALID_PAGE');
      }
      for (const orderCode of ['%', "' OR true--", ['ORD-8K3M7P2Q']]) {
        await assert.rejects(service.confirmedOrders(seller, { orderCode }), error => error.code === 'INVALID_ORDER_CODE');
      }
      await assert.rejects(service.confirmedOrders(customer), error => error.status === 403);
    });
    await t.test('real HTTP controller protects history and applies filters/pagination', async () => {
      const { default: app } = await import('../src/app.js');
      const path = '/api/v1/seller/confirmed-orders';
      assert.equal((await request(app).get(path)).status, 401);
      for (const actor of [customer, disabled]) {
        assert.equal((await request(app).get(path).set('Authorization', `Bearer ${actor.token}`)).status, 403);
      }
      const response = await request(app).get(path).set('Authorization', `Bearer ${seller.token}`)
        .query({ date: '2026-10-13', size: 1, page: 1 });
      assert.equal(response.status, 200);
      assert.equal(response.body.content[0].id, first.id);
      assert.equal(response.body.totalPages, 2);
      assert.deepEqual(response.body.summary, { totalValue: 30000, paidValue: 10000 });
      assert.equal((await request(app).get(path).set('Authorization', `Bearer ${seller.token}`)
        .query({ page: 'bad' })).status, 400);
    });
  } finally {
    Object.assign(config.jwt, originalJwt);
    pool.query = originalQuery; pool.connect = originalConnect;
    await db.close(); await pool.end();
    await new Promise(resolve => server.close(resolve));
  }
});
