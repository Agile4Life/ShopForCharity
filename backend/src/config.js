import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseConfig } from './database-config.js';
import { allowedOrigins } from './identity/allowed-origins.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config();
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  db: databaseConfig(process.env),
  cronSecret: process.env.CRON_SECRET || '',
  shopId: process.env.APP_SHOP_ID || '00000000-0000-0000-0000-000000000001',
  jwt: {
    issuer: process.env.JWT_ISSUER_URI,
    jwksUri: process.env.JWT_JWK_SET_URI,
    audience: process.env.JWT_EXPECTED_AUDIENCE || 'authenticated',
  },
  corsOrigins: allowedOrigins(process.env),
  cookieSecure: process.env.VERCEL === '1' || process.env.COOKIE_SECURE === 'true',
  encryptionKey: process.env.IDEMPOTENCY_ENCRYPTION_KEY,
  signingKey: process.env.GUEST_SESSION_SIGNING_KEY,
  pendingTtlHours: parseInt(process.env.PENDING_ORDER_TTL_HOURS || '24', 10),
  guestTtlDays: parseInt(process.env.GUEST_TOKEN_TTL_DAYS || '90', 10),
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseStorageKey: process.env.SUPABASE_BACKEND_SECRET_KEY || '',
  productBucket: process.env.PUBLIC_PRODUCT_BUCKET || 'product-images',
  paymentBucket: process.env.PRIVATE_PAYMENT_BUCKET || 'payment-qr',
  migrationsEnabled: process.env.MIGRATIONS_ENABLED === 'true',
  expiryIntervalMs: parseInt(process.env.EXPIRY_INTERVAL_MS || '60000', 10),
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '3600000', 10),
};
