import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8 } from 'jose';
import {
  ORDER_SHEET_HEADERS,
  TOTAL_ROW_LABEL,
  formatOrderSheetRow,
  buildTotalRow,
  buildTotalFormulas,
  OrderSheetsService,
} from '../src/infrastructure/order-sheets-service.js';

function formulaTotalRow() {
  return [TOTAL_ROW_LABEL, '', '', ...buildTotalFormulas(), '', '', '', ''];
}

test('formatOrderSheetRow and buildTotalRow format confirmed order data and sums accurately', () => {
  const row = formatOrderSheetRow(
    {
      order_code: 'ORD-1A2B3C4D',
      buyer_name: 'Nguyễn Văn A',
      buyer_phone: '0912345678',
      pickup_name: 'Cổng trường THPT',
      pickup_instructions: 'Gặp bạn trực bàn số 2',
      total: 55000,
      payment_method: 'BANK_TRANSFER',
      payment_status: 'PAID',
      status: 'ACCEPTED',
      referrer: 'Nguyễn Thị C',
      note: 'Ít đường, giao giờ ra chơi',
    },
    [
      { name_snapshot: 'Hoa Kẽm Nhung', quantity: 1 },
      { name_snapshot: 'Bánh tráng chấm', quantity: 2 },
    ]
  );

  assert.deepEqual(ORDER_SHEET_HEADERS, [
    'Khách hàng',
    'Số điện thoại',
    'Địa chỉ nhận hàng',
    'Hoa Kẽm Nhung',
    'Bánh tráng chấm',
    'Tổng tiền thanh toán',
    'Phương thức thanh toán',
    'Trạng thái thanh toán',
    'Người giới thiệu',
    'Ghi chú',
  ]);
  assert.deepEqual(row, [
    'Nguyễn Văn A',
    '0912345678',
    'Cổng trường THPT (Gặp bạn trực bàn số 2)',
    1,
    2,
    55000,
    'Chuyển khoản QR',
    'Đã thanh toán',
    'Nguyễn Thị C',
    'Ít đường, giao giờ ra chơi',
  ]);

  assert.deepEqual(buildTotalRow([row, row]), [
    TOTAL_ROW_LABEL,
    '',
    '',
    2,
    4,
    110000,
    '',
    '',
    '',
    '',
  ]);
});

