const CACHE = 'storyboard-studio-v4.3';
const SHELL = ['./', 'index.html', 'style.css', 'lib.js', 'app.js', 'version.json', 'vendor/Sortable.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
// install the new version straight away (bypassing the browser's HTTP cache) and take over open windows
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (e.request.headers.has('range') || /^(video|audio)$/.test(e.request.destination)) return; // media streams go straight to the network
  // network first for the app shell (revalidated, so updates arrive at once), cache fallback offline
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { if (r.ok && !u.pathname.includes('/sample/')) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
