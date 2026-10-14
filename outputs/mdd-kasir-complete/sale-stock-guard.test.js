const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(__dirname + '/matrialpro.html', 'utf8');
function setup(stock = 2) {
  const product = {id:'sand', name:'Pasir', stock, primaryUnit:'Kol', secondaryUnit:'Ember', conversionValue:40};
  const button = {}, warning = {};
  const ctx = vm.createContext({activeCart:[], editingSaleId:'', state:{sales:[]}, number:new Intl.NumberFormat('id-ID'), findProduct:id=>id === product.id ? product : null, productQuantityInPrimary:(p,q,u)=>require('./conversion-utils').quantityInPrimary(q,u,p), document:{getElementById:id=>id==='salePayBtn'?button:id==='saleStockWarning'?warning:null}, saleCheckoutBusy:false, toast:message=>{ctx.message=message;}});
  const start = html.indexOf('      function saleStockProblems(');
  vm.runInContext(html.slice(start,html.indexOf('      function renderCashier()',start)),ctx);
  const checkout = html.indexOf('      async function checkoutSale()');
  vm.runInContext(html.slice(checkout,html.indexOf('      function renderPurchase()',checkout)),ctx);
  return {ctx, product, button, warning, line:(qty,unit='Kol')=>({productId:'sand',name:'Pasir',qty,unit})};
}
test('zero stock disables payment and explains shortage',()=>{const x=setup(0);x.ctx.activeCart=[x.line(1)];x.ctx.updateSaleStockGuard();assert.equal(x.button.disabled,true);assert.match(x.warning.textContent,/Pasir/);assert.equal(x.warning.hidden,false);});
test('enough and exactly equal stock permit payment',()=>{const x=setup();for(const q of [1,2]){x.ctx.activeCart=[x.line(q)];x.ctx.updateSaleStockGuard();assert.equal(x.button.disabled,false);}});
test('sum duplicate products across primary and secondary units',()=>{const x=setup();x.ctx.activeCart=[x.line(1),x.line(41,'Ember')];assert.equal(x.ctx.saleStockProblems().length,1);x.ctx.activeCart[1].qty=40;assert.equal(x.ctx.saleStockProblems().length,0);});
test('cart edit ignores stale cached primaryQty',()=>{const x=setup();x.ctx.activeCart=[{...x.line(3),primaryQty:1}];assert.equal(x.ctx.saleStockProblems().length,1);});
test('reducing or removing items re-enables button',()=>{const x=setup();x.ctx.activeCart=[x.line(3)];x.ctx.updateSaleStockGuard();assert.equal(x.button.disabled,true);x.ctx.activeCart[0].qty=1;x.ctx.updateSaleStockGuard();assert.equal(x.button.disabled,false);x.ctx.activeCart=[];x.ctx.updateSaleStockGuard();assert.equal(x.warning.hidden,true);});
test('restock and reduced stock update guard on render',()=>{const x=setup(0);x.ctx.activeCart=[x.line(1)];x.ctx.updateSaleStockGuard();x.product.stock=1;x.ctx.updateSaleStockGuard();assert.equal(x.button.disabled,false);x.product.stock=0;x.ctx.updateSaleStockGuard();assert.equal(x.button.disabled,true);});
test('edit existing sale credits original consumed quantity only',()=>{const x=setup(0);x.ctx.editingSaleId='sale';x.ctx.state.sales=[{id:'sale',items:[{...x.line(1),primaryQty:1}]}];x.ctx.activeCart=[x.line(1)];assert.equal(x.ctx.saleStockProblems().length,0);x.ctx.activeCart=[x.line(2)];assert.equal(x.ctx.saleStockProblems().length,1);});
test('invalid stock, missing products and invalid quantities fail closed',()=>{const x=setup();for(const qty of [NaN,Infinity,-1,0]){x.ctx.activeCart=[x.line(qty)];assert.ok(x.ctx.saleStockProblems().length);}x.ctx.activeCart=[{productId:'missing'}];assert.ok(x.ctx.saleStockProblems().length);x.ctx.activeCart=[x.line(1)];x.product.stock='invalid';assert.ok(x.ctx.saleStockProblems().length);});
test('direct checkout invocation blocks before any state write',async()=>{const x=setup(0);x.ctx.activeCart=[x.line(1)];const before=JSON.stringify(x.ctx.state);await x.ctx.checkoutSale();assert.match(x.ctx.message,/stok tersedia/);assert.equal(JSON.stringify(x.ctx.state),before);assert.equal(x.ctx.saleCheckoutBusy,false);});
test('inline scripts parse and cashier renderer wires guard',()=>{for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);const start=html.indexOf('      function renderCashier()');assert.match(html.slice(start,html.indexOf('      function renderSaleSearchResults()',start)),/updateSaleStockGuard\(\)/);});
