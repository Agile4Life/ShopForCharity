import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { SellerRegistration, provisionSeller, isRegisteredSeller } from '../src/identity/seller-registration.js';
import { ProfileService } from '../src/identity/profile-service.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { pool } from '../src/common/db.js';
import { config } from '../src/config.js';
import app from '../src/app.js';
import { CatalogService } from '../src/catalog/catalog-service.js';
import { InventoryService } from '../src/inventory/inventory-service.js';

const settings = { sellerRegistrationCode: 'test-invitation', supabaseUrl: 'https://auth.example.test', supabaseStorageKey: 'test-secret', shopId: config.shopId };
const input = { code: 'test-invitation', email: ' Seller@Example.com ', password: 'test-password', fullName: 'Seller Test' };
const authUser = () => ({ id: randomUUID(), email: 'seller@example.com', app_metadata: { seller_shop_id: settings.shopId }, user_metadata: { full_name: input.fullName } });

test('invalid code, missing config and invalid input never call Auth or provision', async () => {
  const service = new SellerRegistration({ settings, fetcher: () => assert.fail('Auth must not run'), provision: () => assert.fail('DB must not run') });
  for (const code of ['', 'wrong', 'x'.repeat(201), null]) await assert.rejects(service.register({ ...input, code }), { code: 'INVALID_SELLER_CODE' });
  for (const change of [{ email: 'invalid' }, { password: 'short' }, { password: 'x'.repeat(129) }, { fullName: 'x' }])
    await assert.rejects(service.register({ ...input, ...change }), { code: 'SELLER_REGISTRATION_INPUT' });
  service.settings = { ...settings, sellerRegistrationCode: '' };
  await assert.rejects(service.register(input), { code: 'SELLER_REGISTRATION_UNAVAILABLE' });
});

test('registration normalizes input, writes only server privileges and waits for DB before success', async () => {
  const user = authUser();
  const service = new SellerRegistration({ settings,
    fetcher: async (url, options) => {
      assert.equal(url, `${settings.supabaseUrl}/auth/v1/admin/users`);
      const body = JSON.parse(options.body);
      assert.equal(body.email, user.email);
      assert.equal(body.email_confirm, true);
      assert.deepEqual(body.app_metadata, user.app_metadata);
      assert.equal(body.user_metadata.role, undefined);
      assert.equal(body.code, undefined);
      return Response.json(user);
    }, provision: async value => assert.deepEqual(value, user) });
  assert.deepEqual(await service.register({ ...input, role: 'ADMIN', app_metadata: { seller_shop_id: 'other-shop' } }), { success: true });
});

test('existing email never upgrades an account; provider errors are sanitized', async () => {
  for (const [status, code, expected] of [[422, 'email_exists', 'SELLER_EMAIL_EXISTS'], [422, 'user_already_exists', 'SELLER_EMAIL_EXISTS'], [400, 'weak_password', 'weak_password'], [429, 'rate_limit', 'RATE_LIMITED'], [500, 'internal', 'SELLER_REGISTRATION_UNAVAILABLE']]) {
    const service = new SellerRegistration({ settings, fetcher: async () => Response.json({ code, message: 'SQL secret internal stack' }, { status }), provision: () => assert.fail('Never modify existing users') });
    await assert.rejects(service.register(input), error => error.code === expected && !error.message.includes('SQL'));
  }
});

test('unknown Auth outcome and incomplete DB provisioning have distinct recovery messages', async () => {
  const unknown = new SellerRegistration({ settings, fetcher: async () => { throw new Error('private token'); } });
  await assert.rejects(unknown.register(input), { code: 'SELLER_REGISTRATION_UNKNOWN' });
  for (const user of [{}, { ...authUser(), app_metadata: {} }, { ...authUser(), email: 'wrong@example.com' }]) {
    const service = new SellerRegistration({ settings, fetcher: async () => Response.json(user), provision: () => assert.fail('Invalid response') });
    await assert.rejects(service.register(input), { code: 'SELLER_REGISTRATION_UNKNOWN' });
  }
  const pending = new SellerRegistration({ settings, fetcher: async () => Response.json(authUser()), provision: async () => { throw new Error('DB unavailable'); } });
  await assert.rejects(pending.register(input), { code: 'SELLER_PROFILE_PENDING' });
});

