const APP_NAME = "MDD Material Pro";
const OWNER_EMAIL = "friendsindonesia28@gmail.com";
const GITHUB_REPO = "https://github.com/FriendsIndonesia/mddmaterialpro";
const MINIMUM_CLIENT_VERSION = 134;

const TABLES = [
  { key: "products", sheet: "Products", fields: ["id", "code", "name", "category", "unit", "primaryUnit", "secondaryUnit", "conversionValue", "secondaryBarcode", "buy", "secondaryBuy", "price", "price2", "secondaryPrice", "secondaryPrice2", "stockIn", "stockOut", "stock", "stockAkhir", "min", "active"] },
  { key: "customers", sheet: "Customers", fields: ["id", "name", "phone", "type", "address", "deposit"] },
  { key: "suppliers", sheet: "Suppliers", aliases: ["Supliers"], fields: ["id", "company", "name", "phone", "address"] },
  { key: "employees", sheet: "Employees", fields: ["id", "name", "position", "startDate", "salary", "phone"] },
  { key: "categories", sheet: "Categories", fields: ["id", "name"] },
  { key: "discounts", sheet: "Discounts", fields: ["id", "name", "amount", "type", "active"] },
  { key: "cashAccounts", sheet: "CashAccounts", fields: ["id", "name", "balance"] },
  { key: "packages", sheet: "Packages", fields: ["id", "name", "items", "price"] },
  { key: "sales", sheet: "Sales", fields: ["id", "invoiceNo", "date", "dueDate", "customerId", "customerName", "customerType", "customerAddress", "customerWhatsapp", "customerDeposit", "items", "method", "ongkir", "discount", "dp", "bankCharge", "cashReceived", "change", "status", "total", "due", "paid", "returnAmount", "depositRemaining", "note"] },
  { key: "purchases", sheet: "Purchases", fields: ["id", "invoiceNo", "supplierInvoiceNo", "date", "dueDate", "supplierId", "salesName", "company", "whatsapp", "items", "method", "ongkir", "discount", "dp", "bankCharge", "cashReceived", "change", "status", "total", "due", "paid", "returnAmount", "note"] },
  { key: "cashTx", sheet: "CashTransactions", fields: ["id", "date", "type", "category", "accountId", "amount", "note"] },
  { key: "payments", sheet: "Payments", fields: ["id", "date", "refId", "invoiceNo", "relation", "type", "amount", "remaining", "method", "note"] },
  { key: "stockMoves", sheet: "StockMoves", fields: ["id", "number", "date", "productId", "sku", "productName", "unit", "type", "systemStock", "physicalStock", "difference", "qty", "note"] },
  { key: "returns", sheet: "Returns", fields: ["id", "module", "date", "refId", "invoiceNo", "productId", "product", "qty", "unit", "primaryQty", "amount", "total", "method", "note"] },
  { key: "pendingSales", sheet: "PendingSales", fields: ["id", "invoiceNo", "date", "customerId", "customerName", "customerType", "customerAddress", "customerWhatsapp", "method", "items", "ongkir", "discount", "dp", "bankCharge", "cashReceived", "change", "total", "note"] },
  { key: "pendingPurchases", sheet: "PendingPurchases", fields: ["id", "invoiceNo", "supplierInvoiceNo", "date", "dueDate", "supplierId", "salesName", "company", "whatsapp", "method", "items", "ongkir", "discount", "dp", "bankCharge", "cashReceived", "change", "total", "note"] },
  { key: "history", sheet: "History", fields: ["id", "date", "user", "action"] }
];

function doGet(e) {
  const ss = getSpreadsheet_();
  const action = String((e && e.parameter && e.parameter.action) || "status").toLowerCase();
  const callback = e && e.parameter && e.parameter.callback;
  let payload;
  if (action === "revision") payload = { ok: true, revision: getRevision_(), minimumClientVersion: MINIMUM_CLIENT_VERSION };
  else if (action === "health") payload = { ok: true, app: APP_NAME, revision: getRevision_(), syncProtocol: 4, environment: PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production", minimumClientVersion: MINIMUM_CLIENT_VERSION, serverTime: new Date().toISOString() };
  // Bootstrap is intentionally small.  It is the only read required before
  // the application is usable; large business tables are loaded per-module.
  else if (action === "bootstrap" || action === "dashboardsummary") payload = bootstrapPayload_(ss);
  else if (action === "module") payload = modulePage_(ss, String((e && e.parameter && e.parameter.module) || ""), e && e.parameter || {});
  else if (action === "acknowledgement") payload = operationAcknowledgement_(ss, String((e && e.parameter && e.parameter.operationIds) || ""));
  else if (action === "reconcile") payload = reconcileOperations_(ss, String((e && e.parameter && e.parameter.operations) || "[]"));
  else if (action === "changes") payload = incrementalChanges_(ss, String((e && e.parameter && e.parameter.cursor) || ""));
  else if (action === "state") payload = readState_(ss);
  else if (action === "receipt") payload = { ok: true, processed: hasProcessedSync_(ss, String((e && e.parameter && e.parameter.requestId) || "")) };
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
  // Jangan menumpuk puluhan eksekusi selama perangkat lain sedang menulis.
  // Klien mempertahankan paket secara lokal dan akan mencoba lagi setelah
  // memeriksa receipt, sehingga gagal-cepat di sini lebih aman dan lebih ringan.
  if (!lock.tryLock(5000)) {
    return output_({ ok: false, busy: true, retryAfterMs: 15000, error: "Backend sedang memproses antrean perangkat lain." });
  }
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const clientVersion = Number(payload.clientVersion || 0);
    if (clientVersion < MINIMUM_CLIENT_VERSION) {
      return output_({ ok: false, updateRequired: true, minimumClientVersion: MINIMUM_CLIENT_VERSION, error: "Versi aplikasi terlalu lama. Paket tidak diproses agar database tetap aman." });
    }
    const data = payload.data || {};
    const ss = getSpreadsheet_();

    if (Number(payload.syncProtocol || 0) >= 4 && Array.isArray(payload.operations)) {
      return output_(processOperations_(ss, payload));
    }

    const requestId = String(payload.requestId || "").trim();
    if (requestId && hasProcessedSync_(ss, requestId)) {
      return output_({ ok: true, duplicate: true, requestId: requestId, revision: getRevision_() });
    }

    writeMetadata_(ss, payload, data);
    if (payload.changes && Number(payload.syncProtocol || 0) >= 2) writeProfile_(ss, payload.settings || {});
    else writeProfile_(ss, data);
    // New clients send row-level changes. This preserves records entered or
    // edited directly in Google Sheets instead of replacing every table.
    if (payload.changes && payload.changes.tables && Number(payload.syncProtocol || 0) >= 2) {
      const purchaseChange = payload.changes.tables.purchases || {};
      const salesChange = payload.changes.tables.sales || {};
      const hasPurchaseChange = (purchaseChange.upserts || []).length || (purchaseChange.deletes || []).length;
      const hasSalesChange = (salesChange.upserts || []).length || (salesChange.deletes || []).length;
      const purchasesBefore = hasPurchaseChange ? readTableDefinition_(ss, TABLES.find((table) => table.key === "purchases")) : [];
      const salesBefore = hasSalesChange ? readTableDefinition_(ss, TABLES.find((table) => table.key === "sales")) : [];
      TABLES.forEach((table) => {
        const change = payload.changes.tables[table.key];
        if (change && ((change.upserts || []).length || (change.deletes || []).length)) applyTableChanges_(ss, table, change);
      });
      // Ledger yang dapat diedit manual tidak pernah ditulis ulang secara penuh.
      // Hanya baris transaksi yang benar-benar berubah di aplikasi yang disentuh.
      if (hasPurchaseChange) applyLedgerChangesSafely_(ss, "Hutang", "debt", purchaseChange, purchasesBefore);
      if (hasSalesChange) applyLedgerChangesSafely_(ss, "Piutang", "receivable", salesChange, salesBefore);
    } else if (!payload.changes || !payload.changes.tables) {
      // Jangan menerima snapshot penuh dari aplikasi lama. Perangkat lama bisa
      // membawa cache stok/saldo yang tertinggal lalu menimpa Sheet terbaru.
      // Profil masih boleh dibaca, tetapi seluruh tabel transaksi tetap menjadi
      // milik backend sampai aplikasi memperbarui diri ke protokol delta.
    } else {
      // Abaikan delta dari aplikasi lama. Versi lama dapat memiliki snapshot
      // cache yang salah dan tidak boleh lagi menimpa input langsung di Sheet.
    }
    writeRawState_(ss, payload);
    if (requestId) recordProcessedSync_(ss, requestId);
    touchRevision_();

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

function operationReceiptSheet_(ss) {
  return ensureSheet_(ss, "OperationReceipts", ["operationId", "status", "processedAt", "deviceId", "entity", "entityId", "error"]);
}

function changeLogSheet_(ss) {
  return ensureSheet_(ss, "ChangeLog", ["cursor", "changedAt", "operationId", "entity", "entityId", "changeType", "payloadJson"]);
}

function operationReceiptMap_(ss, operationIds) {
  const result = {};
  const sheet = operationReceiptSheet_(ss);
  const cache = CacheService.getScriptCache();
  (operationIds || []).filter(Boolean).forEach((rawId) => {
    const id = String(rawId);
    const cacheKey = "OP_" + id.slice(-64);
    const cached = cache.get(cacheKey);
    if (cached) {
      result[id] = parseValue_(cached);
      return;
    }
    if (sheet.getLastRow() < 2) return;
    const matches = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findAll();
    if (!matches.length) return;
    const row = sheet.getRange(matches[matches.length - 1].getRow(), 1, 1, 7).getValues()[0];
    result[id] = { status: String(row[1] || ""), error: String(row[6] || "") };
    cache.put(cacheKey, JSON.stringify(result[id]), 21600);
  });
  return result;
}

function operationAcknowledgement_(ss, idsCsv) {
  const ids = String(idsCsv || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);
  const receipts = operationReceiptMap_(ss, ids);
  return {
    ok: true,
    acknowledged: ids.filter((id) => receipts[id] && receipts[id].status === "acknowledged"),
    conflicts: ids.filter((id) => receipts[id] && receipts[id].status === "conflict"),
    pending: ids.filter((id) => !receipts[id]),
    revision: getRevision_()
  };
}

function stableJson_(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson_).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ":" + stableJson_(value[key]); }).join(",") + "}";
  return JSON.stringify(value === undefined ? null : value);
}

