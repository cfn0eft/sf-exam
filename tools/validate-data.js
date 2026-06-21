#!/usr/bin/env node
/* =====================================================================
 * validate-data.js — 学習データ・アセット整合性の自動検証
 * ---------------------------------------------------------------------
 * 使い方:  node tools/validate-data.js
 * 終了コード: 0=OK / 1=エラーあり（CI で push 毎に実行）
 *
 * 検証内容:
 *  - certifications/* /data/*.json のスキーマ（必須フィールド・型・参照整合）
 *  - questions.json: ID重複 / answers の範囲 / multi 整合 / domain 実在 /
 *    diff(1-3) / reference_url 形式 / fig・expFig が figures.js に実在 /
 *    case⇔scenario の対応
 *  - vocab.json の fig 参照 / domains.json のウェイト合計
 *  - キャッシュ版数の3点セット整合（sw.js CACHE / SHELL の ?v= / 各HTMLの ?v=）
 *  - 主要 JS の構文チェック（node --check）
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let errors = 0, warnings = 0;
const err = (msg) => { errors++; console.error('  ❌ ' + msg); };
const warn = (msg) => { warnings++; console.warn('  ⚠️  ' + msg); };
const info = (msg) => console.log(msg);

function readJSON(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

/* ---- figures.js を評価して図キー一覧を得る（window スタブ） ---- */
function loadFigureKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'figures.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src)(sandbox.window);
  return new Set(Object.keys(sandbox.window.SFQ_FIGURES || {}));
}

