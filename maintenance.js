/* =====================================================================
 * maintenance.js — サイト一時非公開トグル（簡易オンオフ）
 * ---------------------------------------------------------------------
 * 下の MAINTENANCE を true にすると、すべてのページが
 * maintenance.html（「一時的に非公開」画面）へ自動転送される。
 *
 * 切り替え手順（オン／オフ共通）:
 *   1. このファイルの MAINTENANCE を true / false に変える
 *   2. node tools/bump-version.js   ← キャッシュを繰り上げて即時反映
 *   3. git add -A && git commit && git push origin main
 *
 * 自分だけ中身を確認したいとき: URL に ?preview=1 を付けると転送されない
 *   例) https://cfn0eft.github.io/sf-exam/?preview=1
 * ===================================================================== */
(function () {
  'use strict';

  var MAINTENANCE = true; // ← ここだけ true / false を変える

  if (!MAINTENANCE) return;

  // メンテ画面そのものは転送しない（無限ループ防止）
  if (/maintenance\.html(?:[?#]|$)/.test(location.pathname)) return;
  // 本人プレビュー用の素通り
  if (/[?&]preview=/.test(location.search)) return;

  // 自分の <script src> からサイトのベースURLを割り出して転送先を組み立てる
  var base = '';
  try {
    var sc = document.currentScript;
    if (sc && sc.src) base = sc.src.replace(/maintenance\.js.*$/, '');
  } catch (e) {}

  location.replace(base + 'maintenance.html');
})();
