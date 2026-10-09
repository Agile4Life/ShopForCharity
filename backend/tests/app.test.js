import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

test('GET /actuator/health returns UP', async () => {
  const res = await request(app).get('/actuator/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'UP');
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('GET /actuator/health/liveness returns UP', async () => {
  const res = await request(app).get('/actuator/health/liveness');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'UP');
});

test('404 handler returns structured JSON with requestId', async () => {
  const res = await request(app).get('/api/v1/non-existent-resource');
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.ok(res.body.requestId);
  assert.ok(res.body.timestamp);
  assert.equal(res.headers['x-request-id'], res.body.requestId);
});

test('CSRF protection blocks cookie mutating requests with invalid origin', async () => {
  const res = await request(app)
    .post('/api/v1/orders')
    .set('Cookie', 'shop_checkout_token=test-token')
    .set('Origin', 'https://malicious-site.com');

  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'CSRF_ORIGIN_REJECTED');
});
