/* =========================================================================
   sw.js — service worker (hand-rolled, no Workbox)
   =========================================================================
   Makes Workspace installable and usable offline. The app is already a
   client-only static site — all data lives in local Markdown files or your
   Google Drive — so the only thing to cache is the app shell itself.

   Strategy:
     • App shell (index.html, manifest, icons) is precached on install.
     • Same-origin static assets (Vite's hashed JS/CSS/etc.) use
       stale-while-revalidate: serve from cache instantly, refresh in the
       background. Hashed filenames make this safe.
     • Navigations are network-first, falling back to the cached shell so the
       app opens offline.
     • Cross-origin requests are NOT intercepted — Google Identity Services
       (accounts.google.com) and the Google Drive API (googleapis.com) always
       go straight to the network, so auth and sync never touch the cache.

   Update model: classic lifecycle (no skipWaiting). A new version activates
   once all tabs are closed, then old caches are pruned — no mid-session asset
   swaps. Bump CACHE to force a fresh app-shell cache on deploy.
   ========================================================================= */

const CACHE = 'workspace-v2.4.0';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/dict/en.txt',   // offline spell-check dictionary
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  // Only cache complete, same-origin, OK responses.
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Only handle same-origin http(s). Everything else (Google OAuth/Drive,
  // data:, blob:, extensions) is left to the browser untouched.
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigations → network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => cachePut(request, res))
        .catch(() => caches.match(request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Static assets → stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(res => cachePut(request, res))
        .catch(() => cached);
      return cached || network;
    })
  );
});
