/* Service worker застосунку «Перевірки» (PWA, /app).
   - оболонка застосунку (сторінка /app, стилі, скрипти, іконки) кешується — відкривається миттєво й без мережі;
   - сторінки: спершу мережа, без мережі — збережена копія або /offline.html;
   - /assets/: віддаємо з кешу й тихо оновлюємо у фоні (stale-while-revalidate);
   - запити до Supabase, WayForPay, CDN та інших доменів не чіпаємо: дані перевірок завжди свіжі.
   Змінили оболонку — підніміть VERSION, і старий кеш прибереться. */
const VERSION = 'mb-app-v1';
const SHELL = ['/app', '/offline.html', '/assets/css/app.css', '/assets/js/config.js', '/assets/js/db.js',
  '/assets/js/vehicle-check.js', '/assets/js/car-photos.js', '/assets/js/company-check.js', '/assets/js/pdf-snap.js',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname === '/app') (await caches.open(VERSION)).put('/app', res.clone());
        return res;
      } catch (_) {
        const c = await caches.open(VERSION);
        return (await c.match(url.pathname === '/app' ? '/app' : req)) || (await c.match('/offline.html'));
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});
