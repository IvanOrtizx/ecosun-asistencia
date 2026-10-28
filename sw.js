/* sw.js — guarda la app en el celular para abrirla sin señal y envía la cola en segundo plano (Android). */
var VERSION = 'ecosun-v1.0.7';
var ARCHIVOS = [
  './', 'index.html', 'panel.html', 'manifest.webmanifest',
  'css/app.css', 'css/empleado.css', 'css/panel.css',
  'js/config.js', 'js/db.js', 'js/reloj.js', 'js/api.js', 'js/cola.js', 'js/util.js', 'js/geo.js', 'js/camara.js', 'js/consentimiento.js', 'js/app.js', 'js/panel.js',
  'vendor/jsQR.js', 'vendor/qrcode.js',
  'vendor/fonts/inter-latin-400-normal.woff2', 'vendor/fonts/inter-latin-500-normal.woff2', 'vendor/fonts/inter-latin-600-normal.woff2', 'vendor/fonts/inter-latin-700-normal.woff2', 'vendor/fonts/inter-latin-800-normal.woff2',
  'img/logo-ecosun.png', 'img/icono-192.png', 'img/icono-512.png', 'img/icono-180.png'
];
importScripts('js/config.js', 'js/db.js', 'js/api.js', 'js/cola.js');

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // las llamadas al servidor (POST) van directo
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Páginas: red primero (para recibir actualizaciones), caché si no hay señal
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); return r; })
      .catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); }); }));
    return;
  }
  // Archivos: caché primero
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) {
    return r || fetch(req).then(function (resp) { if (resp.ok) { var cp = resp.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); } return resp; });
  }));
});
// Background Sync (Chrome en Android): envía la cola aunque la app esté cerrada
self.addEventListener('sync', function (e) {
  if (e.tag !== 'cola') return;
  e.waitUntil(Cola.enviar().then(function (r) {
    return self.clients.matchAll().then(function (cs) { cs.forEach(function (c) { c.postMessage({ tipo: 'cola', r: r }); }); })
      .then(function () { if (r.error === 'red') throw new Error('sin red'); });   // lanzar = el navegador reintenta luego
  }));
});