function reconcileOperations_(ss, operationsJson) {
  let operations = [];
  try { operations = JSON.parse(operationsJson || "[]"); } catch (error) { return { ok: false, error: "Payload reconciliation tidak valid" }; }
  const acknowledged = [], alreadyPresent = [], conflicts = [], manualReview = [], pending = [];
  const receiptMap = operationReceiptMap_(ss, operations.map(function(op) { return String(op.operationId || ""); }));
  const tableCache = {};
  operations.slice(0, 25).forEach(function(operation) {
    const operationId = String(operation.operationId || "");
    if (!operationId) return;
    if (receiptMap[operationId] && receiptMap[operationId].status === "acknowledged") { acknowledged.push(operationId); return; }
    if (receiptMap[operationId] && receiptMap[operationId].status === "conflict") { conflicts.push(operationId); return; }
    const type = String(operation.type || ""), entity = String(operation.entity || ""), entityId = String(operation.entityId || "");
    // These operations are safe to retry because processOperations_ applies
    // them under ScriptLock and records operationId receipts. They must not be
    // converted to conflicts merely because no receipt exists yet.
    if (["stock_delta", "payment_delta", "delete", "settings"].indexOf(type) >= 0) { pending.push(operationId); return; }
    const table = TABLES.find(function(item) { return item.key === entity; });
    if (!table || !entityId) { manualReview.push(operationId); return; }
    if (!tableCache[entity]) {
      tableCache[entity] = {};
      readTableDefinition_(ss, table).forEach(function(row) { tableCache[entity][String(row.id || "")] = row; });
    }
    const backendRow = tableCache[entity][entityId];
    if (!backendRow) { pending.push(operationId); return; }
    const incoming = operation.row;
    const base = operation.base;
    if (!incoming || typeof incoming !== "object") { manualReview.push(operationId); return; }
    let changed = 0, needsApply = false, hasConflict = false;
    table.fields.forEach(function(field) {
      if (!Object.prototype.hasOwnProperty.call(incoming, field)) return;
      const incomingValue = incoming[field] === undefined ? "" : incoming[field];
      const backendValue = backendRow[field] === undefined ? "" : backendRow[field];
      if (!base || !Object.prototype.hasOwnProperty.call(base, field)) {
        if (!sameValue_(backendValue, incomingValue)) hasConflict = true;
        return;
      }
      const baseValue = base[field] === undefined ? "" : base[field];
      if (sameValue_(incomingValue, baseValue)) return;
      changed += 1;
      if (sameValue_(backendValue, incomingValue)) return;
      if (sameValue_(backendValue, baseValue)) needsApply = true;
      else hasConflict = true;
    });
    if (hasConflict) conflicts.push(operationId);
    else if (needsApply) pending.push(operationId);
    else if (changed > 0 || stableJson_(incoming) === stableJson_(backendRow)) alreadyPresent.push(operationId);
    else alreadyPresent.push(operationId);
  });
  return { ok: true, acknowledged: acknowledged, alreadyPresent: alreadyPresent, conflicts: conflicts, manualReview: manualReview, pending: pending, revision: getRevision_() };
}

function processOperations_(ss, payload) {
  const configuredEnvironment = PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production";
  if (String(payload.environment || "production") !== configuredEnvironment) {
    return { ok: false, environmentMismatch: true, error: "Endpoint " + configuredEnvironment + " menolak payload " + payload.environment };
  }
  const operations = (payload.operations || []).slice(0, 25);
  const existing = operationReceiptMap_(ss, operations.map((operation) => operation.operationId));
  const receiptSheet = operationReceiptSheet_(ss);
  const acknowledged = [];
  const conflicts = [];
  const seenBatch = {};
  operations.forEach((operation) => {
    const operationId = String(operation.operationId || "").trim();
    if (!operationId) return;
    if (seenBatch[operationId]) {
      if (seenBatch[operationId] === "conflict") conflicts.push(operationId);
      else acknowledged.push(operationId);
      return;
    }
    if (existing[operationId] && ["acknowledged", "conflict"].indexOf(existing[operationId].status) >= 0) {
      if (existing[operationId].status === "conflict") conflicts.push(operationId);
      else acknowledged.push(operationId);
      seenBatch[operationId] = existing[operationId].status;
      return;
    }
    let status = "acknowledged";
    let error = "";
    try {
      applyOperation_(ss, operation);
      syncLedgerForOperation_(ss, operation);
      appendChangeLog_(ss, operation);
      acknowledged.push(operationId);
    } catch (operationError) {
      status = String(operationError && operationError.name || "") === "ConflictError" ? "conflict" : "failed";
      error = String(operationError && operationError.message ? operationError.message : operationError);
      if (status === "conflict") conflicts.push(operationId);
    }
    receiptSheet.appendRow([operationId, status, new Date(), payload.deviceId || operation.deviceId || "", operation.entity || "", operation.entityId || "", error]);
    CacheService.getScriptCache().put("OP_" + operationId.slice(-64), JSON.stringify({ status: status, error: error }), 21600);
    seenBatch[operationId] = status;
  });
  trimTechnicalSheet_(receiptSheet, 100000);
  const revision = touchRevision_();
  return { ok: true, acknowledged: acknowledged, conflicts: conflicts, revision: revision };
}

// Operasi sync-v2 menulis Sales/Purchases secara targeted. Sinkronkan hanya
// baris Hutang/Piutang yang terkait agar stok dan dokumen transaksi tidak
// pernah berhasil tersimpan sementara saldo tagihannya tertinggal.
function syncLedgerForOperation_(ss, operation) {
  const entity = String(operation.entity || "");
  const type = String(operation.type || "");
  let kind = "";
  let entityId = "";
  if (type === "upsert" && (entity === "purchases" || entity === "sales")) {
    kind = entity === "purchases" ? "debt" : "receivable";
    entityId = String(operation.entityId || operation.payload && operation.payload.row && operation.payload.row.id || "");
  } else if (type === "payment_delta") {
    const payment = operation.payload && operation.payload.payment || {};
    kind = String(payment.type || "").toLowerCase() === "hutang" ? "debt" : "receivable";
    entityId = String(payment.refId || "");
  } else {
    return;
  }
  if (!entityId) return;
  const table = TABLES.find((item) => item.key === (kind === "debt" ? "purchases" : "sales"));
  const row = readTableDefinition_(ss, table).find((item) => String(item.id || "") === entityId);
  if (row) syncSingleLedgerRow_(ss, kind, row);
}

