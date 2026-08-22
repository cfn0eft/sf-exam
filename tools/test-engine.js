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
  const attrs = {};
  const classes = new Set();
  const listeners = {};
  const el = {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '',
    disabled: false, attrs, listeners,
    // クラスは実際に保持する（開閉トグルなど classList を使うロジックを検証するため）
    classList: {
      add(...c) { c.forEach((x) => x && classes.add(x)); },
      remove(...c) { c.forEach((x) => classes.delete(x)); },
      contains: (c) => classes.has(c),
      toggle(c, force) {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
    },
    // 属性は実際に保持する（aria-pressed / data-theme などの状態伝達を検証するため）
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
    removeAttribute(k) { delete attrs[k]; }, hasAttribute: (k) => Object.prototype.hasOwnProperty.call(attrs, k),
    // ハンドラを記録し、テストから fire() で発火できるようにする
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire(type, ev) { (listeners[type] || []).forEach((f) => f(Object.assign({ preventDefault() {}, stopPropagation() {}, target: el }, ev))); },
    appendChild() {}, removeChild() {}, insertBefore() {}, remove() {}, focus() {},
    querySelector: () => null, querySelectorAll: () => [],
  };
  // className は classList と同じ実体を見る（engine は両方で書き換えるため）
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    enumerable: true,
  });
  el.parentNode = { insertBefore() {}, appendChild() {}, removeChild() {} };
  return el;
}
// getElementById は同じ id に同じスタブ要素を返す（DOM を触る関数も丸ごとテストできるように）
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
    createElement: makeElement, documentElement: makeElement(), body: makeElement(),
  },
  navigator: { onLine: true, userAgent: 'test', language: 'ja' },
  location: { href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} },
  fetch: () => Promise.reject(new Error('no network in test')),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  confirm: () => true, alert() {},
  addEventListener() {}, removeEventListener() {}, scrollTo() {},
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
srcSel=new Set();
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

