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
assert.match(html, /renderReportTransactionSearch\(\);[\s\S]*bindCompletedSalesActions\(\)/);

console.log("report-transaction-search.test.js: pencarian penjualan, pembelian, retur, relasi, dokumen, dan tanggal lulus");
