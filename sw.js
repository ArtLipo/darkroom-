const CACHE_NAME = 'darkroom-v4.8.2';
const BASE = new URL('./', self.location.href);
const FILES = ['./', 'index.html', 'photo-store.js', 'filters.js', 'processing.js', 'scan.js', 'poincare.js', 'poincare-worker.js', 'filter-worker.js', 'manifest.json', 'icon-192.png', 'icon-512_1.png'];
const ASSETS = FILES.map(path => new URL(path, BASE).href);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
  );
  // Activate only after existing sessions close, preserving unsaved photos.
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('darkroom-v') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (e.request.mode === 'navigate' &&
        (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname)) {
      const shell = await cache.match(new URL('index.html', BASE).href);
      if (shell) return shell;
    }
    const cached = await cache.match(e.request, { ignoreSearch: true });
    return cached || fetch(e.request);
  })());
});

// sprawdź aktualizacje przy każdym otwarciu
self.addEventListener('message', e => {
  if (e.data === 'checkUpdate') self.registration.update();
});
