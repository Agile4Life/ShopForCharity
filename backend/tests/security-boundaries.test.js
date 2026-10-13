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
import { getGuestSessions } from '../src/identity/guest-sessions.js';
import { CryptoService } from '../src/identity/crypto.js';
import { getCheckoutService } from '../src/order/checkout-service.js';

test('security boundaries: real JWT, order ownership, guest sessions, CSRF and checkout abuse', async t => {
  const db = new PGlite();
  const originalQuery = pool.query, originalConnect = pool.connect;
  const originalJwt = { ...config.jwt }, originalSecure = config.cookieSecure;
  const sql = async (text, params) => {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  };
  pool.query = sql;
  pool.connect = async () => ({ query: sql, release() {} });
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'security-boundaries', alg: 'ES256' };
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${server.address().port}`;
  config.jwt.issuer = issuer; config.jwt.jwksUri = `${issuer}/jwks`; config.cookieSecure = true;
  const sessions = getGuestSessions();
  const token = (sub, claims = {}, options = {}) => new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setSubject(sub)
    .setAudience(options.audience || 'authenticated').setIssuer(options.issuer || issuer)
    .setExpirationTime(options.expiration || '1h').sign(privateKey);
  const origin = 'http://localhost:5173';
  const a = { id: randomUUID(), authId: randomUUID() }, b = { id: randomUUID(), authId: randomUUID() };
  const disabled = { id: randomUUID(), authId: randomUUID() };
  const ownId = randomUUID(), guestId = randomUUID(), otherGuestId = randomUUID();
  try {
    await applyMigrations({ query: sql });
    for (const actor of [a, b, disabled]) await db.query(`INSERT INTO shop.profiles
      (id,auth_user_id,role,active,full_name,created_at,updated_at)
      VALUES($1,$2,'CUSTOMER',$3,'Security Test',now(),now())`, [actor.id, actor.authId, actor !== disabled]);
    a.token = await token(a.authId); b.token = await token(b.authId);
    for (const [id, customerId, code] of [[ownId, a.id, 'ORD-OWN'], [guestId, null, 'ORD-GUEST'], [otherGuestId, null, 'ORD-OTHER']]) {
      await db.query(`INSERT INTO shop.orders(id,shop_id,customer_id,order_code,buyer_name,buyer_phone,buyer_email,
        pickup_name,payment_method,payment_status,status,subtotal,total,received_amount,version,
        guest_token_hash,guest_token_expires_at,reservation_expires_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,'Private Buyer','0912345678','private@example.com','School',
          'CASH','UNPAID','PENDING_CONTACT',10000,10000,0,0,$5,now()+interval '1 day',now()+interval '1 day',now(),now())`,
      [id, config.shopId, customerId, code, customerId ? null : CryptoService.hash('test-guest-secret')]);
    }
    const { default: app } = await import('../src/app.js');
    await t.test('anonymous, invalid, expired and wrong issuer/audience JWTs are rejected', async () => {
      for (const bearer of [null, 'invalid', await token(a.authId, {}, { expiration: '-1s' }),
        await token(a.authId, {}, { audience: 'other' }), await token(a.authId, {}, { issuer: 'https://other.example' })]) {
        const call = request(app).get('/api/v1/me/orders');
        if (bearer) call.set('Authorization', `Bearer ${bearer}`);
        assert.equal((await call).status, 401);
      }
      assert.equal((await request(app).get('/api/v1/me/orders').set('Authorization', `Bearer ${await token(disabled.authId)}`)).status, 403);
    });
    await t.test('customers cannot read, cancel, report payment or obtain QR for another customer order', async () => {
      const list = await request(app).get('/api/v1/me/orders').set('Authorization', `Bearer ${b.token}`);
      assert.equal(list.status, 200); assert.equal(list.body.totalElements, 0);
      for (const suffix of ['', '/payment-instructions']) {
        const result = await request(app).get(`/api/v1/me/orders/${ownId}${suffix}`).set('Authorization', `Bearer ${b.token}`);
        assert.equal(result.status, 404); assert.equal(JSON.stringify(result.body).includes('private@example.com'), false);
      }
      for (const suffix of ['/cancel', '/payment-report']) assert.equal((await request(app)
        .post(`/api/v1/me/orders/${ownId}${suffix}`).set('Authorization', `Bearer ${b.token}`)
        .set('Idempotency-Key', randomUUID()).send({ expectedVersion: 0, reason: 'Unauthorized' })).status, 404);
      assert.equal((await request(app).get(`/api/v1/me/orders/${ownId}`).set('Authorization', `Bearer ${a.token}`)).status, 200);
      assert.equal((await db.query('SELECT version FROM shop.orders WHERE id=$1', [ownId])).rows[0].version, 0);
    });
    await t.test('user-editable metadata and profile patches cannot elevate customer privileges', async () => {
      const forgedRole = await token(b.authId, { user_metadata: { role: 'SELLER', seller_shop_id: config.shopId } });
      for (const path of ['/seller/orders', '/seller/confirmed-orders', '/seller/audit-logs', '/seller/chat/conversations'])
        assert.equal((await request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${forgedRole}`)).status, 403);
      const patched = await request(app).patch('/api/v1/me').set('Authorization', `Bearer ${b.token}`)
        .send({ expectedVersion: 0, fullName: 'Customer', role: 'SELLER', active: true, authUserId: a.authId });
      assert.equal(patched.status, 200); assert.equal(patched.body.role, 'CUSTOMER'); assert.equal(patched.body.authUserId, b.authId);
    });
    await t.test('guest credentials are scoped, signed, private and do not bypass Origin protection', async () => {
      const granted = await request(app).post('/api/v1/guest/orders/access').set('Origin', origin)
        .send({ orderCode: 'ORD-GUEST', guestToken: 'test-guest-secret' });
      assert.equal(granted.status, 200);
      const cookie = granted.headers['set-cookie'][0];
      for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/v1']) assert.ok(cookie.includes(flag));
      assert.equal((await request(app).get('/api/v1/guest/orders/ORD-GUEST').set('Cookie', cookie)).status, 200);
      assert.equal((await request(app).get('/api/v1/guest/orders/ORD-OTHER').set('Cookie', cookie)).status, 404);
      assert.equal((await request(app).post('/api/v1/guest/orders/ORD-OTHER/cancel').set('Cookie', cookie)
        .set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ expectedVersion: 0, reason: 'Unauthorized' })).status, 404);
      assert.equal((await request(app).get('/api/v1/guest/orders/ORD-GUEST').set('Cookie', `guest_order=${sessions.order(guestId)}tampered`)).status, 401);
      const denied = await request(app).post('/api/v1/guest/orders/access').set('Origin', 'https://attacker.example')
        .set('Authorization', `Bearer ${a.token}`).send({ orderCode: 'ORD-GUEST', guestToken: 'test-guest-secret' });
      assert.equal(denied.status, 403); assert.equal(denied.body.code, 'CSRF_ORIGIN_REJECTED');
      assert.equal((await request(app).post('/api/v1/guest/orders/access').set('Origin', origin)
        .send({ orderCode: { injected: true }, guestToken: {} })).status, 401);
    });
    await t.test('rotating checkout sessions and spoofing forwarded IP cannot bypass create limits', async () => {
      await db.query('DELETE FROM shop.rate_limit_windows');
      const checkout = getCheckoutService(), originalCreate = checkout.create;
      let calls = 0;
      checkout.create = async () => { calls++; return { orderId: guestId, orderCode: 'ORD-GUEST' }; };
      try {
        for (let i = 0; i < 21; i++) {
          const result = await request(app).post('/api/v1/orders').set('Origin', origin)
            .set('Cookie', `checkout_session=${sessions.checkout()}`).set('X-Forwarded-For', `192.0.2.${i}`)
            .set('Idempotency-Key', randomUUID()).send({});
          assert.equal(result.status, i < 20 ? 201 : 429);
          if (i === 20) assert.equal(result.headers['retry-after'], '60');
        }
        assert.equal(calls, 20);
      } finally { checkout.create = originalCreate; }
    });
  } finally {
    pool.query = originalQuery; pool.connect = originalConnect;
    Object.assign(config.jwt, originalJwt); config.cookieSecure = originalSecure;
    await new Promise(resolve => server.close(resolve)); await db.close(); await pool.end();
  }
});