function syncSingleLedgerRow_(ss, kind, row) {
  const sheetName = kind === "debt" ? "Hutang" : "Piutang";
  const headers = kind === "debt"
    ? ["Tanggal", "Jatuh Tempo", "No. Faktur", "Supplier", "Hutang Aktif", "Bayar", "Retur", "Sisa Hutang", "Metode", "Catatan"]
    : ["Tanggal", "Jatuh Tempo", "No. Faktur", "Pelanggan", "Piutang Aktif", "Bayar", "Retur", "Sisa Piutang", "Metode", "Catatan"];
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const invoice = String(row.invoiceNo || row.id || "").trim();
  if (!invoice) return;
  const method = String(row.method || "").toLowerCase();
  const creditMethod = kind === "debt" ? /hutang|dp/.test(method) : /piutang|dp/.test(method);
  const isCreditRecord = Number(row.due || 0) > 0 || creditMethod;
  const matches = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getDisplayValues()
    .map((cells, index) => String(cells[0] || "").trim().toLowerCase() === invoice.toLowerCase() ? index + 2 : 0)
    .filter(Boolean);
  // Faktur duplikat lama tidak aman untuk dipilih otomatis. Tidak ada baris
  // yang dihapus atau ditimpa pada kondisi itu; canonical tetap dipakai aplikasi.
  if (matches.length > 1) return;
  if (!matches.length && !isCreditRecord) return;
  const values = [[
    ledgerDateValue_(row.date), ledgerDateValue_(row.dueDate), invoice,
    kind === "debt" ? (row.salesName || row.company || "-") : (row.customerName || "-"),
    Number(row.total || 0), Number(row.paid || 0), Number(row.returnAmount || 0), Number(row.due || 0),
    row.method || "Tempo", row.note || ""
  ]];
  const rowNumber = matches[0] || sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues(values);
  sheet.getRange(rowNumber, 1, 1, 2).setNumberFormat("dd/MM/yyyy");
  sheet.getRange(rowNumber, 5, 1, 4).setNumberFormat("#,##0");
  sheet.setFrozenRows(1);
}

// One-time repair for the verified September ledger gap. It only APPENDS a
// missing ledger projection after verifying a canonical credit transaction;
// Sales, Purchases, Payments, Products, and StockMoves are never changed.
function backfillVerifiedCreditLedgersSep14To23_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Backend sedang digunakan; ulangi backfill nanti.");
  try {
    const ss = getSpreadsheet_();
    const marker = "LEDGER_BACKFILL_20260914_20260923_V1";
    if (PropertiesService.getScriptProperties().getProperty(marker)) {
      return { ok: true, alreadyApplied: true, marker: marker };
    }
    const start = "2026-09-14", end = "2026-09-23";
    const debtRows = readTableDefinition_(ss, TABLES.find((table) => table.key === "purchases"));
    const receivableRows = readTableDefinition_(ss, TABLES.find((table) => table.key === "sales"));
    const isInPeriod = (row) => {
      const date = ledgerDate_(row.date);
      return date >= start && date <= end;
    };
    const isCredit = (row, kind) => {
      const method = String(row.method || "").toLowerCase();
      return Number(row.due || 0) > 0 || (kind === "debt" ? /hutang|dp/.test(method) : /piutang|dp/.test(method));
    };
    const missingFor = (sheetName, rows, kind) => {
      const sheet = ss.getSheetByName(sheetName);
      const existing = {};
      if (sheet && sheet.getLastRow() > 1) sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getDisplayValues().forEach((cells) => {
        const key = String(cells[0] || "").trim().toLowerCase();
        if (key) existing[key] = (existing[key] || 0) + 1;
      });
      return rows.filter((row) => isInPeriod(row) && isCredit(row, kind) && existing[String(row.invoiceNo || row.id || "").trim().toLowerCase()] === undefined);
    };
    const missingDebt = missingFor("Hutang", debtRows, "debt");
    const missingReceivable = missingFor("Piutang", receivableRows, "receivable");
    // Exact counts are an integrity gate based on the production audit. If
    // someone changes the relevant period, stop rather than guessing.
    if (missingDebt.length !== 21 || missingReceivable.length !== 15) {
      throw new Error("Audit ledger berubah: Hutang=" + missingDebt.length + ", Piutang=" + missingReceivable.length + ". Backfill dihentikan tanpa perubahan.");
    }
    missingDebt.forEach((row) => syncSingleLedgerRow_(ss, "debt", row));
    missingReceivable.forEach((row) => syncSingleLedgerRow_(ss, "receivable", row));
    PropertiesService.getScriptProperties().setProperty(marker, JSON.stringify({ completedAt: new Date().toISOString(), debt: missingDebt.length, receivable: missingReceivable.length }));
    const revision = touchRevision_();
    return { ok: true, debtInserted: missingDebt.length, receivableInserted: missingReceivable.length, revision: revision, marker: marker };
  } finally {
    lock.releaseLock();
  }
}

// Public runner retained only so the one-time guarded repair can be invoked
// from the Apps Script editor. The implementation and safety checks remain
// private above.
function runVerifiedCreditLedgerBackfill() {
  return backfillVerifiedCreditLedgersSep14To23_();
}

function applyOperation_(ss, operation) {
  const type = String(operation.type || "");
  const entity = String(operation.entity || "");
  const table = TABLES.find((item) => item.key === entity);
  if (type === "stock_delta") return applyStockDelta_(ss, operation);
  if (type === "payment_delta") return applyPaymentDelta_(ss, operation);
  if (type === "settings") return writeProfile_(ss, operation.payload && operation.payload.settings || {});
  if (!table) throw new Error("Entitas operasi tidak dikenal: " + entity);
  if (type === "upsert") {
    const row = operation.payload && operation.payload.row;
    if (!row || !String(row.id || operation.entityId || "").trim()) throw new Error("Upsert tidak memiliki ID stabil");
    if (!row.id) row.id = operation.entityId;
    return applyTableChanges_(ss, table, { upserts: [row], deletes: [], baseRows: operation.payload.base ? { [row.id]: operation.payload.base } : {} });
  }
  if (type === "delete") return applyTableChanges_(ss, table, { upserts: [], deletes: [operation.entityId], deleteMode: "explicit" });
  throw new Error("Tipe operasi tidak dikenal: " + type);
}

function applyStockDelta_(ss, operation) {
  const table = TABLES.find((item) => item.key === "products");
  const sheet = ensureSheet_(ss, table.sheet, table.fields);
  const id = String(operation.payload && operation.payload.productId || operation.entityId || "").trim();
  const delta = Number(operation.payload && operation.payload.delta || 0);
  if (!id || !isFinite(delta)) throw new Error("Stock delta tidak valid");
  const idColumn = table.fields.indexOf("id") + 1;
  const stockColumn = table.fields.indexOf("stock") + 1;
  const stockAkhirColumn = table.fields.indexOf("stockAkhir") + 1;
  const stockInColumn = table.fields.indexOf("stockIn") + 1;
  const stockOutColumn = table.fields.indexOf("stockOut") + 1;
  const ids = sheet.getLastRow() > 1 ? sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getDisplayValues() : [];
  const index = ids.findIndex((row) => String(row[0] || "").trim() === id);
  if (index < 0) throw new Error("Produk stock delta tidak ditemukan: " + id);
  const rowNumber = index + 2;
  const current = Number(sheet.getRange(rowNumber, stockColumn).getValue() || 0);
  const next = current + delta;
  if (next < -0.000001) {
    const conflict = new Error("Stok tidak cukup. Stok terbaru " + current + ", delta " + delta);
    conflict.name = "ConflictError";
    throw conflict;
  }
  sheet.getRange(rowNumber, stockColumn).setValue(Math.max(0, next));
  sheet.getRange(rowNumber, stockAkhirColumn).setValue(Math.max(0, next));
  if (delta > 0) sheet.getRange(rowNumber, stockInColumn).setValue(Number(sheet.getRange(rowNumber, stockInColumn).getValue() || 0) + delta);
  if (delta < 0) sheet.getRange(rowNumber, stockOutColumn).setValue(Number(sheet.getRange(rowNumber, stockOutColumn).getValue() || 0) + Math.abs(delta));
}

