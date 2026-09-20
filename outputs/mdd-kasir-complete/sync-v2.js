(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MDDSyncV2 = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DB_NAME = "mdd-material-pro-sync-v2";
  const DB_VERSION = 1;
  const OPERATIONS_STORE = "operations";
  const META_STORE = "metadata";
  const STATUSES = ["pending", "sending", "acknowledged", "failed", "conflict"];
  const RETRY_DELAYS = [2000, 4000, 8000, 16000, 30000, 60000];

  function operationId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function retryDelay(attempt) {
    return RETRY_DELAYS[Math.min(Math.max(0, Number(attempt || 1) - 1), RETRY_DELAYS.length - 1)];
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    return JSON.stringify(value === undefined ? null : value);
  }

  function makeOperation(type, entity, entityId, payload, options) {
    const now = new Date().toISOString();
    return {
      operationId: operationId(),
      type: String(type || "mutation"),
      entity: String(entity || ""),
      entityId: String(entityId || ""),
      payload: clone(payload || {}),
      baseRevision: String(options?.baseRevision || ""),
      deviceId: String(options?.deviceId || ""),
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      nextAttemptAt: 0,
      lastError: ""
    };
  }

  function request(db, mode, storeName, action) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error || result?.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  class Outbox {
    constructor(indexedDBImpl) {
      this.indexedDB = indexedDBImpl || (typeof indexedDB !== "undefined" ? indexedDB : null);
      this.dbPromise = null;
    }
    open() {
      if (this.dbPromise) return this.dbPromise;
      if (!this.indexedDB) return Promise.reject(new Error("IndexedDB tidak tersedia"));
      this.dbPromise = new Promise((resolve, reject) => {
        const openRequest = this.indexedDB.open(DB_NAME, DB_VERSION);
        openRequest.onupgradeneeded = () => {
          const db = openRequest.result;
          if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
            const store = db.createObjectStore(OPERATIONS_STORE, { keyPath: "operationId" });
            store.createIndex("status", "status", { unique: false });
            store.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
          }
          if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
        };
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error || new Error("IndexedDB gagal dibuka"));
      });
      return this.dbPromise;
    }
    async put(operation) {
      if (!STATUSES.includes(operation.status)) throw new Error("Status outbox tidak valid");
      const db = await this.open();
      await request(db, "readwrite", OPERATIONS_STORE, (store) => store.put(clone(operation)));
      return operation;
    }
    async putMany(operations) {
      const db = await this.open();
      await request(db, "readwrite", OPERATIONS_STORE, (store) => {
        operations.forEach((operation) => store.put(clone(operation)));
      });
      return operations;
    }
    async get(operationIdValue) {
      const db = await this.open();
      return request(db, "readonly", OPERATIONS_STORE, (store) => store.get(operationIdValue));
    }
    async list(statuses, limit) {
      const db = await this.open();
      const rows = await request(db, "readonly", OPERATIONS_STORE, (store) => store.getAll());
      const wanted = new Set(statuses || STATUSES);
      return (rows || []).filter((row) => wanted.has(row.status)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, limit || 100);
    }
    async due(limit, now) {
      const rows = await this.list(["pending", "failed", "sending"], 10000);
      const timestamp = Number(now || Date.now());
      return rows.filter((row) => row.status !== "sending" || timestamp - Date.parse(row.updatedAt || 0) > 120000)
        .filter((row) => Number(row.nextAttemptAt || 0) <= timestamp).slice(0, limit || 25);
    }
    async mark(operationIds, status, extra) {
      const updates = [];
      for (const id of operationIds) {
        const row = await this.get(id);
        if (!row) continue;
        Object.assign(row, extra || {}, { status, updatedAt: new Date().toISOString() });
        updates.push(row);
      }
      if (updates.length) await this.putMany(updates);
      return updates;
    }
    async markSending(rows) {
      const updates = rows.map((row) => Object.assign({}, row, { status: "sending", attempts: Number(row.attempts || 0) + 1, updatedAt: new Date().toISOString() }));
      if (updates.length) await this.putMany(updates);
      return updates;
    }
    async markFailed(rows, error) {
      const updates = rows.map((row) => Object.assign({}, row, {
        status: "failed",
        lastError: String(error?.message || error || "Sync gagal"),
        nextAttemptAt: Date.now() + retryDelay(row.attempts || 1),
        updatedAt: new Date().toISOString()
      }));
      if (updates.length) await this.putMany(updates);
      return updates;
    }
    async deleteByStatuses(statuses) {
      const rows = await this.list(statuses || [], 1000000);
      if (!rows.length) return 0;
      const db = await this.open();
      await request(db, "readwrite", OPERATIONS_STORE, (store) => {
        rows.forEach((row) => store.delete(row.operationId));
      });
      return rows.length;
    }
    async deleteByOperationIds(operationIds) {
      const ids = [...new Set((operationIds || []).map(String).filter(Boolean))];
      if (!ids.length) return 0;
      const db = await this.open();
      await request(db, "readwrite", OPERATIONS_STORE, (store) => {
        ids.forEach((id) => store.delete(id));
      });
      return ids.length;
    }
    async deleteMeta(keys) {
      const wanted = (keys || []).map(String).filter(Boolean);
      if (!wanted.length) return 0;
      const db = await this.open();
      await request(db, "readwrite", META_STORE, (store) => {
        wanted.forEach((key) => store.delete(key));
      });
      return wanted.length;
    }
    async setMeta(key, value) {
      const db = await this.open();
      await request(db, "readwrite", META_STORE, (store) => store.put({ key, value: clone(value), updatedAt: new Date().toISOString() }));
    }
    async getMeta(key) {
      const db = await this.open();
      const row = await request(db, "readonly", META_STORE, (store) => store.get(key));
      return row?.value;
    }
  }

  function rowsFromLegacyPending(pending, options) {
    const operations = [];
    Object.entries(pending?.tables || {}).forEach(([entity, change]) => {
      (change.upserts || []).forEach((row) => operations.push(makeOperation("upsert", entity, row.id, { row, base: change.baseRows?.[row.id] || null }, options)));
      (change.deletes || []).forEach((id) => operations.push(makeOperation("delete", entity, id, { id }, options)));
    });
    if (Object.keys(pending?.settings || {}).length) operations.push(makeOperation("settings", "settings", "settings", { settings: pending.settings }, options));
    return operations;
  }

  function reconciliationPayload(operation) {
    return {
      operationId: String(operation?.operationId || ""),
      type: String(operation?.type || ""),
      entity: String(operation?.entity || ""),
      entityId: String(operation?.entityId || ""),
      fingerprint: stableStringify(operation?.payload?.row || operation?.payload?.payment || null),
      // Reconciliation needs the original baseline as well as the requested
      // values. A fingerprint alone cannot distinguish a legitimate update
      // from a stale overwrite of the same stable entity.
      row: operation?.payload?.row || operation?.payload?.payment || null,
      base: operation?.payload?.base || null
    };
  }

  function classifyReconciliation(response, operations) {
    const acknowledged = new Set([...(response?.acknowledged || []), ...(response?.alreadyPresent || [])].map(String));
    const conflicts = new Set((response?.conflicts || []).map(String));
    const manualReview = new Set((response?.manualReview || []).map(String));
    const known = new Set((operations || []).map((row) => String(row.operationId || "")));
    return {
      acknowledged: [...acknowledged].filter((id) => known.has(id)),
      conflicts: [...conflicts].filter((id) => known.has(id)),
      manualReview: [...manualReview].filter((id) => known.has(id)),
      pending: (operations || []).map((row) => String(row.operationId || "")).filter((id) => id && !acknowledged.has(id) && !conflicts.has(id) && !manualReview.has(id))
    };
  }

  function validateProductionBaseline(response, expectedProductCount, businessKeys, expectedSpreadsheetId) {
    if (!response?.ok || !response.data || typeof response.data !== "object") return { ok: false, error: "response-invalid" };
    if (expectedSpreadsheetId && String(response.spreadsheetId || "") !== String(expectedSpreadsheetId)) return { ok: false, error: "spreadsheet-mismatch" };
    const missing = (businessKeys || []).filter((key) => !Array.isArray(response.data[key]));
    if (missing.length) return { ok: false, error: "snapshot-incomplete", missing };
    const products = response.data.products || [];
    const ids = new Set(products.map((row) => String(row?.id || "").trim()).filter(Boolean));
    const active = products.filter((row) => ![false, 0, "0", "false", "inactive"].includes(row?.active)).length;
    if (products.length !== expectedProductCount || ids.size !== expectedProductCount || active !== expectedProductCount) {
      return { ok: false, error: "products-invalid", products: products.length, unique: ids.size, active };
    }
    return { ok: true, products: products.length, unique: ids.size, active };
  }

  async function migrateLegacy(outbox, localStorageImpl, config) {
    const storage = localStorageImpl;
    const markerKey = `migration:${config.storageKey}:v1`;
    const existing = await outbox.getMeta(markerKey);
    if (existing?.verified) return existing;
    const rawState = storage?.getItem(config.storageKey);
    const rawPending = storage?.getItem(config.pendingKey);
    let stateSnapshot = null;
    let pending = null;
    try { stateSnapshot = rawState ? JSON.parse(rawState) : null; } catch {}
    try { pending = rawPending ? JSON.parse(rawPending) : null; } catch {}
    if (stateSnapshot) await outbox.setMeta("legacyStateSnapshot", stateSnapshot);
    const operations = rowsFromLegacyPending(pending, config.operationOptions || {});
    if (operations.length) await outbox.putMany(operations);
    const verification = {
      copiedAt: new Date().toISOString(),
      stateCopied: Boolean(stateSnapshot),
      operationCount: operations.length,
      verified: operations.length === 0 || (await outbox.list(STATUSES, 100000)).filter((row) => operations.some((item) => item.operationId === row.operationId)).length === operations.length,
      legacyStoragePreserved: Boolean(rawState !== null || rawPending !== null)
    };
    await outbox.setMeta(markerKey, verification);
    // Sengaja tidak pernah menghapus localStorage legacy.
    return verification;
  }

  return { DB_NAME, DB_VERSION, STATUSES, RETRY_DELAYS, Outbox, operationId, makeOperation, retryDelay, rowsFromLegacyPending, migrateLegacy, stableStringify, reconciliationPayload, classifyReconciliation, validateProductionBaseline };
});
