/* SchaakHeld service worker. Strategie: netwerk eerst (altijd vers als er
   internet is), cache als vangnet (vliegtuigstand). VERSION wordt door
   build.sh gevuld met een hash van index.html, dus elke release krijgt
   vanzelf een nieuwe cache; een vergeten versie-bump kan niet. */
const VERSION = 'schaakheld-9e928ded7642';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png', './icon-512-mask.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(ASSETS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request).then(hit =>
      hit || (e.request.mode === 'navigate'
        ? caches.match('./').then(root => root || caches.match('./index.html'))
        : undefined)))
  );
});
