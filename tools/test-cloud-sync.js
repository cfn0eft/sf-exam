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

/* ---- メンテナンス中でも利用できるアカウント（maintOk）の判定 ---- */
const NOW = 1800000000000;                                  // 固定の基準時刻
const IN_MAINT = { queue: [{ start: NOW - 60000, end: NOW + 60000, msg: 'メンテ中' }] };
const NO_MAINT = { queue: [{ start: NOW + 3600000, end: NOW + 7200000, msg: '未来のメンテ' }] };

t('maintShouldBlock: メンテ中は通常アカウントを転送する', () => {
  const st = T.maintStatus(IN_MAINT, NOW);
  ok(st.active, 'メンテ中と判定されること');
  eq(T.maintShouldBlock(st, false, false), true, '例外なし＝転送');
});

t('maintShouldBlock: メンテ許可(maintOk)のアカウントは転送しない', () => {
  const st = T.maintStatus(IN_MAINT, NOW);
  eq(T.maintShouldBlock(st, true, false), false, 'exempt＝素通り');
});

t('maintShouldBlock: 緊急全停止(fullStop)でもメンテ許可は素通りできる', () => {
  const st = T.maintStatus({ fullStop: true }, NOW);
  ok(st.active && st.entry, 'fullStop はメンテ中扱い');
  eq(T.maintShouldBlock(st, false, false), true, '通常アカウントは転送');
  eq(T.maintShouldBlock(st, true, false), false, 'メンテ許可は素通り');
});

t('maintShouldBlock: プレビュー合言葉の端末は転送しない', () => {
  const st = T.maintStatus(IN_MAINT, NOW);
  eq(T.maintShouldBlock(st, false, true), false, 'preview＝素通り');
});

t('maintShouldBlock: メンテ中でなければ誰も転送しない', () => {
  const st = T.maintStatus(NO_MAINT, NOW);
  eq(st.active, false, '未来のメンテはアクティブでない');
  eq(T.maintShouldBlock(st, false, false), false);
  eq(T.maintShouldBlock(st, true, false), false);
  eq(T.maintShouldBlock(null, false, false), false, '設定なしも転送しない');
});

/* ---- 休眠アカウントの承認失効（30日アクセスなし） ---- */
const DAY = 86400000;
const D31 = NOW - 31 * DAY, D10 = NOW - 10 * DAY;

t('accessExpired: 承認済みで31日アクセスなしは失効', () => {
  eq(T.INACTIVE_DAYS, 30, '既定は30日');
  eq(T.accessExpired({ access: 'approved', lastSeen: D31, lastLogin: D31 }, NOW), true);
  eq(T.inactiveDaysOf({ lastSeen: D31 }, NOW), 31, '経過日数');
});

t('accessExpired: 10日前のアクセスなら失効しない', () => {
  eq(T.accessExpired({ access: 'approved', lastSeen: D10, lastLogin: D31 }, NOW), false, '新しい方(lastSeen)を採用');
});

t('accessExpired: 起点は lastSeen / lastLogin / approvedAt の最も新しいもの', () => {
  // ログインは31日前でも、開いたままアクセスが続いていれば失効させない
  eq(T.accessExpired({ access: 'approved', lastLogin: D31, lastSeen: NOW - DAY }, NOW), false, 'lastSeen が新しい');
  // 再承認直後は lastSeen/lastLogin が古くても失効させない（承認日から数え直す）
  eq(T.accessExpired({ access: 'approved', lastSeen: D31, lastLogin: D31, approvedAt: NOW - DAY }, NOW), false, 'approvedAt が新しい');
  eq(T.accessExpired({ access: 'approved', lastSeen: D31, approvedAt: D31 }, NOW), true, 'すべて古ければ失効');
});

t('accessExpired: 承認済み以外・記録なしは対象外', () => {
  eq(T.accessExpired({ access: 'pending', lastSeen: D31 }, NOW), false, '承認待ちは対象外');
  eq(T.accessExpired({ access: 'blocked', lastSeen: D31 }, NOW), false, '停止中は対象外');
  eq(T.accessExpired({ access: 'approved' }, NOW), false, '記録なし＝起点が無いので失効させない');
  eq(T.accessExpired(null, NOW), false);
});

t('cachedApprovalValid: オフライン素通しの控えは30日で失効する', () => {
  eq(T.cachedApprovalValid('u1', NOW), false, '控えが無ければ素通しさせない');
  T.cacheApproval('u1');                                   // 現在時刻で控える
  ok(T.cachedApprovalValid('u1', Date.now()), '直後は有効');
  ok(!T.cachedApprovalValid('u1', Date.now() + 31 * DAY), '31日後は無効');
  sandbox.localStorage.setItem('sfq_access_u2', 'approved'); // 旧形式（日時なし）は後方互換で素通し
  ok(T.cachedApprovalValid('u2', NOW), '旧形式は素通し');
  sandbox.localStorage.setItem('sfq_access_u3', '{壊れたJSON');
  eq(T.cachedApprovalValid('u3', NOW), false, '壊れた控えは無効');
});

