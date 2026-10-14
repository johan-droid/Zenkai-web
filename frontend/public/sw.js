const CACHE_NAME = "zenkai-pwa-v2";
const STATIC_ASSETS = [
  "/",
  "/anime",
  "/manga",
  "/schedule",
  "/library",
  "/history",
  "/settings",
  "/search",
  "/assets/zenkai-logo-transparent.svg",
  "/assets/app_logo.png",
  "/assets/zenkai-hero.svg",
];

// Install event: cache static app shell
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

// Fetch event: Network-first for API, Stale-While-Revalidate for pages/static
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
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Static Assets / Pages: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            !networkResponse.headers.get("content-type")?.includes("video")
          ) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and page request, fallback to root shell
          if (request.mode === "navigate") {
            return caches.match("/");
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
