(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MDDConversion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STOCK_SCALE = 1000000n;
  const MONEY_SCALE = 1000000n;

  function scaled(value, scale) {
    const text = String(value ?? 0).trim().replace(/,/g, ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return 0n;
    const negative = text.startsWith("-");
    const clean = negative ? text.slice(1) : text;
    const parts = clean.split(".");
    const digits = String(scale).length - 1;
    const fraction = (parts[1] || "").padEnd(digits, "0").slice(0, digits);
    const result = BigInt(parts[0] || "0") * scale + BigInt(fraction || "0");
    return negative ? -result : result;
  }

  function divided(a, b, scale) {
    const left = scaled(a, scale);
    const right = scaled(b, scale);
    if (right <= 0n) throw new Error("Nilai konversi wajib lebih besar dari 0.");
    return Number((left * scale) / right) / Number(scale);
  }

  function multiplied(a, b, scale) {
    return Number((scaled(a, scale) * scaled(b, scale)) / scale) / Number(scale);
  }

  function validateConversion(primaryUnit, secondaryUnit, conversion) {
    if (!String(primaryUnit || "").trim()) throw new Error("Satuan utama wajib diisi.");
    if (!String(secondaryUnit || "").trim()) return true;
    if (String(primaryUnit).trim().toLowerCase() === String(secondaryUnit).trim().toLowerCase()) throw new Error("Satuan utama dan kedua tidak boleh sama.");
    if (scaled(conversion, STOCK_SCALE) <= 0n) throw new Error("Nilai konversi wajib lebih besar dari 0.");
    return true;
  }

  function convertPrimaryToSecondary(quantity, conversion) { return multiplied(quantity, conversion, STOCK_SCALE); }
  function convertSecondaryToPrimary(quantity, conversion) { return divided(quantity, conversion, STOCK_SCALE); }
  function calculateSecondaryCost(primaryCost, conversion) { return divided(primaryCost, conversion, MONEY_SCALE); }
  function moneyMultiply(quantity, price) { return multiplied(quantity, price, MONEY_SCALE); }
  function roundMoney(value) { return Number(scaled(value, 100n)) / 100; }
  function transactionCost(quantity, unit, product) {
    const secondary = product.secondaryUnit && String(unit).toLowerCase() === String(product.secondaryUnit).toLowerCase();
    const cost = secondary ? calculateSecondaryCost(product.buy, product.conversionValue) : Number(product.buy || 0);
    return multiplied(quantity, cost, MONEY_SCALE);
  }
  function quantityInPrimary(quantity, unit, product) {
    return product.secondaryUnit && String(unit).toLowerCase() === String(product.secondaryUnit).toLowerCase()
      ? convertSecondaryToPrimary(quantity, product.conversionValue)
      : Number(quantity || 0);
  }

  return { STOCK_SCALE, MONEY_SCALE, scaled, validateConversion, convertPrimaryToSecondary, convertSecondaryToPrimary, calculateSecondaryCost, moneyMultiply, roundMoney, transactionCost, quantityInPrimary };
});