test('OrderSheetsService keeps TỔNG CỘNG at the bottom and inserts new orders strictly above TỔNG CỘNG', async () => {
  const { privateKey } = await generateKeyPair('RS256');
  const pkcs8Pem = await exportPKCS8(privateKey);

  const settings = {
    shopId: '00000000-0000-0000-0000-000000000001',
    sheets: {
      spreadsheetId: 'test-spreadsheet-id',
      tabName: '',
      clientEmail: 'shop-sync@goiamtraoem.iam.gserviceaccount.com',
      privateKey: pkcs8Pem,
    },
  };

  const sheetData = [];
  const exportMetadata = [];
  const exportReceipts = new Map();
  let metadataReadFails = false;
  let insertDimensionCalls = 0;

  const mockFetcher = async (url, options = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        async json() {
          return { access_token: 'mock-google-token', expires_in: 3600 };
        },
      };
    }

    if (url.includes('?fields=sheets.properties')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { sheets: [{ properties: { sheetId: 0, title: 'Trang tính1' } }] };
        },
      };
    }

    if (options.method === 'GET' && url.includes('/values/')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { values: sheetData.map((r) => [...r]) };
        },
      };
    }

    if (options.method === 'POST' && url.endsWith('/developerMetadata:search')) {
      if (metadataReadFails) return { ok: false, status: 503 };
      return { ok: true, async json() {
        return { matchedDeveloperMetadata: exportMetadata.map((entry) => ({
          developerMetadata: structuredClone(entry),
        })) };
      } };
    }

    if (options.method === 'POST' && url.endsWith(':batchUpdate')) {
      const payload = JSON.parse(options.body);
      for (const request of payload.requests) {
        assert.equal(request.createDeveloperMetadata, undefined, 'Never write Google metadata');
        const insertReq = request.insertDimension;
        if (insertReq) {
          insertDimensionCalls++;
          assert.equal(insertReq.range.dimension, 'ROWS', 'Never add columns');
          const count = insertReq.range.endIndex - insertReq.range.startIndex;
          for (const entry of exportMetadata) {
            const range = entry.location.dimensionRange;
            if (range.startIndex >= insertReq.range.startIndex) {
              range.startIndex += count;
              range.endIndex += count;
            }
          }
          sheetData.splice(insertReq.range.startIndex, 0, ...Array.from({ length: count }, () => []));
        } else {
          const { start, rows, fields } = request.updateCells;
          assert.equal(fields, 'userEnteredValue', 'Preserve formatting');
          for (const [offset, row] of rows.entries()) {
            assert.ok(start.columnIndex + row.values.length <= 10, 'Keep ten columns');
            sheetData[start.rowIndex + offset] ||= [];
            row.values.forEach(({ userEnteredValue: value }, column) => {
              sheetData[start.rowIndex + offset][start.columnIndex + column] =
                value.formulaValue ?? value.numberValue ?? value.stringValue;
            });
          }
        }
      }
      return { ok: true, status: 200, async json() { return {}; } };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  let currentOrder = {
    id: '11111111-1111-1111-1111-111111111111',
    shop_id: settings.shopId,
    order_code: 'ORD-SYNC0001',
    buyer_name: 'Trần Thị B',
    buyer_phone: '0987654321',
    pickup_name: 'Sảnh nhà B',
    pickup_instructions: 'Tầng 1',
    total: 35000,
    received_amount: 0,
    payment_method: 'BANK_TRANSFER',
    payment_status: 'UNPAID',
    status: 'PENDING_CONTACT',
    referrer: 'Lê Văn D',
    note: 'Gọi trước 5 phút',
    confirmed_at: null,
    was_accepted: false,
  };

  let currentItems = [{ name_snapshot: 'Hoa Kẽm Nhung', quantity: 1, unit_price: 35000, line_total: 35000 }];

  const mockDbQuery = async (sql, params) => {
    if (sql.includes('FROM shop.order_sheet_exports')) return { rows: [...exportReceipts.values()] };
    if (sql.includes('INSERT INTO shop.order_sheet_exports')) {
      exportReceipts.set(params[2], { order_id: params[2], row_fingerprint: params[3] });
      return { rows: [] };
    }
    if (sql.includes('FROM shop.orders')) {
      return { rows: [currentOrder] };
    }
    if (sql.includes('FROM shop.order_items')) {
      return { rows: currentItems };
    }
    return { rows: [] };
  };

  const service = new OrderSheetsService(settings, mockFetcher, mockDbQuery);

  // 1. Unconfirmed order (PENDING_CONTACT) is not pushed to Google Sheet
  assert.equal(await service.syncOrder(currentOrder.id), false);
  assert.equal(sheetData.length, 0);

  // 2. Seller accepts first order (ACCEPTED) -> Initializes Header (row 1), Order #1 (row 2), TỔNG CỘNG (row 3)
  currentOrder = {
    ...currentOrder,
    status: 'ACCEPTED',
    confirmed_at: '2026-10-16T03:00:00Z',
    was_accepted: true,
  };
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(sheetData.length, 3);
  assert.deepEqual(sheetData[0], ORDER_SHEET_HEADERS);
  assert.equal(sheetData[1][0], 'Trần Thị B');
  assert.deepEqual(sheetData[2], formulaTotalRow());

  // 3. Seller accepts second order -> Inserts row 3 ABOVE TỔNG CỘNG, pushes TỔNG CỘNG to row 4 and updates sums
  const firstOrder = currentOrder;
  currentOrder = {
    ...currentOrder,
    id: '22222222-2222-2222-2222-222222222222',
    order_code: 'ORD-SYNC0002',
    buyer_name: 'Phạm Văn E',
    buyer_phone: '0901112233',
    total: 40000,
    payment_method: 'CASH',
    payment_status: 'UNPAID',
  };
  currentItems = [{ name_snapshot: 'Bánh tráng chấm', quantity: 2, unit_price: 20000, line_total: 40000 }];
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(insertDimensionCalls, 1);
  assert.equal(sheetData.length, 4);
  assert.equal(sheetData[1][0], 'Trần Thị B');
  assert.equal(sheetData[2][0], 'Phạm Văn E');
  assert.deepEqual(sheetData[3], formulaTotalRow());

  // 4. Payment changes on the web leave previously exported sheet data untouched.
  currentOrder = {
    ...firstOrder,
    payment_status: 'PAID',
    received_amount: 35000,
  };
  currentItems = [{ name_snapshot: 'Hoa Kẽm Nhung', quantity: 1, unit_price: 35000, line_total: 35000 }];
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(sheetData.length, 4);
  assert.equal(sheetData[1][7], 'Chưa thanh toán');
  assert.deepEqual(sheetData[3], formulaTotalRow());

  // Manual changes to every business column survive payment, cancellation, bulk sync,
  // a fresh service instance and row reordering. IDs distinguish identical orders.
  sheetData[1] = ['Edited name', '0123', '=CONCAT("manual", " address")', 7, 9, 123,
    'Manual method', 'Manual status', '', ''];
  const manualRow = [...sheetData[1]];
  const otherOrder = [...sheetData[2]];
  [sheetData[1], sheetData[2]] = [sheetData[2], sheetData[1]];
  for (const entry of exportMetadata) {
    const range = entry.location.dimensionRange;
    if (range.startIndex === 1 || range.startIndex === 2) {
      range.startIndex = 3 - range.startIndex;
      range.endIndex = range.startIndex + 1;
    }
  }
  const restarted = new OrderSheetsService(settings, mockFetcher, mockDbQuery);
  currentOrder = { ...currentOrder, status: 'CANCELLED' };
  assert.equal(await restarted.syncOrder(currentOrder.id), true);
  assert.deepEqual(sheetData[2], manualRow);
  assert.deepEqual(sheetData[1], otherOrder);
  currentOrder = { ...currentOrder, status: 'ACCEPTED' };
  sheetData[3] = [TOTAL_ROW_LABEL, '', '', 1, 2, 75000, '', '', 'Keep summary referrer', 'Keep summary note'];
  const beforeBulk = structuredClone(sheetData);
  const bulkResult = await restarted.syncAllConfirmedOrders();
  assert.equal(bulkResult.synced, 1);
  assert.deepEqual(sheetData.slice(0, 3), beforeBulk.slice(0, 3));
  assert.deepEqual(sheetData[3].slice(3, 6), buildTotalFormulas());
  assert.deepEqual(sheetData[3].slice(6), beforeBulk[3].slice(6));
  // Restore optional summary annotations for the later checks.
  sheetData[3][8] = '';
  sheetData[3][9] = '';

  // A new order with identical original data is still exported once.
  currentOrder = { ...firstOrder, id: '33333333-3333-3333-3333-333333333333' };
  await Promise.all([restarted.syncOrder(currentOrder.id), restarted.syncOrder(currentOrder.id)]);
  assert.equal(sheetData.length, 5);
  assert.equal(exportReceipts.has(currentOrder.id), true);
  assert.deepEqual(sheetData[2], manualRow);
  assert.deepEqual(sheetData[4], formulaTotalRow());

  // Legacy exports gain only an identity; their manually edited notes stay intact.
  exportReceipts.delete(currentOrder.id);
  sheetData[3] = formatOrderSheetRow(currentOrder, currentItems);
  sheetData[3][9] = 'Legacy manual note';
  const legacyRow = [...sheetData[3]];
  assert.equal(await restarted.syncOrder(currentOrder.id), true);
  assert.deepEqual(sheetData[3].slice(0, 10), legacyRow);
  assert.equal(exportReceipts.has(currentOrder.id), true);

  // Without a total row, adding an order never rewrites the previous last row.
  sheetData.pop();
  currentOrder = { ...firstOrder, id: '44444444-4444-4444-4444-444444444444' };
  const existing = structuredClone(sheetData);
  assert.equal(await restarted.syncOrder(currentOrder.id), true);
  assert.deepEqual(sheetData.slice(0, existing.length), existing);
  assert.equal(sheetData.at(-1)[0], TOTAL_ROW_LABEL);

  // A failed identity lookup must not trigger a duplicate export or any cell write.
  metadataReadFails = true;
  currentOrder = { ...firstOrder, id: '55555555-5555-5555-5555-555555555555' };
  const beforeFailure = structuredClone(sheetData);
  await assert.rejects(restarted.syncOrder(currentOrder.id), /METADATA_READ_HTTP_503/);
  assert.deepEqual(sheetData, beforeFailure);
  metadataReadFails = false;
  assert.equal(await restarted.syncOrder(currentOrder.id), true);
  assert.ok(sheetData.every((row) => row.length === 10));

  // Users can add orders directly to the sheet without an ID or extra columns.
  const handEnteredOrder = ['Walk-in buyer', '0987000000', 'Manual pickup', 3, 4, 95000,
    'Cash', 'Manual payment', 'Manual referrer', 'Keep this note'];
  const manualIndex = sheetData.length - 1;
  sheetData.splice(manualIndex, 0, [...handEnteredOrder]);
  currentOrder = { ...firstOrder, id: '66666666-6666-6666-6666-666666666666' };
  assert.equal(await restarted.syncOrder(currentOrder.id), true);
  assert.deepEqual(sheetData[manualIndex], handEnteredOrder);
  assert.deepEqual(sheetData.at(-1), formulaTotalRow());
  assert.ok(!exportMetadata.some((entry) =>
    entry.location.dimensionRange.startIndex === manualIndex));
  const beforeManualBulk = structuredClone(sheetData);
  assert.equal((await restarted.syncAllConfirmedOrders()).synced, 1);
  assert.deepEqual(sheetData, beforeManualBulk);

  // Even a manual row below the summary must survive a bulk sync and a new export.
  sheetData.push(handEnteredOrder.map((value, index) => index === 0 ? 'Another buyer' : value));
  const beforeTrailingBulk = structuredClone(sheetData);
  await restarted.syncAllConfirmedOrders();
  assert.deepEqual(sheetData, beforeTrailingBulk);
  currentOrder = { ...firstOrder, id: '77777777-7777-7777-7777-777777777777' };
  assert.equal(await restarted.syncOrder(currentOrder.id), true);
  assert.deepEqual(sheetData.at(-1), beforeTrailingBulk.at(-1));
  assert.equal(sheetData.filter((row) => row[0] === TOTAL_ROW_LABEL).length, 1);
  assert.deepEqual(sheetData.at(-2), formulaTotalRow());

});