function applyPaymentDelta_(ss, operation) {
  const payment = operation.payload && operation.payload.payment;
  if (!payment || !payment.id) throw new Error("Payment delta tidak valid");
  const paymentTable = TABLES.find((item) => item.key === "payments");
  applyTableChanges_(ss, paymentTable, { upserts: [payment], deletes: [] });
  if (/^DP\s/i.test(String(payment.method || ""))) return;
  const isDebt = String(payment.type || "").toLowerCase() === "hutang";
  const targetTable = TABLES.find((item) => item.key === (isDebt ? "purchases" : "sales"));
  const sheet = ensureSheet_(ss, targetTable.sheet, targetTable.fields);
  const idColumn = targetTable.fields.indexOf("id") + 1;
  const ids = sheet.getLastRow() > 1 ? sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getDisplayValues() : [];
  const index = ids.findIndex((row) => String(row[0] || "").trim() === String(payment.refId || "").trim());
  if (index < 0) throw new Error("Referensi pembayaran tidak ditemukan: " + payment.refId);
  const rowNumber = index + 2;
  const paidColumn = targetTable.fields.indexOf("paid") + 1;
  const dueColumn = targetTable.fields.indexOf("due") + 1;
  const amount = Number(payment.amount || 0);
  const paid = Number(sheet.getRange(rowNumber, paidColumn).getValue() || 0);
  const due = Number(sheet.getRange(rowNumber, dueColumn).getValue() || 0);
  sheet.getRange(rowNumber, paidColumn).setValue(paid + amount);
  sheet.getRange(rowNumber, dueColumn).setValue(Math.max(0, due - amount));
}

function appendChangeLog_(ss, operation) {
  const sheet = changeLogSheet_(ss);
  const cursor = String(Date.now()) + "-" + Utilities.getUuid().slice(0, 8);
  sheet.appendRow([cursor, new Date(), operation.operationId, operation.entity, operation.entityId, operation.type, JSON.stringify(operation.payload || {})]);
  trimTechnicalSheet_(sheet, 5000);
}

function incrementalChanges_(ss, cursor) {
  const sheet = changeLogSheet_(ss);
  if (sheet.getLastRow() < 2) return { ok: true, cursor: cursor || "", changes: [] };
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  if (cursor === "latest") return { ok: true, cursor: rows.length ? String(rows[rows.length - 1][0]) : "", changes: [] };
  let start = 0;
  if (cursor) {
    const found = rows.findIndex((row) => String(row[0]) === cursor);
    start = found >= 0 ? found + 1 : Math.max(0, rows.length - 250);
  }
  const selected = rows.slice(start, start + 250);
  return {
    ok: true,
    cursor: selected.length ? String(selected[selected.length - 1][0]) : String(cursor || ""),
    hasMore: start + selected.length < rows.length,
    changes: selected.map((row) => ({ cursor: String(row[0]), changedAt: row[1], operationId: String(row[2]), entity: String(row[3]), entityId: String(row[4]), type: String(row[5]), payload: parseValue_(row[6]) }))
  };
}

function trimTechnicalSheet_(sheet, maxRows) {
  const excess = sheet.getLastRow() - Number(maxRows || 5000) - 1;
  if (excess > 0) sheet.deleteRows(2, excess);
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
    message: "Backend Google Workspace siap menerima dan mengirim database MDD Material Pro.",
    revision: getRevision_(),
    minimumClientVersion: MINIMUM_CLIENT_VERSION
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
  // Scope master juga membawa konfigurasi agar perubahan yang dilakukan
  // langsung pada tab Profile mengalir ke perangkat tanpa full-state pull.
  if (wanted.customers) Object.assign(data, readProfile_(ss));
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
  const result = (canonicalRows || []).map((row) => Object.assign({}, row));
  const matched = {};
  (ledgerRows || []).forEach((ledger) => {
    const invoice = String(ledger.invoiceNo || "").trim().toLowerCase();
    const exactIndex = result.findIndex((row, index) => !matched[index] && String(row.invoiceNo || "").trim().toLowerCase() === invoice && ledgerMatchSignature_(row) === ledgerMatchSignature_(ledger));
    const invoiceCandidates = result.map((row, index) => ({ row: row, index: index })).filter((item) => !matched[item.index] && String(item.row.invoiceNo || "").trim().toLowerCase() === invoice);
    const targetIndex = exactIndex >= 0 ? exactIndex : (invoiceCandidates.length === 1 ? invoiceCandidates[0].index : -1);
    if (targetIndex >= 0) {
      // Sales/Purchases adalah dokumen transaksi canonical. Ledger Hutang/Piutang
      // hanya merupakan proyeksi finansialnya, sehingga catatan ledger lama tidak
      // boleh menimpa total, pembayaran, atau sisa tagihan dokumen pusat.
      matched[targetIndex] = true;
    } else {
      result.push(ledger);
    }
  });
  return result;
}