/* ---- 1資格分の data/*.json を検証 ---- */
function validateCert(slug, figKeys) {
  info('\n== ' + slug + ' ==');
  const dir = path.join(ROOT, 'certifications', slug, 'data');

  let domains;
  try { domains = readJSON(path.join(dir, 'domains.json')); }
  catch (e) { err('domains.json が読めない: ' + e.message); return; }
  const codes = new Set();
  let wsum = 0;
  (domains.domains || []).forEach((d, i) => {
    if (!d.code) err('domains[' + i + '] code がない');
    else if (codes.has(d.code)) err('domains code 重複: ' + d.code);
    else codes.add(d.code);
    if (!d.name) err('domains[' + i + '] name がない');
    if (typeof d.weight !== 'number') err('domains[' + i + '] weight が数値でない');
    else wsum += d.weight;
  });
  if (Math.abs(wsum - 100) > 0.01) warn('domains weight 合計が ' + wsum + '（100 が期待値）');

  let questions;
  try { questions = readJSON(path.join(dir, 'questions.json')); }
  catch (e) { err('questions.json が読めない: ' + e.message); return; }
  if (!Array.isArray(questions)) { err('questions.json が配列でない'); return; }

  const ids = new Set();
  const caseGroups = {};   // case名 -> {n, scenarios:Set}
  questions.forEach((q) => {
    const tag = 'q[id=' + q.id + ']';
    if (typeof q.id !== 'number') err(tag + ' id が数値でない');
    else if (ids.has(q.id)) err('ID 重複: ' + q.id);
    else ids.add(q.id);
    if (!q.question || typeof q.question !== 'string') err(tag + ' question が空');
    if (!Array.isArray(q.choices) || q.choices.length < 2) err(tag + ' choices が2件未満');
    if (!Array.isArray(q.answers) || !q.answers.length) { err(tag + ' answers が空'); return; }
    // answers は選択肢の「文字列」配列（finishExam が choices の値と突き合わせる）
    q.answers.forEach((a) => {
      if (!q.choices.includes(a)) err(tag + ' answers に choices に無い値: ' + JSON.stringify(a).slice(0, 60));
    });
    if (new Set(q.answers).size !== q.answers.length) err(tag + ' answers に重複');
    if ((!!q.multi) !== (q.answers.length > 1)) err(tag + ' multi と answers 件数が不整合');
    if (!q.domain) err(tag + ' domain がない');
    else if (!codes.has(q.domain)) err(tag + ' 未知の domain: ' + q.domain);
    if (q.diff != null && ![1, 2, 3].includes(q.diff)) err(tag + ' diff が 1/2/3 でない: ' + q.diff);
    if (q.diff == null) warn(tag + ' diff 未設定（正答率から推定表示になる）');
    if (!q.explanation) warn(tag + ' explanation が空');
    if (!q.reference_url) warn(tag + ' reference_url がない');
    else if (!/^https?:\/\//.test(q.reference_url)) err(tag + ' reference_url がURL形式でない');
    ['fig', 'expFig'].forEach((k) => {
      if (q[k] && !figKeys.has(slug + '/' + q[k])) err(tag + ' ' + k + ' の図が figures.js にない: ' + slug + '/' + q[k]);
    });
    if (!!q.case !== !!q.scenario) err(tag + ' case と scenario は両方セットで指定する');
    // Distractor 品質: 正解だけ突出して長いと長さで答えがバレる（運用ルール「全選択肢を同程度の文長に」）
    // ※ 選択肢がコードスニペットの問題は、長さの均等化が技術的に成立しないため検査対象外
    const wrongs = q.choices.filter((c) => !q.answers.includes(c));
    const looksCode = (s) => /[{};=]|=>|::|\.\w+\(|\)\s*\./.test(String(s));
    const codeChoices = q.choices.some(looksCode);
    if (!codeChoices && wrongs.length && Array.isArray(q.answers) && q.answers.every((a) => typeof a === 'string')) {
      const aLen = Math.max(...q.answers.map((a) => a.length));
      const wMax = Math.max(...wrongs.map((w) => w.length));
      if (aLen > wMax * 1.8 && aLen > 40) warn(tag + ' 正解が不正解より突出して長い（' + aLen + '字 vs 最長' + wMax + '字）');
    }
    if (q.case) {
      const g = caseGroups[q.case] || (caseGroups[q.case] = { n: 0, scenarios: new Set() });
      g.n++; g.scenarios.add(q.scenario);
    }
  });
  Object.keys(caseGroups).forEach((c) => {
    const g = caseGroups[c];
    if (g.n < 2) warn('ケース "' + c + '" の問題が1問だけ（束ねる意味がない）');
    if (g.scenarios.size > 1) err('ケース "' + c + '" の scenario 文が複数ある（全問同一にする）');
  });
  info('  questions: ' + questions.length + '問 / case: ' + Object.keys(caseGroups).length + '件');

  let vocab;
  try { vocab = readJSON(path.join(dir, 'vocab.json')); }
  catch (e) { err('vocab.json が読めない: ' + e.message); vocab = []; }
  let terms = 0;
  (vocab || []).forEach((ch, i) => {
    if (!ch.chapter) err('vocab[' + i + '] chapter がない');
    (ch.terms || []).forEach((t) => {
      terms++;
      if (!t.title) err('vocab 章「' + (ch.chapter || i) + '」に title の無い用語');
      if (t.fig && !figKeys.has(slug + '/' + t.fig)) err('用語「' + t.title + '」の fig が figures.js にない: ' + slug + '/' + t.fig);
    });
  });
  info('  vocab: ' + (vocab || []).length + '章 ' + terms + '語');

  ['navmap.json', 'cram.json', 'compare.json'].forEach((f) => {
    try {
      const d = readJSON(path.join(dir, f));
      if (!Array.isArray(d)) { err(f + ' が配列でない'); return; }
      d.forEach((x, i) => {
        if (!x.title) err(f + '[' + i + '] title がない');
        if (!x.content) err(f + '[' + i + '] content がない');
      });
    } catch (e) { err(f + ' が読めない: ' + e.message); }
  });

  // lessons.json（任意・授業スライド）。ある資格だけ検証する
  // [{id, title, domain?, est?, slides:[{title, body?, code?, fig?, figCap?, checkIds?[]}]}]
  const lpath = path.join(dir, 'lessons.json');
  if (fs.existsSync(lpath)) {
    let lessons = null;
    try { lessons = readJSON(lpath); } catch (e) { err('lessons.json が読めない: ' + e.message); }
    if (lessons && !Array.isArray(lessons)) err('lessons.json が配列でない');
    else if (lessons) {
      const lids = new Set();
      let slideN = 0;
      lessons.forEach((l, i) => {
        const tag = 'lesson[' + (l && l.id != null ? l.id : i) + ']';
        if (!l.id || !/^[\w-]+$/.test(String(l.id))) err(tag + ' id が無い/不正（英数とハイフンのみ・onclickに直接埋め込むため）');
        else if (lids.has(l.id)) err('lessons id 重複: ' + l.id);
        else lids.add(l.id);
        if (!l.title) err(tag + ' title がない');
        if (l.domain && !codes.has(l.domain)) err(tag + ' 未知の domain: ' + l.domain);
        if (!Array.isArray(l.slides) || !l.slides.length) { err(tag + ' slides が空'); return; }
        l.slides.forEach((s, si) => {
          slideN++;
          if (!s.title) err(tag + ' slides[' + si + '] title がない');
          if (s.fig && !figKeys.has(slug + '/' + s.fig)) err(tag + ' slides[' + si + '] fig が figures.js にない: ' + slug + '/' + s.fig);
          if (s.checkIds != null) {
            if (!Array.isArray(s.checkIds)) err(tag + ' slides[' + si + '] checkIds が配列でない');
            else s.checkIds.forEach((qid) => { if (!ids.has(qid)) err(tag + ' slides[' + si + '] checkIds に存在しない問題ID: ' + qid); });
          }
        });
      });
      info('  lessons: ' + lessons.length + '本 ' + slideN + 'スライド');
    }
  }
}

/* ---- キャッシュ版数の3点セット整合 ---- */
function validateVersions() {
  info('\n== キャッシュ版数 ==');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const cm = sw.match(/const CACHE\s*=\s*'sf-exam-v(\d+)'/);
  if (!cm) { err('sw.js の CACHE が見つからない'); return; }
  const versions = new Set();
  const collect = (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    (src.match(/\?v=(\d+)/g) || []).forEach((m) => versions.add(file + ' → ' + m));
  };
  ['sw.js', 'index.html'].forEach(collect);
  fs.readdirSync(path.join(ROOT, 'certifications')).forEach((slug) => {
    const f = path.join('certifications', slug, 'index.html');
    if (fs.existsSync(path.join(ROOT, f))) collect(f);
  });
  const nums = new Set([...versions].map((v) => v.match(/\?v=(\d+)/)[1]));
  if (nums.size > 1) {
    err('?v= の版数が混在: ' + [...nums].join(', '));
    [...versions].forEach((v) => info('     ' + v));
  } else {
    info('  CACHE=v' + cm[1] + ' / アセット ?v=' + [...nums][0] + ' … 整合OK');
  }
}

/* ---- 主要 JS の構文チェック ---- */
function validateSyntax() {
  info('\n== JS 構文 ==');
  const files = ['quiz-engine.js', 'cloud-sync.js', 'changelog.js', 'figures.js', 'firebase-config.js', 'sw.js']
    .concat(fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.js')).map((f) => 'tools/' + f));
  files.forEach((f) => {
    try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); }
    catch (e) { err(f + ' 構文エラー: ' + String(e.stderr || e.message).split('\n')[0]); }
  });
  info('  ' + files.length + 'ファイル検査');
}

