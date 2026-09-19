const CACHE_NAME = "mdd-material-pro-v118-sync-v2";
const CORE_SHELL = [
  "./matrialpro.html",
  "./conversion-utils.js",
  "./sync-v2.js"
];
const OPTIONAL_SHELL = [
  "./",
  "./manifest.webmanifest",
  "./mdd-material-pro-logo.png",
  "./mdd-material-pro-app-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

async function cacheAsset(cache, path, required) {
  try {
    const response = await fetch(new Request(path, { cache: "reload" }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(path, response);
    return true;
  } catch (error) {
    if (required) throw new Error(`Aset inti gagal disimpan: ${path} (${error.message || error})`);
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of CORE_SHELL) await cacheAsset(cache, path, true);
    await Promise.all(OPTIONAL_SHELL.map((path) => cacheAsset(cache, path, false)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("./matrialpro.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("./matrialpro.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});

