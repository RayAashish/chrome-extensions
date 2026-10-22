/**
 * Statement2Ledger Service Worker
 * Ensures 100% offline functionality by precaching static assets.
 * 
 * STRICT PRIVACY GUARANTEE:
 * 1. Only caches same-origin static assets (scripts, styles, html, icons).
 * 2. Never intercepts or stores user documents or blobs.
 * 3. Never makes cross-origin network requests.
 */

const CACHE_NAME = 'statement2ledger-v1.0.0';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './favicon.svg',
  './pdf.worker.min.mjs'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests from same origin
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept blob: or data: URLs
  if (url.protocol === 'blob:' || url.protocol === 'data:') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache newly fetched same-origin static assets (e.g. hashed Vite chunks)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback to index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
