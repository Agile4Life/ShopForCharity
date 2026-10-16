import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

const source = fs.readFileSync(new URL('../../integrations/google-sheets/Code.gs', import.meta.url), 'utf8');

function fixture() {
  const rows = [['Header'], ['Buyer', '0901234567', 'Address', 1, '', 35000, 'Tiền mặt', 'Chưa thanh toán', '', 'Note'],
    ['TỔNG CỘNG', '', '', 1, 0, 35000]];
  const metadata = [], calls = [], toasts = [], triggerNames = [];
  const properties = new Map([
    ['BACKEND_SYNC_URL', 'https://shop.example/api/v1/integrations/sheets/sync'],
    ['SYNC_SECRET', 'test-secret-'.repeat(4)],
  ]);
  let released = 0, rowStatus = 'created', httpCode = 200;
  const propertyStore = { getProperty: (key) => properties.get(key), setProperty: (key, value) => properties.set(key, value) };
  const sheet = {
    getSheetId: () => 1, getLastRow: () => rows.length, getMaxRows: () => 100,
    getRange(first, column, count, width) {
      return {
        getValues() {
          assert.equal(column, 1); assert.equal(width, 10);
          return structuredClone(rows.slice(first - 1, first - 1 + count));
        },
        setNumberFormat(format) { assert.equal(column, 2); assert.equal(width, 1); assert.equal(format, '@'); },
      };
    },
  };
  const spreadsheet = {
    getId: () => 'test-sheet', getSheets: () => [sheet], getSheetByName: (name) => name === 'Orders' ? sheet : null,
    toast: (...args) => toasts.push(args),
  };
  const context = vm.createContext({
    console: { warn() {} },
    PropertiesService: { getScriptProperties: () => propertyStore },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() { released++; } }) },
    Utilities: {
      getUuid: randomUUID, DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, value) => createHash('sha256').update(value).digest(),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
    },
    Sheets: { Spreadsheets: {
      DeveloperMetadata: { search: () => ({ matchedDeveloperMetadata: metadata.map((entry) => ({ developerMetadata: entry })) }) },
      batchUpdate(body) {
        for (const request of body.requests) {
          assert.deepEqual(Object.keys(request), ['createDeveloperMetadata']);
          const entry = request.createDeveloperMetadata.developerMetadata;
          assert.equal(entry.location.dimensionRange.dimension, 'ROWS');
          metadata.push(structuredClone(entry));
        }
      },
    } },
    UrlFetchApp: { fetch(url, options) {
      const body = JSON.parse(options.payload);
      calls.push({ url, body });
      assert.match(options.headers.Authorization, /^Bearer /);
      return {
        getResponseCode: () => httpCode,
        getContentText: () => JSON.stringify(body.bootstrap ? { configured: true, synced: 0 }
          : { results: body.orderIds.map((id) => ({ orderId: id, status: rowStatus,
            code: rowStatus === 'error' ? 'SHEET_ROW_INCOMPLETE' : undefined })) }),
      };
    } },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger(name) {
        triggerNames.push(name);
        const builder = { forSpreadsheet: () => builder, onEdit: () => builder, onChange: () => builder,
          timeBased: () => builder, everyMinutes: () => builder, create() {} };
        return builder;
      },
    },
  });
  vm.runInContext(source, context);
  return { context, rows, metadata, calls, toasts, properties, triggerNames, sheet,
    released: () => released, setStatus: (value) => { rowStatus = value; }, setHttpCode: (value) => { httpCode = value; } };
}

test('Apps Script installation bootstraps IDs, creates edit/change/retry triggers and adds no columns', () => {
  const f = fixture();
  f.context.installOrderSheetSync();
  assert.equal(f.calls[0].body.bootstrap, true);
  assert.deepEqual(f.triggerNames, ['handleOrderSheetEdit', 'handleOrderSheetChange', 'reconcileOrderSheet']);
  assert.equal(f.metadata.length, 1);
  assert.equal(f.metadata[0].location.dimensionRange.startIndex, 1);
  assert.equal(f.calls[1].body.orderIds[0], f.metadata[0].metadataValue);
  assert.equal(f.calls[1].body.values, undefined);
  assert.equal(f.released(), 1);
});

test('Apps Script retries errors without creating a new ID, then skips already synced values', () => {
  const f = fixture();
  f.setStatus('error'); f.context.reconcileOrderSheet();
  const originalId = f.metadata[0].metadataValue;
  assert.equal(f.properties.has('sheet_synced_' + originalId), false);
  f.setStatus('created'); f.context.reconcileOrderSheet();
  assert.equal(f.metadata.length, 1);
  assert.equal(f.calls[1].body.orderIds[0], originalId);
  assert.equal(f.properties.has('sheet_synced_' + originalId), true);
  f.context.reconcileOrderSheet();
  assert.equal(f.calls.length, 2);
  f.rows[1][9] = 'Edited note';
  f.context.handleOrderSheetEdit({ range: { getColumn: () => 10, getLastRow: () => 2,
    getRow: () => 2, getSheet: () => f.sheet } });
  assert.equal(f.calls.length, 3);
  assert.equal(f.toasts.at(-1)[0], 'Đã cập nhật đơn vào app.');
});

test('Apps Script retains identities and releases its lock after a failed HTTP delivery', () => {
  const f = fixture();
  f.setHttpCode(503);
  assert.throws(() => f.context.reconcileOrderSheet(), /HTTP 503/);
  assert.equal(f.released(), 1);
  assert.equal(f.properties.has('sheet_synced_' + f.metadata[0].metadataValue), false);
  f.setHttpCode(200); f.context.reconcileOrderSheet();
  assert.equal(f.metadata.length, 1);
  assert.equal(f.released(), 2);
});
