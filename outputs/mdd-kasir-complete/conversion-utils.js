(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MDDConversion = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EPSILON = 1e-9;

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function validConversion(value) {
    const conversion = finiteNumber(value);
    if (conversion <= 0) throw new Error("Nilai konversi harus lebih besar dari 0.");
    return conversion;
  }

  function validateConversion(primaryUnit, secondaryUnit, conversionValue) {
    const primary = String(primaryUnit || "").trim().toLowerCase();
    const secondary = String(secondaryUnit || "").trim().toLowerCase();
    if (!primary) throw new Error("Satuan utama wajib dipilih.");
    if (!secondary) return true;
    if (primary === secondary) throw new Error("Satuan utama dan satuan kedua harus berbeda.");
    validConversion(conversionValue);
    return true;
  }

  function quantityInPrimary(quantity, unit, product) {
    const amount = finiteNumber(quantity);
    const secondary = String(product?.secondaryUnit || "").trim().toLowerCase();
    const selected = String(unit || product?.primaryUnit || product?.unit || "").trim().toLowerCase();
    if (secondary && selected === secondary) return amount / validConversion(product?.conversionValue);
    return amount;
  }

  function convertPrimaryToSecondary(value, conversionValue) {
    return finiteNumber(value) * validConversion(conversionValue);
  }

  function calculateSecondaryCost(primaryCost, conversionValue) {
    return finiteNumber(primaryCost) / validConversion(conversionValue);
  }

  function roundMoney(value) {
    const number = finiteNumber(value);
    return Math.round((number + Math.sign(number || 1) * Number.EPSILON) * 100) / 100;
  }

  function moneyMultiply(quantity, unitPrice) {
    return roundMoney(finiteNumber(quantity) * finiteNumber(unitPrice));
  }

  return {
    EPSILON,
    validateConversion,
    quantityInPrimary,
    convertPrimaryToSecondary,
    calculateSecondaryCost,
    roundMoney,
    moneyMultiply
  };
});
