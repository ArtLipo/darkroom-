const CACHE_NAME = 'darkroom-v1';
const FILES = [
  '/darkroom-/',
  '/darkroom-/index.html',
  '/darkroom-/manifest.json',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Bebas+Neue&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
