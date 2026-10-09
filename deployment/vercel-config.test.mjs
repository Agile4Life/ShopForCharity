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
  assert.equal(config.installCommand, 'npm --prefix frontend ci');
  const spa = new RegExp(`^${config.rewrites[1].source}$`);
  for (const path of ['/checkout', '/guest-order', '/seller/orders/123', '/']) {
    assert.ok(spa.test(path), path);
  }
  for (const path of ['/api', '/api/v1/orders', '/assets/app.js', '/assets']) {
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