/* ---- 承認待ちの内訳（申請あり＝管理者の承認待ち / 未申請＝本人の操作待ち） ---- */
t('accessStateOf: 申請あり(applied)と未申請(noreq)を区別する', () => {
  eq(T.accessStateOf({ access: 'pending', req: { name: 'A', ts: NOW } }), 'applied', '申請済み＝あなたの承認待ち');
  eq(T.accessStateOf({ access: 'pending' }), 'noreq', 'req なし＝未申請');
  eq(T.accessStateOf({ access: 'pending', req: { name: 'A' } }), 'noreq', 'ts の無い req は申請とみなさない');
  eq(T.accessStateOf({ access: 'pending', name: '名前だけある' }), 'noreq', '名前があっても申請ではない');
  eq(T.accessStateOf({}), 'noreq', 'access 未設定は未申請扱い');
});

t('accessStateOf: 承認済み・停止中はそのまま返す', () => {
  eq(T.accessStateOf({ access: 'approved' }), 'approved');
  eq(T.accessStateOf({ access: 'blocked', req: { name: 'A', ts: NOW } }), 'blocked', '停止中は申請より優先');
});

t('isApplicant: 通知バッジの母数は「未承認かつ申請あり」', () => {
  ok(T.isApplicant({ access: 'pending', req: { name: 'A', ts: NOW } }), '申請ありは対象');
  ok(!T.isApplicant({ access: 'pending' }), '未申請は対象外');
  ok(!T.isApplicant({ access: 'approved', req: { name: 'A', ts: NOW } }), '承認済みは対象外');
});

/* ---- 接続元・端末情報（IP はマスクし、判定は参考表示） ---- */
t('parseTrace: Cloudflare trace をキーと値に分解する', () => {
  const x = T.parseTrace('ip=203.0.113.42\nloc=JP\nwarp=off\n');
  eq(x.ip, '203.0.113.42'); eq(x.loc, 'JP'); eq(x.warp, 'off');
});

t('maskIp: IPv4/IPv6 のホスト部を保存しない', () => {
  eq(T.maskIp('203.0.113.42'), '203.0.113.xxx');
  eq(T.maskIp('2001:db8:abcd:1234:5678:90ab:cdef:1234'), '2001:db8:abcd:1234::');
  eq(T.maskIp('invalid'), '');
});

t('ipInCidr: IPv4 CIDR と完全一致を判定する', () => {
  ok(T.ipInCidr('203.0.113.42', '203.0.113.0/24'));
  ok(!T.ipInCidr('203.0.114.42', '203.0.113.0/24'));
  ok(T.ipInCidr('203.0.113.42', '203.0.113.42'));
  ok(!T.ipInCidr('203.0.113.42', 'broken/24'));
});

t('classifyNetwork: 登録企業IPを最優先で高信頼表示する', () => {
  const n = T.classifyNetwork('203.0.113.42', 'Example ISP', { warp: 'off', gateway: 'off' }, [
    { name: 'テスト社', cidrs: ['203.0.113.0/24'] }
  ]);
  eq(n.kind, 'corp'); eq(n.confidence, 'high'); ok(n.label.indexOf('テスト社') >= 0);
});

t('classifyNetwork: Gateway/WARP・セキュアゲートウェイ・クラウドを参考判定する', () => {
  eq(T.classifyNetwork('1.1.1.1', '', { gateway: 'on' }, []).kind, 'secure');
  eq(T.classifyNetwork('1.1.1.1', 'Zscaler Inc.', {}, []).kind, 'secure');
  eq(T.classifyNetwork('1.1.1.1', 'Amazon Technologies Inc.', {}, []).kind, 'hosting');
  eq(T.classifyNetwork('1.1.1.1', 'NTT Communications', {}, []).kind, 'normal');
});

t('pruneNetworkData: 30日を超えた端末・接続履歴を除く', () => {
  sandbox.window.SFQ_NETWORK_MONITORING = { retainDays: 30 };
  const p = T.pruneNetworkData({
    netDevices: { recent: { lastSeen: NOW - DAY }, old: { lastSeen: NOW - 31 * DAY } },
    netAccess: [{ ts: NOW - DAY }, { ts: NOW - 31 * DAY }]
  }, NOW);
  eq(Object.keys(p.devices).length, 1); ok(p.devices.recent); eq(p.access.length, 1); ok(p.changed);
});

t('networkAlertsOf: 複数端末の同時接続と短時間の回線変更を検出する', () => {
  const u = {
    netDevices: { a: { lastSeen: NOW }, b: { lastSeen: NOW - 1000 } },
    netAccess: [
      { ts: NOW, deviceId: 'a', ip: '203.0.113.xxx' },
      { ts: NOW - 60000, deviceId: 'b', ip: '198.51.100.xxx' }
    ]
  };
  const a = T.networkAlertsOf(u);
  eq(a.length, 2); ok(a[0].indexOf('複数端末') >= 0); ok(a[1].indexOf('別端末・別回線') >= 0);
});

