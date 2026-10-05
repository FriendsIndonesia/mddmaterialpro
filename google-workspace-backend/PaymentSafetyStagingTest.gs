/** Manual integration test. Writes ONLY a newly created test workbook.
 * Never calls doPost/getSpreadsheet_/cleanup and never uses production data.
 * Retains the test workbook as evidence; no files or rows are deleted.
 */
function v175RunIsolatedSheetsTests() {
  const ss = SpreadsheetApp.create("MDD v175 ISOLATED PAYMENT TEST " + new Date().toISOString());
  if (ss.getId() === V147_PRODUCTION_SPREADSHEET_ID || ss.getName().indexOf("MDD v175 ISOLATED PAYMENT TEST ") !== 0) throw new Error("TEST_ISOLATION_FAILED");
  const passed = [];
  const check = function(condition, label) { if (!condition) throw new Error("FAIL " + label); passed.push(label); };
  const reject = function(fn, text, label) { let error = null; try { fn(); } catch(e) { error = e; } check(!!error && String(error.message).indexOf(text) >= 0, label); };
  ["Hutang", "Piutang"].forEach(function(kind) {
    const table = TABLES.find(function(t) {return t.key === (kind === "Hutang" ? "purchases" : "sales");});
    const invoiceId = "TEST-" + kind;
    applyTableChanges_(ss, table, {upserts:[{id:invoiceId, invoiceNo:invoiceId, date:"2026-10-05", method:kind, total:10000000, paid:0, due:10000000}],deletes:[]});
    const sheet = ss.getSheetByName(table.sheet);
    const paidCol = table.fields.indexOf("paid")+1, dueCol = table.fields.indexOf("due")+1;
    const op = function(id, amount, paid, due, intent) {return {operationId:"OP-"+id, commandId:"CMD-"+id, type:"payment_delta",entity:"payments",entityId:id,payload:{intentId:intent||"INT-"+id,baseline:{paid:paid,due:due},payment:{id:id,refId:invoiceId,invoiceNo:invoiceId,type:kind,amount:amount,remaining:due-amount,method:"Transfer",date:"2026-10-05"}}};};
    const first = op("PAY-"+kind+"-1",2000000,0,10000000);
    applyPaymentDelta_(ss,first);
    check(sheet.getRange(2,paidCol).getValue()===2000000 && sheet.getRange(2,dueCol).getValue()===8000000,kind+" first payment");
    first.operationId += "-RETRY"; first.payload.intentId += "-REBUILT";
    applyPaymentDelta_(ss,first);
    check(sheet.getRange(2,dueCol).getValue()===8000000,kind+" different operation/intent retry");
    const clash=op(first.payload.payment.id,3000000,2000000,8000000);
    reject(function(){applyPaymentDelta_(ss,clash);},"PAYMENT_ID_REUSE_CONFLICT",kind+" payment identity conflict");
    reject(function(){applyPaymentDelta_(ss,op("STALE-"+kind,1000000,0,10000000));},"STALE_PAYMENT",kind+" stale baseline");
    reject(function(){applyPaymentDelta_(ss,op("OVER-"+kind,9000000,2000000,8000000));},"OVERPAYMENT",kind+" overpayment");
    applyPaymentDelta_(ss,op("PAY-"+kind+"-2",3000000,2000000,8000000));
    applyPaymentDelta_(ss,op("PAY-"+kind+"-3",5000000,5000000,5000000));
    check(sheet.getRange(2,paidCol).getValue()===10000000 && sheet.getRange(2,dueCol).getValue()===0,kind+" installments settled");

    // Simulate a durable PREPARED journal plus Payment row before ledger commit.
    const recoveryId="TEST-RECOVERY-"+kind;
    applyTableChanges_(ss,table,{upserts:[{id:recoveryId,invoiceNo:recoveryId,total:10000000,paid:0,due:10000000,method:kind}],deletes:[]});
    const recovery=op("RECOVER-PAY-"+kind,2000000,0,10000000,"RECOVER-INT-"+kind);
    recovery.payload.payment.refId=recoveryId; recovery.payload.payment.invoiceNo=recoveryId;
    const journal=paymentIntegrityJournalSheet_(ss);
    journal.appendRow([recovery.payload.intentId,"PREPARED",new Date(),"",recovery.operationId,recovery.commandId,recovery.payload.payment.id,recoveryId,recoveryId,kind,2000000,0,10000000,0,10000000,2000000,8000000,"TEST-RECEIPT-"+kind,""]);
    applyTableChanges_(ss,TABLES.find(function(t){return t.key==="payments";}),{upserts:[recovery.payload.payment],deletes:[]});
    recovery.payload.intentId += "-REBUILT";
    applyPaymentDelta_(ss,recovery);
    check(sheet.getRange(3,paidCol).getValue()===2000000 && sheet.getRange(3,dueCol).getValue()===8000000,kind+" PREPARED recovery with rebuilt intent");
    const record=paymentJournalByPaymentId_(ss,recovery.payload.payment.id);
    check(record.values[1]==="COMMITTED",kind+" recovery committed");

    const legacySheet=ss.insertSheet(kind==="Hutang"?"Hutang":"Piutang");
    legacySheet.appendRow(["Tanggal","Jatuh Tempo","No. Faktur","Nama","Total","Bayar","Retur","Sisa","Metode","Catatan"]);
    legacySheet.appendRow(["2026-10-05","","LEGACY-"+kind,"Test",10000000,0,0,10000000,"Tempo",""]);
    const legacy=op("LEGACY-PAY-"+kind,2000000,0,10000000);
    legacy.payload.payment.refId=(kind==="Hutang"?"HUT-":"PIU-")+"TEST";legacy.payload.payment.invoiceNo="LEGACY-"+kind;
    applyPaymentDelta_(ss,legacy);applyPaymentDelta_(ss,legacy);
    check(legacySheet.getRange(2,6).getValue()===2000000 && legacySheet.getRange(2,8).getValue()===8000000,kind+" legacy retry once");
  });
  const payments=readTableDefinition_(ss,TABLES.find(function(t){return t.key==="payments";}));
  check(payments.length===10,"exactly 10 payment records for 10 business payments");
  check(new Set(payments.map(function(p){return p.id;})).size===10,"unique Payment IDs");
  const result={ok:true,build:BACKEND_BUILD_VERSION,passed:passed.length,failed:0,productionWrites:0,testSpreadsheetId:ss.getId(),testSpreadsheetUrl:ss.getUrl(),checks:passed};
  console.log(JSON.stringify(result,null,2));
  return result;
}