function ledgerMatchSignature_(row) {
  const relation = row.salesName || row.company || row.customerName || row.relation || "";
  return JSON.stringify([
    String(relation).trim().toLowerCase(),
    ledgerDate_(row.date), Number(row.total || 0), Number(row.paid || 0),
    Number(row.returnAmount || 0), Number(row.due || 0)
  ]);
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
  const ledgerRows = values.filter((row) => row.some((value) => String(value || "").trim())).map((row, index) => {
    const invoiceNo = String(pick(row, ["nofaktur", "invoice", "invoiceno", "nomorfaktur"]) || "").trim();
    const total = ledgerNumber_(pick(row, kind === "debt" ? ["hutangaktif", "totalhutang", "total"] : ["piutangaktif", "totalpiutang", "total"]));
    const paid = ledgerNumber_(pick(row, ["bayar", "dibayar", "paid"]));
    const returned = ledgerNumber_(pick(row, ["retur", "return", "returnamount"]));
    const remainingRaw = pick(row, kind === "debt" ? ["sisahutang", "sisa"] : ["sisapiutang", "sisa"]);
    const hasExplicitRemaining = remainingRaw !== "" && remainingRaw !== null && remainingRaw !== undefined;
    const remaining = ledgerNumber_(remainingRaw);
    const calculatedRemaining = Math.max(0, total - paid - returned);
    // Angka 0 lama tanpa pembayaran atau retur bukan bukti tagihan telah lunas.
    // Pulihkan dari bukti angka transaksi, tanpa mengandalkan method/status
    // karena beberapa baris legacy tidak membawa metadata Piutang/Hutang.
    const effectiveRemaining = hasExplicitRemaining && !(remaining === 0 && calculatedRemaining > 0)
      ? Math.max(0, remaining)
      : calculatedRemaining;
    const relation = String(pick(row, kind === "debt" ? ["supplier", "namasupplier", "relasi"] : ["pelanggan", "customer", "namapelanggan", "relasi"]) || "").trim();
    const base = {
      // Nomor faktur warisan boleh sama. Suffix baris hanya menjadi ID internal
      // dan tidak pernah mengubah nomor faktur yang dilihat pengguna.
      id: (kind === "debt" ? "HUT-" : "PIU-") + (invoiceNo || "ROW").replace(/[^A-Za-z0-9]/g, "") + "-R" + (index + 2),
      source: kind === "debt" ? "Hutang" : "Piutang",
      invoiceNo: invoiceNo || (kind === "debt" ? "HUTANG-" : "PIUTANG-") + (index + 2),
      date: ledgerDate_(pick(row, ["tanggal", "date"])),
      dueDate: ledgerDate_(pick(row, ["jatuhtempo", "duedate"])),
      total: total || paid + returned + remaining,
      paid,
      returnAmount: returned,
      // Nilai 0 adalah saldo sah (sudah lunas), bukan tanda kolom kosong.
      due: effectiveRemaining,
      method: String(pick(row, ["metode", "method"]) || "Tempo"),
      note: String(pick(row, ["catatan", "note"]) || ""),
      status: effectiveRemaining > 0 ? (kind === "debt" ? "Hutang" : "Piutang") : "Lunas"
    };
    if (kind === "debt") base.salesName = relation;
    else base.customerName = relation;
    return base;
  });
  return ledgerRows.reverse();
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

// Terapkan delta aplikasi secara baris-per-baris. Fungsi ini sengaja tidak
// memakai clearContent agar input manual di tab Hutang/Piutang tidak mungkin
// hilang hanya karena snapshot aplikasi kosong atau tertinggal.
function applyLedgerChangesSafely_(ss, sheetName, kind, change, canonicalBefore) {
  if (!change) return;
  const upserts = change.upserts || [];
  const deletes = change.deleteMode === "explicit" ? (change.deletes || []) : [];
  if (!upserts.length && !deletes.length) return;
  const headers = kind === "debt" ? ["Tanggal", "Jatuh Tempo", "No. Faktur", "Supplier", "Hutang Aktif", "Bayar", "Retur", "Sisa Hutang", "Metode", "Catatan"] : ["Tanggal", "Jatuh Tempo", "No. Faktur", "Pelanggan", "Piutang Aktif", "Bayar", "Retur", "Sisa Piutang", "Metode", "Catatan"];
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const beforeById = {};
  (canonicalBefore || []).forEach((row) => { if (row && row.id) beforeById[String(row.id)] = row; });
  const invoiceRows = () => {
    const map = {};
    if (sheet.getLastRow() < 2) return map;
    sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getDisplayValues().forEach((value, index) => {
      const key = String(value[0] || "").trim().toLowerCase();
      if (key && !map[key]) map[key] = index + 2;
    });
    return map;
  };
  // Penghapusan hanya boleh menyentuh transaksi yang sebelumnya memang ada
  // di tabel aplikasi. Baris manual yang belum pernah menjadi canonical aman.
  deletes.forEach((id) => {
    const previous = beforeById[String(id)];
    if (!previous) return;
    const key = String(previous.invoiceNo || previous.id || "").trim().toLowerCase();
    const rowNumber = invoiceRows()[key];
    if (rowNumber) sheet.deleteRow(rowNumber);
  });
  upserts.forEach((row) => {
    if (!row) return;
    const invoice = String(row.invoiceNo || row.id || "").trim();
    if (!invoice) return;
    const existingRowNumber = invoiceRows()[invoice.toLowerCase()];
    const method = String(row.method || "").toLowerCase();
    const isCreditRecord = Number(row.due || 0) > 0 || (kind === "debt" ? /hutang|dp/.test(method) : /piutang|dp/.test(method));
    // Transaksi tunai/lunas tetap tersimpan di Sales/Purchases, tetapi tidak
    // memenuhi tab khusus Hutang/Piutang. Baris tagihan lama yang baru lunas
    // tetap diperbarui agar histori pembayaran tidak hilang.
    if (!existingRowNumber && !isCreditRecord) return;
    const values = [[ledgerDateValue_(row.date), ledgerDateValue_(row.dueDate), invoice, kind === "debt" ? (row.salesName || row.company || "-") : (row.customerName || "-"), Number(row.total || 0), Number(row.paid || 0), Number(row.returnAmount || 0), Number(row.due || 0), row.method || "Tempo", row.note || ""]];
    const rowNumber = existingRowNumber || sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues(values);
    sheet.getRange(rowNumber, 1, 1, 2).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(rowNumber, 5, 1, 4).setNumberFormat("#,##0");
  });
  sheet.setFrozenRows(1);
}

function writeLedgerSheet_(ss, sheetName, rows, kind) {
  const headers = kind === "debt" ? ["Tanggal", "Jatuh Tempo", "No. Faktur", "Supplier", "Hutang Aktif", "Bayar", "Retur", "Sisa Hutang", "Metode", "Catatan"] : ["Tanggal", "Jatuh Tempo", "No. Faktur", "Pelanggan", "Piutang Aktif", "Bayar", "Retur", "Sisa Piutang", "Metode", "Catatan"];
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const activeRows = (rows || []).filter((row) => Number(row.due || 0) > 0 || Number(row.total || 0) > 0);
  const values = activeRows.map((row) => [ledgerDateValue_(row.date), ledgerDateValue_(row.dueDate), row.invoiceNo || row.id, kind === "debt" ? (row.salesName || row.company || "-") : (row.customerName || "-"), Number(row.total || 0), Number(row.paid || 0), Number(row.returnAmount || 0), Number(row.due || 0), row.method || "Tempo", row.note || ""]);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const currentRows = readLedgerRows_(ss, sheetName, kind);
  const currentSignature = currentRows.map((row) => ledgerRowSignature_(row, kind)).sort();
  const wantedSignature = activeRows.map((row) => ledgerRowSignature_(row, kind)).sort();
  // Hindari clear/setValues berulang saat isi sama. Ini membuat user dapat
  // mengetik langsung di Sheet tanpa sel tiba-tiba di-reset oleh auto-sync.
  if (JSON.stringify(currentSignature) === JSON.stringify(wantedSignature)) return;
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
  if (values.length) {
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    sheet.getRange(2, 1, values.length, 2).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, 5, values.length, 4).setNumberFormat("#,##0");
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function ledgerRowSignature_(row, kind) {
  return JSON.stringify([
    ledgerDate_(row.date), ledgerDate_(row.dueDate), String(row.invoiceNo || row.id || "").trim(),
    String(kind === "debt" ? (row.salesName || row.company || "-") : (row.customerName || "-")).trim(),
    Number(row.total || 0), Number(row.paid || 0), Number(row.returnAmount || 0), Number(row.due || 0),
    String(row.method || "Tempo"), String(row.note || "")
  ]);
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
  const oldColumnCount = Math.max(sheet.getLastColumn(), 1);
  const oldHeaders = sheet.getRange(1, 1, 1, oldColumnCount).getDisplayValues()[0].map((value) => String(value || "").trim());
  const current = headers.map((_, index) => oldHeaders[index] || "");
  const needsHeader = headers.some((header, index) => current[index] !== header) || oldHeaders.filter(Boolean).length !== headers.length;
  if (needsHeader) {
    // Migrasi kolom berdasarkan nama header. Data yang diinput langsung oleh
    // pengguna tetap dipertahankan ketika aplikasi menambahkan field baru.
    const oldRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, oldColumnCount).getValues() : [];
    const migratedRows = oldRows.map((row) => headers.map((header) => {
      const oldIndex = oldHeaders.indexOf(header);
      return oldIndex >= 0 ? row[oldIndex] : "";
    }));
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (migratedRows.length) sheet.getRange(2, 1, migratedRows.length, headers.length).setValues(migratedRows);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  const plainNumberFields = ["conversionValue", "buy", "secondaryBuy", "price", "price2", "secondaryPrice", "secondaryPrice2", "stockIn", "stockOut", "stock", "stockAkhir", "min", "qty", "systemStock", "physicalStock", "difference"];
  const textFields = ["id", "code", "secondaryBarcode", "invoiceNo", "number", "sku", "phone", "whatsapp"];
  headers.forEach((header, index) => {
    if (plainNumberFields.indexOf(header) >= 0) sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("0.######");
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
  const allowed = ["profile", "hardware", "accessCodes", "accessRules", "userAccounts", "deletionTombstones"];
  const rows = allowed.filter((key) => Object.prototype.hasOwnProperty.call(data || {}, key)).map((key) => [key, normalizeValue_(data[key] || {})]);
  if (!rows.length) return;
  const existing = readKeyValue_(ss, "Profile");
  rows.forEach((row) => { existing[row[0]] = row[1]; });
  writeKeyValue_(ss, "Profile", Object.keys(existing).map((key) => [key, existing[key]]));
}

function readProfile_(ss) {
  const profileRows = readKeyValue_(ss, "Profile");
  const data = {};
  Object.keys(profileRows).forEach((key) => data[key] = parseValue_(profileRows[key]));
  return data;
}

function normalizeCashAccountNames_(ss) {
  const sheet = ss.getSheetByName("CashAccounts");
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((value) => String(value || "").trim().toLowerCase());
  const nameIndex = headers.indexOf("name");
  if (nameIndex < 0) return;
  const range = sheet.getRange(2, nameIndex + 1, sheet.getLastRow() - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach((row) => {
    if (/^(kas\s*2|petty\s*cash)$/i.test(String(row[0] || "").trim())) {
      row[0] = "Petty Kas";
      changed = true;
    }
  });
  if (changed) range.setValues(values);
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
  // Klien lama tetap hanya melakukan upsert per baris. Jangan pernah menulis
  // ulang seluruh sheet karena pengguna bisa sedang mengetik langsung di sana.
  applyTableChanges_(ss, table, { upserts: incomingRows, deletes: [] });
}

function applyTableChanges_(ss, table, change) {
  if (!change) return;
  const sheet = ensureSheet_(ss, table.sheet, table.fields);
  const keyField = table.fields.indexOf("id") >= 0 ? "id" : table.fields[0];
  const keyIndex = table.fields.indexOf(keyField);
  const rowById = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, keyIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach((row, index) => {
      const id = String(row[0] || "").trim();
      if (id) rowById[id] = index + 2;
    });
  }
  // Klien lama menyimpulkan delete dari cache yang tidak lengkap. Tolak semua
  // penghapusan yang tidak membawa penanda bahwa user menekan tombol Delete.
  const explicitDeletes = change.deleteMode === "explicit" ? (change.deletes || []) : [];
  // Hapus dari bawah ke atas agar nomor baris yang belum diproses tidak bergeser.
  explicitDeletes.map((id) => rowById[String(id)]).filter(Boolean).sort((a, b) => b - a).forEach((rowNumber) => sheet.deleteRow(rowNumber));
  // Bangun ulang indeks setelah delete, lalu sentuh hanya baris yang berubah.
  const refreshedRowById = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, keyIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach((row, index) => {
      const id = String(row[0] || "").trim();
      if (id) refreshedRowById[id] = index + 2;
    });
  }
  (change.upserts || []).forEach((row) => {
    const key = String(row && row[keyField] || "").trim();
    if (!key) return;
    const rowNumber = refreshedRowById[key] || sheet.getLastRow() + 1;
    const isNewRow = !refreshedRowById[key];
    if (isNewRow && table.key === "products") row.code = reserveUniqueProductCode_(sheet, table.fields, row.code);
    if (isNewRow && (table.key === "sales" || table.key === "purchases")) row.invoiceNo = reserveUniqueVisibleValue_(sheet, table.fields, "invoiceNo", row.invoiceNo);
    const currentValues = refreshedRowById[key]
      ? sheet.getRange(rowNumber, 1, 1, table.fields.length).getValues()[0]
      : table.fields.map(() => "");
    const base = change.baseRows && change.baseRows[key];
    const values = table.fields.map((field, index) => {
      if (!Object.prototype.hasOwnProperty.call(row, field)) return currentValues[index];
      // Baris produk lama tanpa baseline tidak boleh mengubah counter stok.
      // Ini menutup jalur perangkat/cache lama yang pernah mengirim snapshot.
      if (!isNewRow && table.key === "products" && !base && ["stockIn", "stockOut", "stock", "stockAkhir"].indexOf(field) >= 0) return currentValues[index];
      if (!base || !Object.prototype.hasOwnProperty.call(base, field)) return normalizeValue_(row[field]);
      const incoming = normalizeValue_(row[field]);
      const original = normalizeValue_(base[field]);
      let current = normalizeValue_(currentValues[index]);
      // The frontend normalizes empty numeric conversion cells to zero.
      // Compare like-for-like so a first conversion is not discarded as a conflict.
      if (table.key === "products" && ["conversionValue", "secondaryBuy", "secondaryPrice", "secondaryPrice2"].indexOf(field) >= 0 && current === "" && original === 0) current = 0;
      // Three-way merge: perubahan manual di Sheet pada kolom lain tidak boleh
      // tertimpa oleh snapshot lama dari salah satu perangkat.
      if (sameValue_(incoming, original)) return currentValues[index];
      if (!sameValue_(current, original) && !sameValue_(current, incoming)) {
        // Stok adalah counter bersama. Jika Sheet dan aplikasi mengubahnya
        // bersamaan, terapkan selisih aplikasi di atas nilai terbaru Sheet.
        if (table.key === "products" && ["stockIn", "stockOut", "stock"].indexOf(field) >= 0) {
          const mergedNumber = Number(current || 0) + (Number(incoming || 0) - Number(original || 0));
          return Math.max(0, mergedNumber);
        }
        if (table.key === "products" && field === "stockAkhir") return currentValues[index];
        return currentValues[index];
      }
      return incoming;
    });
    if (table.key === "products") {
      const stockIndex = table.fields.indexOf("stock");
      const stockAkhirIndex = table.fields.indexOf("stockAkhir");
      if (stockIndex >= 0 && stockAkhirIndex >= 0) values[stockAkhirIndex] = values[stockIndex];
    }
    sheet.getRange(rowNumber, 1, 1, table.fields.length).setValues([values]);
    refreshedRowById[key] = rowNumber;
  });
}

function reserveUniqueProductCode_(sheet, fields, requested, excludeRow) {
  const codeIndex = fields.indexOf("code");
  if (codeIndex < 0) return requested;
  const used = sheet.getLastRow() > 1 ? sheet.getRange(2, codeIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().filter((_row, index) => index + 2 !== excludeRow).map((row) => String(row[0] || "").trim().toLowerCase()) : [];
  const wanted = String(requested || "").trim();
  if (wanted && used.indexOf(wanted.toLowerCase()) < 0) return wanted;
  let largest = 0;
  used.forEach((code) => {
    const match = code.match(/^899-mdd-(\d+)$/i);
    if (match) largest = Math.max(largest, Number(match[1]) || 0);
  });
  let candidate;
  do {
    largest += 1;
    candidate = "899-MDD-" + ("0000" + largest).slice(-4);
  } while (used.indexOf(candidate.toLowerCase()) >= 0);
  return candidate;
}

function reserveUniqueVisibleValue_(sheet, fields, field, requested, excludeRow) {
  const fieldIndex = fields.indexOf(field);
  if (fieldIndex < 0) return requested;
  const used = sheet.getLastRow() > 1 ? sheet.getRange(2, fieldIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().filter((_row, index) => index + 2 !== excludeRow).map((row) => String(row[0] || "").trim().toLowerCase()) : [];
  const base = String(requested || "DOC").trim();
  if (used.indexOf(base.toLowerCase()) < 0) return base;
  let sequence = 2;
  let candidate = base + "-R" + sequence;
  while (used.indexOf(candidate.toLowerCase()) >= 0) {
    sequence += 1;
    candidate = base + "-R" + sequence;
  }
  return candidate;
}

function sameValue_(left, right) {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return JSON.stringify(left == null ? "" : left) === JSON.stringify(right == null ? "" : right);
}

// Installable edit trigger: validates manual rows and gives missing records a
// stable ID so they can safely participate in two-way synchronization.
function onSpreadsheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  // Tab laporan Hutang/Piutang memang tidak memiliki kolom ID. Setiap edit
  // manual tetap harus menaikkan revision agar seluruh perangkat segera pull.
  if (["Hutang", "Piutang"].indexOf(sheet.getName()) >= 0) {
    if (e.range.getRow() > 1) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 2).setNumberFormat("dd/MM/yyyy");
        sheet.getRange(2, 5, lastRow - 1, 4).setNumberFormat("#,##0");
      }
      appendChangeLog_(e.source || getSpreadsheet_(), {
        operationId: "SHEET-" + Utilities.getUuid(), entity: "finance", entityId: sheet.getName(),
        type: "refresh", payload: { scope: "finance", source: sheet.getName() }
      });
      touchRevision_();
    }
    return;
  }
  if (sheet.getName() === "Profile" && e.range.getRow() > 1) {
    appendChangeLog_(e.source || getSpreadsheet_(), {
      operationId: "SHEET-" + Utilities.getUuid(), entity: "profile", entityId: "profile",
      type: "refresh", payload: { scope: "masterlite", source: "Profile" }
    });
    touchRevision_();
    return;
  }
  const table = TABLES.find((item) => item.sheet === sheet.getName() || (item.aliases || []).indexOf(sheet.getName()) >= 0);
  if (!table || e.range.getRow() <= 1) return;
  const idColumn = table.fields.indexOf("id") + 1;
  if (idColumn <= 0) return;
  for (let editedRow = e.range.getRow(); editedRow <= e.range.getLastRow(); editedRow += 1) {
    const idCell = sheet.getRange(editedRow, idColumn);
    let createdId = false;
    if (!String(idCell.getValue() || "").trim()) {
      const prefix = table.sheet.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "ROW";
      idCell.setValue(prefix + "-" + Utilities.getUuid().slice(0, 12).toUpperCase());
      createdId = true;
    }
    if (createdId && table.key === "products") {
      const codeIndex = table.fields.indexOf("code");
      if (codeIndex >= 0) {
        const codeCell = sheet.getRange(editedRow, codeIndex + 1);
        codeCell.setValue(reserveUniqueProductCode_(sheet, table.fields, codeCell.getDisplayValue(), editedRow));
      }
    }
    if (createdId && (table.key === "sales" || table.key === "purchases")) {
      const invoiceIndex = table.fields.indexOf("invoiceNo");
      if (invoiceIndex >= 0) {
        const invoiceCell = sheet.getRange(editedRow, invoiceIndex + 1);
        invoiceCell.setValue(reserveUniqueVisibleValue_(sheet, table.fields, "invoiceNo", invoiceCell.getDisplayValue(), editedRow));
      }
    }
  }
  if (table.key === "products") {
    const firstColumn = e.range.getColumn();
    const lastColumn = e.range.getLastColumn();
    const stockColumn = table.fields.indexOf("stock") + 1;
    const stockAkhirColumn = table.fields.indexOf("stockAkhir") + 1;
    for (let rowNumber = e.range.getRow(); rowNumber <= e.range.getLastRow(); rowNumber += 1) {
      if (stockColumn >= firstColumn && stockColumn <= lastColumn) {
        sheet.getRange(rowNumber, stockAkhirColumn).setValue(sheet.getRange(rowNumber, stockColumn).getValue());
      } else if (stockAkhirColumn >= firstColumn && stockAkhirColumn <= lastColumn) {
        sheet.getRange(rowNumber, stockColumn).setValue(sheet.getRange(rowNumber, stockAkhirColumn).getValue());
      }
    }
  }
  // Publish the final row after validation/normalization. Other devices can
  // now consume direct Spreadsheet edits through the same change cursor used
  // for application-originated operations.
  for (let changedRowNumber = e.range.getRow(); changedRowNumber <= e.range.getLastRow(); changedRowNumber += 1) {
    const rowValues = sheet.getRange(changedRowNumber, 1, 1, table.fields.length).getValues()[0];
    const changedRow = {};
    table.fields.forEach(function(field, index) { changedRow[field] = parseValue_(rowValues[index]); });
    if (!String(changedRow.id || "").trim()) continue;
    appendChangeLog_(e.source || getSpreadsheet_(), {
      operationId: "SHEET-" + Utilities.getUuid(), entity: table.key,
      entityId: String(changedRow.id), type: "upsert", payload: { row: changedRow }
    });
  }
  touchRevision_();
}

function getRevision_() {
  return PropertiesService.getScriptProperties().getProperty("DATA_REVISION") || "0";
}

function touchRevision_() {
  const revision = String(Date.now()) + "-" + Utilities.getUuid().slice(0, 8);
  PropertiesService.getScriptProperties().setProperty("DATA_REVISION", revision);
  return revision;
}

function installTwoWaySyncTrigger() {
  const ss = getSpreadsheet_();
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "onSpreadsheetEdit")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("onSpreadsheetEdit").forSpreadsheet(ss).onEdit().create();
  return statusPayload_(ss);
}

