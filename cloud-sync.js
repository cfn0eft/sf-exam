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

  /* 管理者→利用者メッセージ（お知らせポップ＋チャット）の状態 */
  var BROADCAST_COL = 'broadcast';       // 一斉お知らせの共有コレクション（doc 'current'）
  var ownDocUnsub = null, broadcastUnsub = null, adminChatUnsub = null;
  var lastBroadcasts = [], lastNotices = [], lastChat = [], lastRead = {}, ownLoaded = false;
  var chatOpen = false, chatUid = '', chatName = '', chatMode = 'user'; // 'user'|'admin'
  var MAINT_DOC = 'maintenance';   // broadcast/maintenance（共有・管理者のみ書込）
  var maintUnsub = null, maintTimer = null, maintBoundaryTimer = null, lastMaint = null; // メンテナンス設定
  var composeCtx = null;           // 作成モーダルの文脈 {mode,uid,name}
  var adminBroadcasts = [];        // 管理者ビュー用：一斉お知らせレコード一覧 [{id,...}]
  var adminColUnsub = null, adminRenderTimer = null; // 管理者ビューのライブ購読（DM未読バッジ等の即時反映）
  var hbTimer = null, hbVisHandler = null;          // 在席ハートビート（lastSeen 更新）
  var ONLINE_MS = 120000;                            // この時間以内に lastSeen があれば「オンライン」とみなす

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
      '.sfqc-mini.sfqc-danger{background:#fee2e2;color:#b91c1c}body.dark .sfqc-mini.sfqc-danger{background:#7f1d1d;color:#fecaca}' +
      '.sfqc-mini.close{background:#e2e8f0;color:#475569}' +
      '.sfqc-adminbody{flex:1;overflow:auto;padding:14px 18px}' +
      '.sfqc-acc{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px;overflow:hidden}' +
      '.sfqc-acc-head{display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap}' +
      '.sfqc-acc-name{font-weight:700;font-size:15px}' +
      '.sfqc-acc-id{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:90px}' +
      '.sfqc-acc-id .sfqc-acc-access{margin-left:0}' +
      '.sfqc-acc-email-line{font-size:12px;color:#64748b;word-break:break-all}' +
      'body.dark .sfqc-acc-email-line{color:#94a3b8}' +
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
      '.sfqc-dash-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;overflow-x:auto;-webkit-overflow-scrolling:touch}' +
      '.sfqc-itbl{min-width:520px}' +
      '.sfqc-qhist{overflow-x:auto}.sfqc-qhist table{min-width:520px;width:100%;border-collapse:collapse;font-size:12px}' +
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
      /* ダークテーマ：管理パネル全体を暗色で統一 */
      'body.dark .sfqc-adminwrap{background:#0f172a;color:#e2e8f0}' +
      'body.dark .sfqc-adminhead{background:#1e293b;border-color:#334155}' +
      'body.dark .sfqc-adminhead h2{color:#f1f5f9}' +
      'body.dark .sfqc-acc{background:#1e293b;border-color:#334155}' +
      'body.dark .sfqc-acc-name{color:#f1f5f9}' +
      'body.dark .sfqc-acc-stats{color:#94a3b8}body.dark .sfqc-acc-stats b{color:#e2e8f0}' +
      'body.dark .sfqc-kpi{background:#1e293b;border-color:#334155}body.dark .sfqc-kpi .n{color:#f1f5f9}' +
      'body.dark .sfqc-dash-card{background:#1e293b;border-color:#334155}' +
      'body.dark .sfqc-itbl th{color:#94a3b8}body.dark .sfqc-itbl th,body.dark .sfqc-itbl td{border-color:#334155}body.dark .sfqc-itbl .qx{color:#cbd5e1}' +
      'body.dark .sfqc-fchip{background:#1e293b;color:#cbd5e1;border-color:#334155}' +
      'body.dark .sfqc-detail{border-color:#334155}' +
      'body.dark .sfqc-meta{color:#94a3b8}' +
      'body.dark .sfqc-mini.close{background:#334155;color:#cbd5e1}' +
      'body.dark .sfqc-sec{color:#94a3b8}' +
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
      '.sfqc-fb-open{display:inline-block;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:7px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none}' +
      'body.dark .sfqc-fb-open{background:#1e3a5f;border-color:#1e40af;color:#bfdbfe}' +
      '.sfqc-fb-reply{font-size:12px;margin-top:6px;background:#ecfeff;border:1px solid #a5f3fc;color:#0e7490;border-radius:7px;padding:6px 9px;white-space:pre-wrap;word-break:break-word}' +
      '.sfqc-fb-replyrow{margin-top:5px}' +
      'body.dark .sfqc-fb-reply{background:#083344;border-color:#155e75;color:#a5f3fc}' +
      /* 申請の一括操作バー */
      '.sfqc-app-bulk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}' +
      '.sfqc-app-selall{font-size:12px;color:#475569;display:inline-flex;align-items:center;gap:5px;cursor:pointer}' +
      '.sfqc-app-check{display:inline-flex;align-items:center;margin-right:4px}' +
      'body.dark .sfqc-app-selall{color:#cbd5e1}' +
      /* 日別アクティブの棒グラフ */
      '.sfqc-ts{display:flex;align-items:flex-end;gap:2px;height:90px;padding:4px 0}' +
      '.sfqc-ts-col{flex:1;min-width:4px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}' +
      '.sfqc-ts-bar{width:80%;background:#3b82f6;border-radius:2px 2px 0 0;min-height:2px}' +
      '.sfqc-ts-x{font-size:8px;color:#94a3b8;margin-top:2px;white-space:nowrap}' +
      '.sfqc-ts-col{cursor:pointer}.sfqc-ts-col:hover .sfqc-ts-bar,.sfqc-ts-col:focus .sfqc-ts-bar{background:#1d4ed8;outline:none}' +
      '.sfqc-ts-readout{font-size:12px;color:#334155;margin-top:6px;font-weight:700;min-height:1.4em}' +
      'body.dark .sfqc-ts-bar{background:#60a5fa}body.dark .sfqc-ts-readout{color:#cbd5e1}' +
      /* 操作ログ */
      '.sfqc-log-list{display:flex;flex-direction:column;gap:4px;max-height:300px;overflow:auto}' +
      '.sfqc-log-item{display:flex;gap:8px;font-size:11px;align-items:baseline;border-bottom:1px solid #f1f5f9;padding:3px 0}' +
      '.sfqc-log-ts{color:#94a3b8;white-space:nowrap}' +
      '.sfqc-log-act{font-weight:800;color:#7c3aed;white-space:nowrap}' +
      '.sfqc-log-detail{color:#475569;word-break:break-word}' +
      'body.dark .sfqc-log-item{border-color:#1e293b}body.dark .sfqc-log-act{color:#c4b5fd}body.dark .sfqc-log-detail{color:#cbd5e1}' +
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
      /* 管理者からの返信モーダル(#7) */
      '#sfqc-replies{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.7);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '.sfqc-rep-card{text-align:left;width:min(92vw,420px)}' +
      '.sfqc-rep-list{display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow:auto;margin-top:6px}' +
      '.sfqc-rep-item{background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:9px 11px}' +
      '.sfqc-rep-ts{font-size:11px;color:#0891b2;margin-bottom:3px}' +
      '.sfqc-rep-msg{font-size:13.5px;color:#0e4a5b;white-space:pre-wrap;word-break:break-word;line-height:1.55}' +
      'body.dark .sfqc-rep-item{background:#083344;border-color:#155e75}body.dark .sfqc-rep-msg{color:#cffafe}body.dark .sfqc-rep-ts{color:#67e8f9}' +
      /* 管理者→利用者メッセージ：お知らせポップ＋チャット */
      '#sfqc-chat-fab{position:fixed;right:16px;bottom:calc(var(--tab,0px) + 14px);z-index:99990;display:none;width:54px;height:54px;border:none;border-radius:50%;background:#6366f1;color:#fff;font-size:24px;cursor:pointer;box-shadow:0 8px 24px rgba(79,70,229,.45);font-family:inherit}' +
      '#sfqc-chat-fab.show{display:flex;align-items:center;justify-content:center}' +
      '#sfqc-chat-fab:hover{filter:brightness(1.08)}' +
      '#sfqc-chat-fab .sfqc-chat-badge{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}' +
      '#sfqc-chat-fab.has-unread .sfqc-chat-badge{display:flex}' +
      '#sfqc-chat{position:fixed;right:16px;bottom:calc(var(--tab,0px) + 14px);z-index:100001;display:none;width:min(94vw,360px);height:min(72vh,520px);background:#fff;color:#1e293b;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif}' +
      '#sfqc-chat.show{display:flex}' +
      '.sfqc-chat-head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:#6366f1;color:#fff;font-weight:700;font-size:14px}' +
      '.sfqc-chat-head .sfqc-chat-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sfqc-chat-head button{background:rgba(255,255,255,.2);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:15px}' +
      '.sfqc-chat-msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f1f5f9}' +
      '.sfqc-chat-empty{margin:auto;color:#94a3b8;font-size:12.5px;text-align:center;line-height:1.6}' +
      '.sfqc-chat-b{max-width:80%;padding:8px 11px;border-radius:13px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}' +
      '.sfqc-chat-b .sfqc-chat-t{display:block;font-size:10px;opacity:.6;margin-top:3px}' +
      '.sfqc-chat-b.mine{align-self:flex-end;background:#6366f1;color:#fff;border-bottom-right-radius:4px}' +
      '.sfqc-chat-b.theirs{align-self:flex-start;background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-bottom-left-radius:4px}' +
      '.sfqc-chat-input{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff}' +
      '.sfqc-chat-input textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:13px;font-family:inherit;max-height:84px;color:#1e293b;background:#fff}' +
      '.sfqc-chat-input button{border:none;background:#6366f1;color:#fff;border-radius:10px;padding:0 14px;font-weight:700;cursor:pointer;font-size:13px}' +
      '.sfqc-chat-input button:disabled{opacity:.5;cursor:default}' +
      'body.dark #sfqc-chat{background:#1e293b;color:#e2e8f0}' +
      'body.dark .sfqc-chat-msgs{background:#0f172a}' +
      'body.dark .sfqc-chat-b.theirs{background:#1e293b;color:#e2e8f0;border-color:#334155}' +
      'body.dark .sfqc-chat-input{background:#1e293b;border-color:#334155}' +
      'body.dark .sfqc-chat-input textarea{background:#0f172a;color:#e2e8f0;border-color:#334155}' +
      /* 作成モーダル（お知らせの本文＋予約日時）／メンテナンス編集 */
      '#sfqc-compose{position:fixed;inset:0;z-index:100003;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.7);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;padding:14px}' +
      '#sfqc-compose.show{display:flex}' +
      '.sfqc-cmp-card{width:min(94vw,460px);max-height:90vh;overflow:auto;background:#fff;color:#1e293b;border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:left}' +
      '.sfqc-cmp-card h3{margin:0 0 10px;font-size:16px}' +
      '.sfqc-cmp-card label{display:block;font-size:12px;font-weight:700;color:#475569;margin:12px 0 4px}' +
      '.sfqc-cmp-card textarea,.sfqc-cmp-card input,.sfqc-cmp-card select{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:8px 10px;font-size:13px;font-family:inherit;color:#1e293b;background:#fff;box-sizing:border-box}' +
      '.sfqc-cmp-card textarea{min-height:92px;resize:vertical}' +
      '.sfqc-cmp-row{display:flex;gap:8px;margin-top:16px}' +
      '.sfqc-cmp-row .sfqc-btn{flex:1}' +
      '.sfqc-cmp-hint{font-size:11px;color:#64748b;margin:4px 0 0}' +
      '.sfqc-cmp-dows{display:flex;gap:4px;flex-wrap:wrap}' +
      '.sfqc-cmp-dow{flex:0 0 auto;border:1px solid #cbd5e1;border-radius:8px;padding:6px 9px;font-size:12px;cursor:pointer;background:#fff;color:#475569}' +
      '.sfqc-cmp-dow.on{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.sfqc-cmp-win{display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 9px;margin-top:6px}' +
      '.sfqc-cmp-win button{margin-left:auto;border:none;background:#fee2e2;color:#b91c1c;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer}' +
      'body.dark .sfqc-cmp-card{background:#1e293b;color:#e2e8f0}body.dark .sfqc-cmp-card textarea,body.dark .sfqc-cmp-card input,body.dark .sfqc-cmp-card select{background:#0f172a;color:#e2e8f0;border-color:#334155}body.dark .sfqc-cmp-card label{color:#cbd5e1}body.dark .sfqc-cmp-win{background:#0f172a;border-color:#334155}' +
      /* 既読/未読チップ（DM一覧） */
      '.sfqc-read{font-size:10px;font-weight:800;border-radius:999px;padding:1px 7px;white-space:nowrap}' +
      '.sfqc-read.yes{background:#dcfce7;color:#15803d}' +
      '.sfqc-read.no{background:#fee2e2;color:#b91c1c}' +
      'body.dark .sfqc-read.yes{background:#14532d;color:#bbf7d0}body.dark .sfqc-read.no{background:#7f1d1d;color:#fecaca}' +
      /* 一斉お知らせの状態カード（メッセージタブ） */
      '.sfqc-bc-card{background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 14px;margin-bottom:12px}' +
      '.sfqc-bc-card .sfqc-bc-msg{font-size:13px;color:#1e293b;white-space:pre-wrap;word-break:break-word;margin:4px 0 8px}' +
      '.sfqc-bc-card .sfqc-bc-meta{font-size:11.5px;color:#475569;display:flex;gap:12px;flex-wrap:wrap;align-items:center}' +
      'body.dark .sfqc-bc-card{background:#312e81;border-color:#4f46e5}body.dark .sfqc-bc-card .sfqc-bc-msg{color:#e2e8f0}body.dark .sfqc-bc-card .sfqc-bc-meta{color:#c7d2fe}' +
      /* 既読者・未読者の一覧（一斉お知らせ） */
      '.sfqc-rd{margin-top:8px}' +
      '.sfqc-rd > summary{cursor:pointer;font-size:12px;font-weight:700;color:#4338ca}' +
      '.sfqc-rd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}' +
      '.sfqc-rd-h{font-size:11px;font-weight:800;color:#64748b;margin-bottom:4px}' +
      '.sfqc-rd-row{font-size:12px;color:#1e293b;padding:2px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
      '.sfqc-rd-t{font-size:10px;color:#94a3b8}' +
      '.sfqc-rd-none{color:#94a3b8}' +
      'body.dark .sfqc-rd > summary{color:#c7d2fe}body.dark .sfqc-rd-row{color:#e2e8f0}' +
      '@media(max-width:560px){.sfqc-rd-grid{grid-template-columns:1fr}}' +
      /* オンライン在席チップ（「承認済み」緑と区別するため別色＋点滅ドット） */
      '.sfqc-online{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:6px;white-space:nowrap;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe}' +
      '.sfqc-online-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:sfqc-pulse 1.8s infinite}' +
      '@keyframes sfqc-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      'body.dark .sfqc-online{background:#312e81;color:#c7d2fe;border-color:#4f46e5}' +
      /* ログイン履歴の行 */
      '.sfqc-login-hist{margin-top:6px;display:flex;flex-direction:column;gap:4px}' +
      '.sfqc-login-row{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px}' +
      '.sfqc-login-no{font-size:10px;font-weight:800;color:#94a3b8;min-width:16px;text-align:right}' +
      '.sfqc-login-latest{margin-left:auto;font-size:10px;font-weight:800;color:#15803d;background:#dcfce7;border-radius:999px;padding:1px 7px}' +
      'body.dark .sfqc-login-row{background:#0f172a;border-color:#334155;color:#cbd5e1}body.dark .sfqc-login-latest{background:#14532d;color:#bbf7d0}' +
      /* メンテナンス：全画面ロック＋予告バナー */
      '#sfqc-maint{position:fixed;inset:0;z-index:100004;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.92);backdrop-filter:blur(4px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;padding:16px}' +
      '#sfqc-maint.show{display:flex}' +
      '#sfqc-maint .sfqc-card{text-align:center}' +
      '#sfqc-maint-banner{position:fixed;left:0;right:0;top:0;z-index:99980;display:none;background:#b45309;color:#fff;font-size:12.5px;font-weight:700;text-align:center;padding:8px 12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2)}' +
      '#sfqc-maint-banner.show{display:block}' +
      '.sfqc-act-chat{background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe}' +
      '.sfqc-act-notice{background:#fef3c7;color:#92400e;border:1px solid #fde68a}' +
      '.sfqc-act-chat.has-unread{background:#6366f1;color:#fff;border-color:#6366f1}' +
      /* 管理者ビュー：タブ（ダッシュボード／ユーザー／メッセージの分離） */
      '.sfqc-tabs{display:flex;gap:6px;margin:0 0 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}' +
      '.sfqc-tab{flex:0 0 auto;border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:999px;padding:8px 15px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;position:relative}' +
      '.sfqc-tab.on{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.sfqc-tab-badge{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;vertical-align:middle}' +
      'body.dark .sfqc-tab{background:#1e293b;color:#cbd5e1;border-color:#334155}' +
      /* 管理者ビュー：DM一覧（メッセージタブ） */
      '.sfqc-dm{display:flex;align-items:center;gap:10px;justify-content:space-between;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:8px}' +
      '.sfqc-dm.unread{border-color:#c7d2fe;background:#f5f7ff}' +
      '.sfqc-dm-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1}' +
      '.sfqc-dm-name{font-weight:700;font-size:14px;white-space:nowrap;color:#0f172a;flex:0 0 auto}' +
      '.sfqc-dm-badge{flex:0 0 auto;min-width:18px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;text-align:center}' +
      '.sfqc-dm-prev{color:#64748b;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}' +
      '.sfqc-dm-act{display:flex;align-items:center;gap:6px;flex:0 0 auto}' +
      '.sfqc-dm-act button{border:none;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}' +
      '.sfqc-dm-time{font-size:10px;color:#94a3b8;white-space:nowrap}' +
      /* 管理者ビュー：スマホ最適化 */
      '@media(max-width:560px){' +
        '.sfqc-adminwrap{inset:6px;border-radius:12px}' +
        '.sfqc-adminhead{padding:9px 11px;gap:6px}' +
        '.sfqc-adminhead h2{font-size:14px;flex:1 0 100%;min-width:0}' +
        '.sfqc-adminhead .sfqc-tag{order:3}' +
        '.sfqc-mini{padding:6px 10px;font-size:11.5px}' +
        '.sfqc-adminbody{padding:10px 11px}' +
        '.sfqc-acc-head{flex-direction:column;align-items:stretch;gap:8px}' +
        '.sfqc-acc-stats{gap:4px 12px;font-size:11.5px}' +
        '.sfqc-acc-actions{flex-wrap:wrap}' +
        '.sfqc-acc-actions button{flex:1 1 auto}' +
        '.sfqc-kpis{grid-template-columns:repeat(2,1fr)}' +
        '.sfqc-tab{padding:7px 12px;font-size:12px}' +
        '.sfqc-toolbar{padding:8px 10px}' +
        '.sfqc-dm{flex-wrap:wrap}' +
        '.sfqc-dm-time{display:none}' +
        '.sfqc-acc-stats span{white-space:nowrap}' +
      '}' +
      /* 管理者ビュー：アカウントのアクセス状態チップ＋承認/停止ボタン */
      '.sfqc-acc-access{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:6px;white-space:nowrap}' +
      '.sfqc-acc-access.ok{background:#dcfce7;color:#15803d}' +
      '.sfqc-acc-access.pend{background:#fef9c3;color:#854d0e}' +
      '.sfqc-acc-access.block{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-act-approve{background:#dcfce7;color:#15803d}' +
      '.sfqc-act-block{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-act-reject{background:#fef3c7;color:#92400e}' +
      /* 新規申請・承認待ちセクション */
      '.sfqc-app-list{display:flex;flex-direction:column;gap:8px;margin-bottom:4px}' +
      '.sfqc-app-item{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:10px;padding:10px 12px}' +
      '.sfqc-app-item.is-block{border-left-color:#ef4444}' +
      '.sfqc-app-info{flex:1;min-width:160px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
      '.sfqc-app-name{font-weight:800;font-size:14px}' +
      '.sfqc-app-actions{display:flex;gap:6px}' +
      '.sfqc-app-actions button{border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:800;cursor:pointer}' +
      'body.dark .sfqc-app-item{background:#1e293b;border-color:#334155}' +
      /* 申請通知ドット（バッジ）＋管理者ビューボタンの件数 */
      '#sfqc-badge-dot{display:none;width:9px;height:9px;border-radius:50%;background:#ef4444;margin-left:3px;box-shadow:0 0 0 2px #fff;vertical-align:middle}' +
      '#sfqc-admin-btn.has-pending{color:#b45309}' +
      '.sfqc-admin-badge{display:inline-block;background:#ef4444;color:#fff;font-size:10px;font-weight:800;border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}' +
      /* アカウント一覧をコンパクトに（情報過多で改行が重なる問題の解消） */
      '.sfqc-acc-head{gap:10px}' +
      '.sfqc-acc-stats{gap:6px 12px;font-size:11.5px}' +
      '.sfqc-del-doc{margin:6px 0 10px;background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:800;cursor:pointer}';
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
      '<button id="sfqc-badge-toggle" type="button"><span id="sfqc-name">👤</span><span class="sfqc-caret">▾</span><span id="sfqc-badge-dot"></span></button>' +
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
          '<button class="sfqc-mini" id="sfqc-adm-broadcast">📢 一斉お知らせ</button>' +
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
        '<p class="sfqc-hint">⚠️ サーバーの関係で、管理・制限を行う場合があります。<br>詳しくは管理者にお尋ねください。</p>' +
      '</div>';
    document.body.appendChild(elLock);

    // チャット：起動ボタン（💬）＋パネル（承認済みの一般利用者にのみ表示）
    var fab = document.createElement('button');
    fab.id = 'sfqc-chat-fab'; fab.type = 'button';
    fab.innerHTML = '💬<span class="sfqc-chat-badge" id="sfqc-chat-badge"></span>';
    document.body.appendChild(fab);
    var chat = document.createElement('div');
    chat.id = 'sfqc-chat';
    chat.innerHTML =
      '<div class="sfqc-chat-head">' +
        '<span class="sfqc-chat-title" id="sfqc-chat-title">管理者とのチャット</span>' +
        '<button type="button" id="sfqc-chat-close" title="閉じる">✕</button>' +
      '</div>' +
      '<div class="sfqc-chat-msgs" id="sfqc-chat-msgs"></div>' +
      '<div class="sfqc-chat-input">' +
        '<textarea id="sfqc-chat-text" rows="1" maxlength="1000" placeholder="メッセージを入力…"></textarea>' +
        '<button type="button" id="sfqc-chat-send">送信</button>' +
      '</div>';
    document.body.appendChild(chat);
    fab.addEventListener('click', function () { openChat(currentUser ? currentUser.uid : '', currentName, 'user'); });
    document.getElementById('sfqc-chat-close').addEventListener('click', closeChat);
    document.getElementById('sfqc-chat-send').addEventListener('click', sendChat);
    document.getElementById('sfqc-chat-text').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });

    // 作成モーダル（お知らせ作成＋予約 / メンテナンス編集を兼用）
    var compose = document.createElement('div');
    compose.id = 'sfqc-compose';
    compose.innerHTML = '<div class="sfqc-cmp-card" id="sfqc-cmp-card"></div>';
    compose.addEventListener('click', function (e) { if (e.target === compose) closeCompose(); });
    document.body.appendChild(compose);

    // メンテナンス：全画面ロック＋予告バナー（管理者は対象外）
    var maint = document.createElement('div');
    maint.id = 'sfqc-maint';
    maint.innerHTML =
      '<div class="sfqc-card">' +
        '<p class="sfqc-title">🛠 メンテナンス中</p>' +
        '<p class="sfqc-sub" id="sfqc-maint-msg"></p>' +
        '<p class="sfqc-sub" id="sfqc-maint-end" style="font-weight:700;color:#b45309"></p>' +
        '<button class="sfqc-btn sfqc-btn-primary" id="sfqc-maint-reload" style="width:100%">再確認</button>' +
        '<div class="sfqc-row" style="margin-top:8px">' +
          '<button class="sfqc-btn sfqc-btn-ghost" id="sfqc-maint-logout" style="width:100%">ログアウト（管理者で入り直す）</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(maint);
    document.getElementById('sfqc-maint-reload').addEventListener('click', checkMaintenance);
    document.getElementById('sfqc-maint-logout').addEventListener('click', doLogout);
    var mBanner = document.createElement('div');
    mBanner.id = 'sfqc-maint-banner';
    document.body.appendChild(mBanner);
    window.addEventListener('resize', function () { if (!isAdmin && lastMaint) checkMaintenance(); });

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
    document.getElementById('sfqc-adm-broadcast').addEventListener('click', function () { openCompose({ mode: 'broadcast' }); });
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
    showChatFab(false); // 未承認/停止中はチャットを出さない
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
  // 承認待ち件数をバッジ（赤ドット）と管理者ビューボタンに反映
  function setAdminPending(n) {
    adminPendingCount = n || 0;
    if (elAdminBtn) {
      elAdminBtn.innerHTML = '👑 管理者ビュー' + (adminPendingCount > 0 ? '<span class="sfqc-admin-badge">申請 ' + adminPendingCount + '</span>' : '');
      elAdminBtn.classList[adminPendingCount > 0 ? 'add' : 'remove']('has-pending');
    }
    var dot = document.getElementById('sfqc-badge-dot');
    if (dot) dot.style.display = (adminPendingCount > 0 && isAdmin) ? 'inline-block' : 'none';
  }
  // 管理者ログイン時に承認待ち（access==='pending'）の件数を数えてバッジ表示する
  function refreshAdminPending() {
    if (!isAdmin || !db) return;
    db.collection(COLLECTION).get().then(function (snap) {
      var n = 0;
      snap.forEach(function (d) {
        if (currentUser && d.id === currentUser.uid) return; // 管理者自身は除外
        var data = d.data() || {};
        // 通知は「実際に申請ボタンを押した人（req あり）かつ未承認」だけを数える
        if ((data.access || 'pending') !== 'approved' && data.req && data.req.ts) n++;
      });
      setAdminPending(n);
    }).catch(function () {});
  }
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

    // 試験履歴。合否は e.pass（真偽）で判定する。
    // ※ e.ok は「正解数（整数）」なので合格数の判定には使わない（1問でも正解だと真になってしまう）。
    // 「本番形式（フル）」= 問題数が examN の模試のみ。合格率の母数はこれに揃える
    //   （ユーザー向け推移グラフ examTrendHTML の (e.n||EXAM_N)===EXAM_N と同義）。
    var FULL_N = (window.CERT_CONFIG && CERT_CONFIG.examN) || 60;
    var exams = store.exams || [], examCount = exams.length;
    var examBest = 0, examPassed = 0, examLastTs = 0, examFull = 0, examFullPassed = 0;
    exams.forEach(function (e) {
      if ((e.pct || 0) > examBest) examBest = e.pct;
      if (e.pass) examPassed++;
      if ((e.n || FULL_N) === FULL_N) { examFull++; if (e.pass) examFullPassed++; }
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
      examFull: examFull, examFullPassed: examFullPassed,
      examDate: store.examDate || '', goal: store.goal || 0,
      daysActive: daysActive, lastStudyDate: lastStudyDate,
      studySec: (store.time && typeof store.time.tot === 'number') ? store.time.tot : 0   // 学習時間（秒）#18
    };
  }
  // 学習時間の表示用フォーマット（秒→「Xh Ym」/「Ym」/「Xs」）
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec < 60) return sec + '秒';
    var m = Math.round(sec / 60);
    if (m < 60) return m + '分';
    var h = Math.floor(m / 60), mm = m % 60;
    return h + '時間' + (mm ? mm + '分' : '');
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
    stopUserMessaging();
    stopPresence();
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
      if (isAdmin) refreshAdminPending(); // 管理者は承認待ち件数を通知バッジに反映
      // 承認済みをローカルにも控える（オフライン時の再ログイン用。承認取消時は上で消える）
      try { localStorage.setItem('sfq_access_' + user.uid, 'approved'); } catch (e) {}
      recordLogin(user.uid, data);     // ログイン日時を記録（履歴つき）
      startPresence(user.uid);         // 在席ハートビート開始（管理者が「現在オンライン」を確認できる）
      if (!isAdmin) startUserMessaging(user.uid); // お知らせ＋チャットのリアルタイム購読を開始

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
      surfaceReplies(data.fbReplies);   // 管理者からの未読の返信があれば通知(#7)
      syncNewsSeen(data);               // アップデートのお知らせ既読をクラウドと同期（再表示防止）
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

  // 管理者からの返信(#7)を本人に通知。未読（localStorage の既読 ts より新しい）だけモーダル表示。
  function surfaceReplies(fbReplies) {
    try {
      if (!fbReplies || typeof fbReplies !== 'object') return;
      var seen = {};
      try { seen = JSON.parse(localStorage.getItem('sfq_fbreply_seen') || '{}') || {}; } catch (e) { seen = {}; }
      var fresh = [];
      Object.keys(fbReplies).forEach(function (fid) {
        var rep = fbReplies[fid]; if (!rep || !rep.msg) return;
        if (!seen[fid] || seen[fid] < (rep.ts || 0)) fresh.push({ msg: rep.msg, ts: rep.ts || 0 });
      });
      if (!fresh.length) return;
      fresh.sort(function (a, b) { return b.ts - a.ts; });
      showRepliesModal(fresh, fbReplies);
    } catch (e) {}
  }
  function showRepliesModal(fresh, allReplies) {
    var old = document.getElementById('sfqc-replies'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div'); wrap.id = 'sfqc-replies';
    var rows = fresh.map(function (r) {
      return '<div class="sfqc-rep-item"><div class="sfqc-rep-ts">' + esc(fmtDate(r.ts)) + '</div><div class="sfqc-rep-msg">' + esc(r.msg) + '</div></div>';
    }).join('');
    wrap.innerHTML = '<div class="sfqc-card sfqc-rep-card">' +
        '<p class="sfqc-title">📩 管理者からの返信</p>' +
        '<p class="sfqc-sub">あなたが送ったフィードバックへの返信が届きました。</p>' +
        '<div class="sfqc-rep-list">' + rows + '</div>' +
        '<button class="sfqc-btn sfqc-btn-primary" id="sfqc-rep-ok" style="width:100%;margin-top:10px">確認しました</button>' +
      '</div>';
    document.body.appendChild(wrap);
    var onKey;
    var dismiss = function () {
      try {
        var s = {};
        Object.keys(allReplies).forEach(function (fid) { var rep = allReplies[fid]; if (rep) s[fid] = rep.ts || Date.now(); });
        localStorage.setItem('sfq_fbreply_seen', JSON.stringify(s));
      } catch (e) {}
      document.removeEventListener('keydown', onKey);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } };
    document.addEventListener('keydown', onKey);
    var ok = document.getElementById('sfqc-rep-ok');
    if (ok) { ok.addEventListener('click', dismiss); try { ok.focus(); } catch (e) {} }
  }

  // アップデートのお知らせ（changelog）既読をクラウドと同期。localStorage が消えても再表示しない。
  // newsSeen は changelog 先頭 id（'YYYY-MM-DD' 等）。文字列比較で新しい方を採用。
  function syncNewsSeen(data) {
    try {
      var cloud = (data && data.newsSeen) || '';
      var local = localStorage.getItem('sfq_news_seen') || '';
      var newest = (cloud > local) ? cloud : local;
      if (newest && newest !== local) { try { localStorage.setItem('sfq_news_seen', newest); } catch (e) {} }
      if (local && local > cloud && currentUser && db) { db.collection(COLLECTION).doc(currentUser.uid).set({ newsSeen: local }, { merge: true }).catch(function () {}); }
      if (window.SFQ_syncNews) { try { window.SFQ_syncNews(); } catch (e) {} } // ベル/バナーを再描画
    } catch (e) {}
  }
  // 利用者が「お知らせ」を開いたら既読 id をクラウドへ保存（エンジン/LP から呼ぶ）
  window.__cloudMarkNews = function (id) {
    if (!id || !currentUser || !db) return;
    db.collection(COLLECTION).doc(currentUser.uid).set({ newsSeen: id }, { merge: true }).catch(function () {});
  };

  /* ===================================================================
     管理者 → 利用者メッセージ（① お知らせポップ：一斉＋個別 ／ ② チャット）
     ・一斉お知らせ … 共有 doc `broadcast/current` を全員が購読（要 Firestore ルール）
     ・個別お知らせ … 各利用者 doc の `notices[]`（管理者が追記、本人にポップ）
     ・チャット     … 各利用者 doc の `chat[]`（本人・管理者が双方向に追記、realtime）
     利用者側は自 doc を onSnapshot で購読し、未読を検知してポップ／バッジ表示する。
     =================================================================== */

  // 承認済みの一般利用者がログインしたら、リアルタイム購読とチャットUIを開始
  function startUserMessaging(uid) {
    if (!db || !uid || isAdmin) return;
    ownLoaded = false; // 既読マップを読み込むまでポップを抑止（読込のたびに出る不具合の防止）
    showChatFab(true);
    // 自分の doc を購読（notices / chat の更新を即時反映）
    if (ownDocUnsub) { ownDocUnsub(); ownDocUnsub = null; }
    ownDocUnsub = db.collection(COLLECTION).doc(uid).onSnapshot(function (snap) {
      if (snap.metadata && snap.metadata.hasPendingWrites) return; // 自分の書込は無視（ちらつき防止）
      var d = (snap.exists && snap.data()) || {};
      lastNotices = Array.isArray(d.notices) ? d.notices : [];
      lastChat = Array.isArray(d.chat) ? d.chat : [];
      lastRead = (d.read && typeof d.read === 'object') ? d.read : {};
      ownLoaded = true; // 既読マップ取得済み
      surfaceNotices();
      refreshChatBadge();
      if (chatOpen && chatMode === 'user') renderChatMsgs();
    }, function () {});
    // 一斉お知らせ（レコード）＋メンテナンス設定を broadcast コレクションでまとめて購読
    if (broadcastUnsub) { broadcastUnsub(); broadcastUnsub = null; }
    broadcastUnsub = db.collection(BROADCAST_COL).onSnapshot(function (snap) {
      var arr = [];
      snap.forEach(function (d) {
        if (d.id === MAINT_DOC) { lastMaint = d.data() || null; return; }
        if (d.id === 'current') return; // 旧・単一お知らせは無視（レコード化済み）
        var x = d.data() || {}; if (!x.msg) return; x.id = d.id; arr.push(x);
      });
      lastBroadcasts = arr;
      surfaceNotices();
      checkMaintenance();
    }, function () {});
    if (maintTimer) clearInterval(maintTimer);
    maintTimer = setInterval(checkMaintenance, 30000);
  }
  function stopUserMessaging() {
    if (ownDocUnsub) { ownDocUnsub(); ownDocUnsub = null; }
    if (broadcastUnsub) { broadcastUnsub(); broadcastUnsub = null; }
    if (adminChatUnsub) { adminChatUnsub(); adminChatUnsub = null; }
    if (maintUnsub) { maintUnsub(); maintUnsub = null; }
    if (maintTimer) { clearInterval(maintTimer); maintTimer = null; }
    if (maintBoundaryTimer) { clearTimeout(maintBoundaryTimer); maintBoundaryTimer = null; }
    lastBroadcasts = []; lastNotices = []; lastChat = []; lastRead = {}; lastMaint = null; ownLoaded = false;
    chatOpen = false; closeChat(); showChatFab(false);
    var mo = document.getElementById('sfqc-maint'); if (mo) mo.classList.remove('show');
    var mb = document.getElementById('sfqc-maint-banner'); if (mb) mb.classList.remove('show');
    applyBannerOffset(0);
  }

  function showChatFab(on) {
    var fab = document.getElementById('sfqc-chat-fab');
    if (fab) fab.classList[on ? 'add' : 'remove']('show');
  }

  // お知らせの未読判定（配信時刻を過ぎ、かつ最終改訂(rev)より後に既読していない）
  function annDue(x, now) { return (x.publishAt || x.ts || 0) <= now; }
  function annUnread(x, map) { return ((map && map[x.id]) || 0) < (x.rev || x.ts || 0); }
  // 未読のお知らせ（一斉＋個別）をまとめて1つのモーダルでポップ
  function surfaceNotices() {
    try {
      if (!ownLoaded) return; // 既読マップ未取得のうちはポップしない（読込ごとの再表示を防止）
      if (document.getElementById('sfqc-replies')) return; // 既にポップ表示中
      var now = Date.now();
      var bcm = (lastRead && lastRead.bcm) || {}, ntm = (lastRead && lastRead.ntm) || {};
      var items = [];
      lastBroadcasts.forEach(function (b) {
        if (b && b.msg && annDue(b, now) && annUnread(b, bcm)) items.push({ kind: 'bc', id: b.id, title: '📢 お知らせ', msg: b.msg, ts: b.ts || 0, rev: b.rev || b.ts || 0 });
      });
      (lastNotices || []).forEach(function (n) {
        var nid = n && (n.id || ('n' + (n.ts || 0)));
        if (n && n.msg && annDue(n, now) && annUnread({ id: nid, rev: n.rev || n.ts || 0 }, ntm)) items.push({ kind: 'notice', id: nid, title: '📩 あなたへのお知らせ', msg: n.msg, ts: n.ts || 0, rev: n.rev || n.ts || 0 });
      });
      if (!items.length) return;
      items.sort(function (a, b) { return b.ts - a.ts; });
      showNoticeModal(items);
    } catch (e) {}
  }
  function showNoticeModal(items) {
    var old = document.getElementById('sfqc-replies'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div'); wrap.id = 'sfqc-replies';
    var rows = items.map(function (r) {
      return '<div class="sfqc-rep-item"><div class="sfqc-rep-ts">' + esc(r.title) + '・' + esc(fmtDate(r.ts)) + '</div><div class="sfqc-rep-msg">' + esc(r.msg) + '</div></div>';
    }).join('');
    wrap.innerHTML = '<div class="sfqc-card sfqc-rep-card">' +
        '<p class="sfqc-title">📢 管理者からのお知らせ</p>' +
        '<p class="sfqc-sub">新しいお知らせが届きました。</p>' +
        '<div class="sfqc-rep-list">' + rows + '</div>' +
        '<button class="sfqc-btn sfqc-btn-primary" id="sfqc-rep-ok" style="width:100%;margin-top:10px">確認しました</button>' +
      '</div>';
    document.body.appendChild(wrap);
    var onKey;
    var dismiss = function () {
      var now = Date.now(), bcm = {}, ntm = {};
      items.forEach(function (r) { if (r.kind === 'bc') bcm[r.id] = now; else ntm[r.id] = now; });
      writeRead({ bcm: bcm, ntm: ntm }); // 既読をクラウドへ記録（管理者が可視化）
      document.removeEventListener('keydown', onKey);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } };
    document.addEventListener('keydown', onKey);
    var ok = document.getElementById('sfqc-rep-ok');
    if (ok) { ok.addEventListener('click', dismiss); try { ok.focus(); } catch (e) {} }
  }

  // チャットの未読件数（利用者側＝管理者からの未読、管理者側＝利用者からの未読）
  function chatUnreadCount(msgs, mode, uid) {
    var seen;
    if (mode === 'admin') seen = num(localStorage.getItem('sfq_chat_seen_adm_' + uid));
    // 利用者側はクラウド既読(read.chat)も参照（localStorage が消えても再表示しない）
    else seen = Math.max(num(localStorage.getItem(uidKey('sfq_chat_seen'))), (lastRead && lastRead.chat) || 0);
    var fromSide = (mode === 'admin') ? 'user' : 'admin';
    var n = 0;
    (msgs || []).forEach(function (m) { if (m && m.from === fromSide && (m.ts || 0) > seen) n++; });
    return n;
  }
  function markChatSeen(msgs, mode, uid) {
    try {
      var key = (mode === 'admin') ? ('sfq_chat_seen_adm_' + uid) : uidKey('sfq_chat_seen');
      var max = num(localStorage.getItem(key));
      (msgs || []).forEach(function (m) { if (m && (m.ts || 0) > max) max = m.ts; });
      localStorage.setItem(key, String(max));
      if (mode === 'user') writeRead({ chat: max }); // 利用者が読んだら既読を記録
    } catch (e) {}
  }
  // 既読を自 doc の read{bcm:{id:ts}, ntm:{id:ts}, chat:ts} に記録（管理者ビューで集計表示）。
  function writeRead(patch) {
    if (!db || !currentUser || isAdmin) return;
    var cur = lastRead || {}, out = {}, changed = false;
    // 一斉/個別お知らせ：レコードIDごとの既読マップ
    ['bcm', 'ntm'].forEach(function (mk) {
      if (!patch[mk]) return;
      var curMap = (cur[mk] && typeof cur[mk] === 'object') ? cur[mk] : {};
      var outMap = {};
      Object.keys(patch[mk]).forEach(function (id) {
        var v = patch[mk][id] || 0; if (v && v > (curMap[id] || 0)) { outMap[id] = v; curMap[id] = v; }
      });
      if (Object.keys(outMap).length) { out[mk] = outMap; cur[mk] = curMap; changed = true; }
    });
    // チャット：高水位（数値）
    if (patch.chat && patch.chat > (cur.chat || 0)) { out.chat = patch.chat; cur.chat = patch.chat; changed = true; }
    if (!changed) return;
    lastRead = cur;
    db.collection(COLLECTION).doc(currentUser.uid).set({ read: out }, { merge: true }).catch(function () {});
  }
  function refreshChatBadge() {
    var fab = document.getElementById('sfqc-chat-fab');
    var badge = document.getElementById('sfqc-chat-badge');
    if (!fab || !badge) return;
    var n = chatUnreadCount(lastChat, 'user', '');
    badge.textContent = n > 99 ? '99+' : String(n);
    fab.classList[n > 0 ? 'add' : 'remove']('has-unread');
  }

  // チャットパネルを開く（mode='user' は本人、'admin' は管理者が特定利用者と）
  function openChat(uid, name, mode) {
    if (!uid) return;
    chatOpen = true; chatUid = uid; chatName = name || ''; chatMode = mode || 'user';
    var panel = document.getElementById('sfqc-chat');
    var title = document.getElementById('sfqc-chat-title');
    if (title) title.textContent = (mode === 'admin') ? ('💬 ' + (name || '利用者')) : '管理者とのチャット';
    if (panel) panel.classList.add('show');
    if (mode === 'admin') {
      // 管理者：対象利用者の doc を購読
      if (adminChatUnsub) { adminChatUnsub(); adminChatUnsub = null; }
      var msgsEl = document.getElementById('sfqc-chat-msgs');
      if (msgsEl) msgsEl.innerHTML = '<div class="sfqc-chat-empty">読み込み中…</div>';
      adminChatUnsub = db.collection(COLLECTION).doc(uid).onSnapshot(function (snap) {
        var d = (snap.exists && snap.data()) || {};
        lastChat = Array.isArray(d.chat) ? d.chat : [];
        renderChatMsgs();
      }, function () {});
    } else {
      renderChatMsgs();
    }
    var ta = document.getElementById('sfqc-chat-text'); if (ta) try { ta.focus(); } catch (e) {}
  }
  function closeChat() {
    chatOpen = false;
    var panel = document.getElementById('sfqc-chat'); if (panel) panel.classList.remove('show');
    if (adminChatUnsub) { adminChatUnsub(); adminChatUnsub = null; }
    if (chatMode === 'admin' && typeof renderAdmin === 'function' && elAdmin && elAdmin.classList.contains('show')) {
      // 既読を反映してバッジ更新
      renderAdmin();
    }
    chatMode = 'user';
  }
  function renderChatMsgs() {
    var el = document.getElementById('sfqc-chat-msgs'); if (!el) return;
    var msgs = (lastChat || []).slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    if (!msgs.length) {
      el.innerHTML = '<div class="sfqc-chat-empty">まだメッセージはありません。<br>' +
        (chatMode === 'admin' ? 'この利用者へメッセージを送れます。' : 'ご質問・ご要望をお送りください。') + '</div>';
    } else {
      var mineSide = (chatMode === 'admin') ? 'admin' : 'user';
      el.innerHTML = msgs.map(function (m) {
        var mine = (m.from === mineSide);
        var who = (m.from === 'admin') ? '管理者' : (m.from === 'user' ? (chatMode === 'admin' ? (chatName || '利用者') : 'あなた') : '');
        return '<div class="sfqc-chat-b ' + (mine ? 'mine' : 'theirs') + '">' + esc(m.msg || '') +
          '<span class="sfqc-chat-t">' + esc(who) + '・' + esc(fmtDate(m.ts)) + '</span></div>';
      }).join('');
    }
    el.scrollTop = el.scrollHeight;
    markChatSeen(lastChat, chatMode, chatUid);
    if (chatMode === 'user') refreshChatBadge();
  }
  function sendChat() {
    var ta = document.getElementById('sfqc-chat-text'); if (!ta) return;
    var msg = (ta.value || '').trim(); if (!msg || !db || !chatUid) return;
    var from = (chatMode === 'admin') ? 'admin' : 'user';
    var rec = { from: from, msg: msg.slice(0, 1000), ts: Date.now(), by: currentName || from };
    var FV = firebase.firestore.FieldValue;
    ta.value = '';
    // 楽観的に即描画
    lastChat = (lastChat || []).concat([rec]); renderChatMsgs();
    var ref = db.collection(COLLECTION).doc(chatUid);
    ref.update('chat', FV.arrayUnion(rec)).catch(function () {
      return ref.set({ chat: [rec] }, { merge: true });
    }).then(function () {
      if (chatMode === 'admin') { try { logAdmin('チャット', (chatName || '') + '：' + rec.msg.slice(0, 20)); } catch (e) {} }
    }).catch(function (e) { alert('送信に失敗しました: ' + (e && e.message)); });
  }

  // datetime-local 値（'YYYY-MM-DDTHH:MM'）⇔ ms
  function msToLocalInput(ms) {
    if (!ms) return '';
    var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function localInputToMs(v) { if (!v) return 0; var t = new Date(v).getTime(); return isFinite(t) ? t : 0; }

  // 作成モーダルを開く（新規/編集 兼用）。
  //   broadcast: openCompose({mode:'broadcast', id?, msg?, publishAt?})
  //   notice   : openCompose({mode:'notice', uid?, name?, id?, msg?, publishAt?})  uid 未指定なら宛先セレクトを表示
  function openCompose(ctx) {
    composeCtx = ctx || {};
    var mode = composeCtx.mode, editing = !!composeCtx.id;
    var card = document.getElementById('sfqc-cmp-card');
    var heading = (mode === 'broadcast') ? (editing ? '📢 全体お知らせを編集' : '📢 全体へお知らせ')
      : (editing ? '📩 個別お知らせを編集' : '📩 個別お知らせ');
    var recipientSel = '';
    if (mode === 'notice' && composeCtx.uids) {
      recipientSel = '<p class="sfqc-cmp-hint">宛先：選択中の <b>' + composeCtx.uids.length + '</b> 人へ一括送信</p>';
    } else if (mode === 'notice' && !composeCtx.uid) {
      var opts = annAudience().slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ja'); })
        .map(function (u) { return '<option value="' + esc(u.uid) + '">' + esc(u.name) + (u.email ? '（' + esc(u.email) + '）' : '') + '</option>'; }).join('');
      recipientSel = '<label>宛先</label><select id="sfqc-cmp-to"><option value="">— 選択 —</option>' + opts + '</select>';
    } else if (mode === 'notice') {
      recipientSel = '<p class="sfqc-cmp-hint">宛先：' + esc(composeCtx.name || '利用者') + '</p>';
    }
    card.innerHTML =
      '<h3>' + esc(heading) + '</h3>' + recipientSel +
      '<label>本文</label>' +
      '<textarea id="sfqc-cmp-text" maxlength="2000" placeholder="お知らせの内容…">' + esc(composeCtx.msg || '') + '</textarea>' +
      '<label>予約配信（空欄なら今すぐ）</label>' +
      '<input type="datetime-local" id="sfqc-cmp-when" value="' + esc((composeCtx.publishAt && composeCtx.publishAt > Date.now()) ? msToLocalInput(composeCtx.publishAt) : '') + '">' +
      '<p class="sfqc-cmp-hint">指定日時以降に利用者の画面へポップ表示されます。編集すると未読に戻り、再度表示されます。</p>' +
      '<div class="sfqc-cmp-row">' +
        '<button class="sfqc-btn sfqc-btn-ghost" id="sfqc-cmp-cancel">キャンセル</button>' +
        '<button class="sfqc-btn sfqc-btn-primary" id="sfqc-cmp-send">' + (editing ? '保存' : '送信') + '</button>' +
      '</div>';
    document.getElementById('sfqc-cmp-cancel').addEventListener('click', closeCompose);
    document.getElementById('sfqc-cmp-send').addEventListener('click', submitCompose);
    document.getElementById('sfqc-compose').classList.add('show');
    var t = document.getElementById('sfqc-cmp-text'); if (t) try { t.focus(); } catch (e) {}
  }
  function closeCompose() { var c = document.getElementById('sfqc-compose'); if (c) c.classList.remove('show'); composeCtx = null; }
  function submitCompose() {
    if (!composeCtx || !db) return;
    var msg = (document.getElementById('sfqc-cmp-text').value || '').trim();
    if (!msg) { alert('本文を入力してください。'); return; }
    var when = localInputToMs(document.getElementById('sfqc-cmp-when').value);
    var now = Date.now();
    var publishAt = (when && when > now) ? when : now;
    var scheduled = publishAt > now + 1000;
    msg = msg.slice(0, 2000);
    var done = function (label) {
      toastSafe(label); closeCompose(); if (elAdmin && elAdmin.classList.contains('show')) renderAdmin();
    };
    var fail = function (e) { alert('保存に失敗しました（Firestoreルールで broadcast を許可してください）: ' + (e && e.message)); };
    if (composeCtx.mode === 'broadcast') {
      var col = db.collection(BROADCAST_COL);
      var rec = { msg: msg, publishAt: publishAt, rev: now, by: currentName || 'admin' };
      var p;
      if (composeCtx.id) { p = col.doc(composeCtx.id).set(rec, { merge: true }); }
      else { rec.ts = now; p = col.add(rec); }
      p.then(function () { logAdmin(composeCtx.id ? '一斉お知らせ編集' : '一斉お知らせ', (scheduled ? '[予約] ' : '') + msg.slice(0, 26)); loadBroadcasts(function () { done(composeCtx && composeCtx.id ? '保存しました' : (scheduled ? '予約しました' : '送信しました')); }); }).catch(fail);
    } else if (composeCtx.uids) {
      // 一括個別お知らせ：選択した各ユーザーの notices に追記
      var rec3 = function () { return { id: 'n' + Date.now() + Math.floor(Math.random() * 100000), msg: msg, ts: now, rev: now, publishAt: publishAt, by: currentName || 'admin' }; };
      Promise.all(composeCtx.uids.map(function (uid) {
        var uu = findUser(uid); var arr2 = (uu && Array.isArray(uu.notices)) ? uu.notices.slice() : []; var r = rec3(); arr2.push(r);
        return db.collection(COLLECTION).doc(uid).set({ notices: arr2 }, { merge: true }).then(function () { if (uu) uu.notices = arr2; return true; }).catch(function () { return false; });
      })).then(function (res) {
        var n = res.filter(Boolean).length; adminSelUsers = {};
        logAdmin('一括個別お知らせ', n + '人：' + msg.slice(0, 14));
        done(scheduled ? (n + '人へ予約しました') : (n + '人へ送信しました'));
      }).catch(function (e) { alert('送信に失敗しました: ' + (e && e.message)); });
    } else {
      var uid = composeCtx.uid || (document.getElementById('sfqc-cmp-to') && document.getElementById('sfqc-cmp-to').value);
      if (!uid) { alert('宛先を選択してください。'); return; }
      var u = findUser(uid);
      var arr = (u && Array.isArray(u.notices)) ? u.notices.slice() : [];
      if (composeCtx.id) {
        var hit = false;
        arr = arr.map(function (n) { var nid = n.id || ('n' + (n.ts || 0)); if (nid === composeCtx.id) { hit = true; return { id: nid, msg: msg, ts: n.ts || now, rev: now, publishAt: publishAt, by: currentName || 'admin' }; } return n; });
        if (!hit) arr.push({ id: composeCtx.id, msg: msg, ts: now, rev: now, publishAt: publishAt, by: currentName || 'admin' });
      } else {
        arr.push({ id: 'n' + now + Math.floor(Math.random() * 1000), msg: msg, ts: now, rev: now, publishAt: publishAt, by: currentName || 'admin' });
      }
      db.collection(COLLECTION).doc(uid).set({ notices: arr }, { merge: true }).then(function () {
        if (u) u.notices = arr;
        logAdmin(composeCtx.id ? '個別お知らせ編集' : '個別お知らせ', (u && u.name || '') + '：' + msg.slice(0, 16));
        done(composeCtx.id ? '保存しました' : (scheduled ? '予約しました' : '送信しました'));
      }).catch(function (e) { alert('保存に失敗しました: ' + (e && e.message)); });
    }
  }
  // 全体お知らせの編集/削除、個別お知らせの編集/削除
  function editBroadcast(id) { var b = adminBroadcasts.filter(function (x) { return x.id === id; })[0]; if (b) openCompose({ mode: 'broadcast', id: id, msg: b.msg, publishAt: b.publishAt }); }
  function deleteBroadcast(id) {
    if (!isAdmin || !db || !id) return;
    if (!confirm('この全体お知らせを削除します。よろしいですか？')) return;
    db.collection(BROADCAST_COL).doc(id).delete().then(function () { logAdmin('一斉お知らせ削除', id); loadBroadcasts(function () { toastSafe('削除しました'); if (elAdmin && elAdmin.classList.contains('show')) renderAdmin(); }); })
      .catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }
  function editNotice(uid, id) {
    var u = findUser(uid); if (!u) return;
    var n = (u.notices || []).filter(function (x) { return (x.id || ('n' + (x.ts || 0))) === id; })[0]; if (!n) return;
    openCompose({ mode: 'notice', uid: uid, name: u.name, id: id, msg: n.msg, publishAt: n.publishAt });
  }
  function deleteNotice(uid, id) {
    if (!isAdmin || !db || !uid) return;
    var u = findUser(uid); if (!u) return;
    if (!confirm('「' + (u.name || '') + '」さんへの個別お知らせを削除します。よろしいですか？')) return;
    var arr = (u.notices || []).filter(function (x) { return (x.id || ('n' + (x.ts || 0))) !== id; });
    db.collection(COLLECTION).doc(uid).set({ notices: arr }, { merge: true }).then(function () {
      u.notices = arr; logAdmin('個別お知らせ削除', (u.name || '') + '／' + id); toastSafe('削除しました'); if (elAdmin && elAdmin.classList.contains('show')) renderAdmin();
    }).catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }
  // 全体お知らせレコードを取得して adminBroadcasts に格納
  function loadBroadcasts(cb) {
    if (!db) { if (cb) cb(); return; }
    db.collection(BROADCAST_COL).get().then(function (snap) {
      var arr = [];
      snap.forEach(function (d) { if (d.id === MAINT_DOC || d.id === 'current') return; var x = d.data() || {}; if (!x.msg) return; x.id = d.id; arr.push(x); });
      adminBroadcasts = arr; if (cb) cb();
    }).catch(function () { if (cb) cb(); });
  }

  /* ---------------- メンテナンス（単発＋定期。期間中は非管理者を全画面ロック） ---------------- */
  // 設定 broadcast/maintenance:
  //   都度メンテ … queue:[{id,start,end,msg,tasks}]（各エントリが自分の番号・作業内容・メッセージを持つ。旧 windows も読む）
  //   定期メンテ … recurring:{enabled,dows:[0-6],start:'HH:MM',durMin,msg,tasks}（独立）
  //   共通       … msg,tasks（エントリ未指定時のフォールバック）・preMsg,preMin・fullStop（緊急全停止）・idDate,idSeq（採番）
  // 都度メンテのキューを取り出す（旧モデルの windows + enabled ゲートも吸収）
  function maintQueue(cfg) {
    if (!cfg) return [];
    if (Array.isArray(cfg.queue)) return cfg.queue;
    if (Array.isArray(cfg.windows)) return (cfg.enabled === false) ? [] : cfg.windows; // 旧モデル後方互換
    return [];
  }
  // 表示用の番号・メッセージ・作業内容を解決（エントリ固有 → 共通フォールバック）
  function maintEntryInfo(cfg, w) {
    var g = cfg || {};
    return {
      id: (w && w.id) || g.id || '',
      msg: (w && w.msg) || g.msg || '',
      tasks: (w && Array.isArray(w.tasks) && w.tasks.length) ? w.tasks : (Array.isArray(g.tasks) ? g.tasks : [])
    };
  }
  // 定期メンテの1回分（番号は発生日から MNT-YYYYMMDD-R を自動採番）
  function maintRecurInfo(cfg, occMs) {
    var r = (cfg && cfg.recurring) || {};
    return {
      id: r.id || ('MNT-' + maintDateStr(occMs) + '-R'),
      msg: r.msg || (cfg && cfg.msg) || '',
      tasks: (Array.isArray(r.tasks) && r.tasks.length) ? r.tasks : ((cfg && cfg.tasks) || [])
    };
  }
  // 現在がメンテ中か／直近の予定を判定して {active,end,upcoming,full,entry,upEntry} を返す
  function maintStatus(cfg, now) {
    var res = { active: false, end: 0, upcoming: 0, upEnd: 0, full: false, entry: null, upEntry: null };
    if (!cfg) return res;
    if (cfg.fullStop) { res.active = true; res.full = true; res.entry = maintEntryInfo(cfg, null); return res; } // 緊急全停止
    // 都度メンテ（キュー）
    maintQueue(cfg).forEach(function (w) {
      if (!w || !w.start || !w.end) return;
      if (now >= w.start && now < w.end) { res.active = true; if (w.end > res.end) { res.end = w.end; res.entry = maintEntryInfo(cfg, w); } }
      else if (w.start > now && (!res.upcoming || w.start < res.upcoming)) { res.upcoming = w.start; res.upEnd = w.end; res.upEntry = maintEntryInfo(cfg, w); }
    });
    // 定期メンテ（独立）
    var r = cfg.recurring;
    if (r && r.enabled && r.start && r.durMin && r.dows && r.dows.length) {
      var hm = r.start.split(':'); var hh = +hm[0] || 0, mm = +hm[1] || 0, dur = (+r.durMin || 0) * 60000;
      for (var off = -1; off <= 7; off++) {
        var d = new Date(now); d.setDate(d.getDate() + off); d.setHours(hh, mm, 0, 0);
        if (r.dows.indexOf(d.getDay()) < 0) continue;
        var s = d.getTime(), e = s + dur;
        if (now >= s && now < e) { res.active = true; if (e > res.end) { res.end = e; res.entry = maintRecurInfo(cfg, s); } }
        else if (s > now && (!res.upcoming || s < res.upcoming)) { res.upcoming = s; res.upEnd = e; res.upEntry = maintRecurInfo(cfg, s); }
      }
    }
    if (res.active && !res.entry) res.entry = maintEntryInfo(cfg, null);
    return res;
  }
  function dowLabel(n) { return ['日', '月', '火', '水', '木', '金', '土'][n] || ''; }
  // 作業内容テンプレート（テンプレ適用後に自由編集できる）
  var MAINT_TASK_TEMPLATES = [
    { label: '🔧 定期メンテ', tasks: ['データベースの最適化', 'サーバー構成の更新', 'セキュリティ更新の適用'] },
    { label: '🚀 機能リリース', tasks: ['新機能のリリース', 'データ移行と整合性チェック', 'リリース後の動作確認'] },
    { label: '🚨 緊急対応', tasks: ['緊急セキュリティパッチの適用', '障害原因の調査と復旧', '影響範囲の確認'] },
    { label: '🗄️ DB作業', tasks: ['データベースのバックアップ', 'インデックスの再構築', 'パフォーマンスの改善'] },
    { label: '🧹 クリア', tasks: [] }
  ];
  // 管理番号の自動採番：MNT-YYYYMMDD(JST)-NN（同じ日付で採番するたび連番を繰り上げ）
  function maintDateStr(ms) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).replace(/-/g, ''); }
    catch (e) { var d = new Date(ms); return '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  }
  // 新規キューエントリの管理番号を自動採番（基準日＝対象期間の開始日。同日採番で連番を繰り上げ）
  function maintAutoNumberEntry(baseMs) {
    var d = maintDraft; if (!d) return;
    var ds = maintDateStr(baseMs || Date.now());
    var seq = (d.idDate === ds) ? ((+d.idSeq || 0) + 1) : 1;
    d.idDate = ds; d.idSeq = seq;
    d.entry.id = 'MNT-' + ds + '-' + ('0' + seq).slice(-2);
  }
  var maintDraft = null;
  // 管理者：メンテナンス設定の概要（ダッシュボードタブ）
  function maintenanceSectionHTML() {
    var m = lastMaint, html = '<div class="sfqc-sec">🛠 メンテナンス</div><div class="sfqc-bc-card">';
    // 緊急全停止トグル（ボタンで即時ON/OFF＝全利用者をライブでロック。管理者は対象外）
    var full = !!(m && m.fullStop);
    html += '<div class="sfqc-bc-meta" style="margin-bottom:8px">' +
        '<button class="sfqc-mini" id="sfqc-fullstop" style="background:' + (full ? '#16a34a' : '#dc2626') + ';color:#fff">' + (full ? '✅ 全停止を解除' : '🚨 今すぐ全停止') + '</button>' +
        '<span style="font-weight:700;color:' + (full ? '#dc2626' : '#15803d') + '">' + (full ? '🔴 緊急全停止中（全利用者をロック）' : '🟢 通常稼働中') + '</span>' +
      '</div>';
    var nowMs = Date.now();
    var st = maintStatus(m, nowMs);
    // 現在の状態（アクティブ/次回予定の番号も表示）
    var status = (st.active && !st.full) ? ('🔴 メンテナンス中' + (st.entry && st.entry.id ? '（' + st.entry.id + '）' : '') + ' 終了予定 ' + fmtDate(st.end))
      : (st.upcoming ? ('🟡 次回予定 ' + fmtDate(st.upcoming) + (st.upEntry && st.upEntry.id ? '（' + st.upEntry.id + '）' : '')) : '🟢 直近の予定なし');
    html += '<div class="sfqc-bc-msg">' + esc(status) + '</div>';
    // 都度メンテ（キュー）と定期メンテは入力・管理を分ける（それぞれ専用ボタン）
    var future = maintQueue(m).filter(function (w) { return w && w.end > nowMs; });
    var rec = (m && m.recurring && m.recurring.enabled)
      ? '毎週 ' + (m.recurring.dows || []).map(dowLabel).join('・') + ' ' + esc(m.recurring.start) + 'から' + m.recurring.durMin + '分'
      : '無効';
    html += '<div class="sfqc-bc-meta"><span>🗓 都度メンテ：キュー <b>' + future.length + '</b> 件</span>' +
        '<button class="sfqc-mini" id="sfqc-maint-edit-queue">⚙️ 都度メンテを管理</button></div>' +
      '<div class="sfqc-bc-meta"><span>🔁 定期メンテ：' + esc(rec) + '</span>' +
        '<button class="sfqc-mini" id="sfqc-maint-edit-recur">⚙️ 定期メンテを管理</button></div>';
    return html + '</div>';
  }
  function toggleFullStop() {
    if (!isAdmin || !db) return;
    var on = !(lastMaint && lastMaint.fullStop);
    if (on && !confirm('🚨 緊急全停止を有効にします。\n全利用者の画面が今すぐロックされます（管理者は対象外）。\n解除も同じボタンから行えます。よろしいですか？')) return;
    db.collection(BROADCAST_COL).doc(MAINT_DOC).set({ fullStop: on, updated: Date.now(), by: currentName || 'admin' }, { merge: true })
      .then(function () {
        lastMaint = lastMaint || {}; lastMaint.fullStop = on;
        logAdmin('緊急全停止', on ? 'ON' : 'OFF'); toastSafe(on ? '緊急全停止を有効化しました' : '緊急全停止を解除しました');
        if (elAdmin && elAdmin.classList.contains('show')) renderAdmin();
      })
      .catch(function (e) { alert('変更に失敗しました（Firestoreルールで broadcast を許可してください）: ' + (e && e.message)); });
  }
  // 全体ドラフトを作る（都度／定期どちらの画面でも、未編集側を保全したまま保存できるよう全項目を持つ）
  function buildMaintDraft() {
    var m = lastMaint || {};
    maintDraft = {
      // 都度メンテのキュー（各エントリが自分の番号・作業内容・メッセージを持つ）
      queue: maintQueue(m).map(function (w) { return { id: w.id || '', start: w.start, end: w.end, msg: w.msg || '', tasks: Array.isArray(w.tasks) ? w.tasks.slice() : [] }; }),
      // 新規エントリ作成バッファ（期間は入力欄から）
      entry: { id: '', msg: '', tasks: [] },
      // 定期メンテ（独立・自分のメッセージ/作業内容を持つ）
      recurring: {
        enabled: !!(m.recurring && m.recurring.enabled),
        dows: (m.recurring && m.recurring.dows) ? m.recurring.dows.slice() : [],
        start: (m.recurring && m.recurring.start) || '02:00',
        durMin: (m.recurring && m.recurring.durMin) || 120,
        msg: (m.recurring && m.recurring.msg) || '',
        tasks: (m.recurring && Array.isArray(m.recurring.tasks)) ? m.recurring.tasks.slice() : []
      },
      // 共通（予告・フォールバック・採番カウンタ）
      preMsg: m.preMsg || '',
      preMin: (m.preMin != null) ? m.preMin : 60,
      msg: m.msg || '',
      tasks: Array.isArray(m.tasks) ? m.tasks.slice() : [],
      idDate: m.idDate || '',
      idSeq: +m.idSeq || 0
    };
  }
  // 都度メンテ（キュー）の入力・管理画面
  function openQueueEditor() {
    if (!isAdmin) return;
    buildMaintDraft(); maintDraft.mode = 'queue'; maintAutoNumberEntry();
    composeCtx = { mode: 'maint' };
    document.getElementById('sfqc-compose').classList.add('show');
    renderMaintEditor();
  }
  // 定期メンテの入力・管理画面
  function openRecurringEditor() {
    if (!isAdmin) return;
    buildMaintDraft(); maintDraft.mode = 'recurring';
    composeCtx = { mode: 'maint' };
    document.getElementById('sfqc-compose').classList.add('show');
    renderMaintEditor();
  }
  function maintTplBtns(tgt) { return MAINT_TASK_TEMPLATES.map(function (t, i) { return '<button class="sfqc-mini" type="button" data-tpl="' + tgt + ':' + i + '">' + esc(t.label) + '</button>'; }).join(''); }
  function maintSplitTasks(v) { return (v || '').split('\n').map(function (s) { return s.trim().slice(0, 80); }).filter(Boolean).slice(0, 8); }
  // テンプレ適用（q=新規エントリ / r=定期 / g=既定）。pull は各画面のものを渡す
  function bindMaintTpl(card, d, pull) {
    card.querySelectorAll('[data-tpl]').forEach(function (b) {
      b.addEventListener('click', function () {
        pull();
        var pr = b.getAttribute('data-tpl').split(':'), tgt = pr[0], t = MAINT_TASK_TEMPLATES[+pr[1]]; if (!t) return;
        var cur = tgt === 'q' ? d.entry.tasks : tgt === 'r' ? d.recurring.tasks : d.tasks;
        if (t.tasks.length && cur && cur.length && !confirm('現在の作業内容をテンプレート「' + t.label + '」で置き換えますか？')) return;
        var nv = t.tasks.slice();
        if (tgt === 'q') d.entry.tasks = nv; else if (tgt === 'r') d.recurring.tasks = nv; else d.tasks = nv;
        renderMaintEditor();
      });
    });
  }
  // 都度メンテ（キュー）と定期メンテで入力画面を分ける
  function renderMaintEditor() {
    var d = maintDraft; if (!d) return;
    if (d.mode === 'recurring') renderMaintRecurring(); else renderMaintQueue();
  }
  // ── 都度メンテ（キュー）の入力・管理 ──
  function renderMaintQueue() {
    var d = maintDraft; if (!d) return;
    var card = document.getElementById('sfqc-cmp-card');
    var qRows = d.queue.length ? d.queue.map(function (w, i) {
      return '<div class="sfqc-cmp-win"><span><b>' + esc(w.id || '(番号なし)') + '</b><br>' + esc(fmtDate(w.start)) + ' 〜 ' + esc(fmtDate(w.end)) + '</span><button data-rmq="' + i + '">削除</button></div>';
    }).join('') : '<p class="sfqc-cmp-hint">キューは空です。下のフォームから追加してください。</p>';
    card.innerHTML =
      '<h3>🗓 都度メンテ（キュー）</h3>' +
      '<p class="sfqc-cmp-hint">単発のメンテナンスを1件ずつ登録します。各件が自分の番号・作業内容・メッセージを持ちます。</p>' +
      qRows +
      '<div class="sfqc-sec" style="margin-top:10px">＋ キューに追加</div>' +
      '<label>対象期間</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
        '<input type="datetime-local" id="sfm-q-ws" style="flex:1;min-width:150px"><input type="datetime-local" id="sfm-q-we" style="flex:1;min-width:150px"></div>' +
      '<label>管理番号（自動採番・編集できます）</label>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<input type="text" id="sfm-q-id" value="' + esc(d.entry.id || '') + '" placeholder="MNT-YYYYMMDD-01" style="flex:1">' +
        '<button class="sfqc-mini" id="sfm-q-genid" type="button">🔄 自動採番</button></div>' +
      '<label>メッセージ（任意・空欄なら既定文を使用）</label>' +
      '<textarea id="sfm-q-msg" placeholder="このメンテナンス固有のメッセージ（空欄可）">' + esc(d.entry.msg || '') + '</textarea>' +
      '<label>作業内容（テンプレ適用後に編集できます）</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + maintTplBtns('q') + '</div>' +
      '<textarea id="sfm-q-tasks" placeholder="データベースの最適化&#10;サーバー構成の更新&#10;セキュリティ更新の適用">' + esc((d.entry.tasks || []).join('\n')) + '</textarea>' +
      '<button class="sfqc-btn sfqc-btn-primary" id="sfm-q-add" style="width:100%;margin-top:4px">＋ キューに追加</button>' +
      '<div class="sfqc-sec">⚙️ 共通（予告・既定）</div>' +
      '<label>予告バナーのメッセージ（開始前に表示・空欄なら日時のみ）</label>' +
      '<textarea id="sfm-premsg" placeholder="例）まもなくメンテナンスを開始します。キリの良いところで学習を終えてください。">' + esc(d.preMsg) + '</textarea>' +
      '<label>予告バナーを出す時間（分前・0で予告なし）</label><input type="number" id="sfm-pre" min="0" value="' + d.preMin + '">' +
      '<label>既定メッセージ（各メンテで未指定のとき）</label>' +
      '<textarea id="sfm-msg" placeholder="例）ただいまメンテナンスを実施しています。しばらくお待ちください。">' + esc(d.msg || '') + '</textarea>' +
      '<label>既定の作業内容（各メンテで未指定のとき）</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + maintTplBtns('g') + '</div>' +
      '<textarea id="sfm-g-tasks" placeholder="（既定の作業内容）">' + esc((d.tasks || []).join('\n')) + '</textarea>' +
      '<div class="sfqc-cmp-row"><button class="sfqc-btn sfqc-btn-ghost" id="sfm-cancel">閉じる</button><button class="sfqc-btn sfqc-btn-primary" id="sfm-save">保存</button></div>';
    var pull = function () {
      var g = function (id) { return document.getElementById(id); };
      if (g('sfm-q-id')) d.entry.id = (g('sfm-q-id').value || '').trim().slice(0, 40);
      if (g('sfm-q-msg')) d.entry.msg = g('sfm-q-msg').value;
      if (g('sfm-q-tasks')) d.entry.tasks = maintSplitTasks(g('sfm-q-tasks').value);
      if (g('sfm-premsg')) d.preMsg = g('sfm-premsg').value;
      if (g('sfm-pre')) d.preMin = +g('sfm-pre').value || 0;
      if (g('sfm-msg')) d.msg = g('sfm-msg').value;
      if (g('sfm-g-tasks')) d.tasks = maintSplitTasks(g('sfm-g-tasks').value);
    };
    card.querySelectorAll('[data-rmq]').forEach(function (b) {
      b.addEventListener('click', function () { pull(); d.queue.splice(+b.getAttribute('data-rmq'), 1); renderMaintEditor(); });
    });
    bindMaintTpl(card, d, pull);
    document.getElementById('sfm-q-genid').addEventListener('click', function () { pull(); maintAutoNumberEntry(localInputToMs(document.getElementById('sfm-q-ws').value) || Date.now()); renderMaintEditor(); });
    document.getElementById('sfm-q-add').addEventListener('click', function () {
      pull();
      var s = localInputToMs(document.getElementById('sfm-q-ws').value), e = localInputToMs(document.getElementById('sfm-q-we').value);
      if (!s || !e || e <= s) { alert('対象期間（開始・終了日時）を正しく指定してください。'); return; }
      var ds = maintDateStr(s), autoLike = /^MNT-\d{8}-\d{2}$/.test(d.entry.id || '');
      if (!d.entry.id || (autoLike && d.entry.id.indexOf('MNT-' + ds + '-') !== 0)) maintAutoNumberEntry(s); // 番号未指定/開始日と不一致の自動番号は開始日で採り直す
      d.queue.push({ id: d.entry.id || '', start: s, end: e, msg: d.entry.msg || '', tasks: (d.entry.tasks || []).slice() });
      d.queue.sort(function (a, b) { return a.start - b.start; });
      d.entry = { id: '', msg: '', tasks: [] }; maintAutoNumberEntry(s); // 次のエントリの番号を用意（同日なら連番）
      renderMaintEditor();
    });
    document.getElementById('sfm-cancel').addEventListener('click', closeCompose);
    document.getElementById('sfm-save').addEventListener('click', function () { pull(); saveMaint(); });
  }
  // ── 定期メンテの入力・管理 ──
  function renderMaintRecurring() {
    var d = maintDraft; if (!d) return;
    var card = document.getElementById('sfqc-cmp-card');
    var dowChips = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      return '<button class="sfqc-cmp-dow' + (d.recurring.dows.indexOf(i) >= 0 ? ' on' : '') + '" data-dow="' + i + '">' + dowLabel(i) + '</button>';
    }).join('');
    card.innerHTML =
      '<h3>🔁 定期メンテ</h3>' +
      '<p class="sfqc-cmp-hint">毎週くり返すメンテナンスです。番号は実施日から自動採番されます（MNT-YYYYMMDD-R）。</p>' +
      '<label><input type="checkbox" id="sfm-ren"' + (d.recurring.enabled ? ' checked' : '') + '> 定期メンテナンスを有効にする（毎週）</label>' +
      '<label>曜日</label><div class="sfqc-cmp-dows">' + dowChips + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<div style="flex:1"><label style="margin-top:0">開始時刻</label><input type="time" id="sfm-rstart" value="' + esc(d.recurring.start) + '"></div>' +
        '<div style="flex:1"><label style="margin-top:0">所要（分）</label><input type="number" id="sfm-rdur" min="5" value="' + d.recurring.durMin + '"></div></div>' +
      '<label>メッセージ（任意・空欄なら既定文を使用）</label>' +
      '<textarea id="sfm-r-msg" placeholder="定期メンテ固有のメッセージ（空欄可）">' + esc(d.recurring.msg || '') + '</textarea>' +
      '<label>作業内容（テンプレ適用後に編集できます）</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + maintTplBtns('r') + '</div>' +
      '<textarea id="sfm-r-tasks" placeholder="（定期メンテの作業内容）">' + esc((d.recurring.tasks || []).join('\n')) + '</textarea>' +
      '<div class="sfqc-cmp-row"><button class="sfqc-btn sfqc-btn-ghost" id="sfm-cancel">閉じる</button><button class="sfqc-btn sfqc-btn-primary" id="sfm-save">保存</button></div>';
    var pull = function () {
      var g = function (id) { return document.getElementById(id); };
      d.recurring.enabled = g('sfm-ren').checked;
      d.recurring.start = g('sfm-rstart').value || '02:00';
      d.recurring.durMin = +g('sfm-rdur').value || 120;
      if (g('sfm-r-msg')) d.recurring.msg = g('sfm-r-msg').value;
      if (g('sfm-r-tasks')) d.recurring.tasks = maintSplitTasks(g('sfm-r-tasks').value);
    };
    card.querySelectorAll('[data-dow]').forEach(function (b) {
      b.addEventListener('click', function () { pull(); var i = +b.getAttribute('data-dow'); var p = d.recurring.dows.indexOf(i); if (p >= 0) d.recurring.dows.splice(p, 1); else d.recurring.dows.push(i); renderMaintEditor(); });
    });
    bindMaintTpl(card, d, pull);
    document.getElementById('sfm-cancel').addEventListener('click', closeCompose);
    document.getElementById('sfm-save').addEventListener('click', function () { pull(); saveMaint(); });
  }
  function saveMaint() {
    var d = maintDraft; if (!d || !db) return;
    var rec = {
      // 都度メンテのキュー（各エントリが自分の番号・作業内容・メッセージを持つ）
      queue: (d.queue || []).map(function (w) { return { id: (w.id || '').slice(0, 40), start: w.start, end: w.end, msg: (w.msg || '').slice(0, 1000), tasks: Array.isArray(w.tasks) ? w.tasks.slice(0, 8) : [] }; }),
      // 定期メンテ（独立）
      recurring: { enabled: !!d.recurring.enabled, dows: d.recurring.dows || [], start: d.recurring.start || '02:00', durMin: +d.recurring.durMin || 120, msg: (d.recurring.msg || '').slice(0, 1000), tasks: Array.isArray(d.recurring.tasks) ? d.recurring.tasks.slice(0, 8) : [] },
      // 共通フォールバック・予告・採番カウンタ
      msg: (d.msg || '').slice(0, 1000), tasks: Array.isArray(d.tasks) ? d.tasks.slice(0, 8) : [],
      preMsg: (d.preMsg || '').slice(0, 1000), preMin: +d.preMin || 0,
      idDate: d.idDate || '', idSeq: +d.idSeq || 0,
      fullStop: !!(lastMaint && lastMaint.fullStop), // 緊急全停止はこの保存で消さない
      updated: Date.now(), by: currentName || 'admin'
    };
    db.collection(BROADCAST_COL).doc(MAINT_DOC).set(rec).then(function () {
      lastMaint = rec; logAdmin('メンテナンス設定', '都度' + rec.queue.length + '件/定期' + (rec.recurring.enabled ? 'ON' : 'OFF')); toastSafe('メンテナンス設定を保存しました');
      closeCompose(); if (elAdmin && elAdmin.classList.contains('show')) renderAdmin();
    }).catch(function (e) { alert('保存に失敗しました（Firestoreルールで broadcast を許可してください）: ' + (e && e.message)); });
  }
  // バナー表示中の重なり対策：本文・上部バー（sticky）・アカウントバッジ（fixed）を h ぶん下げる
  function applyBannerOffset(h) {
    document.body.style.paddingTop = h ? (h + 'px') : '';
    var tb = document.querySelector('.topbar'); if (tb) tb.style.top = h ? (h + 'px') : '';
    if (elBadge) elBadge.style.top = h ? (h + 9) + 'px' : '';
  }
  function checkMaintenance() {
    if (isAdmin) return; // 管理者は対象外
    var overlay = document.getElementById('sfqc-maint');
    var banner = document.getElementById('sfqc-maint-banner');
    if (!overlay || !banner) return;
    var now = Date.now();
    var st = maintStatus(lastMaint, now);
    var ent = st.entry || {};
    var msg = ent.msg || (lastMaint && lastMaint.msg) || 'ただいまメンテナンスを実施しています。しばらくお待ちください。';
    var preMsg = (lastMaint && lastMaint.preMsg) || '';
    var preMin = (lastMaint && lastMaint.preMin != null) ? lastMaint.preMin : 60;
    if (st.active) {
      // プレビュー合言葉を知っている端末はメンテ中でも素通り（中身の確認用）
      if (window.SFQ_hasPreview && window.SFQ_hasPreview()) {
        overlay.classList.remove('show'); banner.classList.remove('show'); applyBannerOffset(0);
        return;
      }
      // メンテ中：リッチな全画面メンテ画面 (maintenance.html) へ転送（管理者は冒頭で return 済み）。
      // 終了予定・メッセージ・緊急全停止かを sessionStorage で引き継ぐ。
      try { sessionStorage.setItem('sfq_maint', JSON.stringify({ msg: msg, end: st.end || 0, full: !!st.full, id: ent.id || '', tasks: (ent.tasks && ent.tasks.length ? ent.tasks : null), ts: now })); } catch (e) {}
      var maintUrl = (HOME_URL || 'index.html').replace(/index\.html(?:[?#].*)?$/, 'maintenance.html');
      location.replace(maintUrl);
      return;
    } else {
      overlay.classList.remove('show');
      if (st.upcoming && st.upcoming - now <= preMin * 60000) {
        banner.textContent = '🛠 ' + fmtDate(st.upcoming) + ' よりメンテナンス予定です' + (preMsg ? '（' + preMsg + '）' : '');
        banner.classList.add('show');
      } else { banner.classList.remove('show'); }
    }
    // 予告バナーは position:fixed。表示中はその高さぶん本文・上部バー・アカウントバッジを下げて重なり/クリック不能を防ぐ
    applyBannerOffset(banner.classList.contains('show') ? banner.offsetHeight : 0);
    // 次に状態が変わる「境界時刻」ちょうどに再判定する（タイマー＝ほぼリアルタイムで開始/終了を反映）
    if (maintBoundaryTimer) { clearTimeout(maintBoundaryTimer); maintBoundaryTimer = null; }
    var cands = [];
    if (st.active && st.end) cands.push(st.end);            // 期間終了→ロック解除
    if (st.upcoming) { cands.push(st.upcoming); cands.push(st.upcoming - preMin * 60000); } // 開始／予告開始
    var next = 0;
    cands.forEach(function (t) { if (t > now && (!next || t < next)) next = t; });
    if (next) {
      var delay = Math.min(next - now + 500, 21600000); // 最大6時間で再評価（タイマー上限対策）
      maintBoundaryTimer = setTimeout(checkMaintenance, Math.max(1000, delay));
    }
  }
  function num(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function uidKey(base) { return base + '_' + ((currentUser && currentUser.uid) || 'anon'); }

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
  var adminRows = [];   // adminUsers から都度導出する平坦化行（CSV/ダッシュボード用）
  var adminUsers = [];  // 単一の真実：uid単位 { uid, name, email, updated, access, req, certs:[{cert,store,stats}], agg }
  var adminFeedback = [];// フィードバック集約 [{uid,name,email,fb,reply}]（fbは各docの feedback 配列要素）
  var adminLogEntries = []; // 管理者の操作ログ（管理者自身の doc の adminLog を取り込む）#4
  var adminSelApps = {}; // 一括承認の選択状態 {uid:1} #8
  var adminSelUsers = {}; // ユーザータブの一括選択 {uid:1}（一括お知らせ/停止/リセット）
  var fbFilterCert = 'all', fbFilterCat = 'all', fbOnlyPending = false; // フィードバックの絞り込み（未対応＝未返信）
  var adminFilter = ''; // 名前/メール検索
  var adminSort = 'updated'; // 'updated'|'answered'|'rate'|'days'|'name'
  var adminCert = 'all';     // 資格フィルタ
  var adminActivity = 'all'; // 'all'|'week'|'dormant'
  var adminPass = false;     // 合格者のみ
  var adminAccess = 'all';   // 'all'|'approved'|'pending'|'blocked'（アクセス状態フィルタ）
  var adminPendingCount = 0; // 承認待ち件数（バッジ通知用）
  var adminTab = 'users';    // 管理者ビューのタブ：'users'|'dash'|'msg'（ダッシュボードとDMを分離）
  var dmFilter = '';         // メッセージタブの名前絞り込み
  var adminDashCert = '';    // 詳細集計（分野別・問題別）で表示中の資格。''=現在ページの資格 #2

  function admToday() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function admDaysAgo(s) { if (!s) return Infinity; try { var d = new Date(s + 'T00:00:00'); return Math.floor((Date.now() - d.getTime()) / 86400000); } catch (e) { return Infinity; } }

  // 全体ダッシュボード（KPI＋分野別＋問題別正答率）。問題別は折りたたみ。
  function adminDashboardHTML() {
    var total = adminUsers.length, today = admToday();
    var actToday = 0, actWeek = 0, sumAtt = 0, sumCorr = 0, sumExF = 0, sumExFP = 0, sumStudy = 0;
    adminUsers.forEach(function (u) {
      var a = u.agg; sumAtt += a.attempts; sumCorr += a.correct; sumExF += a.examFull; sumExFP += a.examFullPassed; sumStudy += a.studySec;
      if (a.lastStudyDate === today) actToday++;
      if (admDaysAgo(a.lastStudyDate) <= 6) actWeek++;
    });
    var avgRate = sumAtt ? Math.round(sumCorr / sumAtt * 100) : 0;
    // 合格率は「本番形式（フル）の模試」だけを母数にする（カスタム/短縮模試は除外＝ユーザー向け推移グラフと同義）
    var passRate = sumExF ? Math.round(sumExFP / sumExF * 100) : 0;
    var onlineNow = adminUsers.filter(isOnline).length;
    var kpi = function (n, l) { return '<div class="sfqc-kpi"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; };
    var html = '<div class="sfqc-sec">全体サマリー</div><div class="sfqc-kpis">' +
      kpi('🟢 ' + onlineNow, '現在オンライン') +
      kpi(total, '総ユーザー') + kpi(actToday, '今日のアクティブ') + kpi(actWeek, '今週のアクティブ') +
      kpi(avgRate + '%', '平均正答率') + kpi(sumAtt.toLocaleString(), '総解答数') + kpi(sumExF, '本番模試 受験') + kpi(passRate + '%', '本番合格率') +
      kpi(fmtDur(sumStudy), '総学習時間') +
      '</div>';

    html += timeSeriesHTML();   // 日別アクティブの推移

    // ---- 詳細集計（分野別・問題別）。資格を切り替えて全資格を1画面で点検できる(#2) ----
    var certSet = {}; adminRows.forEach(function (r) { if (r.cert && r.cert !== '—') certSet[r.cert] = 1; });
    var certKeys = Object.keys(certSet);
    var dcert = dashCert();   // 選択中の資格（既定＝現在ページの資格）
    var isCur = (dcert === CERT_KEY);
    var engineHere = (typeof QDATA !== 'undefined' && QDATA && QDATA.length && typeof domainOf === 'function');

    if (certKeys.length > 1) {
      var dchips = certKeys.map(function (ck) {
        return '<button class="sfqc-fchip' + (ck === dcert ? ' on' : '') + '" data-dashcert="' + esc(ck) + '">' + esc(ck) + '</button>';
      }).join('');
      html += '<div class="sfqc-toolbar sfqc-toolbar2"><span class="sfqc-sort-label">詳細集計の資格:</span>' + dchips + '</div>';
    }

    // 分野別（domainOf/DOMAIN_DEFS は現在ページの資格のものなので、現在資格を選んでいるときだけ表示）
    if (isCur && engineHere) {
      var domAgg = {};
      adminRows.forEach(function (r) {
        if (r.cert !== dcert) return;
        var hist = r.store.hist || {};
        Object.keys(hist).forEach(function (id) {
          var h = hist[id], t = (h.c || 0) + (h.w || 0); if (!t) return;
          var dc; try { dc = domainOf(+id); } catch (e) { dc = null; }
          if (dc) { var da = domAgg[dc] || (domAgg[dc] = { c: 0, t: 0, sec: 0 }); da.c += (h.c || 0); da.t += t; }
        });
        // 分野別の学習時間（store.time.dom[code].sec）も足し込む #18
        var tdom = (r.store.time && r.store.time.dom) || {};
        Object.keys(tdom).forEach(function (dc) {
          var sec = (tdom[dc] && tdom[dc].sec) || 0; if (!sec) return;
          var da = domAgg[dc] || (domAgg[dc] = { c: 0, t: 0, sec: 0 }); da.sec += sec;
        });
      });
      var defs = (typeof DOMAIN_DEFS !== 'undefined') ? DOMAIN_DEFS : [];
      var dbars = '';
      defs.forEach(function (d) {
        var a = domAgg[d.code]; if (!a || (!a.t && !a.sec)) return; var pc = a.t ? Math.round(a.c / a.t * 100) : 0;
        var col = pc >= 70 ? '#16a34a' : pc >= 50 ? '#d97706' : '#dc2626';
        var timeLabel = a.sec ? ' ・ ⏱ ' + esc(fmtDur(a.sec)) : '';
        dbars += '<div class="sfqc-dom"><span class="nm">' + esc(d.emoji + ' ' + d.name) + '</span><div class="bw"><div class="bf" style="width:' + pc + '%;background:' + col + '"></div></div><span class="pc" style="color:' + col + '">' + pc + '% <small>(' + a.c + '/' + a.t + ')' + timeLabel + '</small></span></div>';
      });
      if (dbars) html += '<div class="sfqc-sec">分野別 平均正答率＋学習時間（全ユーザー・' + esc(dcert) + '）</div><div class="sfqc-dash-card">' + dbars + '</div>';
    }

    // 問題別（hist だけで全資格分を計算できる。問題文・要確認フラグは現在資格のときだけ付く）
    var items = perQuestionStats(dcert);
    if (items.length) {
      var qmap = (isCur && engineHere) ? qTextMap() : {};
      var rows = items.slice(0, 40).map(function (it) {
        var rc = it.rate < 50 ? 'lo' : it.rate < 70 ? 'mi' : 'hi';
        var flag = (it.t >= 5 && it.rate < 40) ? '<span class="sfqc-flag">要確認</span>' : '';
        return '<tr><td class="num">Q' + esc(it.id) + '</td><td class="qx">' + esc((qmap[it.id] || '').slice(0, 60)) + '</td><td class="num">' + it.t + '</td><td class="num"><span class="sfqc-rate ' + rc + '">' + it.rate + '%</span>' + flag + '</td></tr>';
      }).join('');
      var dlHead = '<div class="sfqc-fb-head"><div class="sfqc-sec" style="margin:0">📝 問題別 正答率（全ユーザー・' + esc(dcert) + ' ' + items.length + '問）</div>' +
        '<div class="sfqc-fb-dl"><button class="sfqc-mini fb-dl" id="sfqc-q-csv">⬇ CSV</button><button class="sfqc-mini fb-dl" id="sfqc-q-json">⬇ JSON</button></div></div>';
      var note = (isCur && engineHere)
        ? '※ 回答数が多く正答率が低い問題＝難しすぎる/設問に問題がある可能性。改善の優先候補（表示は低い順・上位40件、書き出しは全件）。'
        : '※ 問題文・分野別は「' + esc(dcert) + '」のページから管理者ビューを開くと表示されます（ID・正答率は全件書き出せます）。';
      html += dlHead +
        '<details class="sfqc-itemwrap"><summary>低い順 上位40件を表示</summary>' +
        '<div class="sfqc-dash-card" style="margin-top:8px"><table class="sfqc-itbl"><thead><tr><th>問題</th><th>内容</th><th class="num">回答数</th><th class="num">正答率</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="sfqc-itnote">' + note + '</div></div></details>';
    }
    return html;
  }

  // 詳細集計で選択中の資格（無効/未選択なら現在ページの資格、無ければ存在する最初の資格）
  function dashCert() {
    var has = {}; adminRows.forEach(function (r) { if (r.cert && r.cert !== '—') has[r.cert] = 1; });
    if (adminDashCert && has[adminDashCert]) return adminDashCert;
    if (has[CERT_KEY]) return CERT_KEY;
    var ks = Object.keys(has);
    return ks[0] || CERT_KEY;
  }

  // 指定資格の問題別集計（hist だけで計算するので、エンジン未読込・他資格でも動く）。低い順にソート。
  function perQuestionStats(cert) {
    var perQ = {};
    adminRows.forEach(function (r) {
      if (r.cert !== cert) return;
      var hist = r.store.hist || {};
      Object.keys(hist).forEach(function (id) {
        var h = hist[id], t = (h.c || 0) + (h.w || 0); if (!t) return;
        var pq = perQ[id] || (perQ[id] = { c: 0, t: 0 }); pq.c += (h.c || 0); pq.t += t;
      });
    });
    var items = Object.keys(perQ).map(function (id) { var a = perQ[id]; return { id: id, c: a.c, t: a.t, rate: Math.round(a.c / a.t * 100) }; });
    items.sort(function (a, b) { return a.rate - b.rate || b.t - a.t; });
    return items;
  }

  function qTextMap() {
    var map = {};
    try { if (typeof QDATA !== 'undefined' && QDATA.forEach) QDATA.forEach(function (q) { map[q.id] = q.question || ''; }); } catch (e) {}
    return map;
  }

  // 日別アクティブ人数＋解答数の推移（直近30日）。全ユーザーの store.daily を横断集計。
  function timeSeriesHTML() {
    var DAYS = 30;
    var p = function (n) { return ('0' + n).slice(-2); };
    var key = function (d) { return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
    var labels = [], base = new Date();
    for (var i = DAYS - 1; i >= 0; i--) { var d = new Date(base); d.setDate(base.getDate() - i); labels.push(key(d)); }
    var act = {}, ans = {};
    labels.forEach(function (k) { act[k] = 0; ans[k] = 0; });
    adminUsers.forEach(function (u) {
      var seen = {};
      u.certs.forEach(function (c) {
        var daily = (c.store && c.store.daily) || {};
        Object.keys(daily).forEach(function (k) {
          var n = daily[k] || 0; if (!n || !(k in ans)) return;
          ans[k] += n;
          if (!seen[k]) { seen[k] = 1; act[k]++; }   // 同一ユーザーは資格をまたいでも1日1人
        });
      });
    });
    var maxAct = 1; labels.forEach(function (k) { if (act[k] > maxAct) maxAct = act[k]; });
    var bars = labels.map(function (k, idx) {
      var h = Math.round(act[k] / maxAct * 100);
      var lab = k + '：アクティブ ' + act[k] + '人 / 解答 ' + ans[k] + '件';
      return '<div class="sfqc-ts-col" role="button" tabindex="0" title="' + esc(lab) + '" data-ts-label="' + esc(lab) + '">' +
        '<div class="sfqc-ts-bar" style="height:' + Math.max(2, h) + '%"></div>' +
        '<div class="sfqc-ts-x">' + (idx % 5 === 0 ? esc(k.slice(5)) : '') + '</div></div>';
    }).join('');
    var totAns = labels.reduce(function (s, k) { return s + ans[k]; }, 0);
    var actDays = labels.filter(function (k) { return act[k] > 0; }).length;
    return '<div class="sfqc-sec">日別アクティブ（直近' + DAYS + '日・棒＝アクティブ人数）</div>' +
      '<div class="sfqc-dash-card"><div class="sfqc-ts">' + bars + '</div>' +
      '<div class="sfqc-ts-readout" id="sfqc-ts-readout">棒をタップ／カーソルを乗せると、その日の人数・解答数が出ます。</div>' +
      '<div class="sfqc-itnote">期間の総解答 ' + totAns.toLocaleString() + ' 件・学習があった日 ' + actDays + '/' + DAYS + '日。</div></div>';
  }

  // 操作ログ（#4）。管理者アカウントに保存された adminLog を新しい順に表示。
  function auditLogHTML() {
    if (!adminLogEntries.length) return '';
    var rows = adminLogEntries.slice(0, 50).map(function (e) {
      return '<div class="sfqc-log-item"><span class="sfqc-log-ts">' + esc(fmtDate(e.ts)) + '</span>' +
        '<span class="sfqc-log-act">' + esc(e.action || '') + '</span>' +
        '<span class="sfqc-log-detail">' + esc(e.detail || '') + '</span></div>';
    }).join('');
    return '<div class="sfqc-divider"></div><details class="sfqc-itemwrap"><summary>🧾 操作ログ（最近' + Math.min(50, adminLogEntries.length) + '件 / 全' + adminLogEntries.length + '）</summary>' +
      '<div class="sfqc-dash-card" style="margin-top:8px"><div class="sfqc-log-list">' + rows + '</div>' +
      '<div class="sfqc-itnote">承認・停止・却下・リセット・削除・返信などの操作履歴（管理者アカウントに保存）。</div></div></details>';
  }

  function aggregateUser(certs) {
    var ans = 0, att = 0, c = 0, w = 0, ex = 0, exP = 0, exBest = 0, exFull = 0, exFullP = 0;
    var notes = 0, srsDue = 0, srsTotal = 0, vocab = 0, bm = 0, days = 0, study = 0;
    var lastStudy = '';
    certs.forEach(function (x) {
      var s = x.stats;
      ans += s.answered; att += s.attempts; c += s.correct; w += s.wrong;
      ex += s.examCount; exP += s.examPassed; if (s.examBest > exBest) exBest = s.examBest;
      exFull += s.examFull; exFullP += s.examFullPassed;
      notes += s.notes; srsDue += s.srsDue; srsTotal += s.srsTotal;
      vocab += s.vocab; bm += s.bookmarks; days += s.daysActive; study += s.studySec;
      if (s.lastStudyDate > lastStudy) lastStudy = s.lastStudyDate;
    });
    return {
      certCount: certs.length,
      answered: ans, attempts: att, correct: c, wrong: w,
      rate: att ? Math.round(c / att * 100) : 0,
      examCount: ex, examPassed: exP, examBest: exBest,
      examFull: exFull, examFullPassed: exFullP,
      notes: notes, srsDue: srsDue, srsTotal: srsTotal,
      vocab: vocab, bookmarks: bm, daysActive: days, studySec: study,
      lastStudyDate: lastStudy
    };
  }

  function openAdmin() { if (!isAdmin) return; elAdmin.classList.add('show'); loadAdmin(); }
  function closeAdmin() {
    if (elAdmin) elAdmin.classList.remove('show');
    if (chatMode === 'admin') closeChat();
    if (adminColUnsub) { adminColUnsub(); adminColUnsub = null; } // ライブ購読を停止（無駄な読み取りを避ける）
    if (adminRenderTimer) { clearTimeout(adminRenderTimer); adminRenderTimer = null; }
  }

  // 1ユーザーの stats/agg を再計算（store を差し替えたあと等に呼ぶ）
  function refreshUser(u) {
    u.certs.forEach(function (c) { c.stats = statsOf(c.store); });
    u.certs.sort(function (a, b) { return b.stats.attempts - a.stats.attempts; }); // 解答数の多い順
    u.agg = aggregateUser(u.certs);
    return u;
  }
  // adminUsers（真実）から平坦化行を導出。renderAdmin の冒頭で都度作るのでダッシュボード/CSVは常に最新。
  function rebuildRows() {
    adminRows = [];
    adminUsers.forEach(function (u) {
      u.certs.forEach(function (c) {
        adminRows.push({ uid: u.uid, cert: c.cert, name: u.name, updated: u.updated, store: c.store, stats: c.stats });
      });
    });
  }
  function findUser(uid) { for (var i = 0; i < adminUsers.length; i++) if (adminUsers[i].uid === uid) return adminUsers[i]; return null; }
  // 承認待ち（実申請のみ・自分以外）の件数を通知バッジへ同期
  function syncPendingBadge() {
    setAdminPending(adminUsers.filter(function (u) { return isApplicant(u) && !(currentUser && u.uid === currentUser.uid); }).length);
  }

  // 全 doc を adminUsers / adminFeedback / adminLog へ取り込む（get・onSnapshot 共用）
  function ingestAdminDocs(snap) {
    adminFeedback = [];
    adminLogEntries = [];
    var byUid = {};
    snap.forEach(function (d) {
      var data = d.data() || {};
      var nm = data.name || (data.email ? String(data.email).split('@')[0] : '') || ('(不明 ' + d.id.slice(0, 6) + ')');
      var email = data.email || '';
      var replies = (data.fbReplies && typeof data.fbReplies === 'object') ? data.fbReplies : {};
      if (Array.isArray(data.feedback)) {
        data.feedback.forEach(function (fb) {
          if (fb && typeof fb === 'object') adminFeedback.push({ uid: d.id, name: nm, email: email, fb: fb, reply: (fb.fid && replies[fb.fid]) || null });
        });
      }
      // 管理者自身の doc から操作ログを取り込む（#4）
      if (currentUser && d.id === currentUser.uid && Array.isArray(data.adminLog)) adminLogEntries = data.adminLog.slice();
      var entry = { uid: d.id, name: nm, email: email, updated: data.updated || 0, access: (data.access || 'pending'), req: (data.req || null), chat: (Array.isArray(data.chat) ? data.chat : []), notices: (Array.isArray(data.notices) ? data.notices : []), read: (data.read && typeof data.read === 'object' ? data.read : {}), lastLogin: data.lastLogin || 0, lastSeen: data.lastSeen || 0, logins: (Array.isArray(data.logins) ? data.logins : []), certs: [] };
      var stores = data.stores;
      if (stores && typeof stores === 'object' && Object.keys(stores).length) {
        Object.keys(stores).forEach(function (ck) { entry.certs.push({ cert: ck, store: stores[ck] || emptyStore() }); });
      } else if (data.store) {
        entry.certs.push({ cert: '(旧)', store: data.store });
      } else {
        entry.certs.push({ cert: '—', store: emptyStore() });
      }
      byUid[d.id] = entry;
    });
    adminUsers = Object.keys(byUid).map(function (k) { return refreshUser(byUid[k]); });
    adminFeedback.sort(function (a, b) { return (b.fb.ts || 0) - (a.fb.ts || 0); }); // 新しい順
    adminLogEntries.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (adminLogEntries.length > LOG_CAP) adminLogEntries = adminLogEntries.slice(0, LOG_CAP);
  }
  function loadAdmin() {
    if (!isAdmin || !db) return;
    var body = document.getElementById('sfqc-adm-body');
    if (body && !adminUsers.length) body.innerHTML = '<div class="sfqc-empty">読み込み中…</div>';
    adminSelApps = {};
    if (adminColUnsub) { adminColUnsub(); adminColUnsub = null; }
    var first = true;
    // 進捗コレクションをライブ購読（DMの未読バッジ・既読などが「↻更新」なしで即時反映）
    adminColUnsub = db.collection(COLLECTION).onSnapshot(function (snap) {
      ingestAdminDocs(snap);
      if (first) {
        first = false;
        // 初回だけ お知らせレコード一覧／メンテナンス設定を取得してから描画
        loadBroadcasts(function () {
          db.collection(BROADCAST_COL).doc(MAINT_DOC).get()
            .then(function (m) { lastMaint = (m && m.exists && m.data()) || null; }).catch(function () {})
            .then(function () { if (elAdmin && elAdmin.classList.contains('show')) renderAdmin(); });
        });
        return;
      }
      scheduleAdminRender(); // 2回目以降＝ライブ更新（入力中などは控える・デバウンス）
    }, function (e) {
      if (body && !adminUsers.length) body.innerHTML = '<div class="sfqc-empty">読み込みに失敗しました。<br>管理者として権限（Firestoreルール）が設定されているか確認してください。<br><small>' + esc(e && e.message) + '</small></div>';
    });
  }
  // ライブ再描画（デバウンス＋入力/モーダル操作中は抑止し、操作の邪魔をしない）
  function scheduleAdminRender() {
    if (adminRenderTimer) clearTimeout(adminRenderTimer);
    adminRenderTimer = setTimeout(function () {
      if (!elAdmin || !elAdmin.classList.contains('show')) return;
      syncPendingBadge(); // バッジは常に最新化
      var ae = document.activeElement;
      if (ae && (ae.id === 'sfqc-dm-q' || ae.id === 'sfqc-q' || ae.id === 'sfqc-cmp-text' || ae.id === 'sfqc-chat-text')) return;
      var cmp = document.getElementById('sfqc-compose'); if (cmp && cmp.classList.contains('show')) return;
      if (document.querySelector('.sfqc-detail.show')) return; // 詳細を開いている間は再描画しない
      renderAdmin();
    }, 1500); // ハートビート連発時の再描画を抑えるためデバウンス長め
  }

  // 操作ログを記録（#4）。管理者自身の doc に保存（自doc書込はルール上常に可）。
  // 直近 LOG_CAP 件だけを保持する「上限付き」配列をそのまま書き戻すので、無制限には増えない。
  // 表示は即時にローカル adminLogEntries を使うため、DB 書込は best-effort（失敗しても UI を妨げない）。
  var LOG_CAP = 200;
  function logAdmin(action, detail) {
    var entry = { ts: Date.now(), action: action, detail: detail || '', by: currentName || '' };
    adminLogEntries.unshift(entry);
    if (adminLogEntries.length > LOG_CAP) adminLogEntries = adminLogEntries.slice(0, LOG_CAP);
    if (currentUser && db) {
      try {
        db.collection(COLLECTION).doc(currentUser.uid)
          .update(new firebase.firestore.FieldPath('adminLog'), adminLogEntries.slice(0, LOG_CAP))
          .catch(function () {});
      } catch (e) {}
    }
  }

  function fmtDate(ms) {
    if (!ms) return '—';
    try { var d = new Date(ms); var p = function (n) { return ('0' + n).slice(-2); };
      return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
    catch (e) { return '—'; }
  }
  // 秒まで表示（ログイン・アクセス時刻用）
  function fmtDateTime(ms) {
    if (!ms) return '—';
    try { var d = new Date(ms); var p = function (n) { return ('0' + n).slice(-2); };
      return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
    catch (e) { return '—'; }
  }
  // 経過時間の概算（「たった今 / N分前」）
  function fmtAgo(ms) {
    if (!ms) return '—';
    var s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return s + '秒前';
    if (s < 3600) return Math.floor(s / 60) + '分前';
    if (s < 86400) return Math.floor(s / 3600) + '時間前';
    return Math.floor(s / 86400) + '日前';
  }

  /* ---------------- ログイン記録＋在席（オンライン）ハートビート ----------------
     ・ログイン時に lastLogin（秒精度）と logins[]（直近30件の履歴）を記録。
     ・在席中は lastSeen を45秒ごとに更新（非表示タブは更新しない）。
       管理者は (now - lastSeen) <= ONLINE_MS なら「オンライン」と判定して可視化。
     ・いずれも本人 doc への書込のみ＝既存ルールのまま動作（ルール変更不要）。 */
  function recordLogin(uid, data) {
    if (!db || !uid) return;
    var now = Date.now();
    var logins = (data && Array.isArray(data.logins)) ? data.logins.slice() : [];
    logins.push(now); if (logins.length > 30) logins = logins.slice(-30);
    db.collection(COLLECTION).doc(uid).set({ lastLogin: now, lastSeen: now, logins: logins }, { merge: true }).catch(function () {});
  }
  function presenceWrite(uid) {
    if (!db || !uid || document.hidden) return; // 非表示タブは在席に数えない
    db.collection(COLLECTION).doc(uid).set({ lastSeen: Date.now() }, { merge: true }).catch(function () {});
  }
  function startPresence(uid) {
    stopPresence();
    presenceWrite(uid);
    hbTimer = setInterval(function () { presenceWrite(uid); }, 45000);
    hbVisHandler = function () { if (!document.hidden) presenceWrite(uid); };
    document.addEventListener('visibilitychange', hbVisHandler);
  }
  function stopPresence() {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (hbVisHandler) { document.removeEventListener('visibilitychange', hbVisHandler); hbVisHandler = null; }
  }
  function isOnline(u) { return u && u.lastSeen && (Date.now() - u.lastSeen) <= ONLINE_MS; }

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

  // 「新規申請」は実際に申請ボタンを押した人（req あり）かつ未承認のみを対象にする。
  // 既存の未ログイン/未申請アカウントは含めない（＝勝手に申請扱いにしない）。
  function isApplicant(u) { return (u.access || 'pending') !== 'approved' && u.req && u.req.ts; }
  function applicationsSectionHTML() {
    var apps = adminUsers.filter(isApplicant);
    apps.sort(function (a, b) { return (b.req.ts || 0) - (a.req.ts || 0); }); // 申請の新しい順
    var head = '<div class="sfqc-sec" style="margin-top:0">🔔 新規申請 ' +
      '<span class="sfqc-fb-count">' + apps.length + '件</span></div>';
    if (!apps.length) {
      adminSelApps = {};
      return head + '<div class="sfqc-empty" style="padding:14px">新規の利用申請はありません。<br>' +
        '<small>未申請の承認待ちアカウントは、下の一覧「アクセス: 承認待ち」で確認・承認できます。</small></div>' +
        '<div class="sfqc-divider"></div>';
    }
    // 選択状態は現存する申請者だけに絞る（消えた申請の取り残し防止）
    var present = {}; apps.forEach(function (u) { present[u.uid] = 1; });
    Object.keys(adminSelApps).forEach(function (k) { if (!present[k]) delete adminSelApps[k]; });
    var selCount = Object.keys(adminSelApps).length;
    // 一括操作バー（#8）
    var bulk = '<div class="sfqc-app-bulk">' +
        '<label class="sfqc-app-selall"><input type="checkbox" id="sfqc-app-all"' + (selCount && selCount === apps.length ? ' checked' : '') + '> すべて選択</label>' +
        '<span class="sfqc-count">' + selCount + ' 件選択</span>' +
        '<button class="sfqc-mini" id="sfqc-app-bulk-approve"' + (selCount ? '' : ' disabled') + '>✅ 選択を一括承認</button>' +
      '</div>';
    var cards = apps.map(function (u) {
      var isBlock = (u.access === 'blocked');
      var stateChip = isBlock
        ? '<span class="sfqc-acc-access block">🚫 停止中</span>'
        : '<span class="sfqc-acc-access pend">⏳ 承認待ち</span>';
      var reqChip = '<span class="sfqc-acc-access pend">📝 申請 ' + esc(fmtDate(u.req.ts)) + '</span>';
      var emailLabel = u.email ? '<span class="sfqc-acc-email">' + esc(u.email) + '</span>' : '';
      return '<div class="sfqc-app-item' + (isBlock ? ' is-block' : '') + '">' +
          '<div class="sfqc-app-info">' +
            '<label class="sfqc-app-check"><input type="checkbox" class="sfqc-app-sel" data-sel-uid="' + esc(u.uid) + '"' + (adminSelApps[u.uid] ? ' checked' : '') + '></label>' +
            '<span class="sfqc-app-name">👤 ' + esc(u.name) + '</span>' + emailLabel + stateChip + reqChip +
          '</div>' +
          '<div class="sfqc-app-actions">' +
            '<button class="sfqc-act-approve" data-acc-uid="' + esc(u.uid) + '" data-acc-name="' + esc(u.name) + '" data-acc-state="approved">✅ 承認</button>' +
            '<button class="sfqc-act-reject" data-rej-uid="' + esc(u.uid) + '" data-rej-name="' + esc(u.name) + '">❌ 却下</button>' +
            (isBlock ? '' : '<button class="sfqc-act-block" data-acc-uid="' + esc(u.uid) + '" data-acc-name="' + esc(u.name) + '" data-acc-state="blocked">🚫 停止</button>') +
          '</div>' +
        '</div>';
    }).join('');
    return head + bulk + '<div class="sfqc-app-list">' + cards + '</div><div class="sfqc-divider"></div>';
  }

  function renderAdmin() {
    var body = document.getElementById('sfqc-adm-body');
    rebuildRows();        // adminUsers から平坦化行を導出（常に最新）
    syncPendingBadge();   // 承認待ち件数の通知バッジを同期
    if (!adminUsers.length) { body.innerHTML = '<div class="sfqc-empty">アカウントがまだありません。</div>'; return; }
    var list = filterSortUsers();

    var certSet = {}; adminRows.forEach(function (r) { certSet[r.cert] = 1; });
    var certChips = '<button class="sfqc-fchip' + (adminCert === 'all' ? ' on' : '') + '" data-cert="all">すべて</button>';
    Object.keys(certSet).forEach(function (ck) { certChips += '<button class="sfqc-fchip' + (adminCert === ck ? ' on' : '') + '" data-cert="' + esc(ck) + '">' + esc(ck) + '</button>'; });
    var sortBtn = function (k, l) { return '<button class="sfqc-sort' + (adminSort === k ? ' on' : '') + '" data-sort="' + k + '">' + l + '</button>'; };

    // ── タブで「ユーザー／ダッシュボード／お知らせ／DM」を分離 ──
    var totalUnread = adminUsers.reduce(function (s, u) { return s + chatUnreadCount(u.chat, 'admin', u.uid); }, 0);
    var fbPending = adminFeedback.filter(function (r) { return !r.reply; }).length; // 未対応フィードバック
    var tabBtn = function (k, l, badge) {
      return '<button class="sfqc-tab' + (adminTab === k ? ' on' : '') + '" data-tab="' + k + '">' + l +
        (badge ? '<span class="sfqc-tab-badge">' + badge + '</span>' : '') + '</button>';
    };
    var html = '<div class="sfqc-tabs">' +
        tabBtn('users', '👥 ユーザー', adminPendingCount || 0) +
        tabBtn('dash', '📊 ダッシュボード', 0) +
        tabBtn('ann', '📢 お知らせ', 0) +
        tabBtn('dm', '💬 DM', (totalUnread + fbPending) || 0) +
      '</div>';

    if (adminTab === 'dash') {
      // 分析専用（KPI・推移・分野別/問題別・操作ログ）＋メンテナンス設定
      html += maintenanceSectionHTML();
      html += adminDashboardHTML();
      html += auditLogHTML();
    } else if (adminTab === 'ann') {
      html += announcementsSectionHTML(); // お知らせ（一斉＋個別）の作成・編集・削除・既読
    } else if (adminTab === 'dm') {
      html += dmSectionHTML();            // 利用者とのチャット＋フィードバック
    } else {
      // ユーザー管理（新規申請＋一覧。承認/停止/詳細）
      html += applicationsSectionHTML();
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

      // 一括操作バー（表示中ユーザーから選択 → 一括お知らせ/停止/リセット）
      var present = {}; list.forEach(function (u) { present[u.uid] = 1; });
      Object.keys(adminSelUsers).forEach(function (k) { if (!present[k]) delete adminSelUsers[k]; });
      var selN = Object.keys(adminSelUsers).length;
      html += '<div class="sfqc-app-bulk">' +
          '<label class="sfqc-app-selall"><input type="checkbox" id="sfqc-usel-all"' + (selN && selN === list.length ? ' checked' : '') + '> すべて選択</label>' +
          '<span class="sfqc-count">' + selN + ' 人選択</span>' +
          '<button class="sfqc-mini" id="sfqc-ubulk-notice"' + (selN ? '' : ' disabled') + '>📩 一括お知らせ</button>' +
          '<button class="sfqc-mini sfqc-danger" id="sfqc-ubulk-block"' + (selN ? '' : ' disabled') + '>⏸ 一括停止</button>' +
          '<button class="sfqc-mini sfqc-danger" id="sfqc-ubulk-reset"' + (selN ? '' : ' disabled') + '>🗑 一括リセット</button>' +
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
        html +=
          '<div class="sfqc-acc">' +
            '<div class="sfqc-acc-head">' +
              '<div class="sfqc-acc-id">' +
                '<label class="sfqc-app-check"><input type="checkbox" class="sfqc-usel" data-usel-uid="' + esc(u.uid) + '"' + (adminSelUsers[u.uid] ? ' checked' : '') + '></label>' +
                '<span class="sfqc-acc-name">👤 ' + esc(u.name) + '</span>' + accChip +
                (isOnline(u) ? '<span class="sfqc-online" title="最終アクセス ' + esc(fmtDateTime(u.lastSeen)) + '"><span class="sfqc-online-dot"></span>オンライン</span>' : '') +
                dormantLabel +
              '</div>' +
              (u.email ? '<span class="sfqc-acc-email-line">' + esc(u.email) + '</span>' : '') +
              '<span class="sfqc-acc-stats">' +
                '<span>解答 <b>' + a.answered + '</b>問</span>' +
                '<span>正答率 <b>' + a.rate + '%</b></span>' +
                '<span>試験 <b>' + a.examCount + '</b>回' + passLabel + '</span>' +
                '<span>学習 <b>' + a.daysActive + '</b>日</span>' +
                '<span>最終学習 ' + esc(a.lastStudyDate || '—') + '</span>' +
                '<span title="' + esc(fmtDateTime(u.lastLogin)) + '">ログイン ' + (u.lastLogin ? esc(fmtDateTime(u.lastLogin)) : '—') + '</span>' +
                '<span>最終アクセス ' + (u.lastSeen ? esc(fmtAgo(u.lastSeen)) : '—') + '</span>' +
              '</span>' +
              '<span class="sfqc-acc-actions">' +
                accBtn +
                '<button class="sfqc-act-detail" data-i="' + i + '">詳細 ▾</button>' +
              '</span>' +
            '</div>' +
            '<div class="sfqc-detail" id="sfqc-det-' + i + '"></div>' +
          '</div>';
      });
    }
    var prevScroll = body.scrollTop; // ライブ再描画でスクロール位置が飛ばないよう保持
    body.innerHTML = html;
    try { body.scrollTop = prevScroll; } catch (e) {}

    // タブ切替（ダッシュボード／ユーザー／メッセージ）
    body.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { adminTab = b.getAttribute('data-tab'); renderAdmin(); });
    });
    // お知らせ（全体/個別）の新規・編集・削除
    var bcNew = document.getElementById('sfqc-bc-new'); if (bcNew) bcNew.addEventListener('click', function () { openCompose({ mode: 'broadcast' }); });
    var ntNew = document.getElementById('sfqc-nt-new'); if (ntNew) ntNew.addEventListener('click', function () { openCompose({ mode: 'notice' }); });
    body.querySelectorAll('[data-bcedit]').forEach(function (b) { b.addEventListener('click', function () { editBroadcast(b.getAttribute('data-bcedit')); }); });
    body.querySelectorAll('[data-bcdel]').forEach(function (b) { b.addEventListener('click', function () { deleteBroadcast(b.getAttribute('data-bcdel')); }); });
    body.querySelectorAll('[data-ntedit]').forEach(function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-ntedit').split('|'); editNotice(p[0], p[1]); }); });
    body.querySelectorAll('[data-ntdel]').forEach(function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-ntdel').split('|'); deleteNotice(p[0], p[1]); }); });
    var maintEditQ = document.getElementById('sfqc-maint-edit-queue'); if (maintEditQ) maintEditQ.addEventListener('click', openQueueEditor);
    var maintEditR = document.getElementById('sfqc-maint-edit-recur'); if (maintEditR) maintEditR.addEventListener('click', openRecurringEditor);
    var fullStopBtn = document.getElementById('sfqc-fullstop'); if (fullStopBtn) fullStopBtn.addEventListener('click', toggleFullStop);
    // メッセージタブ：DM絞り込み
    var dmIn = document.getElementById('sfqc-dm-q');
    if (dmIn) {
      dmIn.addEventListener('input', function () { dmFilter = dmIn.value; renderAdmin(); setTimeout(function () { var n = document.getElementById('sfqc-dm-q'); if (n) { n.focus(); n.selectionStart = n.selectionEnd = n.value.length; } }, 0); });
    }
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
    body.querySelectorAll('[data-rej-uid]').forEach(function (b) {
      b.addEventListener('click', function () { rejectApplication(b.getAttribute('data-rej-uid'), b.getAttribute('data-rej-name')); });
    });
    body.querySelectorAll('.sfqc-act-detail').forEach(function (b) {
      b.addEventListener('click', function () { toggleDetail(+b.getAttribute('data-i')); });
    });
    // 管理者→利用者：チャットを開く
    body.querySelectorAll('[data-chat-uid]').forEach(function (b) {
      b.addEventListener('click', function () { openChat(b.getAttribute('data-chat-uid'), b.getAttribute('data-chat-name'), 'admin'); });
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
    var fbPend = document.querySelector('[data-fbpending]');
    if (fbPend) fbPend.addEventListener('click', function () { fbOnlyPending = !fbOnlyPending; renderAdmin(); });
    body.querySelectorAll('.sfqc-fb-done').forEach(function (b) {
      b.addEventListener('click', function () { adminResolveFeedback(+b.getAttribute('data-fi')); });
    });
    // フィードバック：問題へジャンプ(#5)
    body.querySelectorAll('[data-openq]').forEach(function (b) {
      b.addEventListener('click', function () { var id = b.getAttribute('data-openq'); closeAdmin(); if (window.jumpQ) window.jumpQ(Number(id)); });
    });
    // ダッシュボード：詳細集計の資格切替(#2)・問題別正答率の書き出し(#6)
    body.querySelectorAll('[data-dashcert]').forEach(function (b) {
      b.addEventListener('click', function () { adminDashCert = b.getAttribute('data-dashcert'); renderAdmin(); });
    });
    var qCsv = document.getElementById('sfqc-q-csv'); if (qCsv) qCsv.addEventListener('click', function () { exportQuestionRates('csv'); });
    var qJson = document.getElementById('sfqc-q-json'); if (qJson) qJson.addEventListener('click', function () { exportQuestionRates('json'); });
    // 日別アクティブ：棒をタップ/キー操作でその日の値を表示（タッチ端末対応）
    body.querySelectorAll('[data-ts-label]').forEach(function (b) {
      var show = function () { var ro = document.getElementById('sfqc-ts-readout'); if (ro) ro.textContent = '📅 ' + b.getAttribute('data-ts-label'); };
      b.addEventListener('click', show);
      b.addEventListener('mouseenter', show);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    });
    // 申請の一括承認(#8)：チェック選択・全選択・実行
    body.querySelectorAll('.sfqc-app-sel').forEach(function (b) {
      b.addEventListener('change', function () {
        var uid = b.getAttribute('data-sel-uid');
        if (b.checked) adminSelApps[uid] = 1; else delete adminSelApps[uid];
        renderAdmin();
      });
    });
    var selAll = document.getElementById('sfqc-app-all');
    if (selAll) selAll.addEventListener('change', function () {
      adminSelApps = {};
      if (selAll.checked) adminUsers.filter(isApplicant).forEach(function (u) { adminSelApps[u.uid] = 1; });
      renderAdmin();
    });
    var bulkBtn = document.getElementById('sfqc-app-bulk-approve');
    if (bulkBtn) bulkBtn.addEventListener('click', function () { bulkApprove(Object.keys(adminSelApps)); });
    // ユーザー一括選択＋一括操作
    body.querySelectorAll('.sfqc-usel').forEach(function (b) {
      b.addEventListener('change', function () { var uid = b.getAttribute('data-usel-uid'); if (b.checked) adminSelUsers[uid] = 1; else delete adminSelUsers[uid]; renderAdmin(); });
    });
    var uselAll = document.getElementById('sfqc-usel-all');
    if (uselAll) uselAll.addEventListener('change', function () { adminSelUsers = {}; if (uselAll.checked) filterSortUsers().forEach(function (u) { adminSelUsers[u.uid] = 1; }); renderAdmin(); });
    var ubN = document.getElementById('sfqc-ubulk-notice'); if (ubN) ubN.addEventListener('click', bulkNotice);
    var ubB = document.getElementById('sfqc-ubulk-block'); if (ubB) ubB.addEventListener('click', bulkBlock);
    var ubR = document.getElementById('sfqc-ubulk-reset'); if (ubR) ubR.addEventListener('click', bulkResetUsers);
    // フィードバックへの返信(#7)
    body.querySelectorAll('[data-reply-uid]').forEach(function (b) {
      b.addEventListener('click', function () { replyFeedback(b.getAttribute('data-reply-uid'), b.getAttribute('data-reply-fid'), b.getAttribute('data-reply-name')); });
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
          kv('学習時間', fmtDur(s.studySec)) +
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
      '<div>状態: ' + (isOnline(u) ? '🟢 オンライン' : '⚪ オフライン') + '（最終アクセス ' + esc(u.lastSeen ? fmtDateTime(u.lastSeen) : '—') + '）</div>' +
      '<div>最終ログイン: ' + esc(u.lastLogin ? fmtDateTime(u.lastLogin) : '—') + '</div>' +
      (u.req && u.req.ts ? '<div>申請: ' + esc(u.req.name || u.name) + '（' + esc(fmtDate(u.req.ts)) + '）</div>' : '') +
      '</div>';
    // ログイン履歴（直近・秒精度）
    if (u.logins && u.logins.length) {
      var recent = u.logins.slice().sort(function (a, b) { return b - a; }).slice(0, 15);
      html += '<details class="sfqc-rd"><summary>🕑 ログイン履歴（' + u.logins.length + '件中・最新' + recent.length + '件）</summary>' +
        '<div class="sfqc-login-hist">' + recent.map(function (t, idx) {
          return '<div class="sfqc-login-row"><span class="sfqc-login-no">' + (idx + 1) + '</span>🕒 ' + esc(fmtDateTime(t)) +
            (idx === 0 ? '<span class="sfqc-login-latest">最新</span>' : '') + '</div>';
        }).join('') + '</div></details>';
    }
    // アカウント全体の削除（doc ごと削除＝全資格の進捗・申請・フィードバックを消去）
    html += '<div><button class="sfqc-del-doc" data-deluid="' + esc(u.uid) + '" data-delname="' + esc(u.name) + '">🗑 このアカウントを完全削除（全データ）</button></div>';
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
    box.querySelectorAll('.sfqc-del-doc').forEach(function (b) {
      b.addEventListener('click', function () { deleteUserDoc(b.getAttribute('data-deluid'), b.getAttribute('data-delname')); });
    });
  }

  // 以下の管理操作は、成功時に全件再取得せず adminUsers（真実）をローカル更新して再描画する（#3）。
  // これで Firestore 読み取りコストと体感遅延を抑える。失敗時は alert のみで状態は変えない。

  // アカウントを doc ごと完全削除（全資格の進捗・申請・フィードバックを消去）。
  // ※ログイン認証(Firebase Auth)自体はクライアントから消せないため、コンソールで別途削除する。
  function deleteUserDoc(uid, name) {
    if (!isAdmin || !db || !uid) return;
    if (!confirm('「' + name + '」のアカウントデータを完全に削除します。\n（全資格の進捗・利用申請・フィードバックがすべて消えます。取り消せません）\n\n※ログインID自体(Firebase Authentication)はFirebaseコンソールから削除してください。\n\n本当に削除しますか？')) return;
    db.collection(COLLECTION).doc(uid).delete()
      .then(function () {
        adminUsers = adminUsers.filter(function (u) { return u.uid !== uid; });
        adminFeedback = adminFeedback.filter(function (f) { return f.uid !== uid; });
        logAdmin('完全削除', name);
        toastSafe('「' + name + '」を完全削除しました'); renderAdmin();
      })
      .catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }

  // 利用申請の却下（管理者のみ）。req を消して申請一覧から外す。access は承認待ちのまま。
  // （完全に締め出すときは「停止」を使う。却下後も本人は再申請できる）
  function rejectApplication(uid, name) {
    if (!isAdmin || !db || !uid) return;
    if (!confirm('「' + name + '」の利用申請を却下します。\n（アカウントは「承認待ち」のままで、本人は再申請できます。完全に締め出す場合は「停止」を使ってください）\n\nよろしいですか？')) return;
    var FV = firebase.firestore.FieldValue;
    db.collection(COLLECTION).doc(uid).update({ req: FV.delete(), updated: Date.now() })
      .then(function () {
        var u = findUser(uid); if (u) { u.req = null; u.updated = Date.now(); }
        delete adminSelApps[uid];
        logAdmin('申請却下', name);
        toastSafe('「' + name + '」の申請を却下しました'); renderAdmin();
      })
      .catch(function (e) { alert('却下に失敗しました: ' + (e && e.message)); });
  }

  // アクセス権の付与/停止（管理者のみ）。Firestoreルールで access は管理者だけ書込可。
  function setAccess(uid, name, state) {
    if (!isAdmin || !db) return;
    var verb = state === 'approved' ? '承認' : '停止';
    if (!confirm('「' + name + '」を' + verb + 'します。よろしいですか？')) return;
    db.collection(COLLECTION).doc(uid).set({ access: state, updated: Date.now() }, { merge: true })
      .then(function () {
        var u = findUser(uid); if (u) { u.access = state; u.updated = Date.now(); }
        if (state === 'approved') delete adminSelApps[uid];
        logAdmin(verb, name);
        toastSafe('「' + name + '」を' + verb + 'しました'); renderAdmin();
      })
      .catch(function (e) { alert('変更に失敗しました: ' + (e && e.message)); });
  }

  // 選択した申請をまとめて承認（#8）
  function bulkApprove(uids) {
    if (!isAdmin || !db || !uids || !uids.length) return;
    if (!confirm(uids.length + ' 件の申請をまとめて承認します。よろしいですか？')) return;
    var ts = Date.now();
    var ps = uids.map(function (uid) {
      return db.collection(COLLECTION).doc(uid).set({ access: 'approved', updated: ts }, { merge: true })
        .then(function () { return { uid: uid, ok: true }; })
        .catch(function () { return { uid: uid, ok: false }; });
    });
    Promise.all(ps).then(function (res) {
      var done = 0;
      res.forEach(function (r) {
        if (!r.ok) return;
        done++;
        var u = findUser(r.uid); if (u) { u.access = 'approved'; u.updated = ts; }
        delete adminSelApps[r.uid];
      });
      logAdmin('一括承認', done + '件');
      toastSafe(done + ' 件を承認しました' + (done < uids.length ? '（' + (uids.length - done) + '件失敗）' : ''));
      renderAdmin();
    });
  }

  // ── 選択ユーザーへの一括操作 ──
  function bulkNotice() {
    var uids = Object.keys(adminSelUsers); if (!uids.length) return;
    openCompose({ mode: 'notice', uids: uids }); // 複数宛て個別お知らせ
  }
  function bulkBlock() {
    var uids = Object.keys(adminSelUsers); if (!isAdmin || !db || !uids.length) return;
    if (!confirm(uids.length + ' 人を一括で「停止」します。よろしいですか？\n（学習できなくなります。解除は各アカウントの「承認」から）')) return;
    var ts = Date.now();
    Promise.all(uids.map(function (uid) {
      return db.collection(COLLECTION).doc(uid).set({ access: 'blocked', updated: ts }, { merge: true })
        .then(function () { var u = findUser(uid); if (u) u.access = 'blocked'; return true; }).catch(function () { return false; });
    })).then(function (res) {
      var n = res.filter(Boolean).length; adminSelUsers = {};
      logAdmin('一括停止', n + '人'); toastSafe(n + ' 人を停止しました'); renderAdmin();
    });
  }
  function bulkResetUsers() {
    var uids = Object.keys(adminSelUsers); if (!isAdmin || !db || !uids.length) return;
    if (!confirm('⚠️ ' + uids.length + ' 人の学習進捗を全資格まとめてリセットします。\nこの操作は取り消せません。本当に実行しますか？')) return;
    var FP = firebase.firestore.FieldPath, ts = Date.now();
    Promise.all(uids.map(function (uid) {
      var u = findUser(uid); var ref = db.collection(COLLECTION).doc(uid);
      var certs = (u && u.certs) ? u.certs : [];
      return Promise.all(certs.map(function (c) {
        var p = (c.cert === '(旧)' || c.cert === '—') ? ref.update('store', emptyStore(), 'updated', ts) : ref.update(new FP('stores', c.cert), emptyStore(), 'updated', ts);
        return p.catch(function () {});
      })).then(function () { if (u) { u.certs.forEach(function (c) { c.store = emptyStore(); }); refreshUser(u); } return true; }).catch(function () { return false; });
    })).then(function (res) {
      var n = res.filter(Boolean).length; adminSelUsers = {};
      logAdmin('一括リセット', n + '人'); toastSafe(n + ' 人の進捗をリセットしました'); renderAdmin();
    });
  }

  function resetAccount(uid, cert, name) {
    if (!isAdmin || !db) return;
    if (!confirm('「' + name + '」［' + cert + '］の進捗をリセットします。よろしいですか？')) return;
    var ref = db.collection(COLLECTION).doc(uid);
    var FP = firebase.firestore.FieldPath;
    var p = (cert === '(旧)' || cert === '—')
      ? ref.update('store', emptyStore(), 'updated', Date.now())
      : ref.update(new FP('stores', cert), emptyStore(), 'updated', Date.now());
    p.then(function () {
        var u = findUser(uid);
        if (u) { var c = u.certs.filter(function (x) { return x.cert === cert; })[0]; if (c) c.store = emptyStore(); u.updated = Date.now(); refreshUser(u); }
        logAdmin('進捗リセット', name + '［' + cert + '］');
        toastSafe('「' + name + '」［' + cert + '］をリセットしました'); renderAdmin();
      })
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
    p.then(function () {
        var u = findUser(uid);
        if (u) {
          u.certs = u.certs.filter(function (x) { return x.cert !== cert; });
          if (!u.certs.length) u.certs.push({ cert: '—', store: emptyStore() });
          u.updated = Date.now(); refreshUser(u);
        }
        logAdmin('進捗削除', name + '［' + cert + '］');
        toastSafe('「' + name + '」［' + cert + '］を削除しました'); renderAdmin();
      })
      .catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }

  /* ---------------- フィードバック一覧（管理者ビュー上部） ---------------- */
  function fbCatLabel(k) {
    var m = { bug: '🐞 不具合', answer: '❌ 正解誤り', exp: '📝 解説誤り', choice: '🔀 選択肢', japanese: '🗾 日本語', request: '💡 要望', other: '＊ その他' };
    return m[k] || k || '—';
  }
  // チャット配列から最新メッセージを取り出す
  function lastChatMsg(chat) {
    if (!Array.isArray(chat) || !chat.length) return null;
    var m = null; chat.forEach(function (x) { if (x && (!m || (x.ts || 0) > (m.ts || 0))) m = x; });
    return m;
  }
  // 配信対象（管理者自身を除く）と、一斉お知らせの既読者
  function annAudience() { var myUid = (currentUser && currentUser.uid) || ''; return adminUsers.filter(function (u) { return u.uid !== myUid; }); }

  // 📢 お知らせタブ：全体お知らせ（レコード）＋個別お知らせ。どちらも作成・編集・削除・既読つき。
  function announcementsSectionHTML() {
    var now = Date.now();
    // ── 全体お知らせ ──
    var html = '<div class="sfqc-fb-head"><div class="sfqc-sec" style="margin:0">📢 全体お知らせ <span class="sfqc-fb-count">' + adminBroadcasts.length + '件</span></div>' +
      '<div class="sfqc-fb-dl"><button class="sfqc-mini reload" id="sfqc-bc-new">＋ 新規作成</button></div></div>';
    if (!adminBroadcasts.length) html += '<div class="sfqc-empty">まだ全体お知らせはありません。</div>';
    var aud = annAudience();
    adminBroadcasts.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).forEach(function (b) {
      var rev = b.rev || b.ts || 0;
      var readers = aud.filter(function (u) { return (((u.read && u.read.bcm) || {})[b.id] || 0) >= rev; });
      var unreadU = aud.filter(function (u) { return (((u.read && u.read.bcm) || {})[b.id] || 0) < rev; });
      var scheduled = (b.publishAt || b.ts || 0) > now;
      var when = scheduled ? ('🕒 予約 ' + fmtDate(b.publishAt) + '（未配信）') : ('✅ 配信 ' + fmtDate(b.publishAt || b.ts));
      var prev = b.msg.length > 100 ? b.msg.slice(0, 100) + '…' : b.msg;
      var readerList = readers.map(function (u) { return '<div class="sfqc-rd-row">✅ ' + esc(u.name) + ' <span class="sfqc-rd-t">' + esc(fmtDate(((u.read && u.read.bcm) || {})[b.id])) + '</span></div>'; }).join('') || '<div class="sfqc-rd-row sfqc-rd-none">まだ既読の人はいません</div>';
      var unreadList = unreadU.map(function (u) { return '<div class="sfqc-rd-row">⬜ ' + esc(u.name) + '</div>'; }).join('') || '<div class="sfqc-rd-row sfqc-rd-none">全員が既読です 🎉</div>';
      html += '<div class="sfqc-bc-card">' +
          '<div class="sfqc-bc-msg">' + esc(prev) + '</div>' +
          '<div class="sfqc-bc-meta">' +
            '<span>' + esc(when) + '</span>' +
            '<span>👁 既読 <b>' + readers.length + '</b> / ' + aud.length + '人</span>' +
            '<button class="sfqc-mini" data-bcedit="' + esc(b.id) + '">✏️ 編集</button>' +
            '<button class="sfqc-mini sfqc-danger" data-bcdel="' + esc(b.id) + '">🗑 削除</button>' +
          '</div>' +
          '<details class="sfqc-rd"><summary>👥 既読者・未読者</summary><div class="sfqc-rd-grid">' +
            '<div><div class="sfqc-rd-h">既読 ' + readers.length + '</div>' + readerList + '</div>' +
            '<div><div class="sfqc-rd-h">未読 ' + unreadU.length + '</div>' + unreadList + '</div>' +
          '</div></details>' +
        '</div>';
    });
    // ── 個別お知らせ（全ユーザー横断） ──
    html += '<div class="sfqc-divider"></div>';
    var notices = [];
    adminUsers.forEach(function (u) { (u.notices || []).forEach(function (n) { notices.push({ u: u, n: n, id: (n.id || ('n' + (n.ts || 0))) }); }); });
    notices.sort(function (a, b) { return (b.n.ts || 0) - (a.n.ts || 0); });
    html += '<div class="sfqc-fb-head"><div class="sfqc-sec" style="margin:0">📩 個別お知らせ <span class="sfqc-fb-count">' + notices.length + '件</span></div>' +
      '<div class="sfqc-fb-dl"><button class="sfqc-mini reload" id="sfqc-nt-new">＋ 個別送信</button></div></div>';
    if (!notices.length) html += '<div class="sfqc-empty">まだ個別お知らせはありません。</div>';
    notices.forEach(function (it) {
      var n = it.n, u = it.u, rev = n.rev || n.ts || 0;
      var rd = (((u.read && u.read.ntm) || {})[it.id] || 0) >= rev;
      var scheduled = (n.publishAt || n.ts || 0) > now;
      var when = scheduled ? ('🕒 予約 ' + fmtDate(n.publishAt) + '（未配信）') : ('配信 ' + fmtDate(n.publishAt || n.ts));
      var prev = n.msg.length > 80 ? n.msg.slice(0, 80) + '…' : n.msg;
      html += '<div class="sfqc-bc-card">' +
          '<div class="sfqc-bc-meta" style="margin-bottom:6px">' +
            '<span style="font-weight:700">👤 ' + esc(u.name) + '</span>' +
            '<span class="sfqc-read ' + (rd ? 'yes' : 'no') + '">' + (rd ? '既読' : '未読') + '</span>' +
            '<span>' + esc(when) + '</span>' +
          '</div>' +
          '<div class="sfqc-bc-msg">' + esc(prev) + '</div>' +
          '<div class="sfqc-bc-meta">' +
            '<button class="sfqc-mini" data-ntedit="' + esc(u.uid) + '|' + esc(it.id) + '">✏️ 編集</button>' +
            '<button class="sfqc-mini sfqc-danger" data-ntdel="' + esc(u.uid) + '|' + esc(it.id) + '">🗑 削除</button>' +
          '</div>' +
        '</div>';
    });
    return html;
  }

  // 💬 DMタブ：利用者とのチャット＋フィードバック
  function dmSectionHTML() {
    var users = adminUsers.map(function (u) {
      var last = lastChatMsg(u.chat);
      return { u: u, unread: chatUnreadCount(u.chat, 'admin', u.uid), last: last, lastTs: (last && last.ts) || 0 };
    });
    var totalUnread = users.reduce(function (s, x) { return s + x.unread; }, 0);
    users.sort(function (a, b) { return (b.unread > 0) - (a.unread > 0) || b.lastTs - a.lastTs || (b.u.updated || 0) - (a.u.updated || 0); });
    var q = dmFilter.trim().toLowerCase();
    var list = q ? users.filter(function (x) { return (x.u.name || '').toLowerCase().indexOf(q) >= 0 || (x.u.email || '').toLowerCase().indexOf(q) >= 0; }) : users;
    var html = '<div class="sfqc-sec">💬 ダイレクトメッセージ' + (totalUnread ? ' <span class="sfqc-fb-count">未読 ' + totalUnread + '</span>' : '') + '</div>';
    html += '<div class="sfqc-toolbar"><input id="sfqc-dm-q" class="sfqc-search" type="search" placeholder="🔍 名前・メールで絞り込み" value="' + esc(dmFilter) + '"><span class="sfqc-count">' + list.length + ' / ' + users.length + '人</span></div>';
    if (!list.length) html += '<div class="sfqc-empty">該当する利用者がいません。</div>';
    list.forEach(function (x) {
      var u = x.u, last = x.last;
      var prev = last ? ((last.from === 'admin' ? 'あなた: ' : '') + (last.msg || '')) : 'メッセージはまだありません';
      if (prev.length > 42) prev = prev.slice(0, 42) + '…';
      var readChip = '';
      if (last && last.from === 'admin') { var rd = (u.read && u.read.chat || 0) >= (last.ts || 0); readChip = '<span class="sfqc-read ' + (rd ? 'yes' : 'no') + '">💬' + (rd ? '既読' : '未読') + '</span>'; }
      html += '<div class="sfqc-dm' + (x.unread ? ' unread' : '') + '">' +
          '<div class="sfqc-dm-main"><span class="sfqc-dm-name">👤 ' + esc(u.name) + '</span>' + (x.unread ? '<span class="sfqc-dm-badge">' + x.unread + '</span>' : '') + '<span class="sfqc-dm-prev">' + esc(prev) + '</span></div>' +
          '<div class="sfqc-dm-act">' + readChip + (last ? '<span class="sfqc-dm-time">' + esc(fmtDate(last.ts)) + '</span>' : '') +
            '<button class="sfqc-act-chat' + (x.unread ? ' has-unread' : '') + '" data-chat-uid="' + esc(u.uid) + '" data-chat-name="' + esc(u.name) + '">💬 開く</button></div>' +
        '</div>';
    });
    html += '<div class="sfqc-divider"></div>' + feedbackSectionHTML();
    return html;
  }
  function feedbackSectionHTML() {
    var all = adminFeedback;
    var pending = all.filter(function (r) { return !r.reply; }).length; // 未対応＝未返信
    var head = '<div class="sfqc-fb-head"><div class="sfqc-sec" style="margin:0">🛠 フィードバック / 不具合報告 <span class="sfqc-fb-count">' + all.length + '件</span>' +
      (pending ? ' <span class="sfqc-read no">未対応 ' + pending + '</span>' : '') + '</div>' +
      '<div class="sfqc-fb-dl"><button class="sfqc-mini fb-dl" id="sfqc-fb-json">⬇ JSON</button><button class="sfqc-mini fb-dl" id="sfqc-fb-csv">⬇ CSV</button></div></div>';
    if (!all.length) return head + '<div class="sfqc-empty">まだ報告はありません。</div><div class="sfqc-divider"></div>';

    var list = all.filter(function (r) {
      if (fbOnlyPending && r.reply) return false;
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
    var bar = '<div class="sfqc-toolbar sfqc-toolbar2">' +
      '<button class="sfqc-fchip' + (fbOnlyPending ? ' on' : '') + '" data-fbpending="1">⚠️ 未対応のみ</button>' +
      '<span class="sfqc-sort-label">資格:</span>' + certChips +
      '<span class="sfqc-sort-label">種類:</span>' + catChips +
      '<span class="sfqc-count">' + list.length + ' / ' + all.length + '件</span></div>';

    var items = list.map(function (r) {
      var fb = r.fb;
      var idx = adminFeedback.indexOf(r);
      var qref = fb.qid ? ('Q' + esc(String(fb.qid))) : '（全般）';
      // 問題への導線(#5)：現在ページの資格なら jumpQ で即表示、他資格は報告時のURLを開く。
      var openLink = '';
      if (fb.qid && fb.cert === CERT_KEY && typeof window.jumpQ === 'function') {
        openLink = '<button class="sfqc-fb-open" data-openq="' + esc(String(fb.qid)) + '">🔎 Q' + esc(String(fb.qid)) + ' を開く</button>';
      } else if (fb.url) {
        openLink = '<a class="sfqc-fb-open" href="' + esc(fb.url) + '" target="_blank" rel="noopener">🔗 報告ページ' + (fb.qid ? '（Q' + esc(String(fb.qid)) + '）' : '') + 'を開く</a>';
      }
      var links = (openLink || fb.ref)
        ? '<div class="sfqc-fb-ref">' + openLink + (fb.ref ? (openLink ? ' ・ ' : '') + '<a href="' + esc(fb.ref) + '" target="_blank" rel="noopener">参照リンク</a>' : '') + '</div>'
        : '';
      return '<div class="sfqc-fb-item">' +
        '<div class="sfqc-fb-top">' +
          '<span class="sfqc-fb-cat">' + esc(fbCatLabel(fb.cat)) + '</span>' +
          '<span class="sfqc-fb-meta">' + esc(fmtDate(fb.ts)) + ' ・ 👤' + esc(r.name || '?') + ' ・ ' + esc(fb.cert || '-') + ' ' + qref + '</span>' +
          '<button class="sfqc-fb-done" data-fi="' + idx + '">対応済み（削除）</button>' +
        '</div>' +
        '<div class="sfqc-fb-msg">' + esc(fb.msg || '') + '</div>' +
        (fb.qtext ? '<div class="sfqc-fb-qx">問題: ' + esc(fb.qtext) + '</div>' : '') +
        links +
        // 管理者からの返信(#7)：既存の返信を表示し、返信ボタンを出す（fid がある報告のみ返信可）
        (r.reply ? '<div class="sfqc-fb-reply">📩 返信（' + esc(fmtDate(r.reply.ts)) + '）：' + esc(r.reply.msg || '') + '</div>' : '') +
        (fb.fid ? '<div class="sfqc-fb-replyrow"><button class="sfqc-fb-open" data-reply-uid="' + esc(r.uid) + '" data-reply-fid="' + esc(String(fb.fid)) + '" data-reply-name="' + esc(r.name || '') + '">✏️ ' + (r.reply ? '返信を編集' : '返信する') + '</button></div>' : '') +
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
      .then(function () {
        var i = adminFeedback.indexOf(r); if (i >= 0) adminFeedback.splice(i, 1);
        logAdmin('報告対応', (r.name || '') + (r.fb.qid ? '／Q' + r.fb.qid : ''));
        toastSafe('対応済みにしました'); renderAdmin();
      })
      .catch(function (e) { alert('削除に失敗しました: ' + (e && e.message)); });
  }
  // フィードバックへの返信(#7)。報告者の doc の fbReplies[fid] に保存（管理者は全doc書込可）。
  // 本人はログイン時に cloud-sync が未読の返信を検知して通知する（rule 変更不要）。
  function replyFeedback(uid, fid, name) {
    if (!isAdmin || !db || !uid || !fid) return;
    var cur = adminFeedback.filter(function (x) { return x.uid === uid && x.fb && String(x.fb.fid) === String(fid); })[0];
    var prev = (cur && cur.reply && cur.reply.msg) || '';
    var msg = (window.prompt('「' + (name || '') + '」さんへの返信を入力してください（本人のアプリに表示されます）', prev) || '').trim();
    if (!msg) return;
    var reply = { msg: msg.slice(0, 1000), ts: Date.now(), by: currentName || 'admin' };
    db.collection(COLLECTION).doc(uid).update(new firebase.firestore.FieldPath('fbReplies', String(fid)), reply)
      .then(function () {
        if (cur) cur.reply = reply;
        logAdmin('返信', (name || '') + '／Q' + (cur && cur.fb && cur.fb.qid ? cur.fb.qid : '-'));
        toastSafe('返信を送信しました'); renderAdmin();
      })
      .catch(function (e) { alert('返信に失敗しました: ' + (e && e.message)); });
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

  // 問題別 正答率の書き出し（#6）。表示は上位40件だが、書き出しは全件。
  // 問題文は現在ページの資格のときだけ付く（他資格は QDATA 未読込のため空欄）。
  function questionRateRows(cert) {
    var qmap = (cert === CERT_KEY) ? qTextMap() : {};
    return perQuestionStats(cert).map(function (it) {
      return { cert: cert, qid: it.id, question: qmap[it.id] || '',
               answers: it.t, correct: it.c, rate: it.rate,
               flag: (it.t >= 5 && it.rate < 40) ? '要確認' : '' };
    });
  }
  function exportQuestionRates(fmt) {
    var cert = dashCert();
    var rows = questionRateRows(cert);
    if (!rows.length) { alert('書き出すデータがありません。'); return; }
    var stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'json') {
      dlBlob(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8;' }),
        'sfquiz-qrates-' + cert + '-' + stamp + '.json');
      return;
    }
    var head = ['資格', '問題ID', '問題文', '回答数', '正解数', '正答率(%)', 'フラグ'];
    var lines = [head.join(',')];
    rows.forEach(function (r) {
      var row = [r.cert, r.qid, r.question, r.answers, r.correct, r.rate, r.flag];
      lines.push(row.map(function (x) { var v = String(x == null ? '' : x); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','));
    });
    dlBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
      'sfquiz-qrates-' + cert + '-' + stamp + '.csv');
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
      '学習日数', '学習時間(分)', '最終学習日', '受験予定日', '日次目標'
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
          s.daysActive, Math.round((s.studySec || 0) / 60), s.lastStudyDate, s.examDate, s.goal
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

  // テスト用フック：純粋な集計ロジックだけを公開（本番動作には影響しない）。tools/test-cloud-sync.js が参照。
  window.__sfqcTest = { statsOf: statsOf, aggregateUser: aggregateUser, perQuestionStats: perQuestionStats, emptyStore: emptyStore };

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
        setBadge(''); setStatus(''); showAdminBtn(false); setAdminPending(0); closeAdmin();
        showOverlay(); // gateway=ログインフォーム / client=ホーム誘導カード
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
