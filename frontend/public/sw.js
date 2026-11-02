const CACHE_NAME = "zenkai-pwa-v3";
const STATIC_ASSETS = [
  "/",
  "/assets/zenkai-logo-transparent.svg",
  "/assets/app_logo.png",
  "/assets/zenkai-hero.svg",
];

// Install event: cache the app shell for offline use
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore single asset fetch failure during sw install
      });
    })
  );
  self.skipWaiting();
});

// Activate event: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Store a copy only when the response is actually cacheable (200, not 404)
function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return response;
  }
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  return response;
}

// Network first, cache only as an offline fallback.
// Never serve stale HTML or hashed /_next/ assets: a previous deploy's HTML
// points at CSS/JS chunk hashes that no longer exist, which leaves the page
// completely unstyled.
function networkFirst(request, fallback) {
  return fetch(request)
    .then((response) => putInCache(request, response))
    .catch(() => caches.match(request).then((cached) => cached || fallback));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests or browser extension URLs
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // Never intercept Range requests (avoids Cache API DOMException 206 for video/audio streams)
  if (request.headers.has("range")) {
    return;
  }

  // Never cache ephemeral playback tokens, source resolution, or direct media chunks
  if (
    url.pathname.includes("/playback") ||
    url.pathname.includes("/sources") ||
    url.pathname.endsWith(".m3u8") ||
    url.pathname.endsWith(".ts")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // API Requests: Network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Pages and Next.js build assets: network-first, offline fallback only
  if (request.mode === "navigate" || url.pathname.startsWith("/_next/")) {
    event.respondWith(
      networkFirst(request, request.mode === "navigate" ? caches.match("/") : undefined)
    );
    return;
  }

  // Other static assets (logos, icons): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => putInCache(request, networkResponse))
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
