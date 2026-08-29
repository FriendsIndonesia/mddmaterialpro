const APP_NAME = "MDD Material Pro";
const OWNER_EMAIL = "friendsindonesia28@gmail.com";
const GITHUB_REPO = "https://github.com/FriendsIndonesia/mddmaterialpro";

const TABLES = [
  { key: "products", sheet: "Products", fields: ["id", "code", "name", "category", "unit", "buy", "price", "price2", "stockIn", "stockOut", "stock", "stockAkhir", "min", "active"] },
  { key: "customers", sheet: "Customers", fields: ["id", "name", "phone", "type", "address", "deposit"] },
  { key: "suppliers", sheet: "Suppliers", aliases: ["Supliers"], fields: ["id", "company", "name", "phone", "address"] },
  { key: "employees", sheet: "Employees", fields: ["id", "name", "position", "startDate", "salary", "phone"] },
  { key: "categories", sheet: "Categories", fields: ["id", "name"] },
  { key: "discounts", sheet: "Discounts", fields: ["id", "name", "amount", "type", "active"] },
  { key: "cashAccounts", sheet: "CashAccounts", fields: ["id", "name", "balance"] },
  { key: "packages", sheet: "Packages", fields: ["id", "name", "items", "price"] },
  { key: "sales", sheet: "Sales", fields: ["id", "invoiceNo", "date", "dueDate", "customerId", "customerName", "customerType", "customerAddress", "customerWhatsapp", "customerDeposit", "items", "method", "ongkir", "bankCharge", "status", "total", "due", "paid", "returnAmount", "depositRemaining", "note"] },
  { key: "purchases", sheet: "Purchases", fields: ["id", "invoiceNo", "date", "dueDate", "supplierId", "salesName", "company", "whatsapp", "items", "method", "ongkir", "bankCharge", "status", "total", "due", "paid", "returnAmount", "note"] },
  { key: "cashTx", sheet: "CashTransactions", fields: ["id", "date", "type", "category", "accountId", "amount", "note"] },
  { key: "payments", sheet: "Payments", fields: ["id", "date", "refId", "invoiceNo", "relation", "type", "amount", "remaining", "method", "note"] },
  { key: "stockMoves", sheet: "StockMoves", fields: ["id", "number", "date", "productId", "sku", "productName", "unit", "type", "systemStock", "physicalStock", "difference", "qty", "note"] },
  { key: "returns", sheet: "Returns", fields: ["id", "module", "date", "refId", "invoiceNo", "productId", "product", "qty", "amount", "total", "method", "note"] },
  { key: "pendingSales", sheet: "PendingSales", fields: ["id", "invoiceNo", "date", "customerId", "customerName", "customerType", "customerAddress", "customerWhatsapp", "method", "items", "ongkir", "bankCharge", "total", "note"] },
  { key: "pendingPurchases", sheet: "PendingPurchases", fields: ["id", "invoiceNo", "date", "dueDate", "supplierId", "salesName", "company", "whatsapp", "items", "ongkir", "bankCharge", "total", "note"] },
  { key: "history", sheet: "History", fields: ["id", "date", "user", "action"] },
  { key: "syncQueue", sheet: "SyncQueue", fields: ["type", "id"] }
];

