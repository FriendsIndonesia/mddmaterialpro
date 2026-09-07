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

console.log("sync-resilience.test.js: perlindungan refresh, perangkat lama, stok, dan saldo lulus");