// Pembersihan audit 03/09/2026. Idempotent dan selalu membuat salinan baris
// sebelum menghapus duplikat yang telah dikonfirmasi pemilik.
function cleanupConfirmedDuplicates20260903() {
  const ss = getSpreadsheet_();
  const targets = {
    Products: ["PRO-E755A7F3-281", "PRO-E21FB663-B20", "PRO-1133079A-755", "PRO-57141F52-1E5", "PRO-F4D8C17D-E05", "PRO-2C91B632-31C"],
    Payments: ["PAY-IF6BQ", "PAY-910UR", "PAY-6OUT8"]
  };
  const backupName = "AuditBackup_20260903";
  const backup = ss.getSheetByName(backupName) || ss.insertSheet(backupName);
  if (backup.getLastRow() === 0) backup.appendRow(["deletedAt", "sourceSheet", "originalRow", "id", "rowJson"]);
  const removed = [];
  Object.keys(targets).forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const idIndex = headers.indexOf("id");
    if (idIndex < 0) return;
    const wanted = {};
    targets[sheetName].forEach((id) => wanted[id] = true);
    const matches = [];
    values.slice(1).forEach((row, index) => {
      const id = String(row[idIndex] || "").trim();
      if (wanted[id]) matches.push({ rowNumber: index + 2, id: id, values: row });
    });
    matches.forEach((item) => backup.appendRow([new Date(), sheetName, item.rowNumber, item.id, JSON.stringify(item.values.map(normalizeValue_))]));
    matches.sort((a, b) => b.rowNumber - a.rowNumber).forEach((item) => {
      sheet.deleteRow(item.rowNumber);
      removed.push(sheetName + ":" + item.id);
    });
  });
  backup.setFrozenRows(1);
  backup.autoResizeColumns(1, 5);
  touchRevision_();
  return { ok: true, backupSheet: backupName, removed: removed, count: removed.length };
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
  const result = Object.keys(rowsById).map((key) => rowsById[key]);
  const newestFirstTables = ["sales", "purchases", "cashTx", "payments", "stockMoves", "returns", "pendingSales", "pendingPurchases", "history"];
  return newestFirstTables.indexOf(table.key) >= 0 ? result.reverse() : result;
}

