const assert = require('node:assert/strict');
const R = require('./sale-recovery');
function fixture() {
 const rows=R.expected.map(([operationId,entity,entityId,type])=>({operationId,entity,entityId,type,commandId:R.command,status:'conflict',payload:type==='stock_delta'?{productId:entityId,delta:-1}:{row:{id:entityId},base:null}}));
 Object.assign(rows.find(r=>r.entity==='sales').payload.row,{invoiceNo:'TEST-ORIGINAL',total:300,items:rows.filter(r=>r.type==='stock_delta').map(r=>({productId:r.entityId,qty:1,primaryQty:1}))});
 const records=new Map(rows.map(r=>[r.operationId,r])); const meta=new Map();
 const a={box:{getMeta:async k=>meta.get(k),setMeta:async(k,v)=>meta.set(k,v),list:async statuses=>[...records.values()].filter(r=>statuses.includes(r.status)),mark:async(ids,status,extra)=>ids.forEach(id=>Object.assign(records.get(id),{status},extra)),putMany:async rs=>rs.forEach(r=>records.set(r.operationId,r))},ack:async ids=>({ok:true,conflicts:ids}),snapshot:async()=>({sales:[],stockMoves:[],products:rows.filter(r=>r.type==='stock_delta').map(r=>({id:r.entityId,stock:13}))})};
 return {a,rows,records,meta};
}
(async()=>{
 let passed=0;
 async function test(fn){await fn();passed++;}
 await test(async()=>{const f=fixture();assert.equal(await R.run(f.a),'enqueued');assert.equal(f.records.size,14);for(const r of f.rows)assert.deepEqual(f.records.get(r.operationId+'-r176').payload,r.payload);assert(f.meta.has(R.key+'-archive'));});
 await test(async()=>{const f=fixture();await R.run(f.a);await R.run(f.a);assert.equal(f.records.size,14);assert(f.rows.every(r=>r.status==='conflict'));});
 await test(async()=>{const f=fixture();await R.run(f.a);f.a.ack=async ids=>({ok:true,acknowledged:ids});assert.equal(await R.run(f.a),'completed');assert(f.rows.every(r=>r.status==='retired'));assert.equal(await R.run(f.a),'completed');});
 await test(async()=>{const f=fixture();f.records.delete(f.rows[0].operationId);await assert.rejects(R.run(f.a),/INCOMPLETE/);assert.equal(f.records.size,6);});
 await test(async()=>{const f=fixture();f.rows[0].payload.delta=-2;await assert.rejects(R.run(f.a),/QUANTITY_MISMATCH/);});
 await test(async()=>{const f=fixture();const snap=await f.a.snapshot();snap.products[0].stock=0;f.a.snapshot=async()=>snap;await assert.rejects(R.run(f.a),/STOCK_NOT_READY/);assert.equal(f.records.size,7);});
 await test(async()=>{const f=fixture();const snap=await f.a.snapshot();snap.sales=[{id:'OTHER',invoiceNo:'TEST-ORIGINAL'}];f.a.snapshot=async()=>snap;await assert.rejects(R.run(f.a),/ALREADY_EXISTS/);});
 await test(async()=>{const f=fixture();const snap=await f.a.snapshot();snap.stockMoves=[{id:'STK-S9479'}];f.a.snapshot=async()=>snap;await assert.rejects(R.run(f.a),/STOCK_ALREADY_EXISTS/);});
 await test(async()=>{const f=fixture();f.a.ack=async()=>({ok:false});await assert.rejects(R.run(f.a),/RECEIPTS_CHANGED/);assert.equal(f.records.size,7);});
 await test(async()=>{const f=fixture();await R.run(f.a);f.a.ack=async ids=>({ok:true,acknowledged:ids.slice(0,6)});assert.equal(await R.run(f.a),'waiting');assert(f.rows.every(r=>r.status==='conflict'));});
 await test(async()=>{const f=fixture();f.a.box.setMeta=async()=>{throw Error('disk full')};await assert.rejects(R.run(f.a),/disk full/);assert.equal(f.records.size,7);});
 await test(async()=>{const f=fixture();f.records.clear();assert.equal(await R.run(f.a),'not-this-device');});
 await test(async()=>{const f=fixture();const original=f.a.box.setMeta;f.a.box.setMeta=async(k,v)=>{if(k===R.key)throw Error('crash');return original(k,v)};await assert.rejects(R.run(f.a),/crash/);assert.equal(f.records.size,14);f.a.box.setMeta=original;assert.equal(await R.run(f.a),'waiting');assert.equal(f.records.size,14);});
 console.log(`${passed} recovery scenarios passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
