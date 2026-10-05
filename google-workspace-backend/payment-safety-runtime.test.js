const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');

class Range {
  constructor(sheet, row, col, rows=1, cols=1) { Object.assign(this, {sheet,row,col,rows,cols}); }
  getValues() { return Array.from({length:this.rows}, (_,r) => Array.from({length:this.cols}, (_,c) => this.sheet.data[this.row+r-1]?.[this.col+c-1] ?? '')); }
  getDisplayValues() { return this.getValues().map(row => row.map(String)); }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) { values.forEach((row,r) => row.forEach((v,c) => { this.sheet.write(this.row+r,this.col+c,v); })); return this; }
  setValue(value) { return this.setValues([[value]]); }
  clearContent() { return this.setValues(Array.from({length:this.rows}, () => Array(this.cols).fill(''))); }
  setNumberFormat() { return this; }
  getRow() { return this.row; }
  createTextFinder(text) { const self=this; let exact=false; return { matchEntireCell(v) {exact=v;return this;}, findAll() { const found=[];self.getDisplayValues().forEach((row,r)=>row.forEach((v,c)=>{if(exact?v===text:v.includes(text))found.push(new Range(self.sheet,self.row+r,self.col+c));}));return found;} }; }
}
class Sheet {
  constructor(name, data=[]) { this.name=name; this.data=data.map(row=>row.slice()); this.fail=null; this.writes=0; }
  write(row,col,value) { if(this.fail && this.fail(row,col,value)) {this.fail=null;throw new Error('Injected storage interruption');} this.data[row-1] ||= [];this.data[row-1][col-1]=value;this.writes++; }
  getRange(...args) { return new Range(this,...args); }
  getLastRow() { for(let i=this.data.length-1;i>=0;i--)if(this.data[i].some(v=>v!==''&&v!=null))return i+1;return 0; }
  getLastColumn() { return Math.max(0,...this.data.map(row=>row.length)); }
  getMaxRows() { return Math.max(100,this.data.length); }
  getName() {return this.name;}
  getDataRange() {return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
  appendRow(row) {this.getRange(this.getLastRow()+1,1,1,row.length).setValues([row]);return this;}
  clearContents() {this.data=[];return this;}
  setFrozenRows() {return this;}
  autoResizeColumns() {return this;}
  deleteRow(row) {this.data.splice(row-1,1);}
  deleteRows(row,count) {this.data.splice(row-1,count);}
}
class Spreadsheet {
  constructor() {this.sheets={};}
  getSheetByName(name) {return this.sheets[name]||null;}
  insertSheet(name) {return this.sheets[name]=new Sheet(name);}
  getSpreadsheetTimeZone() {return 'Asia/Jakarta';}
}
function setup(kind='Hutang', legacy=false) {
  let serial=0;const cache=new Map();const props=new Map([['SYNC_ENVIRONMENT','production'],['SPREADSHEET_ID','1rW1DGbvGJM5jVPF1NbCgDURFStpGqbfAQtq3a8Tt1FQ']]);
  const ss=new Spreadsheet();
  const context=vm.createContext({console,Date,JSON,Math,Utilities:{getUuid:()=>`TEST-${++serial}`,formatDate:(d)=>d.toISOString().slice(0,10)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k),removeAll:keys=>keys.forEach(k=>cache.delete(k))})}});
  vm.runInContext(source,context);
  const tables=vm.runInContext('TABLES',context);const debt=kind==='Hutang';const table=tables.find(x=>x.key===(debt?'purchases':'sales'));
  const invoice={id:legacy?(debt?'HUT-OLD':'PIU-OLD'):'INV-TEST',invoiceNo:'TEST-INV-001',total:10000000,paid:0,due:10000000,method:debt?'Hutang':'Piutang',date:'2026-10-05'};
  if(!legacy) {const sheet=ss.insertSheet(table.sheet);sheet.appendRow([...table.fields]);sheet.appendRow(table.fields.map(f=>invoice[f]??''));}
  else ss.insertSheet(debt?'Hutang':'Piutang').appendRow(['Tanggal','Jatuh Tempo','No. Faktur',debt?'Supplier':'Pelanggan',debt?'Hutang Aktif':'Piutang Aktif','Bayar','Retur',debt?'Sisa Hutang':'Sisa Piutang','Metode','Catatan']).appendRow(['2026-10-05','','TEST-INV-001','Test',10000000,0,0,10000000,'Tempo','']);
  const op=(id='PAY-1',amount=2000000,paid=0,due=10000000,intent='INTENT-1')=>({operationId:`OP-${id}`,commandId:`CMD-${id}`,type:'payment_delta',entity:'payments',entityId:id,payload:{intentId:intent,baseline:{paid,due},payment:{id,refId:invoice.id,invoiceNo:invoice.invoiceNo,type:kind,amount,remaining:due-amount,method:'Transfer',date:'2026-10-05'}}});
  const ledger=()=>legacy?{paid:ss.getSheetByName(debt?'Hutang':'Piutang').getRange(2,6).getValue(),due:ss.getSheetByName(debt?'Hutang':'Piutang').getRange(2,8).getValue()}:Object.fromEntries(['paid','due'].map(f=>[f,ss.getSheetByName(table.sheet).getRange(2,table.fields.indexOf(f)+1).getValue()]));
  const count=()=>Math.max(0,(ss.getSheetByName('Payments')?.getLastRow()||1)-1);
  const apply=o=>context.applyPaymentDelta_(ss,o);
  const process=ops=>context.processOperations_(ss,{environment:'production',deviceId:'TEST',operations:ops});
  return {context,ss,table,invoice,op,ledger,count,apply,process};
}
let passed=0;
function test(name,fn) {fn();passed++;console.log('PASS '+name);}
for(const kind of ['Hutang','Piutang']) {
  test(kind+' installments and settlement',()=>{const t=setup(kind);t.apply(t.op());t.apply(t.op('PAY-2',3000000,2000000,8000000,'INTENT-2'));t.apply(t.op('PAY-3',5000000,5000000,5000000,'INTENT-3'));assert.deepEqual(t.ledger(),{paid:10000000,due:0});assert.equal(t.count(),3);});
  test(kind+' new operation/intent same payment is applied once',()=>{const t=setup(kind);const op=t.op();t.process([op]);op.operationId='OP-RETRY';op.commandId='CMD-RETRY';op.payload.intentId='INTENT-REBUILT';const r=t.process([op]);assert.equal(r.acknowledged.length,1);assert.deepEqual(t.ledger(),{paid:2000000,due:8000000});assert.equal(t.count(),1);});
  test(kind+' repeated operation/command acknowledges once',()=>{const t=setup(kind);const op=t.op();t.process([op]);t.process([op,op]);assert.equal(t.count(),1);assert.equal(t.ledger().due,8000000);});
  for(const mutation of ['amount','refId','type']) test(kind+' conflicting Payment ID '+mutation,()=>{const t=setup(kind);t.apply(t.op());const changed=t.op();changed.payload.payment[mutation]=mutation==='amount'?3000000:mutation==='refId'?'OTHER':kind==='Hutang'?'Piutang':'Hutang';assert.throws(()=>t.apply(changed),/PAYMENT_ID_REUSE_CONFLICT/);assert.equal(t.ledger().due,8000000);assert.equal(t.count(),1);});
  test(kind+' intent cannot be rebound to another payment',()=>{const t=setup(kind);t.apply(t.op());assert.throws(()=>t.apply(t.op('OTHER',2000000,2000000,8000000)),/PAYMENT_INTENT_REUSE_CONFLICT/);assert.equal(t.count(),1);});
  test(kind+' stale baseline and overpayment rejected',()=>{const t=setup(kind);t.apply(t.op());assert.throws(()=>t.apply(t.op('PAY-2',1000000,0,10000000,'INTENT-2')),/STALE_PAYMENT/);assert.throws(()=>t.apply(t.op('PAY-3',9000000,2000000,8000000,'INTENT-3')),/OVERPAYMENT/);assert.equal(t.count(),1);assert.equal(t.ledger().due,8000000);});
  test(kind+' invalid amount and missing baseline rejected',()=>{for(const a of [0,-1,NaN,Infinity]){const t=setup(kind);assert.throws(()=>t.apply(t.op('BAD',a)),/PAYMENT_AMOUNT_INVALID/);assert.equal(t.count(),0);}const t=setup(kind);const o=t.op();delete o.payload.baseline;assert.throws(()=>t.apply(o),/PAYMENT_BASELINE_REQUIRED/);assert.equal(t.count(),0);});
  for(const crash of ['beforePayment','beforeLedger','partialLedger','beforeCommit']) test(kind+' interrupted '+crash+' retry',()=>{const t=setup(kind);const o=t.op();const sheet=t.ss.getSheetByName(t.table.sheet);if(crash==='beforePayment'){const pay=t.context.ensureSheet_(t.ss,'Payments',vm.runInContext('TABLES.find(t=>t.key==="payments").fields',t.context));pay.fail=r=>r===2;}else if(crash==='beforeLedger')sheet.fail=(r,c)=>r===2&&c===t.table.fields.indexOf('paid')+1;else if(crash==='partialLedger')sheet.fail=(r,c)=>r===2&&c===t.table.fields.indexOf('due')+1;else {const j=t.context.paymentIntegrityJournalSheet_(t.ss);j.fail=(r,c,v)=>c===2&&v==='COMMITTED';}assert.throws(()=>t.apply(o),/Injected/);o.operationId+='-RETRY';o.payload.intentId='REBUILT-INTENT';if(crash==='partialLedger'){assert.throws(()=>t.apply(o),/MANUAL_REVIEW/);assert.equal(t.count(),1);}else{t.apply(o);assert.deepEqual(t.ledger(),{paid:2000000,due:8000000});assert.equal(t.count(),1);assert.equal(t.ss.getSheetByName('PaymentIntegrityJournal').getRange(2,2).getValue(),'COMMITTED');}});
  test(kind+' recovery with absent intent retains original journal',()=>{const t=setup(kind);const o=t.op();t.ss.getSheetByName(t.table.sheet).fail=(r,c)=>r===2&&c===t.table.fields.indexOf('paid')+1;assert.throws(()=>t.apply(o),/Injected/);delete o.payload.intentId;t.apply(o);assert.equal(t.ledger().due,8000000);assert.equal(t.count(),1);});
  test(kind+' legacy payment remains compatible and idempotent',()=>{const t=setup(kind,true);const o=t.op();t.process([o]);o.operationId+='-RETRY';o.commandId+='-RETRY';t.process([o]);assert.equal(t.count(),1);assert.deepEqual(t.ledger(),{paid:2000000,due:8000000});});
  test(kind+' legacy conflicting identity and stale balance rejected',()=>{const t=setup(kind,true);t.apply(t.op());const o=t.op();o.payload.payment.amount=3000000;assert.throws(()=>t.apply(o),/PAYMENT_ID_REUSE_CONFLICT/);assert.throws(()=>t.apply(t.op('NEW',2000000,0,10000000,'NEWINTENT')),/Saldo ledger berubah/);assert.equal(t.count(),1);});
  test(kind+' legacy duplicate invoices require manual review',()=>{const t=setup(kind,true);const sh=t.ss.getSheetByName(kind==='Hutang'?'Hutang':'Piutang');sh.appendRow(sh.data[1]);assert.throws(()=>t.apply(t.op()),/ambigu/);assert.equal(t.count(),0);});
  test(kind+' DP projection has no extra ledger effect',()=>{const t=setup(kind);const o=t.op();o.payload.payment.method='DP (Uang Muka)';t.apply(o);o.operationId+='retry';t.apply(o);assert.equal(t.count(),1);assert.deepEqual(t.ledger(),{paid:0,due:10000000});});
}
test('production environment guard retained',()=>{const t=setup();t.context.assertV147ProductionSafe_();const r=t.process([]);assert.ok(r.ok);const wrong=t.context.processOperations_(t.ss,{environment:'staging',operations:[t.op()]});assert.ok(wrong.environmentMismatch);assert.equal(t.count(),0);});
console.log(JSON.stringify({passed,failed:0,storage:'in-memory Spreadsheet API emulator',productionWrites:0}));
