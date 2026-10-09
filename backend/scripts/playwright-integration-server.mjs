// Runs production controllers/services/SQL against a disposable PostgreSQL WASM DB.
// The private runtime DATABASE_URL is deliberately replaced before app imports.
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';

const backendEnv = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const frontendEnv = dotenv.parse(fs.readFileSync(new URL('../../frontend/.env.local', import.meta.url)));
const email = process.env.E2E_SELLER_EMAIL;
const password = process.env.E2E_SELLER_PASSWORD;
if (!email || !password) throw new Error('Set E2E_SELLER_EMAIL and E2E_SELLER_PASSWORD.');
if (!process.env.E2E_HARNESS_KEY || process.env.E2E_HARNESS_KEY.length < 16) throw new Error('Set a random E2E_HARNESS_KEY of at least 16 characters.');
for (const key of ['SUPABASE_URL', 'SUPABASE_BACKEND_SECRET_KEY', 'JWT_ISSUER_URI', 'JWT_JWK_SET_URI', 'JWT_EXPECTED_AUDIENCE', 'PUBLIC_PRODUCT_BUCKET', 'PRIVATE_PAYMENT_BUCKET']) {
  if (backendEnv[key]) process.env[key] = backendEnv[key];
}
await import('../tests/setup.js');
process.env.CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.APP_SHOP_ID = '00000000-0000-0000-0000-000000000001';

const login = await fetch(`${backendEnv.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: frontendEnv.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000),
});
if (!login.ok) throw new Error(`Supabase login failed: HTTP ${login.status}`);
const { user } = await login.json();
const db = new PGlite();
async function sql(text, params) {
  // Advisory locks aren't supported by the single-connection WASM engine.
  if (text.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
  const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
  return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
}
const { applyMigrations } = await import('../src/migrations/migrate.js');
await applyMigrations({ query: sql });
await sql("INSERT INTO shop.profiles(id,auth_user_id,email,full_name,role,active,version,created_at,updated_at) VALUES($1,$2,$3,$4,'SELLER',true,0,NOW(),NOW())", [crypto.randomUUID(), user.id, email, 'Seller Playwright']);

// Serialize connections and transactions just as the embedded DB requires.
let tail = Promise.resolve();
async function acquire() {
  const previous = tail;
  let release;
  tail = new Promise(resolve => { release = resolve; });
  await previous;
  return release;
}
const { pool } = await import('../src/common/db.js');
pool.connect = async () => {
  const release = await acquire();
  return { query: sql, release };
};
pool.query = async (...args) => {
  const release = await acquire();
  try { return await sql(...args); } finally { release(); }
};

const { getStorage } = await import('../src/infrastructure/storage.js');
const storage = getStorage();
const uploaded = [];
const originalUpload = storage.upload.bind(storage);
storage.upload = async (bucket, objectPath, ...args) => {
  await originalUpload(bucket, objectPath, ...args);
  uploaded.push({ bucket, objectPath });
};
async function cleanStorage() {
  for (const bucket of new Set(uploaded.map(item => item.bucket))) {
    const paths = uploaded.filter(item => item.bucket === bucket).map(item => item.objectPath);
    await storage.call('DELETE', `object/${bucket}`, JSON.stringify({ prefixes: paths }), 'application/json');
  }
  const count = uploaded.length;
  uploaded.length = 0;
  return count;
}
const { default: app } = await import('../src/app.js');
const harness = express();
// Test-only diagnostics. No secrets or guest access credentials are returned.
harness.use('/__e2e', (req, res, next) => {
  if (req.headers['x-e2e-key'] !== process.env.E2E_HARNESS_KEY) return res.sendStatus(403);
  next();
});
harness.get('/__e2e/state', async (_req, res, next) => {
  try {
    const products = await pool.query('SELECT p.id,p.name,p.price,p.status,i.stock_on_hand,i.stock_reserved FROM shop.products p JOIN shop.product_inventory i ON i.id=p.id ORDER BY p.created_at');
    const orders = await pool.query('SELECT id,order_code,status,payment_method,payment_status,total,received_amount FROM shop.orders ORDER BY created_at');
    const events = await pool.query('SELECT order_id,type,amount FROM shop.payment_events ORDER BY created_at');
    const audit = await pool.query('SELECT action,entity_type,entity_id FROM shop.audit_logs ORDER BY created_at');
    res.json({ products: products.rows, orders: orders.rows, paymentEvents: events.rows, audit: audit.rows });
  } catch (error) { next(error); }
});
harness.post('/__e2e/cleanup', async (_req, res, next) => {
  try { res.json({ deletedStorageObjects: await cleanStorage() }); } catch (error) { next(error); }
});
harness.use(app);
const server = harness.listen(8080, '127.0.0.1', () => console.log('E2E backend ready: isolated PGlite DB, real Supabase Auth and Storage.'));
async function shutdown() {
  await cleanStorage();
  server.close();
  await db.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
