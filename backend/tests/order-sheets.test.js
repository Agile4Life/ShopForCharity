import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8 } from 'jose';
import {
  ORDER_SHEET_HEADERS,
  TOTAL_ROW_LABEL,
  formatOrderSheetRow,
  buildTotalRow,
  OrderSheetsService,
} from '../src/infrastructure/order-sheets-service.js';

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

    if (options.method === 'POST' && url.endsWith(':batchUpdate')) {
      const payload = JSON.parse(options.body);
      const insertReq = payload.requests?.[0]?.insertDimension;
      if (insertReq) {
        insertDimensionCalls++;
        const count = insertReq.range.endIndex - insertReq.range.startIndex;
        for (let i = 0; i < count; i++) {
          sheetData.splice(insertReq.range.startIndex, 0, []);
        }
      }
      return { ok: true, status: 200, async json() { return {}; } };
    }

    if (options.method === 'PUT' && url.includes('/values/')) {
      const payload = JSON.parse(options.body);
      if (url.includes('A1%3AJ3')) {
        sheetData.splice(0, sheetData.length, ...payload.values);
      } else {
        const match = decodeURIComponent(url).match(/A(\d+):J(\d+)/);
        const startRowIndex = Number(match[1]) - 1;
        for (let i = 0; i < payload.values.length; i++) {
          sheetData[startRowIndex + i] = payload.values[i];
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

  const mockDbQuery = async (sql) => {
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
  assert.deepEqual(sheetData[2], [TOTAL_ROW_LABEL, '', '', 1, 0, 35000, '', '', '', '']);

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
  assert.deepEqual(sheetData[3], [TOTAL_ROW_LABEL, '', '', 1, 2, 75000, '', '', '', '']);

  // 4. Seller confirms payment on first order (PAID) -> Updates row 2 in-place, keeps TỔNG CỘNG at row 4
  currentOrder = {
    ...firstOrder,
    payment_status: 'PAID',
    received_amount: 35000,
  };
  currentItems = [{ name_snapshot: 'Hoa Kẽm Nhung', quantity: 1, unit_price: 35000, line_total: 35000 }];
  assert.equal(await service.syncOrder(currentOrder.id), true);
  assert.equal(sheetData.length, 4);
  assert.equal(sheetData[1][7], 'Đã thanh toán');
  assert.deepEqual(sheetData[3], [TOTAL_ROW_LABEL, '', '', 1, 2, 75000, '', '', '', '']);
});
