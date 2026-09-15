#!/usr/bin/env node
/* =====================================================================
 * feedback-to-tasks.js — 管理者ビューのフィードバックJSONをタスク一覧に変換
 * ---------------------------------------------------------------------
 * 使い方:  node tools/feedback-to-tasks.js <管理者ビューで⬇JSONしたファイル>
 * 出力:    対応作業用の Markdown チェックリスト（標準出力）
 *          → そのまま Claude に貼り付けて修正作業を依頼できる形式
 *
 * 並び順: 種類（正解誤り→解説誤り→不具合→…）→ 新しい順。
 * 同一問題への報告はまとめて1項目にする。
 * ===================================================================== */
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('使い方: node tools/feedback-to-tasks.js <feedback.json>'); process.exit(1); }
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(list)) { console.error('❌ 配列のJSONではありません'); process.exit(1); }

// 対応優先度（数値が小さいほど先）
const PRIORITY = { '正解誤り': 0, '解説誤り': 1, '不具合': 2, '選択肢': 3, '日本語': 4, '要望': 5, 'その他': 6 };
const prio = (c) => { for (const k of Object.keys(PRIORITY)) if ((c || '').includes(k)) return PRIORITY[k]; return 9; };
const fmtD = (ts) => ts ? new Date(ts).toISOString().slice(0, 10) : '';

// 問題ID単位でまとめる（qid なしは1件ずつ）
const groups = new Map();
list.forEach((r) => {
  const key = r.qid != null && r.qid !== '' ? (r.cert || '?') + '#' + r.qid : 'single-' + (r.fid || Math.random());
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
});

const rows = [...groups.values()].map((g) => {
  g.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { p: Math.min(...g.map((r) => prio(r.cat))), ts: g[0].ts || 0, g };
}).sort((a, b) => a.p - b.p || b.ts - a.ts);

console.log('# フィードバック対応タスク（' + list.length + '件 → ' + rows.length + '項目）');
console.log('生成日: ' + new Date().toISOString().slice(0, 10) + '\n');
rows.forEach(({ g }) => {
  const r = g[0];
  const head = [r.cat, r.cert, r.qid != null && r.qid !== '' ? 'ID ' + r.qid : '', fmtD(r.ts)].filter(Boolean).join(' / ');
  console.log('- [ ] **' + head + '**' + (g.length > 1 ? '（同件 ' + g.length + '報告）' : ''));
  g.forEach((x) => { if (x.msg) console.log('  - ' + String(x.msg).replace(/\n/g, ' ').slice(0, 300)); });
  if (r.qtext) console.log('  - 問題文: ' + String(r.qtext).replace(/\n/g, ' ').slice(0, 120) + '…');
  if (r.ref) console.log('  - 参考: ' + r.ref);
});
