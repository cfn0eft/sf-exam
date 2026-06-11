#!/usr/bin/env node
/* =====================================================================
 * bump-version.js — キャッシュ無効化の「3点セット」を一括更新
 * ---------------------------------------------------------------------
 * 使い方:  node tools/bump-version.js          # 現在版数 +1
 *          node tools/bump-version.js --dry    # 変更内容の確認のみ
 *
 * 更新対象（手作業だと漏れやすい3点を機械的に揃える）:
 *  1. sw.js の CACHE 文字列（sf-exam-vN → vN+1）
 *  2. sw.js の SHELL 配列内の ?v=M → M+1
 *  3. ルート index.html / certifications/* /index.html の ?v=M → M+1
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dry = process.argv.includes('--dry');

const swPath = path.join(ROOT, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const cm = sw.match(/const CACHE\s*=\s*'sf-exam-v(\d+)'/);
if (!cm) { console.error('❌ sw.js の CACHE が見つからない'); process.exit(1); }
const cacheV = parseInt(cm[1], 10);

const am = sw.match(/\?v=(\d+)/);
if (!am) { console.error('❌ sw.js にアセット ?v= が見つからない'); process.exit(1); }
const assetV = parseInt(am[1], 10);

const files = ['sw.js', 'index.html'];
fs.readdirSync(path.join(ROOT, 'certifications')).forEach((slug) => {
  const f = path.join('certifications', slug, 'index.html');
  if (fs.existsSync(path.join(ROOT, f))) files.push(f);
});

console.log('CACHE: v' + cacheV + ' → v' + (cacheV + 1) + ' / アセット: ?v=' + assetV + ' → ?v=' + (assetV + 1) + (dry ? '（dry-run）' : ''));

files.forEach((f) => {
  const p = path.join(ROOT, f);
  let src = fs.readFileSync(p, 'utf8');
  let n = 0;
  src = src.replace(new RegExp('\\?v=' + assetV + '\\b', 'g'), () => { n++; return '?v=' + (assetV + 1); });
  if (f === 'sw.js') src = src.replace("'sf-exam-v" + cacheV + "'", () => { n++; return "'sf-exam-v" + (cacheV + 1) + "'"; });
  // 旧版数の取り残し（混在）を検知
  const stale = src.match(/\?v=(\d+)/g);
  const nums = new Set((stale || []).map((s) => s.slice(3)));
  if (nums.size > 1) { console.error('❌ ' + f + ' に版数が混在: ' + [...nums].join(',')); process.exit(1); }
  console.log('  ' + f + ': ' + n + '箇所');
  if (!dry) fs.writeFileSync(p, src);
});

console.log(dry ? '（書き込みなし）' : '✅ 完了。changelog 追記と合わせて1コミットにすること');
