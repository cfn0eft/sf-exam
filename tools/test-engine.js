#!/usr/bin/env node
/* =====================================================================
 * test-engine.js — quiz-engine.js 純粋ロジックのスモークテスト
 * ---------------------------------------------------------------------
 * 使い方:  node tools/test-engine.js
 * 終了コード: 0=全件成功 / 1=失敗あり（CI で push 毎に実行）
 *
 * エンジンは IIFE で包まずグローバル関数のまま（HTML の inline onclick 依存）
 * なので、vm コンテキストに DOM/localStorage のスタブを与えて丸ごと読み込み、
 * 同一コンテキストでテストを実行する（トップレベル let/const も参照できる）。
 * 対象: SRS / 難易度推定 / 復習判定 / XP・レベル / 模試抽出 / store 正規化 など。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---- DOM / ブラウザ API スタブ ---- */
function makeElement() {
  return {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, appendChild() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], focus() {}, remove() {},
  };
}
const storage = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document: {
    addEventListener() {}, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    createElement: makeElement, documentElement: makeElement(), body: makeElement(),
  },
  navigator: { onLine: true, userAgent: 'test', language: 'ja' },
  location: { href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost' },
  fetch: () => Promise.reject(new Error('no network in test')),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  confirm: () => true, alert() {},
  addEventListener() {}, removeEventListener() {},
};
sandbox.window = sandbox;
sandbox.window.CERT_CONFIG = { certName: 'テスト資格', examN: 60, examMin: 105, pass: 65, storageKey: 'sfq_test' };
vm.createContext(sandbox);

const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'quiz-engine.js'), 'utf8');
vm.runInContext(engineSrc, sandbox, { filename: 'quiz-engine.js' });

/* ---- ミニテストランナー ---- */
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.error('  ❌ ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 期待=' + JSON.stringify(b) + ' 実際=' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'falsy'); }
const run = (code) => vm.runInContext(code, sandbox);

console.log('== quiz-engine.js スモークテスト ==');

t('shuffle: 要素を保存し並びだけ変える', () => {
  const r = run('shuffle([1,2,3,4,5,6,7,8,9,10])');
  eq(r.length, 10);
  eq([...r].sort((a, b) => a - b).join(','), '1,2,3,4,5,6,7,8,9,10');
});

t('arrEq: 同一配列のみ true', () => {
  ok(run('arrEq(["a","b"],["a","b"])'));
  ok(!run('arrEq(["a","b"],["b","a"])'));
  ok(!run('arrEq(["a"],["a","b"])'));
});

t('pad / fmtSec: 時間表示の整形', () => {
  eq(run('pad(7)'), '07');
  eq(run('fmtSec(45)'), '45秒');
  eq(run('fmtSec(125)'), '2:05');
});

t('mdInline: HTML をエスケープし強調を変換', () => {
  const s = run('mdInline("<script>x</scr"+"ipt> **強調**")');
  ok(!s.includes('<script>'), 'scriptタグが素通り');
  ok(s.includes('<strong>強調</strong>'), '強調が変換されない');
});

t('qDiff: データの diff を最優先、無ければ正答率から推定', () => {
  eq(run('qDiff({id:1,diff:3})'), 3);
  eq(run('qDiff({id:1,diff:"易"})'), 1);
  run('store.hist[900]={c:5,w:0}');     // 正答率100% → 易
  eq(run('qDiff({id:900})'), 1);
  run('store.hist[901]={c:1,w:4}');     // 正答率20% → 難
  eq(run('qDiff({id:901})'), 3);
  eq(run('qDiff({id:902})'), 2);        // 履歴なし → 標準
});

t('srsUpdate: 正解で間隔が伸び、誤答でリセット', () => {
  run('store.srs={}; srsUpdate(10,true,false)');
  eq(run('store.srs[10].ivl'), 1, '初回正解は翌日');
  run('srsUpdate(10,true,false)');
  eq(run('store.srs[10].ivl'), 3, '2回目正解は3日後');
  run('srsUpdate(10,true,false)');
  ok(run('store.srs[10].ivl') > 3, '3回目以降は ease 倍率で延伸');
  run('srsUpdate(10,false,false)');
  eq(run('store.srs[10].reps'), 0, '誤答で reps リセット');
  eq(run('store.srs[10].due'), run('_today()'), '誤答は当日再出題');
});

t('srsUpdate: 自信なし正解は翌日に再出題', () => {
  run('store.srs={}; srsUpdate(11,true,true)');
  eq(run('store.srs[11].due'), run('_addDays(1)'));
});

