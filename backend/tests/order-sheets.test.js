import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8 } from 'jose';
import {
  ORDER_SHEET_HEADERS,
  formatOrderSheetRow,
  OrderSheetsService,
} from '../src/infrastructure/order-sheets-service.js';

test('formatOrderSheetRow formats confirmed order data into 6 requested columns', () => {
  const row = formatOrderSheetRow(
    {
      order_code: 'ORD-1A2B3C4D',
      buyer_name: 'Nguyễn Văn A',
      buyer_phone: '0912345678',
      total: 45000,
      payment_method: 'BANK_TRANSFER',
      payment_status: 'PAID',
      status: 'ACCEPTED',
    },
    [
      { name_snapshot: 'Combo Gói Ấm', quantity: 2 },
      { name_snapshot: 'Bánh quy bơ', quantity: 1 },
    ]
  );

  assert.deepEqual(ORDER_SHEET_HEADERS, [
    'Khách hàng',
    'Số điện thoại',
    'Sản phẩm & Số lượng',
    'Tổng tiền thanh toán',
    'Phương thức thanh toán',
    'Trạng thái thanh toán',
  ]);
  assert.deepEqual(row, [
    'Nguyễn Văn A',
    '0912345678',
    'Combo Gói Ấm × 2, Bánh quy bơ × 1',
    45000,
    'Chuyển khoản QR',
    'Đã thanh toán',
  ]);
});

test('OrderSheetsService initializes header + appends on ACCEPTED and updates row in-place on PAID or CANCELLED', async () => {
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

    if (url.includes('?fields=sheets.properties.title')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { sheets: [{ properties: { title: 'Trang tính1' } }] };
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

    if (options.method === 'PUT' && url.includes('/values/')) {
      const payload = JSON.parse(options.body);
      if (url.includes('A1%3AF2')) {
        sheetData.splice(0, sheetData.length, ...payload.values);
      } else {
        const match = decodeURIComponent(url).match(/A(\d+):F(\d+)/);
        const rowIndex = Number(match[1]) - 1;
        sheetData[rowIndex] = payload.values[0];
      }
      return { ok: true, status: 200, async json() { return {}; } };
    }

    if (options.method === 'POST' && url.includes(':append')) {
      const payload = JSON.parse(options.body);
      sheetData.push(...payload.values);
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
    total: 30000,
    received_amount: 0,
    payment_method: 'BANK_TRANSFER',
    payment_status: 'UNPAID',
    status: 'PENDING_CONTACT',
    confirmed_at: null,
    was_accepted: false,
  };

  const mockDbQuery = async (sql) => {
    if (sql.includes('FROM shop.orders')) {
      return { rows: [currentOrder] };
    }
    if (sql.includes('FROM shop.order_items')) {
      return {
        rows: [{ name_snapshot: 'Trà đào cam sả', quantity: 2, unit_price: 15000, line_total: 30000 }],
      };
    }
    return { rows: [] };
  };

  const service = new OrderSheetsService(settings, mockFetcher, mockDbQuery);

  // 1. Unconfirmed order (PENDING_CONTACT) is not pushed to Google Sheet
  assert.equal(await service.syncOrder(currentOrder.id), false);
  assert.equal(sheetData.length, 0);

  // 2. Seller accepts order (ACCEPTED) -> Initializes headers + writes row 2
  currentOrder = {
    ...currentOrder,
    status: 'ACCEPTED',
    confirmed_at: '2026-10-16T03:00:00Z',
    was_accepted: true,
  };
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(sheetData.length, 2);
  assert.deepEqual(sheetData[0], ORDER_SHEET_HEADERS);
  assert.deepEqual(sheetData[1], [
    'Trần Thị B',
    '0987654321',
    'Trà đào cam sả × 2',
    30000,
    'Chuyển khoản QR',
    'Chưa thanh toán',
  ]);

  // 3. Seller confirms payment (PAID) -> Updates row 2 in-place
  currentOrder = {
    ...currentOrder,
    payment_status: 'PAID',
    received_amount: 30000,
  };
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(sheetData.length, 2);
  assert.equal(sheetData[1][5], 'Đã thanh toán');

  // 4. Order is later cancelled (CANCELLED) -> Updates row 2 in-place
  currentOrder = {
    ...currentOrder,
    status: 'CANCELLED',
    payment_status: 'REFUND_PENDING',
  };
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(sheetData.length, 2);
  assert.equal(sheetData[1][5], 'Chờ hoàn tiền');
});
