/* One audited pre-write stock rejection. Never a general conflict reset. */
const MDDRecovery176 = (() => {
  const command = '4b56f78e-6945-4947-a7fe-4b78f0318d29';
  const saleId = 'SAL-Q6D53';
  const expected = [
    ['d0b9a32c-b929-4964-9f05-eebc5a1e66c0','products','PRO-AA087B19-F64','stock_delta'],
    ['a2bb9be6-7b5f-4341-917c-d0654069b86a','products','PRO-69F9723E-BE8','stock_delta'],
    ['82828ea0-2a64-44dc-adaa-89c53ea3f011','products','PRO-57252B5B-2C0','stock_delta'],
    ['5dbd056c-6501-41d6-8653-b3c20de10de4','sales',saleId,'upsert'],
    ['49c48f61-1b70-4c18-a8d9-120449c7ea43','stockMoves','STK-S9479','upsert'],
    ['1d5064a3-1b0e-4cd6-9769-7b84ba49a47d','stockMoves','STK-XVPT5','upsert'],
    ['d10699cc-17fd-4e11-a960-5a332bcdf31e','stockMoves','STK-L191N','upsert']
  ];
  const key = 'v176-sale-Q6D53-recovery';
  const cloneId = id => id + '-r176';
  function validate(rows) {
    if (rows.length !== 7) throw Error('RECOVERY_SOURCE_INCOMPLETE');
    for (const [id,entity,entityId,type] of expected) {
      const matches = rows.filter(r => r.operationId === id);
      if (matches.length !== 1) throw Error('RECOVERY_SOURCE_MISMATCH');
      const r = matches[0];
      if (r.commandId !== command || r.entity !== entity || r.entityId !== entityId || r.type !== type || r.status !== 'conflict') throw Error('RECOVERY_SOURCE_MISMATCH');
      if (type === 'upsert' && (r.payload?.row?.id !== entityId || r.payload?.base)) throw Error('RECOVERY_NOT_A_NEW_RECORD');
      if (type === 'stock_delta' && (r.payload?.productId !== entityId || !Number.isFinite(r.payload?.delta) || r.payload.delta >= 0)) throw Error('RECOVERY_INVALID_STOCK');
    }
    const sale = rows.find(r => r.entity === 'sales').payload.row;
    if (!sale.invoiceNo || !Array.isArray(sale.items) || !sale.items.length || !Number.isFinite(Number(sale.total)) || Number(sale.total) <= 0) throw Error('RECOVERY_INVALID_SALE');
    const quantities = new Map();
    for (const item of sale.items) {
      const q = Number(item.primaryQty ?? item.qty);
      if (!Number.isFinite(q) || q <= 0) throw Error('RECOVERY_INVALID_QUANTITY');
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + q);
    }
    const deltas = rows.filter(r => r.type === 'stock_delta');
    if (quantities.size !== deltas.length || deltas.some(r => Math.abs((quantities.get(r.entityId) ?? NaN) + r.payload.delta) > 1e-6 || !quantities.has(r.entityId))) throw Error('RECOVERY_QUANTITY_MISMATCH');
    return sale;
  }
  async function run(a) {
    const marker = await a.box.getMeta(key);
    if (marker?.completed) return 'completed';
    const all = await a.box.list(['conflict','pending','sending','failed','acknowledged'],100000);
    const originals = all.filter(r => r.commandId === command);
    if (!originals.length) return 'not-this-device';
    const ids = expected.map(r => r[0]);
    const recoveryIds = ids.map(cloneId);
    const existing = all.filter(r => recoveryIds.includes(r.operationId));
    if (existing.length) {
      if (existing.length !== 7) throw Error('RECOVERY_QUEUE_INCOMPLETE');
      const ack = await a.ack(recoveryIds);
      if (ack?.ok && recoveryIds.every(id => (ack.acknowledged || []).includes(id))) {
        await a.box.mark(recoveryIds,'acknowledged',{lastError:'',resolvedBy:key});
        await a.box.mark(ids,'retired',{retainedForAudit:true,resolvedBy:key,lastError:''});
        await a.box.setMeta(key,{completed:true,at:new Date().toISOString(),recoveryIds});
        return 'completed';
      }
      return 'waiting'; // Never generate a second recovery after a timeout or rejection.
    }
    const sale = validate(originals);
    const ack = await a.ack(ids);
    if (!ack?.ok || !ids.every(id => (ack.conflicts || []).includes(id)) || (ack.acknowledged || []).some(id => ids.includes(id))) throw Error('RECOVERY_RECEIPTS_CHANGED');
    const snapshot = await a.snapshot();
    if (!snapshot || !Array.isArray(snapshot.sales) || !Array.isArray(snapshot.products) || !Array.isArray(snapshot.stockMoves)) throw Error('RECOVERY_SNAPSHOT_INCOMPLETE');
    if (snapshot.sales.some(r => r.id === saleId || r.invoiceNo === sale.invoiceNo)) throw Error('RECOVERY_SALE_ALREADY_EXISTS');
    if (snapshot.stockMoves.some(r => expected.some(e => e[1] === 'stockMoves' && e[2] === r.id))) throw Error('RECOVERY_STOCK_ALREADY_EXISTS');
    for (const op of originals.filter(r => r.type === 'stock_delta')) {
      const product = snapshot.products.find(p => p.id === op.entityId);
      const stock = Number(product?.stock ?? product?.stockAkhir);
      if (!product || !Number.isFinite(stock) || stock + op.payload.delta < -1e-6) throw Error('RECOVERY_STOCK_NOT_READY');
    }
    // Persist the unmodified evidence before creating a deterministic retry.
    await a.box.setMeta(key+'-archive',{records:originals,at:new Date().toISOString()});
    const clones = originals.map(source => ({...JSON.parse(JSON.stringify(source)),operationId:cloneId(source.operationId),commandId:cloneId(command),status:'pending',attempts:0,nextAttemptAt:0,lastError:'',terminal:false,recoveryOf:source.operationId,recoveryVersion:176}));
    await a.box.putMany(clones);
    await a.box.setMeta(key,{enqueued:true,recoveryIds});
    return 'enqueued';
  }
  return {run,validate,expected,command,key};
})();
if (typeof module !== 'undefined') module.exports = MDDRecovery176;
