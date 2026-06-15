/* =============================================================
   cloud-sync.js  —  SFクイズ アカウント別クラウド同期 ＋ 管理者ビュー
   Firebase Authentication（ID＋パスワード）＋ Firestore
   このファイルは編集不要です。設定は firebase-config.js で行います。

   仕組み:
   - ログインすると、進捗は Firestore（クラウド）に保存されます。
   - 同じID/パスワードでログインすれば、別の端末・別ブラウザでも
     同じ進捗が引き継がれます（PC版/モバイル版も共有）。
   - アカウントごとに進捗は完全に分かれます。
   - 管理者ID（firebase-config.js の SFQ_ADMIN_IDS）でログインすると、
     全アカウントの詳細を閲覧・リセット・削除できます。
   ============================================================= */
(function () {
  'use strict';

  var CFG = window.SFQ_FIREBASE_CONFIG || null;
  var LOGIN_DOMAIN = window.SFQ_LOGIN_DOMAIN || 'sfquiz.local';
  var COLLECTION = window.SFQ_COLLECTION || 'progress';
  // 資格ごとの名前空間キー。各クイズページの CERT_CONFIG.slug を使う（gateway/LP では 'default'）。
  // これにより 1 ユーザーの doc 内を資格別に分け、資格どうしの上書き・全消えを防ぐ。
  var CERT_KEY = (window.CERT_CONFIG && window.CERT_CONFIG.slug) || window.SFQ_CERT_KEY || 'default';
  // ローカル→クラウド初回移行フラグも資格別に持つ（共有フラグだと2つ目以降の資格が移行されない）。
  var MIGRATE_FLAG = 'sfq_migrated_' + CERT_KEY;

  // ページの役割:
  //  'gateway' … ホーム(LP)。進捗ストアを持たず、ログイン必須＋アカウント管理のみ。
  //  'client'  … 各資格(クイズ)ページ。進捗を同期。未ログイン時は強制せずLPへ誘導する。
  // 明示指定が無ければ、ストアアダプタの有無で自動判定する。
  var ROLE = 'gateway';
  var HOME_URL = 'index.html';

  function sanitizeId(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9._\-]/g, ''); }
  var ADMIN_IDS = (window.SFQ_ADMIN_IDS || []).map(sanitizeId);

  var auth = null, db = null, currentUser = null, saveTimer = null;
  var currentName = '', currentEmail = '', isAdmin = false;
  var elOverlay, elBadge, elMsg, elId, elPw, elLogin, elSignup, elStatus, elAdminBtn, elAdmin, elLock;

  /* ---------------- スタイル ---------------- */
  function injectStyle() {
    var css = '' +
      '#sfqc-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.72);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '#sfqc-overlay.show{display:flex}' +
      '.sfqc-card{width:min(92vw,360px);background:#fff;color:#1e293b;border-radius:16px;padding:26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center}' +
      '.sfqc-title{font-size:19px;font-weight:700;margin:0 0 4px}' +
      '.sfqc-sub{font-size:12.5px;color:#64748b;margin:0 0 18px;line-height:1.6}' +
      '.sfqc-field{display:block;width:100%;box-sizing:border-box;padding:12px 14px;margin:8px 0;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;outline:none}' +
      '.sfqc-field:focus{border-color:#6366f1}' +
      '.sfqc-row{display:flex;gap:10px;margin-top:14px}' +
      '.sfqc-btn{flex:1;padding:12px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:filter .15s,transform .08s}' +
      '.sfqc-btn:active{transform:scale(.97)}' +
      '.sfqc-btn-primary{background:#6366f1;color:#fff}' +
      '.sfqc-btn-primary:hover{filter:brightness(1.08)}' +
      '.sfqc-btn-ghost{background:#f1f5f9;color:#475569}' +
      '.sfqc-btn-ghost:hover{filter:brightness(.97)}' +
      '.sfqc-btn[disabled]{opacity:.5;cursor:not-allowed}' +
      '.sfqc-msg{min-height:18px;margin-top:14px;font-size:12.5px;line-height:1.6}' +
      '.sfqc-msg.err{color:#dc2626}' +
      '.sfqc-msg.ok{color:#16a34a}' +
      '.sfqc-hint{margin-top:16px;font-size:11px;color:#94a3b8;line-height:1.6}' +
      '#sfqc-badge{position:fixed;top:9px;right:56px;z-index:9000;display:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif}' +
      '#sfqc-badge.show{display:block}' +
      '#sfqc-badge-toggle{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.92);border:1px solid rgba(99,102,241,.35);color:#4338ca;padding:6px 11px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.18);max-width:150px;white-space:nowrap;overflow:hidden}' +
      '.sfqc-caret{font-size:9px;opacity:.7;flex-shrink:0}' +
      '#sfqc-menu{display:none;position:absolute;right:0;top:calc(100% + 6px);background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.22);padding:8px;min-width:172px}' +
      '#sfqc-badge.open #sfqc-menu{display:block}' +
      '#sfqc-menu .sfqc-status{font-size:11px;color:#16a34a;font-weight:600;padding:4px 8px 8px;border-bottom:1px solid #eef2f7;margin-bottom:6px}' +
      '#sfqc-menu button{display:block;width:100%;text-align:left;border:none;background:none;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:600;color:#334155;cursor:pointer}' +
      '#sfqc-menu button:hover{background:#f1f5f9}' +
      '#sfqc-admin-btn{display:none;color:#92400e}' +
      '#sfqc-admin-btn.show{display:block}' +
      '#sfqc-logout{color:#b91c1c}' +
      '[data-theme=dark] #sfqc-badge-toggle,body.dark #sfqc-badge-toggle{background:rgba(30,41,59,.95);color:#a5b4fc;border-color:#475569}' +
      '[data-theme=dark] #sfqc-menu,body.dark #sfqc-menu{background:#1e293b;border-color:#334155}' +
      '[data-theme=dark] #sfqc-menu button,body.dark #sfqc-menu button{color:#cbd5e1}' +
      '[data-theme=dark] #sfqc-menu button:hover,body.dark #sfqc-menu button:hover{background:#334155}' +
      '[data-theme=dark] #sfqc-menu .sfqc-status,body.dark #sfqc-menu .sfqc-status{border-color:#334155}' +
      /* 管理者パネル */
      '#sfqc-admin{position:fixed;inset:0;z-index:100000;display:none;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif}' +
      '#sfqc-admin.show{display:block}' +
      '.sfqc-adminwrap{position:absolute;inset:14px;background:#f8fafc;color:#1e293b;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden}' +
      '.sfqc-adminhead{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#fff;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}' +
      '.sfqc-adminhead h2{font-size:16px;margin:0;flex:1;min-width:140px}' +
      '.sfqc-adminhead .sfqc-tag{font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-weight:700}' +
      '.sfqc-mini{border:none;border-radius:8px;padding:7px 12px;font-size:12.5px;font-weight:700;cursor:pointer}' +
      '.sfqc-mini.csv{background:#10b981;color:#fff}' +
      '.sfqc-mini.reload{background:#6366f1;color:#fff}' +
      '.sfqc-mini.close{background:#e2e8f0;color:#475569}' +
      '.sfqc-adminbody{flex:1;overflow:auto;padding:14px 18px}' +
      '.sfqc-acc{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px;overflow:hidden}' +
      '.sfqc-acc-head{display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap}' +
      '.sfqc-acc-name{font-weight:700;font-size:15px;min-width:90px}' +
      '.sfqc-acc-stats{flex:1;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#475569}' +
      '.sfqc-acc-stats b{color:#1e293b}' +
      '.sfqc-acc-actions{display:flex;gap:6px}' +
      '.sfqc-acc-actions button{border:none;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer}' +
      '.sfqc-act-detail{background:#eef2ff;color:#4338ca}' +
      '.sfqc-act-reset{background:#fef9c3;color:#854d0e}' +
      '.sfqc-act-del{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-detail{display:none;padding:0 14px 14px;border-top:1px dashed #e2e8f0}' +
      '.sfqc-detail.show{display:block}' +
      '.sfqc-detail table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}' +
      '.sfqc-detail th,.sfqc-detail td{border-bottom:1px solid #eef2f7;padding:5px 6px;text-align:left}' +
      '.sfqc-detail th{color:#64748b;font-weight:600;position:sticky;top:0;background:#fff}' +
      '.sfqc-detail .num{text-align:right;font-variant-numeric:tabular-nums}' +
      '.sfqc-detail .qx{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}' +
      /* 検索＋並び替えツールバー */
      '.sfqc-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;position:sticky;top:0;z-index:5}' +
      '.sfqc-search{flex:1;min-width:200px;padding:8px 12px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;outline:none;background:#fff;color:#0f172a}' +
      '.sfqc-search:focus{border-color:#2563eb}' +
      '.sfqc-sort-label{font-size:11px;color:#64748b;font-weight:700}' +
      '.sfqc-sort{border:1px solid #cbd5e1;background:#fff;color:#475569;padding:6px 10px;font-size:11.5px;font-weight:700;border-radius:8px;cursor:pointer}' +
      '.sfqc-sort.on{background:#2563eb;color:#fff;border-color:#2563eb}' +
      '.sfqc-count{font-size:11px;color:#64748b;margin-left:auto;font-weight:700}' +
      /* 拡充ダッシュボード */
      '.sfqc-sec{font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin:16px 0 8px}' +
      '.sfqc-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:4px}' +
      '@media(max-width:760px){.sfqc-kpis{grid-template-columns:repeat(3,1fr)}}' +
      '.sfqc-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px}' +
      '.sfqc-kpi .n{font-size:21px;font-weight:800;color:#0f172a;line-height:1.1}' +
      '.sfqc-kpi .l{font-size:10px;color:#64748b;margin-top:3px}' +
      '.sfqc-dash-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}' +
      '.sfqc-dom{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12.5px}' +
      '.sfqc-dom .nm{width:140px;flex-shrink:0;font-weight:600;color:#334155}' +
      '.sfqc-dom .bw{flex:1;height:9px;background:#eef2f7;border-radius:6px;overflow:hidden}' +
      '.sfqc-dom .bf{height:100%;border-radius:6px}' +
      '.sfqc-dom .pc{width:100px;text-align:right;font-weight:800;font-size:12px}' +
      '.sfqc-dom .pc small{font-weight:600;color:#94a3b8}' +
      '.sfqc-itemwrap{margin-bottom:6px}' +
      '.sfqc-itemwrap>summary{cursor:pointer;font-size:13px;font-weight:700;color:#2563eb;padding:8px 4px;list-style:none}' +
      '.sfqc-itemwrap>summary::-webkit-details-marker{display:none}' +
      '.sfqc-itemwrap>summary::before{content:"\\25B8 "}' +
      '.sfqc-itemwrap[open]>summary::before{content:"\\25BE "}' +
      '.sfqc-itbl{width:100%;border-collapse:collapse;font-size:12.5px}' +
      '.sfqc-itbl th,.sfqc-itbl td{border-bottom:1px solid #eef2f7;padding:7px 8px;text-align:left}' +
      '.sfqc-itbl th{color:#64748b;font-weight:700;font-size:11px}' +
      '.sfqc-itbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.sfqc-itbl .qx{max-width:430px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334155}' +
      '.sfqc-rate{font-weight:800}.sfqc-rate.lo{color:#dc2626}.sfqc-rate.mi{color:#d97706}.sfqc-rate.hi{color:#16a34a}' +
      '.sfqc-flag{font-size:10px;background:#fee2e2;color:#b91c1c;border-radius:5px;padding:1px 6px;font-weight:700;margin-left:6px}' +
      '.sfqc-itnote{font-size:11px;color:#64748b;margin-top:8px}' +
      '.sfqc-fchip{border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer}' +
      '.sfqc-fchip.on{background:#2563eb;color:#fff;border-color:#2563eb}' +
      '.sfqc-toolbar2{margin-top:-6px}' +
      '.sfqc-inactive{font-size:10px;background:#fef9c3;color:#854d0e;border-radius:5px;padding:1px 6px;font-weight:700}' +
      /* ユーザー集計行：メール表示 */
      '.sfqc-acc-email{font-weight:500;color:#64748b;font-size:12px;margin-left:8px}' +
      /* 詳細インナー */
      '.sfqc-detail-inner{padding:10px 0 4px}' +
      '.sfqc-meta{font-size:11.5px;color:#64748b;margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap}' +
      '.sfqc-meta code{background:#f1f5f9;border-radius:4px;padding:1px 6px;font-size:11px;color:#334155}' +
      /* 資格ブロック */
      '.sfqc-cert{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 10px;overflow:hidden}' +
      '.sfqc-cert-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#eef2ff;border-bottom:1px solid #e0e7ff;gap:8px;flex-wrap:wrap}' +
      '.sfqc-cert-name{font-weight:700;font-size:13px;color:#3730a3}' +
      '.sfqc-cert-actions{display:flex;gap:6px}' +
      '.sfqc-cert-actions button{border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer}' +
      /* KVグリッド */
      '.sfqc-kv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:1px;background:#e2e8f0;padding:1px}' +
      '.sfqc-kv{background:#fff;padding:6px 10px}' +
      '.sfqc-k{font-size:10.5px;color:#64748b;font-weight:600;line-height:1.4}' +
      '.sfqc-v{font-size:13px;color:#0f172a;font-weight:700;line-height:1.4}' +
      /* 問題別履歴の折りたたみ */
      '.sfqc-qhist{margin-top:6px}' +
      '.sfqc-qhist > summary{cursor:pointer;font-size:12px;color:#2563eb;font-weight:700;padding:6px 4px}' +
      '.sfqc-qhist[open] > summary{margin-bottom:4px}' +
      'body.dark .sfqc-toolbar{background:#0f172a;border-color:#334155}' +
      'body.dark .sfqc-search{background:#1e293b;color:#e2e8f0;border-color:#334155}' +
      'body.dark .sfqc-sort{background:#1e293b;color:#cbd5e1;border-color:#334155}' +
      'body.dark .sfqc-cert{background:#0f172a;border-color:#334155}' +
      'body.dark .sfqc-cert-head{background:#1e1b4b;border-color:#312e81}' +
      'body.dark .sfqc-cert-name{color:#a5b4fc}' +
      'body.dark .sfqc-kv-grid{background:#334155}' +
      'body.dark .sfqc-kv{background:#1e293b}' +
      'body.dark .sfqc-k{color:#94a3b8}' +
      'body.dark .sfqc-v{color:#f1f5f9}' +
      'body.dark .sfqc-meta code{background:#1e293b;color:#cbd5e1}' +
      '.sfqc-empty{color:#94a3b8;font-size:13px;text-align:center;padding:30px}' +
      /* フィードバック / 不具合報告 */
      '.sfqc-fb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:2px 0 10px}' +
      '.sfqc-fb-count{font-size:12px;color:#64748b;font-weight:700}' +
      '.sfqc-fb-dl{display:flex;gap:6px}' +
      '.sfqc-mini.fb-dl{background:#0ea5e9;color:#fff}' +
      '.sfqc-fb-list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;padding:2px}' +
      '.sfqc-fb-item{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}' +
      '.sfqc-fb-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px}' +
      '.sfqc-fb-cat{font-size:11px;font-weight:800;background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 9px;white-space:nowrap}' +
      '.sfqc-fb-meta{font-size:11px;color:#64748b;flex:1;min-width:120px}' +
      '.sfqc-fb-done{border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;background:#dcfce7;color:#15803d}' +
      '.sfqc-fb-msg{font-size:13px;color:#1e293b;white-space:pre-wrap;line-height:1.55;word-break:break-word}' +
      '.sfqc-fb-qx{font-size:11px;color:#64748b;margin-top:6px;background:#f8fafc;border-radius:6px;padding:5px 8px;word-break:break-word}' +
      '.sfqc-fb-ref{font-size:11px;margin-top:5px}.sfqc-fb-ref a{color:#2563eb}' +
      '.sfqc-divider{height:1px;background:#e2e8f0;margin:14px 0}' +
      'body.dark .sfqc-fb-item{background:#1e293b;border-color:#334155}' +
      'body.dark .sfqc-fb-cat{background:#312e81;color:#c7d2fe}' +
      'body.dark .sfqc-fb-msg{color:#e2e8f0}' +
      'body.dark .sfqc-fb-qx{background:#0f172a;color:#94a3b8}' +
      'body.dark .sfqc-fb-done{background:#14532d;color:#bbf7d0}' +
      'body.dark .sfqc-divider{background:#334155}' +
      'body.dark .sfqc-card{background:#1e293b;color:#e2e8f0}' +
      'body.dark .sfqc-field{background:#0f172a;border-color:#334155;color:#e2e8f0}' +
      'body.dark .sfqc-btn-ghost{background:#334155;color:#cbd5e1}' +
      'body.dark .sfqc-sub{color:#94a3b8}' +
      /* アクセス承認ゲート（未承認ロック画面） */
      '#sfqc-lock{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.85);backdrop-filter:blur(4px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '#sfqc-lock.show{display:flex}' +
      /* 管理者ビュー：アカウントのアクセス状態チップ＋承認/停止ボタン */
      '.sfqc-acc-access{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:6px;white-space:nowrap}' +
      '.sfqc-acc-access.ok{background:#dcfce7;color:#15803d}' +
      '.sfqc-acc-access.pend{background:#fef9c3;color:#854d0e}' +
      '.sfqc-acc-access.block{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-act-approve{background:#dcfce7;color:#15803d}' +
      '.sfqc-act-block{background:#fee2e2;color:#b91c1c}';
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------------- DOM 構築 ---------------- */
  function loginCardHTML() {
    return '<div class="sfqc-card">' +
        '<p class="sfqc-title">📚 学習アカウント</p>' +
        '<p class="sfqc-sub">ログインすると進捗がクラウドに保存され、<br>どの端末でも同じ続きから学習できます。</p>' +
        '<input id="sfqc-id" class="sfqc-field" type="text" autocomplete="username" placeholder="ID（半角英数字）" />' +
        '<input id="sfqc-pw" class="sfqc-field" type="password" autocomplete="current-password" placeholder="パスワード（6文字以上）" />' +
        '<div class="sfqc-row">' +
          '<button id="sfqc-login" class="sfqc-btn sfqc-btn-primary">ログイン</button>' +
          '<button id="sfqc-signup" class="sfqc-btn sfqc-btn-ghost">新規登録</button>' +
        '</div>' +
        '<div id="sfqc-msg" class="sfqc-msg"></div>' +
        '<p class="sfqc-hint">初めての方は「新規登録」、2回目以降は「ログイン」を押してください。</p>' +
      '</div>';
  }
  // client（クイズ）ページ用: ログインせずに開いた時の誘導カード
  function guideCardHTML() {
    return '<div class="sfqc-card">' +
        '<p class="sfqc-title">🔑 ログインが必要です</p>' +
        '<p class="sfqc-sub">進捗を保存・同期するにはログインが必要です。<br>ホーム画面からログインしてください。</p>' +
        '<div class="sfqc-row">' +
          '<button id="sfqc-gohome" class="sfqc-btn sfqc-btn-primary">ホームへ移動してログイン</button>' +
        '</div>' +
      '</div>';
  }

  function buildUI() {
    injectStyle();

    elOverlay = document.createElement('div');
    elOverlay.id = 'sfqc-overlay';
    elOverlay.innerHTML = (ROLE === 'client') ? guideCardHTML() : loginCardHTML();
    document.body.appendChild(elOverlay);

    elBadge = document.createElement('div');
    elBadge.id = 'sfqc-badge';
    elBadge.innerHTML =
      '<button id="sfqc-badge-toggle" type="button"><span id="sfqc-name">👤</span><span class="sfqc-caret">▾</span></button>' +
      '<div id="sfqc-menu">' +
        '<div class="sfqc-status" id="sfqc-status"></div>' +
        '<button id="sfqc-admin-btn" type="button">👑 管理者ビュー</button>' +
        '<button id="sfqc-logout" type="button">ログアウト</button>' +
      '</div>';
    document.body.appendChild(elBadge);

    elAdmin = document.createElement('div');
    elAdmin.id = 'sfqc-admin';
    elAdmin.innerHTML =
      '<div class="sfqc-adminwrap">' +
        '<div class="sfqc-adminhead">' +
          '<h2>👑 管理者ビュー</h2><span class="sfqc-tag">全アカウント</span>' +
          '<button class="sfqc-mini reload" id="sfqc-adm-reload">↻ 更新</button>' +
          '<button class="sfqc-mini csv" id="sfqc-adm-csv">CSV書き出し</button>' +
          '<button class="sfqc-mini close" id="sfqc-adm-close">閉じる</button>' +
        '</div>' +
        '<div class="sfqc-adminbody" id="sfqc-adm-body"><div class="sfqc-empty">読み込み中…</div></div>' +
      '</div>';
    document.body.appendChild(elAdmin);

    // アクセス承認ゲート（未承認/停止中の利用者を全面ロックする画面）
    elLock = document.createElement('div');
    elLock.id = 'sfqc-lock';
    elLock.innerHTML =
      '<div class="sfqc-card">' +
        '<p class="sfqc-title" id="sfqc-lock-title">⏳ 承認待ちです</p>' +
        '<p class="sfqc-sub" id="sfqc-lock-sub"></p>' +
        '<div id="sfqc-lock-form">' +
          '<input id="sfqc-lock-name" class="sfqc-field" type="text" maxlength="40" placeholder="お名前（管理者が確認します）" />' +
          '<button id="sfqc-lock-apply" class="sfqc-btn sfqc-btn-primary" style="width:100%;margin-top:4px">この内容で利用を申請する</button>' +
          '<div id="sfqc-lock-msg" class="sfqc-msg"></div>' +
        '</div>' +
        '<div class="sfqc-row">' +
          '<button id="sfqc-lock-reload" class="sfqc-btn sfqc-btn-ghost">再確認</button>' +
          '<button id="sfqc-lock-logout" class="sfqc-btn sfqc-btn-ghost">ログアウト</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(elLock);

    elStatus = document.getElementById('sfqc-status');
    elAdminBtn = document.getElementById('sfqc-admin-btn');

    if (ROLE === 'client') {
      // 誘導カード: ホームへ移動するだけ
      var go = document.getElementById('sfqc-gohome');
      if (go) go.addEventListener('click', function () { location.href = HOME_URL; });
    } else {
      // ログインフォーム
      elMsg = document.getElementById('sfqc-msg');
      elId = document.getElementById('sfqc-id');
      elPw = document.getElementById('sfqc-pw');
      elLogin = document.getElementById('sfqc-login');
      elSignup = document.getElementById('sfqc-signup');
      elLogin.addEventListener('click', doLogin);
      elSignup.addEventListener('click', doSignup);
      elPw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
      elId.addEventListener('keydown', function (e) { if (e.key === 'Enter') elPw.focus(); });
    }

    // アカウントバッジのドロップダウン開閉
    var badgeToggle = document.getElementById('sfqc-badge-toggle');
    if (badgeToggle) badgeToggle.addEventListener('click', function (e) { e.stopPropagation(); elBadge.classList.toggle('open'); });
    document.addEventListener('click', function (e) { if (elBadge && !elBadge.contains(e.target)) elBadge.classList.remove('open'); });

    // バッジ・管理者パネルは両モード共通
    document.getElementById('sfqc-logout').addEventListener('click', function () { elBadge.classList.remove('open'); doLogout(); });
    elAdminBtn.addEventListener('click', function () { elBadge.classList.remove('open'); openAdmin(); });
    document.getElementById('sfqc-adm-close').addEventListener('click', closeAdmin);
    document.getElementById('sfqc-adm-reload').addEventListener('click', loadAdmin);
    document.getElementById('sfqc-adm-csv').addEventListener('click', exportCsv);

    // ロック画面のボタン
    document.getElementById('sfqc-lock-logout').addEventListener('click', doLogout);
    document.getElementById('sfqc-lock-reload').addEventListener('click', function () { if (currentUser) onLogin(currentUser); });
    document.getElementById('sfqc-lock-apply').addEventListener('click', doApplyAccess);
    var lockName = document.getElementById('sfqc-lock-name');
    if (lockName) lockName.addEventListener('keydown', function (e) { if (e.key === 'Enter') doApplyAccess(); });
  }

  function showOverlay() { if (elOverlay) elOverlay.classList.add('show'); }
  function hideOverlay() { if (elOverlay) elOverlay.classList.remove('show'); }
  // 未承認/停止中の利用者を全面ロック（state: 'pending'|'blocked'|'error'）
  // info.reqName = 既に申請済みの名前（あれば入力欄に復元）
  function showLock(state, info) {
    if (!elLock) return;
    info = info || {};
    var t = document.getElementById('sfqc-lock-title');
    var s = document.getElementById('sfqc-lock-sub');
    var form = document.getElementById('sfqc-lock-form');
    var nameIn = document.getElementById('sfqc-lock-name');
    var lockMsg = document.getElementById('sfqc-lock-msg');
    var showForm = (state !== 'blocked'); // 停止中（意図的にブロック）は申請フォームを出さない
    if (state === 'blocked') {
      if (t) t.textContent = '🚫 利用が停止されています';
      if (s) s.innerHTML = 'このアカウントは現在ご利用いただけません。<br>心当たりがない場合は管理者にお問い合わせください。';
    } else if (state === 'error') {
      if (t) t.textContent = '⚠️ 確認できませんでした';
      if (s) s.innerHTML = 'アクセス権を確認できませんでした。<br>通信環境を確認して「再確認」を押してください。';
    } else {
      if (t) t.textContent = '⏳ 承認待ちです';
      if (s) s.innerHTML = '下のフォームにお名前を入れて「利用を申請」してください。<br>管理者の承認後にご利用いただけます（承認されたら「再確認」）。';
    }
    if (form) form.style.display = showForm ? '' : 'none';
    if (showForm && nameIn) {
      // 申請済みの名前 > ログインID から復元（ユーザーは上書き可）
      if (!nameIn.value) nameIn.value = info.reqName || currentName || '';
      if (lockMsg) {
        if (info.reqName) { lockMsg.textContent = '申請済みです（内容を更新して再申請もできます）。'; lockMsg.className = 'sfqc-msg ok'; }
        else { lockMsg.textContent = ''; lockMsg.className = 'sfqc-msg'; }
      }
    }
    hideOverlay();
    elLock.classList.add('show');
    setStatus('');
  }
  function hideLock() { if (elLock) elLock.classList.remove('show'); }

  // 承認待ちユーザーが「お名前」を入れて利用を申請する。access は pending のまま、
  // name/req を本人 doc に書く（Firestore ルールで pending 維持の書込は本人に許可）。
  function doApplyAccess() {
    if (!currentUser || !db) return;
    var nameIn = document.getElementById('sfqc-lock-name');
    var lockMsg = document.getElementById('sfqc-lock-msg');
    var nm = (nameIn ? nameIn.value : '').trim();
    if (!nm) { if (lockMsg) { lockMsg.textContent = 'お名前を入力してください。'; lockMsg.className = 'sfqc-msg err'; } return; }
    if (lockMsg) { lockMsg.textContent = '申請中…'; lockMsg.className = 'sfqc-msg'; }
    db.collection(COLLECTION).doc(currentUser.uid).set({
      access: 'pending', name: nm, email: currentEmail,
      req: { name: nm, ts: Date.now() }, updated: Date.now()
    }, { merge: true })
      .then(function () {
        currentName = nm; setBadge(nm);
        if (lockMsg) { lockMsg.textContent = '申請を受け付けました。承認をお待ちください。'; lockMsg.className = 'sfqc-msg ok'; }
      })
      .catch(function (e) {
        if (lockMsg) { lockMsg.textContent = '申請に失敗しました（' + (e && e.code || 'error') + '）。'; lockMsg.className = 'sfqc-msg err'; }
      });
  }
  function setMsg(t, kind) { if (elMsg) { elMsg.textContent = t || ''; elMsg.className = 'sfqc-msg' + (kind ? ' ' + kind : ''); } }
  function setStatus(t) { if (elStatus) elStatus.textContent = t || ''; notifyAccount(); }
  function setBadge(name) {
    if (!elBadge) return;
    // client（資格ページ）は「マイページ」にアカウントUIを集約するため、浮遊バッジは出さない。
    // gateway（LP）はマイページが無いのでバッジを表示する。
    if (name) { document.getElementById('sfqc-name').textContent = '👤 ' + name; if (ROLE !== 'client') elBadge.classList.add('show'); }
    else { elBadge.classList.remove('show'); }
    notifyAccount();
  }
  // マイページ等へアカウント状態の更新を通知（エンジン側が __sfqOnAccount を実装）
  function notifyAccount() { if (window.__sfqOnAccount) { try { window.__sfqOnAccount(); } catch (e) {} } }
  function showAdminBtn(v) { if (elAdminBtn) elAdminBtn.classList[v ? 'add' : 'remove']('show'); }
  function busy(b) { if (elLogin) elLogin.disabled = b; if (elSignup) elSignup.disabled = b; }

  /* ---------------- ヘルパー ---------------- */
  function idToEmail(id) { var c = sanitizeId(id); return c ? c + '@' + LOGIN_DOMAIN : ''; }
  function configOk() {
    return !!(CFG && CFG.apiKey && CFG.apiKey.indexOf('ここに') < 0 &&
              CFG.apiKey !== 'YOUR_API_KEY' && CFG.projectId && CFG.projectId.indexOf('ここに') < 0);
  }
  function emptyStore() { return { bm: [], hist: {}, streak: 0, vm: {}, tbm: {} }; }
  function toastSafe(t) { try { if (typeof window.toast === 'function') window.toast(t); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function friendlyErr(code) {
    var m = {
      'auth/invalid-email': 'IDは半角英数字で入力してください。',
      'auth/user-not-found': 'IDまたはパスワードが違います。',
      'auth/wrong-password': 'IDまたはパスワードが違います。',
      'auth/invalid-credential': 'IDまたはパスワードが違います。',
      'auth/invalid-login-credentials': 'IDまたはパスワードが違います。',
      'auth/email-already-in-use': 'このIDは既に使われています。「ログイン」を押してください。',
      'auth/weak-password': 'パスワードは6文字以上にしてください。',
      'auth/too-many-requests': '試行回数が多すぎます。少し待って再度お試しください。',
      'auth/network-request-failed': 'ネットワークエラーです。接続を確認してください。',
      'auth/operation-not-allowed': 'Firebaseで「メール/パスワード」ログインが有効になっていません（手順書を参照）。'
    };
    return m[code] || ('エラーが発生しました（' + code + '）。');
  }
  function validate() {
    var id = elId.value.trim(), pw = elPw.value;
    if (!idToEmail(id)) { setMsg('IDは半角英数字で入力してください。', 'err'); return null; }
    if (pw.length < 6) { setMsg('パスワードは6文字以上にしてください。', 'err'); return null; }
    return { id: id, pw: pw };
  }

  // store から集計値を算出
  function statsOf(store) {
    store = store || {};
    var hist = store.hist || {}, ids = Object.keys(hist);
    var c = 0, w = 0, answeredIds = 0, lowConf = 0, wrongCur = 0;
    ids.forEach(function (k) {
      var h = hist[k] || {};
      c += (h.c || 0); w += (h.w || 0);
      if ((h.c || 0) + (h.w || 0) > 0) answeredIds++;
      if (h.last === 'c' && h.lc === 1) lowConf++;
      if (h.last === 'w') wrongCur++;
    });
    var attempts = c + w;

    // SRS：今日が期限の数
    var today = (function () { var d = new Date(); var p = function (n) { return ('0' + n).slice(-2); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
    var srsAll = store.srs || {}, srsKeys = Object.keys(srsAll), srsDue = 0;
    srsKeys.forEach(function (k) { var s = srsAll[k]; if (s && (s.due || '9999-99-99') <= today) srsDue++; });

    // 用語帳：習得済(2)と学習中(1)
    var vm = store.vm || {}, vmMastered = 0, vmLearning = 0;
    Object.keys(vm).forEach(function (k) { var v = vm[k]; if (v >= 2) vmMastered++; else if (v >= 1) vmLearning++; });

    // 教科書：しおり/読了
    var tbm = store.tbm || {}, tbmBm = 0, tbmDone = 0;
    Object.keys(tbm).forEach(function (k) { var v = tbm[k]; if (v === 1) tbmBm++; else if (v === 2) tbmDone++; });

    // メモ
    var notes = store.notes || {}, notesCount = Object.keys(notes).filter(function (k) { return (notes[k] || '').trim(); }).length;

    // 試験履歴
    var exams = store.exams || [], examCount = exams.length;
    var examBest = 0, examPassed = 0, examLastTs = 0;
    exams.forEach(function (e) {
      if ((e.pct || 0) > examBest) examBest = e.pct;
      if (e.ok) examPassed++;
      if ((e.ts || 0) > examLastTs) examLastTs = e.ts;
    });

    // 学習日数（daily の non-empty キー数）と最終学習日
    var daily = store.daily || {}, dailyKeys = Object.keys(daily).filter(function (k) { return (daily[k] || 0) > 0; });
    var daysActive = dailyKeys.length;
    var lastStudyDate = dailyKeys.sort().slice(-1)[0] || '';

    return {
      answered: answeredIds,
      attempts: attempts,
      correct: c, wrong: w,
      rate: attempts ? Math.round(c / attempts * 100) : 0,
      streak: store.streak || 0,
      bookmarks: (store.bm || []).length,
      vocab: vmMastered, vocabLearning: vmLearning, vocabTotal: Object.keys(vm).length,
      tbmDone: tbmDone, tbmBm: tbmBm,
      notes: notesCount,
      srsTotal: srsKeys.length, srsDue: srsDue,
      lowConf: lowConf, wrongCur: wrongCur,
      examCount: examCount, examBest: examBest, examPassed: examPassed, examLastTs: examLastTs,
      examDate: store.examDate || '', goal: store.goal || 0,
      daysActive: daysActive, lastStudyDate: lastStudyDate
    };
  }

  /* ---------------- 認証アクション ---------------- */
  function doLogin() {
    var v = validate(); if (!v) return;
    busy(true); setMsg('ログイン中…');
    auth.signInWithEmailAndPassword(idToEmail(v.id), v.pw)
      .then(function () {})
      .catch(function (e) { busy(false); setMsg(friendlyErr(e && e.code), 'err'); });
  }
  function doSignup() {
    var v = validate(); if (!v) return;
    busy(true); setMsg('登録中…');
    auth.createUserWithEmailAndPassword(idToEmail(v.id), v.pw)
      .then(function () {})
      .catch(function (e) { busy(false); setMsg(friendlyErr(e && e.code), 'err'); });
  }
  function doLogout() {
    if (!auth) return;
    closeAdmin();
    if (window.__setStore) window.__setStore(emptyStore());
    if (window.__refreshUI) window.__refreshUI();
    auth.signOut();
  }

  /* ---------------- ログイン後の同期 ---------------- */
  function docPayload(store) { return { store: store, name: currentName, email: currentEmail, updated: Date.now() }; }

  // 資格ごとにドキュメント内を名前空間化して保存する（stores[CERT_KEY]）。
  // FieldPath で stores.<CERT_KEY> のみを丸ごと置換するので、(1) 他資格のサブストアは保持され、
  // (2) リセット（空ストア書込）時に古い履歴キーが残らない（deep-merge を避ける）。
  function saveCertStore(uid, st) {
    var ref = db.collection(COLLECTION).doc(uid);
    var FP = firebase.firestore.FieldPath;
    return ref.update(new FP('stores', CERT_KEY), st, 'name', currentName, 'email', currentEmail, 'updated', Date.now())
      .catch(function () {
        // doc がまだ無い場合は作成（merge:true、stores はこの資格のみ）
        var obj = { stores: {}, name: currentName, email: currentEmail, updated: Date.now() };
        obj.stores[CERT_KEY] = st;
        return ref.set(obj, { merge: true });
      });
  }

  function onLogin(user) {
    currentUser = user;
    currentEmail = user.email || '';
    currentName = currentEmail.split('@')[0];
    isAdmin = ADMIN_IDS.indexOf(sanitizeId(currentName)) >= 0;
    setBadge(currentName); showAdminBtn(isAdmin);
    busy(false);
    flushPendingFeedback(); // 未ログイン中に退避した報告があれば送信

    setStatus('確認中…');
    db.collection(COLLECTION).doc(user.uid).get().then(function (doc) {
      var data = (doc.exists && doc.data()) || {};

      // ---- アクセス承認ゲート（ホワイトリスト方式・既定で不許可）----
      // 管理者は常に許可。一般ユーザーは access==='approved' のときだけ利用可。
      // 未設定/'pending'/'blocked' は全面ロック（承認は管理者ビューから付与）。
      if (!isAdmin) {
        var acc = data.access;
        if (acc !== 'approved') {
          try { localStorage.removeItem('sfq_access_' + user.uid); } catch (e) {}
          // 初回サインアップ等で doc が無ければ「承認待ち」doc を作り、管理者ビューに可視化する
          if (!doc.exists) {
            db.collection(COLLECTION).doc(user.uid).set(
              { access: 'pending', name: currentName, email: currentEmail, updated: Date.now() },
              { merge: true }
            ).catch(function () {});
          }
          showLock(acc || 'pending', { reqName: (data.req && data.req.name) || data.name || '' });
          return;
        }
      }
      hideLock();
      // 承認済みをローカルにも控える（オフライン時の再ログイン用。承認取消時は上で消える）
      try { localStorage.setItem('sfq_access_' + user.uid, 'approved'); } catch (e) {}

      // gateway（ホーム）: このページは進捗ストアを持たないので同期は行わない。
      // 認証とアカウント管理（管理者ビュー）のみ。進捗の読込/移行は各クイズページ側に任せる。
      if (!window.__setStore) {
        setStatus(''); setMsg(''); if (elPw) elPw.value = '';
        hideOverlay();
        return;
      }

      setStatus('読込中…');
      var certStore = data.stores && data.stores[CERT_KEY];
      if (certStore) {
        // この資格のクラウド進捗を採用（資格別に分離されている）
        window.__setStore(certStore);
        if (window.__refreshUI) window.__refreshUI();
        setStatus('同期済み');
      } else {
        // この資格の進捗が未登録 → ローカル進捗を1回だけ移行（資格別フラグ）。無ければ空で開始。
        var seed = emptyStore();
        try {
          if (!localStorage.getItem(MIGRATE_FLAG) && window.__getStore) {
            var cur = window.__getStore();
            if (cur && (Object.keys(cur.hist || {}).length || (cur.bm || []).length)) seed = cur;
          }
        } catch (e) {}
        try { localStorage.setItem(MIGRATE_FLAG, '1'); } catch (e) {}
        window.__setStore(seed);
        if (window.__refreshUI) window.__refreshUI();
        saveCertStore(user.uid, seed).catch(function () {});
        setStatus('同期済み');
      }
      setMsg(''); if (elPw) elPw.value = ''; hideOverlay();
    }).catch(function () {
      // 読込失敗（オフライン等）。承認を確認できないので、過去に承認済みの端末のみ素通しする。
      if (!isAdmin) {
        var cached = '';
        try { cached = localStorage.getItem('sfq_access_' + user.uid) || ''; } catch (e) {}
        if (cached !== 'approved') { showLock('error'); return; }
      }
      hideLock();
      if (!window.__setStore) { setStatus(''); hideOverlay(); return; }
      hideOverlay(); setStatus('オフライン'); toastSafe('オフライン: ローカルの進捗を表示中');
    });
  }

  /* ---------------- クラウド保存（デバウンス） ---------------- */
  window.__cloudSave = function () {
    if (!currentUser || !db) return;
    setStatus('保存中…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var st = window.__getStore ? window.__getStore() : null;
      if (!st) return;
      saveCertStore(currentUser.uid, st)
        .then(function () { setStatus('保存済み'); })
        .catch(function () { setStatus('オフライン'); });
    }, 800);
  };

  /* ---------------- フィードバック / 不具合報告（自docの feedback 配列へ蓄積） ----------------
     ・ログイン中: 本人docに arrayUnion で1件追加（既存ルール「本人は自doc書込可」で許可）。
     ・未ログイン/ローカル: エンジン側が localStorage 'sfq_feedback_pending' に退避し、
       次回ログイン時に flushPendingFeedback() でまとめて送信する。
     ・管理者は全docを読めるため、loadAdmin で各docの feedback を集約して一覧表示する。 */
  window.__cloudSubmitFeedback = function (report) {
    if (!currentUser || !db) return false; // 呼び出し側（エンジン）がローカル退避する
    var FV = firebase.firestore.FieldValue;
    return db.collection(COLLECTION).doc(currentUser.uid).set({
      feedback: FV.arrayUnion(report),
      name: currentName, email: currentEmail, updated: Date.now()
    }, { merge: true });
  };
  function flushPendingFeedback() {
    if (!currentUser || !db) return;
    var a; try { a = JSON.parse(localStorage.getItem('sfq_feedback_pending') || '[]'); } catch (e) { a = []; }
    if (!a || !a.length) return;
    var FV = firebase.firestore.FieldValue;
    db.collection(COLLECTION).doc(currentUser.uid).set({
      feedback: FV.arrayUnion.apply(FV, a),
      name: currentName, email: currentEmail, updated: Date.now()
    }, { merge: true }).then(function () {
      try { localStorage.removeItem('sfq_feedback_pending'); } catch (e) {}
    }).catch(function () {});
  }

  /* ---------------- 管理者ビュー ---------------- */
  var adminRows = [];   // 旧：CSV/詳細互換用に1cert=1行も保持
  var adminUsers = [];  // 新：uid単位でグルーピング { uid, name, email, updated, certs:[{cert,store,stats}], agg }
  var adminFeedback = [];// フィードバック集約 [{uid,name,email,fb}]（fbは各docの feedback 配列要素そのもの）
  var fbFilterCert = 'all', fbFilterCat = 'all'; // フィードバックの絞り込み
  var adminFilter = ''; // 名前/メール検索
  var adminSort = 'updated'; // 'updated'|'answered'|'rate'|'days'|'name'
  var adminCert = 'all';     // 資格フィルタ
  var adminActivity = 'all'; // 'all'|'week'|'dormant'
  var adminPass = false;     // 合格者のみ
  var adminAccess = 'all';   // 'all'|'approved'|'pending'|'blocked'（アクセス状態フィルタ）

  function admToday() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function admDaysAgo(s) { if (!s) return Infinity; try { var d = new Date(s + 'T00:00:00'); return Math.floor((Date.now() - d.getTime()) / 86400000); } catch (e) { return Infinity; } }

  // 全体ダッシュボード（KPI＋分野別＋問題別正答率）。問題別は折りたたみ。
  function adminDashboardHTML() {
    var total = adminUsers.length, today = admToday();
    var actToday = 0, actWeek = 0, sumAtt = 0, sumCorr = 0, sumEx = 0, sumExP = 0;
    adminUsers.forEach(function (u) {
      var a = u.agg; sumAtt += a.attempts; sumCorr += a.correct; sumEx += a.examCount; sumExP += a.examPassed;
      if (a.lastStudyDate === today) actToday++;
      if (admDaysAgo(a.lastStudyDate) <= 6) actWeek++;
    });
    var avgRate = sumAtt ? Math.round(sumCorr / sumAtt * 100) : 0;
    var passRate = sumEx ? Math.round(sumExP / sumEx * 100) : 0;
    var kpi = function (n, l) { return '<div class="sfqc-kpi"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; };
    var html = '<div class="sfqc-sec">全体サマリー</div><div class="sfqc-kpis">' +
      kpi(total, '総ユーザー') + kpi(actToday, '今日のアクティブ') + kpi(actWeek, '今週のアクティブ') +
      kpi(avgRate + '%', '平均正答率') + kpi(sumAtt.toLocaleString(), '総解答数') + kpi(sumEx, '試験受験') + kpi(passRate + '%', '試験合格率') +
      '</div>';

    var certName = (window.CERT_CONFIG && CERT_CONFIG.shortName) || CERT_KEY;
    var haveEngine = (typeof QDATA !== 'undefined' && QDATA && QDATA.length && typeof domainOf === 'function');
    if (haveEngine) {
      var domAgg = {}, perQ = {};
      adminRows.forEach(function (r) {
        if (r.cert !== CERT_KEY) return;
        var hist = r.store.hist || {};
        Object.keys(hist).forEach(function (id) {
          var h = hist[id], c = h.c || 0, t = (h.c || 0) + (h.w || 0); if (!t) return;
          var pq = perQ[id] || (perQ[id] = { c: 0, t: 0 }); pq.c += c; pq.t += t;
          var dc; try { dc = domainOf(+id); } catch (e) { dc = null; }
          if (dc) { var da = domAgg[dc] || (domAgg[dc] = { c: 0, t: 0 }); da.c += c; da.t += t; }
        });
      });
      var defs = (typeof DOMAIN_DEFS !== 'undefined') ? DOMAIN_DEFS : [];
      var dbars = '';
      defs.forEach(function (d) {
        var a = domAgg[d.code]; if (!a || !a.t) return; var pc = Math.round(a.c / a.t * 100);
        var col = pc >= 70 ? '#16a34a' : pc >= 50 ? '#d97706' : '#dc2626';
        dbars += '<div class="sfqc-dom"><span class="nm">' + esc(d.emoji + ' ' + d.name) + '</span><div class="bw"><div class="bf" style="width:' + pc + '%;background:' + col + '"></div></div><span class="pc" style="color:' + col + '">' + pc + '% <small>(' + a.c + '/' + a.t + ')</small></span></div>';
      });
      if (dbars) html += '<div class="sfqc-sec">分野別 平均正答率（全ユーザー・' + esc(certName) + '）</div><div class="sfqc-dash-card">' + dbars + '</div>';

      var qmap = qTextMap();
      var items = Object.keys(perQ).map(function (id) { var a = perQ[id]; return { id: id, c: a.c, t: a.t, rate: Math.round(a.c / a.t * 100) }; });
      items.sort(function (a, b) { return a.rate - b.rate || b.t - a.t; });
      var rows = items.slice(0, 40).map(function (it) {
        var rc = it.rate < 50 ? 'lo' : it.rate < 70 ? 'mi' : 'hi';
        var flag = (it.t >= 5 && it.rate < 40) ? '<span class="sfqc-flag">要確認</span>' : '';
        return '<tr><td class="num">Q' + esc(it.id) + '</td><td class="qx">' + esc((qmap[it.id] || '').slice(0, 60)) + '</td><td class="num">' + it.t + '</td><td class="num"><span class="sfqc-rate ' + rc + '">' + it.rate + '%</span>' + flag + '</td></tr>';
      }).join('');
      if (items.length) {
        html += '<details class="sfqc-itemwrap"><summary>📝 問題別 正答率（低い順・全ユーザー集計・' + esc(certName) + ' ' + items.length + '問）</summary>' +
          '<div class="sfqc-dash-card" style="margin-top:8px"><table class="sfqc-itbl"><thead><tr><th>問題</th><th>内容</th><th class="num">回答数</th><th class="num">正答率</th></tr></thead><tbody>' + rows + '</tbody></table>' +
          '<div class="sfqc-itnote">※ 回答数が多く正答率が低い問題＝難しすぎる/設問に問題がある可能性。改善の優先候補（最大40件）。</div></div></details>';
      }
    }
    return html;
  }

  function qTextMap() {
    var map = {};
    try { if (typeof QDATA !== 'undefined' && QDATA.forEach) QDATA.forEach(function (q) { map[q.id] = q.question || ''; }); } catch (e) {}
    return map;
  }

  function aggregateUser(certs) {
    var ans = 0, att = 0, c = 0, w = 0, ex = 0, exP = 0, exBest = 0;
    var notes = 0, srsDue = 0, srsTotal = 0, vocab = 0, bm = 0, days = 0;
    var lastStudy = '';
    certs.forEach(function (x) {
      var s = x.stats;
      ans += s.answered; att += s.attempts; c += s.correct; w += s.wrong;
      ex += s.examCount; exP += s.examPassed; if (s.examBest > exBest) exBest = s.examBest;
      notes += s.notes; srsDue += s.srsDue; srsTotal += s.srsTotal;
      vocab += s.vocab; bm += s.bookmarks; days += s.daysActive;
      if (s.lastStudyDate > lastStudy) lastStudy = s.lastStudyDate;
    });
    return {
      certCount: certs.length,
      answered: ans, attempts: att, correct: c, wrong: w,
      rate: att ? Math.round(c / att * 100) : 0,
      examCount: ex, examPassed: exP, examBest: exBest,
      notes: notes, srsDue: srsDue, srsTotal: srsTotal,
      vocab: vocab, bookmarks: bm, daysActive: days,
      lastStudyDate: lastStudy
    };
  }

  function openAdmin() { if (!isAdmin) return; elAdmin.classList.add('show'); loadAdmin(); }
  function closeAdmin() { if (elAdmin) elAdmin.classList.remove('show'); }

  function loadAdmin() {
    if (!isAdmin || !db) return;
    var body = document.getElementById('sfqc-adm-body');
    body.innerHTML = '<div class="sfqc-empty">読み込み中…</div>';
    db.collection(COLLECTION).get().then(function (snap) {
      adminRows = [];
      adminFeedback = [];
      var byUid = {};
      snap.forEach(function (d) {
        var data = d.data() || {};
        var nm = data.name || (data.email ? String(data.email).split('@')[0] : '') || ('(不明 ' + d.id.slice(0, 6) + ')');
        var email = data.email || '';
        if (Array.isArray(data.feedback)) {
          data.feedback.forEach(function (fb) { if (fb && typeof fb === 'object') adminFeedback.push({ uid: d.id, name: nm, email: email, fb: fb }); });
        }
        var entry = byUid[d.id] || (byUid[d.id] = { uid: d.id, name: nm, email: email, updated: data.updated || 0, access: (data.access || 'pending'), req: (data.req || null), certs: [] });
        var stores = data.stores;
        if (stores && typeof stores === 'object' && Object.keys(stores).length) {
          Object.keys(stores).forEach(function (ck) {
            var store = stores[ck] || emptyStore();
            var st = statsOf(store);
            entry.certs.push({ cert: ck, store: store, stats: st });
            adminRows.push({ uid: d.id, cert: ck, name: nm, updated: data.updated || 0, store: store, stats: st });
          });
        } else if (data.store) {
          var st1 = statsOf(data.store);
          entry.certs.push({ cert: '(旧)', store: data.store, stats: st1 });
          adminRows.push({ uid: d.id, cert: '(旧)', name: nm, updated: data.updated || 0, store: data.store, stats: st1 });
        } else {
          var st2 = statsOf(emptyStore());
          entry.certs.push({ cert: '—', store: emptyStore(), stats: st2 });
          adminRows.push({ uid: d.id, cert: '—', name: nm, updated: data.updated || 0, store: emptyStore(), stats: st2 });
        }
      });
      adminUsers = Object.keys(byUid).map(function (k) {
        var u = byUid[k];
        u.agg = aggregateUser(u.certs);
        // 資格内も解答数順で並べる（多い順）
        u.certs.sort(function (a, b) { return b.stats.attempts - a.stats.attempts; });
        return u;
      });
      adminFeedback.sort(function (a, b) { return (b.fb.ts || 0) - (a.fb.ts || 0); }); // 新しい順
      renderAdmin();
    }).catch(function (e) {
      body.innerHTML = '<div class="sfqc-empty">読み込みに失敗しました。<br>管理者として権限（Firestoreルール）が設定されているか確認してください。<br><small>' + esc(e && e.message) + '</small></div>';
    });
  }

  function fmtDate(ms) {
    if (!ms) return '—';
    try { var d = new Date(ms); var p = function (n) { return ('0' + n).slice(-2); };
      return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
    catch (e) { return '—'; }
  }

  function filterSortUsers() {
    var list = adminUsers.slice();
    var q = (adminFilter || '').toLowerCase().trim();
    if (q) list = list.filter(function (u) {
      return (u.name || '').toLowerCase().indexOf(q) >= 0 ||
             (u.email || '').toLowerCase().indexOf(q) >= 0 ||
             (u.uid || '').toLowerCase().indexOf(q) >= 0;
    });
    if (adminCert !== 'all') list = list.filter(function (u) { return u.certs.some(function (c) { return c.cert === adminCert; }); });
    if (adminActivity === 'week') list = list.filter(function (u) { return admDaysAgo(u.agg.lastStudyDate) <= 6; });
    else if (adminActivity === 'dormant') list = list.filter(function (u) { return admDaysAgo(u.agg.lastStudyDate) >= 30; });
    if (adminPass) list = list.filter(function (u) { return u.agg.examPassed > 0; });
    if (adminAccess !== 'all') list = list.filter(function (u) { return (u.access || 'pending') === adminAccess; });
    list.sort(function (a, b) {
      if (adminSort === 'answered') return b.agg.answered - a.agg.answered;
      if (adminSort === 'rate')     return b.agg.rate - a.agg.rate;
      if (adminSort === 'days')     return b.agg.daysActive - a.agg.daysActive;
      if (adminSort === 'name')     return (a.name || '').localeCompare(b.name || '', 'ja');
      return (b.updated || 0) - (a.updated || 0); // 'updated'
    });
    return list;
  }

  function renderAdmin() {
    var body = document.getElementById('sfqc-adm-body');
    if (!adminUsers.length) { body.innerHTML = '<div class="sfqc-empty">アカウントがまだありません。</div>'; return; }
    var list = filterSortUsers();

    var certSet = {}; adminRows.forEach(function (r) { certSet[r.cert] = 1; });
    var certChips = '<button class="sfqc-fchip' + (adminCert === 'all' ? ' on' : '') + '" data-cert="all">すべて</button>';
    Object.keys(certSet).forEach(function (ck) { certChips += '<button class="sfqc-fchip' + (adminCert === ck ? ' on' : '') + '" data-cert="' + esc(ck) + '">' + esc(ck) + '</button>'; });
    var sortBtn = function (k, l) { return '<button class="sfqc-sort' + (adminSort === k ? ' on' : '') + '" data-sort="' + k + '">' + l + '</button>'; };

    var html = feedbackSectionHTML();
    html += adminDashboardHTML();
    html += '<div class="sfqc-sec">ユーザー</div>';
    html += '<div class="sfqc-toolbar">' +
        '<input id="sfqc-q" class="sfqc-search" type="search" placeholder="🔍 名前・メール・UIDで絞り込み" value="' + esc(adminFilter) + '">' +
        '<span class="sfqc-count">' + list.length + ' / ' + adminUsers.length + '人</span>' +
      '</div>';
    html += '<div class="sfqc-toolbar sfqc-toolbar2">' +
        '<span class="sfqc-sort-label">資格:</span>' + certChips +
        '<span class="sfqc-sort-label">状態:</span>' +
        '<button class="sfqc-fchip' + (adminActivity === 'week' ? ' on' : '') + '" data-act="week">7日以内</button>' +
        '<button class="sfqc-fchip' + (adminActivity === 'dormant' ? ' on' : '') + '" data-act="dormant">休眠30日+</button>' +
        '<button class="sfqc-fchip' + (adminPass ? ' on' : '') + '" data-pass="1">合格者</button>' +
        '<span class="sfqc-sort-label">アクセス:</span>' +
        '<button class="sfqc-fchip' + (adminAccess === 'approved' ? ' on' : '') + '" data-access="approved">承認済み</button>' +
        '<button class="sfqc-fchip' + (adminAccess === 'pending' ? ' on' : '') + '" data-access="pending">承認待ち</button>' +
        '<button class="sfqc-fchip' + (adminAccess === 'blocked' ? ' on' : '') + '" data-access="blocked">停止中</button>' +
      '</div>';
    html += '<div class="sfqc-toolbar sfqc-toolbar2">' +
        '<span class="sfqc-sort-label">並び順:</span>' +
        sortBtn('updated', '最終更新') + sortBtn('answered', '解答数') + sortBtn('rate', '正答率') + sortBtn('days', '学習日数') + sortBtn('name', '名前') +
      '</div>';

    if (!list.length) {
      html += '<div class="sfqc-empty">条件に合うアカウントがありません。</div>';
    }

    list.forEach(function (u, i) {
      var a = u.agg;
      var emailLabel = u.email ? '<span class="sfqc-acc-email">' + esc(u.email) + '</span>' : '';
      var passLabel = a.examCount ? ' (合格 ' + a.examPassed + '回)' : '';
      var dago = admDaysAgo(a.lastStudyDate);
      var dormantLabel = (dago >= 30 && isFinite(dago)) ? ' <span class="sfqc-inactive">休眠 ' + dago + '日</span>' : '';
      var accMap = { approved: ['ok', '✅ 承認済み'], pending: ['pend', '⏳ 承認待ち'], blocked: ['block', '🚫 停止中'] };
      var am = accMap[u.access] || accMap.pending;
      var accChip = '<span class="sfqc-acc-access ' + am[0] + '">' + am[1] + '</span>';
      var accBtn = (u.access === 'approved')
        ? '<button class="sfqc-act-block" data-acc-uid="' + esc(u.uid) + '" data-acc-name="' + esc(u.name) + '" data-acc-state="blocked">⏸ 停止</button>'
        : '<button class="sfqc-act-approve" data-acc-uid="' + esc(u.uid) + '" data-acc-name="' + esc(u.name) + '" data-acc-state="approved">✅ 承認</button>';
      var reqLabel = (u.access !== 'approved' && u.req && u.req.ts) ? ' <span class="sfqc-acc-access pend">📝 申請 ' + esc(fmtDate(u.req.ts)) + '</span>' : '';
      html +=
        '<div class="sfqc-acc">' +
          '<div class="sfqc-acc-head">' +
            '<span class="sfqc-acc-name">👤 ' + esc(u.name) + emailLabel + accChip + reqLabel + dormantLabel + '</span>' +
            '<span class="sfqc-acc-stats">' +
              '<span>登録資格 <b>' + a.certCount + '</b></span>' +
              '<span>解答 <b>' + a.answered + '</b>問 / 述べ<b>' + a.attempts + '</b>回</span>' +
              '<span>正答率 <b>' + a.rate + '%</b></span>' +
              '<span>試験 <b>' + a.examCount + '</b>回' + passLabel + ' / 最高 <b>' + a.examBest + '%</b></span>' +
              '<span>学習日数 <b>' + a.daysActive + '</b></span>' +
              '<span>★<b>' + a.bookmarks + '</b> / 用語<b>' + a.vocab + '</b> / メモ<b>' + a.notes + '</b></span>' +
              '<span>SRS待ち <b>' + a.srsDue + '</b>/' + a.srsTotal + '</span>' +
              '<span>最終学習 ' + esc(a.lastStudyDate || '—') + '</span>' +
              '<span>最終更新 ' + fmtDate(u.updated) + '</span>' +
            '</span>' +
            '<span class="sfqc-acc-actions">' +
              accBtn +
              '<button class="sfqc-act-detail" data-i="' + i + '">詳細 ▾</button>' +
            '</span>' +
          '</div>' +
          '<div class="sfqc-detail" id="sfqc-det-' + i + '"></div>' +
        '</div>';
    });
    body.innerHTML = html;

    // フィルタ/ソート
    var qIn = document.getElementById('sfqc-q');
    if (qIn) {
      qIn.addEventListener('input', function () { adminFilter = qIn.value; renderAdmin(); setTimeout(function () { var n = document.getElementById('sfqc-q'); if (n) { n.focus(); n.selectionStart = n.selectionEnd = n.value.length; } }, 0); });
    }
    body.querySelectorAll('.sfqc-sort').forEach(function (b) {
      b.addEventListener('click', function () { adminSort = b.getAttribute('data-sort'); renderAdmin(); });
    });
    body.querySelectorAll('[data-cert]').forEach(function (b) {
      b.addEventListener('click', function () { adminCert = b.getAttribute('data-cert'); renderAdmin(); });
    });
    body.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { var v = b.getAttribute('data-act'); adminActivity = (adminActivity === v ? 'all' : v); renderAdmin(); });
    });
    body.querySelectorAll('[data-pass]').forEach(function (b) {
      b.addEventListener('click', function () { adminPass = !adminPass; renderAdmin(); });
    });
    body.querySelectorAll('[data-access]').forEach(function (b) {
      b.addEventListener('click', function () { var v = b.getAttribute('data-access'); adminAccess = (adminAccess === v ? 'all' : v); renderAdmin(); });
    });
    body.querySelectorAll('[data-acc-uid]').forEach(function (b) {
      b.addEventListener('click', function () { setAccess(b.getAttribute('data-acc-uid'), b.getAttribute('data-acc-name'), b.getAttribute('data-acc-state')); });
    });
    body.querySelectorAll('.sfqc-act-detail').forEach(function (b) {
      b.addEventListener('click', function () { toggleDetail(+b.getAttribute('data-i')); });
    });
    // フィードバック：ダウンロード・絞り込み・対応済み
    var fbJson = document.getElementById('sfqc-fb-json'); if (fbJson) fbJson.addEventListener('click', exportFeedbackJson);
    var fbCsv = document.getElementById('sfqc-fb-csv'); if (fbCsv) fbCsv.addEventListener('click', exportFeedbackCsv);
    body.querySelectorAll('[data-fbcert]').forEach(function (b) {
      b.addEventListener('click', function () { fbFilterCert = b.getAttribute('data-fbcert'); renderAdmin(); });
    });
    body.querySelectorAll('[data-fbcat]').forEach(function (b) {
      b.addEventListener('click', function () { fbFilterCat = b.getAttribute('data-fbcat'); renderAdmin(); });
    });
    body.querySelectorAll('.sfqc-fb-done').forEach(function (b) {
      b.addEventListener('click', function () { adminResolveFeedback(+b.getAttribute('data-fi')); });
    });
  }

  function certDetailHTML(c, uid, name) {
    var s = c.stats;
    var examDateLabel = s.examDate ? esc(s.examDate) : '未設定';
    var goalLabel = s.goal ? (s.goal + '問/日') : '未設定';
    var lastExam = s.examLastTs ? fmtDate(s.examLastTs) : '—';
    return '' +
      '<div class="sfqc-cert">' +
        '<div class="sfqc-cert-head">' +
          '<span class="sfqc-cert-name">📘 ' + esc(c.cert) + '</span>' +
          '<span class="sfqc-cert-actions">' +
            '<button class="sfqc-act-reset" data-uid="' + esc(uid) + '" data-cert="' + esc(c.cert) + '" data-name="' + esc(name) + '">リセット</button>' +
            '<button class="sfqc-act-del" data-uid="' + esc(uid) + '" data-cert="' + esc(c.cert) + '" data-name="' + esc(name) + '">削除</button>' +
          '</span>' +
        '</div>' +
        '<div class="sfqc-kv-grid">' +
          kv('解答済み問題', s.answered + ' 問') +
          kv('総回答回数', s.attempts + ' 回') +
          kv('正解 / 不正解', s.correct + ' / ' + s.wrong) +
          kv('正答率', s.rate + ' %') +
          kv('連続正解', s.streak + ' 問') +
          kv('現在間違いキュー', s.wrongCur + ' 問') +
          kv('自信なし正解', s.lowConf + ' 問') +
          kv('★ ブックマーク', s.bookmarks + ' 問') +
          kv('試験挑戦', s.examCount + ' 回') +
          kv('試験 最高', s.examBest + ' %') +
          kv('試験 合格', s.examPassed + ' 回') +
          kv('直近試験', lastExam) +
          kv('SRS 期限到来', s.srsDue + ' / ' + s.srsTotal) +
          kv('用語 習得', s.vocab + ' (学習中 ' + s.vocabLearning + ' / 総 ' + s.vocabTotal + ')') +
          kv('教科書 読了', s.tbmDone + ' (しおり ' + s.tbmBm + ')') +
          kv('メモ', s.notes + ' 件') +
          kv('学習日数', s.daysActive + ' 日') +
          kv('最終学習日', s.lastStudyDate || '—') +
          kv('受験予定日', examDateLabel) +
          kv('日次目標', goalLabel) +
        '</div>' +
      '</div>';
  }

  function kv(label, val) {
    return '<div class="sfqc-kv"><div class="sfqc-k">' + esc(label) + '</div><div class="sfqc-v">' + esc(String(val)) + '</div></div>';
  }

  function toggleDetail(i) {
    var box = document.getElementById('sfqc-det-' + i);
    if (!box) return;
    if (box.classList.contains('show')) { box.classList.remove('show'); return; }
    var list = filterSortUsers();
    var u = list[i]; if (!u) return;

    var html = '<div class="sfqc-detail-inner">';
    // 全資格集計
    html += '<div class="sfqc-meta">' +
      '<div>UID: <code>' + esc(u.uid) + '</code></div>' +
      (u.email ? '<div>メール: ' + esc(u.email) + '</div>' : '') +
      '</div>';
    // 資格ごと
    u.certs.forEach(function (c) { html += certDetailHTML(c, u.uid, u.name); });
    // 問題別履歴（最も多く解いている資格の hist を表示）
    var primary = u.certs.slice().sort(function (a, b) { return b.stats.attempts - a.stats.attempts; })[0];
    if (primary && primary.stats.attempts) {
      var hist = primary.store.hist || {}, qmap = qTextMap();
      var ids = Object.keys(hist).sort(function (a, b) { return (+a) - (+b); });
      var rows = ids.map(function (id) {
        var h = hist[id], t = (h.c || 0) + (h.w || 0), rate = t ? Math.round(h.c / t * 100) : 0;
        return '<tr><td class="num">Q' + esc(id) + '</td><td class="qx">' + esc((qmap[id] || '').slice(0, 70)) + '</td>' +
          '<td class="num">' + (h.c || 0) + '</td><td class="num">' + (h.w || 0) + '</td><td class="num">' + rate + '%</td></tr>';
      }).join('');
      html += '<details class="sfqc-qhist"><summary>問題別回答履歴（' + esc(primary.cert) + '・' + ids.length + '問）</summary>' +
        '<table><thead><tr><th>問題</th><th>内容</th><th class="num">正解</th><th class="num">不正解</th><th class="num">正答率</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</details>';
    }
    html += '</div>';

    box.innerHTML = html;
    box.classList.add('show');

    box.querySelectorAll('.sfqc-act-reset').forEach(function (b) {
      b.addEventListener('click', function () { resetAccount(b.getAttribute('data-uid'), b.getAttribute('data-cert'), b.getAttribute('data-name')); });
    });
    box.querySelectorAll('.sfqc-act-del').forEach(function (b) {
      b.addEventListener('click', function () { deleteAccount(b.getAttribute('data-uid'), b.getAttribute('data-cert'), b.getAttribute('data-name')); });
    });
  }

  // アクセス権の付与/停止（管理者のみ）。Firestoreルールで access は管理者だけ書込可。
  function setAccess(uid, name, state) {
    if (!isAdmin || !db) return;
    var verb = state === 'approved' ? '承認' : '停止';
    if (!confirm('「' + name + '」を' + verb + 'します。よろしいですか？')) return;
    db.collection(COLLECTION).doc(uid).set({ access: state, updated: Date.now() }, { merge: true })
      .then(function () { toastSafe('「' + name + '」を' + verb + 'しました'); loadAdmin(); })
      .catch(function (e) { alert('変更に失敗しました: ' + (e && e.message)); });
  }

  function resetAccount(uid, cert, name) {
    if (!isAdmin || !db) return;
    if (!confirm('「' + name + '」［' + cert + '］の進捗をリセットします。よろしいですか？')) return;
    var ref = db.collection(COLLECTION).doc(uid);
    var FP = firebase.firestore.FieldPath;
    var p = (cert === '(旧)' || cert === '—')
      ? ref.update('store', emptyStore(), 'updated', Date.now())
      : ref.update(new FP('stores', cert), emptyStore(), 'updated', Date.now());
    p.then(function () { toastSafe('「' + name + '」［' + cert + '］をリセットしました'); loadAdmin(); })
     .catch(function (e) { alert('リセットに失敗しました: ' + (e && e.message)); });
  }

  function deleteAccount(uid, cert, name) {
    if (!isAdmin || !db) return;
    if (!confirm('「' + name + '」［' + cert + '］の進捗データを削除します。\n（この資格のデータのみ削除。ログインアカウント自体はFirebaseコンソールから削除します）\nよろしいですか？')) return;
    var ref = db.collection(COLLECTION).doc(uid);
    var FP = firebase.firestore.FieldPath;
    var FV = firebase.firestore.FieldValue;
    var p = (cert === '(旧)' || cert === '—')
      ? ref.update('store', FV.delete(), 'updated', Date.now())
      : ref.update(new FP('stores', cert), FV.delete(), 'updated', Date.now());
    p.then(function () { toastSafe('「' + name + '」［' + cert + '］を削除しました'); loadAdmin(); })
     .catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }

  /* ---------------- フィードバック一覧（管理者ビュー上部） ---------------- */
  function fbCatLabel(k) {
    var m = { bug: '🐞 不具合', answer: '❌ 正解誤り', exp: '📝 解説誤り', choice: '🔀 選択肢', japanese: '🗾 日本語', request: '💡 要望', other: '＊ その他' };
    return m[k] || k || '—';
  }
  function feedbackSectionHTML() {
    var all = adminFeedback;
    var head = '<div class="sfqc-fb-head"><div class="sfqc-sec" style="margin:0">🛠 フィードバック / 不具合報告 <span class="sfqc-fb-count">' + all.length + '件</span></div>' +
      '<div class="sfqc-fb-dl"><button class="sfqc-mini fb-dl" id="sfqc-fb-json">⬇ JSON</button><button class="sfqc-mini fb-dl" id="sfqc-fb-csv">⬇ CSV</button></div></div>';
    if (!all.length) return head + '<div class="sfqc-empty">まだ報告はありません。</div><div class="sfqc-divider"></div>';

    var list = all.filter(function (r) {
      if (fbFilterCert !== 'all' && (r.fb.cert || '') !== fbFilterCert) return false;
      if (fbFilterCat !== 'all' && (r.fb.cat || '') !== fbFilterCat) return false;
      return true;
    });
    var certSet = {}, catSet = {};
    all.forEach(function (r) { if (r.fb.cert) certSet[r.fb.cert] = 1; if (r.fb.cat) catSet[r.fb.cat] = 1; });
    var certChips = '<button class="sfqc-fchip' + (fbFilterCert === 'all' ? ' on' : '') + '" data-fbcert="all">すべて</button>';
    Object.keys(certSet).forEach(function (ck) { certChips += '<button class="sfqc-fchip' + (fbFilterCert === ck ? ' on' : '') + '" data-fbcert="' + esc(ck) + '">' + esc(ck) + '</button>'; });
    var catChips = '<button class="sfqc-fchip' + (fbFilterCat === 'all' ? ' on' : '') + '" data-fbcat="all">すべて</button>';
    Object.keys(catSet).forEach(function (ck) { catChips += '<button class="sfqc-fchip' + (fbFilterCat === ck ? ' on' : '') + '" data-fbcat="' + esc(ck) + '">' + esc(fbCatLabel(ck)) + '</button>'; });
    var bar = '<div class="sfqc-toolbar sfqc-toolbar2"><span class="sfqc-sort-label">資格:</span>' + certChips +
      '<span class="sfqc-sort-label">種類:</span>' + catChips +
      '<span class="sfqc-count">' + list.length + ' / ' + all.length + '件</span></div>';

    var items = list.map(function (r) {
      var fb = r.fb;
      var idx = adminFeedback.indexOf(r);
      var qref = fb.qid ? ('Q' + esc(String(fb.qid))) : '（全般）';
      return '<div class="sfqc-fb-item">' +
        '<div class="sfqc-fb-top">' +
          '<span class="sfqc-fb-cat">' + esc(fbCatLabel(fb.cat)) + '</span>' +
          '<span class="sfqc-fb-meta">' + esc(fmtDate(fb.ts)) + ' ・ 👤' + esc(r.name || '?') + ' ・ ' + esc(fb.cert || '-') + ' ' + qref + '</span>' +
          '<button class="sfqc-fb-done" data-fi="' + idx + '">対応済み（削除）</button>' +
        '</div>' +
        '<div class="sfqc-fb-msg">' + esc(fb.msg || '') + '</div>' +
        (fb.qtext ? '<div class="sfqc-fb-qx">問題: ' + esc(fb.qtext) + '</div>' : '') +
        (fb.ref ? '<div class="sfqc-fb-ref"><a href="' + esc(fb.ref) + '" target="_blank" rel="noopener">参照リンク</a></div>' : '') +
        '</div>';
    }).join('');
    return head + bar + '<div class="sfqc-fb-list">' + (items || '<div class="sfqc-empty">条件に合う報告がありません。</div>') + '</div><div class="sfqc-divider"></div>';
  }
  function adminResolveFeedback(fi) {
    if (!isAdmin || !db) return;
    var r = adminFeedback[fi]; if (!r) return;
    if (!confirm('この報告を「対応済み」にして削除します。よろしいですか？\n（報告者のデータから取り除かれます）')) return;
    var FV = firebase.firestore.FieldValue;
    db.collection(COLLECTION).doc(r.uid).update('feedback', FV.arrayRemove(r.fb))
      .then(function () { toastSafe('対応済みにしました'); loadAdmin(); })
      .catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }
  function feedbackRows() {
    return adminFeedback.map(function (r) {
      var fb = r.fb;
      return { date: fmtDate(fb.ts), ts: fb.ts || 0, name: r.name || '', uid: r.uid, email: r.email || '',
               cert: fb.cert || '', qid: fb.qid || '', category: fb.cat || '', message: fb.msg || '',
               question: fb.qtext || '', ref: fb.ref || '', ver: fb.ver || '', ua: fb.ua || '', url: fb.url || '' };
    });
  }
  function dlBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportFeedbackJson() {
    if (!adminFeedback.length) { alert('書き出すデータがありません。'); return; }
    var blob = new Blob([JSON.stringify(feedbackRows(), null, 2)], { type: 'application/json;charset=utf-8;' });
    dlBlob(blob, 'sfquiz-feedback-' + new Date().toISOString().slice(0, 10) + '.json');
  }
  function exportFeedbackCsv() {
    if (!adminFeedback.length) { alert('書き出すデータがありません。'); return; }
    var head = ['日時', '名前', 'UID', '資格', '問題ID', '種類', '内容', '問題文', '参照', '版', 'UA', 'URL'];
    var lines = [head.join(',')];
    feedbackRows().forEach(function (r) {
      var row = [r.date, r.name, r.uid, r.cert, r.qid, r.category, r.message, r.question, r.ref, r.ver, r.ua, r.url];
      lines.push(row.map(function (x) { var v = String(x == null ? '' : x); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    dlBlob(blob, 'sfquiz-feedback-' + new Date().toISOString().slice(0, 10) + '.csv');
  }

  function exportCsv() {
    if (!adminRows.length) { alert('書き出すデータがありません。'); return; }
    var head = [
      'ID', 'メール', 'UID', '資格', '最終更新',
      '解答済み問題', '総回答回数', '正解', '不正解', '正答率(%)', '連続正解',
      '間違いキュー', '自信なし正解', '★ブックマーク',
      '試験挑戦', '試験最高(%)', '試験合格', '直近試験',
      'SRS総数', 'SRS期限到来',
      '用語習得', '用語学習中', '用語総数',
      '教科書読了', '教科書しおり', 'メモ数',
      '学習日数', '最終学習日', '受験予定日', '日次目標'
    ];
    var lines = [head.join(',')];
    adminUsers.forEach(function (u) {
      u.certs.forEach(function (c) {
        var s = c.stats;
        var row = [
          u.name, u.email || '', u.uid, c.cert, fmtDate(u.updated),
          s.answered, s.attempts, s.correct, s.wrong, s.rate, s.streak,
          s.wrongCur, s.lowConf, s.bookmarks,
          s.examCount, s.examBest, s.examPassed, s.examLastTs ? fmtDate(s.examLastTs) : '',
          s.srsTotal, s.srsDue,
          s.vocab, s.vocabLearning, s.vocabTotal,
          s.tbmDone, s.tbmBm, s.notes,
          s.daysActive, s.lastStudyDate, s.examDate, s.goal
        ];
        lines.push(row.map(function (x) { var v = String(x == null ? '' : x); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','));
      });
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'sfquiz_accounts_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- 初期化 ---------------- */
  function init() {
    // 役割の決定: 明示指定（SFQ_PAGE_ROLE）を優先。無ければストアアダプタ有無で自動判定。
    ROLE = window.SFQ_PAGE_ROLE || (window.__setStore ? 'client' : 'gateway');
    HOME_URL = window.SFQ_HOME_URL || 'index.html';

    buildUI();

    // マイページ（エンジン側）がアカウント情報・操作を取得するための橋渡し。
    window.__sfqAccount = function () {
      var h = location.hostname, loc = (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '');
      return { loggedIn: !!currentUser, name: currentName || '', email: currentEmail || '', isAdmin: !!isAdmin,
               status: (elStatus ? elStatus.textContent : '') || '', configured: configOk(), local: loc };
    };
    window.__sfqLogout = function () { doLogout(); };
    window.__sfqOpenAdmin = function () { openAdmin(); };

    // ローカル開発環境（localhost / 127.0.0.1 / file://）では、ログイン/同期を一切要求しない。
    // Firebase の HTTP リファラー制限で localhost からは認証できないため、ローカル保存のみで素通しする。
    // 本番（cfn0eft.github.io）はこの分岐に入らないので影響なし。
    var _h = location.hostname;
    if (_h === 'localhost' || _h === '127.0.0.1' || _h === '::1' || _h === '') {
      hideOverlay();
      try { console.info('[cloud-sync] ローカル環境のためログイン/同期をスキップ（ローカル保存のみ）'); } catch (e) {}
      return;
    }

    // Firebase 未設定/未読込のときは、サイト全体をロックしない（特に gateway）。
    // ログインできない状態で必須ゲートにすると締め出しになるため、同期なしで通す。
    if (!configOk()) {
      hideOverlay();
      try { console.warn('[cloud-sync] Firebaseの設定が未完了です。「Firebaseセットアップ手順.md」を参照してください。'); } catch (e) {}
      return;
    }
    if (!window.firebase || !firebase.initializeApp) {
      hideOverlay();
      try { console.warn('[cloud-sync] Firebase SDK を読み込めませんでした。ネット接続を確認してください。'); } catch (e) {}
      return;
    }
    try {
      firebase.initializeApp(CFG);
      auth = firebase.auth();
      db = firebase.firestore();
    } catch (e) {
      hideOverlay();
      try { console.warn('[cloud-sync] Firebaseの初期化に失敗しました。', e); } catch (e2) {}
      return;
    }

    // gateway は認証復元中もログイン画面で覆う（必須ゲート）。
    // client は復元前にオーバーレイを出さない（ログイン済みで遷移してきた時のチラつき防止）。
    if (ROLE !== 'client') showOverlay();

    auth.onAuthStateChanged(function (user) {
      if (user) {
        onLogin(user);
      } else {
        currentUser = null; isAdmin = false;
        setBadge(''); setStatus(''); showAdminBtn(false); closeAdmin();
        showOverlay(); // gateway=ログインフォーム / client=ホーム誘導カード
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
