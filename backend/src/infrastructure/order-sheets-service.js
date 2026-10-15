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
  'Sản phẩm & Số lượng',
  'Tổng tiền thanh toán',
  'Phương thức thanh toán',
  'Trạng thái thanh toán',
];

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

export function formatOrderSheetRow(order, items = []) {
  const itemSummary = items
    .map((item) => `${item.name_snapshot} × ${item.quantity}`)
    .join(', ');

  return [
    String(order.buyer_name || ''),
    String(order.buyer_phone || ''),
    itemSummary,
    Number(order.total || 0),
    order.payment_method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản QR',
    resolvePaymentStatusLabel(order),
  ];
}

function buildRange(tabName, cellRange) {
  if (!tabName) return cellRange;
  const escaped = String(tabName).replace(/'/g, "''");
  return `'${escaped}'!${cellRange}`;
}

export class OrderSheetsService {
  constructor(settings = config, fetcher = (...args) => fetch(...args), dbQuery = query) {
    this.settings = settings;
    this.fetcher = fetcher;
    this.dbQuery = dbQuery;
    this.tokenCache = null;
    this.resolvedTabName = null;
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

  async getTabName(accessToken) {
    const configuredTab = this.sheetsConfig.tabName?.trim();
    if (configuredTab) return configuredTab;
    if (this.resolvedTabName) return this.resolvedTabName;

    const spreadsheetId = encodeURIComponent(this.sheetsConfig.spreadsheetId.trim());
    const response = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`,
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
    const firstTitle = meta?.sheets?.[0]?.properties?.title;
    if (!firstTitle) {
      throw new Error('GOOGLE_SHEETS_NO_TAB_FOUND');
    }
    this.resolvedTabName = firstTitle;
    return firstTitle;
  }

  findMatchingRowIndex(existingRows, rowValues, orderId) {
    const matchesOrder = (r) =>
      Array.isArray(r) &&
      String(r[0] || '') === rowValues[0] &&
      String(r[1] || '') === rowValues[1] &&
      String(r[2] || '') === rowValues[2] &&
      Number(r[3] || 0) === Number(rowValues[3]);

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
    const tabName = await this.getTabName(accessToken);
    const spreadsheetId = encodeURIComponent(this.sheetsConfig.spreadsheetId.trim());

    const readRange = encodeURIComponent(buildRange(tabName, 'A:F'));
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
      const initRange = encodeURIComponent(buildRange(tabName, 'A1:F2'));
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
            values: [ORDER_SHEET_HEADERS, rowValues],
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
      const updateRange = encodeURIComponent(buildRange(tabName, `A${rowNumber}:F${rowNumber}`));
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
      this.orderRowMap.set(order.id, rowNumber);
      return true;
    }

    const appendRange = encodeURIComponent(buildRange(tabName, 'A:F'));
    const appendRes = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
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

    if (!appendRes.ok) {
      throw new Error(`GOOGLE_SHEETS_APPEND_HTTP_${appendRes.status}`);
    }
    this.orderRowMap.set(order.id, existingRows.length + 1);
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
    const tabName = await this.getTabName(accessToken);
    const spreadsheetId = encodeURIComponent(this.sheetsConfig.spreadsheetId.trim());
    const headerRange = encodeURIComponent(buildRange(tabName, 'A1:F1'));

    const headerRes = await this.fetcher(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${headerRange}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: [ORDER_SHEET_HEADERS],
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!headerRes.ok) {
      throw new Error(`GOOGLE_SHEETS_HEADER_HTTP_${headerRes.status}`);
    }

    const ordersRes = await this.dbQuery(
      `SELECT o.id
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

    let synced = 0;
    for (const row of ordersRes.rows) {
      if (await this.syncOrder(row.id)) {
        synced++;
      }
    }
    return { synced, configured: true, tabName };
  }
}

let defaultOrderSheetsService = null;
export function getOrderSheetsService() {
  if (!defaultOrderSheetsService) {
    defaultOrderSheetsService = new OrderSheetsService();
  }
  return defaultOrderSheetsService;
}