// v141: the login path never serializes the full workbook.  These helpers
// calculate a small authoritative dashboard projection inside Apps Script and
// return only aggregates, revisions, and safe module metadata.
function dateKeyWib_(value, ss) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const local = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return local ? local[3] + "-" + local[2] + "-" + local[1] : "";
}

function todayWib_(ss) {
  return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
}

function tableRows_(ss, key) {
  const table = TABLES.filter(function(item) { return item.key === key; })[0];
  return table ? readTableDefinition_(ss, table) : [];
}

function numeric_(value) {
  const number = Number(value || 0);
  return isFinite(number) ? number : 0;
}

function dashboardSummary_(ss) {
  const today = todayWib_(ss);
  const products = tableRows_(ss, "products");
  const sales = tableRows_(ss, "sales");
  const purchases = tableRows_(ss, "purchases");
  const payments = tableRows_(ss, "payments");
  const cashAccounts = tableRows_(ss, "cashAccounts");
  const cashTx = tableRows_(ss, "cashTx");
  const stockMoves = tableRows_(ss, "stockMoves");
  const pendingSales = tableRows_(ss, "pendingSales");
  const active = products.filter(function(row) { return row.active !== false; });
  const todaySales = sales.filter(function(row) { return dateKeyWib_(row.date, ss) === today; });
  const todayPurchases = purchases.filter(function(row) { return dateKeyWib_(row.date, ss) === today; });
  const paymentToday = payments.filter(function(row) { return dateKeyWib_(row.date, ss) === today; });
  const isPayment = function(row, kind) { return String(row.type || row.category || "").toLowerCase().indexOf(kind) >= 0; };
  const sum = function(rows, field) { return rows.reduce(function(total, row) { return total + numeric_(row[field]); }, 0); };
  const stockOf = function(row) { return numeric_(row.stockAkhir || row.stock); };
  const low = active.filter(function(row) { return stockOf(row) <= numeric_(row.min); });
  const stockValue = active.reduce(function(total, row) { return total + numeric_(row.buy) * stockOf(row); }, 0);
  const receivable = sales.reduce(function(total, row) { return total + Math.max(0, numeric_(row.due)); }, 0);
  const payable = purchases.reduce(function(total, row) { return total + Math.max(0, numeric_(row.due)); }, 0);
  const cashBalance = sum(cashAccounts, "balance");
  const pettyCash = cashTx.filter(function(row) { return dateKeyWib_(row.date, ss) === today && String(row.category || "") === "Petty Cash"; }).reduce(function(total, row) { return total + (String(row.type || "") === "Masuk" ? numeric_(row.amount) : -numeric_(row.amount)); }, 0);
  const soldQuantity = todaySales.reduce(function(total, sale) {
    let items = sale.items;
    if (typeof items === "string") { try { items = JSON.parse(items); } catch (error) { items = []; } }
    return total + (Array.isArray(items) ? items.reduce(function(qty, item) { return qty + numeric_(item.qty); }, 0) : 0);
  }, 0);
  return {
    date: today,
    totalProducts: active.length,
    productsSoldToday: soldQuantity,
    salesInvoiceToday: todaySales.length,
    salesToday: sum(todaySales, "total"),
    purchasesToday: sum(todayPurchases, "total"),
    receivablePaymentsToday: sum(paymentToday.filter(function(row) { return isPayment(row, "piutang"); }), "amount"),
    debtPaymentsToday: sum(paymentToday.filter(function(row) { return isPayment(row, "hutang"); }), "amount"),
    cashBalance: cashBalance,
    stockValue: stockValue,
    lowStockCount: low.length,
    receivable: receivable,
    payable: payable,
    receivablePaymentsTotal: sum(payments.filter(function(row) { return isPayment(row, "piutang"); }), "amount"),
    debtPaymentsTotal: sum(payments.filter(function(row) { return isPayment(row, "hutang"); }), "amount"),
    pettyCashToday: pettyCash,
    stockDifference: stockMoves.filter(function(row) { return ["Opname", "Penyesuaian"].indexOf(row.type) >= 0; }).reduce(function(total, row) { return total + numeric_(row.difference || row.qty); }, 0),
    netAssetValue: cashBalance + stockValue + receivable - payable,
    pendingSalesCount: pendingSales.length,
    lowStockPreview: low.slice(0, 20).map(function(row) { return { id: row.id, code: row.code, name: row.name, unit: row.unit, stock: stockOf(row), min: numeric_(row.min) }; })
  };
}

