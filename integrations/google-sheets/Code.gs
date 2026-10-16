/* Enable the Google Sheets v4 advanced service before running installOrderSheetSync. */
const ORDER_ID_KEY = 'shop_for_charity_order_id';
const SUCCESS_PREFIX = 'sheet_synced_';

function syncSettings_() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('BACKEND_SYNC_URL') || '';
  const secret = properties.getProperty('SYNC_SECRET') || '';
  if (!/^https:\/\/[^\s]+\/api\/v1\/integrations\/sheets\/sync$/.test(url) || secret.length < 32) {
    throw new Error('Set HTTPS BACKEND_SYNC_URL and SYNC_SECRET (32+ characters) in Script Properties.');
  }
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = properties.getProperty('SHEET_TAB_NAME');
  const sheet = tabName ? spreadsheet.getSheetByName(tabName) : spreadsheet.getSheets()[0];
  if (!sheet) throw new Error('Configured sheet tab was not found.');
  return { properties, url, secret, spreadsheet, sheet };
}

function callBackend_(settings, body) {
  const response = UrlFetchApp.fetch(settings.url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + settings.secret },
    payload: JSON.stringify(Object.assign({ spreadsheetId: settings.spreadsheet.getId() }, body)),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    let detail = '';
    try {
      const error = JSON.parse(response.getContentText());
      detail = ' ' + (error.code || '') + ' ' + (error.message || '') +
        (error.requestId ? ' [requestId: ' + error.requestId + ']' : '');
    } catch (_) { /* Proxy responses may be HTML. Do not log their body. */ }
    throw new Error('Backend sync failed (HTTP ' + response.getResponseCode() + ').' + detail);
  }
  return JSON.parse(response.getContentText());
}

function installOrderSheetSync() {
  const settings = syncSettings_();
  // Link legacy web exports before assigning identities to manually entered orders.
  callBackend_(settings, { bootstrap: true });
  const handlers = ['handleOrderSheetEdit', 'handleOrderSheetChange', 'reconcileOrderSheet'];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('handleOrderSheetEdit').forSpreadsheet(settings.spreadsheet).onEdit().create();
  ScriptApp.newTrigger('handleOrderSheetChange').forSpreadsheet(settings.spreadsheet).onChange().create();
  ScriptApp.newTrigger('reconcileOrderSheet').timeBased().everyMinutes(1).create();
  // Future phone entries retain leading zeroes. No columns are added.
  if (settings.sheet.getMaxRows() > 1) settings.sheet.getRange(2, 2, settings.sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  reconcileOrderSheet();
}

function handleOrderSheetEdit(event) {
  if (!event || !event.range || event.range.getColumn() > 10 || event.range.getLastRow() < 2) return;
  const settings = syncSettings_();
  if (event.range.getSheet().getSheetId() !== settings.sheet.getSheetId()) return;
  syncRows_(settings, Math.max(2, event.range.getRow()), event.range.getLastRow(), true);
}

function handleOrderSheetChange(event) {
  if (!event || ['INSERT_ROW', 'REMOVE_ROW', 'OTHER'].indexOf(event.changeType) < 0) return;
  reconcileOrderSheet();
}

function reconcileOrderSheet() {
  const settings = syncSettings_();
  syncRows_(settings, 2, settings.sheet.getLastRow(), false);
}

function syncRows_(settings, firstRow, lastRow, interactive) {
  if (lastRow < firstRow) return;
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const rows = settings.sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 10).getValues();
    const found = Sheets.Spreadsheets.DeveloperMetadata.search({
      dataFilters: [{ developerMetadataLookup: { metadataKey: ORDER_ID_KEY, locationType: 'ROW', visibility: 'DOCUMENT' } }],
    }, settings.spreadsheet.getId());
    const rowIds = {};
    (found.matchedDeveloperMetadata || []).forEach(function(match) {
      const entry = match.developerMetadata;
      const range = entry.location.dimensionRange;
      if (range.sheetId !== settings.sheet.getSheetId()) return;
      const row = range.startIndex + 1;
      if (rowIds[row]) throw new Error('Multiple order identities on row ' + row + '. Resolve metadata before syncing.');
      rowIds[row] = entry.metadataValue;
    });
    const pending = [];
    const requests = [];
    rows.forEach(function(values, offset) {
      const label = String(values[0] || '').trim().toUpperCase();
      if (['TỔNG CỘNG', 'TỔNG', 'TOTAL'].indexOf(label) >= 0 || values.every(function(value) { return String(value).trim() === ''; })) return;
      const row = firstRow + offset;
      let id = rowIds[row];
      if (!id) {
        id = Utilities.getUuid();
        requests.push({ createDeveloperMetadata: { developerMetadata: {
          metadataKey: ORDER_ID_KEY, metadataValue: id, visibility: 'DOCUMENT',
          location: { dimensionRange: { sheetId: settings.sheet.getSheetId(), dimension: 'ROWS', startIndex: row - 1, endIndex: row } },
        } } });
      }
      const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(values)));
      if (settings.properties.getProperty(SUCCESS_PREFIX + id) !== hash) pending.push({ id: id, hash: hash, row: row });
    });
    if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, settings.spreadsheet.getId());
    const errors = [];
    for (let offset = 0; offset < pending.length; offset += 25) {
      const batch = pending.slice(offset, offset + 25);
      const response = callBackend_(settings, { orderIds: batch.map(function(row) { return row.id; }) });
      (response.results || []).forEach(function(result) {
        const row = batch.find(function(item) { return item.id === result.orderId; });
        if (!row) return;
        if (['created', 'updated', 'unchanged'].indexOf(result.status) >= 0) {
          settings.properties.setProperty(SUCCESS_PREFIX + row.id, row.hash);
        } else {
          const fields = (result.details || []).map(function(detail) { return detail.field; }).filter(Boolean).join(', ');
          errors.push('Dòng ' + row.row + ': ' + (result.message || result.code || 'Chưa đồng bộ') + (fields ? ' ' + fields : ''));
        }
      });
    }
    if (errors.length) {
      console.warn(errors.join('\n'));
      if (interactive) settings.spreadsheet.toast(errors.slice(0, 3).join('\n'), 'Chưa đồng bộ', 10);
    } else if (interactive && pending.length) {
      settings.spreadsheet.toast('Đã cập nhật đơn vào app.', 'Đồng bộ Sheet', 5);
    }
  } finally { lock.releaseLock(); }
}
