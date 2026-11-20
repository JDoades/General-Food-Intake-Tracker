// Ish service worker: keeps the app working offline.
// It only ever serves this site's own files. It never contacts any other site.

// Stamped by `npm run stamp` from the contents of every file below. Don't edit by hand.
const VERSION = 'ish-core-9d6cd375fa';

const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/actions.js',
  'js/app.js',
  'js/backup.js',
  'js/calc.js',
  'js/foods.js',
  'js/photo-files.js',
  'js/photo-rank.js',
  'js/photo-worker.js',
  'js/photo.js',
  'js/search.js',
  'js/store.js',
  'js/ui/add.js',
  'js/ui/dom.js',
  'js/ui/entry.js',
  'js/ui/parts.js',
  'js/ui/ring.js',
  'js/ui/settings.js',
  'js/ui/today.js',
  'js/ui/week.js',
  'vendor/ort/ort.wasm.bundle.min.mjs',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 'reload' skips the browser's HTTP cache so an update never mixes old and new files
    await cache.addAll(CORE.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Remove old app versions. The photo model cache is kept.
    await Promise.all(keys.filter((k) => k.startsWith('ish-core-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const shell = await cache.match('index.html');
      return shell || fetch(req);
    })());
    return;
  }

  // Cache first (app files and the downloaded photo model), network as a fallback
  event.respondWith((async () => {
    const hit = await caches.match(req);
    return hit || fetch(req);
  })());
});