function doGet(e) {
  const ss = getSpreadsheet_();
  const action = String((e && e.parameter && e.parameter.action) || "status").toLowerCase();
  const callback = e && e.parameter && e.parameter.callback;
  let payload;
  if (action === "state") payload = readState_(ss);
  else if (action === "auth") payload = { ok: true, app: APP_NAME, source: "Sheets", data: readProfile_(ss) };
  else if (action === "finance") payload = readSubsetState_(ss, ["purchases", "sales", "payments", "cashAccounts", "cashTx", "returns", "pendingSales", "pendingPurchases"]);
  else if (action === "masterlite") payload = readSubsetState_(ss, ["customers", "suppliers", "employees", "categories", "discounts", "cashAccounts", "packages", "stockMoves"]);
  else if (action === "master") payload = readSubsetState_(ss, ["products", "customers", "suppliers", "employees", "categories", "discounts", "cashAccounts", "packages", "stockMoves"]);
  else if (action === "products") payload = readSubsetState_(ss, ["products", "categories", "discounts"]);
  else {
    ensureWorkbook_(ss);
    payload = statusPayload_(ss);
  }
  return output_(payload, callback);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const data = payload.data || {};
    const ss = getSpreadsheet_();
    ensureWorkbook_(ss);

    writeMetadata_(ss, payload, data);
    writeProfile_(ss, data);
    // New clients send row-level changes. This preserves records entered or
    // edited directly in Google Sheets instead of replacing every table.
    let preferCanonicalFinancialTables = { purchases: false, sales: false };
    if (payload.changes && payload.changes.tables) {
      const purchaseDeletes = payload.changes.tables.purchases && payload.changes.tables.purchases.deletes || [];
      const salesDeletes = payload.changes.tables.sales && payload.changes.tables.sales.deletes || [];
      preferCanonicalFinancialTables = { purchases: purchaseDeletes.length > 0, sales: salesDeletes.length > 0 };
      TABLES.forEach((table) => applyTableChanges_(ss, table, payload.changes.tables[table.key]));
    } else {
      // Backward-compatible import: merge rows and never delete sheet-only data.
      TABLES.forEach((table) => mergeTable_(ss, table, data[table.key] || []));
    }
    writeRawState_(ss, payload);
    syncFinancialLedgerSheets_(ss, preferCanonicalFinancialTables);

    return output_({
      ok: true,
      app: APP_NAME,
      owner: OWNER_EMAIL,
      syncedAt: new Date().toISOString(),
      queueLength: Array.isArray(payload.queue) ? payload.queue.length : 0,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl()
    });
  } catch (error) {
    return output_({ ok: false, app: APP_NAME, error: String(error && error.message ? error.message : error) });
  } finally {
    lock.releaseLock();
  }
}

function setupMddMaterialPro() {
  const ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  writeMetadata_(ss, { app: APP_NAME, account: OWNER_EMAIL, githubRepo: GITHUB_REPO, queue: [] }, {});
  return statusPayload_(ss);
}

function statusPayload_(ss) {
  return {
    ok: true,
    app: APP_NAME,
    owner: OWNER_EMAIL,
    githubRepo: GITHUB_REPO,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    message: "Backend Google Workspace siap menerima dan mengirim database MDD Material Pro."
  };
}

function readState_(ss) {
  const data = {};
  TABLES.forEach((table) => data[table.key] = readTableDefinition_(ss, table));
  overlayFinancialLedgers_(ss, data);
  Object.assign(data, readProfile_(ss));
  return {
    ok: true,
    app: APP_NAME,
    owner: OWNER_EMAIL,
    source: "Sheets",
    syncedAt: new Date().toISOString(),
    data,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl()
  };
}

function readSubsetState_(ss, keys) {
  const wanted = {};
  (keys || []).forEach((key) => wanted[key] = true);
  const data = {};
  TABLES.filter((table) => wanted[table.key]).forEach((table) => data[table.key] = readTableDefinition_(ss, table));
  overlayFinancialLedgers_(ss, data);
  return {
    ok: true,
    app: APP_NAME,
    owner: OWNER_EMAIL,
    source: "Sheets",
    scope: (keys || []).join(","),
    syncedAt: new Date().toISOString(),
    data,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl()
  };
}

function overlayFinancialLedgers_(ss, data) {
  if (Array.isArray(data.purchases)) data.purchases = mergeLedgerRows_(data.purchases, readLedgerRows_(ss, "Hutang", "debt"));
  if (Array.isArray(data.sales)) data.sales = mergeLedgerRows_(data.sales, readLedgerRows_(ss, "Piutang", "receivable"));
}

function mergeLedgerRows_(canonicalRows, ledgerRows) {
  const rows = {};
  (canonicalRows || []).forEach((row) => {
    const key = String(row.invoiceNo || row.id || "").trim().toLowerCase();
    if (key) rows[key] = row;
  });
  (ledgerRows || []).forEach((row) => {
    const key = String(row.invoiceNo || row.id || "").trim().toLowerCase();
    if (!key) return;
    rows[key] = Object.assign({}, rows[key] || {}, row);
  });
  return Object.keys(rows).map((key) => rows[key]);
}

