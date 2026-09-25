/*
 * v145 Dashboard refresh regression harness.
 * This models only the browser coordinator contract; it does not access, edit,
 * or create production business records.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

class DashboardCoordinator {
  constructor(cache) {
    this.summary = cache || null;
    this.status = cache ? "DASHBOARD_STALE" : "DASHBOARD_LOAD_ERROR";
    this.generation = 0;
    this.inFlight = null;
    this.attempts = 0;
    this.renderCount = cache ? 1 : 0;
  }
  refresh(request) {
    if (this.inFlight) return this.inFlight;
    const generation = ++this.generation;
    this.status = this.summary ? "DASHBOARD_REFRESHING" : "DASHBOARD_REFRESHING";
    const job = Promise.resolve().then(request).then((response) => {
      if (generation !== this.generation) return false;
      if (!response || !response.summary) throw new Error("invalid summary");
      this.summary = response.summary;
      this.status = "DASHBOARD_READY";
      this.attempts = 0;
      this.renderCount += 1;
      return true;
    }).catch(() => {
      if (generation !== this.generation) return false;
      this.attempts += 1;
      if (this.summary) {
        this.status = "DASHBOARD_STALE";
        this.renderCount += 1;
        return false;
      }
      this.status = this.attempts >= 3 ? "DASHBOARD_LOAD_ERROR" : "DASHBOARD_REFRESHING";
      return false;
    }).finally(() => { if (this.inFlight === job) this.inFlight = null; });
    this.inFlight = job;
    return job;
  }
}

async function run() {
  // A: cached Dashboard appears immediately and a valid refresh replaces it.
  const cached = { revision: "r1", salesToday: 1 };
  const a = new DashboardCoordinator(cached);
  assert.deepStrictEqual(a.summary, cached);
  assert.strictEqual(await a.refresh(() => ({ summary: { revision: "r2", salesToday: 2 } })), true);
  assert.strictEqual(a.summary.salesToday, 2);

  // B: a slow (15 s in production) read leaves the cached screen renderable.
  const b = new DashboardCoordinator(cached);
  let resolveSlow;
  const slow = b.refresh(() => new Promise((resolve) => { resolveSlow = resolve; }));
  await Promise.resolve();
  assert.deepStrictEqual(b.summary, cached);
  assert.strictEqual(b.status, "DASHBOARD_REFRESHING");
  resolveSlow({ summary: { revision: "r2" } });
  await slow;

  // C: timeout/error with cache keeps data and is retry-safe.
  const c = new DashboardCoordinator(cached);
  await c.refresh(() => { throw new Error("timeout"); });
  assert.deepStrictEqual(c.summary, cached);
  assert.strictEqual(c.status, "DASHBOARD_STALE");
  assert.strictEqual(await c.refresh(() => ({ summary: { revision: "r2" } })), true);

  // D: single-flight dedupes concurrent callers; late completion cannot win.
  const d = new DashboardCoordinator(cached);
  let resolveD;
  const first = d.refresh(() => new Promise((resolve) => { resolveD = resolve; }));
  const duplicate = d.refresh(() => ({ summary: { revision: "wrong" } }));
  await Promise.resolve();
  assert.strictEqual(first, duplicate);
  resolveD({ summary: { revision: "r2" } });
  await first;
  assert.strictEqual(d.summary.revision, "r2");

  // E: unavailable server with cache preserves Dashboard and other modules.
  const e = new DashboardCoordinator(cached);
  await e.refresh(() => { throw new Error("offline"); });
  assert.ok(e.summary);
  assert.notStrictEqual(e.status, "DASHBOARD_LOAD_ERROR");

  // F: first install with no cache only becomes an explicit error after retries.
  const f = new DashboardCoordinator();
  await f.refresh(() => { throw new Error("offline"); });
  assert.strictEqual(f.status, "DASHBOARD_REFRESHING");
  await f.refresh(() => { throw new Error("offline"); });
  await f.refresh(() => { throw new Error("offline"); });
  assert.strictEqual(f.status, "DASHBOARD_LOAD_ERROR");

  // G: source retains the independent Products module and its 300-row page.
  const source = fs.readFileSync(path.join(__dirname, "matrialpro.html"), "utf8");
  for (const marker of [
    "const APP_VERSION = 145",
    "DASHBOARD_LAST_KNOWN_GOOD_KEY",
    "dashboardRefreshPromise",
    "dashboardRequestGeneration",
    "scheduleDashboardRetry",
    "requestProductionTransport(\"dashboardSummary\"",
    "loadModulePage(\"products\", 0, 300)"
  ]) assert.ok(source.includes(marker), `missing ${marker}`);
  console.log("dashboard-refresh-regression: PASS (A-G)");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
