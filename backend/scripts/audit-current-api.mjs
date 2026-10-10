import fs from 'node:fs';
import request from 'supertest';
import app from '../src/app.js';
import { config } from '../src/config.js';
import { pool } from '../src/common/db.js';

// Runs the current backend against its configured Supabase database, with no business mutations.
const report = { checkedAt: new Date().toISOString(), public: [], seller: [], deployment: [] };
const remoteOrigin = process.env.AUDIT_API_ORIGIN;
if (remoteOrigin && !/^https:\/\/[^/]+$/.test(remoteOrigin)) throw new Error('AUDIT_API_ORIGIN must be an HTTPS origin.');
report.apiOrigin = remoteOrigin || 'local-current-backend';
async function check(path, token) {
  if (remoteOrigin) {
    const response = await fetch(`${remoteOrigin}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    return { result: { path, status: response.status, ...(response.ok ? {} : { code:body.code }) }, body };
  }
  let call = request(app).get(path);
  if (token) call = call.set('Authorization', `Bearer ${token}`);
  const response = await call;
  const result = { path, status: response.status };
  if (response.status !== 200) result.code = response.body.code;
  return { result, body: response.body };
}
try {
  let products;
  for (const path of ['/actuator/health/readiness','/api/v1/health','/api/v1/shop','/api/v1/categories','/api/v1/products','/api/v1/combos']) {
    const { result, body } = await check(path);
    report.public.push(result);
    if (path.endsWith('/products')) products = body.content || [];
  }
  for (const product of products || []) {
    report.public.push((await check(`/api/v1/products/${product.id}`)).result);
    if (product.imageUrl) {
      const response = await fetch(product.imageUrl, { signal: AbortSignal.timeout(15000) });
      report.public.push({ path: 'public-product-image', status: response.status, type: response.headers.get('content-type') });
      await response.body?.cancel();
    }
  }
  if (process.env.E2E_SELLER_EMAIL && process.env.E2E_SELLER_PASSWORD) {
    const login = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.supabaseStorageKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.E2E_SELLER_EMAIL, password: process.env.E2E_SELLER_PASSWORD }),
      signal: AbortSignal.timeout(15000),
    });
    report.authStatus = login.status;
    if (login.ok) {
      const { access_token: token } = await login.json();
      for (const path of ['/api/v1/me','/api/v1/seller/shop-settings','/api/v1/seller/pickup-points',
        '/api/v1/seller/products','/api/v1/seller/combos','/api/v1/seller/orders',
        '/api/v1/seller/dashboard','/api/v1/seller/notifications','/api/v1/seller/audit-logs']) {
        const { result, body } = await check(path, token);
        if (path === '/api/v1/me') result.role = body.role;
        report.seller.push(result);
      }
    }
  }
  for (const path of ['/','/api/v1/health','/api/v1/shop']) {
    const response = await fetch(`https://goiamchoem.vercel.app${path}`, { signal: AbortSignal.timeout(15000) });
    report.deployment.push({ path, status: response.status });
    await response.body?.cancel();
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if ([...report.public,...report.seller].some(result => result.status !== 200)) process.exitCode = 1;
} catch (error) {
  console.error('API audit failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