function readLedgerRows_(ss, sheetName, kind) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map((value) => normalizeLedgerHeader_(value));
  const pick = (row, names) => {
    for (let i = 0; i < names.length; i += 1) {
      const index = headers.indexOf(names[i]);
      if (index >= 0 && row[index] !== "" && row[index] !== null) return row[index];
    }
    return "";
  };
  return values.filter((row) => row.some((value) => String(value || "").trim())).map((row, index) => {
    const invoiceNo = String(pick(row, ["nofaktur", "invoice", "invoiceno", "nomorfaktur"]) || "").trim();
    const total = ledgerNumber_(pick(row, kind === "debt" ? ["hutangaktif", "totalhutang", "total"] : ["piutangaktif", "totalpiutang", "total"]));
    const paid = ledgerNumber_(pick(row, ["bayar", "dibayar", "paid"]));
    const returned = ledgerNumber_(pick(row, ["retur", "return", "returnamount"]));
    const remaining = ledgerNumber_(pick(row, kind === "debt" ? ["sisahutang", "sisa"] : ["sisapiutang", "sisa"]));
    const relation = String(pick(row, kind === "debt" ? ["supplier", "namasupplier", "relasi"] : ["pelanggan", "customer", "namapelanggan", "relasi"]) || "").trim();
    const base = {
      id: (kind === "debt" ? "HUT-" : "PIU-") + (invoiceNo || String(index + 2)).replace(/[^A-Za-z0-9]/g, ""),
      invoiceNo: invoiceNo || (kind === "debt" ? "HUTANG-" : "PIUTANG-") + (index + 2),
      date: ledgerDate_(pick(row, ["tanggal", "date"])),
      dueDate: ledgerDate_(pick(row, ["jatuhtempo", "duedate"])),
      total: total || paid + returned + remaining,
      paid,
      returnAmount: returned,
      due: remaining || Math.max(0, total - paid - returned),
      method: String(pick(row, ["metode", "method"]) || "Tempo"),
      note: String(pick(row, ["catatan", "note"]) || ""),
      status: (remaining || Math.max(0, total - paid - returned)) > 0 ? (kind === "debt" ? "Hutang" : "Piutang") : "Lunas"
    };
    if (kind === "debt") base.salesName = relation;
    else base.customerName = relation;
    return base;
  });
}

function normalizeLedgerHeader_(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ledgerNumber_(value) {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  const text = String(value || "").replace(/Rp/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(text);
  return isFinite(parsed) ? parsed : 0;
}

function ledgerDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return match[3] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[1]).slice(-2);
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[1] + "-" + match[2] + "-" + match[3] : text;
}

function syncFinancialLedgerSheets_(ss, preferCanonical) {
  const data = { purchases: readTableDefinition_(ss, TABLES.find((table) => table.key === "purchases")), sales: readTableDefinition_(ss, TABLES.find((table) => table.key === "sales")) };
  // Ketika aplikasi mengirim penghapusan eksplisit, tabel canonical menjadi
  // sumber utama agar baris lama di Hutang/Piutang tidak hidup kembali.
  preferCanonical = preferCanonical || {};
  if (!preferCanonical.purchases) data.purchases = mergeLedgerRows_(data.purchases, readLedgerRows_(ss, "Hutang", "debt"));
  if (!preferCanonical.sales) data.sales = mergeLedgerRows_(data.sales, readLedgerRows_(ss, "Piutang", "receivable"));
  writeLedgerSheet_(ss, "Hutang", data.purchases, "debt");
  writeLedgerSheet_(ss, "Piutang", data.sales, "receivable");
}

function writeLedgerSheet_(ss, sheetName, rows, kind) {
  const headers = kind === "debt" ? ["Tanggal", "Jatuh Tempo", "No. Faktur", "Supplier", "Hutang Aktif", "Bayar", "Retur", "Sisa Hutang", "Metode", "Catatan"] : ["Tanggal", "Jatuh Tempo", "No. Faktur", "Pelanggan", "Piutang Aktif", "Bayar", "Retur", "Sisa Piutang", "Metode", "Catatan"];
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const activeRows = (rows || []).filter((row) => Number(row.due || 0) > 0 || Number(row.total || 0) > 0);
  if (activeRows.length) {
    const values = activeRows.map((row) => [ledgerDateValue_(row.date), ledgerDateValue_(row.dueDate), row.invoiceNo || row.id, kind === "debt" ? (row.salesName || row.company || "-") : (row.customerName || "-"), Number(row.total || 0), Number(row.paid || 0), Number(row.returnAmount || 0), Number(row.due || 0), row.method || "Tempo", row.note || ""]);
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    sheet.getRange(2, 1, values.length, 2).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, 5, values.length, 4).setNumberFormat("#,##0");
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function ledgerDateValue_(value) {
  const normalized = ledgerDate_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized || "";
  const parts = normalized.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = props.getProperty("SPREADSHEET_ID");
  if (configuredId) return SpreadsheetApp.openById(configuredId);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty("SPREADSHEET_ID", active.getId());
    return active;
  }

  const created = SpreadsheetApp.create(APP_NAME + " Backend");
  props.setProperty("SPREADSHEET_ID", created.getId());
  return created;
}

