const assert = require("node:assert/strict");
const c = require("./conversion-utils.js");

assert.ok(Math.abs(c.calculateSecondaryCost(580000, 111) - 5225.225225) < 0.000001);
assert.ok(Math.abs(c.convertSecondaryToPrimary(50, 111) - 0.45045) < 0.000001);
assert.equal(c.convertPrimaryToSecondary(5, 111), 555);
assert.ok(Math.abs(c.calculateSecondaryCost(795000, 47) - 16914.893617) < 0.000001);
assert.equal(c.convertPrimaryToSecondary(0.1, 3), 0.3);
assert.throws(() => c.validateConversion("M3", "PCS", 0), /lebih besar/);
assert.throws(() => c.validateConversion("M3", "PCS", -1), /lebih besar/);
assert.equal(c.calculateSecondaryCost(600000, 100), 6000);
assert.equal(c.calculateSecondaryCost(580000, 100), 5800);
assert.ok(Math.abs(c.quantityInPrimary(50, "PCS", { secondaryUnit: "PCS", conversionValue: 111 }) - 0.45045) < 0.000001);
console.log("10 pengujian Konversi Produk lulus.");
