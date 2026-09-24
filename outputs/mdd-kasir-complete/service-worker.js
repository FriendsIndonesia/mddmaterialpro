// Shell cache only.  Business data, the durable outbox, localStorage and
// IndexedDB are deliberately outside Cache Storage and are never deleted here.
const CACHE_NAME = "mdd-material-pro-v132-production-identity";
const APP_SHELL = [
  "./",
  "./matrialpro.html",
  "./conversion-utils.js",
  "./sync-v2.js",
  "./manifest.webmanifest",
  "./mdd-material-pro-logo.png",
  "./mdd-material-pro-app-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Cache Storage is origin-wide: only remove MDD's own obsolete shell
      // caches. IndexedDB, localStorage, and any other site's caches remain
      // untouched.
      Promise.all(keys.filter((key) => key !== CACHE_NAME && key.startsWith("mdd-material-pro-")).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim()).then(() =>
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
        clients.forEach((client) => client.postMessage({ type: "MDD_FORCE_RELOAD", version: 132 }))
      )
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("./matrialpro.html", copy));
        return response;
      }).catch(() => caches.match("./matrialpro.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
    )
  );
});

