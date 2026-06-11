#!/usr/bin/env node
/* =====================================================================
 * check-links.js — questions.json の reference_url 死活チェック
 * ---------------------------------------------------------------------
 * 使い方:  node tools/check-links.js [--max N]
 * 終了コード: 0=OK / 1=リンク切れ（404/410）あり
 *
 * - 全資格の reference_url を重複排除して GET（リダイレクト追従）
 * - 404/410 のみ「リンク切れ」としてエラー扱い。タイムアウトや 403 等は
 *   ボット対策の可能性があるため警告に留める（help.salesforce.com は SPA で
 *   未知の記事でも 200 を返すことがある点に注意）
 * - 週1の GitHub Actions（check-links.yml）から実行される
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const maxArg = process.argv.indexOf('--max');
const MAX = maxArg > -1 ? parseInt(process.argv[maxArg + 1], 10) : Infinity;

const urlMap = new Map();   // url -> [cert#id, ...]
fs.readdirSync(path.join(ROOT, 'certifications')).forEach((slug) => {
  const p = path.join(ROOT, 'certifications', slug, 'data', 'questions.json');
  if (!fs.existsSync(p)) return;
  JSON.parse(fs.readFileSync(p, 'utf8')).forEach((q) => {
    if (!q.reference_url) return;
    if (!urlMap.has(q.reference_url)) urlMap.set(q.reference_url, []);
    urlMap.get(q.reference_url).push(slug + '#' + q.id);
  });
});

const urls = [...urlMap.keys()].slice(0, MAX);
console.log('対象URL: ' + urls.length + '件（重複排除後・全' + [...urlMap.values()].reduce((a, c) => a + c.length, 0) + '参照）');

async function check(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (sf-exam link checker)' } });
    return { url, status: r.status };
  } catch (e) {
    return { url, status: 0, err: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(timer); }
}

(async () => {
  const broken = [], warns = [];
  const CONC = 8;
  for (let i = 0; i < urls.length; i += CONC) {
    const results = await Promise.all(urls.slice(i, i + CONC).map(check));
    results.forEach((r) => {
      if (r.status === 404 || r.status === 410) broken.push(r);
      else if (r.status === 0 || r.status >= 400) warns.push(r);
    });
    process.stdout.write('\r  ' + Math.min(i + CONC, urls.length) + '/' + urls.length + ' 済');
  }
  console.log('');
  warns.forEach((r) => console.warn('  ⚠️ ' + (r.status || r.err) + ' ' + r.url + ' ← ' + urlMap.get(r.url).slice(0, 5).join(',')));
  broken.forEach((r) => console.error('  ❌ ' + r.status + ' ' + r.url + ' ← ' + urlMap.get(r.url).slice(0, 5).join(',')));
  console.log(broken.length ? '❌ リンク切れ ' + broken.length + '件' : '✅ リンク切れなし' + (warns.length ? '（警告 ' + warns.length + '件）' : ''));
  process.exit(broken.length ? 1 : 0);
})();
