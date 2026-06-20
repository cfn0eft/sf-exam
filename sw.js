/* SF資格 学習アプリ — Service Worker
 * 役割: アプリシェルをキャッシュしてオフラインでも学習できるようにする。
 * 方針:
 *   - HTML(ナビゲーション) = ネットワーク優先（最新の ?v= を必ず読ませる。オフライン時のみキャッシュ）
 *   - その他の同一オリジン(?v= 付きJS/CSS・データJSON 等) = キャッシュ優先＋裏で更新
 *   - クロスオリジン(Firebase等) = ネットワーク優先
 * 更新時は CACHE のバージョン文字列を上げると古いキャッシュを破棄する。
 * ※ HTML をネットワーク優先にすることで、ハードリロード(Ctrl+Shift+R)なしで更新が反映される。
 */
const CACHE = 'sf-exam-v84';
const SHELL = [
  './',
  './index.html',
  './maintenance.html',
  './maintenance.js?v=82',
  './manifest.webmanifest',
  './quiz.css?v=82',
  './quiz-engine.js?v=82',
  './changelog.js?v=82',
  './figures.js?v=82',
  './firebase-config.js',
  './cloud-sync.js?v=82',
  './certifications/sf-admin/index.html',
  './certifications/app-builder/index.html',
  // 学習データ：初回訪問からオフラインで学べるようプリキャッシュ（allSettledなので失敗してもinstallは継続）
  './certifications/sf-admin/data/questions.json',
  './certifications/sf-admin/data/domains.json',
  './certifications/sf-admin/data/vocab.json',
  './certifications/sf-admin/data/navmap.json',
  './certifications/sf-admin/data/cram.json',
  './certifications/sf-admin/data/compare.json',
  './certifications/app-builder/data/questions.json',
  './certifications/app-builder/data/domains.json',
  './certifications/app-builder/data/vocab.json',
  './certifications/app-builder/data/navmap.json',
  './certifications/app-builder/data/cram.json',
  './certifications/app-builder/data/compare.json',
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

  // HTML(ナビゲーション/ドキュメント): ネットワーク優先。
  // エントリのHTMLを常に最新にすることで、参照する ?v= 付きアセットも新URLとして取得され、
  // ハードリロードなしで更新が反映される。オフライン時のみキャッシュへフォールバック。
  const isHTML = req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // その他の同一オリジン(?v= 付きJS/CSS・データJSON 等): キャッシュ優先＋裏でネットワーク更新（stale-while-revalidate）
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
