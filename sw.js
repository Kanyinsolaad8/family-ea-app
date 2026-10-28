/* Offline shell and phone alerts for Family EA. Your data is never cached here, only the app's own files. */
var CACHE = 'fea-shell-v2.6.0';
var SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'demo.js', 'quotes.js', 'games.js', 'food.js', 'config.js', 'fonts/ss-400.woff2', 'fonts/ss-600.woff2', 'fonts/ss-700.woff2', 'fonts/ss-400i.woff2', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API and fonts go straight to the network
  // Cache first so the app opens instantly; fetch a fresh copy in the background for next time.
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then(function (hit) {
      var net = fetch(e.request).then(function (res) { if (res && res.ok) c.put(e.request, res.clone()); return res; });
      if (hit) { net.catch(function () {}); return hit; }
      return net.catch(function () { return c.match('index.html'); });
    });
  }));
});

/* ── Phone alerts. The push itself is empty; the text is fetched from your EA with your own key. ── */
function idb() { return new Promise(function (res, rej) { var r = indexedDB.open('fea', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
function idbGet(k) { return idb().then(function (db) { return new Promise(function (res) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }).catch(function () { return undefined; }); }
function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); }).catch(function () {}); }

function showAlerts() {
  var opts = { icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: self.registration.scope } };
  return Promise.all([idbGet('cfg'), idbGet('seen')]).then(function (v) {
    var cfg = v[0], seen = v[1] || '';
    if (!cfg || !cfg.key || !cfg.api) throw new Error('not linked');
    return fetch(cfg.api + '?action=alerts&key=' + encodeURIComponent(cfg.key) + '&since=' + encodeURIComponent(seen), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = (j && j.alerts) || [];
        if (!list.length) throw new Error('none');
        return idbSet('seen', list[list.length - 1].ts).then(function () {
          return Promise.all(list.slice(-3).map(function (a) {
            return self.registration.showNotification(a.title || 'Family EA', Object.assign({ body: a.body || '', tag: a.id, timestamp: Date.parse(a.ts) || Date.now() }, opts));
          }));
        });
      });
  }).catch(function () {
    return self.registration.showNotification('Family EA', Object.assign({ body: 'You have a new reminder. Tap to open.', tag: 'fea-generic' }, opts));
  });
}
self.addEventListener('push', function (e) { e.waitUntil(showAlerts()); });
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if ('focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow(url);
  }));
});
