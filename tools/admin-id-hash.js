#!/usr/bin/env node
/* =====================================================================
 * admin-id-hash.js — 管理者IDの SHA-256 ハッシュを作る
 * ---------------------------------------------------------------------
 * 使い方:  node tools/admin-id-hash.js <管理者ID>
 *
 * 配信ファイル（firebase-config.js）には管理者IDを平文で置かず、
 * このハッシュだけを window.SFQ_ADMIN_ID_HASHES に入れる。
 * cloud-sync.js はログインIDを同じ規則で正規化してハッシュし、一致したら
 * 管理者ビューを出す（本当の権限は Firestore ルールの UID 判定が持つ）。
 *
 * 手順の全体は docs/ADMIN-ID.md を参照。
 * ===================================================================== */
'use strict';
const crypto = require('crypto');

// cloud-sync.js の sanitizeId と同じ正規化（小文字化＋許可文字以外を除去）
function sanitizeId(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9._\-]/g, '');
}

const raw = process.argv[2];
if (!raw) {
  console.error('使い方: node tools/admin-id-hash.js <管理者ID>');
  process.exit(1);
}
const id = sanitizeId(raw);
if (!id) {
  console.error('ID が空になりました。半角英数字と . _ - だけが使えます。');
  process.exit(1);
}
if (raw !== id) console.error('※ 正規化後のID: ' + id + '（この文字列でログインします）');
if (id.length < 8) console.error('※ 推測されにくい長さ（8文字以上）を推奨します。');

const hash = crypto.createHash('sha256').update(id, 'utf8').digest('hex');
console.log('');
console.log('firebase-config.js に貼り付ける行:');
console.log('');
console.log('window.SFQ_ADMIN_ID_HASHES = ["' + hash + '"];');
console.log('');
console.log('※ 複数の管理者を置くときはカンマ区切りでハッシュを並べます。');
console.log('※ 貼り替えたら node tools/bump-version.js を1回実行してから push してください。');
