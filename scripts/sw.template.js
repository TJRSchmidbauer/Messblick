/* Service Worker: macht die App nach dem ersten Laden offline nutzbar.
   Die Dateiliste und die Version setzt beim Bauen das Vite-Plugin in vite.config.ts ein. */
const VERSION = '__VERSION__';
const CACHE = `pmw-${VERSION}`;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pmw-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Seitenaufruf: gespeicherte Startseite, auch bei Adressen mit Suchteil oder Anker
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true }) ?? (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('Offline: Diese Datei ist nicht gespeichert.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
