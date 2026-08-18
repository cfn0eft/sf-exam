/* SF資格 学習アプリ — Service Worker
 * 役割: アプリシェルをキャッシュしてオフラインでも学習できるようにする。
 * 方針:
 *   - HTML(ナビゲーション) = ネットワーク優先（最新の ?v= を必ず読ませる。オフライン時のみキャッシュ）
 *   - その他の同一オリジン(?v= 付きJS/CSS) = キャッシュ優先＋裏で更新（アプリシェルキャッシュ）
 *   - 学習データ(data/*.json) = キャッシュ優先＋裏で更新（別キャッシュ DATA_CACHE。訪問した資格だけ貯まる）
 *   - クロスオリジン(Firebase等) = ネットワーク優先
 * 更新時は CACHE のバージョン文字列を上げると古いシェルキャッシュを破棄する。
 * ※ 学習データは DATA_CACHE に分離しているため、CACHE 版数を上げても消えない（＝毎リリースで
 *    全資格ぶんを再ダウンロードさせない）。訪問した資格の questions.json 等はランタイムで貯まる。
 * ※ HTML をネットワーク優先にすることで、ハードリロード(Ctrl+Shift+R)なしで更新が反映される。
 */
const CACHE = 'sf-exam-v135';
const DATA_CACHE = 'sf-exam-data-v1';
// プリキャッシュはアプリシェル（LP＋各資格シェル＋JS/CSS/icons）のみに限定する。
// 学習データ(questions.json 等・全8資格で生6MB超)はここに含めない＝LPを開いただけのユーザーに
// まだ選んでもいない資格のデータを配らない。各資格ページを開いた時に fetch ハンドラが DATA_CACHE へ貯める。
const SHELL = [
  './',
  './index.html',
  './maintenance.html',
  './maintenance.js?v=135',
  './manifest.webmanifest',
  './quiz.css?v=135',
  './quiz-engine.js?v=135',
  './changelog.js?v=135',
  './figures.js?v=135',
  './progression.js?v=135',
  './firebase-config.js',
  './cloud-sync.js?v=135',
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
  // 1件失敗しても install を止めないよう allSettled を使う
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // シェルの旧版だけ破棄。DATA_CACHE（学習データ）は版数バンプでも残す。
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 学習データ(data/*.json)か判定
function isData(url) {
  return url.origin === self.location.origin && /\/data\/[^/]+\.json$/.test(url.pathname);
}

// 同一オリジン用: 正常応答のみキャッシュ（404/5xx やエラーページを永続化しない）
function cacheable(r) {
  return r && r.ok && (r.type === 'basic' || r.type === 'cors' || r.type === 'default');
}
// クロスオリジン用: Firebase CDN の <script src> は no-cors の opaque 応答(status0/ok=false)になるが、
// これをキャッシュしないとオフラインで SDK を読めなくなる。opaque は中身を検査できないので許容する。
function cacheableCross(r) {
  return r && (r.ok || r.type === 'opaque');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // クロスオリジン（Firebase CDN 等）: ネットワーク優先、失敗時はキャッシュ
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(req).then((r) => {
        if (cacheableCross(r)) { const cp = r.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {})); }
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
        if (cacheable(r)) { const cp = r.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {})); }
        return r;
      }).catch(() => caches.match(req).then((c) => {
        if (c) return c;
        // 末尾スラッシュのディレクトリURL(/certifications/xxx/)は index.html を明示的に探す
        if (url.pathname.endsWith('/')) {
          return caches.match(url.pathname + 'index.html').then((ci) => ci || caches.match('./index.html'));
        }
        return caches.match('./index.html');
      }))
    );
    return;
  }

  // 学習データ(data/*.json): キャッシュ優先＋裏で更新。別キャッシュ DATA_CACHE に貯める。
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

  // その他の同一オリジン(?v= 付きJS/CSS 等): キャッシュ優先＋裏でネットワーク更新（stale-while-revalidate）
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
