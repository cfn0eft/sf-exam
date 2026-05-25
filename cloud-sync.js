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
  var elOverlay, elBadge, elMsg, elId, elPw, elLogin, elSignup, elStatus, elAdminBtn, elAdmin;

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
      '#sfqc-badge{position:fixed;top:8px;right:10px;z-index:9000;display:none;align-items:center;gap:8px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);color:#4338ca;padding:5px 8px 5px 11px;border-radius:999px;font-size:12px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif}' +
      '#sfqc-badge.show{display:inline-flex}' +
      '#sfqc-badge .sfqc-status{font-weight:500;color:#6366f1;font-size:11px}' +
      '#sfqc-admin-btn{display:none;background:#f59e0b;border:none;color:#fff;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer}' +
      '#sfqc-admin-btn.show{display:inline-block}' +
      '#sfqc-logout{background:rgba(255,255,255,.7);border:1px solid rgba(99,102,241,.3);color:#4338ca;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer}' +
      '#sfqc-logout:hover{background:#fff}' +
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
      '.sfqc-empty{color:#94a3b8;font-size:13px;text-align:center;padding:30px}' +
      'body.dark .sfqc-card{background:#1e293b;color:#e2e8f0}' +
      'body.dark .sfqc-field{background:#0f172a;border-color:#334155;color:#e2e8f0}' +
      'body.dark .sfqc-btn-ghost{background:#334155;color:#cbd5e1}' +
      'body.dark .sfqc-sub{color:#94a3b8}';
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
      '<span id="sfqc-name">👤</span>' +
      '<span class="sfqc-status" id="sfqc-status"></span>' +
      '<button id="sfqc-admin-btn">👑 管理者</button>' +
      '<button id="sfqc-logout">ログアウト</button>';
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

    // バッジ・管理者パネルは両モード共通
    document.getElementById('sfqc-logout').addEventListener('click', doLogout);
    elAdminBtn.addEventListener('click', openAdmin);
    document.getElementById('sfqc-adm-close').addEventListener('click', closeAdmin);
    document.getElementById('sfqc-adm-reload').addEventListener('click', loadAdmin);
    document.getElementById('sfqc-adm-csv').addEventListener('click', exportCsv);
  }

  function showOverlay() { if (elOverlay) elOverlay.classList.add('show'); }
  function hideOverlay() { if (elOverlay) elOverlay.classList.remove('show'); }
  function setMsg(t, kind) { if (elMsg) { elMsg.textContent = t || ''; elMsg.className = 'sfqc-msg' + (kind ? ' ' + kind : ''); } }
  function setStatus(t) { if (elStatus) elStatus.textContent = t || ''; }
  function setBadge(name) {
    if (!elBadge) return;
    if (name) { document.getElementById('sfqc-name').textContent = '👤 ' + name; elBadge.classList.add('show'); }
    else { elBadge.classList.remove('show'); }
  }
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
    var c = 0, w = 0;
    ids.forEach(function (k) { c += (hist[k].c || 0); w += (hist[k].w || 0); });
    var attempts = c + w;
    return {
      answered: ids.length,
      attempts: attempts,
      correct: c, wrong: w,
      rate: attempts ? Math.round(c / attempts * 100) : 0,
      streak: store.streak || 0,
      bookmarks: (store.bm || []).length,
      vocab: Object.keys(store.vm || {}).length
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

    // gateway（ホーム）: このページは進捗ストアを持たないので同期は行わない。
    // 認証とアカウント管理（管理者ビュー）のみ。進捗の読込/移行は各クイズページ側に任せる。
    if (!window.__setStore) {
      setStatus('');
      setMsg(''); if (elPw) elPw.value = '';
      hideOverlay();
      return;
    }

    setStatus('読込中…');
    db.collection(COLLECTION).doc(user.uid).get().then(function (doc) {
      var data = (doc.exists && doc.data()) || {};
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

  /* ---------------- 管理者ビュー ---------------- */
  var adminRows = []; // {uid, name, updated, store, stats}

  function qTextMap() {
    var map = {};
    try { if (typeof QDATA !== 'undefined' && QDATA.forEach) QDATA.forEach(function (q) { map[q.id] = q.question || ''; }); } catch (e) {}
    return map;
  }

  function openAdmin() { if (!isAdmin) return; elAdmin.classList.add('show'); loadAdmin(); }
  function closeAdmin() { if (elAdmin) elAdmin.classList.remove('show'); }

  function loadAdmin() {
    if (!isAdmin || !db) return;
    var body = document.getElementById('sfqc-adm-body');
    body.innerHTML = '<div class="sfqc-empty">読み込み中…</div>';
    db.collection(COLLECTION).get().then(function (snap) {
      adminRows = [];
      snap.forEach(function (d) {
        var data = d.data() || {};
        var nm = data.name || (data.email ? String(data.email).split('@')[0] : '') || ('(不明 ' + d.id.slice(0, 6) + ')');
        var stores = data.stores;
        if (stores && typeof stores === 'object' && Object.keys(stores).length) {
          Object.keys(stores).forEach(function (ck) {
            var store = stores[ck] || emptyStore();
            adminRows.push({ uid: d.id, cert: ck, name: nm, updated: data.updated || 0, store: store, stats: statsOf(store) });
          });
        } else if (data.store) {
          // 旧スキーマ（資格未分離）の doc
          adminRows.push({ uid: d.id, cert: '(旧)', name: nm, updated: data.updated || 0, store: data.store, stats: statsOf(data.store) });
        } else {
          adminRows.push({ uid: d.id, cert: '—', name: nm, updated: data.updated || 0, store: emptyStore(), stats: statsOf(emptyStore()) });
        }
      });
      adminRows.sort(function (a, b) { return b.updated - a.updated; });
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

  function renderAdmin() {
    var body = document.getElementById('sfqc-adm-body');
    if (!adminRows.length) { body.innerHTML = '<div class="sfqc-empty">アカウントがまだありません。</div>'; return; }
    var html = '';
    adminRows.forEach(function (r, i) {
      var s = r.stats;
      html +=
        '<div class="sfqc-acc">' +
          '<div class="sfqc-acc-head">' +
            '<span class="sfqc-acc-name">👤 ' + esc(r.name) + ' <span style="font-weight:600;color:#2563eb;font-size:12px">[' + esc(r.cert) + ']</span></span>' +
            '<span class="sfqc-acc-stats">' +
              '<span>回答した問題 <b>' + s.answered + '</b></span>' +
              '<span>正答率 <b>' + s.rate + '%</b></span>' +
              '<span>正解 <b>' + s.correct + '</b>／不正解 <b>' + s.wrong + '</b></span>' +
              '<span>連続正解 <b>' + s.streak + '</b></span>' +
              '<span>★ブックマーク <b>' + s.bookmarks + '</b></span>' +
              '<span>単語学習 <b>' + s.vocab + '</b></span>' +
              '<span>最終更新 ' + fmtDate(r.updated) + '</span>' +
            '</span>' +
            '<span class="sfqc-acc-actions">' +
              '<button class="sfqc-act-detail" data-i="' + i + '">詳細</button>' +
              '<button class="sfqc-act-reset" data-uid="' + esc(r.uid) + '" data-cert="' + esc(r.cert) + '" data-name="' + esc(r.name) + '">リセット</button>' +
              '<button class="sfqc-act-del" data-uid="' + esc(r.uid) + '" data-cert="' + esc(r.cert) + '" data-name="' + esc(r.name) + '">削除</button>' +
            '</span>' +
          '</div>' +
          '<div class="sfqc-detail" id="sfqc-det-' + i + '"></div>' +
        '</div>';
    });
    body.innerHTML = html;

    body.querySelectorAll('.sfqc-act-detail').forEach(function (b) { b.addEventListener('click', function () { toggleDetail(+b.getAttribute('data-i')); }); });
    body.querySelectorAll('.sfqc-act-reset').forEach(function (b) { b.addEventListener('click', function () { resetAccount(b.getAttribute('data-uid'), b.getAttribute('data-cert'), b.getAttribute('data-name')); }); });
    body.querySelectorAll('.sfqc-act-del').forEach(function (b) { b.addEventListener('click', function () { deleteAccount(b.getAttribute('data-uid'), b.getAttribute('data-cert'), b.getAttribute('data-name')); }); });
  }

  function toggleDetail(i) {
    var box = document.getElementById('sfqc-det-' + i);
    if (!box) return;
    if (box.classList.contains('show')) { box.classList.remove('show'); return; }
    var r = adminRows[i], hist = r.store.hist || {}, qmap = qTextMap();
    var ids = Object.keys(hist).sort(function (a, b) { return (+a) - (+b); });
    var rows = ids.map(function (id) {
      var h = hist[id], t = (h.c || 0) + (h.w || 0), rate = t ? Math.round(h.c / t * 100) : 0;
      return '<tr><td class="num">Q' + esc(id) + '</td><td class="qx">' + esc((qmap[id] || '').slice(0, 70)) + '</td>' +
        '<td class="num">' + (h.c || 0) + '</td><td class="num">' + (h.w || 0) + '</td><td class="num">' + rate + '%</td></tr>';
    }).join('');
    var bm = (r.store.bm || []);
    var detail = '';
    if (ids.length) {
      detail += '<table><thead><tr><th>問題</th><th>内容</th><th class="num">正解</th><th class="num">不正解</th><th class="num">正答率</th></tr></thead><tbody>' + rows + '</tbody></table>';
    } else {
      detail += '<div class="sfqc-empty">まだ回答記録がありません。</div>';
    }
    if (bm.length) detail += '<p style="font-size:12px;color:#475569;margin-top:10px">★ ブックマーク: ' + bm.map(function (x) { return 'Q' + esc(x); }).join(', ') + '</p>';
    box.innerHTML = detail;
    box.classList.add('show');
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

  function exportCsv() {
    if (!adminRows.length) { alert('書き出すデータがありません。'); return; }
    var head = ['ID', '資格', '最終更新', '回答した問題数', '総回答回数', '正解数', '不正解数', '正答率(%)', '連続正解', 'ブックマーク数', '単語学習数'];
    var lines = [head.join(',')];
    adminRows.forEach(function (r) {
      var s = r.stats;
      var row = [r.name, r.cert, fmtDate(r.updated), s.answered, s.attempts, s.correct, s.wrong, s.rate, s.streak, s.bookmarks, s.vocab];
      lines.push(row.map(function (x) { var v = String(x == null ? '' : x); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','));
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
