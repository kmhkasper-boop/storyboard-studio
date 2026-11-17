const CACHE = 'storyboard-studio-v3.4';
const SHELL = ['./', 'index.html', 'style.css', 'lib.js', 'app.js', 'vendor/Sortable.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network first for the app shell (so updates arrive), cache fallback offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok && !u.pathname.includes('/sample/')) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
