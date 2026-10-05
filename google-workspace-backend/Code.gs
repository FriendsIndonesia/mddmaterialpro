const APP_NAME = "MDD Material Pro";
const OWNER_EMAIL = "friendsindonesia28@gmail.com";
const GITHUB_REPO = "https://github.com/FriendsIndonesia/mddmaterialpro";
const MINIMUM_CLIENT_VERSION = 147;
const BACKEND_BUILD_VERSION = "v175-production-reconciled";
// v152: safe legacy Hutang/Piutang payment bridge for ledger-only historical invoices.
// v147 PRODUCTION SAFETY GUARD. This build accepts writes only for the verified production environment and spreadsheet.
const V147_PRODUCTION_ONLY = true;
const V147_PRODUCTION_SPREADSHEET_ID = "1rW1DGbvGJM5jVPF1NbCgDURFStpGqbfAQtq3a8Tt1FQ";

function assertV147ProductionSafe_() {
  if (!V147_PRODUCTION_ONLY) return true;
  const props = PropertiesService.getScriptProperties();
  const environment = String(props.getProperty("SYNC_ENVIRONMENT") || "").trim().toLowerCase();
  const spreadsheetId = String(props.getProperty("SPREADSHEET_ID") || "").trim();
  if (environment !== "production") throw new Error("V147_PRODUCTION_GUARD: SYNC_ENVIRONMENT harus production.");
  if (!spreadsheetId) throw new Error("V147_PRODUCTION_GUARD: SPREADSHEET_ID production belum dikonfigurasi.");
  if (spreadsheetId !== V147_PRODUCTION_SPREADSHEET_ID) throw new Error("V147_PRODUCTION_GUARD: spreadsheet bukan production yang telah diverifikasi.");
  return true;
}

