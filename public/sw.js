// App-shell cache so the desk opens instantly as an installed app. Market data (/api) is never cached here.
const CACHE = 'desk-shell-v2';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // network first, fall back to the cached shell when offline
  // A missing /assets/ file may be a 404 the browser saved during a deploy: ask the server again, skipping the saved copy.
  const go = () => fetch(e.request).then((r) => (r.status === 404 && u.pathname.startsWith('/assets/') ? fetch(e.request, { cache: 'reload' }) : r));
  e.respondWith(go().then((r) => { if (r.ok && (u.pathname === '/' || u.pathname.startsWith('/assets/'))) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
