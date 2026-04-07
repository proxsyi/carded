const CACHE_NAME = "carded-static-v18";
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./login/index.html",
  "./signin/index.html",
  "./signup/index.html",
  "./setup/index.html",
  "./library/index.html",
  "./study/index.html",
  "./account/index.html",
  "./pending-deletion/index.html",
  "./tos/index.html",
  "./privacy/index.html",
  "./404.html",
  "./theme.js?v=4.0.0",
  "./config.js?v=4.0.0",
  "./utils.js?v=4.0.0",
  "./auth-guard.js?v=4.0.0",
  "./components.js?v=4.0.0",
  "./auth.js?v=4.0.0",
  "./db.js?v=4.0.0",
  "./supabase-db.js?v=4.0.0",
  "./sync.js?v=4.0.0",
  "./shortcuts.js?v=4.0.0",
  "./walkthrough.js?v=4.0.0",
  "./app.js?v=4.0.0",
  "./styles.css?v=4.0.0",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/favicon.png",
  "./assets/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.101.1",
  "https://cdn.jsdelivr.net/npm/dexie@4.4.2/dist/dexie.min.js",
  "https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js",
  "https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
];

function isSupabaseRequest(url) {
  return url.hostname.endsWith(".supabase.co");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS))
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
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (isSupabaseRequest(url)) {
    return;
  }

  // Navigation requests (page loads): network-first so Safari always gets a fresh
  // HTML response and never accidentally serves a cached redirect as a download.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline: try cached navigation URL, then the pre-cached index.html variant
          const indexUrl = url.pathname.replace(/\/?$/, "/") + "index.html";
          return caches.match(new Request(url.origin + indexUrl))
            .then((r) => r || caches.match(event.request))
            .then((r) => r || caches.match(self.registration.scope));
        })
    );
    return;
  }

  // Sub-resources (JS, CSS, images): cache-first
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
