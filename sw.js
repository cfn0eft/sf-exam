const CACHE = 'sf-exam-v156';
const DATA_CACHE = 'sf-exam-data-v1';
const SHELL = [
  './',
  './index.html',
  './maintenance.html',
  './maintenance.js?v=156',
  './manifest.webmanifest',
  './quiz.css?v=156',
  './quiz-engine.js?v=156',
  './changelog.js?v=156',
  './figures.js?v=156',
  './progression.js?v=156',
  './firebase-config.js',
  './cloud-sync.js?v=156',
  './certifications/sf-admin/index.html',
  './certifications/app-builder/index.html',
  './certifications/developer/index.html',
  './certifications/agentforce/index.html',
  './certifications/sales-cloud/index.html',
  './certifications/service-cloud/index.html',
  './certifications/experience-cloud/index.html',
  './certifications/sharing-visibility/index.html',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isData(url) {
  return url.origin === self.location.origin && /\/data\/[^/]+\.json$/.test(url.pathname);
}

function cacheable(r) {
  return r && r.ok && (r.type === 'basic' || r.type === 'cors' || r.type === 'default');
}
function cacheableCross(r) {
  return r && (r.ok || r.type === 'opaque');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  if (url.origin !== self.location.origin) {
    // 接続元判定の応答には生のIPが含まれるため、Cache Storageへ保存しない。
    if ((url.hostname === 'www.cloudflare.com' && url.pathname === '/cdn-cgi/trace') || url.hostname === 'ipwho.is') {
      e.respondWith(fetch(req));
      return;
    }
    e.respondWith(
      fetch(req).then((r) => {
        if (cacheableCross(r)) { const cp = r.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {})); }
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  const isHTML = req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then((r) => {
        if (cacheable(r)) { const cp = r.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {})); }
        return r;
      }).catch(() => caches.match(req).then((c) => {
        if (c) return c;
        if (url.pathname.endsWith('/')) {
          return caches.match(url.pathname + 'index.html').then((ci) => ci || caches.match('./index.html'));
        }
        return caches.match('./index.html');
      }))
    );
    return;
  }

  if (isData(url)) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req).then((r) => {
          if (cacheable(r)) { const cp = r.clone(); caches.open(DATA_CACHE).then((c) => c.put(req, cp)).catch(() => {}); }
          return r;
        }).catch(() => cached);
        if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
        return net;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((r) => {
        if (cacheable(r)) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {}); }
        return r;
      }).catch(() => cached);
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
      return net;
    })
  );
});
