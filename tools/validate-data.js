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
 *  - sw.js の SHELL[] プリキャッシュ対象がディスクに実在するか
 *  - manifest.webmanifest の必須キー・shortcuts の遷移先・icons の実在
 *  - LP の CERTS[].meta（問題数/用語数/合格%）とシェルの CERT_CONFIG がデータ実数と一致するか
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

/* ---- 重複検出ヘルパー（出典横断の高類似ペアを警告） ----
 * tyson / jpnshiken など複数の問題集ダンプを取り込むと、同一の実試験問題が
 * 「同じ英語原文を別々に和訳した」状態で二重登録されやすい。素の文字 3-gram だけ
 * では訳ゆれ（主従関係⇔マスター/詳細、商談⇔取引⇔機会、レコード⇔記録 など）で
 * 類似度が落ちて取りこぼすため、Salesforce 用語の訳ゆれを正規化してから
 * ①問題文＋選択肢の 3-gram Jaccard と ②正解集合の一致 の2系統で照合する。
 * ※ 文字ベースの近似のため万能ではない（文体差が大きいと拾えない）。警告どまり＝
 *    判断は人手。新ダンプ取り込み時の重複統合の入口として使う。*/
// よくある訳ゆれを代表トークンへ寄せる（長い語句から先に置換する）
const _SYN = [
  [['マスター詳細', 'マスター/詳細', 'マスター・詳細', '主従'], 'MD'],
  [['連結オブジェクト', 'ジャンクション'], 'JUNC'],
  [['取引先責任者', '連絡先'], 'CONTACT'],
  [['取引先', 'アカウント'], 'ACCOUNT'],
  [['商談', '取引', '機会'], 'OPP'],
  [['レコードタイプ'], 'RECTYPE'],
  [['レコード', '記録'], 'RECORD'],
  [['フェーズ', 'ステージ'], 'STAGE'],
  [['ステータス', '状況'], 'STATUS'],
  [['組織情報', '会社情報'], 'COMPANYINFO'],
  [['選択リスト', 'ピックリスト'], 'PICKLIST'],
  [['項目自動更新', 'フィールドの更新', 'フィールド更新', '項目の更新'], 'FIELDUPDATE'],
  [['カスタム項目', 'カスタムフィールド'], 'CUSTOMFIELD'],
  [['項目', 'フィールド'], 'FIELD'],
  [['無効化', '非アクティブ化'], 'DEACTIVATE'],
  [['有効化', 'アクティブ化', 'アクティベーション'], 'ACTIVATE'],
  [['重要な更新プログラム', '重要な更新', '重要なアップデート', 'リリース更新'], 'CRITICALUPDATE'],
  [['積み上げ集計', 'ロールアップサマリー', 'ロールアップ集計', 'ロールアップ'], 'ROLLUP'],
  [['対応付け', 'マッピング', 'マップします', 'マップ'], 'MAP'],
  [['取引開始', 'コンバート', '変換'], 'CONVERT'],
  [['ライトニングページ', 'lightningページ'], 'LIGHTNINGPAGE'],
  [['所有者に基づく', '所有者ベース'], 'OWNERBASED'],
  [['リレーションシップ', 'リレーション', '関係'], 'REL'],
  [['公開グループ', 'パブリックグループ'], 'PUBGROUP'],
  [['非公開グループ', 'プライベートグループ'], 'PRIVGROUP'],
  [['プラットフォーム管理者', '管理者'], 'ADMIN'],
  [['役割', 'ロール'], 'ROLE'],
  [['メールアラート', 'メール アラート'], 'EMAILALERT'],
];
function _norm(s) {
  let t = String(s || '').toLowerCase();
  for (const [arr, canon] of _SYN) for (const w of arr) t = t.split(w.toLowerCase()).join(canon);
  return t
    .replace(/[\s　]/g, '')
    .replace(/[、。，．,\.・「」『』（）()\[\]【】！？!?：:；\-―ー~〜"“”'’]/g, '');
}
function _grams(s, n = 3) {
  const g = new Set();
  for (let i = 0; i + n <= s.length; i++) g.add(s.slice(i, i + n));
  return g;
}
function _jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}
function checkCrossSourceDuplicates(questions) {
  const arr = questions
    .filter((q) => q.source && q.question)
    .map((q) => ({
      id: q.id, src: q.source,
      g: _grams(_norm(q.question) + (q.choices || []).map(_norm).sort().join('')),
      a: new Set((q.answers || []).map(_norm)),    // 正解集合（訳ゆれ正規化済み）
    }));
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i].src === arr[j].src) continue;   // 出典横断のみ
      const sb = _jaccard(arr[i].g, arr[j].g);          // 本文の類似度
      const sa = _jaccard(arr[i].a, arr[j].a);          // 正解集合の類似度
      // 本文がよく似ている / 正解集合がほぼ一致しつつ本文も一定以上、のどちらかで警告
      if (sb >= 0.5 || (sa >= 0.7 && sb >= 0.32)) {
        n++;
        warn('出典横断の重複疑い 本文sim=' + sb.toFixed(2) + ' 正解sim=' + sa.toFixed(2) +
          '  #' + arr[i].id + '(' + arr[i].src + ') ⇔ #' + arr[j].id + '(' + arr[j].src + ')' +
          ((sb >= 0.7 || sa >= 0.99) ? ' ＝ほぼ同一' : ''));
      }
    }
  }
  if (n) info('  （上記は出典をまたいだ重複の可能性。要確認＝必要なら片方へ統合）');
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
  // スキーマで想定しているキー。ここに無いキーは「タイポ or 未使用の死んだデータ」の疑いとして警告する。
  const KNOWN_Q_KEYS = new Set(['id', 'question', 'choices', 'answers', 'explanation', 'reference_url', 'multi', 'domain', 'keywords', 'source', 'diff', 'fig', 'expFig', 'case', 'scenario']);
  const unknownKeys = {};
  let fewChoices = 0;   // 本番形式(4択以上)でない問題の数
  questions.forEach((q) => {
    const tag = 'q[id=' + q.id + ']';
    Object.keys(q).forEach((k) => { if (!KNOWN_Q_KEYS.has(k)) unknownKeys[k] = (unknownKeys[k] || 0) + 1; });
    if (Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length < 4) fewChoices++;
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
  // スキーマ外キー（死んだデータ・タイポの検出）
  Object.keys(unknownKeys).forEach((k) => warn('スキーマ外のキー "' + k + '" が ' + unknownKeys[k] + '問にある（タイポか、参照されていない死んだデータの疑い）'));
  // 本番形式（4択以上）でない問題の数（agentforce/service-cloud に3択が多い＝難易度が構造的に低く出る）
  if (fewChoices) warn('選択肢が4件未満（本番形式でない）問題が ' + fewChoices + '問');
  // domains.json の map（問題ID→分野の手動対応表。sf-admin のみ）が実在する問題IDを指しているか
  if (domains.map) {
    const orphans = Object.keys(domains.map).map(Number).filter((id) => !ids.has(id));
    if (orphans.length) warn('domains.json の map に存在しない問題IDが ' + orphans.length + '件: ' + orphans.slice(0, 12).join(',') + (orphans.length > 12 ? ' …' : ''));
  }
  info('  questions: ' + questions.length + '問 / case: ' + Object.keys(caseGroups).length + '件');
  checkCrossSourceDuplicates(questions);

  let vocab;
  try { vocab = readJSON(path.join(dir, 'vocab.json')); }
  catch (e) { err('vocab.json が読めない: ' + e.message); vocab = []; }
  if (vocab && !Array.isArray(vocab)) { err('vocab.json が配列でない'); vocab = []; }
  let terms = 0;
  const vTitles = new Set();
  const vChapters = new Set();
  // 章・用語で想定しているキー。ここに無いキーはタイポ or 死んだデータの疑い（警告）
  const KNOWN_CH_KEYS = new Set(['chapter', 'terms', 'domain', 'emoji']);
  const KNOWN_TERM_KEYS = new Set(['title', 'jaName', 'enName', 'definition', 'examPoints', 'questions', 'fig', 'domain']);
  const unknownVocabKeys = {};
  (vocab || []).forEach((ch, i) => {
    if (!ch || typeof ch !== 'object') { err('vocab[' + i + '] がオブジェクトでない'); return; }
    Object.keys(ch).forEach((k) => { if (!KNOWN_CH_KEYS.has(k)) unknownVocabKeys[k] = (unknownVocabKeys[k] || 0) + 1; });
    if (!ch.chapter) err('vocab[' + i + '] chapter がない');
    else if (vChapters.has(ch.chapter)) err('vocab 章タイトル重複: ' + ch.chapter);
    else vChapters.add(ch.chapter);
    if (!Array.isArray(ch.terms)) err('vocab[' + i + '] terms が配列でない');
    else if (!ch.terms.length) warn('vocab 章「' + (ch.chapter || i) + '」の terms が空（教科書に空の章が出る）');
    (ch.terms || []).forEach((t) => {
      terms++;
      Object.keys(t || {}).forEach((k) => { if (!KNOWN_TERM_KEYS.has(k)) unknownVocabKeys[k] = (unknownVocabKeys[k] || 0) + 1; });
      if (!t.title) err('vocab 章「' + (ch.chapter || i) + '」に title の無い用語');
      else if (vTitles.has(t.title)) warn('用語 title 重複: ' + t.title);
      else vTitles.add(t.title);
      if (t.definition != null && typeof t.definition !== 'string') err('用語「' + t.title + '」の definition が文字列でない');
      if (t.examPoints != null && !Array.isArray(t.examPoints)) err('用語「' + t.title + '」の examPoints が配列でない');
      if (t.questions != null && !Array.isArray(t.questions)) err('用語「' + t.title + '」の questions が配列でない');
      if (t.fig && !figKeys.has(slug + '/' + t.fig)) err('用語「' + t.title + '」の fig が figures.js にない: ' + slug + '/' + t.fig);
      // 用語→関連問題の逆引き（questions[]）が実在する問題IDを指しているか（問題削除で腐るのを防ぐ）
      if (Array.isArray(t.questions)) t.questions.forEach((qid) => { if (!ids.has(qid)) warn('用語「' + t.title + '」の questions に存在しない問題ID: ' + qid); });
    });
  });
  Object.keys(unknownVocabKeys).forEach((k) => warn('vocab のスキーマ外キー "' + k + '" が ' + unknownVocabKeys[k] + '件（タイポか死んだデータの疑い）'));
  info('  vocab: ' + (vocab || []).length + '章 ' + terms + '語');

  // navmap（設定マップ）/ cram（直前対策）/ compare（比較表）は [{title, content, domain?}] の素朴な配列。
  // 形式だけを検査する（本文の正誤は人手レビュー）。
  const SECTION_KEYS = { 'navmap.json': ['title', 'content', 'domain', 'emoji'], 'cram.json': ['title', 'content', 'domain', 'emoji'], 'compare.json': ['title', 'content', 'domain', 'emoji'] };
  ['navmap.json', 'cram.json', 'compare.json'].forEach((f) => {
    const fp = path.join(dir, f);
    if (!fs.existsSync(fp)) return;   // cram/compare は任意
    try {
      const d = readJSON(fp);
      if (!Array.isArray(d)) { err(f + ' が配列でない'); return; }
      if (!d.length) { warn(f + ' が空配列（教科書タブに何も出ない）'); return; }
      const known = new Set(SECTION_KEYS[f]);
      const seenTitles = new Set();
      const unknown = {};
      d.forEach((x, i) => {
        if (!x || typeof x !== 'object') { err(f + '[' + i + '] がオブジェクトでない'); return; }
        Object.keys(x).forEach((k) => { if (!known.has(k)) unknown[k] = (unknown[k] || 0) + 1; });
        if (!x.title) err(f + '[' + i + '] title がない');
        else if (typeof x.title !== 'string') err(f + '[' + i + '] title が文字列でない');
        else if (seenTitles.has(x.title)) warn(f + ' title 重複: ' + x.title);
        else seenTitles.add(x.title);
        if (!x.content) err(f + '[' + i + '] content がない');
        else if (typeof x.content !== 'string') err(f + '[' + i + '] content が文字列でない');
        if (x.domain && !codes.has(x.domain)) err(f + '[' + i + '] 未知の domain: ' + x.domain);
      });
      Object.keys(unknown).forEach((k) => warn(f + ' のスキーマ外キー "' + k + '" が ' + unknown[k] + '件（タイポか死んだデータの疑い）'));
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
    return;
  }
  const assetV = [...nums][0];
  // 3点セット＝CACHE 文字列・SHELL の ?v=・各HTMLの ?v= がすべて一致すること。
  // 以前は ?v= 同士の一致しか見ておらず、CACHE だけがドリフトしていても素通りしていた（実際に v132 対 ?v=130 が緑になっていた）。
  if (cm[1] !== assetV) {
    err('CACHE(sf-exam-v' + cm[1] + ') とアセット ?v=' + assetV + ' の版数が不一致（tools/bump-version.js で3点セットを揃える）');
  } else {
    info('  CACHE=v' + cm[1] + ' / アセット ?v=' + assetV + ' … 整合OK');
  }
}

/* ---- sw.js の SHELL[] プリキャッシュ対象が実在するか ----
 * install の `Promise.allSettled` は個々の `cache.add()` 失敗を握り潰すため、
 * SHELL にタイプミスや消したファイルが残っていても静かに素通りし、
 * 「初回訪問からオフラインで使える」前提だけが崩れる。ここで実在を保証する。 */
function validateShell() {
  info('\n== SW プリキャッシュ(SHELL) ==');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!m) { err('sw.js の SHELL 配列が見つからない'); return; }
  const entries = (m[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1));
  if (!entries.length) { err('sw.js の SHELL が空'); return; }
  let missing = 0;
  const seen = new Set();
  entries.forEach((e) => {
    if (seen.has(e)) warn('SHELL に重複エントリ: ' + e);
    else seen.add(e);
    // './' はディレクトリ（=index.html）を指すエントリ。?v= は実ファイル名に含まれない
    const rel = e.replace(/^\.\//, '').replace(/\?.*$/, '');
    const target = rel === '' ? 'index.html' : rel;
    if (!fs.existsSync(path.join(ROOT, target))) { err('SHELL の参照先が存在しない: ' + e); missing++; }
  });
  // 公開中の資格シェルが漏れていないか（プリキャッシュ漏れ＝その資格だけ初回オフライン不可）
  fs.readdirSync(path.join(ROOT, 'certifications')).forEach((slug) => {
    const shell = 'certifications/' + slug + '/index.html';
    if (!fs.existsSync(path.join(ROOT, shell))) return;
    if (!entries.some((e) => e.replace(/^\.\//, '').replace(/\?.*$/, '') === shell)) {
      warn('SHELL に資格シェルが無い（初回オフラインで開けない）: ' + shell);
    }
  });
  info('  ' + entries.length + '件検査' + (missing ? ' / 欠落 ' + missing + '件' : ' … すべて実在'));
}

/* ---- manifest.webmanifest の形式・参照整合 ---- */
function validateManifest() {
  info('\n== manifest ==');
  const mp = path.join(ROOT, 'manifest.webmanifest');
  let mf;
  try { mf = readJSON(mp); }
  catch (e) { err('manifest.webmanifest が読めない/JSONとして不正: ' + e.message); return; }
  ['name', 'short_name', 'start_url', 'display', 'icons'].forEach((k) => {
    if (mf[k] == null || mf[k] === '') err('manifest に必須キー "' + k + '" がない');
  });
  // id は省略時 start_url が使われる。明示しておくと start_url を変えてもインストール済みアプリの同一性が保てる
  if (!mf.id) warn('manifest に id が無い（start_url 変更でインストール済みアプリの同一性が崩れる）');
  if (!Array.isArray(mf.icons) || !mf.icons.length) err('manifest の icons が空');
  else {
    let maskable = false;
    mf.icons.forEach((ic, i) => {
      if (!ic.src) { err('manifest icons[' + i + '] に src がない'); return; }
      if (!fs.existsSync(path.join(ROOT, ic.src))) err('manifest icons[' + i + '] のファイルが存在しない: ' + ic.src);
      if (!ic.sizes) warn('manifest icons[' + i + '] に sizes がない');
      if (String(ic.purpose || '').includes('maskable')) maskable = true;
    });
    if (!maskable) warn('manifest に maskable アイコンが無い（Android のアイコンが白枠になる）');
  }
  const certDir = path.join(ROOT, 'certifications');
  (mf.shortcuts || []).forEach((sc, i) => {
    const tag = 'manifest shortcuts[' + i + ']';
    if (!sc.name) err(tag + ' に name がない');
    if (!sc.url) { err(tag + ' に url がない'); return; }
    const file = sc.url.replace(/^\.\//, '').replace(/[?#].*$/, '');
    if (!fs.existsSync(path.join(ROOT, file))) err(tag + ' の遷移先が存在しない: ' + sc.url);
    // ?go= はエンジンの handleLaunchShortcut() が解釈する値だけを許す
    const go = (sc.url.match(/[?&]go=([^&#]*)/) || [])[1];
    if (go && !['daily', 'exam'].includes(go)) err(tag + ' の ?go= が未対応の値: ' + go);
    (sc.icons || []).forEach((ic) => {
      if (ic.src && !fs.existsSync(path.join(ROOT, ic.src))) err(tag + ' のアイコンが存在しない: ' + ic.src);
    });
    if (file.startsWith('certifications/')) {
      const slug = file.split('/')[1];
      if (!fs.existsSync(path.join(certDir, slug, 'data'))) err(tag + ' が存在しない資格を指している: ' + slug);
    }
  });
  info('  icons ' + (mf.icons || []).length + '件 / shortcuts ' + (mf.shortcuts || []).length + '件 … 参照OK');
}

/* ---- LP の資格カード（CERTS）と各シェルの CERT_CONFIG がデータ実数と一致するか ----
 * LP の meta（問題数・用語数・合格%）は data/*.json と手動同期する運用なので、
 * 増問・用語追加のたびにドリフトする。ここで実数と突き合わせて取りこぼしを防ぐ。 */
function validateLanding() {
  info('\n== LP の資格カード ==');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const CERTS\s*=\s*(\[[\s\S]*?\n\s*\];)/);
  if (!m) { err('index.html の CERTS 配列が見つからない'); return; }
  let certs;
  try { certs = new Function('return ' + m[1].replace(/;\s*$/, ''))(); }
  catch (e) { err('index.html の CERTS を評価できない: ' + e.message); return; }
  let n = 0;
  certs.forEach((c) => {
    if (!c || c.coming || !c.slug) return;
    n++;
    const dir = path.join(ROOT, 'certifications', c.slug, 'data');
    if (!fs.existsSync(dir)) { err('CERTS の slug に対応する資格が無い: ' + c.slug); return; }
    let qs = [], vocab = [];
    try { qs = readJSON(path.join(dir, 'questions.json')); } catch (e) { return; }
    try { vocab = readJSON(path.join(dir, 'vocab.json')); } catch (e) { vocab = []; }
    const terms = (vocab || []).reduce((a, ch) => a + ((ch.terms || []).length), 0);
    const meta = (c.meta || []).join(' ');
    const pick = (re) => { const x = meta.match(re); return x ? Number(x[1]) : null; };
    const mq = pick(/(\d+)問/), mv = pick(/(\d+)用語/), mp = pick(/合格(\d+)%/);
    if (mq !== qs.length) err('LP ' + c.slug + ' の問題数が実数と不一致: meta=' + mq + ' 実数=' + qs.length);
    if (mv !== terms) err('LP ' + c.slug + ' の用語数が実数と不一致: meta=' + mv + ' 実数=' + terms);
    // 合格ラインはシェルの CERT_CONFIG.pass が出典（採点に使われるのはこちら）
    const shellPath = path.join(ROOT, 'certifications', c.slug, 'index.html');
    if (fs.existsSync(shellPath)) {
      const shell = fs.readFileSync(shellPath, 'utf8');
      const cm = shell.match(/window\.CERT_CONFIG\s*=\s*(\{[\s\S]*?\n\s*\};)/);
      if (!cm) err(c.slug + ' のシェルに CERT_CONFIG が無い');
      else {
        let cfg = null;
        try { cfg = new Function('return ' + cm[1].replace(/;\s*$/, ''))(); } catch (e) { err(c.slug + ' の CERT_CONFIG を評価できない: ' + e.message); }
        if (cfg) {
          if (cfg.slug !== c.slug) err(c.slug + ' のシェルの CERT_CONFIG.slug が違う: ' + cfg.slug);
          if (cfg.storageKey !== c.storageKey) err(c.slug + ' の storageKey が LP と不一致: LP=' + c.storageKey + ' シェル=' + cfg.storageKey);
          if (mp !== cfg.pass) err('LP ' + c.slug + ' の合格ラインがシェルと不一致: meta=' + mp + '% CERT_CONFIG.pass=' + cfg.pass + '%');
          if (!(cfg.examN > 0)) err(c.slug + ' の examN が不正: ' + cfg.examN);
          if (qs.length < cfg.examN) err(c.slug + ' の問題数(' + qs.length + ')が模試の出題数(' + cfg.examN + ')未満');
        }
      }
    }
  });
  info('  ' + n + '資格の meta / CERT_CONFIG を実数と照合');
}

/* ---- 模試が公式ブループリントを再現できるか（在庫の偏りを検出） ----
 * 模試は domains.json の weight 比で examN 問を抽出する。ある分野の在庫が
 * 必要数に満たないと、その不足分は他分野へ回るため公式比率が崩れる
 * （weight は公式準拠で不可侵なので、是正は「その分野の問題を足す」しかない）。
 * ここでは是正が必要な資格・分野を可視化する。エラーにはしない（データ作業＝人手）。 */
function validateBlueprint() {
  info('\n== 模試のブループリント再現性 ==');
  fs.readdirSync(path.join(ROOT, 'certifications')).forEach((slug) => {
    const dir = path.join(ROOT, 'certifications', slug, 'data');
    if (!fs.existsSync(dir)) return;
    const shellPath = path.join(ROOT, 'certifications', slug, 'index.html');
    if (!fs.existsSync(shellPath)) return;
    const cm = fs.readFileSync(shellPath, 'utf8').match(/window\.CERT_CONFIG\s*=\s*(\{[\s\S]*?\n\s*\};)/);
    if (!cm) return;
    let cfg = null;
    try { cfg = new Function('return ' + cm[1].replace(/;\s*$/, ''))(); } catch (e) { return; }
    const n = (cfg && cfg.examN) || 60;
    let qs, dom;
    try { qs = readJSON(path.join(dir, 'questions.json')); dom = readJSON(path.join(dir, 'domains.json')); }
    catch (e) { return; }
    const defs = (dom && dom.domains) || [];
    const totW = defs.reduce((a, d) => a + (d.weight || 0), 0);
    if (!defs.length || totW <= 0) return;
    const stock = {};
    qs.forEach((q) => { stock[q.domain] = (stock[q.domain] || 0) + 1; });
    const short = [];
    let missing = 0;
    defs.forEach((d) => {
      const want = Math.round(n * (d.weight || 0) / totW);
      const have = stock[d.code] || 0;
      if (have < want) { missing += want - have; short.push(d.code + '(必要' + want + '/在庫' + have + ')'); }
    });
    // 出題プールが薄いと毎回ほぼ同じ問題になる（＝模試として機能しにくい）
    const reuse = qs.length ? Math.round((n / qs.length) * 100) : 100;
    if (missing) warn(slug + ': 分野の在庫不足で公式比率を再現できない … ' + missing + '問不足 ' + short.join(' '));
    if (reuse >= 60) warn(slug + ': 模試1回で全問題の約' + reuse + '%を消費（' + qs.length + '問中' + n + '問）＝毎回ほぼ同じ出題になる');
    if (!missing && reuse < 60) info('  ' + slug + ': OK（' + qs.length + '問 / 1回あたり' + reuse + '%）');
  });
}

/* ---- 主要 JS の構文チェック ---- */
function validateSyntax() {
  info('\n== JS 構文 ==');
  const files = ['quiz-engine.js', 'cloud-sync.js', 'changelog.js', 'figures.js', 'progression.js', 'firebase-config.js', 'sw.js']
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
validateShell();
validateManifest();
validateLanding();
validateBlueprint();
validateSyntax();
validateChangelog();

console.log('\n' + (errors ? '❌ エラー ' + errors + '件' : '✅ エラーなし') + (warnings ? ' / 警告 ' + warnings + '件' : ''));
process.exit(errors ? 1 : 0);
