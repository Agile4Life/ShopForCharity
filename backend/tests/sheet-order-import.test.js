import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../src/common/db.js';
import { withTx } from '../src/common/db.js';
import { InventoryService } from '../src/inventory/inventory-service.js';
import { config } from '../src/config.js';
import { applyMigrations } from '../src/migrations/migrate.js';
import { errorHandler } from '../src/common/error-handler.js';
import { requestFilter } from '../src/identity/request-filter.js';
import { OrderSheetsService, ORDER_METADATA_KEY } from '../src/infrastructure/order-sheets-service.js';
import { SheetOrderImportService, parseSheetOrder } from '../src/infrastructure/sheet-order-import.js';
import { createSheetSyncRouter } from '../src/infrastructure/sheet-sync-controller.js';

const validRow = () => ['Khách Sheet', '0912345678', 'Địa chỉ tự nhập', 2, '', 70000,
  'Tiền mặt', 'Chưa thanh toán', '', 'Gọi trước khi giao'];

test('Sheet row rules: referrer optional, other business cells required, at least one product', () => {
  assert.equal(parseSheetOrder(validRow()).referrer, null);
  const secondProductOnly = validRow(); secondProductOnly[3] = ''; secondProductOnly[4] = 1;
  assert.deepEqual(parseSheetOrder(secondProductOnly).quantities, [0, 1]);
  for (const column of [0, 1, 2, 5, 6, 7, 9]) {
    const row = validRow(); row[column] = '  ';
    assert.throws(() => parseSheetOrder(row), { code: 'SHEET_ROW_INCOMPLETE' });
  }
  for (const value of [-1, 0.5, 'abc', Infinity]) {
    const row = validRow(); row[3] = value;
    assert.throws(() => parseSheetOrder(row), { code: 'SHEET_INVALID_QUANTITY' });
  }
  const noItems = validRow(); noItems[3] = 0;
  assert.throws(() => parseSheetOrder(noItems), { code: 'SHEET_ITEMS_REQUIRED' });
  const badPayment = validRow(); badPayment[7] = 'Anything';
  assert.throws(() => parseSheetOrder(badPayment), { code: 'SHEET_INVALID_PAYMENT' });
  assert.equal(parseSheetOrder(['TỔNG CỘNG', '', '', 100]), null);
  assert.equal(parseSheetOrder([]), null);
});

