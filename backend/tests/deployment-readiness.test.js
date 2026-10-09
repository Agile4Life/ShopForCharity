import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import app from '../api/index.js';
import { config } from '../src/config.js';
import { pool } from '../src/common/db.js';
import { getOrderService } from '../src/order/order-service.js';
import { getAssetService } from '../src/infrastructure/asset-service.js';
import { ImageProcessor } from '../src/infrastructure/image-processor.js';
import { MAX_IMAGE_BYTES } from '../src/infrastructure/upload-limits.js';
import { databaseConfig } from '../src/database-config.js';
import express from 'express';
import { upload } from '../src/infrastructure/asset-controller.js';
import { errorHandler } from '../src/common/error-handler.js';

test('cron rejects missing/wrong credentials and executes authenticated GET only', async () => {
  const previous = config.cronSecret;
  config.cronSecret = 'test-cron-secret';
  const orders = getOrderService();
  const assets = getAssetService();
  const originalExpire = orders.expire;
  const originalCleanup = assets.cleanup;
  let calls = 0;
  orders.expire = assets.cleanup = async () => { calls++; };
  try {
    for (const path of ['/api/v1/cron/expire', '/api/v1/cron/cleanup']) {
      assert.equal((await request(app).get(path)).status, 401);
      assert.equal((await request(app).get(path).set('Authorization', 'Bearer invalid')).status, 401);
      assert.equal(calls, path.endsWith('expire') ? 0 : 1);
      assert.equal((await request(app).get(path).set('Authorization', 'Bearer test-cron-secret')).status, 200);
      assert.equal((await request(app).post(path).set('Authorization', 'Bearer test-cron-secret')).status, 404);
      assert.equal((await request(app).head(path).set('Authorization', 'Bearer test-cron-secret')).status, 405);
    }
    assert.equal(calls, 2);
    config.cronSecret = '';
    assert.equal((await request(app).get('/api/v1/cron/expire')).status, 503);
  } finally {
    config.cronSecret = previous;
    orders.expire = originalExpire;
    assets.cleanup = originalCleanup;
  }
});

test('readiness never exposes database exception details', async () => {
  const previous = pool.connect;
  pool.connect = async () => { throw new Error('private-database-detail'); };
  try {
    const res = await request(app).get('/actuator/health/readiness');
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { status: 'DOWN' });
  } finally { pool.connect = previous; }
});

test('TLS config preserves explicit CA instead of URL SSL overrides', () => {
  const db = databaseConfig({ DATABASE_URL: 'postgres://u:p@db.example/db?sslmode=require', DB_SSL_CA: 'test\\nCA' });
  assert.equal(db.ssl.rejectUnauthorized, true);
  assert.equal(db.ssl.ca, 'test\nCA');
  assert.equal(new URL(db.connectionString).searchParams.has('sslmode'), false);
  assert.equal(databaseConfig({ DATABASE_URL: 'postgres://localhost/test' }).ssl, false);
  assert.throws(() => databaseConfig({}, true), /separate migration credentials/);
  const migration = databaseConfig({ DATABASE_URL: 'postgres://runtime:pw@localhost/db', MIGRATION_DB_URL: 'jdbc:postgresql://localhost/test', MIGRATION_DB_USERNAME: 'owner' }, true);
  assert.equal(new URL(migration.connectionString).username, 'owner');
  const supabase = databaseConfig({ DATABASE_URL: 'postgres://u:p@db.fixture.supabase.co/db?sslmode=require' });
  assert.ok(supabase.ssl.ca.includes('BEGIN CERTIFICATE'));
  assert.equal(supabase.ssl.rejectUnauthorized, true);
});

test('image processor decodes native sharp output and enforces Vercel upload size', async () => {
  const processor = new ImageProcessor();
  await assert.rejects(processor.process(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png'), err => err.status === 413);
  const input = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const result = await processor.process(input, 'image/png');
  assert.equal((await sharp(result.image).metadata()).width, 20);
  assert.equal((await sharp(result.thumbnail).metadata()).height, 10);
  await assert.rejects(processor.process(input, 'image/jpeg'), err => err.code === 'INVALID_IMAGE');
});

test('multipart upload accepts an image and rejects files beyond 4 MiB', async () => {
  const receiver = express();
  receiver.post('/upload', upload.single('file'), (req, res) => res.json({ bytes: req.file.buffer.length }));
  receiver.use(errorHandler);
  const good = await request(receiver).post('/upload').attach('file', Buffer.alloc(16), 'test.png');
  assert.equal(good.status, 200);
  const oversized = await request(receiver).post('/upload').attach('file', Buffer.alloc(MAX_IMAGE_BYTES + 1), 'large.png');
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.code, 'FILE_TOO_LARGE');
});
