// Opt-in: real Supabase Auth, disposable embedded shop DB, temporary users deleted afterward.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

if (process.env.RUN_LIVE_AUTH_REGISTRATION_CHECK !== 'true') throw new Error('Set RUN_LIVE_AUTH_REGISTRATION_CHECK=true to run this opt-in Auth check.');
const env = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const frontend = dotenv.parse(fs.readFileSync(new URL('../../frontend/.env.local', import.meta.url)));
for (const name of ['SUPABASE_URL', 'SUPABASE_BACKEND_SECRET_KEY', 'JWT_ISSUER_URI', 'JWT_JWK_SET_URI', 'JWT_EXPECTED_AUDIENCE', 'SELLER_REGISTRATION_CODE']) {
  if (env[name]) process.env[name] = env[name];
}
await import('../tests/setup.js'); // Replaces all production DB credentials before app imports.
const { config } = await import('../src/config.js');
const { pool } = await import('../src/common/db.js');
const { applyMigrations } = await import('../src/migrations/migrate.js');
const db = new PGlite();
const sql = async (text, params) => text.includes('pg_advisory_xact_lock') ? { rows: [] }
  : params ? db.query(text, params) : (await db.exec(text)).at(-1);
await applyMigrations({ query: sql });
pool.connect = async () => ({ query: sql, release() {} });
pool.query = sql;
const nativeFetch = globalThis.fetch;
const createdUsers = [];
const attemptedEmails = [];
const manifest = new URL('../.tools/seller-registration-live-users.json', import.meta.url);
fs.mkdirSync(new URL('../.tools/', import.meta.url), { recursive: true });
globalThis.fetch = async (url, options) => {
  const response = await nativeFetch(url, options);
  if (String(url) === `${config.supabaseUrl}/auth/v1/admin/users` && options?.method === 'POST' && response.ok) {
    const user = await response.clone().json();
    if (user.id) {
      createdUsers.push(user.id);
      fs.writeFileSync(manifest, JSON.stringify({ ids: createdUsers, emails: attemptedEmails }));
    }
  }
  return response;
};
const { default: app } = await import('../src/app.js');
const password = `T${crypto.randomUUID()}!`;
const origin = 'http://localhost:5173';
const actors = [];
let success = false;
try {
  for (let i = 0; i < 2; i++) {
    const email = `seller-check-${crypto.randomUUID()}@example.com`;
    attemptedEmails.push(email);
    fs.writeFileSync(manifest, JSON.stringify({ ids: createdUsers, emails: attemptedEmails }));
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await request(app).post('/api/v1/auth/register-seller').set('Origin', origin)
        .send({ code: config.sellerRegistrationCode, email, password, fullName: 'Temporary seller check' });
      // Same random test email on every attempt; never create a second identity after a timeout.
      if (response.body.code !== 'SELLER_REGISTRATION_UNKNOWN') break;
    }
    assert.equal(response.status, 201, `Registration failed: ${response.body.code || response.status}`);
    const login = await nativeFetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: frontend.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000),
    });
    assert.equal(login.status, 200, 'Temporary seller login failed');
    const session = await login.json();
    assert.equal(session.user.app_metadata.seller_shop_id, config.shopId);
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${session.access_token}`);
    assert.equal(me.status, 200); assert.equal(me.body.role, 'SELLER');
    actors.push({ profile: me.body, token: session.access_token });
  }
  const categories = await request(app).get('/api/v1/categories');
  const item = await request(app).post('/api/v1/seller/products').set('Authorization', `Bearer ${actors[0].token}`)
    .send({ name: 'Shared live Auth check', categoryId: categories.body[0].id, price: 10000 });
  assert.equal(item.status, 200);
  for (const [index, actor] of actors.entries()) {
    const adjustment = await request(app).post(`/api/v1/seller/products/${item.body.id}/stock-adjustments`)
      .set('Authorization', `Bearer ${actor.token}`).set('Idempotency-Key', crypto.randomUUID())
      .send({ expectedVersion: index, deltaOnHand: 3, reason: 'Temporary shared inventory check' });
    assert.equal(adjustment.status, 200);
    assert.equal(adjustment.body.stockOnHand, (index + 1) * 3);
    const list = await request(app).get('/api/v1/seller/products').set('Authorization', `Bearer ${actor.token}`);
    assert.equal(list.status, 200); assert.equal(list.body.content[0].id, item.body.id);
  }
  success = true;
} finally {
  globalThis.fetch = nativeFetch;
  const failures = [];
  // A timed-out POST may have committed without returning its user ID.
  let reconciled = false;
  for (let attempt = 0; attempt < 3 && !reconciled; attempt++) {
    try {
      const response = await nativeFetch(`${config.supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: { apikey: config.supabaseStorageKey, Authorization: `Bearer ${config.supabaseStorageKey}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) continue;
      const { users } = await response.json();
      for (const user of users) {
        if (attemptedEmails.includes(user.email) && user.user_metadata?.full_name === 'Temporary seller check'
          && !createdUsers.includes(user.id)) createdUsers.push(user.id);
      }
      reconciled = true;
    } catch { /* Retry read-only reconciliation before deleting only these test users. */ }
  }
  fs.writeFileSync(manifest, JSON.stringify({ ids: createdUsers, emails: attemptedEmails }));
  for (const id of createdUsers) {
    let deleted = false;
    for (let attempt = 0; attempt < 3 && !deleted; attempt++) {
      try {
        const response = await nativeFetch(`${config.supabaseUrl}/auth/v1/admin/users/${id}`, {
          method: 'DELETE', headers: { apikey: config.supabaseStorageKey, Authorization: `Bearer ${config.supabaseStorageKey}` },
          signal: AbortSignal.timeout(20000),
        });
        deleted = response.ok || response.status === 404;
      } catch { /* Retry transient network failure; continue cleaning other users. */ }
    }
    if (!deleted) failures.push(id);
  }
  await db.close(); await pool.end();
  if (failures.length || !reconciled) fs.writeFileSync(manifest, JSON.stringify({ ids: failures, emails: attemptedEmails }));
  else if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
  assert.equal(failures.length, 0, 'Temporary Auth user cleanup failed');
  assert.equal(reconciled, true, 'Could not reconcile a possibly interrupted Auth create');
  console.log(`Temporary Auth users cleaned up: ${createdUsers.length}. Production shop database untouched.`);
}
assert.equal(success, true);
console.log('PASS: real registration, password login, signed JWT, two SELLER profiles and shared inventory edits.');