test('Sheet webhook reads authoritative rows and atomically creates/updates real orders, stock and payment', async t => {
  const db = new PGlite();
  const originalConnect = pool.connect, originalQuery = pool.query;
  const sql = async (text, params) => {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    const result = params ? await db.query(text, params) : (await db.exec(text)).at(-1);
    return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
  };
  pool.connect = async () => ({ query: sql, release() {} });
  pool.query = sql;
  const settings = { shopId: config.shopId, sheets: {
    spreadsheetId: 'test-sheet', clientEmail: 'service@example.com', privateKey: 'test', webhookSecret: 'test-secret-'.repeat(4),
  } };
  const id = randomUUID(), hoa = randomUUID(), banh = randomUUID();
  const rows = new Map([[id, validRow()]]);
  const markers = new Map([[id, 1]]);
  const sheets = new OrderSheetsService(settings, async (url, options) => {
    if (url.endsWith('/developerMetadata:search')) {
      assert.equal(JSON.parse(options.body).dataFilters[0].developerMetadataLookup.metadataKey, ORDER_METADATA_KEY);
      return { ok: true, async json() { return { matchedDeveloperMetadata: [...markers].map(([orderId, index]) => ({
        developerMetadata: { metadataId: index + 100, metadataValue: orderId, location: { dimensionRange: { sheetId: 7, startIndex: index, endIndex: index + 1 } } },
      })) }; } };
    }
    assert.ok(url.endsWith('/values:batchGetByDataFilter'), `Unexpected Sheet call ${url}`);
    const filters = JSON.parse(options.body).dataFilters;
    return { ok: true, async json() { return { valueRanges: filters.flatMap((filter) => {
      const key = [...markers].find(([, index]) => index + 100 === filter.developerMetadataLookup.metadataId)?.[0];
      return rows.has(key) ? [{ dataFilters: [filter], valueRange: { values: [[...rows.get(key)]] } }] : [];
    }) }; } };
  });
  sheets.getAccessToken = async () => 'test-token';
  sheets.getSheetMeta = async () => ({ sheetId: 7, title: 'Đơn hàng' });
  const importer = new SheetOrderImportService(settings);
  const app = express();
  app.use(express.json(), requestFilter, createSheetSyncRouter(sheets, importer, settings), errorHandler);
  const post = (body = { spreadsheetId: 'test-sheet', orderIds: [id] }) => request(app)
    .post('/integrations/sheets/sync').set('Authorization', `Bearer ${settings.sheets.webhookSecret}`).send(body);
  const order = async () => (await db.query('SELECT * FROM shop.orders WHERE id=$1', [id])).rows[0];
  const inventory = async (product = hoa) => (await db.query('SELECT * FROM shop.product_inventory WHERE id=$1', [product])).rows[0];
  try {
    await applyMigrations({ query: sql });
    for (const [productId, name, price] of [[hoa, 'Hoa Kẽm Nhung', 35000], [banh, 'Bánh tráng chấm', 20000]]) {
      await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,created_at,updated_at)
        VALUES($1,$2,'00000000-0000-0000-0000-000000000011',$5,$3,$4,'ACTIVE',now(),now())`, [productId, config.shopId, name, price, productId]);
      await db.query('INSERT INTO shop.product_inventory(id,stock_on_hand,stock_reserved,created_at,updated_at) VALUES($1,100,0,now(),now())', [productId]);
    }
    await t.test('rejects unknown secrets, disabled config, wrong sheets and invalid IDs before reads', async () => {
      await request(app).post('/integrations/sheets/sync').set('Authorization', 'Bearer wrong').send({}).expect(401);
      await request(app).post('/integrations/sheets/sync').set('Origin', 'http://localhost:5173').send({}).expect(401);
      await post({ spreadsheetId: 'other-sheet', orderIds: [id] }).expect(400);
      await post({ spreadsheetId: 'test-sheet', orderIds: ['bad-id'] }).expect(400);
      await post({ spreadsheetId: 'test-sheet', orderIds: Array(26).fill(id) }).expect(400);
      const oldSecret = settings.sheets.webhookSecret; settings.sheets.webhookSecret = '';
      try {
        await request(app).post('/integrations/sheets/sync').set('Authorization', 'Bearer test').send({}).expect(503);
      } finally { settings.sheets.webhookSecret = oldSecret; }
      assert.equal(await order(), undefined);
    });
    await t.test('ignores unlinked/deleted rows; incomplete rows do not create partial orders', async () => {
      const unknown = randomUUID();
      const missing = await post({ spreadsheetId: 'test-sheet', orderIds: [unknown] }).expect(200);
      assert.equal(missing.body.results[0].code, 'SHEET_ROW_NOT_FOUND');
      rows.get(id)[9] = '';
      const response = await post().expect(200);
      assert.equal(response.body.results[0].code, 'SHEET_ROW_INCOMPLETE');
      assert.equal(await order(), undefined);
      assert.equal((await inventory()).stock_reserved, 0);
      rows.set(id, validRow());
    });
    await t.test('creates one accepted order without a referrer and deduplicates webhook deliveries', async () => {
      const created = await post({ spreadsheetId: 'test-sheet', orderIds: [id, id], values: ['forged payload'] }).expect(200);
      assert.equal(created.body.results.length, 1);
      assert.equal(created.body.results[0].status, 'created');
      const saved = await order();
      assert.equal(saved.buyer_name, validRow()[0]);
      assert.equal(saved.buyer_phone, '0912345678');
      assert.equal(saved.status, 'ACCEPTED');
      assert.equal(saved.referrer, null);
      assert.equal((await inventory()).stock_reserved, 2);
      assert.equal((await post().expect(200)).body.results[0].status, 'unchanged');
      assert.equal((await order()).version, saved.version);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.orders')).rows[0].count, 1);
    });
    await t.test('updates buyer, address, freeform optional referrer and payment without replacing the order', async () => {
      const changed = rows.get(id);
      changed[0] = 'Đã sửa'; changed[2] = 'Địa chỉ mới'; changed[8] = 'Người ngoài danh sách';
      changed[7] = 'Đã thanh toán'; changed[5] = 60000;
      const result = await post().expect(200);
      assert.equal(result.body.results[0].status, 'updated');
      const saved = await order();
      assert.equal(saved.pickup_name, 'Địa chỉ mới');
      assert.equal(saved.referrer, 'Người ngoài danh sách');
      assert.equal(saved.received_amount, '60000');
      assert.equal(saved.total, '60000');
      assert.equal(saved.payment_status, 'PAID');
      assert.equal((await inventory()).stock_reserved, 2);
      assert.equal((await db.query("SELECT count(*)::int AS count FROM shop.payment_events WHERE to_status='PAID'")).rows[0].count, 1);
      rows.get(id)[8] = '';
      await post().expect(200);
      assert.equal((await order()).referrer, null);
    });
    await t.test('changing products releases old reservations and permits quantities above checkout limit', async () => {
      rows.get(id)[3] = ''; rows.get(id)[4] = 21;
      assert.equal((await post().expect(200)).body.results[0].status, 'updated');
      assert.equal((await inventory()).stock_reserved, 0);
      assert.equal((await inventory(banh)).stock_reserved, 21);
      const items = (await db.query('SELECT * FROM shop.order_items WHERE order_id=$1', [id])).rows;
      assert.equal(items.reduce((sum, item) => sum + item.quantity, 0), 21);
      assert.equal(items.reduce((sum, item) => sum + Number(item.line_total), 0), 60000);
    });
    await t.test('insufficient stock and incomplete edits leave all previous state intact', async () => {
      const before = await order();
      rows.get(id)[4] = 101;
      assert.equal((await post().expect(200)).body.results[0].code, 'INSUFFICIENT_STOCK');
      assert.deepEqual(await order(), before);
      assert.equal((await inventory(banh)).stock_reserved, 21);
      rows.get(id)[4] = 21; rows.get(id)[9] = '';
      assert.equal((await post().expect(200)).body.results[0].code, 'SHEET_ROW_INCOMPLETE');
      assert.deepEqual(await order(), before);
      rows.get(id)[9] = 'Đã sửa ghi chú';
    });
    await t.test('completed orders adjust consumed stock once and reject unpaid completion', async () => {
      await withTx((client) => new InventoryService().settle(client, id, true, null));
      await db.query("UPDATE shop.orders SET status='COMPLETED' WHERE id=$1", [id]);
      rows.get(id)[4] = 22;
      assert.equal((await post().expect(200)).body.results[0].status, 'updated');
      assert.equal((await inventory(banh)).stock_on_hand, 78);
      assert.equal((await inventory(banh)).stock_reserved, 0);
      assert.equal((await post().expect(200)).body.results[0].status, 'unchanged');
      assert.equal((await inventory(banh)).stock_on_hand, 78);
      rows.get(id)[7] = 'Chưa thanh toán';
      assert.equal((await post().expect(200)).body.results[0].code, 'SHEET_COMPLETED_PAYMENT');
      assert.equal((await order()).payment_status, 'PAID');
      rows.get(id)[7] = 'Đã thanh toán';
    });
    await t.test('row location changes preserve identity and cancellation releases reservations', async () => {
      markers.set(id, 8);
      rows.get(id)[7] = 'Đã hủy đơn';
      const response = await post().expect(200);
      assert.equal(response.body.results[0].status, 'updated');
      assert.equal(response.body.results[0].rowNumber, 9);
      assert.equal((await order()).status, 'CANCELLED');
      assert.equal((await inventory(banh)).stock_reserved, 0);
      assert.equal((await inventory(banh)).stock_on_hand, 100);
      assert.equal((await post().expect(200)).body.results[0].status, 'unchanged');
    });
    await t.test('a copied identity cannot change another shop order', async () => {
      const otherShop = randomUUID();
      await db.query("INSERT INTO shop.shops(id,name,accepting_orders,created_at,updated_at) VALUES($1,'Other',true,now(),now())", [otherShop]);
      await db.query('UPDATE shop.orders SET shop_id=$2 WHERE id=$1', [id, otherShop]);
      rows.get(id)[0] = 'Do not apply';
      assert.equal((await post().expect(200)).body.results[0].code, 'SHEET_ORDER_CONFLICT');
      assert.notEqual((await order()).buyer_name, 'Do not apply');
    });
  } finally {
    pool.connect = originalConnect; pool.query = originalQuery;
    await db.close();
  }
});
