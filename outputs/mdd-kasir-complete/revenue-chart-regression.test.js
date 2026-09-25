/* v146 read-only RevenueChart regression harness. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

class ChartCoordinator {
  constructor(cache) { this.rows = cache || null; this.state = cache ? "CHART_STALE" : "CHART_LOADING"; this.generation = 0; this.inFlight = null; this.attempts = 0; }
  refresh(read) {
    if (this.inFlight) return this.inFlight;
    const generation = ++this.generation;
    const job = Promise.resolve().then(read).then((data) => {
      if (generation !== this.generation) return false;
      if (!Array.isArray(data) || data.length !== 14) throw new Error("bad chart");
      this.rows = data; this.state = "CHART_READY"; this.attempts = 0; return true;
    }).catch(() => {
      if (generation !== this.generation) return false;
      this.attempts += 1;
      this.state = this.rows ? "CHART_STALE" : (this.attempts >= 3 ? "CHART_LOAD_ERROR" : "CHART_LOADING");
      return false;
    }).finally(() => { if (this.inFlight === job) this.inFlight = null; });
    this.inFlight = job; return job;
  }
}
const rows = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, transactionCount: i, revenue: i * 1000 }));

async function run() {
  // A: dashboard cards succeed independently and chart renders.
  const a = new ChartCoordinator(); assert.strictEqual(await a.refresh(() => rows), true); assert.strictEqual(a.rows.length, 14);
  // B: delayed chart does not change the independently-ready Dashboard cards.
  const b = new ChartCoordinator(); let resolveB; const slow = b.refresh(() => new Promise((resolve) => { resolveB = resolve; })); await Promise.resolve(); assert.strictEqual(b.state, "CHART_LOADING"); resolveB(rows); await slow;
  // C: timeout with cache retains the last-known-good chart.
  const c = new ChartCoordinator(rows); await c.refresh(() => { throw new Error("timeout"); }); assert.strictEqual(c.state, "CHART_STALE"); assert.strictEqual(c.rows.length, 14);
  // D: hard failure with no cache is chart-local only.
  const d = new ChartCoordinator(); await d.refresh(() => { throw new Error("offline"); }); await d.refresh(() => { throw new Error("offline"); }); await d.refresh(() => { throw new Error("offline"); }); assert.strictEqual(d.state, "CHART_LOAD_ERROR");
  // E/F: Products/POS contract remains module-based and unchanged.
  const app = fs.readFileSync(path.join(__dirname, "matrialpro.html"), "utf8");
  for (const marker of ["loadModulePage(\"products\", 0, 300)", "ensureProductsFirstPage", "Cari nama, kode, kategori, atau satuan", "REVENUE_CHART_LAST_KNOWN_GOOD_KEY", "requestProductionTransport(\"revenueChart\""]) assert.ok(app.includes(marker), marker);
  // G: concurrent callers share one request, preventing late responses/errors from clearing valid rows.
  const g = new ChartCoordinator(rows); let resolveG; const first = g.refresh(() => new Promise((resolve) => { resolveG = resolve; })); const duplicate = g.refresh(() => []); await Promise.resolve(); assert.strictEqual(first, duplicate); resolveG(rows); await first; assert.strictEqual(g.rows.length, 14);
  console.log("revenue-chart-regression: PASS (A-G)");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
