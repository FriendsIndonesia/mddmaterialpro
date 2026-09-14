const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");
const body = html.match(/function syncChangesConfirmed\(remoteData, changes\) \{([\s\S]*?)\n      \}\n\n      async function syncRequestId/);
assert.ok(body, "fungsi verifikasi transaksi ditemukan");
const confirm = new Function("rowIdentity", "remoteData", "changes", `return (function syncChangesConfirmed(remoteData, changes) {${body[1]}\n})(remoteData, changes);`).bind(null, (_key, row) => String(row?.id || ""));
const changes = { tables: { sales: { upserts: [{ id: "SAL-1" }], deletes: ["SAL-OLD"] }, purchases: { upserts: [{ id: "PUR-1" }], deletes: [] } } };
assert.strictEqual(confirm({ sales: [{ id: "SAL-1" }], purchases: [{ id: "PUR-1" }] }, changes), true);
assert.strictEqual(confirm({ sales: [{ id: "SAL-1" }], purchases: [] }, changes), false, "pembelian yang tidak tersimpan tidak boleh dianggap sukses");
assert.strictEqual(confirm({ sales: [{ id: "SAL-1" }], purchases: [{ id: "PUR-1" }, { id: "SAL-OLD" }] }, changes), true);
assert.strictEqual(confirm({ sales: [{ id: "SAL-1" }, { id: "SAL-OLD" }], purchases: [{ id: "PUR-1" }] }, changes), false, "penghapusan yang belum diterapkan tidak boleh dianggap sukses");
assert.strictEqual(confirm({ sales: [{ id: "SAL-1" }] }, changes), false, "scope yang gagal dibaca tidak boleh dianggap sukses");

assert.match(html, /responses\.some\(\(response\) => !response\?\.ok \|\| !response\.data\)\) return/);
assert.match(html, /if \(!syncChangesConfirmed\(readbackData, changes\)\) throw/);
assert.match(html, /if \(activeView === "reportsView"\) \{ renderAll\(\); return; \}/);
assert.match(html, /const stockValue = activeProducts\.reduce/);
assert.match(html, /Owner, Kasir, dan Gudang menggunakan sumber transaksi yang sama/);

console.log("report-consistency.test.js: verifikasi transaksi, revisi backend, periode, dan peran lulus");
