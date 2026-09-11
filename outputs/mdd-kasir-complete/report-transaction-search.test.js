const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");

assert.match(html, /id="reportTransactionSearch"/);
assert.match(html, /Laporan Penjualan & Pembelian/);
assert.match(html, /state\.sales\.filter\(isCashierSale\)/);
assert.match(html, /state\.purchases\.filter\(isPurchaseTransaction\)/);
assert.match(html, /Retur Penjualan/);
assert.match(html, /Retur Pembelian/);
assert.match(html, /reportSearchDateTerms\(row\.tanggal\)/);
assert.match(html, /terms\.every\(\(term\) => haystack\.includes\(term\)\)/);
assert.match(html, /placeholder="Ketik nama pelanggan\/supplier, nomor invoice\/faktur, tanggal, bulan, atau tahun\."/);
assert.match(html, /data-report-edit/);
assert.match(html, /data-report-print/);
assert.match(html, /function editReportTransaction/);
assert.match(html, /function printReportTransaction/);
assert.match(html, /Edit diblokir agar stok dan saldo piutang tetap akurat/);
assert.match(html, /Edit diblokir agar stok dan saldo hutang tetap akurat/);
assert.match(html, /type === "sales" \|\| String\(type \|\| ""\)\.toLowerCase\(\)\.includes\("penjualan"\)/);
assert.doesNotMatch(html, /Preview Laporan Penjualan/);

console.log("report-transaction-search.test.js: pencarian penjualan, pembelian, retur, relasi, dokumen, dan tanggal lulus");
