#!/usr/bin/env node
/* =====================================================================
 * test-cloud-sync.js — cloud-sync.js 集計ロジックのスモークテスト
 * ---------------------------------------------------------------------
 * 使い方:  node tools/test-cloud-sync.js
 * 終了コード: 0=全件成功 / 1=失敗あり（CI で push 毎に実行）
 *
 * cloud-sync.js は IIFE だが、純粋な集計関数だけを window.__sfqcTest に
 * 公開している。vm に DOM/Firebase スタブを与えて丸ごと読み込み、
 * hostname='localhost' 分岐で Firebase 初期化を回避してから検証する。
 * 対象: statsOf（特に模試合否=e.pass・本番のみ集計）/ aggregateUser /
 *       perQuestionStats / emptyStore。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---- DOM / ブラウザ API スタブ（test-engine.js と同方針） ---- */
function makeElement() {
  const el = {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '',
    className: '', disabled: false, checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, addEventListener() {},
    appendChild() {}, removeChild() {}, insertBefore() {}, remove() {}, focus() {},
    querySelector: () => null, querySelectorAll: () => [],
  };
  el.parentNode = { insertBefore() {}, appendChild() {}, removeChild() {} };
  return el;
}
const elements = new Map();
const byId = (id) => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); };
const storage = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document: {
    addEventListener() {}, getElementById: byId,
    querySelector: () => null, querySelectorAll: () => [],
    createElement: makeElement, documentElement: makeElement(), body: makeElement(), head: makeElement(),
    readyState: 'complete',
  },
  navigator: { onLine: true, userAgent: 'test', language: 'ja' },
  // hostname='localhost' により cloud-sync.init() は Firebase を触らず素通しで return する
  location: { href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  confirm: () => true, alert() {}, prompt: () => '',
  addEventListener() {}, removeEventListener() {},
};
sandbox.window = sandbox;
sandbox.window.CERT_CONFIG = { slug: 'sf-admin', shortName: 'Admin', examN: 60, examMin: 105, pass: 65, storageKey: 'sfq_test' };
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-sync.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'cloud-sync.js' });

const T = sandbox.window.__sfqcTest;

/* ---- ミニテストランナー ---- */
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.error('  ❌ ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 期待=' + JSON.stringify(b) + ' 実際=' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'falsy'); }

console.log('== cloud-sync.js 集計ロジック スモークテスト ==');

t('テストフックが公開されている', () => {
  ok(T && typeof T.statsOf === 'function', '__sfqcTest.statsOf が無い');
  ok(typeof T.aggregateUser === 'function' && typeof T.emptyStore === 'function');
});

t('statsOf: 模試合否は e.pass で数える（e.ok=正解数を合格と誤認しない）', () => {
  // ok（正解数）は大きいが pass=false の不合格模試。examPassed は 0 でなければならない。
  const store = { exams: [
    { ts: 1, pct: 50, ok: 30, pass: false, n: 60 },   // 30問正解だが不合格
    { ts: 2, pct: 90, ok: 54, pass: true,  n: 60 },   // 合格
  ] };
  const s = T.statsOf(store);
  eq(s.examCount, 2, 'examCount');
  eq(s.examPassed, 1, 'examPassed は pass=true の1件のみ');
  eq(s.examBest, 90, 'examBest は pct の最大');
});

t('statsOf: 本番(フル)模試だけを examFull に数える', () => {
  const store = { exams: [
    { ts: 1, pct: 80, ok: 48, pass: true,  n: 60 },   // フル・合格
    { ts: 2, pct: 90, ok: 9,  pass: true,  n: 10 },   // カスタム10問・合格（フルではない）
    { ts: 3, pct: 40, ok: 24, pass: false, n: 60 },   // フル・不合格
  ] };
  const s = T.statsOf(store);
  eq(s.examCount, 3, 'examCount は全件');
  eq(s.examPassed, 2, 'examPassed は pass=true 2件');
  eq(s.examFull, 2, 'examFull は n===60 の2件');
  eq(s.examFullPassed, 1, 'examFullPassed はフルかつ合格の1件');
});

t('statsOf: n 未設定の古い模試はフル扱い（examN にフォールバック）', () => {
  const s = T.statsOf({ exams: [{ ts: 1, pct: 70, ok: 42, pass: true }] }); // n なし
  eq(s.examFull, 1, 'n 未設定はフル扱い');
  eq(s.examFullPassed, 1);
});

t('statsOf: hist の解答数・正答率', () => {
  const s = T.statsOf({ hist: { 1: { c: 3, w: 1 }, 2: { c: 0, w: 2 }, 3: {} } });
  eq(s.answered, 2, '回答ありの問題数（3は0回なので除外）');
  eq(s.attempts, 6, '総回答回数 3+1+0+2');
  eq(s.correct, 3); eq(s.wrong, 3);
  eq(s.rate, 50, '正答率 3/6');
});

t('aggregateUser: 複数資格の本番模試を合算', () => {
  const c1 = { stats: T.statsOf({ exams: [{ ts: 1, pct: 80, ok: 48, pass: true, n: 60 }] }) };
  const c2 = { stats: T.statsOf({ exams: [{ ts: 2, pct: 40, ok: 24, pass: false, n: 60 }, { ts: 3, pct: 95, ok: 57, pass: true, n: 60 }] }) };
  const a = T.aggregateUser([c1, c2]);
  eq(a.examCount, 3, 'examCount 合算');
  eq(a.examPassed, 2, 'examPassed 合算');
  eq(a.examFull, 3, 'examFull 合算');
  eq(a.examFullPassed, 2, 'examFullPassed 合算');
  eq(a.examBest, 95, 'examBest は最大');
});

t('emptyStore: 必須フィールドを持つ空ストア', () => {
  const e = T.emptyStore();
  ok(Array.isArray(e.bm) && e.bm.length === 0);
  ok(e.hist && typeof e.hist === 'object');
  const s = T.statsOf(e);
  eq(s.answered, 0); eq(s.examCount, 0); eq(s.examFull, 0); eq(s.rate, 0);
});

console.log('\n' + (fail ? ('❌ ' + fail + ' 件失敗 / ') : '✅ ') + '全 ' + (pass + fail) + '件' + (fail ? '' : '成功'));
process.exit(fail ? 1 : 0);
