/** Service Worker for Zenkai PWA Offline Capabilities.
 * 
 * Caches essential assets for offline functionality.
 * Handles fetch events for offline fallback.
 */

const CACHE_NAME = "zenkai-v2";
const OFFLINE_URL = "/offline";

const assetsToCache = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  // Core application shells
  "/anime",
  "/manga",
  "/search",
  "/library",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((fetchResponse) => {
        // Check if we received a valid response
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== "basic") {
          return fetchResponse;
        }

        // Clone the response
        const responseToCache = fetchResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.addAll([
            event.request.url,
          ]).catch(() => {
            // Ignore cache errors for individual URLs
          });
        });

        return fetchResponse;
      });
    }).catch(() => {
      // Fallback to offline page for navigation requests
      if (event.request.mode === "navigate") {
        return caches.match(OFFLINE_URL);
      }
    })
  );
});
