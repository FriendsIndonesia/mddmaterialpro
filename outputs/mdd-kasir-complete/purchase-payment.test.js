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
assert.doesNotMatch(html, /id="manualDebtPaid"/, "Input Data Hutang tidak boleh membuat pembayaran langsung");
assert.doesNotMatch(html, /id="manualReceivablePaid"/, "Input Data Piutang tidak boleh membuat pembayaran langsung");
assert.match(backend, /payment\.id is the business-level idempotency key/, "Backend harus memiliki pagar idempotensi di level payment");
assert.match(backend, /if \(existingPayment\)[\s\S]*return; \/\/ Safe retry/, "Retry payment ID yang sama tidak boleh menerapkan delta dua kali");
assert.match(backend, /Saldo tagihan berubah/, "Backend harus menolak baseline saldo yang sudah berubah");
assert.match(backend, /Pembayaran melebihi sisa tagihan/, "Backend harus menolak overpayment");
assert.match(html, /baseline: \{ paid: Number\(row\.baselinePaid \?\? invoiceBefore\?\.paid \?\? 0\), due: Number\(row\.baselineDue \?\? invoiceBefore\?\.due \?\? 0\) \}/, "payment_delta harus membawa baseline paid/due ke backend");
assert.match(html, /v166PaymentCommandScope[\s\S]*String\(op\.type \|\| ""\) === "payment_delta"/, "Aksi pembayaran harus dibatasi hanya ke payment_delta");
assert.match(html, /v169SetPaymentGuard\(type, row, paymentId, amount\)/, "Pembayaran harus memasang durable payment guard");

const total = (items, ongkir, bankCharge, discount) => Math.max(0, items + ongkir + bankCharge - discount);
assert.equal(total(2_900_000, 0, 0, 0), 2_900_000);
assert.equal(Math.max(0, 3_000_000 - total(2_900_000, 0, 0, 0)), 100_000, "Kembalian contoh harus Rp100.000");
assert.equal(total(3_000_000, 0, 0, 100_000) - 1_000_000, 1_900_000, "Sisa DP harus memperhitungkan potongan");

// v175 scenario matrix: pure arithmetic/state-transition checks that can run
// without touching production Sheets or the Apps Script deployment.
const applyPaymentModel = ({ paid, due }, amount) => {
  assert.ok(amount > 0, "Nominal harus positif");
  assert.ok(amount <= due, "Nominal tidak boleh melebihi sisa");
  return { paid: paid + amount, due: due - amount };
};
assert.deepEqual(applyPaymentModel({ paid: 0, due: 10_000_000 }, 2_000_000), { paid: 2_000_000, due: 8_000_000 }, "Pembayaran pertama harus mengurangi due tepat sekali");
assert.deepEqual(applyPaymentModel({ paid: 2_000_000, due: 8_000_000 }, 3_000_000), { paid: 5_000_000, due: 5_000_000 }, "Cicilan kedua harus memakai saldo terbaru");
assert.deepEqual(applyPaymentModel({ paid: 5_000_000, due: 5_000_000 }, 5_000_000), { paid: 10_000_000, due: 0 }, "Pelunasan harus menghasilkan due nol");
assert.throws(() => applyPaymentModel({ paid: 8_000_000, due: 2_000_000 }, 2_000_001), /melebihi sisa/, "Overpayment harus ditolak");

const paymentIds = new Set();
const applyIdempotentModel = (ledger, payment) => {
  if (paymentIds.has(payment.id)) return { ...ledger };
  paymentIds.add(payment.id);
  return applyPaymentModel(ledger, payment.amount);
};
const once = applyIdempotentModel({ paid: 0, due: 10_000_000 }, { id: "PAY-V175-RETRY", amount: 2_000_000 });
const retry = applyIdempotentModel(once, { id: "PAY-V175-RETRY", amount: 2_000_000 });
assert.deepEqual(retry, once, "Retry payment ID yang sama tidak boleh mengubah ledger dua kali");

console.log("purchase-payment.test.js: semua pemeriksaan lulus");