test('PostgreSQL: independent sellers share management access; forged customer metadata cannot grant it', async t => {
  const db = new PGlite();
  const sql = async (text, params) => text.includes('pg_advisory_xact_lock') ? { rows: [] }
    : params ? db.query(text, params) : (await db.exec(text)).at(-1);
  await applyMigrations({ query: sql });
  t.mock.method(pool, 'connect', async () => ({ query: sql, release() {} }));
  t.mock.method(pool, 'query', sql);
  const profiles = new ProfileService();
  try {
    const first = authUser();
    const second = { ...authUser(), email: 'second@example.com' };
    const service = new SellerRegistration({ settings, fetcher: async () => Response.json(first) });
    await service.register(input);
    // Simulate a second user whose Auth request succeeded while DB provisioning failed.
    const firstActor = await profiles.actor({ sub: first.id, ...first });
    const secondActor = await profiles.actor({ sub: second.id, ...second });
    assert.equal((await profiles.get(secondActor)).fullName, input.fullName);
    assert.notEqual(firstActor.id, secondActor.id);
    profiles.seller(firstActor); profiles.seller(secondActor);
    const catalog = new CatalogService();
    const categoryId = (await catalog.categories())[0].id;
    const item = await catalog.saveProduct(firstActor, null, { name: 'Shared test inventory', price: 10000, categoryId });
    const inventory = new InventoryService();
    await inventory.adjust(firstActor, item.id, randomUUID(), { expectedVersion: 0, deltaOnHand: 4, reason: 'First seller' });
    await inventory.adjust(secondActor, item.id, randomUUID(), { expectedVersion: 1, deltaOnHand: 3, reason: 'Second seller' });
    const shared = await catalog.list(false, true, '', '', 'newest', 0, 20, secondActor);
    assert.equal(shared.content[0].stockOnHand, 7);
    assert.equal(shared.content[0].id, item.id);
    await assert.rejects(inventory.adjust(firstActor, item.id, randomUUID(), { expectedVersion: 1, deltaOnHand: 1 }), { code: 'VERSION_CONFLICT' });
    await provisionSeller(first); // Retry does not create another profile or override an existing one.
    assert.equal((await sql("SELECT count(*)::int AS count FROM shop.profiles WHERE role = 'SELLER'")).rows[0].count, 2);
    const forged = { sub: randomUUID(), email: 'customer@example.com', user_metadata: { role: 'SELLER', seller_shop_id: settings.shopId } };
    assert.equal(isRegisteredSeller(forged), false);
    assert.equal(isRegisteredSeller({ app_metadata: { seller_shop_id: 'other-shop' } }), false);
    const customer = await profiles.actor(forged);
    assert.throws(() => profiles.seller(customer), { code: 'SELLER_REQUIRED' });
    await assert.rejects(provisionSeller({ ...first, id: forged.sub }), { code: 'SELLER_PROFILE_CONFLICT' });
    await sql('UPDATE shop.profiles SET active = false WHERE auth_user_id = $1', [first.id]);
    await assert.rejects(profiles.actor({ sub: first.id, ...first }), { code: 'ACCOUNT_DISABLED' });
    assert.equal((await profiles.actor({ sub: forged.sub, ...forged, app_metadata: first.app_metadata })).type, 'CUSTOMER');

    // Public endpoint always checks Origin, even when sent an arbitrary Bearer header.
    for (const path of ['/api/v1/auth/register-seller', '/api/v1/auth/register-seller/', '/API/V1/AUTH/REGISTER-SELLER']) {
      const rejected = await request(app).post(path).set('Origin', 'https://untrusted.example').set('Authorization', 'Bearer anything').send(input);
      assert.equal(rejected.status, 403);
      assert.equal(rejected.body.code, 'CSRF_ORIGIN_REJECTED');
    }
    config.sellerRegistrationCode = settings.sellerRegistrationCode;
    config.supabaseUrl = settings.supabaseUrl;
    config.supabaseStorageKey = settings.supabaseStorageKey;
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post('/api/v1/auth/register-seller').set('Origin', 'http://localhost:5173').send({ ...input, code: 'invalid' });
      assert.equal(response.status, 403); assert.equal(response.body.code, 'INVALID_SELLER_CODE');
    }
    for (const path of ['/api/v1/auth/register-seller', '/api/v1/auth/register-seller/', '/API/V1/AUTH/REGISTER-SELLER']) {
      const limited = await request(app).post(path).set('Origin', 'http://localhost:5173').send(input);
      assert.equal(limited.status, 429); assert.equal(limited.headers['retry-after'], '60');
    }
  } finally { await db.close(); }
});
