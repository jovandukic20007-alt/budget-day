/* Offline support. Network first so updates show up right away; the cache is only a fallback when offline. */
const CACHE = 'myday-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'google.js', 'school.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Pages opened by an older version reload themselves so the new code is used straight away
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach((w) => w.navigate(w.url).catch(() => {}));
  })());
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google APIs go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(e.request, { cache: 'no-cache' });
      if (fresh.ok) cache.put(e.request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(e.request)) || (await cache.match('index.html')) || Response.error();
    }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => list.length ? list[0].focus() : self.clients.openWindow('./')));
});
