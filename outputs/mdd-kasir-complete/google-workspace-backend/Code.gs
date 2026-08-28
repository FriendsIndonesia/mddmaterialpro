const APP_NAME = "MDD Material Pro";
const OWNER_EMAIL = "friendsindonesia28@gmail.com";
const GITHUB_REPO = "https://github.com/FriendsIndonesia/mddmaterialpro";

const TABLES = [
  { key: "products", sheet: "Products", fields: ["id", "code", "name", "category", "unit", "buy", "price", "price2", "stockIn", "stockOut", "stock", "stockAkhir", "min", "active"] },
  { key: "customers", sheet: "Customers", fields: ["id", "name", "phone", "type", "address", "deposit"] },
  { key: "suppliers", sheet: "Suppliers", fields: ["id", "company", "name", "phone", "address"] },
  { key: "employees", sheet: "Employees", fields: ["id", "name", "position", "startDate", "salary", "phone"] },
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

// Lembar input ramah pengguna. ID internal tetap disimpan di tabel teknis,
// sehingga pengguna cukup mengisi kolom yang sama seperti form aplikasi.
const FINANCE_SHEETS = {
  debt: {
    sheet: "Hutang",
    headers: ["Tanggal", "Jatuh Tempo", "No. Faktur", "Supplier", "Hutang Aktif", "Bayar", "Retur", "Sisa Hutang"]
  },
  receivable: {
    sheet: "Piutang",
    headers: ["Tanggal", "Jatuh Tempo", "No. Invoice", "Pelanggan", "Piutang Aktif", "Bayar", "Retur", "Sisa Piutang"]
  }
};

function doGet(e) {
  const ss = getSpreadsheet_();
  ensureWorkbook_(ss);
  const action = String((e && e.parameter && e.parameter.action) || "status").toLowerCase();
  const callback = e && e.parameter && e.parameter.callback;
  const payload = action === "state" ? readState_(ss) : statusPayload_(ss);
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
    importFinanceSheets_(ss);

    writeMetadata_(ss, payload, data);
    writeProfile_(ss, data);
    // New clients send row-level changes. This preserves records entered or
    // edited directly in Google Sheets instead of replacing every table.
    if (payload.changes && payload.changes.tables) {
      TABLES.forEach((table) => applyTableChanges_(ss, table, payload.changes.tables[table.key]));
    } else {
      // Backward-compatible import: merge rows and never delete sheet-only data.
      TABLES.forEach((table) => mergeTable_(ss, table, data[table.key] || []));
    }
    const currentData = {};
    TABLES.forEach((table) => currentData[table.key] = readTable_(ss, table.sheet));
    writeFinanceSheets_(ss, currentData);
    writeRawState_(ss, payload);

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
  importFinanceSheets_(ss);
  const data = {};
  TABLES.forEach((table) => data[table.key] = readTable_(ss, table.sheet));
  Object.assign(data, readProfile_(ss));
  writeFinanceSheets_(ss, data);
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
  ensureFinanceSheet_(ss, FINANCE_SHEETS.debt);
  ensureFinanceSheet_(ss, FINANCE_SHEETS.receivable);
}

function ensureFinanceSheet_(ss, config) {
  const sheet = ss.getSheetByName(config.sheet) || ss.insertSheet(config.sheet);
  const current = sheet.getRange(1, 1, 1, config.headers.length).getDisplayValues()[0];
  const needsHeader = config.headers.some((header, index) => current[index] !== header);
  if (needsHeader) {
    sheet.clear();
    sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
  }
  const header = sheet.getRange(1, 1, 1, config.headers.length);
  header.setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#0D6EFD");
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 2, 105);
  sheet.setColumnWidth(3, 135);
  sheet.setColumnWidth(4, 190);
  sheet.setColumnWidths(5, 4, 125);
  const dataRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, dataRows, 2).setNumberFormat("dd/MM/yyyy");
  sheet.getRange(2, 3, dataRows, 2).setNumberFormat("@");
  sheet.getRange(2, 5, dataRows, 4).setNumberFormat('"Rp" #,##0');
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), config.headers.length).createFilter();
  return sheet;
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
  ["profile", "hardware", "accessCodes", "accessRules"].forEach((key) => rows.push([key, normalizeValue_(data[key] || {})]));
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
  const current = readTable_(ss, table.sheet);
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
  const current = readTable_(ss, table.sheet);
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
  const table = TABLES.find((item) => item.sheet === sheet.getName());
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

