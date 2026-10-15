const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync(__dirname + '/matrialpro.html','utf8');
function runtime() {
 let now=0, sequence=0;
 const timers=new Map(), scripts=[];
 const ctx=vm.createContext({URLSearchParams,Math,Date:class extends Date {static now(){return now;}},window:{},backendRuntimeEnabled:()=>true,activeBackendEndpoint:()=> 'https://example.test/exec',document:{createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)}},setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay,delay});return id;},clearTimeout:id=>timers.delete(id)});
 const start=html.indexOf('      function requestGoogleWorkspaceJsonpAt(');
 vm.runInContext(html.slice(start,html.indexOf('      function normalizeProductionResponse',start)),ctx);
 function advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}
 function reply(data){const s=scripts.at(-1), cb=new URL(s.src).searchParams.get('callback');if(ctx.window[cb])ctx.window[cb](data);}
 return {ctx,timers,scripts,advance,reply};
}
test('normal ACK retains 10s timeout; recovery ACK accepts measured 20.7s response',async()=>{
 const a=runtime();let p=a.ctx.requestGoogleWorkspaceJsonp('acknowledgement');a.advance(10000);assert.equal(await p,false);
 const b=runtime();p=b.ctx.requestGoogleWorkspaceJsonp('acknowledgement',{operationIds:'original-id'},{timeoutMs:60000});b.advance(20730);assert.equal(b.timers.size,1);b.reply({ok:true,conflicts:['original-id']});assert.equal((await p).ok,true);assert.equal(b.timers.size,0);assert.equal(b.scripts[0].removed,true);
});
test('recovery snapshots accept response later than old 45s limit',async()=>{const a=runtime();const p=a.ctx.requestGoogleWorkspaceJsonp('master',{}, {timeoutMs:90000});a.advance(50000);a.reply({ok:true,data:{}});assert.equal((await p).ok,true);});
test('recovery timeout cleans up script and late callback',async()=>{const a=runtime();const p=a.ctx.requestGoogleWorkspaceJsonp('acknowledgement',{}, {timeoutMs:60000});a.advance(60000);assert.equal(await p,false);assert.equal(a.scripts[0].removed,true);assert.equal(Object.keys(a.ctx.window).length,0);});
function coordinator(run){
 const a=runtime();let queued=0,indicator=0,calls=0;const diagnostics=[];
 Object.assign(a.ctx,{MDDRecovery176:{run:async args=>{calls++;return run(args);}},outboxReady:true,SYNC_ENVIRONMENT:'production',navigator:{onLine:true},APP_VERSION:178,EXPECTED_SPREADSHEET_ID:'prod',syncOutbox:{setMeta:async(k,v)=>diagnostics.push(v)},queueGoogleWorkspaceSync:()=>queued++,updateSyncIndicator:async()=>indicator++,console:{warn(){}}});
 const start=html.indexOf('      let recovery176Busy = false;');vm.runInContext(html.slice(start,html.indexOf('      // The v136 baseline marker',start)),a.ctx);
 return {...a,stats:()=>({queued,indicator,calls,diagnostics})};
}
test('transient read failure retries automatically after backoff; no repeated eager calls',async()=>{let n=0;const a=coordinator(async()=>{if(!n++)throw Error('RECOVERY_RECEIPTS_CHANGED');return 'completed';});await a.ctx.recoverAuditedSaleV176();assert.equal(a.stats().calls,1);await a.ctx.recoverAuditedSaleV176();assert.equal(a.stats().calls,1);a.advance(30000);await new Promise(r=>setImmediate(r));assert.equal(a.stats().calls,2);assert.equal(a.timers.size,0);});
test('recovery runs one request sequence at a time',async()=>{let release;const a=coordinator(()=>new Promise(r=>release=r));const p=a.ctx.recoverAuditedSaleV176();await a.ctx.recoverAuditedSaleV176();assert.equal(a.stats().calls,1);release('not-this-device');await p;assert.equal(a.timers.size,0);});
test('invalid source remains visible and never queues replay',async()=>{const a=coordinator(async()=>{throw Error('RECOVERY_QUANTITY_MISMATCH');});await a.ctx.recoverAuditedSaleV176();assert.equal(a.stats().queued,0);assert.equal(a.timers.size,0);assert.equal(a.stats().diagnostics[0].code,'RECOVERY_QUANTITY_MISMATCH');});
test('enqueued recovery nudges worker; later server ACK finishes checks',async()=>{let n=0;const a=coordinator(async()=>n++?'completed':'enqueued');await a.ctx.recoverAuditedSaleV176();assert.equal(a.stats().queued,1);a.advance(30000);await new Promise(r=>setImmediate(r));assert.equal(a.timers.size,0);});
test('retry backoff is capped at five minutes',async()=>{const a=coordinator(async()=>{throw Error('RECOVERY_STOCK_NOT_READY');});await a.ctx.recoverAuditedSaleV176();for(let i=0;i<7;i++){const t=[...a.timers.values()][0];assert.ok(t.delay>=30000&&t.delay<=300000);a.advance(t.delay);await new Promise(r=>setImmediate(r));}assert.equal([...a.timers.values()][0].delay,300000);});
test('startup does not await slow recovery; conflict banner precedes readiness green',()=>{assert.ok(!html.includes('await recoverAuditedSaleV176();'));const start=html.indexOf('      async function updateSyncIndicator(');const s=html.slice(start,html.indexOf('      function mergeStateFromBackend(',start));assert.ok(s.indexOf('if (conflicts.length)')<s.indexOf('ONLINE - MODULES READY'));});