function v147ProductionPreflight() {
  const props = PropertiesService.getScriptProperties();
  const environment = String(props.getProperty("SYNC_ENVIRONMENT") || "").trim().toLowerCase();
  const spreadsheetId = String(props.getProperty("SPREADSHEET_ID") || "").trim();
  let openOk = false;
  let spreadsheetName = "";
  let openError = "";
  if (spreadsheetId === V147_PRODUCTION_SPREADSHEET_ID) {
    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      openOk = true;
      spreadsheetName = ss.getName();
    } catch (error) { openError = String(error && error.message || error); }
  }
  const result = {
    ok: environment === "production" && spreadsheetId === V147_PRODUCTION_SPREADSHEET_ID && openOk,
    build: BACKEND_BUILD_VERSION,
    minimumClientVersion: MINIMUM_CLIENT_VERSION,
    environment: environment,
    spreadsheetId: spreadsheetId,
    spreadsheetName: spreadsheetName,
    spreadsheetOpenOk: openOk,
    exactProductionSpreadsheet: spreadsheetId === V147_PRODUCTION_SPREADSHEET_ID,
    error: openError
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

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
  assertV147ProductionSafe_();
  const ss = getSpreadsheet_();
  const action = String((e && e.parameter && e.parameter.action) || "status").toLowerCase();
  const callback = e && e.parameter && e.parameter.callback;
  let payload;
  if (action === "revision") payload = { ok: true, revision: getRevision_(), minimumClientVersion: MINIMUM_CLIENT_VERSION };
  else if (action === "health") payload = { ok: true, app: APP_NAME, build: BACKEND_BUILD_VERSION, revision: getRevision_(), syncProtocol: 4, environment: PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production", minimumClientVersion: MINIMUM_CLIENT_VERSION, serverTime: new Date().toISOString() };
  // Bootstrap is intentionally small.  It is the only read required before
  // the application is usable; large business tables are loaded per-module.
  // DashboardSummary is deliberately a small, read-only endpoint.  Do not
  // route it through bootstrap: bootstrap also loads profile and module
  // metadata, which is unnecessary for a dashboard render.
  else if (action === "dashboardsummary") payload = dashboardSummaryPayload_(ss);
  // A bounded 14-day, read-only aggregate. Never serialize Sales rows to the
  // client just to paint the Owner revenue chart.
  else if (action === "revenuechart") payload = revenueChartPayload_(ss);
  else if (action === "bootstrap") payload = bootstrapPayload_(ss);
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
  assertV147ProductionSafe_();
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


// v154 terminal ACK classification.
// Only deterministic business/validation failures are terminal.
// Infrastructure/unknown failures stay retryable to protect data.
function classifyOperationFailure_(status, errorText) {
  const statusText = String(status || "").toLowerCase();
  const message = String(errorText || "").trim();
  const lower = message.toLowerCase();

  if (statusText === "acknowledged") return "acknowledged";
  if (statusText === "conflict") return "conflict";

  // Known transient infrastructure classes. These must retain the same
  // immutable operationId and be safe to retry.
  const transientPatterns = [
    "layanan spreadsheet gagal",
    "service invoked too many times",
    "service timed out",
    "timed out",
    "timeout",
    "backend sedang",
    "antrean perangkat lain",
    "try again",
    "coba lagi",
    "internal error",
    "temporary",
    "temporarily",
    "rate limit",
    "quota"
  ];
  if (transientPatterns.some(function(pattern) { return lower.indexOf(pattern) >= 0; })) return "retryable";

  // Deterministic business/schema validation. Retrying the identical command
  // cannot repair these conditions and previously caused endless retry loops.
  const permanentPatterns = [
    "validasi ",
    "referensi pembayaran tidak ditemukan",
    "tidak ditemukan:",
    "tidak valid",
    "tidak dikenal",
    "stok tidak cukup",
    "saldo tidak cukup",
    "produk tidak ditemukan",
    "invoice tidak ditemukan",
    "faktur tidak ditemukan",
    "supplier tidak ditemukan",
    "pelanggan tidak ditemukan",
    "ambiguous",
    "ambigu",
    "duplikat",
    "duplicate"
  ];
  if (permanentPatterns.some(function(pattern) { return lower.indexOf(pattern) >= 0; })) return "permanent";

  // Unknown failures are deliberately retryable. False-terminal is more
  // dangerous than a delayed sync because it can strand valid business data.
  return "retryable";
}

function operationAcknowledgement_(ss, idsCsv) {
  const ids = String(idsCsv || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);
  const receipts = operationReceiptMap_(ss, ids);
  const acknowledged = [], conflicts = [], permanent = [], retryable = [], pending = [];
  ids.forEach(function(id) {
    const receipt = receipts[id];
    if (!receipt) { pending.push(id); return; }
    const classification = classifyOperationFailure_(receipt.status, receipt.error);
    if (classification === "acknowledged") acknowledged.push(id);
    else if (classification === "conflict") conflicts.push(id);
    else if (classification === "permanent") permanent.push(id);
    else retryable.push(id);
  });
  return {
    ok: true,
    acknowledged: acknowledged,
    conflicts: conflicts,
    permanent: permanent,
    retryable: retryable,
    pending: pending,
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
  const acknowledged = [], alreadyPresent = [], conflicts = [], permanent = [], retryable = [], manualReview = [], pending = [];
  const receiptMap = operationReceiptMap_(ss, operations.map(function(op) { return String(op.operationId || ""); }));
  const tableCache = {};
  operations.slice(0, 25).forEach(function(operation) {
    const operationId = String(operation.operationId || "");
    if (!operationId) return;
    if (receiptMap[operationId]) {
      const receiptClass = classifyOperationFailure_(receiptMap[operationId].status, receiptMap[operationId].error);
      if (receiptClass === "acknowledged") { acknowledged.push(operationId); return; }
      if (receiptClass === "conflict") { conflicts.push(operationId); return; }
      if (receiptClass === "permanent") { permanent.push(operationId); return; }
      if (receiptClass === "retryable") { retryable.push(operationId); return; }
    }
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
  return { ok: true, acknowledged: acknowledged, alreadyPresent: alreadyPresent, conflicts: conflicts, permanent: permanent, retryable: retryable, manualReview: manualReview, pending: pending, revision: getRevision_() };
}

function commandReceiptSheet_(ss) {
  return ensureSheet_(ss, "CommandReceipts", ["commandId", "status", "processedAt", "deviceId", "commandType", "operationCount", "error"]);
}

function commandReceiptMap_(ss, commandIds) {
  const result = {};
  const sheet = commandReceiptSheet_(ss);
  if (sheet.getLastRow() < 2) return result;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const wanted = {};
  (commandIds || []).forEach(function(id) { if (id) wanted[String(id)] = true; });
  values.forEach(function(row) {
    const id = String(row[0] || "");
    if (wanted[id]) result[id] = { status: String(row[1] || ""), error: String(row[6] || "") };
  });
  return result;
}

// Validate every critical target in a business command before its first write.
// Sheets is not an ACID database, so this does not pretend to provide rollback;
// it prevents the common partial-commit class caused by a known bad stock or
// payment reference discovered halfway through a Sale/Purchase/Return command.
// v153: repair stale local product IDs left by historical recovery/baseline changes.
// Resolution is deliberately strict: only a missing product ID with exactly one
// production match by product code, or (fallback) normalized name, is remapped.
// This prevents creating a duplicate product while keeping ambiguous cases blocked.
function normalizeLegacyProductReferences_(ss, operations) {
    const productTable = TABLES.find(function(item) { return item.key === "products"; });
  const rows = readTableDefinition_(ss, productTable);
  const byId = {}, byCode = {};

  function norm(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  rows.forEach(function(row) {
    const id = String(row.id || "").trim();
    if (!id) return;

    byId[id] = row;

    const code = norm(row.code);
    if (code) {
      (byCode[code] || (byCode[code] = [])).push(id);
    }
  });

  const aliases = {};

  (operations || []).forEach(function(op) {
    if (
      String(op.entity || "") !== "products" ||
      String(op.type || "") !== "upsert"
    ) return;

    const incomingId = String(
      op.entityId ||
      op.payload && op.payload.row && op.payload.row.id ||
      ""
    ).trim();

    if (!incomingId || byId[incomingId]) return;

    const row = op.payload && op.payload.row || {};
    const base = op.payload && op.payload.base;
    const code = norm(row.code);

    const codeMatches = code
      ? Array.from(new Set(byCode[code] || []))
      : [];

    // v161:
    // base == null berarti benar-benar CREATE produk baru,
    // bukan edit terhadap produk lama/stale.
    if (base == null) {
      if (codeMatches.length === 0) return;

      const duplicate = new Error(
        "Kode produk baru sudah ada di production: " +
        String(row.code || "") +
        " (" +
        String(row.name || incomingId) +
        ")"
      );

      duplicate.name = "ConflictError";
      throw duplicate;
    }

    // Produk lama hanya boleh dipetakan otomatis
    // menggunakan kode produk yang EXACT dan UNIQUE.
    // Tidak ada fallback berdasarkan nama produk.
    if (codeMatches.length === 1) {
      aliases[incomingId] = codeMatches[0];
      return;
    }

    const conflict = new Error(
      "Produk lokal lama tidak dapat dipetakan aman: " +
      incomingId +
      " (" +
      String(row.name || row.code || "tanpa identitas") +
      ")"
    );

    conflict.name = "ConflictError";
    throw conflict;
  });

  function rewriteObject(obj) {
    if (!obj || typeof obj !== "object") return;

    [
      "productId",
      "sourceProductId",
      "targetProductId",
      "parentProductId",
      "childProductId"
    ].forEach(function(key) {
      const value = String(obj[key] || "").trim();

      if (aliases[value]) {
        obj[key] = aliases[value];
      }
    });

    Object.keys(obj).forEach(function(key) {
      const value = obj[key];

      if (Array.isArray(value)) {
        value.forEach(rewriteObject);
      } else if (value && typeof value === "object") {
        rewriteObject(value);
      }
    });
  }

  (operations || []).forEach(function(op) {
    const entityId = String(op.entityId || "").trim();

    if (
      String(op.entity || "") === "products" &&
      aliases[entityId]
    ) {
      op.entityId = aliases[entityId];
    }

    if (op.payload) {
      const pid = String(op.payload.productId || "").trim();

      if (aliases[pid]) {
        op.payload.productId = aliases[pid];
      }

      rewriteObject(op.payload);
    }
  });

  return aliases;
}

function validateBusinessCommand_(ss, operations) {
  const productTable = TABLES.find(function(item) { return item.key === "products"; });
  const products = {};
  readTableDefinition_(ss, productTable).forEach(function(row) { products[String(row.id || "")] = row; });
  const stockProjected = {};
  const salesIds = {};
  const purchaseIds = {};
  readTableDefinition_(ss, TABLES.find(function(item) { return item.key === "sales"; })).forEach(function(row) { salesIds[String(row.id || "")] = true; });
  readTableDefinition_(ss, TABLES.find(function(item) { return item.key === "purchases"; })).forEach(function(row) { purchaseIds[String(row.id || "")] = true; });
  // Upserts in this same command may create the invoice referenced by payment.
  (operations || []).forEach(function(operation) {
    if (String(operation.type || "") !== "upsert") return;
    const id = String(operation.entityId || operation.payload && operation.payload.row && operation.payload.row.id || "");
    if (operation.entity === "sales") salesIds[id] = true;
    if (operation.entity === "purchases") purchaseIds[id] = true;
  });
  (operations || []).forEach(function(operation) {
    const type = String(operation.type || "");
    const entity = String(operation.entity || "");
    if (!String(operation.operationId || "").trim()) throw new Error("Business command memiliki operationId kosong");
    if (type === "stock_delta") {
      const id = String(operation.payload && operation.payload.productId || operation.entityId || "").trim();
      const delta = Number(operation.payload && operation.payload.delta || 0);
      if (!id || !products[id] || !isFinite(delta)) {
        const conflict = new Error("Validasi stok gagal untuk produk: " + id);
        conflict.name = "ConflictError";
        throw conflict;
      }
      if (!Object.prototype.hasOwnProperty.call(stockProjected, id)) stockProjected[id] = Number(products[id].stock || products[id].stockAkhir || 0);
      stockProjected[id] += delta;
      if (stockProjected[id] < -0.000001) {
        const conflict = new Error("Stok tidak cukup untuk command. Produk " + id + ", proyeksi " + stockProjected[id]);
        conflict.name = "ConflictError";
        throw conflict;
      }
    } else if (type === "payment_delta") {
      const payment = operation.payload && operation.payload.payment;
      if (!payment || !String(payment.id || "").trim() || !isFinite(Number(payment.amount || 0)) || Number(payment.amount || 0) < 0) throw new Error("Payment command tidak valid");
      if (!/^DP\s/i.test(String(payment.method || ""))) {
        const isDebt = String(payment.type || "").toLowerCase() === "hutang";
        const ref = String(payment.refId || "").trim();
        if (!ref) throw new Error("Referensi pembayaran tidak ditemukan: " + ref);
        if (!(isDebt ? purchaseIds[ref] : salesIds[ref])) {
          // v152: historical Hutang/Piutang rows can exist only in the ledger and
          // therefore have synthetic HUT-/PIU- ids. Validate by the unique invoice
          // number and exact expected balance instead of rejecting them forever.
          validateLegacyLedgerPayment_(ss, isDebt ? "debt" : "receivable", payment);
        }
      }
    } else if (["upsert", "delete", "settings"].indexOf(type) < 0) {
      throw new Error("Tipe operasi command tidak dikenal: " + type);
    } else if (type !== "settings" && !TABLES.some(function(item) { return item.key === entity; })) {
      throw new Error("Entitas command tidak dikenal: " + entity);
    }
  });
  return true;
}

function processOperations_(ss, payload) {
  const configuredEnvironment = PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production";
  if (String(payload.environment || "production") !== configuredEnvironment) {
    return { ok: false, environmentMismatch: true, error: "Endpoint " + configuredEnvironment + " menolak payload " + payload.environment };
  }
  const operations = (payload.operations || []);
  const existing = operationReceiptMap_(ss, operations.map(function(operation) { return operation.operationId; }));
  const receiptSheet = operationReceiptSheet_(ss);
  const commandSheet = commandReceiptSheet_(ss);
  const acknowledged = [];
  const conflicts = [];
  const seenBatch = {};

  // Legacy operations without commandId remain compatible, but v147 commands
  // are processed as indivisible validation groups and are never split client-side.
  const groups = [];
  const groupMap = {};
  operations.forEach(function(operation) {
    const commandId = String(operation.commandId || "").trim();
    const key = commandId ? "cmd:" + commandId : "op:" + String(operation.operationId || "");
    if (!groupMap[key]) { groupMap[key] = { commandId: commandId, operations: [] }; groups.push(groupMap[key]); }
    groupMap[key].operations.push(operation);
  });
  const commandExisting = commandReceiptMap_(ss, groups.map(function(group) { return group.commandId; }).filter(Boolean));

  groups.forEach(function(group) {
    const commandId = group.commandId;
    const groupOps = group.operations;
    if (commandId && commandExisting[commandId] && commandExisting[commandId].status === "acknowledged") {
      groupOps.forEach(function(op) { if (op.operationId) acknowledged.push(String(op.operationId)); });
      return;
    }
    let groupStatus = "acknowledged";
    let groupError = "";
    try {
      if (commandId) {
        const remainingOps = groupOps.filter(function(op) {
          const receipt = existing[String(op.operationId || "")];
          return !(receipt && receipt.status === "acknowledged");
        });
        normalizeLegacyProductReferences_(ss, remainingOps);
        validateBusinessCommand_(ss, remainingOps);
      }
      groupOps.forEach(function(operation) {
        const operationId = String(operation.operationId || "").trim();
        if (!operationId) return;
        if (seenBatch[operationId]) return;
        if (existing[operationId] && existing[operationId].status === "acknowledged") {
          acknowledged.push(operationId); seenBatch[operationId] = "acknowledged"; return;
        }
        if (existing[operationId]) {
          const existingClass = classifyOperationFailure_(existing[operationId].status, existing[operationId].error);
          if (existingClass === "conflict" || existingClass === "permanent") {
            const conflict = new Error(existing[operationId].error || "Operasi sebelumnya terminal");
            conflict.name = "ConflictError";
            throw conflict;
          }
        }
        applyOperation_(ss, operation);
        syncLedgerForOperation_(ss, operation);
        appendChangeLog_(ss, operation);
        receiptSheet.appendRow([operationId, "acknowledged", new Date(), payload.deviceId || operation.deviceId || "", operation.entity || "", operation.entityId || "", ""]);
        CacheService.getScriptCache().put("OP_" + operationId.slice(-64), JSON.stringify({ status: "acknowledged", error: "" }), 21600);
        acknowledged.push(operationId);
        seenBatch[operationId] = "acknowledged";
      });
    } catch (operationError) {
      groupError = String(operationError && operationError.message ? operationError.message : operationError);
      if (String(operationError && operationError.name || "") === "ConflictError") groupStatus = "conflict";
      else groupStatus = classifyOperationFailure_("failed", groupError) === "permanent" ? "permanent" : "retryable";
      groupOps.forEach(function(operation) {
        const operationId = String(operation.operationId || "").trim();
        if (!operationId || seenBatch[operationId] === "acknowledged") return;
        receiptSheet.appendRow([operationId, groupStatus, new Date(), payload.deviceId || operation.deviceId || "", operation.entity || "", operation.entityId || "", groupError]);
        CacheService.getScriptCache().put("OP_" + operationId.slice(-64), JSON.stringify({ status: groupStatus, error: groupError }), 21600);
        if (groupStatus === "conflict") conflicts.push(operationId);
        seenBatch[operationId] = groupStatus;
      });
    }
    if (commandId) commandSheet.appendRow([commandId, groupStatus, new Date(), payload.deviceId || groupOps[0] && groupOps[0].deviceId || "", groupOps[0] && groupOps[0].commandType || "", groupOps.length, groupError]);
  });
  trimTechnicalSheet_(receiptSheet, 100000);
  trimTechnicalSheet_(commandSheet, 50000);
  const revision = touchRevision_();
  const finalReceipts = operationReceiptMap_(ss, operations.map(function(operation) { return operation.operationId; }));
  const permanent = [], retryable = [];
  operations.forEach(function(operation) {
    const id = String(operation.operationId || "");
    const receipt = finalReceipts[id];
    if (!id || !receipt) return;
    const classification = classifyOperationFailure_(receipt.status, receipt.error);
    if (classification === "permanent") permanent.push(id);
    else if (classification === "retryable") retryable.push(id);
  });
  return { ok: true, acknowledged: acknowledged, conflicts: conflicts, permanent: permanent, retryable: retryable, revision: revision };
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

function stockEffectJournalSheet_(ss) {
  return ensureSheet_(ss, "StockEffectJournal", ["operationId", "status", "preparedAt", "productId", "baseStock", "targetStock", "baseStockIn", "targetStockIn", "baseStockOut", "targetStockOut", "error"]);
}

function latestStockEffect_(ss, operationId) {
  const sheet = stockEffectJournalSheet_(ss);
  if (sheet.getLastRow() < 2) return null;
  const matches = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(operationId)).matchEntireCell(true).findAll();
  if (!matches.length) return null;
  const row = sheet.getRange(matches[matches.length - 1].getRow(), 1, 1, 11).getValues()[0];
  return { status: String(row[1] || ""), productId: String(row[3] || ""), baseStock: Number(row[4] || 0), targetStock: Number(row[5] || 0), baseStockIn: Number(row[6] || 0), targetStockIn: Number(row[7] || 0), baseStockOut: Number(row[8] || 0), targetStockOut: Number(row[9] || 0), error: String(row[10] || "") };
}

function applyStockDelta_(ss, operation) {
  const id = String(operation.payload && operation.payload.productId || operation.entityId || "").trim();
  const delta = Number(operation.payload && operation.payload.delta || 0);
  if (!id || !isFinite(delta)) throw new Error("Stock delta tidak valid");
  const table = TABLES.find((item) => item.key === "products");
  const sheet = ensureSheet_(ss, table.sheet, table.fields);
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
  const operationId = String(operation.operationId || "");
  const journal = latestStockEffect_(ss, operationId);
  const currentIn = Number(sheet.getRange(rowNumber, stockInColumn).getValue() || 0);
  const currentOut = Number(sheet.getRange(rowNumber, stockOutColumn).getValue() || 0);
  let base = current;
  let target = current + delta;
  let baseIn = currentIn, targetIn = currentIn + (delta > 0 ? delta : 0);
  let baseOut = currentOut, targetOut = currentOut + (delta < 0 ? Math.abs(delta) : 0);

  if (journal) {
    base = Number(journal.baseStock || 0);
    target = Number(journal.targetStock || 0);
    baseIn = Number(journal.baseStockIn || 0); targetIn = Number(journal.targetStockIn || 0);
    baseOut = Number(journal.baseStockOut || 0); targetOut = Number(journal.targetStockOut || 0);
    if (journal.status === "applied") return;
    // Crash-safe recovery: a prepared effect may have reached the product row
    // before its operation receipt was written. Never apply the delta twice.
    if (Math.abs(current - target) <= 0.000001) {
      sheet.getRange(rowNumber, stockInColumn).setValue(targetIn);
      sheet.getRange(rowNumber, stockOutColumn).setValue(targetOut);
      stockEffectJournalSheet_(ss).appendRow([operationId, "applied", new Date(), id, base, target, baseIn, targetIn, baseOut, targetOut, "recovered-after-unknown-ack"]);
      return;
    }
    if (Math.abs(current - base) > 0.000001) {
      const ambiguous = new Error("Stock effect tidak dapat direkonsiliasi aman. Produk " + id + ", base " + base + ", target " + target + ", current " + current);
      ambiguous.name = "ConflictError";
      throw ambiguous;
    }
  } else {
    if (target < -0.000001) {
      const conflict = new Error("Stok tidak cukup. Stok terbaru " + current + ", delta " + delta);
      conflict.name = "ConflictError";
      throw conflict;
    }
    stockEffectJournalSheet_(ss).appendRow([operationId, "prepared", new Date(), id, base, target, baseIn, targetIn, baseOut, targetOut, ""]);
  }

  sheet.getRange(rowNumber, stockColumn).setValue(Math.max(0, target));
  sheet.getRange(rowNumber, stockAkhirColumn).setValue(Math.max(0, target));
  sheet.getRange(rowNumber, stockInColumn).setValue(targetIn);
  sheet.getRange(rowNumber, stockOutColumn).setValue(targetOut);
  stockEffectJournalSheet_(ss).appendRow([operationId, "applied", new Date(), id, base, target, baseIn, targetIn, baseOut, targetOut, ""]);
}

function legacyLedgerPaymentTarget_(ss, kind, payment) {
  const sheetName = kind === "debt" ? "Hutang" : "Piutang";
  const sheet = ss.getSheetByName(sheetName);
  const invoiceNo = String(payment && payment.invoiceNo || "").trim();
  if (!sheet || sheet.getLastRow() < 2 || !invoiceNo) {
    const error = new Error("Referensi pembayaran legacy tidak ditemukan: " + invoiceNo);
    error.name = "ConflictError";
    throw error;
  }
  const invoices = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getDisplayValues();
  const matches = [];
  invoices.forEach(function(row, index) {
    if (String(row[0] || "").trim().toLowerCase() === invoiceNo.toLowerCase()) matches.push(index + 2);
  });
  if (matches.length !== 1) {
    const error = new Error("Referensi pembayaran legacy ambigu/tidak unik: " + invoiceNo);
    error.name = "ConflictError";
    throw error;
  }
  const rowNumber = matches[0];
  const values = sheet.getRange(rowNumber, 1, 1, Math.max(9, sheet.getLastColumn())).getValues()[0];
  return {
    sheet: sheet,
    rowNumber: rowNumber,
    currentPaid: numeric_(values[5]),
    currentDue: numeric_(values[7])
  };
}

function validateLegacyLedgerPayment_(ss, kind, payment) {
  const target = legacyLedgerPaymentTarget_(ss, kind, payment);
  const amount = Number(payment && payment.amount || 0);
  const remaining = Number(payment && payment.remaining);
  if (!isFinite(amount) || amount < 0 || !isFinite(remaining) || remaining < -0.000001) {
    const error = new Error("Saldo pembayaran legacy tidak valid");
    error.name = "ConflictError";
    throw error;
  }
  const paymentTable = TABLES.find(function(item) { return item.key === "payments"; });
  const existingPayment = readTableDefinition_(ss, paymentTable).find(function(row) { return String(row.id || "") === String(payment.id || ""); });
  const expectedBefore = remaining + amount;
  const same = function(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.000001; };
  // Fresh application: ledger still has exactly the balance the client saw.
  if (same(target.currentDue, expectedBefore)) return true;
  // Idempotent retry: only the SAME stable payment ID may prove that the target
  // balance was already committed. A different payment ID is never auto-accepted.
  if (existingPayment && same(target.currentDue, remaining)) return true;
  const error = new Error("Saldo ledger berubah; pembayaran legacy perlu diperiksa. Faktur " + String(payment.invoiceNo || ""));
  error.name = "ConflictError";
  throw error;
}

function paymentIntegrityJournalSheet_(ss) {
  return ensureSheet_(ss, "PaymentIntegrityJournal", [
    "intentId", "status", "preparedAt", "committedAt", "operationId", "commandId",
    "paymentId", "refId", "invoiceNo", "paymentType", "amount",
    "baselinePaid", "baselineDue", "serverPaidBefore", "serverDueBefore",
    "serverPaidAfter", "serverDueAfter", "receiptId", "error"
  ]);
}

function paymentIntentRecord_(ss, intentId) {
  const id = String(intentId || "").trim();
  if (!id) return null;
  const sheet = paymentIntegrityJournalSheet_(ss);
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (String(values[i][0] || "").trim() === id) return { rowNumber: i + 2, values: values[i], sheet: sheet };
  }
  return null;
}

function paymentIntegrityConflict_(message) {
  const error = new Error(message);
  error.name = "ConflictError";
  return error;
}

// v175: payment.id is the business-level idempotency key. Validate its
// immutable business identity without bypassing PREPARED journal recovery.
function assertPaymentIdentity_(existingPayment, payment) {
  if (!existingPayment) return;
  const amount = Number(payment.amount);
  const sameBusinessPayment =
    String(existingPayment.refId || "").trim() === String(payment.refId || "").trim() &&
    String(existingPayment.type || "").trim().toLowerCase() === String(payment.type || "").trim().toLowerCase() &&
    isFinite(amount) && Math.abs(Number(existingPayment.amount) - amount) < 0.000001;
  if (!sameBusinessPayment) throw paymentIntegrityConflict_("PAYMENT_ID_REUSE_CONFLICT: Payment ID sudah ada dengan isi berbeda: " + payment.id);
}

// A client may rebuild the same Payment under another intent/operation ID.
// Recover its ORIGINAL journal before treating the Payment row as committed.
function paymentJournalByPaymentId_(ss, paymentId) {
  const sheet = ss.getSheetByName("PaymentIntegrityJournal");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (String(values[i][6] || "").trim() === String(paymentId || "").trim()) {
      return { rowNumber: i + 2, values: values[i], sheet: sheet };
    }
  }
  return null;
}


function markPaymentJournal_(record, status, errorText) {
  record.sheet.getRange(record.rowNumber, 2).setValue(status);
  if (status === "COMMITTED" || status === "ACKNOWLEDGED") {
    record.sheet.getRange(record.rowNumber, 4).setValue(new Date());
  }
  if (errorText != null) record.sheet.getRange(record.rowNumber, 19).setValue(String(errorText || ""));
}

function recoverPreparedPaymentIntent_(ss, record, operation, payment, ctx) {
  const v = record.values;
  const same = ctx.same;
  const paymentTable = TABLES.find((item) => item.key === "payments");
  const expectedPaymentId = String(v[6] || "");
  const expectedRefId = String(v[7] || "");
  const expectedAmount = Number(v[10] || 0);
  const beforePaid = Number(v[13] || 0);
  const beforeDue = Number(v[14] || 0);
  const afterPaid = Number(v[15] || 0);
  const afterDue = Number(v[16] || 0);

  if (expectedPaymentId !== String(payment.id || "") ||
      expectedRefId !== String(payment.refId || "") ||
      !same(expectedAmount, Number(payment.amount || 0))) {
    markPaymentJournal_(record, "MANUAL_REVIEW", "RECOVERY_IDENTITY_CONFLICT");
    throw paymentIntegrityConflict_("PAYMENT_RECOVERY_MANUAL_REVIEW: identitas intent tidak cocok");
  }

  const paymentExists = !!ctx.existingPayment;
  const ledgerAtBefore = same(ctx.serverPaid, beforePaid) && same(ctx.serverDue, beforeDue);
  const ledgerAtAfter = same(ctx.serverPaid, afterPaid) && same(ctx.serverDue, afterDue);

  // Crash before Payment row: nothing financial was applied. Safe to resume the
  // exact prepared intent by writing the original Payment and authoritative target.
  if (!paymentExists && ledgerAtBefore) {
    try {
      applyTableChanges_(ss, paymentTable, { upserts: [payment], deletes: [] });
      ctx.sheet.getRange(ctx.rowNumber, ctx.paidColumn).setValue(afterPaid);
      ctx.sheet.getRange(ctx.rowNumber, ctx.dueColumn).setValue(afterDue);
      markPaymentJournal_(record, "COMMITTED", "RECOVERED_FROM_PREPARED_BEFORE_PAYMENT");
      return;
    } catch (error) {
      markPaymentJournal_(record, "PREPARED", "RECOVERY_RESUME_FAILED: " + String(error && error.message || error));
      throw error;
    }
  }

  // Crash after Payment row but before ledger projection: Payment is already
  // durable, so only finish the authoritative ledger projection. Never add Payment again.
  if (paymentExists && ledgerAtBefore) {
    try {
      ctx.sheet.getRange(ctx.rowNumber, ctx.paidColumn).setValue(afterPaid);
      ctx.sheet.getRange(ctx.rowNumber, ctx.dueColumn).setValue(afterDue);
      markPaymentJournal_(record, "COMMITTED", "RECOVERED_PAYMENT_EXISTS_LEDGER_BEFORE");
      return;
    } catch (error) {
      markPaymentJournal_(record, "PREPARED", "RECOVERY_LEDGER_FAILED: " + String(error && error.message || error));
      throw error;
    }
  }

  // Crash after both durable writes but before journal COMMITTED.
  if (paymentExists && ledgerAtAfter) {
    markPaymentJournal_(record, "COMMITTED", "RECOVERED_WRITES_COMPLETE");
    return;
  }

  // Ledger at target without the matching Payment row is not safe to invent or
  // reverse automatically. Any third state can also indicate unrelated edits.
  markPaymentJournal_(record, "MANUAL_REVIEW",
    "RECOVERY_AMBIGUOUS paymentExists=" + paymentExists +
    " serverPaid=" + ctx.serverPaid + " serverDue=" + ctx.serverDue);
  throw paymentIntegrityConflict_("PAYMENT_RECOVERY_MANUAL_REVIEW: kondisi journal/payment/ledger ambigu");
}

function applyPaymentDelta_(ss, operation) {
  const payload = operation.payload || {};
  const payment = payload.payment;
  if (!payment || !String(payment.id || "").trim()) throw new Error("Payment delta tidak valid");
  const paymentTable = TABLES.find((item) => item.key === "payments");
  const existingPayment = readTableDefinition_(ss, paymentTable).find(function(row) { return String(row.id || "").trim() === String(payment.id || "").trim(); });
  assertPaymentIdentity_(existingPayment, payment);
  if (!existingPayment && (!isFinite(Number(payment.amount)) || Number(payment.amount) <= 0)) {
    throw paymentIntegrityConflict_("PAYMENT_AMOUNT_INVALID");
  }

  // DP records are historical/non-ledger payment projections. Preserve the
  // existing behavior; Payment Integrity Guard protects Hutang/Piutang effects.
  if (/^DP\s/i.test(String(payment.method || ""))) {
    if (!existingPayment) applyTableChanges_(ss, paymentTable, { upserts: [payment], deletes: [] });
    return;
  }

  const isDebt = String(payment.type || "").toLowerCase() === "hutang";
  const targetTable = TABLES.find((item) => item.key === (isDebt ? "purchases" : "sales"));
  const sheet = ensureSheet_(ss, targetTable.sheet, targetTable.fields);
  const idColumn = targetTable.fields.indexOf("id") + 1;
  const ids = sheet.getLastRow() > 1 ? sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getDisplayValues() : [];
  const index = ids.findIndex((row) => String(row[0] || "").trim() === String(payment.refId || "").trim());

  // Historical synthetic HUT-/PIU- records remain on the stricter legacy gate.
  if (index < 0) {
    validateLegacyLedgerPayment_(ss, isDebt ? "debt" : "receivable", payment);
    const ledger = legacyLedgerPaymentTarget_(ss, isDebt ? "debt" : "receivable", payment);
    const amount = Number(payment.amount || 0);
    const remaining = Number(payment.remaining || 0);
    const same = function(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.000001; };
    if (!existingPayment) applyTableChanges_(ss, paymentTable, { upserts: [payment], deletes: [] });
    if (existingPayment && same(ledger.currentDue, remaining)) return;
    ledger.sheet.getRange(ledger.rowNumber, 6).setValue(ledger.currentPaid + amount);
    ledger.sheet.getRange(ledger.rowNumber, 8).setValue(Math.max(0, remaining));
    return;
  }

  const rowNumber = index + 2;
  const paidColumn = targetTable.fields.indexOf("paid") + 1;
  const dueColumn = targetTable.fields.indexOf("due") + 1;
  const serverPaid = Number(sheet.getRange(rowNumber, paidColumn).getValue() || 0);
  const serverDue = Number(sheet.getRange(rowNumber, dueColumn).getValue() || 0);
  const amount = Number(payment.amount || 0);
  const intentId = String(payload.intentId || payment.intentId || "").trim();
  const baseline = payload.baseline || {};
  const baselinePaid = Number(baseline.paid != null ? baseline.paid : payment.baselinePaid);
  const baselineDue = Number(baseline.due != null ? baseline.due : payment.baselineDue);
  const same = function(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.000001; };

  // Backwards compatibility: old queued v172 operations can still be retried by
  // stable Payment ID, but new v173 operations must carry a durable business intent.
  const isV173 = !!intentId;
  const originalJournal = paymentJournalByPaymentId_(ss, payment.id);
  if (!isV173 && !originalJournal) {
    if (existingPayment) return;
    throw paymentIntegrityConflict_("PAYMENT_INTENT_REQUIRED: pembayaran baru harus dikirim ulang dari aplikasi v173");
  }

  const priorIntent = paymentIntentRecord_(ss, intentId) || originalJournal;
  if (priorIntent) {
    const status = String(priorIntent.values[1] || "");
    const priorPaymentId = String(priorIntent.values[6] || "");
    const priorRefId = String(priorIntent.values[7] || "");
    const priorAmount = Number(priorIntent.values[10] || 0);
    const priorType = String(priorIntent.values[9] || "").trim().toLowerCase();
    if (priorPaymentId !== String(payment.id || "") || priorRefId !== String(payment.refId || "") || priorType !== String(payment.type || "").trim().toLowerCase() || !same(priorAmount, amount)) {
      throw paymentIntegrityConflict_("PAYMENT_INTENT_REUSE_CONFLICT: intent sudah terikat pada pembayaran lain");
    }
    if (status === "COMMITTED" || status === "ACKNOWLEDGED") return;
    if (status === "PREPARED") {
      return recoverPreparedPaymentIntent_(ss, priorIntent, operation, payment, {
        sheet: sheet,
        rowNumber: rowNumber,
        paidColumn: paidColumn,
        dueColumn: dueColumn,
        serverPaid: serverPaid,
        serverDue: serverDue,
        existingPayment: existingPayment,
        same: same
      });
    }
    throw paymentIntegrityConflict_("PAYMENT_INTENT_INCOMPLETE: status intent tidak dapat dipulihkan otomatis");
  }

  if (existingPayment) return; // stable Payment ID retry
  if (!isFinite(amount) || amount <= 0) throw paymentIntegrityConflict_("PAYMENT_AMOUNT_INVALID");
  if (!isFinite(baselinePaid) || !isFinite(baselineDue)) throw paymentIntegrityConflict_("PAYMENT_BASELINE_REQUIRED");
  if (serverDue <= 0.000001) throw paymentIntegrityConflict_("INVOICE_ALREADY_PAID");
  if (!same(serverPaid, baselinePaid) || !same(serverDue, baselineDue)) {
    throw paymentIntegrityConflict_("STALE_PAYMENT: saldo server berubah sejak form pembayaran dibuka");
  }
  if (amount > serverDue + 0.000001) throw paymentIntegrityConflict_("OVERPAYMENT: nominal melebihi sisa tagihan server");

  const newPaid = serverPaid + amount;
  const newDue = Math.max(0, serverDue - amount);
  const receiptId = "PAYREC-" + Utilities.getUuid();
  const journal = paymentIntegrityJournalSheet_(ss);
  const preparedAt = new Date();
  journal.appendRow([
    intentId, "PREPARED", preparedAt, "", String(operation.operationId || ""), String(operation.commandId || ""),
    String(payment.id || ""), String(payment.refId || ""), String(payment.invoiceNo || ""), String(payment.type || ""), amount,
    baselinePaid, baselineDue, serverPaid, serverDue, newPaid, newDue, receiptId, ""
  ]);
  const journalRow = journal.getLastRow();

  try {
    // Payment row first, then authoritative ledger projection. A PREPARED journal
    // makes an interrupted commit visible instead of silently replaying money.
    applyTableChanges_(ss, paymentTable, { upserts: [payment], deletes: [] });
    sheet.getRange(rowNumber, paidColumn).setValue(newPaid);
    sheet.getRange(rowNumber, dueColumn).setValue(newDue);
    journal.getRange(journalRow, 2).setValue("COMMITTED");
    journal.getRange(journalRow, 4).setValue(new Date());
    return;
  } catch (error) {
    journal.getRange(journalRow, 19).setValue(String(error && error.message || error));
    throw error;
  }
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
  // Dashboard aggregates are revision-bound.  A successful business write
  // invalidates only this short-lived server cache; no client or business
  // storage is changed here.
  CacheService.getScriptCache().remove("MDD_DASHBOARD_SUMMARY_V144");
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

// Read a projection without using readTable_().  The generic table reader can
// normalize missing row IDs, which is correct for data maintenance but not for
// a GET endpoint.  Dashboard reads must never mutate Spreadsheet rows.
function readSummaryRows_(ss, sheetName, fields) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const indexes = fields.reduce(function(result, field) {
    result[field] = headers.indexOf(field);
    return result;
  }, {});
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.map(function(row) {
    return fields.reduce(function(item, field) {
      const index = indexes[field];
      item[field] = index >= 0 ? row[index] : "";
      return item;
    }, {});
  });
}

function dashboardSummaryFast_(ss) {
  const today = todayWib_(ss);
  const products = readSummaryRows_(ss, "Products", ["id", "code", "name", "unit", "buy", "stock", "stockAkhir", "min", "active"]);
  const sales = readSummaryRows_(ss, "Sales", ["date", "items", "total", "due"]);
  const purchases = readSummaryRows_(ss, "Purchases", ["date", "total", "due"]);
  const payments = readSummaryRows_(ss, "Payments", ["date", "type", "category", "amount"]);
  const cashAccounts = readSummaryRows_(ss, "CashAccounts", ["balance"]);
  const cashTx = readSummaryRows_(ss, "CashTransactions", ["date", "type", "category", "amount"]);
  const stockMoves = readSummaryRows_(ss, "StockMoves", ["type", "difference", "qty"]);
  const pendingSales = readSummaryRows_(ss, "PendingSales", ["id"]);
  const active = products.filter(function(row) { return row.active !== false && String(row.active || "").toLowerCase() !== "false"; });
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
    date: today, totalProducts: active.length, productsSoldToday: soldQuantity,
    salesInvoiceToday: todaySales.length, salesToday: sum(todaySales, "total"), purchasesToday: sum(todayPurchases, "total"),
    receivablePaymentsToday: sum(paymentToday.filter(function(row) { return isPayment(row, "piutang"); }), "amount"),
    debtPaymentsToday: sum(paymentToday.filter(function(row) { return isPayment(row, "hutang"); }), "amount"),
    cashBalance: cashBalance, stockValue: stockValue, lowStockCount: low.length,
    receivable: receivable, payable: payable,
    receivablePaymentsTotal: sum(payments.filter(function(row) { return isPayment(row, "piutang"); }), "amount"),
    debtPaymentsTotal: sum(payments.filter(function(row) { return isPayment(row, "hutang"); }), "amount"),
    pettyCashToday: pettyCash,
    stockDifference: stockMoves.filter(function(row) { return ["Opname", "Penyesuaian"].indexOf(row.type) >= 0; }).reduce(function(total, row) { return total + numeric_(row.difference || row.qty); }, 0),
    netAssetValue: cashBalance + stockValue + receivable - payable,
    pendingSalesCount: pendingSales.length,
    lowStockPreview: low.slice(0, 20).map(function(row) { return { id: row.id, code: row.code, name: row.name, unit: row.unit, stock: stockOf(row), min: numeric_(row.min) }; })
  };
}

function dashboardSummaryPayload_(ss) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "MDD_DASHBOARD_SUMMARY_V144";
  let summary = null;
  try { summary = JSON.parse(cache.get(cacheKey) || "null"); } catch (error) { summary = null; }
  if (!summary) {
    summary = dashboardSummaryFast_(ss);
    // This cache is intentionally brief. touchRevision_ clears it after any
    // committed application or spreadsheet edit, so dashboard values cannot
    // outlive a production revision.
    cache.put(cacheKey, JSON.stringify(summary), 30);
  }
  return {
    ok: true, app: APP_NAME,
    environment: PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production",
    syncProtocol: 4, minimumClientVersion: MINIMUM_CLIENT_VERSION,
    revision: getRevision_(), spreadsheetId: ss.getId(), serverTime: new Date().toISOString(),
    data: { summary: summary, lastUpdated: new Date().toISOString() }
  };
}

function revenueChartPayload_(ss) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "MDD_REVENUE_CHART_V146";
  let rows = null;
  try { rows = JSON.parse(cache.get(cacheKey) || "null"); } catch (error) { rows = null; }
  if (!Array.isArray(rows)) {
    const today = todayWib_(ss);
    const anchor = new Date(today + "T00:00:00Z");
    const dates = Array.from({ length: 14 }, function(_, index) {
      const day = new Date(anchor.getTime());
      day.setUTCDate(day.getUTCDate() - (13 - index));
      return Utilities.formatDate(day, "UTC", "yyyy-MM-dd");
    });
    const revenues = dates.reduce(function(result, date) { result[date] = { date: date, transactionCount: 0, revenue: 0 }; return result; }, {});
    // Only Date and Total are read. This is a server-side aggregation, not a
    // Sales-module download and it has no write side effects.
    readSummaryRows_(ss, "Sales", ["date", "total"]).forEach(function(sale) {
      const date = dateKeyWib_(sale.date, ss);
      if (!revenues[date]) return;
      revenues[date].transactionCount += 1;
      revenues[date].revenue += numeric_(sale.total);
    });
    rows = dates.map(function(date) { return revenues[date]; });
    cache.put(cacheKey, JSON.stringify(rows), 30);
  }
  return {
    ok: true, app: APP_NAME,
    environment: PropertiesService.getScriptProperties().getProperty("SYNC_ENVIRONMENT") || "production",
    syncProtocol: 4, minimumClientVersion: MINIMUM_CLIENT_VERSION,
    revision: getRevision_(), spreadsheetId: ss.getId(), serverTime: new Date().toISOString(),
    data: { rows: rows, lastUpdated: new Date().toISOString() }
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

function v161RunNewProductResolverTest() {
  const ss = SpreadsheetApp.openById(V147_PRODUCTION_SPREADSHEET_ID);

  const uniqueCode = "V161-TEST-" + new Date().getTime();

  // TEST 1:
  // Produk yang benar-benar baru harus diizinkan.
  const createOp = [{
    operationId: "V161-CREATE-TEST",
    type: "upsert",
    entity: "products",
    entityId: "PRD-V161-TEST",
    payload: {
      row: {
        id: "PRD-V161-TEST",
        code: uniqueCode,
        name: "V161 Resolver Test"
      },
      base: null
    }
  }];

  normalizeLegacyProductReferences_(ss, createOp);

  if (createOp[0].entityId !== "PRD-V161-TEST") {
    throw new Error(
      "FAIL: genuine CREATE was unexpectedly remapped"
    );
  }

  // TEST 2:
  // ID produk lama yang hilang dan tidak dapat dibuktikan
  // harus tetap diblokir.
  let staleBlocked = false;

  try {
    normalizeLegacyProductReferences_(ss, [{
      operationId: "V161-STALE-TEST",
      type: "upsert",
      entity: "products",
      entityId: "PRD-MISSING-V161",
      payload: {
        row: {
          id: "PRD-MISSING-V161",
          code: uniqueCode + "-MISSING",
          name: "Missing stale product"
        },
        base: {
          id: "PRD-MISSING-V161"
        }
      }
    }]);
  } catch (error) {
    staleBlocked =
      error &&
      error.name === "ConflictError";
  }

  if (!staleBlocked) {
    throw new Error(
      "FAIL: unsafe stale edit was not blocked"
    );
  }

  return {
    ok: true,
    createAllowed: true,
    unsafeStaleBlocked: true,
    writesPerformed: 0
  };
}
