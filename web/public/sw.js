// Cache Storage belongs to an origin, not a Service Worker scope.
// Keep separate installations on the same origin from deleting each other's cache.
const PREFIX = `the-rest-of-today:${self.registration.scope}:`;
const CACHE = `${PREFIX}v1.4.0`;
const ASSETS = ['./', './index.html', './styles.css', './src/app.js', './src/storage.js', './src/charts.js', './shared/domain.js', './manifest.webmanifest', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png'];
const assetUrls = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  // Revalidate HTTP caches while installing. A failed install must leave the
  // previous working version active. Updates wait for the app's save/reload prompt.
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll([...assetUrls].map(url => new Request(url, { cache: 'reload' }))))
    .then(() => { if (!self.registration.active) return self.skipWaiting(); }));
});
self.addEventListener('activate', event => {
  // Legacy unscoped caches may still belong to a different installation.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  url.search = '';
  if (event.request.method !== 'GET' || !assetUrls.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    // Online reloads use current files even when a later release changes only JS
    // or CSS. Offline still uses the last successfully cached application.
    try {
      const response = await fetch(new Request(event.request, { cache: 'no-cache' }));
      if (response.ok) {
        try { await cache.put(url.href, response.clone()); } catch { /* Storage full: keep the network response usable. */ }
        return response;
      }
      const cached = await cache.match(url.href);
      return cached || response;
    } catch (error) {
      const cached = await cache.match(url.href);
      if (cached) return cached;
      throw error;
    }
  }));
});