function ensureWorkbook_(ss) {
  ensureSheet_(ss, "Metadata", ["key", "value"]);
  ensureSheet_(ss, "Profile", ["key", "value"]);
  ensureSheet_(ss, "RawState", ["syncedAt", "payloadJson"]);
  TABLES.forEach((table) => ensureSheet_(ss, table.sheet, table.fields));
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, Math.max(headers.length, 1)).getValues()[0];
  const needsHeader = headers.some((header, index) => current[index] !== header);
  if (needsHeader) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  const plainNumberFields = ["stockIn", "stockOut", "stock", "stockAkhir", "min", "qty", "systemStock", "physicalStock", "difference"];
  const textFields = ["id", "code", "invoiceNo", "number", "sku", "phone", "whatsapp"];
  headers.forEach((header, index) => {
    if (plainNumberFields.indexOf(header) >= 0) sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("0.###");
    if (textFields.indexOf(header) >= 0) sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  });
  return sheet;
}

function writeMetadata_(ss, payload, data) {
  const profile = data.profile || {};
  const rows = [
    ["app", payload.app || APP_NAME],
    ["ownerEmail", payload.account || OWNER_EMAIL],
    ["githubRepo", payload.githubRepo || GITHUB_REPO],
    ["storeName", profile.name || ""],
    ["storeAddress", profile.address || ""],
    ["storeWhatsapp", profile.phone || ""],
    ["lastSyncedAt", new Date().toISOString()],
    ["queueLength", Array.isArray(payload.queue) ? payload.queue.length : 0]
  ];
  writeKeyValue_(ss, "Metadata", rows);
}

function writeProfile_(ss, data) {
  const rows = [];
  ["profile", "hardware", "accessCodes", "accessRules", "userAccounts"].forEach((key) => rows.push([key, normalizeValue_(data[key] || {})]));
  writeKeyValue_(ss, "Profile", rows);
}

function readProfile_(ss) {
  const profileRows = readKeyValue_(ss, "Profile");
  const data = {};
  Object.keys(profileRows).forEach((key) => data[key] = parseValue_(profileRows[key]));
  return data;
}

function writeKeyValue_(ss, sheetName, rows) {
  const sheet = ensureSheet_(ss, sheetName, ["key", "value"]);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function readKeyValue_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return {};
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().reduce((obj, row) => {
    if (row[0]) obj[row[0]] = row[1];
    return obj;
  }, {});
}

function writeTable_(ss, sheetName, fields, rows) {
  const sheet = ensureSheet_(ss, sheetName, fields);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, fields.length).clearContent();
  if (!Array.isArray(rows) || rows.length === 0) return;
  const values = rows.map((row) => fields.map((field) => normalizeValue_(row[field])));
  sheet.getRange(2, 1, values.length, fields.length).setValues(values);
}

function mergeTable_(ss, table, incomingRows) {
  if (!Array.isArray(incomingRows) || incomingRows.length === 0) return;
  const current = readTableDefinition_(ss, table);
  const keyField = table.fields.indexOf("id") >= 0 ? "id" : table.fields[0];
  const merged = {};
  current.forEach((row) => {
    const key = String(row[keyField] || "").trim();
    if (key) merged[key] = row;
  });
  incomingRows.forEach((row) => {
    const key = String(row && row[keyField] || "").trim();
    if (key) merged[key] = row;
  });
  writeTable_(ss, table.sheet, table.fields, Object.keys(merged).map((key) => merged[key]));
}

function applyTableChanges_(ss, table, change) {
  if (!change) return;
  const current = readTableDefinition_(ss, table);
  const keyField = table.fields.indexOf("id") >= 0 ? "id" : table.fields[0];
  const rowsById = {};
  current.forEach((row) => {
    const key = String(row[keyField] || "").trim();
    if (key) rowsById[key] = row;
  });
  (change.deletes || []).forEach((id) => delete rowsById[String(id)]);
  (change.upserts || []).forEach((row) => {
    const key = String(row && row[keyField] || "").trim();
    if (key) rowsById[key] = row;
  });
  writeTable_(ss, table.sheet, table.fields, Object.keys(rowsById).map((key) => rowsById[key]));
}

