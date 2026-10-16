import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { ApiException } from '../common/api-exception.js';
import { getOrderSheetsService } from './order-sheets-service.js';
import { SheetOrderImportService } from './sheet-order-import.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dependencyError(error) {
  const code = String(error?.message || '');
  if (/^GOOGLE_(?:SHEETS|OAUTH)_.*HTTP_429$/.test(code)) {
    return new ApiException(503, 'SHEET_RATE_LIMITED', 'Google Sheets đang giới hạn số yêu cầu. Vui lòng thử lại sau một phút.');
  }
  if (/^GOOGLE_(?:SHEETS|OAUTH)_.*HTTP_(401|403)$/.test(code)) {
    return new ApiException(502, 'SHEET_GOOGLE_ACCESS_DENIED', 'Google từ chối truy cập. Kiểm tra quyền Service Account và Google Sheets API.');
  }
  if (/^GOOGLE_(?:SHEETS|OAUTH)_/.test(code)) {
    return new ApiException(502, code, 'Không thể đọc hoặc cập nhật Google Sheets. Kiểm tra cấu hình và thử lại.');
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new ApiException(503, 'SHEET_REQUEST_TIMEOUT', 'Kết nối Google Sheets quá thời gian chờ. Vui lòng thử lại.');
  }
  return error;
}

export function createSheetSyncRouter(sheets = getOrderSheetsService(), importer = new SheetOrderImportService(), settings = config) {
  const router = express.Router();
  router.post('/integrations/sheets/sync', async (req, res, next) => {
    try {
      const secret = settings.sheets?.webhookSecret || '';
      ApiException.check(secret.length >= 32 && sheets.isConfigured(), 503, 'SHEET_SYNC_DISABLED', 'Đồng bộ Sheet chưa được cấu hình.');
      const expected = Buffer.from(`Bearer ${secret}`);
      const actual = Buffer.from(req.headers.authorization || '');
      ApiException.check(actual.length === expected.length && timingSafeEqual(actual, expected), 401, 'AUTH_REQUIRED', 'Không có quyền đồng bộ Sheet.');
      ApiException.check(req.body?.spreadsheetId === settings.sheets.spreadsheetId, 400, 'SHEET_MISMATCH', 'Không đúng bảng tính đã cấu hình.');
      if (req.body.bootstrap === true) {
        return res.json(await sheets.syncAllConfirmedOrders());
      }
      const orderIds = req.body.orderIds;
      ApiException.check(Array.isArray(orderIds) && orderIds.length >= 1 && orderIds.length <= 25 &&
        orderIds.every((id) => typeof id === 'string' && uuid.test(id)),
      400, 'SHEET_INVALID_IDS', 'Cần từ 1 đến 25 mã dòng hợp lệ.');
      const results = [];
      const rows = await sheets.readImportRows(orderIds);
      for (const orderId of new Set(orderIds)) {
        try {
          // Only identifiers are accepted from the webhook. Read authoritative cells ourselves.
          const row = rows.get(orderId);
          if (!row) {
            results.push({ orderId, status: 'ignored', code: 'SHEET_ROW_NOT_FOUND' });
            continue;
          }
          results.push({ ...await importer.apply(orderId, row.values), orderId, rowNumber: row.rowNumber });
        } catch (error) {
          if (!(error instanceof ApiException)) throw error;
          results.push({ orderId, status: 'error', code: error.code, message: error.message, details: error.details });
        }
      }
      res.json({ results });
    } catch (error) {
      const mapped = dependencyError(error);
      if (mapped.code === 'SHEET_RATE_LIMITED') res.set('Retry-After', '60');
      next(mapped);
    }
  });
  return router;
}