t('networkDetailHTML: 外部API由来の回線名をHTMLエスケープする', () => {
  const now = Date.now();
  const html = T.networkDetailHTML({
    netDevices: { a: { lastSeen: now, firstSeen: now, org: '<img src=x onerror=alert(1)>', ip: '203.0.113.xxx', os: 'Windows', browser: 'Chrome', label: '通常回線' } },
    netAccess: []
  });
  ok(html.indexOf('&lt;img') >= 0, 'タグ文字列はエスケープされる');
  ok(html.indexOf('<img src=x') < 0, '生のタグを出さない');
});

/* ---- 管理者へのメール通知（EmailJS・任意機能） ---- */
t('mailEnabled: 設定が空なら無効（既存動作に影響しない）', () => {
  sandbox.window.SFQ_EMAILJS = { serviceId: '', templateId: '', publicKey: '' };
  eq(T.mailEnabled(), false, '空は無効');
  sandbox.window.SFQ_EMAILJS = { serviceId: 's', templateId: 't', publicKey: '' };
  eq(T.mailEnabled(), false, '1つでも欠けたら無効');
  sandbox.window.SFQ_EMAILJS = { serviceId: 's', templateId: 't', publicKey: 'k' };
  eq(T.mailEnabled(), true, '3つ揃えば有効');
});

t('mailParams: 種類ごとの件名と本文パラメータ', () => {
  const p = T.mailParams('apply', { name: '山田太郎', id: 'taro', at: '2026-07-30 10:00' });
  eq(p.subject, '📩 利用申請がありました');
  eq(p.user_name, '山田太郎'); eq(p.user_id, 'taro'); eq(p.at, '2026-07-30 10:00');
  eq(T.mailParams('unblock', {}).subject, '📩 停止解除の申請がありました');
  eq(T.mailParams('dm', {}).subject, '💬 利用者からメッセージが届きました');
  eq(T.mailParams('apply', {}).user_name, '(名前未入力)', '名前が無いときの既定');
  eq(T.mailParams('unknown', {}).subject, 'お知らせ', '未知の種類でも落ちない');
});

t('mailThrottled: test以外は5分に1通・testは毎回通す', () => {
  storage.delete('sfq_mailed_dm');
  storage.delete('sfq_mailed_apply');
  var now = Date.now();
  eq(T.mailThrottled('apply', now), false, '申請の1通目は通る');
  eq(T.mailThrottled('apply', now + 1000), true, '直後の連投は抑止（DoS対策）');
  eq(T.mailThrottled('apply', now + 6 * 60000), false, '5分経過後は再び通る');
  eq(T.mailThrottled('dm', now), false, 'DMの1通目は通る');
  eq(T.mailThrottled('dm', now + 1000), true, '直後の2通目は抑止');
  eq(T.mailThrottled('test', now), false, '管理者のテスト送信は throttle しない');
  eq(T.mailThrottled('test', now + 1000), false, 'テスト送信は連続でも通す');
});

t('idOf: 内部メールから表示用ログインIDを取り出す', () => {
  eq(T.idOf('taro@sfquiz.local'), 'taro');
  eq(T.idOf(''), ''); eq(T.idOf(null), '');
});

t('sha256Hex: Node の crypto と一致する（管理者IDのハッシュ照合用）', () => {
  const crypto = require('crypto');
  ['', 'abc', 'admin', 'sf-quiz.admin_2026', '日本語ID'].forEach((v) => {
    eq(T.sha256Hex(v), crypto.createHash('sha256').update(v, 'utf8').digest('hex'), 'sha256(' + JSON.stringify(v) + ')');
  });
});

t('matchAdmin: ハッシュ一致で管理者判定・平文IDは配信ファイルに置かない', () => {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update('admin').digest('hex');
  eq(T.matchAdmin([h], [], 'admin'), true, 'ハッシュが一致すれば管理者');
  eq(T.matchAdmin([h], [], 'Admin'), true, '大文字小文字は sanitizeId で吸収');
  eq(T.matchAdmin([h], [], 'admin2'), false, '別IDは管理者にならない');
  eq(T.matchAdmin([h], [], ''), false, '空IDは管理者にならない');
  eq(T.matchAdmin([], ['admin'], 'admin'), true, 'ハッシュ未設定なら旧来の平文IDで判定（後方互換）');
  eq(T.matchAdmin([], ['admin'], 'other'), false, '平文判定でも別IDは対象外');
  eq(T.matchAdmin([], [], 'admin'), false, '設定が空なら誰も管理者にならない');
});

console.log('\n' + (fail ? ('❌ ' + fail + ' 件失敗 / ') : '✅ ') + '全 ' + (pass + fail) + '件' + (fail ? '' : '成功'));
process.exit(fail ? 1 : 0);
