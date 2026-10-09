import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelConfig } from './vercel-config.mjs';

const authEnv = {
  VITE_SUPABASE_URL: 'https://dev-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture',
};

test('proxy preserves /api/v1 and precedes SPA fallback', () => {
  const config = createVercelConfig({ ...authEnv, BACKEND_ORIGIN: 'https://api.example.com/' });
  assert.deepEqual(config.rewrites[0], {
    source: '/api/:path*', destination: 'https://api.example.com/api/:path*',
  });
  assert.equal(config.outputDirectory, 'frontend/dist');
  assert.equal(config.installCommand, 'npm --prefix frontend ci --include=dev --workspaces=false && npm --prefix backend ci --omit=dev --workspaces=false');
  assert.deepEqual(config.rewrites[1], { source: '/actuator/:path*', destination: 'https://api.example.com/actuator/:path*' });
  const spa = new RegExp(`^${config.rewrites[2].source}$`);
  for (const path of ['/checkout', '/guest-order', '/seller/orders/123', '/']) {
    assert.ok(spa.test(path), path);
  }
  for (const path of ['/api', '/api/v1/orders', '/assets/app.js', '/assets', '/actuator/health/readiness']) {
    assert.equal(spa.test(path), false, path);
  }
  assert.ok(config.headers[0].headers.every(header => header.value.includes('no-store')));
});

test('misconfigured backend fails before deploying a broken proxy', () => {
  for (const origin of [undefined, 'http://api.example.com', 'https://user:pass@api.example.com',
    'https://api.example.com/api/v1', 'https://api.example.com?token=secret',
    'https://api.example.com#fragment', 'https://localhost', 'https://127.0.0.1']) {
    assert.throws(() => createVercelConfig({ BACKEND_ORIGIN: origin }));
  }
});

test('direct cross-site browser API routing is rejected for guest-cookie mode', () => {
  assert.throws(() => createVercelConfig({
    BACKEND_ORIGIN: 'https://api.example.com', VITE_API_BASE_URL: 'https://api.example.com/api/v1',
  }));
  assert.doesNotThrow(() => createVercelConfig({
    ...authEnv, BACKEND_ORIGIN: 'https://api.example.com', VITE_API_BASE_URL: '/api/v1',
  }));
});

test('missing Auth config and backend secrets cannot enter the FE deployment', () => {
  const backend = { BACKEND_ORIGIN: 'https://api.example.com' };
  assert.throws(() => createVercelConfig(backend));
  for (const key of [undefined, 'sb-dummy-key', 'sb_secret_do_not_expose',
    `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`]) {
    assert.throws(() => createVercelConfig({ ...backend, ...authEnv, VITE_SUPABASE_PUBLISHABLE_KEY: key }));
  }
  const anon = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
  assert.doesNotThrow(() => createVercelConfig({ ...backend, ...authEnv, VITE_SUPABASE_PUBLISHABLE_KEY: anon }));
});

test('serverless backend config routes /api to /api/index.js without requiring BACKEND_ORIGIN', () => {
  const config = createVercelConfig({
    ...authEnv,
    SERVERLESS_BACKEND: 'true',
  });
  assert.equal(config.rewrites[0].destination, '/api/index.js');
  assert.equal(config.rewrites[1].destination, '/api/index.js');
  assert.deepEqual(config.crons, [
    { path: '/api/v1/cron/expire', schedule: '0 0 * * *' },
    { path: '/api/v1/cron/cleanup', schedule: '0 1 * * *' },
  ]);
});

test('frequent cron schedule is opt-in for eligible plans', () => {
  const config = createVercelConfig({ ...authEnv, SERVERLESS_BACKEND: 'true', VERCEL_CRON_FREQUENT: 'true' });
  assert.equal(config.crons[0].schedule, '* * * * *');
  assert.equal(config.crons[1].schedule, '0 * * * *');
});

test('monorepo uses Node backend by default; flags cannot silently select a broken proxy', () => {
  const config = createVercelConfig(authEnv);
  assert.equal(config.rewrites[0].destination, '/api/index.js');
  assert.equal(config.functions['api/index.js'].includeFiles, 'backend/certs/**');
  assert.throws(() => createVercelConfig({ ...authEnv, SERVERLESS_BACKEND: 'false' }), /BACKEND_ORIGIN/);
  assert.throws(() => createVercelConfig({ ...authEnv, SERVERLESS_BACKEND: 'ture' }), /true or false/);
});
