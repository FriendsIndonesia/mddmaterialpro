const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync(__dirname + "/matrialpro.html", "utf8");
const backend = fs.readFileSync(__dirname + "/../../google-workspace-backend/Code.gs", "utf8");

assert.match(html, /PENDING_SYNC_STORAGE_KEY\s*=\s*"mdd_pending_sync_v1"/);
assert.match(html, /const syncOutbox = new MDDSyncV2\.Outbox\(\)/);
assert.match(html, /MDDSyncV2\.migrateLegacy/);
assert.match(html, /setTimeout\(\(\) => \{ if \(hasLocalSyncChanges\(\)\) queueGoogleWorkspaceSync\(\); \}, 600\)/);
assert.match(backend, /Jangan menerima snapshot penuh dari aplikasi lama/);
assert.doesNotMatch(backend, /Backward-compatible import: merge rows/);
assert.match(backend, /hasExplicitRemaining \? Math\.max\(0, remaining\)/);
assert.match(backend, /!isNewRow && table\.key === "products" && !base/);
assert.match(backend, /if \(!existingRowNumber && !isCreditRecord\) return/);
assert.match(html, /const APP_VERSION = 121/);
assert.match(html, /syncOutbox\.due\(25\)/);
assert.match(html, /syncOutbox\.mark\(\[\.\.\.acknowledged\], "acknowledged"/);
assert.match(html, /"products", "receipt"\]\.includes\(action\) \? 30000 : 10000/);
assert.match(html, /waitForSyncReceipt\(requestId, timeoutMs = 120000\)/);
assert.match(html, /waitForOperationAcknowledgements/);
assert.match(html, /MDDSyncV2\.retryDelay/);
assert.match(html, /clientVersion: APP_VERSION/);
assert.match(html, /requestGoogleWorkspaceJsonp\("health"/);
assert.match(backend, /const MINIMUM_CLIENT_VERSION = 107/);
assert.match(backend, /clientVersion < MINIMUM_CLIENT_VERSION/);
assert.match(backend, /action === "health"/);
assert.match(backend, /if \(!lock\.tryLock\(5000\)\)/);
assert.doesNotMatch(backend, /lock\.waitLock\(30000\)/);
assert.doesNotMatch(backend, /normalizeCashAccountNames_\(ss\);\s*ensureWorkbook_\(ss\);/);

const worker = fs.readFileSync(__dirname + "/service-worker.js", "utf8");
assert.match(worker, /mdd-material-pro-v121-verified-bootstrap/);
assert.match(worker, /sync-v2\.js/);
assert.match(worker, /MDD_FORCE_RELOAD/);

console.log("sync-resilience.test.js: refresh, forced update, health check, stok, dan saldo lulus");
