"use strict";
const assert = require("assert");
const fs = require("fs");
const Sync = require("./sync-v2.js");

const keys = ["products", "customers", "suppliers", "employees", "categories", "discounts", "cashAccounts", "packages", "sales", "purchases", "cashTx", "payments", "stockMoves", "returns", "pendingSales", "pendingPurchases", "history"];
const products = Array.from({ length: 2699 }, (_, index) => ({ id: `P-${index + 1}`, active: true }));
const data = Object.fromEntries(keys.map((key) => [key, key === "products" ? products : []]));
const valid = { ok: true, spreadsheetId: "PROD", data };

assert.equal(Sync.validateProductionBaseline(valid, 2699, keys, "PROD").ok, true, "snapshot valid harus lulus");
assert.equal(Sync.validateProductionBaseline({ ...valid, data: { ...data, products: products.slice(1) } }, 2699, keys, "PROD").ok, false, "Products tidak lengkap harus abort");
assert.equal(Sync.validateProductionBaseline({ ...valid, data: { ...data, sales: undefined } }, 2699, keys, "PROD").ok, false, "business table hilang harus abort");
assert.equal(Sync.validateProductionBaseline(valid, 2699, keys, "STAGING").ok, false, "spreadsheet salah harus abort");

const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");
const worker = fs.readFileSync(__dirname + "/service-worker.js", "utf8");
assert.match(html, /const APP_VERSION = 121/);
assert.match(html, /FORCE_PRODUCTION_BASELINE_V121/);
assert.match(html, /syncOutbox\.list\(\["pending", "sending", "failed"\], 1\)/, "pending harus menghentikan migration");
assert.match(html, /validateProductionBaseline\(snapshot, PRODUCTION_PRODUCT_COUNT/);
assert.ok(html.indexOf("localStorage.setItem(STORAGE_KEY") < html.indexOf("deleteByOperationIds"), "legacy outbox hanya dibersihkan setelah cache ditulis");
assert.ok(html.indexOf("storedValidation") < html.indexOf("deleteByOperationIds"), "legacy outbox hanya dibersihkan setelah cache diverifikasi");
assert.match(html, /deleteByOperationIds\(legacyRows\.map/);
assert.match(html, /baselineInProgress = true/);
assert.match(html, /if \(baselineInProgress\) return Promise\.resolve\(\[\]\)/, "capture operasi harus dibekukan saat baseline");
assert.match(html, /if \(baselineInProgress \|\| isSyncing/, "sync rutin harus dibekukan saat baseline");
assert.match(html, /Object\.assign\(state, previousState\)/, "state lama harus dipulihkan bila baseline gagal");
assert.match(html, /INITIALIZING • mengunduh database production/, "status hijau dilarang sebelum baseline terverifikasi");
assert.match(html, /scheduleProductionBaselineRetry/, "bootstrap gagal harus retry otomatis");
assert.doesNotMatch(html, /indexedDB\.deleteDatabase|localStorage\.clear\(/);
assert.match(html, /if \(\(await syncOutbox\.getMeta\("baselineVersion"\)\) === FORCE_PRODUCTION_BASELINE\) return false;/, "second run harus idempoten");
assert.match(html, /captureOperations\(action\)/, "operasi baru tetap masuk outbox");
assert.match(worker, /mdd-material-pro-v121-verified-bootstrap/);
assert.doesNotMatch(worker, /indexedDB\.deleteDatabase|localStorage\.clear/);
console.log("production-baseline-v121: verified bootstrap safety gates passed");
