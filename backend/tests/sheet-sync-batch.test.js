import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { OrderSheetsService } from '../src/infrastructure/order-sheets-service.js';
import { createSheetSyncRouter } from '../src/infrastructure/sheet-sync-controller.js';
import { errorHandler } from '../src/common/error-handler.js';

test('import reads 25 rows with two Google requests and maps reordered responses by metadata ID', async () => {
  const ids = Array.from({ length: 25 }, () => randomUUID());
  const calls = [];
  const entries = ids.map((id, index) => ({ metadataId: index + 100, metadataValue: id,
    location: { dimensionRange: { sheetId: 7, startIndex: index + 1 } } }));
  const duplicatedId = randomUUID(), missingId = randomUUID(), foreignId = randomUUID();
  entries.push({ ...entries[0], metadataId: 200, metadataValue: duplicatedId },
    { ...entries[1], metadataId: 201, metadataValue: duplicatedId },
    { metadataId: 202, metadataValue: foreignId, location: { dimensionRange: { sheetId: 99, startIndex: 1 } } });
  const settings = { sheets: { spreadsheetId: 'test-sheet' } };
  const service = new OrderSheetsService(settings, async (url, options) => {
    calls.push(url);
    if (url.endsWith('/developerMetadata:search')) return { ok: true, async json() {
      return { matchedDeveloperMetadata: entries.map((developerMetadata) => ({ developerMetadata })) };
    } };
    assert.ok(url.endsWith('/values:batchGetByDataFilter'));
    const filters = JSON.parse(options.body).dataFilters;
    assert.equal(filters.length, 25);
    return { ok: true, async json() { return { valueRanges: filters.toReversed().map((filter) => ({
      dataFilters: [filter], valueRange: { values: [[filter.developerMetadataLookup.metadataId, '', '', 1, 0, 35000, '', '', '', 'Note', 'Unrelated column']] },
    })) }; } };
  });
  service.getAccessToken = async () => 'test-token';
  service.getSheetMeta = async () => ({ sheetId: 7 });
  const result = await service.readImportRows([...ids, ids[0], missingId, duplicatedId, foreignId]);
  assert.equal(calls.length, 2);
  assert.equal(result.size, 25);
  ids.forEach((id, index) => {
    assert.equal(result.get(id).values[0], index + 100);
    assert.equal(result.get(id).rowNumber, index + 2);
    assert.equal(result.get(id).values.length, 10);
  });
  assert.equal(result.has(missingId), false);
  assert.equal(result.has(duplicatedId), false);
  assert.equal(result.has(foreignId), false);
});

test('webhook returns actionable Google errors without importing any rows after failed reads', async () => {
  const settings = { sheets: { spreadsheetId: 'sheet', webhookSecret: 'x'.repeat(40) } };
  let failure;
  let imported = 0;
  const app = express();
  app.use(express.json(), createSheetSyncRouter({
    isConfigured: () => true,
    async readImportRows() { throw failure; },
  }, { async apply() { imported++; } }, settings), errorHandler);
  for (const [error, expectedStatus, code] of [
    [new Error('GOOGLE_SHEETS_METADATA_READ_HTTP_429'), 503, 'SHEET_RATE_LIMITED'],
    [new Error('GOOGLE_SHEETS_READ_HTTP_403'), 502, 'SHEET_GOOGLE_ACCESS_DENIED'],
    [new Error('GOOGLE_SHEETS_READ_HTTP_400'), 502, 'GOOGLE_SHEETS_READ_HTTP_400'],
    [new DOMException('Timed out', 'TimeoutError'), 503, 'SHEET_REQUEST_TIMEOUT'],
  ]) {
    failure = error;
    const response = await request(app).post('/integrations/sheets/sync')
      .set('Authorization', `Bearer ${settings.sheets.webhookSecret}`)
      .send({ spreadsheetId: 'sheet', orderIds: [randomUUID()] }).expect(expectedStatus);
    assert.equal(response.body.code, code);
    assert.equal(response.body.stack, undefined);
    if (code === 'SHEET_RATE_LIMITED') assert.equal(response.headers['retry-after'], '60');
  }
  assert.equal(imported, 0);
});
