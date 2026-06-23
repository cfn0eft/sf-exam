/* =====================================================================
 * progression.js — 資格のロック解除（直列進行）
 * ---------------------------------------------------------------------
 * LP・全資格ページで共有する「唯一の出典」。エンジン・CSS・同期は触らない。
 *
 * ルール:
 *   アドミン → アプリビルダー → デベロッパー → （残り5資格から1つだけ選んで解除）
 *   ある資格を「取得済み」にすると次の資格が解除される。
 *   取得済みにした資格は問題が見られない・解けない（学習ロック）。
 *   = 中身を見ずに取得済みだけ押して先取りするのを防ぐ（常に開くのは1資格）。
 *
 * 判定の出典:
 *   - クラウド連動: cloud-sync が window.SFQ_PROGRESS / window.SFQ_IS_ADMIN を設定し
 *     'sfq-progress' イベントを発火する（端末横断）。
 *   - 未ログイン/localhost/file:// 等は localStorage を走査するフォールバック。
 * ===================================================================== */
(function () {
  'use strict';

  // 直列の前提チェーン
  var ORDER = ['sf-admin', 'app-builder', 'developer'];
  // デベロッパー取得後、ここから「1つずつ」順番に選んで解除できるプール
  // （選んだ1つを取得すると、残りからまた1つ選べる＝くり返し解除）
  var POOL = ['agentforce', 'sales-cloud', 'service-cloud', 'experience-cloud', 'sharing-visibility'];

  // 一般公開済みの資格（ここに無い資格は「いずれ公開します」表示・管理者のみ裏で利用可）
  // 公開準備ができた資格を1つずつここへ足していく。
  var RELEASED = ['sf-admin', 'app-builder', 'developer'];
  function isReleased(slug) { return RELEASED.indexOf(slug) >= 0; }

  // slug → localStorage キー（クラウド未接続時のフォールバック判定に使う）
  var KEY = {
    'sf-admin': 'sfq_v4',
    'app-builder': 'sfqab_v1',
    'developer': 'sfqdev_v1',
    'agentforce': 'sfqaf_v1',
    'sales-cloud': 'sfqsales_v1',
    'service-cloud': 'sfqservice_v1',
    'experience-cloud': 'sfqexp_v1',
    'sharing-visibility': 'sfqsva_v1'
  };

  // メッセージ用の短い資格名
  var NAME = {
    'sf-admin': 'アドミニストレーター',
    'app-builder': 'アプリケーションビルダー',
    'developer': 'デベロッパー',
    'agentforce': 'Agentforce Specialist',
    'sales-cloud': 'Sales Cloud コンサルタント',
    'service-cloud': 'Service Cloud コンサルタント',
    'experience-cloud': 'Experience Cloud コンサルタント',
    'sharing-visibility': 'Sharing and Visibility アーキテクト'
  };

  function isPool(slug) { return POOL.indexOf(slug) >= 0; }

  // クラウド未接続時は localStorage の各資格ストアを走査して進行状況を作る
  function localProgress() {
    var acq = {};
    Object.keys(KEY).forEach(function (slug) {
      try {
        var raw = localStorage.getItem(KEY[slug]);
        if (raw) { var s = JSON.parse(raw); if (s && s.acquiredDate) acq[slug] = s.acquiredDate; }
      } catch (e) {}
    });
    var el = '';
    try { el = localStorage.getItem('sfq_elective') || ''; } catch (e) {}
    return { acquired: acq, elective: el };
  }

  function progress() {
    return (window.SFQ_PROGRESS && window.SFQ_PROGRESS.acquired) ? window.SFQ_PROGRESS : localProgress();
  }
  function isAdmin() { return !!window.SFQ_IS_ADMIN; }
  function acquiredOf(slug, p) { p = p || progress(); return !!(p.acquired && p.acquired[slug]); }
  function electiveOf(p) { p = p || progress(); return p.elective || ''; }

  // この資格が解除済み（＝アクセス可能なように前提を満たしている）か
  function unlocked(slug, p) {
    p = p || progress();
    if (slug === 'sf-admin') return true;
    if (slug === 'app-builder') return acquiredOf('sf-admin', p);
    if (slug === 'developer') return acquiredOf('app-builder', p);
    if (isPool(slug)) return acquiredOf('developer', p) && electiveOf(p) === slug;
    return false;
  }

  // 選択したが「まだ取得していない」プール資格があるか（＝学習中の枠が埋まっている）
  function pendingElective(p) {
    p = p || progress();
    var el = electiveOf(p);
    return isPool(el) && !acquiredOf(el, p);
  }

  // 状態: 'open'（学習可）| 'acquired'（取得済み＝学習ロック）| 'locked'（未解除）| 'coming'（いずれ公開）
  // 管理者は進行・公開状態を無視して常に 'open'。
  function stateOf(slug, p) {
    p = p || progress();
    if (isAdmin()) return 'open';
    if (!isReleased(slug)) return 'coming';
    if (acquiredOf(slug, p)) return 'acquired';
    return unlocked(slug, p) ? 'open' : 'locked';
  }

  // この資格を今「選択して解除」できるか
  // デベロッパー取得済み＆公開済み＆未取得＆現在は学習中の枠が空いている（前の選択を取得済み）プール資格
  function canChoose(slug, p) {
    p = p || progress();
    if (isAdmin()) return false;
    if (!isPool(slug) || !isReleased(slug)) return false;
    if (!acquiredOf('developer', p)) return false;
    if (acquiredOf(slug, p)) return false;
    if (electiveOf(p) === slug) return false; // それは今の学習中の枠（open）
    return !pendingElective(p);
  }

  // locked カードに出す理由テキスト
  function lockReason(slug, p) {
    p = p || progress();
    if (slug === 'app-builder') return '「' + NAME['sf-admin'] + '」を取得すると解除されます';
    if (slug === 'developer') return '「' + NAME['app-builder'] + '」を取得すると解除されます';
    if (isPool(slug)) {
      if (!acquiredOf('developer', p)) return '「' + NAME['developer'] + '」を取得すると、ここから順番に1つずつ解除できます';
      if (pendingElective(p)) return '今は「' + (NAME[electiveOf(p)] || '別の資格') + '」を学習中です（取得すると次を選べます）';
      return ''; // 選択可
    }
    return 'まだ解除されていません';
  }

  window.SFQ_PROG = {
    ORDER: ORDER, POOL: POOL, KEY: KEY, NAME: NAME, RELEASED: RELEASED,
    progress: progress, isAdmin: isAdmin, isReleased: isReleased,
    acquiredOf: acquiredOf, electiveOf: electiveOf, pendingElective: pendingElective,
    unlocked: unlocked, stateOf: stateOf, canChoose: canChoose,
    lockReason: lockReason, renderGate: renderGate
  };

  /* ===== 各クイズページの全面ゲート（未解除 / 取得済みロック） ===== */
  function injectStyle() {
    if (document.getElementById('sfq-prog-style')) return;
    var css =
      '#sfq-prog-lock{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;padding:24px;' +
      'background:rgba(15,23,42,.92);backdrop-filter:blur(4px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '#sfq-prog-lock.show{display:flex}' +
      '#sfq-prog-lock .pgl-card{max-width:420px;width:100%;background:#fff;border-radius:18px;padding:30px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
      '#sfq-prog-lock .pgl-ic{font-size:52px;line-height:1;margin-bottom:12px}' +
      '#sfq-prog-lock .pgl-title{font-size:19px;font-weight:800;color:#0f172a;margin:0 0 8px}' +
      '#sfq-prog-lock .pgl-sub{font-size:14px;line-height:1.7;color:#475569;margin:0 0 20px}' +
      '#sfq-prog-lock .pgl-btn{display:block;width:100%;margin-top:10px;padding:13px;border:none;border-radius:11px;font-size:15px;font-weight:700;cursor:pointer}' +
      '#sfq-prog-lock .pgl-primary{background:#0176d3;color:#fff}' +
      '#sfq-prog-lock .pgl-ghost{background:#eef2f7;color:#334155}' +
      '@media(prefers-color-scheme:dark){#sfq-prog-lock .pgl-card{background:#1e293b}#sfq-prog-lock .pgl-title{color:#f1f5f9}#sfq-prog-lock .pgl-sub{color:#cbd5e1}#sfq-prog-lock .pgl-ghost{background:#334155;color:#e2e8f0}}';
    var st = document.createElement('style');
    st.id = 'sfq-prog-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function homeUrl() { return window.SFQ_HOME_URL || '../../index.html'; }

  function buildEl() {
    injectStyle();
    var el = document.getElementById('sfq-prog-lock');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sfq-prog-lock';
    el.innerHTML = '<div class="pgl-card">' +
      '<div class="pgl-ic" id="pgl-ic">🔒</div>' +
      '<p class="pgl-title" id="pgl-title"></p>' +
      '<p class="pgl-sub" id="pgl-sub"></p>' +
      '<div id="pgl-actions"></div></div>';
    document.body.appendChild(el);
    return el;
  }

  // クイズページでのみ意味を持つ（CERT_CONFIG がある）。状態に応じて全面ゲートを出す。
  function renderGate() {
    var cfg = window.CERT_CONFIG;
    if (!cfg || !cfg.slug) return; // LP 等では何もしない
    var slug = cfg.slug;
    var st = stateOf(slug);
    var el = document.getElementById('sfq-prog-lock');
    if (st === 'open') { if (el) el.classList.remove('show'); return; }
    el = buildEl();
    var ic = document.getElementById('pgl-ic');
    var title = document.getElementById('pgl-title');
    var sub = document.getElementById('pgl-sub');
    var actions = document.getElementById('pgl-actions');
    if (st === 'coming') {
      ic.textContent = '🔜';
      title.textContent = 'この資格はいずれ公開します';
      sub.textContent = '現在準備中です。公開までもうしばらくお待ちください。';
      actions.innerHTML = '<button class="pgl-btn pgl-primary" id="pgl-home">🗂️ 他の資格を選ぶ</button>';
    } else if (st === 'acquired') {
      var d = (progress().acquired || {})[slug] || '';
      ic.textContent = '🎓';
      title.textContent = '取得済みのため学習はロック中です';
      sub.innerHTML = (d ? '取得日: ' + d + '<br>' : '') + 'この資格は取得済みです。次の資格に進みましょう。<br>もう一度学習するには取得を取り消してください。';
      actions.innerHTML =
        '<button class="pgl-btn pgl-ghost" id="pgl-undo">取り消して学習を再開</button>' +
        '<button class="pgl-btn pgl-primary" id="pgl-home">🗂️ 他の資格を選ぶ</button>';
      var undo = document.getElementById('pgl-undo');
      undo.onclick = function () {
        if (typeof window.unacquireCert === 'function') window.unacquireCert();
        else { try { var raw = localStorage.getItem(KEY[slug]); if (raw) { var s = JSON.parse(raw); s.acquiredDate = ''; localStorage.setItem(KEY[slug], JSON.stringify(s)); } } catch (e) {} renderGate(); }
      };
    } else { // locked
      ic.textContent = '🔒';
      title.textContent = 'この資格はまだ解除されていません';
      sub.textContent = lockReason(slug) || 'まだ解除されていません';
      actions.innerHTML = '<button class="pgl-btn pgl-primary" id="pgl-home">🗂️ 他の資格を選ぶ</button>';
    }
    document.getElementById('pgl-home').onclick = function () { location.href = homeUrl(); };
    el.classList.add('show');
  }

  // 進行状況が更新されたら（ログイン完了・取得/取消・選択）ゲートを再評価
  window.addEventListener('sfq-progress', renderGate);
  // 初回（localhost フォールバック等）。クラウド連動時は直後の 'sfq-progress' で上書きされる。
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderGate);
  else renderGate();
})();
