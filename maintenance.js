/* =====================================================================
 * maintenance.js — サイト一時非公開トグル（手動オーバーライド＋プレビュー合言葉）
 * ---------------------------------------------------------------------
 * 通常のオンオフは「管理者ビュー」からライブで行えます（push不要）。
 * このファイルが担うのは次の2つだけです:
 *
 *  ① MANUAL_MAINTENANCE … 手動の緊急オーバーライド。
 *     true にすると、ログインや Firebase の状態に関係なく、
 *     すべてのページが maintenance.html へ強制転送されます。
 *     （Firebase が落ちている等の非常時用。push で反映）
 *       1. MANUAL_MAINTENANCE を true にする
 *       2. node tools/bump-version.js
 *       3. git add -A && git commit && git push origin main
 *
 *  ② プレビュー合言葉 … メンテ中でも中身を確認するための合言葉。
 *     URL に ?preview=<合言葉> を付けるとメンテをすり抜け、以後この端末
 *     （タブ）は記憶して素通りします。ライブ切替・手動オーバーライドの
 *     両方に効きます。
 *     ※ 合言葉そのものはリポジトリに置かず、下の PREVIEW_HASH に
 *        SHA-256 ダイジェストだけを保存します（漏洩・誤検出の回避）。
 *     合言葉を変更するには新しい合言葉のダイジェストを生成して貼り替え:
 *        node -e "console.log(require('crypto').createHash('sha256').update('新しい合言葉').digest('hex'))"
 *        （または:  printf '新しい合言葉' | shasum -a 256 ）
 * ===================================================================== */
(function () {
  'use strict';

  var MANUAL_MAINTENANCE = false;                                                       // ← 手動オーバーライド
  var PREVIEW_HASH = '609f365149f3895e959cacb67e4e5db5de44022695655f18719202f83288da07'; // ← 合言葉の SHA-256（合言葉自体は非保存）

  var PREVIEW_KEY = 'sfq_preview_ok';

  // 他スクリプト（cloud-sync）からも素通り判定を共有できるよう公開
  window.SFQ_hasPreview = function () {
    try { return sessionStorage.getItem(PREVIEW_KEY) === '1'; } catch (e) { return false; }
  };

  // 転送先ベースURLは同期的に確定しておく（非同期コールバック内では currentScript が null になるため）
  var BASE = '';
  try {
    var sc = document.currentScript;
    if (sc && sc.src) BASE = sc.src.replace(/maintenance\.js.*$/, '');
  } catch (e) {}

  function redirectIfNeeded() {
    if (!MANUAL_MAINTENANCE) return;                                    // ライブ切替は cloud-sync が担当
    if (/maintenance\.html(?:[?#]|$)/.test(location.pathname)) return;  // メンテ画面自身は転送しない（ループ防止）
    location.replace(BASE + 'maintenance.html');
  }

  function sha256hex(str) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.reject();
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  // URL から合言葉を取り除く（アドレスバー・履歴・リファラーに残さない）
  function stripPreviewParam() {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('preview');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
    } catch (e) {}
  }

  if (window.SFQ_hasPreview()) return; // この端末は既に確認OK（合言葉入力済み）

  var um = /[?&]preview=([^&#]+)/.exec(location.search);
  if (um) {
    // 合言葉候補をハッシュ照合（非同期）。一致すれば記憶して素通り、不一致なら通常どおり判定。
    var candidate = '';
    try { candidate = decodeURIComponent(um[1]); } catch (e) { candidate = um[1]; }
    sha256hex(candidate).then(function (h) {
      if (h === PREVIEW_HASH) {
        try { sessionStorage.setItem(PREVIEW_KEY, '1'); } catch (e) {}
        stripPreviewParam();
      } else {
        redirectIfNeeded();
      }
    }, function () { redirectIfNeeded(); });
    return;
  }

  redirectIfNeeded();
})();
