import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '../src/migrations/migrate.js';
import { OrderSheetsService } from '../src/infrastructure/order-sheets-service.js';

test('durable export receipts preserve manual edits, distinguish identical orders and cascade with order deletion', async () => {
  const db = new PGlite();
  try {
    await applyMigrations({ query: (sql, params) => sql.includes('pg_advisory_xact_lock')
      ? Promise.resolve({ rows: [] }) : params ? db.query(sql, params) : db.exec(sql).then((results) => results.at(-1)) });
    const shopId = '00000000-0000-0000-0000-000000000001';
    const first = randomUUID(), second = randomUUID(), product = randomUUID();
    await db.query(`INSERT INTO shop.products(id,shop_id,category_id,slug,name,price,status,created_at,updated_at)
      VALUES($1,$2,'00000000-0000-0000-0000-000000000011','receipt-test','Hoa',100,'ACTIVE',now(),now())`, [product, shopId]);
    for (const [index, orderId] of [first, second].entries()) {
      await db.query(`INSERT INTO shop.orders(id,shop_id,order_code,buyer_name,buyer_phone,buyer_email,pickup_name,
        payment_method,payment_status,status,subtotal,total,received_amount,reservation_expires_at,created_at,updated_at)
        VALUES($1,$2,$3,'Buyer','0901234567','','Address','CASH','UNPAID','ACCEPTED',100,100,0,now(),now(),now())`,
      [orderId, shopId, `ORD-RECEIPT${index}`]);
      await db.query(`INSERT INTO shop.order_items(id,order_id,kind,product_id,name_snapshot,unit_price,quantity,line_total,created_at,updated_at)
        VALUES($1,$2,'PRODUCT',$3,'Hoa',100,1,100,now(),now())`, [randomUUID(), orderId, product]);
    }
    const sheet = [];
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      if (url.endsWith('/developerMetadata:search')) return { ok: true, json: async () => ({}) };
      if (options.method === 'GET') return { ok: true, json: async () => ({ values: structuredClone(sheet) }) };
      const body = JSON.parse(options.body);
      if (url.endsWith(':batchUpdate')) {
        assert.ok(body.requests.every((entry) => entry.insertDimension), 'Do not write Google metadata');
        const range = body.requests[0].insertDimension.range;
        sheet.splice(range.startIndex, 0, []);
      } else {
        const start = Number(decodeURIComponent(url).match(/A(\d+):J/)[1]) - 1;
        body.values.forEach((row, index) => { sheet[start + index] = row; });
      }
      return { ok: true };
    };
    const settings = { shopId, sheets: { spreadsheetId: 'test-sheet', clientEmail: 'test', privateKey: 'test' } };
    const service = () => {
      const instance = new OrderSheetsService(settings, fetcher, (sql, params) => db.query(sql, params));
      instance.getAccessToken = async () => 'token';
      instance.getSheetMeta = async () => ({ title: 'Orders', sheetId: 0 });
      return instance;
    };
    assert.equal(await service().syncOrder(first), true);
    assert.equal(await service().syncOrder(second), true);
    assert.equal(sheet.length, 4);
    sheet[1] = ['Manually changed', '', '', 5, '', 900, '', '', '', ''];
    const manual = structuredClone(sheet);
    const previousCalls = calls;
    assert.equal(await service().syncOrder(first), true);
    assert.deepEqual(sheet, manual);
    assert.equal(calls, previousCalls, 'A recorded export needs no Google request');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.order_sheet_exports')).rows[0].count, 2);
    assert.equal((await db.query('SELECT buyer_name FROM shop.orders WHERE id=$1', [first])).rows[0].buyer_name, 'Buyer');
    await db.query('DELETE FROM shop.order_items WHERE order_id=$1', [first]);
    await db.query('DELETE FROM shop.orders WHERE id=$1', [first]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM shop.order_sheet_exports')).rows[0].count, 1);
  } finally { await db.close(); }
});
