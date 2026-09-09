const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");

assert.match(html, /Harga Beli \/ HPP[\s\S]*name="buy"/);
assert.match(html, /Harga Jual 1[\s\S]*name="price"/);
assert.match(html, /Harga Jual 2[\s\S]*name="price2"/);
assert.match(html, /HPP Saat Ini[\s\S]*id="purchaseHpp"[\s\S]*readonly/);
assert.match(html, /Harga Beli Baru[\s\S]*id="purchasePrice1"/);
assert.match(html, /p\.buy = toNumber\(item\.baseBuy \?\? item\.buy \?\? item\.price\)/);
assert.doesNotMatch(html, /p\.price = item\.price1/);
assert.match(html, /saleProductDraft\.price1 = String\(productPriceForUnit\(product, unit, 1\)\)/);
assert.match(html, /saleProductDraft\.price2 = String\(productPriceForUnit\(product, unit, 2\)\)/);
assert.match(html, /const hasExplicitDue = \[row\.due, row\.remaining, row\.sisaPiutang, row\.sisa\]/);
assert.match(html, /const hasExplicitDue = \[row\.due, row\.remaining, row\.sisaHutang, row\.sisa\]/);

console.log("price-field-integrity.test.js: pemetaan HPP, harga beli, harga jual, dan saldo nol lulus");
