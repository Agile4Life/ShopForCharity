import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import * as jose from 'jose';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/common/db.js';
import { applyMigrations } from '../src/migrations/migrate.js';

test('chat: real controllers, PostgreSQL constraints, RLS and shared seller inbox', async t => {
  const db = new PGlite();
  const { publicKey, privateKey } = await jose.generateKeyPair('ES256');
  const jwk = { ...await jose.exportJWK(publicKey), kid: 'chat-test-key', alg: 'ES256' };
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${server.address().port}`;
  config.jwt.issuer = issuer; config.jwt.jwksUri = `${issuer}/jwks`;
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
  const users = {};
  let conversation;
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE shop_runtime;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE SCHEMA realtime; CREATE TABLE realtime.messages(extension text,topic text,payload jsonb);
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA realtime,auth TO authenticated; GRANT SELECT ON realtime.messages TO authenticated;
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.realtime.topic',true) $$;
      CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.messages VALUES('broadcast',topic,payload) $$;`);
    await applyMigrations({ query: sql });
    await db.exec(fs.readFileSync(new URL('../deployment/chat-realtime.sql', import.meta.url), 'utf8'));
    for (const [name, role] of [['buyer','CUSTOMER'],['other','CUSTOMER'],['seller1','SELLER'],['seller2','SELLER'],['disabled','SELLER']]) {
      const id = crypto.randomUUID(), authId = crypto.randomUUID();
      await db.query(`INSERT INTO shop.profiles(id,auth_user_id,role,active,full_name,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,0,now(),now())`, [id, authId, role, name !== 'disabled', name]);
      const token = await new jose.SignJWT({ email: `${name}@example.com` }).setProtectedHeader({ alg:'ES256',kid:jwk.kid }).setSubject(authId).setAudience('authenticated').setIssuer(issuer).setExpirationTime('1h').sign(privateKey);
      users[name] = { id, authId, token };
    }
    const { default: app } = await import('../src/app.js');
    const api = (who, method, path, body) => {
      const req = request(app)[method](`/api/v1${path}`).set('Origin','http://localhost:5173');
      if (who) req.set('Authorization',`Bearer ${users[who].token}`);
      return body === undefined ? req : req.send(body);
    };
    const send = (who, content, rest = {}) => api(who,'post',`/chat/conversations/${conversation}/messages`, { clientMessageId:crypto.randomUUID(),content,...rest });
    await t.test('guest, forged token and disabled account cannot use chat', async () => {
      assert.equal((await api(null,'post','/chat/conversation',{})).status,401);
      assert.equal((await api('disabled','get','/chat/unread')).status,403);
      assert.equal((await request(app).get('/api/v1/chat/unread').set('Authorization','Bearer forged')).status,401);
    });
    await t.test('one persistent conversation per customer; seller cannot create customer chat', async () => {
      const responses = await Promise.all([api('buyer','post','/chat/conversation',{}),api('buyer','post','/chat/conversation',{})]);
      assert.equal(responses[0].status,200); conversation=responses[0].body.id;
      assert.equal(responses[1].body.id,conversation);
      assert.equal((await api('seller1','post','/chat/conversation',{})).status,403);
    });
    await t.test('other customer cannot read, write or mark conversation read', async () => {
      for (const path of [`/chat/conversations/${conversation}`,`/chat/conversations/${conversation}/messages`]) assert.equal((await api('other','get',path)).status,404);
      assert.equal((await send('other','intrusion')).status,404);
      assert.equal((await api('other','post',`/chat/conversations/${conversation}/read`,{sequence:0})).status,404);
      assert.equal((await api('buyer','get','/seller/chat/conversations')).status,403);
    });
    await t.test('both sellers see customer and can reply concurrently with ordered sequences', async () => {
      assert.equal((await send('buyer','Xin chào')).status,200);
      for (const who of ['seller1','seller2']) {
        const inbox=await api(who,'get','/seller/chat/conversations'); assert.equal(inbox.body.content[0].id,conversation); assert.equal(inbox.body.content[0].unreadCount,1);
      }
      const replies=await Promise.all([send('seller1','Chào bạn từ seller 1'),send('seller2','Chào bạn từ seller 2')]);
      assert.deepEqual(replies.map(r=>r.status),[200,200]); assert.deepEqual(replies.map(r=>r.body.sequence).sort(),[2,3]);
      const messages=await api('buyer','get',`/chat/conversations/${conversation}/messages`);
      assert.deepEqual(messages.body.content.map(m=>m.sequence),[1,2,3]);
    });
    await t.test('read state is per account and cannot regress or read future messages', async () => {
      const path=`/chat/conversations/${conversation}/read`;
      assert.equal((await api('seller1','post',path,{sequence:3})).status,200);
      assert.equal((await api('seller1','get','/chat/unread')).body.count,0);
      assert.equal((await api('seller2','get','/chat/unread')).body.count,2);
      assert.equal((await api('buyer','get','/chat/unread')).body.count,2);
      assert.equal((await api('seller1','post',path,{sequence:1})).status,200);
      assert.equal((await api('seller1','post',path,{sequence:99})).status,400);
      assert.equal((await api('buyer','get',`/chat/conversations/${conversation}`)).body.recipientReadSequence,3);
    });
    await t.test('retry is deduplicated and changed retry payload is rejected', async () => {
      const intent={clientMessageId:crypto.randomUUID(),content:'gửi một lần'};
      const path=`/chat/conversations/${conversation}/messages`;
      const first=await api('buyer','post',path,intent),second=await api('buyer','post',path,intent);
      assert.equal(first.body.id,second.body.id);
      assert.equal((await api('buyer','post',path,{...intent,content:'sửa nội dung'})).status,409);
    });
    const productId=crypto.randomUUID();
    await t.test('server controls product snapshot, including sold-out active products', async () => {
      const cat=(await db.query('SELECT id FROM shop.categories LIMIT 1')).rows[0].id;
      await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,version,created_at,updated_at) VALUES($1,$2,$3,'chat-test-product','Sản phẩm thật',15000,'ACTIVE',0,now(),now())`,[productId,config.shopId,cat]);
      const result=await send('buyer','Sản phẩm này còn không?',{productId,product:{name:'Giả mạo',price:1}});
      assert.equal(result.status,200); assert.equal(result.body.product.name,'Sản phẩm thật'); assert.equal(result.body.product.price,15000);
      assert.equal((await send('seller1','',{productId})).status,200);
      await db.query("UPDATE shop.products SET status='ARCHIVED',name='Đã đổi tên',price=20000 WHERE id=$1",[productId]);
      assert.equal((await send('buyer','',{productId})).status,404);
      const history=await api('buyer','get',`/chat/conversations/${conversation}/messages`);
      assert.equal(history.body.content.find(m=>m.product)?.product.name,'Sản phẩm thật');
    });
    await t.test('validation rejects empty, oversized, malformed and invalid cursors', async () => {
      for (const content of ['', '   ', 'x'.repeat(4001), { text:'x' }]) assert.equal((await send('buyer',content)).status,400);
      assert.equal((await send('buyer','x',{clientMessageId:'invalid'})).status,400);
      assert.equal((await api('buyer','get',`/chat/conversations/${conversation}/messages?before=NaN`)).status,400);
      assert.equal((await api('seller1','get','/seller/chat/conversations?page=-1')).status,400);
      assert.equal((await api('buyer','get','/chat/conversations/not-uuid')).status,400);
    });
    await t.test('history pagination has no overlaps; new seller can access existing conversations', async () => {
      const last=await api('buyer','get',`/chat/conversations/${conversation}/messages?size=2`);
      assert.equal(last.body.content.length,2); assert.ok(last.body.nextBefore);
      const earlier=await api('buyer','get',`/chat/conversations/${conversation}/messages?size=2&before=${last.body.nextBefore}`);
      assert.ok(earlier.body.content.every(m=>m.sequence<last.body.nextBefore));
      await db.query("UPDATE shop.profiles SET role='SELLER' WHERE id=$1",[users.other.id]);
      assert.equal((await api('other','get',`/chat/conversations/${conversation}`)).status,200);
    });
    await t.test('private realtime policies enforce current buyer/seller membership and emit only IDs', async () => {
      async function permitted(who,topic) {
        await db.exec('BEGIN');
        try {
          await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.realtime.topic',$2,true)",[users[who].authId,topic]);
          await db.exec('SET LOCAL ROLE authenticated');
          const result=await db.query('SELECT chat_private.can_receive($1) AS allowed',[topic]);
          return result.rows[0].allowed;
        } finally { await db.exec('ROLLBACK'); }
      }
      const room=`chat:room:${conversation}`;
      assert.equal(await permitted('buyer',room),true);
      assert.equal(await permitted('seller1',room),true);
      assert.equal(await permitted('seller2','chat:inbox:sellers'),true);
      assert.equal(await permitted('buyer','chat:inbox:sellers'),false);
      assert.equal(await permitted('disabled',room),false);
      await db.query("UPDATE shop.profiles SET role='CUSTOMER' WHERE id=$1",[users.other.id]);
      assert.equal(await permitted('other',room),false);
      assert.equal(await permitted('other',`chat:inbox:${users.buyer.authId}`),false);
      assert.equal(await permitted('seller1','chat:room:bad'),false);
      const events=await db.query('SELECT topic,payload FROM realtime.messages');
      assert.ok(events.rows.length>0); assert.ok(events.rows.every(e=>Object.keys(e.payload).join(',')==='conversationId'));
      await db.query("UPDATE shop.profiles SET active=false WHERE id=$1",[users.seller1.id]);
      assert.equal(await permitted('seller1',room),false);
      assert.equal((await send('seller1','revoked')).status,403);
    });
    await t.test('per-user send rate limit is enforced', async () => {
      await db.query('DELETE FROM shop.rate_limit_windows');
      for(let i=0;i<30;i++) assert.equal((await send('buyer',`rate ${i}`)).status,200);
      assert.equal((await send('buyer','too fast')).status,429);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve)); await db.close(); await pool.end();
  }
});
