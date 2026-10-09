import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeployEnv } from './deploy-env.mjs';
import { allowedOrigins } from '../backend/src/identity/allowed-origins.js';

const backend = {
  DB_JDBC_URL: 'jdbc:postgresql://aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  DB_USERNAME: 'shop_runtime.project', DB_PASSWORD: 'password with @:/# symbols',
  MIGRATION_DB_PASSWORD: 'owner-secret-excluded',
  SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_BACKEND_SECRET_KEY: 'backend-secret',
  JWT_ISSUER_URI: 'https://fixture.supabase.co/auth/v1',
  JWT_JWK_SET_URI: 'https://fixture.supabase.co/auth/v1/.well-known/jwks.json',
  IDEMPOTENCY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  GUEST_SESSION_SIGNING_KEY: Buffer.alloc(32, 2).toString('base64'),
};
const frontend = { VITE_SUPABASE_URL: backend.SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', VITE_SECRET: 'excluded' };

test('deployment export uses runtime credentials, transaction pooler and HTTPS defaults', () => {
  const env = createDeployEnv(backend, frontend);
  const db = new URL(env.DATABASE_URL);
  assert.equal(db.port, '6543');
  assert.equal(decodeURIComponent(db.password), backend.DB_PASSWORD);
  assert.equal(db.searchParams.get('sslmode'), 'verify-full');
  assert.equal(env.CORS_ALLOWED_ORIGINS, 'https://maiamchoem.vercel.app');
  assert.equal(env.MIGRATIONS_ENABLED, 'false');
  assert.equal(env.COOKIE_SECURE, 'true');
  assert.equal(env.VITE_API_BASE_URL, '/api/v1');
  assert.ok(!Object.keys(env).some(key => key.startsWith('MIGRATION_')));
  assert.equal(env.VITE_SECRET, undefined);
  assert.ok(env.CRON_SECRET.length >= 32);
  assert.equal(createDeployEnv(backend, frontend, env).CRON_SECRET, env.CRON_SECRET);
});

test('deployment preparation rejects mismatched Auth, invalid keys and unsafe origins', () => {
  assert.throws(() => createDeployEnv(backend, { ...frontend, VITE_SUPABASE_URL: 'https://other.supabase.co' }), /same Supabase/);
  assert.throws(() => createDeployEnv({ ...backend, GUEST_SESSION_SIGNING_KEY: backend.IDEMPOTENCY_ENCRYPTION_KEY }, frontend), /different/);
  assert.throws(() => createDeployEnv({ ...backend, SUPABASE_BACKEND_SECRET_KEY: '' }, frontend), /Missing/);
  assert.throws(() => createDeployEnv(backend, frontend, {}, 'http://maiamchoem.vercel.app'), /HTTPS/);
  assert.throws(() => createDeployEnv(backend, frontend, {}, 'https://maiamchoem.vercel.app/path'), /HTTPS/);
});

test('CORS allows exact Vercel deployment origins without enabling wildcard or localhost', () => {
  const origins = allowedOrigins({ VERCEL: '1', CORS_ALLOWED_ORIGINS: 'https://maiamchoem.vercel.app', VERCEL_URL: 'maiamchoem-preview-team.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'maiamchoem.vercel.app' });
  assert.deepEqual(origins, ['https://maiamchoem.vercel.app', 'https://maiamchoem-preview-team.vercel.app']);
  assert.equal(origins.includes('http://localhost:5173'), false);
  assert.deepEqual(allowedOrigins({ VERCEL_URL: 'ignored.vercel.app' }), ['http://localhost:5173']);
  assert.throws(() => allowedOrigins({ VERCEL: '1', VERCEL_URL: 'valid.vercel.app@evil.example' }), /Invalid/);
});
