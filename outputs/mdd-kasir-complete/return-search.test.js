const fs = require("node:fs");
const assert = require("node:assert/strict");

const html = fs.readFileSync(require("node:path").join(__dirname, "matrialpro.html"), "utf8");
const start = html.indexOf("function openReturnModal(module)");
const end = html.indexOf("function openAccessCodeModal()", start);
const source = html.slice(start, end);

assert.ok(start > 0 && end > start, "Fungsi retur harus tersedia");
assert.match(source, /id="returnDocumentSearch"[^>]*value=""/, "Pencarian faktur harus kosong saat form dibuka");
assert.match(source, /doc\.invoiceNo, doc\.id, partyName\(doc\)/, "Pencarian harus memakai faktur, ID, dan nama relasi");
assert.match(source, /itemSelect\.value = String\(firstEligible\.index\)/, "Produk pertama harus terpilih sesudah transaksi dipilih");
assert.match(source, /qtyInput\.value = item \? remainingQty\(doc, item\)/, "Qty harus terisi dari sisa yang dapat diretur");
assert.match(source, /qty > remainingQty\(doc, item\)/, "Retur berlebih harus ditolak");
assert.match(source, /module === "Penjualan"[\s\S]*p\.stock = previousStock \+ primaryQty/, "Retur penjualan harus menambah stok");
assert.match(source, /p\.stock = previousStock - primaryQty/, "Retur pembelian harus mengurangi stok");
assert.doesNotMatch(source, /<select id="returnRefId"/, "Transaksi tidak boleh dipilih otomatis lewat dropdown");

console.log("return-search.test.js: semua pemeriksaan lulus");
