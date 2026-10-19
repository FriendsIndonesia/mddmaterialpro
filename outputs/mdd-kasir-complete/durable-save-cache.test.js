"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const source = fs.readFileSync(path.join(__dirname, "matrialpro.html"), "utf8");
function between(start, end) {
  const a=source.indexOf(start), b=source.indexOf(end,a);
  assert(a>=0 && b>a, "Missing function: "+start);
  return source.slice(a,b);
}
const functions = [
  between("      function captureOperations(action)", "      function saveState(action"),
  between("      function addHistory(action,", "      function toast("),
  between("      let saleCheckoutBusy = false;", "      function renderPurchase()")
].join("\n");
const runnerSource = "async function runSaveScenario(config = {}) {\n  let state = { products: [{id:\"P1\", stock:10, stockAkhir:10, stockOut:0}], sales:[], stockMoves:[], payments:[], syncQueue:[], history:[] };\n  let activeCart = [{productId:\"P1\",name:\"Test\",qty:1,unit:\"Kg\",price:2000}];\n  let operationSnapshot=JSON.parse(JSON.stringify(state)), baselineInProgress=!!config.baseline;\n  let v166PaymentCommandScope=null, session={name:\"Test\"}, editingSaleId=\"\";\n  let saleDraft={invoiceNo:\"TEST-INVOICE\",cashReceived:2000,method:\"Cash\",ongkir:0,discount:0,note:\"\"};\n  const outbox=[], printed=[], messages=[], warnings=[]; let writes=0, schedules=0, serial=0, renders=0, release;\n  const gate=config.delayed ? new Promise(r=>release=r) : Promise.resolve();\n  const console={warn:(...x)=>warnings.push(x[0]),error:(...x)=>warnings.push(x[0])};\n  const localStorage={setItem(){ writes++; if(config.cacheFailure) throw Object.assign(new Error(\"Cache full\"),{name:\"QuotaExceededError\"}); }};\n  const STORAGE_KEY=\"mock\", structuredClone=x=>JSON.parse(JSON.stringify(x));\n  const syncOutbox={async putMany(ops){await gate;if(config.durableFailure)throw Object.assign(new Error(\"Outbox aborted\"),{name:\"AbortError\"});outbox.push(...structuredClone(ops));return ops;}};\n  function buildOperationsFromState(before,after){\n    return after.sales.filter(row=>!before.sales.some(old=>old.id===row.id)).map(row=>({operationId:\"OP-\"+row.id,entity:\"sales\",entityId:row.id,payload:{row:structuredClone(row)}}));\n  }\n  const v150FilterOperationsForAction=ops=>ops;\n  function updateSyncIndicator(){if(config.indicatorFailure)throw Error(\"indicator\");return Promise.resolve();}\n  function queueGoogleWorkspaceSync(){if(config.schedulerFailure)throw Error(\"scheduler\");schedules++;}\n  function setBackendSyncBanner(){}\n  function renderAll(){renders++;}\n  function toast(m){messages.push(m);}\n  function uid(prefix){return prefix+\"-\"+(++serial);}\n  const updateSaleStockGuard=()=>[], updateSaleDraftTotals=()=>{},updateSaleCustomerDraft=()=>{};\n  const selectedSaleCustomerData=()=>({id:\"C\",name:\"Test\",deposit:0}),saleGrandTotal=()=>2000;\n  const isDownPaymentMethod=()=>false,isCashMethod=m=>m===\"Cash\",usesReceivedAmount=()=>true;\n  const toNumber=x=>Number(x||0),saleCashChange=()=>0;\n  const findProduct=id=>state.products.find(p=>p.id===id),stockAkhirProduk=p=>p.stock,productQuantityInPrimary=(p,q)=>q;\n  const markExplicitDeletion=()=>{}, resetSaleDraft=()=>{saleDraft={invoiceNo:\"NEXT\"};};\n  const printDoc=(title,doc,type)=>printed.push({id:doc.id,type});\n  const document={getElementById:id=>({value:id===\"salePayMethod\"?\"Cash\":id===\"saleDate\"?\"2026-10-19\":\"\"})};\n  INJECT_FUNCTIONS\n  const first=checkoutSale();\n  if(config.delayed){await Promise.resolve();if(printed.length||messages.some(m=>m.startsWith(\"TERSIMPAN\")))throw Error(\"success before durable commit\");}\n  if(config.doubleClick)await checkoutSale();\n  if(release)release();\n  await first;\n  if(config.clickAgain)await checkoutSale();\n  await Promise.resolve();\n  return {outbox,printed,messages,warnings,stock:state.products[0].stock,sales:state.sales.length,cart:activeCart.length,busy:saleCheckoutBusy,writes,schedules};\n}";
const run = new Function("return " + runnerSource.replace("INJECT_FUNCTIONS", functions))();
(async () => {
  const cases = [
    ["normal",{},true],
    ["cache full",{cacheFailure:true},true],
    ["outbox aborted",{durableFailure:true},false],
    ["outbox and cache fail",{durableFailure:true,cacheFailure:true},false],
    ["delayed commit",{delayed:true},true],
    ["double click",{delayed:true,doubleClick:true,cacheFailure:true},true],
    ["indicator exception",{indicatorFailure:true},true],
    ["scheduler exception",{schedulerFailure:true},true],
    ["repeat after saved",{cacheFailure:true,clickAgain:true},true],
    ["baseline active",{baseline:true},false]
  ];
  for (const [name, config, success] of cases) {
    const r=await run(config);
    assert.equal(r.outbox.length, success ? 1 : 0, name);
    assert.equal(r.printed.length, success ? 1 : 0, name);
    assert.equal(r.stock, success ? 9 : 10, name);
    assert.equal(r.sales, success ? 1 : 0, name);
    assert.equal(r.cart, success ? 0 : 1, name);
    assert.equal(r.busy,false,name);
    if(success) assert(!r.messages.some(m=>m.startsWith("TRANSAKSI BELUM")),name);
    console.log("PASS",name);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

