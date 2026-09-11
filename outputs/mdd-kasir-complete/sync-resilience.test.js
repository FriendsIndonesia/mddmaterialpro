const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");
const backend = fs.readFileSync(__dirname + "/../../google-workspace-backend/Code.gs", "utf8");

assert.match(html, /PENDING_SYNC_STORAGE_KEY\s*=\s*"mdd_pending_sync_v1"/);
assert.match(html, /persistDurablePendingSync\(\);[\s\S]*queueGoogleWorkspaceSync\(\)/);
assert.match(html, /setTimeout\(\(\) => \{ if \(hasLocalSyncChanges\(\)\) queueGoogleWorkspaceSync\(\); \}, 600\)/);
assert.match(backend, /Jangan menerima snapshot penuh dari aplikasi lama/);
assert.doesNotMatch(backend, /Backward-compatible import: merge rows/);
assert.match(backend, /hasExplicitRemaining \? Math\.max\(0, remaining\)/);
assert.match(backend, /!isNewRow && table\.key === "products" && !base/);
assert.match(backend, /if \(!existingRowNumber && !isCreditRecord\) return/);
assert.match(html, /const APP_VERSION = 109/);
assert.match(html, /clientVersion: APP_VERSION/);
assert.match(html, /requestGoogleWorkspaceJsonp\("health"/);
assert.match(backend, /const MINIMUM_CLIENT_VERSION = 107/);
assert.match(backend, /clientVersion < MINIMUM_CLIENT_VERSION/);
assert.match(backend, /action === "health"/);

const worker = fs.readFileSync(__dirname + "/service-worker.js", "utf8");
assert.match(worker, /mdd-material-pro-v109-report-search-actions/);
assert.match(worker, /MDD_FORCE_RELOAD/);

console.log("sync-resilience.test.js: refresh, forced update, health check, stok, dan saldo lulus");