/* ---- 出典フィルタ（複数選択） ---- */
t('出典フィルタ: 複数の出典をトグルで選べる', () => {
  run(`
    __allQbak=allQ;
    allQ=[{id:1,source:'tyson'},{id:2,source:'gen'},{id:3,source:'jpnshiken'},{id:4,source:'tyson'},{id:5,source:'gen'}];
    setSrcFilter('all');
  `);
  try {
    eq(run('scopedQ().length'), 5, '初期はすべて対象');
    run("setSrcFilter('tyson')");
    eq(run('scopedQ().map(q=>q.id).join(",")'), '1,4', 'tyson のみ');
    run("setSrcFilter('gen')");                  // 追加選択（複数同時）
    eq(run('scopedQ().map(q=>q.id).join(",")'), '1,2,4,5', 'tyson+gen');
    eq(run("localStorage.getItem('sfq_src')"), 'tyson,gen', 'カンマ区切りで保存');
    run("setSrcFilter('tyson')");                // 1つだけ解除
    eq(run('scopedQ().map(q=>q.id).join(",")'), '2,5', 'gen のみ');
    run("setSrcFilter('gen')");                  // 全解除＝すべてに戻る
    eq(run('scopedQ().length'), 5, '全解除はすべて扱い');
    eq(run("localStorage.getItem('sfq_src')"), 'all', '空選択は all で保存');
  } finally {
    run("allQ=__allQbak; srcSel=new Set(); try{localStorage.removeItem('sfq_src');}catch(e){}");
  }
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

t('finishExam: 採点・履歴保存・重複回避への記録', () => {
  run(`
    store.hist={};store.exams=[];localStorage.removeItem(EXAM_RECENT_KEY);
    eQ=allQ.slice(0,10);eN=10;eTimed=true;eBudget=600;eSecs=300;eCur=0;eFlag={};eQTime={};eTimer=null;
    eAns={};for(var i=0;i<10;i++){eAns[i]=i<7?[0]:[1];}   // choices=['x','y'], answers=['x'] → 7問正解
    finishExam();
  `);
  const ex = run('store.exams[store.exams.length-1]');
  eq(ex.ok, 7, '正解数');
  eq(ex.pct, 70, '正答率');
  eq(ex.pass, true, '合格判定（PASS=65）');
  eq(ex.custom, true, '10問はカスタム扱い');
  eq(run('recentExamIds().size'), 10, '出題IDが重複回避キーに記録される');
});

t('weeklyMissions / checkMissions: 週ミッションの達成とXP付与', () => {
  run('store.daily={};store.exams=[];store.missions={wk:"",claimed:{}};store.xp=0');
  run(`(function(){
    var ws=_weekStart();
    for(var i=0;i<3;i++){var d=new Date(ws);d.setDate(ws.getDate()+i);store.daily[_fmtD(d)]=14;}   // 3日×14問=42問
    store.exams.push({ts:Date.now(),pct:80,ok:48,n:60,pass:true});
  })()`);
  const ms = run('weeklyMissions()');
  ok(ms.every((m) => m.cur >= m.tgt), '全ミッション達成のはず: ' + JSON.stringify(ms));
  run('checkMissions()');
  eq(run('Object.keys(store.missions.claimed).length'), 3, '3件とも達成記録');
  ok(run('store.xp') >= 150, 'ミッション報酬 50XP×3 が付与される');
});

t('PWAショートカット: 不明な ?go= は何もしない', () => {
  run('location.search="?go=unknown"');
  run('handleLaunchShortcut()');   // 例外にならず無視されること
  run('location.search=""');
  run('handleLaunchShortcut()');
});

t('gotoTerm: 用語名から学習ガイドの該当用語へジャンプ（完全・部分一致＋検索フォールバック）', () => {
  run('CHDATA=[{chapter:"第1章: テスト",terms:[' +
      '{title:"validation",jaName:"入力規則",enName:"Validation Rule",definition:"x"},' +
      '{title:"layout",jaName:"ページレイアウト",definition:"y"}]}]');
  run('gotoTerm("入力規則")');            // 完全一致（jaName）
  eq(run('tdCi'), 0, '章index');
  eq(run('tdTi'), 0, '入力規則の用語index');
  run('gotoTerm("Validation Rule")');     // 完全一致（enName・空白無視）
  eq(run('tdTi'), 0, 'enName一致でも入力規則');
  run('gotoTerm("ページレイアウト")');
  eq(run('tdTi'), 1, 'ページレイアウトの用語index');
  run('gotoTerm("___存在しない用語___")'); // 未一致→検索フォールバック
  eq(run('document.getElementById("tb-search").value'), '___存在しない用語___', '検索ボックスへフォールバック');
});

t('saveFilters/restoreFilters: 出題設定（絞り込み）が端末に保存・復元される', () => {
  // 設定をセット（チェックボックス＋難易度）
  byId('f-new').checked = true;
  byId('f-wrong').checked = false;
  byId('f-multi').checked = true;
  run('fDiffSet={1:false,2:true,3:false}');
  run('saveFilters()');
  const raw = run("localStorage.getItem(SKEY+'_filters')");
  ok(raw && raw.indexOf('"nw":true') >= 0, '保存JSONに未回答フラグ');
  ok(raw.indexOf('"mu":true') >= 0, '保存JSONに複数選択フラグ');
  // リセットしてから復元
  byId('f-new').checked = false;
  byId('f-multi').checked = false;
  run('fDiffSet={1:false,2:false,3:false}');
  run('restoreFilters()');
  eq(byId('f-new').checked, true, '未回答チェックが復元');
  eq(byId('f-multi').checked, true, '複数選択チェックが復元');
  eq(byId('f-wrong').checked, false, '間違えたチェックは false のまま');
  eq(run('fDiffSet[2]'), true, '難易度(標準)が復元');
  eq(run('fDiffSet[1]'), false, '難易度(易)は false のまま');
  run("localStorage.removeItem(SKEY+'_filters')");
});

t('levelInfo: レベルアップ境界と次レベルの必要XP', () => {
  run('store.xp=199');
  let r = run('levelInfo()');
  eq(r.lvl, 1, '199XP はまだ Lv.1');
  eq(r.cur, 199, 'レベル内の獲得XP');
  eq(r.need, 200, 'Lv.1→2 の必要XP');
  run('store.xp=200');
  r = run('levelInfo()');
  eq(r.lvl, 2, 'ちょうど 200XP で Lv.2');
  eq(r.cur, 0, '繰り上がり直後の獲得XPは0');
  eq(r.need, 260, 'Lv.2→3 は 200+60');
  eq(run('levelInfo().total'), 200, 'total は素の XP');
});

t('paceReco: 端数は切り上げ／受験日が今日以前なら0', () => {
  run('store.hist={}');           // 全200問が未着手
  eq(run('paceReco(7).perDay'), 29, '200÷7 は切り上げて29問');
  eq(run('paceReco(0).perDay'), 0, '残り日数0なら1日ノルマは出さない');
  eq(run('paceReco(-3).perDay'), 0, '受験日を過ぎていても0');
  run('store.hist={};allQ.forEach(q=>{store.hist[q.id]={c:2,w:0,last:"c",lc:0};});');
  const done = run('paceReco(10)');
  eq(done.remain, 0, '全問マスター済みなら残り0');
  eq(done.perDay, 0, '残り0なら1日ノルマも0');
  run('store.hist={}');
});

t('qDiff: データの難易度を優先し、無ければ正答率から推定', () => {
  eq(run('qDiff({id:9001,diff:3})'), 3, '数値の diff をそのまま使う');
  eq(run('qDiff({id:9001,diff:"易"})'), 1, '和名の diff も解釈する');
  eq(run('qDiff({id:9001,diff:"hard"})'), 3, '英名の diff も解釈する');
  eq(run('qDiff({id:9002})'), 2, '履歴も diff も無ければ標準');
  run('store.hist[9003]={c:4,w:1,last:"c"}');   // 正答率80%
  eq(run('qDiff({id:9003})'), 1, '正答率80%以上は易と推定');
  run('store.hist[9004]={c:1,w:3,last:"w"}');   // 正答率25%
  eq(run('qDiff({id:9004})'), 3, '正答率50%未満は難と推定');
  run('store.hist[9005]={c:1,w:0,last:"c"}');   // 1回だけ＝母数不足
  eq(run('qDiff({id:9005})'), 2, '解答1回だけでは推定しない');
  run('delete store.hist[9003];delete store.hist[9004];delete store.hist[9005]');
});

t('setBmBtn: ★/☆・on クラス・aria-pressed を同時に更新', () => {
  const btn = byId('s-bmbtn');
  run("setBmBtn(document.getElementById('s-bmbtn'),true)");
  eq(btn.textContent, '★', 'ON の表示');
  eq(btn.className, 'bmbtn on', 'ON のクラス');
  eq(btn.getAttribute('aria-pressed'), 'true', 'ON の aria-pressed');
  run("setBmBtn(document.getElementById('s-bmbtn'),false)");
  eq(btn.textContent, '☆', 'OFF の表示');
  eq(btn.className, 'bmbtn', 'OFF のクラス');
  eq(btn.getAttribute('aria-pressed'), 'false', 'OFF の aria-pressed');
  run('setBmBtn(null,true)');   // 要素が無くても落ちない
});

t('applyDark: テーマ属性とボタンの状態（絵文字・aria-pressed）が連動', () => {
  run('applyDark(true)');
  eq(run("document.documentElement.getAttribute('data-theme')"), 'dark', 'ダーク時のテーマ属性');
  eq(byId('btn-dark').textContent, '☀️', 'ダーク時は太陽アイコン');
  eq(byId('btn-dark').getAttribute('aria-pressed'), 'true', 'ダーク時の aria-pressed');
  run('applyDark(false)');
  eq(run("document.documentElement.getAttribute('data-theme')"), '', 'ライト時はテーマ属性が空');
  eq(byId('btn-dark').textContent, '🌙', 'ライト時は月アイコン');
  eq(byId('btn-dark').getAttribute('aria-pressed'), 'false', 'ライト時の aria-pressed');
});

t('bindChHead: 折りたたみ見出しがマウスでもキーボードでも開閉できる', () => {
  const head = makeElement(), wrap = makeElement();
  sandbox.__head = head; sandbox.__wrap = wrap;
  run('bindChHead(__head,__wrap)');
  eq(head.getAttribute('role'), 'button', 'ボタンとして読み上げられる');
  eq(head.getAttribute('tabindex'), '0', 'キーボードでフォーカスできる');
  eq(head.getAttribute('aria-expanded'), 'false', '初期は閉じている');
  head.fire('click');
  ok(wrap.classList.contains('open'), 'クリックで開く');
  eq(head.getAttribute('aria-expanded'), 'true', '開いたら aria-expanded も true');
  head.fire('keydown', { key: 'Enter' });
  ok(!wrap.classList.contains('open'), 'Enter で閉じる');
  eq(head.getAttribute('aria-expanded'), 'false', '閉じたら aria-expanded も false');
  head.fire('keydown', { key: ' ' });
  ok(wrap.classList.contains('open'), 'Space でも開く');
  head.fire('keydown', { key: 'a' });
  ok(wrap.classList.contains('open'), '関係ないキーでは何も起きない');
  delete sandbox.__head; delete sandbox.__wrap;
});

console.log('\n' + (fail ? '❌ 失敗 ' + fail + '件 / 成功 ' + pass + '件' : '✅ 全 ' + pass + '件成功'));
process.exit(fail ? 1 : 0);
