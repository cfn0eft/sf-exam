/* SF資格 学習アプリ — Service Worker
 * 役割: アプリシェルをキャッシュしてオフラインでも学習できるようにする。
 * 方針: 同一オリジン = キャッシュ優先＋裏で更新 / クロスオリジン(Firebase等) = ネットワーク優先。
 * 更新時は CACHE のバージョン文字列を上げると古いキャッシュを破棄する。
 */
const CACHE = 'sf-exam-v9';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './quiz.css?v=9',
  './quiz-engine.js?v=9',
  './firebase-config.js',
  './cloud-sync.js?v=9',
  './certifications/sf-admin/index.html',
  './certifications/app-builder/index.html',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // 1件失敗しても install を止めないよう allSettled を使う
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // クロスオリジン（Firebase CDN 等）: ネットワーク優先、失敗時はキャッシュ
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 同一オリジン: キャッシュ優先＋裏でネットワーク更新（stale-while-revalidate）
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
