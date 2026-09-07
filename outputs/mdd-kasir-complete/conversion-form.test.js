const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const c = require("./conversion-utils");
const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
const start = html.indexOf('          const product = state.products.find((p) => p.id === fd.get("productId"));', html.indexOf("function openProductConversionModal"));
const end = html.indexOf("\n        });", start);
const save = html.slice(start, end);
const original = { id:"p1", code:"OLD-001", name:"Test", unit:"Box", primaryUnit:"Box", stock:10, stockAkhir:10, stockIn:3, stockOut:2 };
function run(overrides = {}, extra = [], cart = []) {
  const state = {products:[{...original}, ...extra]};
  const fields = {productId:"p1",unitMode:"two",primaryUnit:"Box",secondaryUnit:"PCS",conversionValue:"12",code:"OLD-001",secondaryBarcode:"PCS-001",buy:"12000.25",price:"15000.25",price2:"14000",secondaryPrice:"1500",secondaryPrice2:"1400",min:"0.001",...overrides};
  let saves = 0;
  const context = {state,fd:{get:k=>fields[k]},activeCart:cart,purchaseCart:[],normalizeUnit:x=>x,toNumber:x=>Number(x)||0,MDDConversion:c,toast:()=>{},saveState:()=>saves++,closeModal:()=>{},renderAll:()=>{},conversionLabel:()=>""};
  vm.createContext(context);
  vm.runInContext("(function(){"+save+"})()",context);
  return {row:state.products[0], saves};
}
const good = run();
assert.equal(good.saves,1);
assert.equal(good.row.buy,12000.25);
assert.equal(good.row.min,0.001);
assert.equal(good.row.secondaryBuy,c.calculateSecondaryCost(12000.25,12));
for(const key of ["id","code","stock","stockAkhir","stockIn","stockOut"]) assert.equal(good.row[key],original[key]);
assert.equal(run({conversionValue:"0.001"}).row.conversionValue,0.001);
for(const change of [{secondaryUnit:""},{secondaryUnit:"Box"},{conversionValue:"0"},{conversionValue:"-1"},{conversionValue:"Infinity"},{primaryUnit:"PCS"},{secondaryBarcode:"OLD-001"},{buy:"-1"},{price:"oops"}]) assert.equal(run(change).saves,0);
assert.equal(run({},[{id:"p2",code:"PCS-001"}]).saves,0);
assert.equal(run({},[],[{productId:"p1"}]).saves,0);
assert.equal(run({unitMode:"one"}).row.secondaryUnit,"");
const backend = fs.readFileSync(__dirname + "/../../google-workspace-backend/Code.gs","utf8");
const fields = JSON.parse(backend.match(/key: "products", sheet: "Products", fields: (\[[^\n]+?\])/)[1]);
for(const key of ["primaryUnit","secondaryUnit","secondaryBarcode","conversionValue","secondaryBuy","secondaryPrice","secondaryPrice2"]) assert(fields.includes(key));
const roundTrip = Object.fromEntries(fields.map(key=>[key,good.row[key]]));
for(const key of ["conversionValue","secondaryBuy","secondaryPrice","stock","id"]) assert.equal(roundTrip[key],good.row[key]);
console.log("PASS: conversion form validation, decimal precision, stock preservation, barcode collision, active cart guard, backend schema round-trip simulation, inline syntax.");
