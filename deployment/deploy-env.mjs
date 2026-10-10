import { randomBytes } from 'node:crypto';
import { databaseConfig } from '../backend/src/database-config.js';
import { createVercelConfig } from './vercel-config.mjs';

const runtimeKeys = [
  'SUPABASE_URL', 'SUPABASE_BACKEND_SECRET_KEY', 'JWT_ISSUER_URI', 'JWT_JWK_SET_URI',
  'JWT_EXPECTED_AUDIENCE', 'APP_SHOP_ID', 'IDEMPOTENCY_ENCRYPTION_KEY', 'GUEST_SESSION_SIGNING_KEY',
  'PENDING_ORDER_TTL_HOURS', 'GUEST_TOKEN_TTL_DAYS', 'PUBLIC_PRODUCT_BUCKET', 'PRIVATE_PAYMENT_BUCKET',
  'DB_SSL_CA', 'DB_POOL_MAX', 'SELLER_REGISTRATION_CODE',
];

export function createDeployEnv(backend, frontend, previous = {}, origin = 'https://goiamchoem.vercel.app') {
  const env = Object.fromEntries(runtimeKeys.filter(key => backend[key]).map(key => [key, backend[key]]));
  const db = databaseConfig(backend);
  if (!db.connectionString) throw new Error('Configure a runtime PostgreSQL URL before preparing Vercel environment.');
  const database = new URL(db.connectionString);
  if (['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) throw new Error('Vercel requires a remote database.');
  if (database.hostname.endsWith('.pooler.supabase.com') && database.port === '5432') database.port = '6543';
  database.searchParams.set('sslmode', 'verify-full');
  const website = new URL(origin);
  if (website.protocol !== 'https:' || website.origin !== origin || website.username || website.password) throw new Error('Website origin must be HTTPS without a path.');
  Object.assign(env, {
    DATABASE_URL: database.toString(), SERVERLESS_BACKEND: 'true', NODE_ENV: 'production',
    COOKIE_SECURE: 'true', MIGRATIONS_ENABLED: 'false', DB_POOL_MAX: backend.DB_POOL_MAX || '3',
    CRON_SECRET: previous.CRON_SECRET || backend.CRON_SECRET || randomBytes(32).toString('base64url'),
    CORS_ALLOWED_ORIGINS: website.origin,
    VITE_API_BASE_URL: '/api/v1', VITE_SUPABASE_URL: frontend.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: frontend.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  for (const key of ['SUPABASE_BACKEND_SECRET_KEY', 'JWT_ISSUER_URI', 'JWT_JWK_SET_URI']) {
    if (!env[key]) throw new Error(`Missing ${key}.`);
  }
  const keys = ['IDEMPOTENCY_ENCRYPTION_KEY', 'GUEST_SESSION_SIGNING_KEY'].map(key => {
    if (!env[key] || Buffer.from(env[key], 'base64').length !== 32) throw new Error(`Set ${key} to a base64 32-byte key.`);
    return Buffer.from(env[key], 'base64');
  });
  if (keys[0].equals(keys[1])) throw new Error('Signing and encryption keys must be different.');
  if (env.SUPABASE_URL?.replace(/\/$/, '') !== env.VITE_SUPABASE_URL?.replace(/\/$/, '')) throw new Error('Frontend and backend must use the same Supabase project.');
  createVercelConfig(env);
  return env;
}
