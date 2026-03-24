const SW_VERSION = "v5.3";
const CACHE_NAME = `jronda-offline-${SW_VERSION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/sw.js",
  "/src/core/bootstrap.js",
  "/src/core/render.js",
  "/src/core/render-utils.js",
  "/src/core/map-renderer.js",
  "/src/core/layout-engine.js",
  "/src/core/spatial-index.js",
  "/src/core/tooltip-manager.js",
  "/src/core/gps-manager.js",
  "/src/core/interaction-bindings.js",
  "/src/core/ui.js",
  "/src/core/interaction.js",
  "/src/core/kioskSecurity.js",
  "/src/core/routerLogic.js",
  "/src/utils/format.js",
  "/src/utils/min-heap.js",

  "/src/style/routeStyle.js"
];
const DATA_CACHE = ["/data/rail/**", "/data/bus/**", "/data/poi/**", "/data/hoho/**", "/data/gokl/**"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();

  // Register background sync for GTFS updates if supported
  if ('serviceWorker' in navigator && 'sync' in self.registration) {
    self.registration.sync.register('jronda-data-sync');
  }

  // Broadcast service worker version for client debugging
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: "SW_VERSION", version: SW_VERSION });
    });
  });
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((cached) => {
        if (cached) return cached;
        return fetch(request).catch(() => caches.match("/index.html"));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // If request is data API, prefer network first with cache fallback
      if (url.pathname.startsWith("/data/")) {
        return fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached || Promise.reject("data fetch error"));
      }

      // App shell stale-while-revalidate
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "jronda-data-sync") {
    event.waitUntil(
      // Trigger GTFS update via app proxy or direct data refresh
      Promise.all([
        fetch("/data/rail/rail.js?t=" + Date.now()).then(resp => resp.ok && caches.open(CACHE_NAME).then(cache => cache.put("/data/rail/rail.js", resp.clone()))).catch(() => {}),
        fetch("/data/bus/rapidbus.js?t=" + Date.now()).then(resp => resp.ok && caches.open(CACHE_NAME).then(cache => cache.put("/data/bus/rapidbus.js", resp.clone()))).catch(() => {}),
        fetch("/data/bus/timetables.js?t=" + Date.now()).then(resp => resp.ok && caches.open(CACHE_NAME).then(cache => cache.put("/data/bus/timetables.js", resp.clone()))).catch(() => {})
      ]).then(() => {
        // Notify clients to reload data
        self.clients.matchAll().then(clients => clients.forEach(client => client.postMessage({type: 'data-updated', timestamp: Date.now()})));
      })
    );
  }
});