// Installable edit trigger: validates manual rows and gives missing records a
// stable ID so they can safely participate in two-way synchronization.
function onSpreadsheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const table = TABLES.find((item) => item.sheet === sheet.getName() || (item.aliases || []).indexOf(sheet.getName()) >= 0);
  if (!table || e.range.getRow() <= 1) return;
  const idColumn = table.fields.indexOf("id") + 1;
  if (idColumn <= 0) return;
  const row = e.range.getRow();
  const idCell = sheet.getRange(row, idColumn);
  if (!String(idCell.getValue() || "").trim()) {
    const prefix = table.sheet.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "ROW";
    idCell.setValue(prefix + "-" + Utilities.getUuid().slice(0, 12).toUpperCase());
  }
}

function installTwoWaySyncTrigger() {
  const ss = getSpreadsheet_();
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "onSpreadsheetEdit")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("onSpreadsheetEdit").forSpreadsheet(ss).onEdit().create();
  return statusPayload_(ss);
}

function readTableDefinition_(ss, table) {
  const names = [table.sheet].concat(table.aliases || []);
  const rowsById = {};
  names.forEach((sheetName) => {
    readTable_(ss, sheetName).forEach((row) => {
      const keyField = table.fields.indexOf("id") >= 0 ? "id" : table.fields[0];
      const key = String(row && row[keyField] || "").trim();
      if (key) rowsById[key] = row;
    });
  });
  return Object.keys(rowsById).map((key) => rowsById[key]);
}

function readTable_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  const values = range.getValues();
  const idIndex = headers.indexOf("id");
  let idsAdded = false;
  if (idIndex >= 0) {
    const prefix = sheetName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "ROW";
    values.forEach((row) => {
      const hasData = row.some((value, index) => index !== idIndex && String(value || "").trim());
      if (hasData && !String(row[idIndex] || "").trim()) {
        row[idIndex] = prefix + "-" + Utilities.getUuid().slice(0, 12).toUpperCase();
        idsAdded = true;
      }
    });
    if (idsAdded) range.setValues(values);
  }
  const textFields = ["id", "code", "invoiceNo", "number", "sku", "phone", "whatsapp"];
  return values.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      if (header) item[header] = textFields.indexOf(header) >= 0 ? String(row[index] ?? "").trim() : parseValue_(row[index]);
    });
    return item;
  });
}

function writeRawState_(ss, payload) {
  const sheet = ensureSheet_(ss, "RawState", ["syncedAt", "payloadJson"]);
  const json = JSON.stringify(payload);
  const compactPayload = json.length > 45000 ? {
    app: payload.app || APP_NAME,
    account: payload.account || OWNER_EMAIL,
    githubRepo: payload.githubRepo || GITHUB_REPO,
    sentAt: payload.sentAt || new Date().toISOString(),
    storageMode: "tables",
    message: "Payload besar disimpan di sheet tabel terstruktur, bukan di satu cell RawState.",
    counts: tableCounts_(payload.data || {})
  } : payload;
  sheet.appendRow([new Date().toISOString(), JSON.stringify(compactPayload)]);
  const maxRows = 100;
  const extraRows = sheet.getLastRow() - maxRows - 1;
  if (extraRows > 0) sheet.deleteRows(2, extraRows);
}

function tableCounts_(data) {
  const counts = {};
  TABLES.forEach((table) => counts[table.key] = Array.isArray(data[table.key]) ? data[table.key].length : 0);
  return counts;
}

function readLatestRawState_(ss) {
  const sheet = ss.getSheetByName("RawState");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const json = sheet.getRange(sheet.getLastRow(), 2).getValue();
  try {
    return JSON.parse(json || "{}");
  } catch (error) {
    return null;
  }
}

function normalizeValue_(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return value;
}

function parseValue_(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if ((trimmed[0] === "{" && trimmed[trimmed.length - 1] === "}") || (trimmed[0] === "[" && trimmed[trimmed.length - 1] === "]")) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return value;
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return value;
}

function output_(value, callback) {
  const json = JSON.stringify(value);
  const body = callback ? `${callback}(${json});` : json;
  const mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}
