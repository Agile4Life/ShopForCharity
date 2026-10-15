import { importPKCS8, SignJWT } from 'jose';
import { config } from '../config.js';
import { query } from '../common/db.js';
import { logger } from '../common/logger.js';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const ORDER_SHEET_HEADERS = [
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
];

export const TOTAL_ROW_LABEL = 'TỔNG CỘNG';

const PAYMENT_STATUS_LABELS = {
  UNPAID: 'Chưa thanh toán',
  REPORTED: 'Chưa thanh toán (Đã báo CK)',
  PAID: 'Đã thanh toán',
  REFUND_PENDING: 'Chờ hoàn tiền',
  REFUNDED: 'Đã hoàn tiền',
};

export function resolvePaymentStatusLabel(order) {
  if (order.status === 'CANCELLED' && order.payment_status === 'UNPAID') {
    return 'Đã hủy đơn';
  }
  return PAYMENT_STATUS_LABELS[order.payment_status] || String(order.payment_status || '');
}

export function formatPickupAddress(order) {
  const name = String(order.pickup_name || '').trim();
  const instructions = String(order.pickup_instructions || '').trim();
  if (name && instructions && instructions !== name) {
    return `${name} (${instructions})`;
  }
  return name || instructions;
}

export function extractProductQuantities(items = []) {
  let hoaKemNhungQty = 0;
  let banhTrangChamQty = 0;

  for (const item of items) {
    const qty = Number(item.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const normalizedName = String(item.name_snapshot || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalizedName.includes('banh trang')) {
      banhTrangChamQty += qty;
    } else {
      hoaKemNhungQty += qty;
    }
  }

  return { hoaKemNhungQty, banhTrangChamQty };
}

export function formatOrderSheetRow(order, items = []) {
  const { hoaKemNhungQty, banhTrangChamQty } = extractProductQuantities(items);

  return [
    String(order.buyer_name || ''),
    String(order.buyer_phone || ''),
    formatPickupAddress(order),
    hoaKemNhungQty,
    banhTrangChamQty,
    Number(order.total || 0),
    order.payment_method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản QR',
    resolvePaymentStatusLabel(order),
    String(order.referrer || ''),
    String(order.note || ''),
  ];
}

function toSafeNumber(val) {
  const num = Number(String(val ?? '0').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

export function isTotalRow(row) {
  if (!Array.isArray(row)) return false;
  const firstCell = String(row[0] || '').trim().toUpperCase();
  return firstCell === TOTAL_ROW_LABEL || firstCell === 'TOTAL' || firstCell === 'TỔNG';
}

export function buildTotalRow(dataRows = []) {
  let totalHoa = 0;
  let totalBanhTrang = 0;
  let totalMoney = 0;

  for (const row of dataRows) {
    if (!Array.isArray(row) || isTotalRow(row)) continue;
    totalHoa += toSafeNumber(row[3]);
    totalBanhTrang += toSafeNumber(row[4]);
    totalMoney += toSafeNumber(row[5]);
  }

  return [
    TOTAL_ROW_LABEL,
    '',
    '',
    totalHoa,
    totalBanhTrang,
    totalMoney,
    '',
    '',
    '',
    '',
  ];
}

function buildRange(tabName, cellRange) {
  if (!tabName) return cellRange;
  const escaped = String(tabName).replace(/'/g, "''");
  return `'${escaped}'!${cellRange}`;
}

function normalizeExistingRow(row = []) {
  return ORDER_SHEET_HEADERS.map((_, idx) => {
    if (idx === 3 || idx === 4 || idx === 5) {
      return toSafeNumber(row[idx]);
    }
    return String(row[idx] ?? '');
  });
}

export class OrderSheetsService {
  constructor(settings = config, fetcher = (...args) => fetch(...args), dbQuery = query) {
    this.settings = settings;
    this.fetcher = fetcher;
    this.dbQuery = dbQuery;
    this.tokenCache = null;
    this.resolvedSheetMeta = null;
    this.privateKeyPromise = null;
    this.cachedKeyPem = null;
    this.orderRowMap = new Map();
  }

  get sheetsConfig() {
    return this.settings.sheets || {};
  }

  isConfigured() {
    const { spreadsheetId, clientEmail, privateKey } = this.sheetsConfig;
    return Boolean(spreadsheetId?.trim() && clientEmail?.trim() && privateKey?.trim());
  }

  async getSigningKey(privateKeyPem) {
    const normalizedPem = privateKeyPem.replace(/\\n/g, '\n');
    if (this.cachedKeyPem !== normalizedPem || !this.privateKeyPromise) {
      this.cachedKeyPem = normalizedPem;
      this.privateKeyPromise = importPKCS8(normalizedPem, 'RS256');
    }
    return this.privateKeyPromise;
  }

  async getAccessToken() {
    const { clientEmail, privateKey } = this.sheetsConfig;
    const nowMs = Date.now();
    if (
      this.tokenCache &&
      this.tokenCache.clientEmail === clientEmail &&
      this.tokenCache.expiresAt > nowMs + 60_000
    ) {
      return this.tokenCache.accessToken;
    }

    const nowSec = Math.floor(nowMs / 1000);
    const signingKey = await this.getSigningKey(privateKey);
    const assertion = await new SignJWT({ scope: SHEETS_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(clientEmail.trim())
      .setAudience(TOKEN_URL)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .sign(signingKey);

    const response = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`GOOGLE_OAUTH_HTTP_${response.status}`);
    }

    const data = await response.json();
    if (!data?.access_token) {
      throw new Error('GOOGLE_OAUTH_INVALID_TOKEN');
    }

    const expiresInSec = Number(data.expires_in) || 3600;
    this.tokenCache = {
      clientEmail,
      accessToken: data.access_token,
      expiresAt: nowMs + expiresInSec * 1000,
    };
    return data.access_token;
  }

  async getSheetMeta(accessToken) {
    if (this.resolvedSheetMeta) return this.resolvedSheetMeta;

    const configuredTab = this.sheetsConfig.tabName?.trim();
    const spreadsheetId = encodeURIComponent(this.sheetsConfig.spreadsheetId.trim());
    const response = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      throw new Error(`GOOGLE_SHEETS_META_HTTP_${response.status}`);
    }

    const meta = await response.json();
    const sheets = meta?.sheets || [];
    const matched = configuredTab
      ? sheets.find((s) => s?.properties?.title === configuredTab)
      : sheets[0];

    const title = matched?.properties?.title || configuredTab;
    const sheetId = matched?.properties?.sheetId ?? 0;
    if (!title) {
      throw new Error('GOOGLE_SHEETS_NO_TAB_FOUND');
    }
    this.resolvedSheetMeta = { title, sheetId };
    return this.resolvedSheetMeta;
  }

  async getTabName(accessToken) {
    const { title } = await this.getSheetMeta(accessToken);
    return title;
  }

  findMatchingRowIndex(existingRows, rowValues, orderId) {
    const matchesOrder = (r) =>
      Array.isArray(r) &&
      !isTotalRow(r) &&
      String(r[0] || '') === rowValues[0] &&
      String(r[1] || '') === rowValues[1] &&
      toSafeNumber(r[3]) === Number(rowValues[3]) &&
      toSafeNumber(r[4]) === Number(rowValues[4]) &&
      toSafeNumber(r[5]) === Number(rowValues[5]);

    const cachedRowNumber = this.orderRowMap.get(orderId);
    if (cachedRowNumber && cachedRowNumber >= 2 && matchesOrder(existingRows[cachedRowNumber - 1])) {
      return cachedRowNumber - 1;
    }

    for (let i = existingRows.length - 1; i >= 1; i--) {
      if (matchesOrder(existingRows[i])) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Inserts a new order row strictly above the TỔNG CỘNG row (inside the Google
   * Sheets Table boundary), pushing TỔNG CỘNG down by 1 row and updating its sums.
   */
  async appendRowAboveTotal(accessToken, spreadsheetId, tabName, sheetId, existingRows, rowValues) {
    const N = existingRows.length;
    const hasTotalAtBottom = N >= 2 && isTotalRow(existingRows[N - 1]);
    const dataRows = existingRows.slice(1, hasTotalAtBottom ? N - 1 : N);
    const updatedTotalRow = buildTotalRow([...dataRows, rowValues]);

    if (hasTotalAtBottom) {
      const totalRowZeroIndex = N - 1; // 0-based index of TỔNG CỘNG row
      const newOrderRowNumber = N; // 1-based row number where new order will sit (above TỔNG CỘNG)

      const batchRes = await this.fetcher(
        `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: totalRowZeroIndex,
                    endIndex: totalRowZeroIndex + 1,
                  },
                  inheritFromBefore: totalRowZeroIndex > 1,
                },
              },
            ],
          }),
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!batchRes.ok) {
        throw new Error(`GOOGLE_SHEETS_INSERT_ROW_HTTP_${batchRes.status}`);
      }

      const twoRowRange = encodeURIComponent(
        buildRange(tabName, `A${newOrderRowNumber}:J${newOrderRowNumber + 1}`)
      );
      const putRes = await this.fetcher(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${twoRowRange}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: [rowValues, updatedTotalRow],
          }),
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!putRes.ok) {
        throw new Error(`GOOGLE_SHEETS_TABLE_APPEND_HTTP_${putRes.status}`);
      }
      return newOrderRowNumber;
    }

    // If TỔNG CỘNG was not at the bottom yet (e.g. sheet had data rows without a Total row)
    if (N >= 2) {
      await this.fetcher(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: N - 1,
                  endIndex: N + 1,
                },
                inheritFromBefore: N > 2,
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });

      const previousLastRow = normalizeExistingRow(existingRows[N - 1]);
      const threeRowRange = encodeURIComponent(buildRange(tabName, `A${N}:J${N + 2}`));
      const putRes = await this.fetcher(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${threeRowRange}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: [previousLastRow, rowValues, updatedTotalRow],
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!putRes.ok) {
        throw new Error(`GOOGLE_SHEETS_APPEND_HTTP_${putRes.status}`);
      }
      return N + 1;
    }

    // Only header existed (N === 1)
    const putRange = encodeURIComponent(buildRange(tabName, 'A2:J3'));
    const putRes = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${putRange}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: [rowValues, updatedTotalRow],
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!putRes.ok) {
      throw new Error(`GOOGLE_SHEETS_APPEND_HTTP_${putRes.status}`);
    }
    return 2;
  }

  async syncOrder(orderId) {
    if (!this.isConfigured()) return false;

    const orderRes = await this.dbQuery(
      `SELECT o.*,
         EXISTS (
           SELECT 1 FROM shop.order_status_history h
           WHERE h.order_id = o.id AND h.to_status = 'ACCEPTED'
         ) AS was_accepted
       FROM shop.orders o
       WHERE o.id = $1 AND o.shop_id = $2`,
      [orderId, this.settings.shopId]
    );

    const order = orderRes.rows[0];
    if (!order) return false;

    const isConfirmedLifecycle =
      ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'].includes(order.status) ||
      Boolean(order.confirmed_at) ||
      Boolean(order.was_accepted);

    if (!isConfirmedLifecycle) return false;

    const itemsRes = await this.dbQuery(
      `SELECT name_snapshot, quantity, unit_price, line_total
       FROM shop.order_items
       WHERE order_id = $1
       ORDER BY created_at ASC, id ASC`,
      [order.id]
    );

    const rowValues = formatOrderSheetRow(order, itemsRes.rows);
    const accessToken = await this.getAccessToken();
    const { title: tabName, sheetId } = await this.getSheetMeta(accessToken);
    const spreadsheetId = encodeURIComponent(this.sheetsConfig.spreadsheetId.trim());

    const readRange = encodeURIComponent(buildRange(tabName, 'A:J'));
    const getRes = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${readRange}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!getRes.ok) {
      throw new Error(`GOOGLE_SHEETS_READ_HTTP_${getRes.status}`);
    }

    const sheetData = await getRes.json();
    const existingRows = sheetData?.values || [];

    if (existingRows.length === 0) {
      const totalRow = buildTotalRow([rowValues]);
      const initRange = encodeURIComponent(buildRange(tabName, 'A1:J3'));
      const putRes = await this.fetcher(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${initRange}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: [ORDER_SHEET_HEADERS, rowValues, totalRow],
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!putRes.ok) {
        throw new Error(`GOOGLE_SHEETS_INIT_HTTP_${putRes.status}`);
      }
      this.orderRowMap.set(order.id, 2);
      return true;
    }

    const rowIndex = this.findMatchingRowIndex(existingRows, rowValues, order.id);
    if (rowIndex >= 0) {
      const rowNumber = rowIndex + 1;
      const updateRange = encodeURIComponent(buildRange(tabName, `A${rowNumber}:J${rowNumber}`));
      const updateRes = await this.fetcher(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${updateRange}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: [rowValues],
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!updateRes.ok) {
        throw new Error(`GOOGLE_SHEETS_UPDATE_HTTP_${updateRes.status}`);
      }

      // Also refresh the TỔNG CỘNG row if present at the bottom
      existingRows[rowIndex] = rowValues;
      const N = existingRows.length;
      if (N >= 2 && isTotalRow(existingRows[N - 1])) {
        const updatedTotalRow = buildTotalRow(existingRows.slice(1, N - 1));
        const totalRange = encodeURIComponent(buildRange(tabName, `A${N}:J${N}`));
        await this.fetcher(
          `${SHEETS_API_BASE}/${spreadsheetId}/values/${totalRange}?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              majorDimension: 'ROWS',
              values: [updatedTotalRow],
            }),
            signal: AbortSignal.timeout(8000),
          }
        );
      }

      this.orderRowMap.set(order.id, rowNumber);
      return true;
    }

    const insertedRowNumber = await this.appendRowAboveTotal(
      accessToken,
      spreadsheetId,
      tabName,
      sheetId,
      existingRows,
      rowValues
    );
    this.orderRowMap.set(order.id, insertedRowNumber);
    return true;
  }

  async syncOrderSafely(orderId) {
    try {
      return await this.syncOrder(orderId);
    } catch (err) {
      logger.warn('Google Sheets order sync failed', {
        orderId,
        code: err?.message || 'UNKNOWN_ERROR',
      });
      return false;
    }
  }

  async syncAllConfirmedOrders() {
    if (!this.isConfigured()) return { synced: 0, configured: false };

    const accessToken = await this.getAccessToken();
    const { title: tabName } = await this.getSheetMeta(accessToken);
    const spreadsheetId = encodeURIComponent(this.sheetsConfig.spreadsheetId.trim());

    const ordersRes = await this.dbQuery(
      `SELECT o.*
       FROM shop.orders o
       WHERE o.shop_id = $1
         AND (
           o.status IN ('ACCEPTED', 'PREPARING', 'READY', 'COMPLETED')
           OR o.confirmed_at IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM shop.order_status_history h
             WHERE h.order_id = o.id AND h.to_status = 'ACCEPTED'
           )
         )
       ORDER BY o.created_at ASC, o.id ASC`,
      [this.settings.shopId]
    );

    const orderRows = [];
    this.orderRowMap.clear();

    for (const order of ordersRes.rows) {
      const itemsRes = await this.dbQuery(
        `SELECT name_snapshot, quantity, unit_price, line_total
         FROM shop.order_items
         WHERE order_id = $1
         ORDER BY created_at ASC, id ASC`,
        [order.id]
      );
      orderRows.push(formatOrderSheetRow(order, itemsRes.rows));
      this.orderRowMap.set(order.id, orderRows.length + 1);
    }

    const totalRow = buildTotalRow(orderRows);
    const rowsToWrite = [ORDER_SHEET_HEADERS, ...orderRows, totalRow];

    const writeRange = encodeURIComponent(buildRange(tabName, `A1:J${rowsToWrite.length}`));
    const putRes = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${writeRange}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: rowsToWrite,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!putRes.ok) {
      throw new Error(`GOOGLE_SHEETS_BULK_WRITE_HTTP_${putRes.status}`);
    }

    return { synced: ordersRes.rows.length, configured: true, tabName };
  }
}

let defaultOrderSheetsService = null;
export function getOrderSheetsService() {
  if (!defaultOrderSheetsService) {
    defaultOrderSheetsService = new OrderSheetsService();
  }
  return defaultOrderSheetsService;
}
