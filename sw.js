const CACHE_NAME = "jronda-offline-v4.6";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/src/core/kioskSecurity.js",
  "/src/core/interaction.js",
  "/src/core/ui.js",
  "/src/core/bootstrap.js",
  "/src/core/render.js",
  "/src/core/routerLogic.js",
  "/src/style/kiosk.css",
  "/src/style/routeStyle.js",
  "/src/img/bus.svg",
  "/src/img/train-noPanthograph.svg",
  "/src/img/train-panthograph.svg",
  "/src/img/Interchange_icon.svg",
  "/src/img/Connecting_icon.svg",
  "/data/rail/stations.js",
  "/data/rail/rail.js",
  "/data/rail/timetables.js",
  "/data/bus/timetables.js",
  "/data/poi/poi.js",
  "/data/gokl/goKL.js",
  "/data/bus/rapidbus.js",
  "/data/hoho/hoho.js",
];

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