function entityMetadata_(ss) {
  const revision = getRevision_();
  return TABLES.reduce(function(result, table) {
    const sheet = ss.getSheetByName(table.sheet);
    result[table.key] = { revision: revision, count: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0 };
    return result;
  }, {});
}

function bootstrapPayload_(ss) {
  const revision = getRevision_();
  return {
    ok: true,
    app: APP_NAME,
    environment: PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production",
    syncProtocol: 4,
    minimumClientVersion: MINIMUM_CLIENT_VERSION,
    revision: revision,
    spreadsheetId: ss.getId(),
    serverTime: new Date().toISOString(),
    data: {
      profile: readProfile_(ss),
      summary: dashboardSummary_(ss),
      entityRevisions: entityMetadata_(ss),
      lastUpdated: new Date().toISOString()
    }
  };
}

function modulePage_(ss, moduleName, parameters) {
  const module = String(moduleName || "").trim();
  const table = TABLES.filter(function(item) { return item.key === module; })[0];
  if (!table) return { ok: false, error: "Module tidak dikenal" };
  const requestedLimit = Number(parameters.limit || 250);
  const limit = Math.max(1, Math.min(500, isFinite(requestedLimit) ? requestedLimit : 250));
  const cursor = Math.max(0, Number(parameters.cursor || 0) || 0);
  const rows = readTableDefinition_(ss, table);
  const page = rows.slice(cursor, cursor + limit);
  const next = cursor + page.length;
  return {
    ok: true,
    module: module,
    revision: getRevision_(),
    spreadsheetId: ss.getId(),
    cursor: String(next),
    hasMore: next < rows.length,
    updatedSince: String(parameters.updatedSince || ""),
    data: { rows: page, count: rows.length }
  };
}

function syncReceiptSheet_(ss) {
  return ensureSheet_(ss, "SyncReceipts", ["requestId", "processedAt"]);
}

function hasProcessedSync_(ss, requestId) {
  if (!requestId) return false;
  const cache = CacheService.getScriptCache();
  const cacheKey = "SYNC_RECEIPT_" + requestId.slice(-64);
  if (cache.get(cacheKey) === "1") return true;
  const sheet = syncReceiptSheet_(ss);
  if (sheet.getLastRow() < 2) return false;
  const found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .some((row) => String(row[0] || "").trim() === requestId);
  if (found) cache.put(cacheKey, "1", 21600);
  return found;
}

function recordProcessedSync_(ss, requestId) {
  const sheet = syncReceiptSheet_(ss);
  sheet.appendRow([requestId, new Date()]);
  CacheService.getScriptCache().put("SYNC_RECEIPT_" + requestId.slice(-64), "1", 21600);
  // Bukti sinkronisasi hanya dibutuhkan untuk jendela retry aktif. Batas 500
  // menjaga pemeriksaan idempoten tetap cepat tanpa mengurangi keamanan retry.
  const excess = sheet.getLastRow() - 501;
  if (excess > 0) sheet.deleteRows(2, excess);
}

function readTable_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  const values = range.getValues();
  const idIndex = headers.indexOf("id");
  if (idIndex >= 0) {
    const prefix = sheetName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "ROW";
    const missingIds = [];
    values.forEach((row, index) => {
      const hasData = row.some((value, index) => index !== idIndex && String(value || "").trim());
      if (hasData && !String(row[idIndex] || "").trim()) {
        row[idIndex] = prefix + "-" + Utilities.getUuid().slice(0, 12).toUpperCase();
        missingIds.push({ row: index + 2, id: row[idIndex] });
      }
    });
    // Jangan menulis ulang seluruh tabel hanya untuk mengisi ID. Penulisan
    // rentang penuh dapat menimpa sel lain yang sedang diketik user.
    missingIds.forEach((entry) => sheet.getRange(entry.row, idIndex + 1).setValue(entry.id));
  }
  const textFields = ["id", "code", "invoiceNo", "number", "sku", "phone", "whatsapp"];
  return values.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = row[index];
      // Sheets can coerce a date-only value into local midnight. JSON would
      // serialize that Date in UTC and move WIB dates back one calendar day.
      item[header] = /(?:^date$|Date$)/.test(header) && value instanceof Date && !isNaN(value.getTime())
        ? Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd")
        : textFields.indexOf(header) >= 0 ? String(value ?? "").trim() : parseValue_(value);
    });
    return item;
  });
}

function writeRawState_(ss, payload) {
  const sheet = ensureSheet_(ss, "RawState", ["syncedAt", "payloadJson"]);
  // Simpan audit teknis yang ringkas saja. Snapshot lengkap dapat berisi kode
  // akses dan akan memperbesar spreadsheet tanpa manfaat operasional.
  const changes = payload.changes && payload.changes.tables ? payload.changes.tables : {};
  const compactPayload = {
    app: payload.app || APP_NAME,
    account: payload.account || OWNER_EMAIL,
    githubRepo: payload.githubRepo || GITHUB_REPO,
    sentAt: payload.sentAt || new Date().toISOString(),
    storageMode: "tables",
    counts: tableCounts_(payload.data || {}),
    changes: Object.keys(changes).reduce((result, key) => {
      result[key] = {
        upserts: Array.isArray(changes[key].upserts) ? changes[key].upserts.length : 0,
        deletes: Array.isArray(changes[key].deletes) ? changes[key].deletes.length : 0
      };
      return result;
    }, {})
  };
  sheet.appendRow([new Date().toISOString(), JSON.stringify(compactPayload)]);
  const maxRows = 10;
  const extraRows = sheet.getLastRow() - maxRows - 1;
  if (extraRows > 0) sheet.deleteRows(2, extraRows);
}

/**
 * Perawatan aman: hanya menghapus tab teknis lama yang kosong dan tidak lagi
 * digunakan kode aktif. Fungsi sengaja menolak menghapus tab yang memiliki data.
 */
function cleanupUnusedBackendArtifacts() {
  const ss = getSpreadsheet_();
  const removable = ["Sheet1", "SyncQueue"];
  const removed = [];
  const retained = [];
  removable.forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const hasOperationalData = sheet.getLastRow() > 1;
    if (hasOperationalData || ss.getSheets().length <= 1) retained.push(name);
    else {
      ss.deleteSheet(sheet);
      removed.push(name);
    }
  });
  CacheService.getScriptCache().removeAll(["MDD_REVISION"]);
  touchRevision_();
  return { ok: true, removed: removed, retainedBecauseNotEmpty: retained };
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