test('exports literal buyer data and live totals in one batch; failed writes leave no receipt', async () => {
  const writes = [];
  let fail = true;
  let receipts = 0;
  const order = { id: 'test-order', buyer_name: '=1+1', buyer_phone: '0012345678',
    status: 'ACCEPTED', total: 35000 };
  const service = new OrderSheetsService({ shopId: 'shop', sheets: {
    spreadsheetId: 'sheet', clientEmail: 'test', privateKey: 'test',
  } }, async (url, options) => {
    if (url.endsWith('/developerMetadata:search')) {
      return { ok: true, json: async () => ({}) };
    }
    if (options.method === 'GET') {
      assert.ok(url.endsWith('valueRenderOption=UNFORMATTED_VALUE'));
      return { ok: true, json: async () => ({ values: [] }) };
    }
    assert.ok(url.endsWith(':batchUpdate'));
    writes.push(JSON.parse(options.body).requests);
    return { ok: !fail, status: fail ? 503 : 200 };
  }, async (sql) => {
    if (sql.includes('INSERT INTO shop.order_sheet_exports')) { receipts++; return { rows: [] }; }
    if (sql.includes('FROM shop.orders')) return { rows: [order] };
    return { rows: [] };
  });
  service.getAccessToken = async () => 'token';
  service.getSheetMeta = async () => ({ title: 'Orders', sheetId: 7 });
  await assert.rejects(service.syncOrder(order.id), /GOOGLE_SHEETS_WRITE_HTTP_503/);
  assert.equal(receipts, 0);
  fail = false;
  assert.equal(await service.syncOrder(order.id), true);
  assert.equal(receipts, 1);
  const [data, total] = writes.at(-1).map((request) => request.updateCells);
  assert.equal(writes.at(-1).length, 2);
  assert.deepEqual(data.rows[1].values[0].userEnteredValue, { stringValue: '=1+1' });
  assert.deepEqual(data.rows[1].values[1].userEnteredValue, { stringValue: '0012345678' });
  assert.deepEqual(data.rows[1].values[5].userEnteredValue, { numberValue: 35000 });
  assert.deepEqual(total.start, { sheetId: 7, rowIndex: 2, columnIndex: 3 });
  assert.equal(total.rows[0].values.length, 3);
  for (const [index, cell] of total.rows[0].values.entries()) {
    const formula = cell.userEnteredValue.formulaValue;
    const column = ['D', 'E', 'F'][index];
    // The ranges above and below exclude the summary itself and remain dynamic
    // when manual orders are inserted or the summary is the final sheet row.
    assert.ok(formula.includes(`INDIRECT("${column}"&1&":${column}"&(ROW()-1))`));
    assert.ok(formula.includes(`INDIRECT("${column}"&(ROW()+1)&":${column}"&ROWS(A:A))`));
    assert.ok(formula.includes('IF(ROW()<ROWS(A:A),'));
    assert.ok(formula.includes('"<>Đã hủy đơn"'));
    assert.ok(formula.includes(`"<>${TOTAL_ROW_LABEL}"`));
  }
});