function importFinanceSheets_(ss) {
  const purchasesTable = TABLES.find((table) => table.key === "purchases");
  const salesTable = TABLES.find((table) => table.key === "sales");
  const paymentsTable = TABLES.find((table) => table.key === "payments");
  const purchases = readTable_(ss, purchasesTable.sheet);
  const sales = readTable_(ss, salesTable.sheet);
  let payments = readTable_(ss, paymentsTable.sheet);

  const debtRows = readFinanceRows_(ss, FINANCE_SHEETS.debt);
  debtRows.forEach((values) => {
    const invoiceNo = String(values[2] || "").trim();
    const supplier = String(values[3] || "").trim();
    if (!invoiceNo && !supplier) return;
    let row = purchases.find((item) => String(item.invoiceNo || "").trim() === invoiceNo && invoiceNo);
    if (!row) {
      row = { id: "PUR-" + Utilities.getUuid().slice(0, 12).toUpperCase(), items: [], ongkir: 0, bankCharge: 0, note: "Input dari sheet Hutang" };
      purchases.push(row);
    }
    const total = numberValue_(values[4]);
    const paid = numberValue_(values[5]);
    const returned = numberValue_(values[6]);
    const due = hasValue_(values[7]) ? numberValue_(values[7]) : Math.max(0, total - paid - returned);
    Object.assign(row, {
      invoiceNo: invoiceNo || row.invoiceNo || "Tanpa Nomor",
      date: dateForApp_(values[0]),
      dueDate: dateForApp_(values[1]),
      salesName: supplier || row.salesName || "-",
      method: "Hutang",
      status: due > 0 ? "Hutang" : "Lunas",
      total, paid, returnAmount: returned, due
    });
    payments = upsertFinancePayment_(payments, row, "Hutang", paid, due, values[0]);
  });

  const receivableRows = readFinanceRows_(ss, FINANCE_SHEETS.receivable);
  receivableRows.forEach((values) => {
    const invoiceNo = String(values[2] || "").trim();
    const customer = String(values[3] || "").trim();
    if (!invoiceNo && !customer) return;
    let row = sales.find((item) => String(item.invoiceNo || "").trim() === invoiceNo && invoiceNo);
    if (!row) {
      row = { id: "SAL-" + Utilities.getUuid().slice(0, 12).toUpperCase(), items: [], ongkir: 0, bankCharge: 0, note: "Input dari sheet Piutang" };
      sales.push(row);
    }
    const total = numberValue_(values[4]);
    const paid = numberValue_(values[5]);
    const returned = numberValue_(values[6]);
    const due = hasValue_(values[7]) ? numberValue_(values[7]) : Math.max(0, total - paid - returned);
    Object.assign(row, {
      invoiceNo: invoiceNo || row.invoiceNo || "Tanpa Nomor",
      date: dateForApp_(values[0]),
      dueDate: dateForApp_(values[1]),
      customerName: customer || row.customerName || "-",
      method: "Piutang",
      status: due > 0 ? "Piutang" : "Lunas",
      total, paid, returnAmount: returned, due
    });
    payments = upsertFinancePayment_(payments, row, "Piutang", paid, due, values[0]);
  });

  writeTable_(ss, purchasesTable.sheet, purchasesTable.fields, purchases);
  writeTable_(ss, salesTable.sheet, salesTable.fields, sales);
  writeTable_(ss, paymentsTable.sheet, paymentsTable.fields, payments);
}

function readFinanceRows_(ss, config) {
  const sheet = ensureFinanceSheet_(ss, config);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, config.headers.length).getValues();
}

function upsertFinancePayment_(payments, row, type, paid, due, date) {
  const method = "Input Spreadsheet";
  const existing = payments.find((item) => item.refId === row.id && item.type === type && item.method === method);
  const otherPayments = payments
    .filter((item) => item.refId === row.id && item.type === type && item.method !== method)
    .reduce((sum, item) => sum + numberValue_(item.amount), 0);
  const spreadsheetAmount = Math.max(0, paid - otherPayments);
  if (spreadsheetAmount <= 0) return payments.filter((item) => !(item.refId === row.id && item.type === type && item.method === method));
  const payment = existing || { id: "PAY-" + Utilities.getUuid().slice(0, 12).toUpperCase() };
  Object.assign(payment, {
    date: dateForApp_(date), refId: row.id, invoiceNo: row.invoiceNo,
    relation: type === "Hutang" ? row.salesName : row.customerName,
    type, amount: spreadsheetAmount, remaining: due, method, note: "Penyesuaian pembayaran dari spreadsheet"
  });
  if (!existing) payments.push(payment);
  return payments;
}

function writeFinanceSheets_(ss, data) {
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const purchases = (data.purchases || []).filter((row) => row.method === "Hutang" || row.status === "Hutang" || numberValue_(row.due) > 0);
  const sales = (data.sales || []).filter((row) => row.method === "Piutang" || row.status === "Piutang" || numberValue_(row.due) > 0);
  const debtValues = purchases.map((row) => [
    dateForSheet_(row.date), dateForSheet_(row.dueDate), row.invoiceNo || "", row.salesName || "-",
    numberValue_(row.total), paidFor_(payments, row, "Hutang"), numberValue_(row.returnAmount), numberValue_(row.due)
  ]);
  const receivableValues = sales.map((row) => [
    dateForSheet_(row.date), dateForSheet_(row.dueDate), row.invoiceNo || "", row.customerName || "-",
    numberValue_(row.total), paidFor_(payments, row, "Piutang"), numberValue_(row.returnAmount), numberValue_(row.due)
  ]);
  writeFinanceTable_(ss, FINANCE_SHEETS.debt, debtValues);
  writeFinanceTable_(ss, FINANCE_SHEETS.receivable, receivableValues);
}

function writeFinanceTable_(ss, config, values) {
  const sheet = ensureFinanceSheet_(ss, config);
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, config.headers.length).clearContent();
  if (values.length) sheet.getRange(2, 1, values.length, config.headers.length).setValues(values);
  ensureFinanceSheet_(ss, config);
}

function paidFor_(payments, row, type) {
  const logged = payments.filter((item) => item.type === type && item.refId === row.id).reduce((sum, item) => sum + numberValue_(item.amount), 0);
  return Math.max(numberValue_(row.paid), logged);
}

function numberValue_(value) {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  const normalized = String(value || "").replace(/[^0-9,-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return isFinite(parsed) ? parsed : 0;
}

function hasValue_(value) {
  return value !== "" && value !== null && value !== undefined;
}

function dateForApp_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (local) return local[3] + "-" + local[2].padStart(2, "0") + "-" + local[1].padStart(2, "0");
  return text.slice(0, 10);
}

function dateForSheet_(value) {
  const normalized = dateForApp_(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : "";
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
