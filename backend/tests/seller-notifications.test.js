import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../src/config.js';
import { pool } from '../src/common/db.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { SellerReadService } from '../src/audit/seller-read-service.js';
import { AuditService } from '../src/audit/audit-service.js';

test('seller notification feed: recipient isolation, order details, pagination and private realtime', async t => {
  const db = new PGlite();
  const originalQuery = pool.query, originalConnect = pool.connect;
  const sql = async (text, params) => {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    return params ? db.query(text, params) : (await db.exec(text)).at(-1);
  };
  pool.query = sql;
  pool.connect = async () => ({ query: sql, release() {} });
  const sellers = [0, 1].map(() => ({ id: randomUUID(), authId: randomUUID(), type: 'SELLER' }));
  const customer = { id: randomUUID(), authId: randomUUID(), type: 'CUSTOMER' };
  const disabled = { id: randomUUID(), authId: randomUUID(), type: 'SELLER' };
  const orderId = randomUUID(), pickupId = randomUUID();
  const service = new SellerReadService();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE SCHEMA realtime; CREATE TABLE realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA auth,realtime TO authenticated; GRANT SELECT ON realtime.messages TO authenticated;
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.realtime.topic',true) $$;
      CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$
        INSERT INTO realtime.messages VALUES('broadcast',topic,event,payload,private) $$;`);
    await applyMigrations({ query: sql });
    const transport = fs.readFileSync(new URL('../deployment/seller-notifications-realtime.sql', import.meta.url), 'utf8');
    await db.exec(transport);
    await db.exec(transport); // Deployment SQL can be reapplied safely.
    for (const user of [...sellers, customer, disabled]) {
      await db.query(`INSERT INTO shop.profiles(id,auth_user_id,role,active,version,created_at,updated_at)
        VALUES($1,$2,$3,$4,0,now(),now())`, [user.id, user.authId, user.type, user !== disabled]);
    }
    await db.query(`INSERT INTO shop.pickup_points(id,shop_id,name,active,created_at,updated_at)
      VALUES($1,$2,'Pickup',true,now(),now())`, [pickupId, config.shopId]);
    await db.query(`INSERT INTO shop.orders(id,shop_id,order_code,buyer_name,buyer_phone,buyer_email,pickup_point_id,pickup_name,
      payment_method,payment_status,status,subtotal,total,received_amount,reservation_expires_at,created_at,updated_at)
      VALUES($1,$2,'ORD-POPUP','Buyer','0912345678','buyer@example.com',$3,'Pickup','CASH','UNPAID','PENDING_CONTACT',10000,10000,0,
        now()+interval '1 day',now(),now())`, [orderId, config.shopId, pickupId]);
    const audit = new AuditService();
    await t.test('order creation notifies each active seller, with identifiers only', async () => {
      await audit.notifySellers({ query: sql }, 'ORDER_CREATED', orderId);
      const events = (await db.query('SELECT * FROM realtime.messages')).rows;
      assert.equal(events.length, 2);
      for (const seller of sellers) assert.ok(events.some(event => event.topic === `seller:notifications:${seller.id}`));
      assert.ok(events.every(event => event.private && event.event === 'changed' && Object.keys(event.payload).join(',') === 'notificationId'));
    });
    await t.test('seller feed includes actionable details and never another recipient', async () => {
      for (const seller of sellers) {
        const feed = await service.notifications(seller, 0, 100, true);
        assert.equal(feed.totalElements, 1);
        assert.deepEqual({ ...feed.content[0], id: undefined, createdAt: undefined }, {
          id: undefined, type: 'ORDER_CREATED', orderId, orderCode: 'ORD-POPUP', buyerName: 'Buyer', orderTotal: 10000,
          isRead: false, createdAt: undefined,
        });
      }
      await assert.rejects(service.notifications(customer, 0, 20), error => error.status === 403);
      const other = await service.notifications(sellers[1], 0, 100, true);
      await assert.rejects(service.read(sellers[0], other.content[0].id), error => error.status === 404);
    });
    await t.test('pagination covers bursts and the popup feed excludes read and payment notifications', async () => {
      await audit.notifySellers({ query: sql }, 'PAYMENT_REVIEW_REQUIRED', orderId);
      for (let i = 0; i < 102; i++) {
        await db.query(`INSERT INTO shop.notifications(id,shop_id,recipient_profile_id,type,order_id,is_read,created_at,updated_at)
          VALUES($1,$2,$3,'ORDER_CREATED',$4,false,now(),now())`, [randomUUID(), config.shopId, sellers[0].id, orderId]);
      }
      const first = await service.notifications(sellers[0], 0, 100, true);
      const second = await service.notifications(sellers[0], 1, 100, true);
      assert.equal(first.totalElements, 103);
      assert.equal(first.totalPages, 2);
      assert.equal(first.content.length, 100);
      assert.equal(second.content.length, 3);
      assert.equal(new Set([...first.content, ...second.content].map(n => n.id)).size, 103);
      const id = first.content[0].id;
      await service.read(sellers[0], id);
      const feed = await service.notifications(sellers[0], 0, 100, true);
      assert.equal(feed.totalElements, 102);
      assert.ok(feed.content.every(n => !n.isRead && n.type === 'ORDER_CREATED'));
      const all = await service.notifications(sellers[0], 0, 100);
      assert.equal(all.totalElements, 104);
      assert.equal(all.unreadCount, 103);
      assert.ok((await db.query('SELECT payload FROM realtime.messages WHERE payload->>\'notificationId\'=$1', [id])).rows.length >= 2);
    });
    await t.test('private topic RLS rejects guests, customers, other sellers, disabled and revoked accounts', async () => {
      const topic = `seller:notifications:${sellers[0].id}`;
      const allowed = async (user, requestedTopic) => {
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.realtime.topic',$2,false)", [user?.authId || '', requestedTopic]);
        await db.exec('SET ROLE authenticated');
        try { return (await db.query('SELECT notifications_private.can_receive($1) AS allowed', [requestedTopic])).rows[0].allowed; }
        finally { await db.exec('RESET ROLE'); }
      };
      assert.equal(await allowed(sellers[0], topic), true);
      for (const who of [null, customer, sellers[1], disabled]) assert.equal(await allowed(who, topic), false);
      assert.equal(await allowed(disabled, `seller:notifications:${disabled.id}`), false);
      assert.equal(await allowed(customer, `seller:notifications:${customer.id}`), false);
      assert.equal(await allowed(sellers[0], 'chat:inbox:sellers'), false);
      await allowed(sellers[0], topic);
      await db.exec('SET ROLE authenticated');
      try {
        assert.ok((await db.query('SELECT * FROM realtime.messages')).rows.length > 0);
        await assert.rejects(db.query("INSERT INTO realtime.messages VALUES('broadcast',$1,'changed','{}',true)", [topic]), /permission denied/);
      } finally { await db.exec('RESET ROLE'); }
      await db.query("UPDATE shop.profiles SET role='CUSTOMER' WHERE id=$1", [sellers[0].id]);
      assert.equal(await allowed(sellers[0], topic), false);
      await db.exec('SET ROLE authenticated');
      try { assert.equal((await db.query('SELECT * FROM realtime.messages')).rows.length, 0); }
      finally { await db.exec('RESET ROLE'); }
    });
    await t.test('rollback publishes no order notification', async () => {
      const before = Number((await db.query('SELECT count(*) FROM realtime.messages')).rows[0].count);
      await db.exec('BEGIN');
      await audit.notifySellers({ query: sql }, 'ORDER_CREATED', orderId);
      await db.exec('ROLLBACK');
      assert.equal(Number((await db.query('SELECT count(*) FROM realtime.messages')).rows[0].count), before);
    });
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await db.close();
    await pool.end();
  }
});
