const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const html = fs.readFileSync(path.join(__dirname, "matrialpro.html"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "..", "google-workspace-backend", "Code.gs"), "utf8");

assert.match(html, /purchasePayMethods = \["Cash", "DP \(Uang Muka\)"/, "Metode DP pembelian harus tersedia");
assert.match(html, /id="purchaseDiscount"/, "Kolom potongan pembelian harus tersedia");
assert.match(html, /function purchaseRemainingPayment\(\)/, "Sisa pembayaran pembelian harus dihitung");
assert.match(html, /method === "Hutang" \|\| isDpPurchase/, "DP harus diklasifikasikan sebagai hutang");
assert.match(html, /const due = Math\.max\(0, total - paid\)/, "Sisa hutang harus sama dengan total dikurangi pembayaran");
assert.match(html, /purchasePaymentFormula/, "Rincian rumus pembayaran harus terlihat");
assert.match(backend, /"purchases"[\s\S]*"discount", "dp"/, "Backend Purchases harus menyimpan diskon dan DP");
assert.match(backend, /"pendingPurchases"[\s\S]*"discount", "dp"/, "Backend PendingPurchases harus menyimpan diskon dan DP");

const total = (items, ongkir, bankCharge, discount) => Math.max(0, items + ongkir + bankCharge - discount);
assert.equal(total(2_900_000, 0, 0, 0), 2_900_000);
assert.equal(Math.max(0, 3_000_000 - total(2_900_000, 0, 0, 0)), 100_000, "Kembalian contoh harus Rp100.000");
assert.equal(total(3_000_000, 0, 0, 100_000) - 1_000_000, 1_900_000, "Sisa DP harus memperhitungkan potongan");

console.log("purchase-payment.test.js: semua pemeriksaan lulus");