/* ---- changelog.js の形式 ---- */
function validateChangelog() {
  info('\n== changelog ==');
  const src = fs.readFileSync(path.join(ROOT, 'changelog.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src)(sandbox.window);
  const log = sandbox.window.SFQ_CHANGELOG;
  if (!Array.isArray(log) || !log.length) { err('SFQ_CHANGELOG が空'); return; }
  const seen = new Set();
  log.forEach((e, i) => {
    if (!e.id) err('changelog[' + i + '] id がない');
    else if (seen.has(e.id)) err('changelog id 重複: ' + e.id);
    else seen.add(e.id);
    if (!/^\d{4}-\d{2}-\d{2}/.test(e.date || '')) err('changelog[' + i + '] date が YYYY-MM-DD でない');
    if (!e.title) err('changelog[' + i + '] title がない');
    if (!Array.isArray(e.items) || !e.items.length) err('changelog[' + i + '] items が空');
  });
  info('  ' + log.length + '件 / 先頭 id=' + log[0].id);
}

/* ---- main ---- */
const figKeys = loadFigureKeys();
info('図解: ' + figKeys.size + '点を figures.js から読込');
fs.readdirSync(path.join(ROOT, 'certifications')).forEach((slug) => {
  if (fs.existsSync(path.join(ROOT, 'certifications', slug, 'data'))) validateCert(slug, figKeys);
});
validateVersions();
validateSyntax();
validateChangelog();

console.log('\n' + (errors ? '❌ エラー ' + errors + '件' : '✅ エラーなし') + (warnings ? ' / 警告 ' + warnings + '件' : ''));
process.exit(errors ? 1 : 0);