t('isWrong / isUnseen / needsReview: 復習対象の判定', () => {
  run('store.hist={}');
  ok(run('isUnseen(50)'), '履歴なしは未着手');
  run('store.hist[50]={c:0,w:1,last:"w"}');
  ok(run('isWrong(50)') && run('needsReview(50)'), '誤答は要復習');
  run('store.hist[50]={c:1,w:1,last:"c",lc:1}');
  ok(!run('isWrong(50)') && run('needsReview(50)'), 'まぐれ正解も要復習');
  run('store.hist[50]={c:1,w:1,last:"c",lc:0}');
  ok(!run('needsReview(50)'), '自信あり正解は対象外');
});

t('levelInfo: XP 増加でレベルが単調増加', () => {
  run('store.xp=0');
  eq(run('levelInfo().lvl'), 1);
  run('store.xp=200');
  eq(run('levelInfo().lvl'), 2, '200XP で Lv.2');
  let prev = 0;
  for (const xp of [0, 500, 2000, 10000]) {
    run('store.xp=' + xp);
    const lvl = run('levelInfo().lvl');
    ok(lvl >= prev, 'XP増でレベル低下');
    prev = lvl;
  }
});

t('__setStore: 欠損フィールドをすべて既定値で補完', () => {
  run('window.__setStore({})');
  const checks = ['Array.isArray(store.bm)', 'typeof store.hist==="object"', 'Array.isArray(store.exams)',
    'typeof store.time.tot==="number"', 'typeof store.xp==="number"', 'Array.isArray(store.rdz)',
    'typeof store.missions.claimed==="object"', 'store.examDate===""', 'store.acquiredDate===""'];
  checks.forEach((c) => ok(run(c), c + ' が補完されない'));
});

/* ---- 模試抽出（合成データを注入） ---- */
run(`
DOMAIN_DEFS=[{code:'a',name:'A',weight:50,emoji:'🅰️'},{code:'b',name:'B',weight:30,emoji:'🅱️'},{code:'c',name:'C',weight:20,emoji:'🅾️'}];
buildDomainIndex();
allQ=[];QDOMAIN={};
for(let i=1;i<=200;i++){
  const d=i<=100?'a':(i<=160?'b':'c');
  allQ.push({id:i,question:'Q'+i,choices:['x','y'],answers:['x'],domain:d});
  QDOMAIN[i]=d;
}
srcFilter='all';
`);

t('pickWeightedExam: 重複なく公式ウェイト比で抽出', () => {
  const ids = run('pickWeightedExam(60).map(q=>q.id)');
  eq(ids.length, 60);
  eq(new Set(ids).size, 60, 'ID重複');
  const byD = run('(function(){const c={a:0,b:0,c:0};pickWeightedExam(60).forEach(q=>c[QDOMAIN[q.id]]++);return c;})()');
  ok(Math.abs(byD.a - 30) <= 2 && Math.abs(byD.b - 18) <= 2 && Math.abs(byD.c - 12) <= 2,
    'ウェイト乖離: ' + JSON.stringify(byD));
});

t('模試の重複回避: 新鮮な問題で足りる分野は直近出題を選ばない', () => {
  run('localStorage.removeItem(EXAM_RECENT_KEY)');
  run('pushRecentExam(Array.from({length:30},(_,i)=>i+101))');   // 分野b(101-160)の前半30問を直近出題に
  const ids = run('pickWeightedExam(60).map(q=>q.id)');
  // b からは18問抽出され、新鮮な30問(131-160)で足りるので直近出題(101-130)は選ばれない
  eq(ids.filter((i) => i >= 101 && i <= 130).length, 0, '直近出題が選ばれた');
  eq(run('recentExamIds().size'), 30);
  run('pushRecentExam([]);pushRecentExam([])');   // 直近2回ぶんを空で上書き
  eq(run('recentExamIds().size'), 0, '直近2回のみ保持されていない');
});

t('freshFirst: 新鮮な問題が前に並ぶ', () => {
  run('localStorage.removeItem(EXAM_RECENT_KEY);pushRecentExam([1,2,3])');
  const arr = run('freshFirst(allQ.slice(0,6)).map(q=>q.id)');
  eq(arr.length, 6);
  ok(arr.slice(0, 3).every((i) => i > 3), '直近出題が前方に混入: ' + arr.join(','));
});

t('逆算ペース: 残り問題数と日数から1日ノルマを算出', () => {
  run('store.hist={}');   // 全問未着手
  const r = run('paceReco(10)');   // 200問÷10日
  eq(r.remain, 200);
  eq(r.perDay, 20);
});

console.log('\n' + (fail ? '❌ 失敗 ' + fail + '件 / 成功 ' + pass + '件' : '✅ 全 ' + pass + '件成功'));
process.exit(fail ? 1 : 0);
