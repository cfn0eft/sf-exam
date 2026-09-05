(function () {
  'use strict';

  var CFG = window.SFQ_FIREBASE_CONFIG || null;
  var LOGIN_DOMAIN = window.SFQ_LOGIN_DOMAIN || 'sfquiz.local';
  var COLLECTION = window.SFQ_COLLECTION || 'progress';
  var CERT_KEY = (window.CERT_CONFIG && window.CERT_CONFIG.slug) || window.SFQ_CERT_KEY || 'default';
  var MIGRATE_FLAG = 'sfq_migrated_' + CERT_KEY;

  var ROLE = 'gateway';
  var HOME_URL = 'index.html';

  function sanitizeId(s) { return (s || '').trim().toLowerCase().replace(/[^a-z0-9._\-]/g, ''); }
  var ADMIN_IDS = (window.SFQ_ADMIN_IDS || []).map(sanitizeId);
  var ADMIN_HASHES = (window.SFQ_ADMIN_ID_HASHES || []).map(function (h) { return String(h == null ? '' : h).trim().toLowerCase(); });

  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(str) {
    var out = [], s = unescape(encodeURIComponent(String(str == null ? '' : str)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function sha256Hex(str) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = utf8Bytes(str), bitLen = bytes.length * 8;
    bytes = bytes.slice();
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
    bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

    var w = new Array(64), i, t;
    function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
    for (var off = 0; off < bytes.length; off += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        var s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (hh + S1 + ch + SHA_K[i] + w[i]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    var hex = '';
    for (i = 0; i < 8; i++) { t = h[i].toString(16); hex += '00000000'.slice(t.length) + t; }
    return hex;
  }

  function matchAdmin(hashes, ids, rawId) {
    var c = sanitizeId(rawId);
    if (!c) return false;
    if (hashes && hashes.length) return hashes.indexOf(sha256Hex(c)) >= 0;
    return (ids || []).indexOf(c) >= 0;
  }

  var auth = null, db = null, currentUser = null, saveTimer = null, cloudDirty = false;
  var currentName = '', currentEmail = '', isAdmin = false;
  var elOverlay, elBadge, elMsg, elId, elPw, elLogin, elSignup, elStatus, elAdminBtn, elAdmin, elLock;

  var BROADCAST_COL = 'broadcast';
  var ownDocUnsub = null, broadcastUnsub = null, adminChatUnsub = null;
  var accessUnsub = null, watchedAccess = null, accessLocked = false;
  var lockedAccess = '';
  var adminPendingUnsub = null;
  var lastBroadcasts = [], lastNotices = [], lastChat = [], lastRead = {}, ownLoaded = false;
  var chatOpen = false, chatUid = '', chatName = '', chatMode = 'user';
  var MAINT_DOC = 'maintenance';
  var maintUnsub = null, maintTimer = null, maintBoundaryTimer = null, lastMaint = null;
  var maintExempt = false;
  var noticeBoundaryTimer = null;
  var composeCtx = null;
  var adminBroadcasts = [];
  var adminColUnsub = null, adminRenderTimer = null;
  var hbTimer = null, hbVisHandler = null;
  var ONLINE_MS = 120000;
  var currentDeviceId = '';
  var NETWORK_DEFAULT_DAYS = 30;

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
      '.sfqc-act-revoke{background:#dcfce7;color:#15803d}' +
      '.sfqc-act-del{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-detail{display:none;padding:0 14px 14px;border-top:1px dashed #e2e8f0}' +
      '.sfqc-detail.show{display:block}' +
      '.sfqc-detail table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}' +
      '.sfqc-detail th,.sfqc-detail td{border-bottom:1px solid #eef2f7;padding:5px 6px;text-align:left}' +
      '.sfqc-detail th{color:#64748b;font-weight:600;position:sticky;top:0;background:#fff}' +
      '.sfqc-detail .num{text-align:right;font-variant-numeric:tabular-nums}' +
      '.sfqc-detail .qx{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}' +
      '.sfqc-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;position:sticky;top:0;z-index:5}' +
      '.sfqc-search{flex:1;min-width:200px;padding:8px 12px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;outline:none;background:#fff;color:#0f172a}' +
      '.sfqc-search:focus{border-color:#2563eb}' +
      '.sfqc-sort-label{font-size:11px;color:#64748b;font-weight:700}' +
      '.sfqc-sort{border:1px solid #cbd5e1;background:#fff;color:#475569;padding:6px 10px;font-size:11.5px;font-weight:700;border-radius:8px;cursor:pointer}' +
      '.sfqc-sort.on{background:#2563eb;color:#fff;border-color:#2563eb}' +
      '.sfqc-count{font-size:11px;color:#64748b;margin-left:auto;font-weight:700}' +
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
      '.sfqc-acc-email{font-weight:500;color:#64748b;font-size:12px;margin-left:8px}' +
      '.sfqc-detail-inner{padding:10px 0 4px}' +
      '.sfqc-meta{font-size:11.5px;color:#64748b;margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap}' +
      '.sfqc-meta code{background:#f1f5f9;border-radius:4px;padding:1px 6px;font-size:11px;color:#334155}' +
      '.sfqc-cert{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 10px;overflow:hidden}' +
      '.sfqc-cert-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#eef2ff;border-bottom:1px solid #e0e7ff;gap:8px;flex-wrap:wrap}' +
      '.sfqc-cert-name{font-weight:700;font-size:13px;color:#3730a3}' +
      '.sfqc-cert-actions{display:flex;gap:6px}' +
      '.sfqc-cert-actions button{border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer}' +
      '.sfqc-kv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:1px;background:#e2e8f0;padding:1px}' +
      '.sfqc-kv{background:#fff;padding:6px 10px}' +
      '.sfqc-k{font-size:10.5px;color:#64748b;font-weight:600;line-height:1.4}' +
      '.sfqc-v{font-size:13px;color:#0f172a;font-weight:700;line-height:1.4}' +
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
      '.sfqc-app-bulk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}' +
      '.sfqc-app-selall{font-size:12px;color:#475569;display:inline-flex;align-items:center;gap:5px;cursor:pointer}' +
      '.sfqc-app-check{display:inline-flex;align-items:center;margin-right:4px}' +
      'body.dark .sfqc-app-selall{color:#cbd5e1}' +
      '.sfqc-ts{display:block;width:100%;height:96px}' +
      '.sfqc-ts .bar{fill:#16a34a}' +
      '.sfqc-ts .ln{fill:none;stroke:#2563eb;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}' +
      '.sfqc-ts .hit{fill:transparent;cursor:pointer}' +
      '.sfqc-ts .hit:hover,.sfqc-ts .hit:focus{fill:rgba(22,163,74,.14);outline:none}' +
      '.sfqc-ts-axis{display:flex;margin-top:3px}' +
      '.sfqc-ts-xc{flex:1 1 0;min-width:0;font-size:9px;color:#94a3b8;white-space:nowrap;text-align:center}' +
      '.sfqc-ts-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#475569;margin-bottom:6px}' +
      '.sfqc-ts-legend .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle}' +
      '.sfqc-ts-legend .swl{display:inline-block;width:16px;height:0;border-top:2px solid #2563eb;margin-right:4px;vertical-align:middle}' +
      '.sfqc-ts-readout{font-size:12px;color:#334155;margin-top:6px;font-weight:700;min-height:1.4em}' +
      'body.dark .sfqc-ts .bar{fill:#4ade80}body.dark .sfqc-ts .ln{stroke:#60a5fa}body.dark .sfqc-ts-legend .swl{border-top-color:#60a5fa}body.dark .sfqc-ts-readout{color:#cbd5e1}body.dark .sfqc-ts-legend{color:#cbd5e1}' +
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
      '#sfqc-lock{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.85);backdrop-filter:blur(4px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '#sfqc-lock.show{display:flex}' +
      '#sfqc-replies{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.7);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif}' +
      '.sfqc-rep-card{text-align:left;width:min(92vw,420px)}' +
      '.sfqc-rep-list{display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow:auto;margin-top:6px}' +
      '.sfqc-rep-item{background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:9px 11px}' +
      '.sfqc-rep-ts{font-size:11px;color:#0891b2;margin-bottom:3px}' +
      '.sfqc-rep-msg{font-size:13.5px;color:#0e4a5b;white-space:pre-wrap;word-break:break-word;line-height:1.55}' +
      'body.dark .sfqc-rep-item{background:#083344;border-color:#155e75}body.dark .sfqc-rep-msg{color:#cffafe}body.dark .sfqc-rep-ts{color:#67e8f9}' +
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
      '.sfqc-read{font-size:10px;font-weight:800;border-radius:999px;padding:1px 7px;white-space:nowrap}' +
      '.sfqc-read.yes{background:#dcfce7;color:#15803d}' +
      '.sfqc-read.no{background:#fee2e2;color:#b91c1c}' +
      'body.dark .sfqc-read.yes{background:#14532d;color:#bbf7d0}body.dark .sfqc-read.no{background:#7f1d1d;color:#fecaca}' +
      '.sfqc-bc-card{background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 14px;margin-bottom:12px}' +
      '.sfqc-bc-card .sfqc-bc-msg{font-size:13px;color:#1e293b;white-space:pre-wrap;word-break:break-word;margin:4px 0 8px}' +
      '.sfqc-bc-card .sfqc-bc-meta{font-size:11.5px;color:#475569;display:flex;gap:12px;flex-wrap:wrap;align-items:center}' +
      'body.dark .sfqc-bc-card{background:#312e81;border-color:#4f46e5}body.dark .sfqc-bc-card .sfqc-bc-msg{color:#e2e8f0}body.dark .sfqc-bc-card .sfqc-bc-meta{color:#c7d2fe}' +
      '.sfqc-rd{margin-top:8px}' +
      '.sfqc-rd > summary{cursor:pointer;font-size:12px;font-weight:700;color:#4338ca}' +
      '.sfqc-rd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}' +
      '.sfqc-rd-h{font-size:11px;font-weight:800;color:#64748b;margin-bottom:4px}' +
      '.sfqc-rd-row{font-size:12px;color:#1e293b;padding:2px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
      '.sfqc-rd-t{font-size:10px;color:#94a3b8}' +
      '.sfqc-rd-none{color:#94a3b8}' +
      'body.dark .sfqc-rd > summary{color:#c7d2fe}body.dark .sfqc-rd-row{color:#e2e8f0}' +
      '@media(max-width:560px){.sfqc-rd-grid{grid-template-columns:1fr}}' +
      '.sfqc-online{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:6px;white-space:nowrap;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe}' +
      '.sfqc-online-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:sfqc-pulse 1.8s infinite}' +
      '@keyframes sfqc-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      'body.dark .sfqc-online{background:#312e81;color:#c7d2fe;border-color:#4f46e5}' +
      '.sfqc-login-hist{margin-top:6px;display:flex;flex-direction:column;gap:4px}' +
      '.sfqc-login-row{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:5px 10px}' +
      '.sfqc-login-no{font-size:10px;font-weight:800;color:#94a3b8;min-width:16px;text-align:right}' +
      '.sfqc-login-latest{margin-left:auto;font-size:10px;font-weight:800;color:#15803d;background:#dcfce7;border-radius:999px;padding:1px 7px}' +
      'body.dark .sfqc-login-row{background:#0f172a;border-color:#334155;color:#cbd5e1}body.dark .sfqc-login-latest{background:#14532d;color:#bbf7d0}' +
      '.sfqc-net-chip{display:inline-flex;align-items:center;font-size:10px;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap;background:#e2e8f0;color:#475569}' +
      '.sfqc-net-chip.corp{background:#dcfce7;color:#15803d}.sfqc-net-chip.warn{background:#fef3c7;color:#92400e}.sfqc-net-chip.host{background:#ffedd5;color:#9a3412}.sfqc-net-chip.unknown{background:#e2e8f0;color:#475569}' +
      '.sfqc-net-alert{margin:8px 0;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:9px;padding:7px 10px;font-size:12px;font-weight:700}' +
      '.sfqc-net-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:7px;margin-top:7px}' +
      '.sfqc-net-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:8px 10px;font-size:11.5px;color:#475569;line-height:1.55}' +
      '.sfqc-net-card strong{color:#1e293b}.sfqc-net-card .muted{color:#94a3b8;font-size:10.5px}' +
      '.sfqc-privacy-note{display:block;margin-top:9px;padding-top:8px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.55;text-align:left}' +
      'body.dark .sfqc-net-card{background:#0f172a;border-color:#334155;color:#cbd5e1}body.dark .sfqc-net-card strong{color:#f1f5f9}body.dark .sfqc-net-alert{background:#431407;border-color:#9a3412;color:#fed7aa}body.dark .sfqc-privacy-note{border-color:#334155;color:#94a3b8}' +
      '#sfqc-maint{position:fixed;inset:0;z-index:100004;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.92);backdrop-filter:blur(4px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;padding:16px}' +
      '#sfqc-maint.show{display:flex}' +
      '#sfqc-maint .sfqc-card{text-align:center}' +
      '#sfqc-maint-banner{position:fixed;left:0;right:0;top:0;z-index:99980;display:none;background:#b45309;color:#fff;font-size:12.5px;font-weight:700;text-align:center;padding:8px 12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2)}' +
      '#sfqc-maint-banner.show{display:block}' +
      '#sfqc-swtoast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(24px);z-index:99986;display:flex;align-items:center;gap:10px;background:#0176d3;color:#fff;font-size:13px;font-weight:700;padding:10px 10px 10px 16px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.28);opacity:0;transition:opacity .25s,transform .25s;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;max-width:92vw}' +
      '#sfqc-swtoast.show{opacity:1;transform:translateX(-50%) translateY(0)}' +
      '.sfqc-swtoast-btn{background:#fff;color:#0176d3;border:none;border-radius:9px;padding:6px 13px;font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap}' +
      '.sfqc-swtoast-btn:hover{background:#eaf4ff}' +
      '.sfqc-swtoast-x{background:transparent;border:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 4px;opacity:.85}' +
      '.sfqc-swtoast-x:hover{opacity:1}' +
      '.sfqc-act-chat{background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe}' +
      '.sfqc-act-notice{background:#fef3c7;color:#92400e;border:1px solid #fde68a}' +
      '.sfqc-act-chat.has-unread{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.sfqc-tabs{display:flex;gap:6px;margin:0 0 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px}' +
      '.sfqc-tab{flex:0 0 auto;border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:999px;padding:8px 15px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;position:relative}' +
      '.sfqc-tab.on{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.sfqc-tab-badge{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;vertical-align:middle}' +
      'body.dark .sfqc-tab{background:#1e293b;color:#cbd5e1;border-color:#334155}' +
      '.sfqc-dm{display:flex;align-items:center;gap:10px;justify-content:space-between;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:8px}' +
      '.sfqc-dm.unread{border-color:#c7d2fe;background:#f5f7ff}' +
      '.sfqc-dm-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1}' +
      '.sfqc-dm-name{font-weight:700;font-size:14px;white-space:nowrap;color:#0f172a;flex:0 0 auto}' +
      '.sfqc-dm-badge{flex:0 0 auto;min-width:18px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;text-align:center}' +
      '.sfqc-dm-prev{color:#64748b;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}' +
      '.sfqc-dm-act{display:flex;align-items:center;gap:6px;flex:0 0 auto}' +
      '.sfqc-dm-act button{border:none;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}' +
      '.sfqc-dm-time{font-size:10px;color:#94a3b8;white-space:nowrap}' +
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
      '.sfqc-acc-access{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:6px;white-space:nowrap}' +
      '.sfqc-acc-access.ok{background:#dcfce7;color:#15803d}' +
      '.sfqc-acc-access.pend{background:#fef9c3;color:#854d0e}' +
      '.sfqc-acc-access.block{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-acc-access.maint{background:#ffedd5;color:#9a3412}' +
      '.sfqc-acc-access.none{background:#e2e8f0;color:#475569}' +
      '.sfqc-act-approve{background:#dcfce7;color:#15803d}' +
      '.sfqc-act-block{background:#fee2e2;color:#b91c1c}' +
      '.sfqc-act-maint{background:#ffedd5;color:#9a3412}' +
      '.sfqc-act-maint.on{background:#9a3412;color:#fff}' +
      '.sfqc-act-reject{background:#fef3c7;color:#92400e}' +
      '.sfqc-app-list{display:flex;flex-direction:column;gap:8px;margin-bottom:4px}' +
      '.sfqc-app-item{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:10px;padding:10px 12px}' +
      '.sfqc-app-item.is-block{border-left-color:#ef4444}' +
      '.sfqc-app-info{flex:1;min-width:160px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
      '.sfqc-app-name{font-weight:800;font-size:14px}' +
      '.sfqc-app-actions{display:flex;gap:6px}' +
      '.sfqc-app-actions button{border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:800;cursor:pointer}' +
      'body.dark .sfqc-app-item{background:#1e293b;border-color:#334155}' +
      '#sfqc-badge-dot{display:none;width:9px;height:9px;border-radius:50%;background:#ef4444;margin-left:3px;box-shadow:0 0 0 2px #fff;vertical-align:middle}' +
      '#sfqc-admin-btn.has-pending{color:#b45309}' +
      '.sfqc-admin-badge{display:inline-block;background:#ef4444;color:#fff;font-size:10px;font-weight:800;border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}' +
      '.sfqc-acc-head{gap:10px}' +
      '.sfqc-acc-stats{gap:6px 12px;font-size:11.5px}' +
      '.sfqc-del-doc{margin:6px 0 10px;background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:800;cursor:pointer}';
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

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
        '<span class="sfqc-privacy-note">🔐 不正利用の確認とアカウント管理のため、承認後のログイン時に、マスク済みIP・接続元の国/地域と回線組織・ブラウザ/OS・端末識別子・アクセス日時の直近' + networkRetainDays() + '日分を保存対象とします。接続判定にはCloudflareとipwho.isを利用します。生のIPは保存せず、判定結果は管理者だけが確認します。</span>' +
      '</div>';
  }
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
        '<button id="sfqc-network-info" type="button">🔐 接続情報について</button>' +
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
          '<button id="sfqc-lock-home" class="sfqc-btn sfqc-btn-primary" style="display:none">ホームへ戻る</button>' +
          '<button id="sfqc-lock-reload" class="sfqc-btn sfqc-btn-ghost">再確認</button>' +
          '<button id="sfqc-lock-logout" class="sfqc-btn sfqc-btn-ghost">ログアウト</button>' +
        '</div>' +
        '<p class="sfqc-hint">⚠️ サーバーの関係で、管理・制限を行う場合があります。<br>詳しくは管理者にお尋ねください。</p>' +
      '</div>';
    document.body.appendChild(elLock);

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

    var compose = document.createElement('div');
    compose.id = 'sfqc-compose';
    compose.innerHTML = '<div class="sfqc-cmp-card" id="sfqc-cmp-card"></div>';
    compose.addEventListener('click', function (e) { if (e.target === compose) closeCompose(); });
    document.body.appendChild(compose);

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
      var go = document.getElementById('sfqc-gohome');
      if (go) go.addEventListener('click', function () { location.href = HOME_URL; });
    } else {
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

    var badgeToggle = document.getElementById('sfqc-badge-toggle');
    if (badgeToggle) badgeToggle.addEventListener('click', function (e) { e.stopPropagation(); elBadge.classList.toggle('open'); });
    document.addEventListener('click', function (e) { if (elBadge && !elBadge.contains(e.target)) elBadge.classList.remove('open'); });

    document.getElementById('sfqc-logout').addEventListener('click', function () { elBadge.classList.remove('open'); doLogout(); });
    document.getElementById('sfqc-network-info').addEventListener('click', function () {
      elBadge.classList.remove('open');
      alert('接続情報について\n\n不正利用の確認とアカウント管理のため、承認済みアカウントのログイン時に次の情報を記録します。\n\n・末尾を伏せたIPアドレス（生のIPは保存しません）\n・接続元の国/地域、回線組織、ASN\n・企業回線/VPN/クラウド回線の参考判定\n・ブラウザ、OS、言語、タイムゾーン、画面サイズ\n・アカウントとブラウザの組み合わせごとのランダムな端末識別子\n・アクセス日時\n\n接続判定にはCloudflareとipwho.isを利用し、直近' + networkRetainDays() + '日分を保存対象とします。管理者だけが確認でき、判定だけで利用を自動停止することはありません。');
    });
    elAdminBtn.addEventListener('click', function () { elBadge.classList.remove('open'); openAdmin(); });
    document.getElementById('sfqc-adm-close').addEventListener('click', closeAdmin);
    document.getElementById('sfqc-adm-reload').addEventListener('click', loadAdmin);
    document.getElementById('sfqc-adm-broadcast').addEventListener('click', function () { openCompose({ mode: 'broadcast' }); });
    document.getElementById('sfqc-adm-csv').addEventListener('click', exportCsv);

    document.getElementById('sfqc-lock-logout').addEventListener('click', doLogout);
    document.getElementById('sfqc-lock-reload').addEventListener('click', function () { if (currentUser) onLogin(currentUser); });
    document.getElementById('sfqc-lock-home').addEventListener('click', function () { location.href = HOME_URL; });
    document.getElementById('sfqc-lock-apply').addEventListener('click', doApplyAccess);
    var lockName = document.getElementById('sfqc-lock-name');
    if (lockName) lockName.addEventListener('keydown', function (e) { if (e.key === 'Enter') doApplyAccess(); });
  }

  function showOverlay() { if (elOverlay) elOverlay.classList.add('show'); }
  function hideOverlay() { if (elOverlay) elOverlay.classList.remove('show'); }
  function showLock(state, info) {
    if (!elLock) return;
    showChatFab(false);
    info = info || {};
    var t = document.getElementById('sfqc-lock-title');
    var s = document.getElementById('sfqc-lock-sub');
    var form = document.getElementById('sfqc-lock-form');
    var nameIn = document.getElementById('sfqc-lock-name');
    var lockMsg = document.getElementById('sfqc-lock-msg');
    var blocked = (state === 'blocked');
    lockedAccess = state;
    var showForm = (state !== 'adminonly');
    var adminOnly = (state === 'adminonly');
    var applyBtn = document.getElementById('sfqc-lock-apply');
    var reloadBtn = document.getElementById('sfqc-lock-reload');
    var homeBtn = document.getElementById('sfqc-lock-home');
    if (reloadBtn) reloadBtn.style.display = adminOnly ? 'none' : '';
    if (homeBtn) homeBtn.style.display = adminOnly ? '' : 'none';
    if (state === 'blocked') {
      if (t) t.textContent = '🚫 利用が停止されています';
      if (s) s.innerHTML = info.applied
        ? 'このアカウントは現在ご利用いただけません。<br>解除の申請を受け付けています。管理者の対応をお待ちください。'
        : 'このアカウントは現在ご利用いただけません。<br>解除をご希望の場合は、下のフォームにお名前を入れて「解除を申請」してください。';
    } else if (state === 'error') {
      if (t) t.textContent = '⚠️ 確認できませんでした';
      if (s) s.innerHTML = 'アクセス権を確認できませんでした。<br>通信環境を確認して「再確認」を押してください。';
    } else if (state === 'adminonly') {
      if (t) t.textContent = '🔒 この資格は管理者専用です';
      if (s) s.innerHTML = 'この資格は現在、管理者のみご利用いただけます。<br>ホームに戻って他の資格をご利用ください。';
    } else if (info.expired && !info.applied) {
      if (t) t.textContent = '⏳ 利用承認が失効しました';
      if (s) s.innerHTML = INACTIVE_DAYS + '日以上ご利用がなかったため、利用承認が解除されました。<br>下のフォームにお名前を入れて、もう一度「利用を申請」してください（学習の進捗は残っています）。';
    } else if (info.applied) {
      if (t) t.textContent = '⏳ 承認をお待ちください';
      if (s) s.innerHTML = 'ご利用の申請を受け付けています。<br>管理者が承認するとご利用いただけます（承認されたら「再確認」）。';
    } else {
      if (t) t.textContent = '✋ 利用の申請をしてください';
      if (s) s.innerHTML = 'ご利用には管理者の承認が必要です。<br>下のフォームにお名前を入れて「利用を申請」してください。';
    }
    if (form) form.style.display = showForm ? '' : 'none';
    if (applyBtn) applyBtn.textContent = blocked ? 'この内容で解除を申請する' : 'この内容で利用を申請する';
    if (showForm && nameIn) {
      nameIn.value = '';
      if (lockMsg) {
        if (info.applied) {
          lockMsg.textContent = blocked ? '解除を申請済みです（入力すると再申請できます）。' : '申請済みです（入力すると再申請できます）。';
          lockMsg.className = 'sfqc-msg ok';
        } else { lockMsg.textContent = ''; lockMsg.className = 'sfqc-msg'; }
      }
    }
    hideOverlay();
    elLock.classList.add('show');
    accessLocked = true;
    setStatus('');
  }
  function hideLock() { if (elLock) elLock.classList.remove('show'); accessLocked = false; lockedAccess = ''; }

  function doApplyAccess() {
    if (!currentUser || !db) return;
    var nameIn = document.getElementById('sfqc-lock-name');
    var lockMsg = document.getElementById('sfqc-lock-msg');
    var nm = (nameIn ? nameIn.value : '').trim();
    if (!nm) { if (lockMsg) { lockMsg.textContent = 'お名前を入力してください。'; lockMsg.className = 'sfqc-msg err'; } return; }
    var isBlocked = (lockedAccess === 'blocked');
    if (lockMsg) { lockMsg.textContent = '申請中…'; lockMsg.className = 'sfqc-msg'; }
    var rec = { name: nm, email: currentEmail, req: { name: nm, ts: Date.now(), unblock: isBlocked }, updated: Date.now() };
    if (!isBlocked) rec.access = 'pending';
    db.collection(COLLECTION).doc(currentUser.uid).set(rec, { merge: true })
      .then(function () {
        currentName = nm; setBadge(nm);
        if (lockMsg) {
          lockMsg.textContent = isBlocked ? '解除の申請を受け付けました。管理者の対応をお待ちください。' : '申請を受け付けました。承認をお待ちください。';
          lockMsg.className = 'sfqc-msg ok';
        }
        notifyAdminMail(isBlocked ? 'unblock' : 'apply',
          { name: nm, id: idOf(currentEmail), at: fmtDateTime(Date.now()) });
      })
      .catch(function (e) {
        if (lockMsg) { lockMsg.textContent = '申請に失敗しました（' + (e && e.code || 'error') + '）。'; lockMsg.className = 'sfqc-msg err'; }
      });
  }
  function setMsg(t, kind) { if (elMsg) { elMsg.textContent = t || ''; elMsg.className = 'sfqc-msg' + (kind ? ' ' + kind : ''); } }
  function setStatus(t) { if (elStatus) elStatus.textContent = t || ''; notifyAccount(); }
  function setBadge(name) {
    if (!elBadge) return;
    if (name) { document.getElementById('sfqc-name').textContent = '👤 ' + name; if (ROLE !== 'client') elBadge.classList.add('show'); }
    else { elBadge.classList.remove('show'); }
    notifyAccount();
  }
  function notifyAccount() { if (window.__sfqOnAccount) { try { window.__sfqOnAccount(); } catch (e) {} } }
  function showAdminBtn(v) { if (elAdminBtn) elAdminBtn.classList[v ? 'add' : 'remove']('show'); }
  function setAdminPending(n) {
    adminPendingCount = n || 0;
    if (elAdminBtn) {
      elAdminBtn.innerHTML = '👑 管理者ビュー' + (adminPendingCount > 0 ? '<span class="sfqc-admin-badge">申請 ' + adminPendingCount + '</span>' : '');
      elAdminBtn.classList[adminPendingCount > 0 ? 'add' : 'remove']('has-pending');
    }
    var dot = document.getElementById('sfqc-badge-dot');
    if (dot) dot.style.display = (adminPendingCount > 0 && isAdmin) ? 'inline-block' : 'none';
  }
  function watchAdminPending() {
    if (!isAdmin || !db) return;
    if (adminPendingUnsub) { adminPendingUnsub(); adminPendingUnsub = null; }
    adminPendingUnsub = db.collection(COLLECTION).onSnapshot(function (snap) {
      var n = 0;
      snap.forEach(function (d) {
        if (currentUser && d.id === currentUser.uid) return;
        var data = d.data() || {};
        if ((data.access || 'pending') !== 'approved' && data.req && data.req.ts) n++;
      });
      setAdminPending(n);
    }, function () {});
  }
  function stopAdminPending() {
    if (adminPendingUnsub) { adminPendingUnsub(); adminPendingUnsub = null; }
  }
  function busy(b) { if (elLogin) elLogin.disabled = b; if (elSignup) elSignup.disabled = b; }

  function showSWUpdateToast() {
    if (document.getElementById('sfqc-swtoast')) return;
    var t = document.createElement('div'); t.id = 'sfqc-swtoast';
    t.innerHTML = '<span>🔄 新しいバージョンがあります</span>' +
      '<button class="sfqc-swtoast-btn" id="sfqc-swtoast-go">今すぐ更新</button>' +
      '<button class="sfqc-swtoast-x" id="sfqc-swtoast-x" aria-label="閉じる">×</button>';
    document.body.appendChild(t);
    try { requestAnimationFrame(function () { t.classList.add('show'); }); } catch (e) { t.classList.add('show'); }
    var go = document.getElementById('sfqc-swtoast-go');
    if (go) go.addEventListener('click', function () { try { location.reload(); } catch (e) { location.href = location.href; } });
    var x = document.getElementById('sfqc-swtoast-x');
    if (x) x.addEventListener('click', function () { t.classList.remove('show'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); });
  }
  function setupSWUpdate() {
    if (!('serviceWorker' in navigator)) return;
    try {
      navigator.serviceWorker.ready.then(function (reg) {
        if (!reg) return;
        if (reg.waiting && navigator.serviceWorker.controller) showSWUpdateToast();
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showSWUpdateToast();
          });
        });
      }).catch(function () {});
    } catch (e) {}
  }

  function idToEmail(id) { var c = sanitizeId(id); return c ? c + '@' + LOGIN_DOMAIN : ''; }
  function idOf(email) { return String(email || '').split('@')[0]; }
  function configOk() {
    return !!(CFG && CFG.apiKey && CFG.apiKey.indexOf('ここに') < 0 &&
              CFG.apiKey !== 'YOUR_API_KEY' && CFG.projectId && CFG.projectId.indexOf('ここに') < 0);
  }
  function emptyStore() { return { bm: [], hist: {}, streak: 0, vm: {}, tbm: {} }; }
  function toastSafe(t) { try { if (typeof window.toast === 'function') window.toast(t); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) {
    try { var p = new URL(String(u == null ? '' : u), self.location ? self.location.href : 'https://x/'); return /^https?:$/.test(p.protocol) ? p.href : ''; }
    catch (e) { return ''; }
  }
  function csvCell(x) {
    var v = String(x == null ? '' : x);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
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

    var today = (function () { var d = new Date(); var p = function (n) { return ('0' + n).slice(-2); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
    var srsAll = store.srs || {}, srsKeys = Object.keys(srsAll), srsDue = 0;
    srsKeys.forEach(function (k) { var s = srsAll[k]; if (s && (s.due || '9999-99-99') <= today) srsDue++; });

    var vm = store.vm || {}, vmMastered = 0, vmLearning = 0;
    Object.keys(vm).forEach(function (k) { var v = vm[k]; if (v >= 2) vmMastered++; else if (v >= 1) vmLearning++; });

    var tbm = store.tbm || {}, tbmBm = 0, tbmDone = 0;
    Object.keys(tbm).forEach(function (k) { var v = tbm[k]; if (v === 1) tbmBm++; else if (v === 2) tbmDone++; });

    var notes = store.notes || {}, notesCount = Object.keys(notes).filter(function (k) { return (notes[k] || '').trim(); }).length;

    var FULL_N = (window.CERT_CONFIG && CERT_CONFIG.examN) || 60;
    var exams = store.exams || [], examCount = exams.length;
    var examBest = 0, examPassed = 0, examLastTs = 0, examFull = 0, examFullPassed = 0;
    exams.forEach(function (e) {
      if ((e.pct || 0) > examBest) examBest = e.pct;
      if (e.pass) examPassed++;
      if ((e.n || FULL_N) === FULL_N) { examFull++; if (e.pass) examFullPassed++; }
      if ((e.ts || 0) > examLastTs) examLastTs = e.ts;
    });

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
      studySec: (store.time && typeof store.time.tot === 'number') ? store.time.tot : 0
    };
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec < 60) return sec + '秒';
    var m = Math.round(sec / 60);
    if (m < 60) return m + '分';
    var h = Math.floor(m / 60), mm = m % 60;
    return h + '時間' + (mm ? mm + '分' : '');
  }

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
    stopAccessWatch();
    stopAdminPending();
    stopUserMessaging();
    stopPresence();
    if (window.__setStore) window.__setStore(emptyStore());
    if (window.__refreshUI) window.__refreshUI();
    auth.signOut();
  }


  var MAIL_KINDS = {
    apply:   '📩 利用申請がありました',
    unblock: '📩 停止解除の申請がありました',
    dm:      '💬 利用者からメッセージが届きました',
    test:    '✅ メール通知のテストです'
  };
  var MAIL_THROTTLE_MS = 5 * 60000;

  function mailCfg() {
    var c = window.SFQ_EMAILJS;
    if (!c || !c.serviceId || !c.templateId || !c.publicKey) return null;
    return c;
  }
  function mailEnabled() { return !!mailCfg(); }
  function mailThrottled(kind, now) {
    if (kind === 'test') return false;
    var k = 'sfq_mailed_' + kind, prev = 0;
    try { prev = parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (e) {}
    if (prev && (now - prev) < MAIL_THROTTLE_MS) return true;
    try { localStorage.setItem(k, String(now)); } catch (e) {}
    return false;
  }
  function mailParams(kind, info) {
    info = info || {};
    return {
      subject: MAIL_KINDS[kind] || 'お知らせ',
      kind: kind,
      user_name: info.name || '(名前未入力)',
      user_id: info.id || '',
      detail: info.detail || '',
      at: info.at || '',
      site: (typeof location !== 'undefined' && location.origin) ? location.origin : ''
    };
  }
  function notifyAdminMail(kind, info, cb) {
    var c = mailCfg();
    if (!c) { if (cb) cb(false, 'メール通知が未設定です（firebase-config.js の SFQ_EMAILJS）'); return; }
    if (mailThrottled(kind, Date.now())) { if (cb) cb(false, '送信間隔の制限中'); return; }
    var body = {
      service_id: c.serviceId, template_id: c.templateId, user_id: c.publicKey,
      template_params: mailParams(kind, info)
    };
    try {
      fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(function (r) {
        if (r.ok) { try { console.info('[mail] sent ok:', kind); } catch (e) {} if (cb) cb(true, ''); return; }
        r.text().then(function (tx) { try { console.warn('[mail] send failed:', kind, 'HTTP', r.status, (tx || '').slice(0, 200)); } catch (e) {} if (cb) cb(false, 'HTTP ' + r.status + ' ' + (tx || '').slice(0, 100)); },
                      function () { try { console.warn('[mail] send failed:', kind, 'HTTP', r.status); } catch (e) {} if (cb) cb(false, 'HTTP ' + r.status); });
      }).catch(function (e) { try { console.warn('[mail] send error:', kind, (e && e.message) || e); } catch (_) {} if (cb) cb(false, (e && e.message) || '送信できませんでした'); });
    } catch (e) { if (cb) cb(false, (e && e.message) || '送信できませんでした'); }
  }
  function sendMailTest() {
    if (!isAdmin) { alert('管理者アカウントでログインしてから実行してください。'); return; }
    toastSafe('テストメールを送信中…');
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    notifyAdminMail('test', {
      name: currentName || 'admin', id: idOf(currentEmail), at: fmtDateTime(Date.now()),
      detail: 'これはメール通知の設定確認用のテスト送信です。'
    }, function (ok, err) {
      if (ok) {
        alert('EmailJS はテスト送信を受け付けました（HTTP OK）。\n\n' +
          '数分待っても届かない場合、原因は EmailJS 側か受信側です。次を確認してください:\n' +
          '① Gmail の「迷惑メール」「プロモーション」「すべてのメール」を確認\n' +
          '② EmailJS ダッシュボード → Email History で送信履歴と配信状況を確認\n' +
          '③ Email Services で Gmail 連携が Connected か（期限切れで切れると「以前は届いたのに来ない」状態になります。再接続してください）\n' +
          '④ テンプレートの「To Email」が管理者アドレスになっているか');
      } else {
        alert('テスト送信に失敗しました:\n' + err + '\n\n確認してください:\n' +
          '・EmailJS の Service ID / Template ID / Public Key\n' +
          '・Allowed origins に ' + (origin || 'このサイトのURL') + ' を許可\n' +
          '・無料枠（200通/月）を超過していないか（EmailJS の Usage）');
      }
    });
  }

  var INACTIVE_DAYS = 30;
  var INACTIVE_MS = INACTIVE_DAYS * 86400000;
  var expiredNotice = false;

  function lastActiveAt(data) {
    if (!data) return 0;
    return Math.max(data.lastSeen || 0, data.lastLogin || 0, data.approvedAt || 0);
  }
  function accessExpired(data, now) {
    if (!data || data.access !== 'approved') return false;
    var t = lastActiveAt(data);
    if (!t) return false;
    return (now - t) > INACTIVE_MS;
  }
  function inactiveDaysOf(data, now) {
    var t = lastActiveAt(data);
    return t ? Math.floor((now - t) / 86400000) : 0;
  }
  function expireOwnAccess(uid, data) {
    var now = Date.now();
    try { localStorage.removeItem('sfq_access_' + uid); } catch (e) {}
    expiredNotice = true;
    var payload = { access: 'pending', expiredAt: now, expiredDays: inactiveDaysOf(data, now), updated: now };
    try { payload.req = firebase.firestore.FieldValue.delete(); } catch (e) {}
    db.collection(COLLECTION).doc(uid).set(payload, { merge: true })
      .catch(function () {})
      .then(function () { doLogout(); });
  }

  function cacheApproval(uid) {
    try { localStorage.setItem('sfq_access_' + uid, JSON.stringify({ v: 'approved', ts: Date.now() })); } catch (e) {}
  }
  function cachedApprovalValid(uid, now) {
    var raw = '';
    try { raw = localStorage.getItem('sfq_access_' + uid) || ''; } catch (e) {}
    if (!raw) return false;
    if (raw === 'approved') return true;
    try {
      var o = JSON.parse(raw);
      return !!(o && o.v === 'approved' && o.ts && (now - o.ts) <= INACTIVE_MS);
    } catch (e) { return false; }
  }

  function docPayload(store) { return { store: store, name: currentName, email: currentEmail, updated: Date.now() }; }

  function saveCertStore(uid, st) {
    var ref = db.collection(COLLECTION).doc(uid);
    var FP = firebase.firestore.FieldPath;
    return ref.update(new FP('stores', CERT_KEY), st, 'name', currentName, 'email', currentEmail, 'updated', Date.now())
      .catch(function () {
        var obj = { stores: {}, name: currentName, email: currentEmail, updated: Date.now() };
        obj.stores[CERT_KEY] = st;
        return ref.set(obj, { merge: true });
      });
  }

  function onLogin(user) {
    currentUser = user;
    currentEmail = user.email || '';
    currentName = currentEmail.split('@')[0];
    isAdmin = matchAdmin(ADMIN_HASHES, ADMIN_IDS, currentName);
    setBadge(currentName); showAdminBtn(isAdmin);
    busy(false);
    flushPendingFeedback();

    setStatus('確認中…');
    if (!isAdmin) startAccessWatch(user.uid);
    db.collection(COLLECTION).doc(user.uid).get().then(function (doc) {
      var data = (doc.exists && doc.data()) || {};

      if (!isAdmin) {
        var acc = data.access;
        if (accessExpired(data, Date.now())) { expireOwnAccess(user.uid, data); return; }
        if (acc !== 'approved') {
          try { localStorage.removeItem('sfq_access_' + user.uid); } catch (e) {}
          if (!doc.exists) {
            db.collection(COLLECTION).doc(user.uid).set(
              { access: 'pending', name: currentName, email: currentEmail, updated: Date.now() },
              { merge: true }
            ).catch(function () {});
          }
          showLock(acc || 'pending', { reqName: (data.req && data.req.name) || data.name || '',
            applied: !!(data.req && data.req.ts), expired: !!data.expiredAt });
          return;
        }
      }
      if (window.SFQ_ADMIN_ONLY && !isAdmin) {
        showLock('adminonly');
        return;
      }
      hideLock();
      maintExempt = !!data.maintOk;
      publishProgress(data);
      if (isAdmin) watchAdminPending();
      cacheApproval(user.uid);
      recordLogin(user.uid, data);
      if (!isAdmin) recordNetworkVisit(user.uid);
      startPresence(user.uid);
      if (!isAdmin) startUserMessaging(user.uid);

      if (!window.__setStore) {
        setStatus(''); setMsg(''); if (elPw) elPw.value = '';
        hideOverlay();
        return;
      }

      setStatus('読込中…');
      var certStore = data.stores && data.stores[CERT_KEY];
      if (certStore) {
        window.__setStore(certStore);
        if (window.__refreshUI) window.__refreshUI();
        setStatus('同期済み');
      } else {
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
      surfaceReplies(data.fbReplies);
      syncNewsSeen(data);
    }).catch(function () {
      if (window.SFQ_ADMIN_ONLY && !isAdmin) { showLock('adminonly'); return; }
      if (!isAdmin && !cachedApprovalValid(user.uid, Date.now())) { showLock('error'); return; }
      hideLock();
      if (!window.__setStore) { setStatus(''); hideOverlay(); return; }
      hideOverlay(); setStatus('オフライン'); toastSafe('オフライン: ローカルの進捗を表示中');
    });
  }

  function publishProgress(data) {
    try {
      var acq = {}, lk = {};
      var stores = (data && data.stores) || {};
      Object.keys(stores).forEach(function (slug) {
        var s = stores[slug];
        if (s && s.acquiredDate) { acq[slug] = s.acquiredDate; if (s.acqLock) lk[slug] = 1; }
      });
      window.SFQ_IS_ADMIN = !!isAdmin;
      window.SFQ_PROGRESS = { acquired: acq, locked: lk, elective: (data && data.elective) || '' };
      window.dispatchEvent(new Event('sfq-progress'));
    } catch (e) {}
  }
  window.__cloudSetElective = function (slug) {
    if (!currentUser || !db) {
      try { localStorage.setItem('sfq_elective', slug); } catch (e) {}
      if (!window.SFQ_PROGRESS) window.SFQ_PROGRESS = { acquired: {}, elective: '' };
      window.SFQ_PROGRESS.elective = slug;
      try { window.dispatchEvent(new Event('sfq-progress')); } catch (e) {}
      return Promise.resolve();
    }
    return db.collection(COLLECTION).doc(currentUser.uid)
      .set({ elective: slug, updated: Date.now() }, { merge: true })
      .then(function () {
        if (!window.SFQ_PROGRESS) window.SFQ_PROGRESS = { acquired: {}, elective: '' };
        window.SFQ_PROGRESS.elective = slug;
        try { window.dispatchEvent(new Event('sfq-progress')); } catch (e) {}
      });
  };

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

  function syncNewsSeen(data) {
    try {
      var cloud = (data && data.newsSeen) || '';
      var local = localStorage.getItem('sfq_news_seen') || '';
      var newest = (cloud > local) ? cloud : local;
      if (newest && newest !== local) { try { localStorage.setItem('sfq_news_seen', newest); } catch (e) {} }
      if (local && local > cloud && currentUser && db) { db.collection(COLLECTION).doc(currentUser.uid).set({ newsSeen: local }, { merge: true }).catch(function () {}); }
      if (window.SFQ_syncNews) { try { window.SFQ_syncNews(); } catch (e) {} }
    } catch (e) {}
  }
  window.__cloudMarkNews = function (id) {
    if (!id || !currentUser || !db) return;
    db.collection(COLLECTION).doc(currentUser.uid).set({ newsSeen: id }, { merge: true }).catch(function () {});
  };


  function startAccessWatch(uid) {
    if (!db || !uid || isAdmin) return;
    if (accessUnsub) { accessUnsub(); accessUnsub = null; }
    watchedAccess = null;
    accessUnsub = db.collection(COLLECTION).doc(uid).onSnapshot(function (snap) {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      var d = (snap.exists && snap.data()) || {};
      var acc = d.access || 'pending';
      if (watchedAccess === null) { watchedAccess = acc; return; }
      if (acc === watchedAccess) return;
      var prev = watchedAccess; watchedAccess = acc;
      if (acc === 'approved' && prev !== 'approved') {
        onLogin(currentUser);
      } else {
        lockNowDueToAccess(acc, d);
      }
    }, function () {});
  }
  function stopAccessWatch() {
    if (accessUnsub) { accessUnsub(); accessUnsub = null; }
    watchedAccess = null;
  }
  function lockNowDueToAccess(acc, d) {
    try { if (currentUser) localStorage.removeItem('sfq_access_' + currentUser.uid); } catch (e) {}
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    stopUserMessaging();
    stopPresence();
    showLock(acc === 'blocked' ? 'blocked' : (acc || 'pending'),
      { reqName: (d && d.req && d.req.name) || (d && d.name) || currentName || '',
        applied: !!(d && d.req && d.req.ts), expired: !!(d && d.expiredAt) });
  }

  function startUserMessaging(uid) {
    if (!db || !uid || isAdmin) return;
    ownLoaded = false;
    showChatFab(true);
    if (ownDocUnsub) { ownDocUnsub(); ownDocUnsub = null; }
    ownDocUnsub = db.collection(COLLECTION).doc(uid).onSnapshot(function (snap) {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      var d = (snap.exists && snap.data()) || {};
      var mok = !!d.maintOk;
      if (mok !== maintExempt) { maintExempt = mok; checkMaintenance(); }
      lastNotices = Array.isArray(d.notices) ? d.notices : [];
      lastChat = Array.isArray(d.chat) ? d.chat : [];
      lastRead = (d.read && typeof d.read === 'object') ? d.read : {};
      ownLoaded = true;
      surfaceNotices();
      scheduleNoticeBoundary();
      surfaceReplies(d.fbReplies);
      refreshChatBadge();
      if (chatOpen && chatMode === 'user') renderChatMsgs();

      if (d.access && d.access !== 'approved') return;
      if (cloudDirty) return;
      publishProgress(d);
      if (window.__setStore) {
        var cs = d.stores && d.stores[CERT_KEY];
        if (cs) {
          try {
            var cur = window.__getStore && window.__getStore();
            if (JSON.stringify(cur) !== JSON.stringify(cs)) { window.__setStore(cs); if (window.__refreshUI) window.__refreshUI(); }
          } catch (e) {}
        }
      }
    }, function () {});
    if (broadcastUnsub) { broadcastUnsub(); broadcastUnsub = null; }
    broadcastUnsub = db.collection(BROADCAST_COL).onSnapshot(function (snap) {
      var arr = [];
      snap.forEach(function (d) {
        if (d.id === MAINT_DOC) { lastMaint = d.data() || null; return; }
        if (d.id === 'current') return;
        var x = d.data() || {}; if (!x.msg) return; x.id = d.id; arr.push(x);
      });
      lastBroadcasts = arr;
      surfaceNotices();
      scheduleNoticeBoundary();
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
    if (noticeBoundaryTimer) { clearTimeout(noticeBoundaryTimer); noticeBoundaryTimer = null; }
    lastBroadcasts = []; lastNotices = []; lastChat = []; lastRead = {}; lastMaint = null; ownLoaded = false;
    maintExempt = false;
    chatOpen = false; closeChat(); showChatFab(false);
    var mo = document.getElementById('sfqc-maint'); if (mo) mo.classList.remove('show');
    var mb = document.getElementById('sfqc-maint-banner'); if (mb) mb.classList.remove('show');
    applyBannerOffset(0);
  }

  function showChatFab(on) {
    var fab = document.getElementById('sfqc-chat-fab');
    if (fab) fab.classList[on ? 'add' : 'remove']('show');
  }

  function annDue(x, now) { return (x.publishAt || x.ts || 0) <= now; }
  function annUnread(x, map) { return ((map && map[x.id]) || 0) < (x.rev || x.ts || 0); }
  function surfaceNotices() {
    try {
      if (!ownLoaded) return;
      if (document.getElementById('sfqc-replies')) return;
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
  function scheduleNoticeBoundary() {
    if (noticeBoundaryTimer) { clearTimeout(noticeBoundaryTimer); noticeBoundaryTimer = null; }
    var now = Date.now(), next = 0;
    var consider = function (x) { var at = (x && (x.publishAt || x.ts)) || 0; if (at > now && (!next || at < next)) next = at; };
    lastBroadcasts.forEach(consider);
    (lastNotices || []).forEach(consider);
    if (!next) return;
    var delay = Math.max(500, Math.min(next - now + 250, 6 * 60 * 60 * 1000));
    noticeBoundaryTimer = setTimeout(function () {
      noticeBoundaryTimer = null;
      surfaceNotices();
      scheduleNoticeBoundary();
    }, delay);
  }
  function showNoticeModal(items, opts) {
    var preview = !!(opts && opts.preview);
    var old = document.getElementById('sfqc-replies'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div'); wrap.id = 'sfqc-replies';
    var rows = items.map(function (r) {
      return '<div class="sfqc-rep-item"><div class="sfqc-rep-ts">' + esc(r.title) + '・' + esc(fmtDate(r.ts)) + '</div><div class="sfqc-rep-msg">' + esc(r.msg) + '</div></div>';
    }).join('');
    wrap.innerHTML = '<div class="sfqc-card sfqc-rep-card">' +
        '<p class="sfqc-title">' + (preview ? '📢 お知らせのプレビュー' : '📢 管理者からのお知らせ') + '</p>' +
        '<p class="sfqc-sub">' + (preview ? 'これは利用者の画面に表示される内容です。' : '新しいお知らせが届きました。') + '</p>' +
        '<div class="sfqc-rep-list">' + rows + '</div>' +
        '<button class="sfqc-btn sfqc-btn-primary" id="sfqc-rep-ok" style="width:100%;margin-top:10px">' + (preview ? '閉じる' : '確認しました') + '</button>' +
      '</div>';
    document.body.appendChild(wrap);
    var onKey;
    var dismiss = function () {
      if (!preview) {
        var now = Date.now(), bcm = {}, ntm = {};
        items.forEach(function (r) { if (r.kind === 'bc') bcm[r.id] = now; else ntm[r.id] = now; });
        writeRead({ bcm: bcm, ntm: ntm });
      }
      document.removeEventListener('keydown', onKey);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } };
    document.addEventListener('keydown', onKey);
    var ok = document.getElementById('sfqc-rep-ok');
    if (ok) { ok.addEventListener('click', dismiss); try { ok.focus(); } catch (e) {} }
  }

  function chatUnreadCount(msgs, mode, uid) {
    var seen;
    if (mode === 'admin') seen = num(localStorage.getItem('sfq_chat_seen_adm_' + uid));
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
      if (mode === 'user') writeRead({ chat: max });
    } catch (e) {}
  }
  function writeRead(patch) {
    if (!db || !currentUser || isAdmin) return;
    var cur = lastRead || {}, out = {}, changed = false;
    ['bcm', 'ntm'].forEach(function (mk) {
      if (!patch[mk]) return;
      var curMap = (cur[mk] && typeof cur[mk] === 'object') ? cur[mk] : {};
      var outMap = {};
      Object.keys(patch[mk]).forEach(function (id) {
        var v = patch[mk][id] || 0; if (v && v > (curMap[id] || 0)) { outMap[id] = v; curMap[id] = v; }
      });
      if (Object.keys(outMap).length) { out[mk] = outMap; cur[mk] = curMap; changed = true; }
    });
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

  function openChat(uid, name, mode) {
    if (!uid) return;
    chatOpen = true; chatUid = uid; chatName = name || ''; chatMode = mode || 'user';
    var panel = document.getElementById('sfqc-chat');
    var title = document.getElementById('sfqc-chat-title');
    if (title) title.textContent = (mode === 'admin') ? ('💬 ' + (name || '利用者')) : '管理者とのチャット';
    if (panel) panel.classList.add('show');
    if (mode === 'admin') {
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
    lastChat = (lastChat || []).concat([rec]); renderChatMsgs();
    var ref = db.collection(COLLECTION).doc(chatUid);
    ref.set({ chat: FV.arrayUnion(rec) }, { merge: true }).then(function () {
      if (chatMode === 'admin') { try { logAdmin('チャット', (chatName || '') + '：' + rec.msg.slice(0, 20)); } catch (e) {} }
      else notifyAdminMail('dm', { name: currentName || '', id: idOf(currentEmail), detail: rec.msg.slice(0, 120), at: fmtDateTime(rec.ts) });
    }).catch(function (e) { alert('送信に失敗しました: ' + (e && e.message)); });
  }

  function msToLocalInput(ms) {
    if (!ms) return '';
    var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function localInputToMs(v) { if (!v) return 0; var t = new Date(v).getTime(); return isFinite(t) ? t : 0; }

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
      p.then(function () { logAdmin(composeCtx.id ? '一斉お知らせ編集' : '一斉お知らせ', (scheduled ? '[予約] ' : '') + msg.slice(0, 26)); if (!composeCtx.id) previewAnnouncement(msg); loadBroadcasts(function () { done(composeCtx && composeCtx.id ? '保存しました' : (scheduled ? '予約しました' : '送信しました')); }); }).catch(fail);
    } else if (composeCtx.uids) {
      var rec3 = function () { return { id: 'n' + Date.now() + Math.floor(Math.random() * 100000), msg: msg, ts: now, rev: now, publishAt: publishAt, by: currentName || 'admin' }; };
      Promise.all(composeCtx.uids.map(function (uid) {
        var uu = findUser(uid); var arr2 = (uu && Array.isArray(uu.notices)) ? uu.notices.slice() : []; var r = rec3(); arr2.push(r);
        return db.collection(COLLECTION).doc(uid).set({ notices: arr2 }, { merge: true }).then(function () { if (uu) uu.notices = arr2; return true; }).catch(function () { return false; });
      })).then(function (res) {
        var n = res.filter(Boolean).length; adminSelUsers = {};
        logAdmin('一括個別お知らせ', n + '人：' + msg.slice(0, 14));
        previewAnnouncement(msg);
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
        if (!composeCtx.id) previewAnnouncement(msg);
        done(composeCtx.id ? '保存しました' : (scheduled ? '予約しました' : '送信しました'));
      }).catch(function (e) { alert('保存に失敗しました: ' + (e && e.message)); });
    }
  }
  function previewAnnouncement(msg) {
    var n = Date.now();
    showNoticeModal([{ kind: 'bc', id: 'preview', title: '📢 お知らせ', msg: msg, ts: n, rev: n }], { preview: true });
  }
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
  function loadBroadcasts(cb) {
    if (!db) { if (cb) cb(); return; }
    db.collection(BROADCAST_COL).get().then(function (snap) {
      var arr = [];
      snap.forEach(function (d) { if (d.id === MAINT_DOC || d.id === 'current') return; var x = d.data() || {}; if (!x.msg) return; x.id = d.id; arr.push(x); });
      adminBroadcasts = arr; if (cb) cb();
    }).catch(function () { if (cb) cb(); });
  }

  function maintQueue(cfg) {
    if (!cfg) return [];
    if (Array.isArray(cfg.queue)) return cfg.queue;
    if (Array.isArray(cfg.windows)) return (cfg.enabled === false) ? [] : cfg.windows;
    return [];
  }
  function maintEntryInfo(cfg, w) {
    var g = cfg || {};
    return {
      id: (w && w.id) || g.id || '',
      msg: (w && w.msg) || g.msg || '',
      tasks: (w && Array.isArray(w.tasks) && w.tasks.length) ? w.tasks : (Array.isArray(g.tasks) ? g.tasks : []),
      preMsg: (w && w.preMsg) || g.preMsg || '',
      preMin: (w && w.preMin != null) ? w.preMin : ((g.preMin != null) ? g.preMin : 60)
    };
  }
  function maintRecurInfo(cfg, occMs) {
    var r = (cfg && cfg.recurring) || {};
    return {
      id: r.id || ('MNT-' + maintDateStr(occMs) + '-R'),
      msg: r.msg || (cfg && cfg.msg) || '',
      tasks: (Array.isArray(r.tasks) && r.tasks.length) ? r.tasks : ((cfg && cfg.tasks) || []),
      preMsg: r.preMsg || (cfg && cfg.preMsg) || '',
      preMin: (r.preMin != null) ? r.preMin : ((cfg && cfg.preMin != null) ? cfg.preMin : 60)
    };
  }
  function maintStatus(cfg, now) {
    var res = { active: false, end: 0, upcoming: 0, upEnd: 0, full: false, entry: null, upEntry: null };
    if (!cfg) return res;
    if (cfg.fullStop) { res.active = true; res.full = true; res.entry = maintEntryInfo(cfg, null); return res; }
    maintQueue(cfg).forEach(function (w) {
      if (!w || !w.start || !w.end) return;
      if (now >= w.start && now < w.end) { res.active = true; if (w.end > res.end) { res.end = w.end; res.entry = maintEntryInfo(cfg, w); } }
      else if (w.start > now && (!res.upcoming || w.start < res.upcoming)) { res.upcoming = w.start; res.upEnd = w.end; res.upEntry = maintEntryInfo(cfg, w); }
    });
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
  var MAINT_TASK_TEMPLATES = [
    { label: '🔧 定期メンテ', tasks: ['データベースの最適化', 'サーバー構成の更新', 'セキュリティ更新の適用'] },
    { label: '🚀 機能リリース', tasks: ['新機能のリリース', 'データ移行と整合性チェック', 'リリース後の動作確認'] },
    { label: '🚨 緊急対応', tasks: ['緊急セキュリティパッチの適用', '障害原因の調査と復旧', '影響範囲の確認'] },
    { label: '🗄️ DB作業', tasks: ['データベースのバックアップ', 'インデックスの再構築', 'パフォーマンスの改善'] },
    { label: '🧹 クリア', tasks: [] }
  ];
  function maintDateStr(ms) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).replace(/-/g, ''); }
    catch (e) { var d = new Date(ms); return '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  }
  function maintAutoNumberEntry(baseMs) {
    var d = maintDraft; if (!d) return;
    var ds = maintDateStr(baseMs || Date.now());
    var seq = (d.idDate === ds) ? ((+d.idSeq || 0) + 1) : 1;
    d.idDate = ds; d.idSeq = seq;
    d.entry.id = 'MNT-' + ds + '-' + ('0' + seq).slice(-2);
  }
  var maintDraft = null;
  function maintenanceSectionHTML() {
    var m = lastMaint, html = '<div class="sfqc-sec">🛠 メンテナンス</div><div class="sfqc-bc-card">';
    var full = !!(m && m.fullStop);
    html += '<div class="sfqc-bc-meta" style="margin-bottom:8px">' +
        '<button class="sfqc-mini" id="sfqc-fullstop" style="background:' + (full ? '#16a34a' : '#dc2626') + ';color:#fff">' + (full ? '✅ 全停止を解除' : '🚨 今すぐ全停止') + '</button>' +
        '<span style="font-weight:700;color:' + (full ? '#dc2626' : '#15803d') + '">' + (full ? '🔴 緊急全停止中（全利用者をロック）' : '🟢 通常稼働中') + '</span>' +
      '</div>';
    var nowMs = Date.now();
    var st = maintStatus(m, nowMs);
    var status = (st.active && !st.full) ? ('🔴 メンテナンス中' + (st.entry && st.entry.id ? '（' + st.entry.id + '）' : '') + ' 終了予定 ' + fmtDate(st.end))
      : (st.upcoming ? ('🟡 次回予定 ' + fmtDate(st.upcoming) + (st.upEntry && st.upEntry.id ? '（' + st.upEntry.id + '）' : '')) : '🟢 直近の予定なし');
    html += '<div class="sfqc-bc-msg">' + esc(status) + '</div>';
    var future = maintQueue(m).filter(function (w) { return w && w.end > nowMs; });
    var rec = (m && m.recurring && m.recurring.enabled)
      ? '毎週 ' + (m.recurring.dows || []).map(dowLabel).join('・') + ' ' + esc(m.recurring.start) + 'から' + m.recurring.durMin + '分'
      : '無効';
    html += '<div class="sfqc-bc-meta"><span>🗓 都度メンテ：キュー <b>' + future.length + '</b> 件</span>' +
        '<span style="display:flex;gap:6px"><button class="sfqc-mini" id="sfqc-maint-new">➕ 新規作成</button>' +
        '<button class="sfqc-mini" id="sfqc-maint-queue">📋 キューを管理</button></span></div>' +
      '<div class="sfqc-bc-meta"><span>🔁 定期メンテ：' + esc(rec) + '</span>' +
        '<button class="sfqc-mini" id="sfqc-maint-edit-recur">⚙️ 定期メンテを管理</button></div>';
    var exempts = adminUsers.filter(function (u) { return u.maintOk; });
    html += '<div class="sfqc-bc-meta"><span>🛠 メンテ中も利用可：<b>' + exempts.length + '</b> 人' +
        (exempts.length ? '（' + esc(exempts.slice(0, 5).map(function (u) { return u.name || u.uid; }).join('・')) + (exempts.length > 5 ? ' ほか' : '') + '）' : '') +
      '</span><span style="color:#64748b">ユーザータブの「🛠 メンテ許可」で切替</span></div>';
    return html + '</div>' + mailSectionHTML();
  }
  function mailSectionHTML() {
    var on = mailEnabled();
    return '<div class="sfqc-sec">✉️ メール通知</div><div class="sfqc-bc-card">' +
      '<div class="sfqc-bc-meta">' +
        '<span style="font-weight:700;color:' + (on ? '#15803d' : '#b45309') + '">' + (on ? '🟢 有効' : '🟡 未設定') + '</span>' +
        '<button class="sfqc-mini" id="sfqc-mailtest"' + (on ? '' : ' disabled') + '>✉️ テスト送信</button>' +
      '</div>' +
      '<div class="sfqc-bc-msg">利用申請・停止解除の申請・利用者からのDM を管理者のメールへ知らせます。' +
        (on ? 'DMの通知は5分に1通までにまとめます。' : '有効にするには <b>firebase-config.js</b> の <b>SFQ_EMAILJS</b>（Service ID / Template ID / Public Key）を設定してください（手順はそのファイルのコメント）。') +
      '</div></div>';
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
  function buildMaintDraft() {
    var m = lastMaint || {};
    maintDraft = {
      queue: maintQueue(m).map(function (w) { return { id: w.id || '', start: w.start, end: w.end, msg: w.msg || '', tasks: Array.isArray(w.tasks) ? w.tasks.slice() : [], preMsg: w.preMsg || '', preMin: (w.preMin != null) ? w.preMin : 60 }; }),
      entry: { id: '', msg: '', tasks: [], preMsg: '', preMin: 60 },
      recurring: {
        enabled: !!(m.recurring && m.recurring.enabled),
        dows: (m.recurring && m.recurring.dows) ? m.recurring.dows.slice() : [],
        start: (m.recurring && m.recurring.start) || '02:00',
        durMin: (m.recurring && m.recurring.durMin) || 120,
        msg: (m.recurring && m.recurring.msg) || '',
        tasks: (m.recurring && Array.isArray(m.recurring.tasks)) ? m.recurring.tasks.slice() : [],
        preMsg: (m.recurring && m.recurring.preMsg) || '',
        preMin: (m.recurring && m.recurring.preMin != null) ? m.recurring.preMin : 60
      },
      preMsg: m.preMsg || '',
      preMin: (m.preMin != null) ? m.preMin : 60,
      msg: m.msg || '',
      tasks: Array.isArray(m.tasks) ? m.tasks.slice() : [],
      idDate: m.idDate || '',
      idSeq: +m.idSeq || 0,
      editIdx: -1, entryStart: 0, entryEnd: 0
    };
  }
  function openQueueNew() {
    if (!isAdmin) return;
    buildMaintDraft(); maintDraft.mode = 'queue-form'; maintDraft.editIdx = -1;
    maintDraft.entry = { id: '', msg: '', tasks: [], preMsg: '', preMin: 60 }; maintDraft.entryStart = 0; maintDraft.entryEnd = 0;
    maintAutoNumberEntry();
    composeCtx = { mode: 'maint' };
    document.getElementById('sfqc-compose').classList.add('show');
    renderMaintEditor();
  }
  function openQueueList() {
    if (!isAdmin) return;
    buildMaintDraft(); maintDraft.mode = 'queue-list';
    composeCtx = { mode: 'maint' };
    document.getElementById('sfqc-compose').classList.add('show');
    renderMaintEditor();
  }
  function editQueueEntry(i) {
    var d = maintDraft; if (!d || !d.queue[i]) return;
    var w = d.queue[i];
    d.entry = { id: w.id || '', msg: w.msg || '', tasks: Array.isArray(w.tasks) ? w.tasks.slice() : [], preMsg: w.preMsg || '', preMin: (w.preMin != null) ? w.preMin : 60 };
    d.entryStart = w.start; d.entryEnd = w.end; d.editIdx = i; d.mode = 'queue-form';
    renderMaintEditor();
  }
  function openRecurringEditor() {
    if (!isAdmin) return;
    buildMaintDraft(); maintDraft.mode = 'recurring';
    composeCtx = { mode: 'maint' };
    document.getElementById('sfqc-compose').classList.add('show');
    renderMaintEditor();
  }
  function maintTplBtns(tgt) { return MAINT_TASK_TEMPLATES.map(function (t, i) { return '<button class="sfqc-mini" type="button" data-tpl="' + tgt + ':' + i + '">' + esc(t.label) + '</button>'; }).join(''); }
  function maintSplitTasks(v) { return (v || '').split('\n').map(function (s) { return s.trim().slice(0, 80); }).filter(Boolean).slice(0, 8); }
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
  function renderMaintEditor() {
    var d = maintDraft; if (!d) return;
    if (d.mode === 'recurring') renderMaintRecurring();
    else if (d.mode === 'queue-list') renderQueueList();
    else renderQueueForm();
  }
  function renderQueueForm() {
    var d = maintDraft; if (!d) return;
    var card = document.getElementById('sfqc-cmp-card');
    var editing = d.editIdx >= 0;
    card.innerHTML =
      '<h3>' + (editing ? '✏️ 都度メンテを編集' : '➕ 都度メンテを新規作成') + '</h3>' +
      '<label>対象期間</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
        '<input type="datetime-local" id="sfm-q-ws" value="' + esc(msToLocalInput(d.entryStart)) + '" style="flex:1;min-width:150px">' +
        '<input type="datetime-local" id="sfm-q-we" value="' + esc(msToLocalInput(d.entryEnd)) + '" style="flex:1;min-width:150px"></div>' +
      '<label>管理番号（自動採番・編集できます）</label>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<input type="text" id="sfm-q-id" value="' + esc(d.entry.id || '') + '" placeholder="MNT-YYYYMMDD-01" style="flex:1">' +
        '<button class="sfqc-mini" id="sfm-q-genid" type="button">🔄 自動採番</button></div>' +
      '<label>メッセージ（任意・空欄なら既定文を使用）</label>' +
      '<textarea id="sfm-q-msg" placeholder="このメンテナンス固有のメッセージ（空欄可）">' + esc(d.entry.msg || '') + '</textarea>' +
      '<label>作業内容（テンプレ適用後に編集できます）</label>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' + maintTplBtns('q') + '</div>' +
      '<textarea id="sfm-q-tasks" placeholder="データベースの最適化&#10;サーバー構成の更新&#10;セキュリティ更新の適用">' + esc((d.entry.tasks || []).join('\n')) + '</textarea>' +
      '<div class="sfqc-sec">🔔 予告（開始前のお知らせ）</div>' +
      '<label>予告メッセージ（空欄なら日時のみ表示）</label>' +
      '<textarea id="sfm-q-premsg" placeholder="例）まもなくメンテナンスを開始します。キリの良いところで学習を終えてください。">' + esc(d.entry.preMsg || '') + '</textarea>' +
      '<label>何分前から予告するか（0で予告なし）</label><input type="number" id="sfm-q-premin" min="0" value="' + (d.entry.preMin != null ? d.entry.preMin : 60) + '">' +
      '<div class="sfqc-cmp-row"><button class="sfqc-btn sfqc-btn-ghost" id="sfm-cancel">' + (editing ? '← キューへ戻る' : '閉じる') + '</button>' +
        '<button class="sfqc-btn sfqc-btn-primary" id="sfm-q-save">' + (editing ? '更新' : 'キューに追加') + '</button></div>';
    var pull = function () {
      var g = function (id) { return document.getElementById(id); };
      if (g('sfm-q-id')) d.entry.id = (g('sfm-q-id').value || '').trim().slice(0, 40);
      if (g('sfm-q-msg')) d.entry.msg = g('sfm-q-msg').value;
      if (g('sfm-q-tasks')) d.entry.tasks = maintSplitTasks(g('sfm-q-tasks').value);
      if (g('sfm-q-premsg')) d.entry.preMsg = g('sfm-q-premsg').value;
      if (g('sfm-q-premin')) d.entry.preMin = +g('sfm-q-premin').value || 0;
      d.entryStart = localInputToMs(g('sfm-q-ws').value) || 0;
      d.entryEnd = localInputToMs(g('sfm-q-we').value) || 0;
    };
    bindMaintTpl(card, d, pull);
    document.getElementById('sfm-q-genid').addEventListener('click', function () { pull(); maintAutoNumberEntry(d.entryStart || Date.now()); renderMaintEditor(); });
    document.getElementById('sfm-cancel').addEventListener('click', function () {
      if (editing) { d.mode = 'queue-list'; d.editIdx = -1; renderMaintEditor(); } else closeCompose();
    });
    document.getElementById('sfm-q-save').addEventListener('click', function () {
      pull();
      var s = d.entryStart, e = d.entryEnd;
      if (!s || !e || e <= s) { alert('対象期間（開始・終了日時）を正しく指定してください。'); return; }
      if (!editing) {
        var ds = maintDateStr(s), autoLike = /^MNT-\d{8}-\d{2}$/.test(d.entry.id || '');
        if (!d.entry.id || (autoLike && d.entry.id.indexOf('MNT-' + ds + '-') !== 0)) maintAutoNumberEntry(s);
      }
      var ent = { id: d.entry.id || '', start: s, end: e, msg: d.entry.msg || '', tasks: (d.entry.tasks || []).slice(), preMsg: d.entry.preMsg || '', preMin: (d.entry.preMin != null) ? d.entry.preMin : 60 };
      if (editing) d.queue[d.editIdx] = ent; else d.queue.push(ent);
      d.queue.sort(function (a, b) { return a.start - b.start; });
      saveMaint({ keepOpen: true, toast: editing ? '更新しました' : 'キューに追加しました', after: function () {
        d.mode = 'queue-list'; d.editIdx = -1; d.entry = { id: '', msg: '', tasks: [], preMsg: '', preMin: 60 }; d.entryStart = 0; d.entryEnd = 0; renderMaintEditor();
      } });
    });
  }
  function renderQueueList() {
    var d = maintDraft; if (!d) return;
    var card = document.getElementById('sfqc-cmp-card');
    var nowMs = Date.now();
    var rows = d.queue.length ? d.queue.map(function (w, i) {
      var live = w.start <= nowMs && nowMs < w.end, past = w.end <= nowMs;
      var badge = live ? '🔴 実施中 ' : (past ? '✅ 終了 ' : '🕒 予定 ');
      return '<div class="sfqc-cmp-win" style="align-items:flex-start">' +
        '<span><b>' + esc(w.id || '(番号なし)') + '</b><br>' +
        '<span style="font-size:11px;color:#64748b">' + badge + '</span>' + esc(fmtDate(w.start)) + ' 〜 ' + esc(fmtDate(w.end)) + '</span>' +
        '<span style="display:flex;gap:6px;flex-shrink:0"><button data-edq="' + i + '">編集</button><button data-rmq="' + i + '">削除</button></span></div>';
    }).join('') : '<p class="sfqc-cmp-hint">キューは空です。「➕ 新規作成」から追加してください。</p>';
    card.innerHTML =
      '<h3>📋 都度メンテのキュー</h3>' +
      '<p class="sfqc-cmp-hint">登録済みの単発メンテナンスです。各件を編集・削除できます。予告やメッセージは各メンテの編集画面で設定します。</p>' +
      '<button class="sfqc-btn sfqc-btn-primary" id="sfm-q-new" style="width:100%;margin-bottom:10px">➕ 新規作成</button>' +
      rows +
      '<div class="sfqc-cmp-row"><button class="sfqc-btn sfqc-btn-ghost" id="sfm-cancel" style="width:100%">閉じる</button></div>';
    document.getElementById('sfm-q-new').addEventListener('click', function () {
      d.entry = { id: '', msg: '', tasks: [], preMsg: '', preMin: 60 }; d.entryStart = 0; d.entryEnd = 0; d.editIdx = -1; maintAutoNumberEntry(); d.mode = 'queue-form'; renderMaintEditor();
    });
    card.querySelectorAll('[data-edq]').forEach(function (b) {
      b.addEventListener('click', function () { editQueueEntry(+b.getAttribute('data-edq')); });
    });
    card.querySelectorAll('[data-rmq]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('このメンテナンスをキューから削除しますか？')) return;
        d.queue.splice(+b.getAttribute('data-rmq'), 1);
        saveMaint({ keepOpen: true, toast: '削除しました', after: function () { renderMaintEditor(); } });
      });
    });
    document.getElementById('sfm-cancel').addEventListener('click', closeCompose);
  }
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
      '<div class="sfqc-sec">🔔 予告（開始前のお知らせ）</div>' +
      '<label>予告メッセージ（空欄なら日時のみ表示）</label>' +
      '<textarea id="sfm-r-premsg" placeholder="例）まもなくメンテナンスを開始します。キリの良いところで学習を終えてください。">' + esc(d.recurring.preMsg || '') + '</textarea>' +
      '<label>何分前から予告するか（0で予告なし）</label><input type="number" id="sfm-r-premin" min="0" value="' + (d.recurring.preMin != null ? d.recurring.preMin : 60) + '">' +
      '<div class="sfqc-cmp-row"><button class="sfqc-btn sfqc-btn-ghost" id="sfm-cancel">閉じる</button><button class="sfqc-btn sfqc-btn-primary" id="sfm-save">保存</button></div>';
    var pull = function () {
      var g = function (id) { return document.getElementById(id); };
      d.recurring.enabled = g('sfm-ren').checked;
      d.recurring.start = g('sfm-rstart').value || '02:00';
      d.recurring.durMin = +g('sfm-rdur').value || 120;
      if (g('sfm-r-msg')) d.recurring.msg = g('sfm-r-msg').value;
      if (g('sfm-r-tasks')) d.recurring.tasks = maintSplitTasks(g('sfm-r-tasks').value);
      if (g('sfm-r-premsg')) d.recurring.preMsg = g('sfm-r-premsg').value;
      if (g('sfm-r-premin')) d.recurring.preMin = +g('sfm-r-premin').value || 0;
    };
    card.querySelectorAll('[data-dow]').forEach(function (b) {
      b.addEventListener('click', function () { pull(); var i = +b.getAttribute('data-dow'); var p = d.recurring.dows.indexOf(i); if (p >= 0) d.recurring.dows.splice(p, 1); else d.recurring.dows.push(i); renderMaintEditor(); });
    });
    bindMaintTpl(card, d, pull);
    document.getElementById('sfm-cancel').addEventListener('click', closeCompose);
    document.getElementById('sfm-save').addEventListener('click', function () { pull(); saveMaint(); });
  }
  function saveMaint(opts) {
    opts = opts || {};
    var d = maintDraft; if (!d || !db) return;
    var rec = {
      queue: (d.queue || []).map(function (w) { return { id: (w.id || '').slice(0, 40), start: w.start, end: w.end, msg: (w.msg || '').slice(0, 1000), tasks: Array.isArray(w.tasks) ? w.tasks.slice(0, 8) : [], preMsg: (w.preMsg || '').slice(0, 1000), preMin: (w.preMin != null) ? (+w.preMin || 0) : 60 }; }),
      recurring: { enabled: !!d.recurring.enabled, dows: d.recurring.dows || [], start: d.recurring.start || '02:00', durMin: +d.recurring.durMin || 120, msg: (d.recurring.msg || '').slice(0, 1000), tasks: Array.isArray(d.recurring.tasks) ? d.recurring.tasks.slice(0, 8) : [], preMsg: (d.recurring.preMsg || '').slice(0, 1000), preMin: (d.recurring.preMin != null) ? (+d.recurring.preMin || 0) : 60 },
      msg: (d.msg || '').slice(0, 1000), tasks: Array.isArray(d.tasks) ? d.tasks.slice(0, 8) : [],
      preMsg: (d.preMsg || '').slice(0, 1000), preMin: +d.preMin || 0,
      idDate: d.idDate || '', idSeq: +d.idSeq || 0,
      fullStop: !!(lastMaint && lastMaint.fullStop),
      updated: Date.now(), by: currentName || 'admin'
    };
    db.collection(BROADCAST_COL).doc(MAINT_DOC).set(rec).then(function () {
      lastMaint = rec; logAdmin('メンテナンス設定', '都度' + rec.queue.length + '件/定期' + (rec.recurring.enabled ? 'ON' : 'OFF')); toastSafe(opts.toast || 'メンテナンス設定を保存しました');
      if (!opts.keepOpen) closeCompose();
      if (elAdmin && elAdmin.classList.contains('show')) renderAdmin();
      if (opts.after) opts.after();
    }).catch(function (e) { alert('保存に失敗しました（Firestoreルールで broadcast を許可してください）: ' + (e && e.message)); });
  }
  function applyBannerOffset(h) {
    document.body.style.paddingTop = h ? (h + 'px') : '';
    var tb = document.querySelector('.topbar'); if (tb) tb.style.top = h ? (h + 'px') : '';
    if (elBadge) elBadge.style.top = h ? (h + 9) + 'px' : '';
  }
  function maintShouldBlock(st, exempt, preview) {
    if (!st || !st.active) return false;
    return !exempt && !preview;
  }
  function checkMaintenance() {
    if (isAdmin) return;
    var overlay = document.getElementById('sfqc-maint');
    var banner = document.getElementById('sfqc-maint-banner');
    if (!overlay || !banner) return;
    var now = Date.now();
    var st = maintStatus(lastMaint, now);
    var ent = st.entry || {}, up = st.upEntry || {};
    var msg = ent.msg || (lastMaint && lastMaint.msg) || 'ただいまメンテナンスを実施しています。しばらくお待ちください。';
    var preMsg = up.preMsg || '';
    var preMin = (up.preMin != null) ? up.preMin : 60;
    var preview = !!(window.SFQ_hasPreview && window.SFQ_hasPreview());
    if (maintShouldBlock(st, maintExempt, preview)) {
      try { sessionStorage.setItem('sfq_maint', JSON.stringify({ msg: msg, end: st.end || 0, full: !!st.full, id: ent.id || '', tasks: (ent.tasks && ent.tasks.length ? ent.tasks : null), ts: now })); } catch (e) {}
      var maintUrl = (HOME_URL || 'index.html').replace(/index\.html(?:[?#].*)?$/, 'maintenance.html');
      location.replace(maintUrl);
      return;
    }
    if (st.active) {
      overlay.classList.remove('show');
      banner.textContent = maintExempt
        ? '🛠 ただいまメンテナンス中です（このアカウントは利用を許可されています）'
        : '🛠 ただいまメンテナンス中です（プレビュー中）';
      banner.classList.add('show');
    } else {
      overlay.classList.remove('show');
      if (st.upcoming && st.upcoming - now <= preMin * 60000) {
        banner.textContent = '🛠 ' + fmtDate(st.upcoming) + ' よりメンテナンス予定です' + (preMsg ? '（' + preMsg + '）' : '');
        banner.classList.add('show');
      } else { banner.classList.remove('show'); }
    }
    applyBannerOffset(banner.classList.contains('show') ? banner.offsetHeight : 0);
    if (maintBoundaryTimer) { clearTimeout(maintBoundaryTimer); maintBoundaryTimer = null; }
    var cands = [];
    if (st.active && st.end) cands.push(st.end);
    if (st.upcoming) { cands.push(st.upcoming); cands.push(st.upcoming - preMin * 60000); }
    var next = 0;
    cands.forEach(function (t) { if (t > now && (!next || t < next)) next = t; });
    if (next) {
      var delay = Math.min(next - now + 500, 21600000);
      maintBoundaryTimer = setTimeout(checkMaintenance, Math.max(1000, delay));
    }
  }
  function num(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function uidKey(base) { return base + '_' + ((currentUser && currentUser.uid) || 'anon'); }

  var saveRetry = 0;
  window.__cloudSave = function () {
    if (!currentUser || !db) return;
    if (accessLocked) return;
    setStatus('保存中…');
    cloudDirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      var st = window.__getStore ? window.__getStore() : null;
      if (!st) { cloudDirty = false; return; }
      saveCertStore(currentUser.uid, st)
        .then(function () { cloudDirty = false; saveRetry = 0; setStatus('保存済み'); })
        .catch(function () {
          saveRetry = Math.min(saveRetry + 1, 6);
          setStatus('オフライン（自動で再試行します）');
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(window.__cloudSave, Math.min(30000, 800 * Math.pow(2, saveRetry)));
        });
    }, 800);
  };

  window.__cloudSubmitFeedback = function (report) {
    if (!currentUser || !db) return false;
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

  var adminRows = [];
  var adminUsers = [];
  var adminFeedback = [];
  var adminLogEntries = [];
  var adminSelApps = {};
  var adminSelUsers = {};
  var fbFilterCert = 'all', fbFilterCat = 'all', fbOnlyPending = false;
  var adminFilter = '';
  var adminSort = 'updated';
  var adminCert = 'all';
  var adminActivity = 'all';
  var adminPass = false;
  var adminAccess = 'all';
  var adminMaintOk = false;
  var adminNetwork = 'all';
  var adminPendingCount = 0;
  var adminTab = 'users';
  var dmFilter = '';
  var adminDashCert = '';

  function admToday() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function admDaysAgo(s) { if (!s) return Infinity; try { var d = new Date(s + 'T00:00:00'); return Math.floor((Date.now() - d.getTime()) / 86400000); } catch (e) { return Infinity; } }

  function adminDashboardHTML() {
    var total = adminUsers.length, today = admToday();
    var actToday = 0, actWeek = 0, sumAtt = 0, sumCorr = 0, sumExF = 0, sumExFP = 0, sumStudy = 0;
    var netTracked = 0, netSpecial = 0, netAlerts = 0;
    adminUsers.forEach(function (u) {
      var a = u.agg; sumAtt += a.attempts; sumCorr += a.correct; sumExF += a.examFull; sumExFP += a.examFullPassed; sumStudy += a.studySec;
      if (a.lastStudyDate === today) actToday++;
      if (admDaysAgo(a.lastStudyDate) <= 6) actWeek++;
      var n = latestNetworkOf(u); if (n) { netTracked++; if (n.kind === 'corp' || n.kind === 'secure' || n.kind === 'hosting') netSpecial++; }
      if (networkAlertsOf(u).length) netAlerts++;
    });
    var avgRate = sumAtt ? Math.round(sumCorr / sumAtt * 100) : 0;
    var passRate = sumExF ? Math.round(sumExFP / sumExF * 100) : 0;
    var onlineNow = adminUsers.filter(isOnline).length;
    var kpi = function (n, l) { return '<div class="sfqc-kpi"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; };
    var html = '<div class="sfqc-sec">全体サマリー</div><div class="sfqc-kpis">' +
      kpi('🟢 ' + onlineNow, '現在オンライン') +
      kpi(total, '総ユーザー') + kpi(actToday, '今日のアクティブ') + kpi(actWeek, '今週のアクティブ') +
      kpi(avgRate + '%', '平均正答率') + kpi(sumAtt.toLocaleString(), '総解答数') + kpi(sumExF, '本番模試 受験') + kpi(passRate + '%', '本番合格率') +
      kpi(fmtDur(sumStudy), '総学習時間') + kpi(netTracked, '接続情報あり') + kpi(netSpecial, '企業/VPN/クラウド判定') + kpi(netAlerts, '接続確認') +
      '</div>';

    html += timeSeriesHTML();

    var certSet = {}; adminRows.forEach(function (r) { if (r.cert && r.cert !== '—') certSet[r.cert] = 1; });
    var certKeys = Object.keys(certSet);
    var dcert = dashCert();
    var isCur = (dcert === CERT_KEY);
    var engineHere = (typeof QDATA !== 'undefined' && QDATA && QDATA.length && typeof domainOf === 'function');

    if (certKeys.length > 1) {
      var dchips = certKeys.map(function (ck) {
        return '<button class="sfqc-fchip' + (ck === dcert ? ' on' : '') + '" data-dashcert="' + esc(ck) + '">' + esc(ck) + '</button>';
      }).join('');
      html += '<div class="sfqc-toolbar sfqc-toolbar2"><span class="sfqc-sort-label">詳細集計の資格:</span>' + dchips + '</div>';
    }

    var dom = getDashDom(dcert);
    if (dom) {
      var domAgg = {};
      adminRows.forEach(function (r) {
        if (r.cert !== dcert) return;
        var hist = r.store.hist || {};
        Object.keys(hist).forEach(function (id) {
          var h = hist[id], t = (h.c || 0) + (h.w || 0); if (!t) return;
          var dc = dom.domBy[id]; if (dc == null) dc = dom.domBy[+id];
          if (dc) { var da = domAgg[dc] || (domAgg[dc] = { c: 0, t: 0, sec: 0 }); da.c += (h.c || 0); da.t += t; }
        });
        var tdom = (r.store.time && r.store.time.dom) || {};
        Object.keys(tdom).forEach(function (dc) {
          var sec = (tdom[dc] && tdom[dc].sec) || 0; if (!sec) return;
          var da = domAgg[dc] || (domAgg[dc] = { c: 0, t: 0, sec: 0 }); da.sec += sec;
        });
      });
      var defs = dom.defs || [];
      var dbars = '';
      defs.forEach(function (d) {
        var a = domAgg[d.code]; if (!a || (!a.t && !a.sec)) return; var pc = a.t ? Math.round(a.c / a.t * 100) : 0;
        var col = pc >= 70 ? '#16a34a' : pc >= 50 ? '#d97706' : '#dc2626';
        var timeLabel = a.sec ? ' ・ ⏱ ' + esc(fmtDur(a.sec)) : '';
        dbars += '<div class="sfqc-dom"><span class="nm">' + esc(d.emoji + ' ' + d.name) + '</span><div class="bw"><div class="bf" style="width:' + pc + '%;background:' + col + '"></div></div><span class="pc" style="color:' + col + '">' + pc + '% <small>(' + a.c + '/' + a.t + ')' + timeLabel + '</small></span></div>';
      });
      if (dbars) html += '<div class="sfqc-sec">分野別 平均正答率＋学習時間（全ユーザー・' + esc(dcert) + '）</div><div class="sfqc-dash-card">' + dbars + '</div>';
    } else {
      html += '<div class="sfqc-sec">分野別 平均正答率＋学習時間（全ユーザー・' + esc(dcert) + '）</div><div class="sfqc-dash-card"><div class="sfqc-itnote">分野データを読み込み中…</div></div>';
    }

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
        : '※ 問題文・要確認フラグは「' + esc(dcert) + '」のページから管理者ビューを開いたときだけ表示されます（ID・正答率は全件書き出せます。分野別は全資格で表示されます）。';
      html += dlHead +
        '<details class="sfqc-itemwrap"><summary>低い順 上位40件を表示</summary>' +
        '<div class="sfqc-dash-card" style="margin-top:8px"><table class="sfqc-itbl"><thead><tr><th>問題</th><th>内容</th><th class="num">回答数</th><th class="num">正答率</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="sfqc-itnote">' + note + '</div></div></details>';
    }
    return html;
  }

  var dashDomCache = {};
  function getDashDom(slug) {
    if (slug === CERT_KEY && typeof QDATA !== 'undefined' && QDATA && QDATA.length &&
        typeof domainOf === 'function' && typeof DOMAIN_DEFS !== 'undefined' && DOMAIN_DEFS.length) {
      var domBy = {};
      QDATA.forEach(function (q) { if (q && q.id != null) domBy[q.id] = domainOf(+q.id); });
      return { defs: DOMAIN_DEFS, domBy: domBy };
    }
    var c = dashDomCache[slug];
    if (c) return c.loaded ? c : null;
    dashDomCache[slug] = { loaded: false };
    var base = (ROLE === 'client') ? '../' : 'certifications/';
    var grab = function (path) { return fetch(path).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    Promise.all([grab(base + slug + '/data/domains.json'), grab(base + slug + '/data/questions.json')]).then(function (res) {
      var domj = res[0], qs = res[1] || [];
      var defs = domj ? (Array.isArray(domj) ? domj : (domj.domains || [])) : [];
      var domBy = {};
      if (domj && !Array.isArray(domj) && domj.map) Object.assign(domBy, domj.map);
      qs.forEach(function (q) { if (q && q.id != null && q.domain != null) domBy[q.id] = q.domain; });
      dashDomCache[slug] = { loaded: true, defs: defs, domBy: domBy };
      renderAdmin();
    }).catch(function () { dashDomCache[slug] = { loaded: true, defs: [], domBy: {} }; renderAdmin(); });
    return null;
  }

  function dashCert() {
    var has = {}; adminRows.forEach(function (r) { if (r.cert && r.cert !== '—') has[r.cert] = 1; });
    if (adminDashCert && has[adminDashCert]) return adminDashCert;
    if (has[CERT_KEY]) return CERT_KEY;
    var ks = Object.keys(has);
    return ks[0] || CERT_KEY;
  }

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
          if (!seen[k]) { seen[k] = 1; act[k]++; }
        });
      });
    });
    var maxAct = 1, maxAns = 1;
    labels.forEach(function (k) { if (act[k] > maxAct) maxAct = act[k]; if (ans[k] > maxAns) maxAns = ans[k]; });
    var CW = 10;
    var VW = DAYS * CW;
    var step = Math.max(1, Math.ceil(DAYS / 5));
    var rects = '', hits = '', pts = [];
    labels.forEach(function (k, idx) {
      var ha = act[k] ? Math.max(2, Math.round(act[k] / maxAct * 100)) : 0;
      var hn = ans[k] ? Math.max(2, Math.round(ans[k] / maxAns * 100)) : 0;
      var x = idx * CW;
      rects += '<rect class="bar" x="' + (x + 2.2).toFixed(1) + '" y="' + (100 - hn) + '" width="5.6" height="' + hn + '" rx="0.8"></rect>';
      pts.push((x + CW / 2).toFixed(1) + ',' + (100 - ha));
      var lab = k + '：アクティブ ' + act[k] + '人 / 解答 ' + ans[k] + '件';
      hits += '<rect class="hit" x="' + x + '" y="0" width="' + CW + '" height="100" role="button" tabindex="0" data-ts-label="' + esc(lab) + '"><title>' + esc(lab) + '</title></rect>';
    });
    var svg = '<svg class="sfqc-ts" viewBox="0 0 ' + VW + ' 100" preserveAspectRatio="none" role="img" aria-label="日別アクティブの推移">' +
      rects + '<polyline class="ln" vector-effect="non-scaling-stroke" points="' + pts.join(' ') + '"></polyline>' + hits + '</svg>';
    var axis = labels.map(function (k, idx) {
      return '<div class="sfqc-ts-xc">' + (idx % step === 0 ? esc(k.slice(5)) : '') + '</div>';
    }).join('');
    var totAns = labels.reduce(function (s, k) { return s + ans[k]; }, 0);
    var actDays = labels.filter(function (k) { return act[k] > 0; }).length;
    var legend = '<div class="sfqc-ts-legend"><span><i class="swl"></i>アクティブ人数（最大 ' + maxAct + '人）</span>' +
      '<span><i class="sw" style="background:#16a34a"></i>解答数（最大 ' + maxAns.toLocaleString() + '件）</span></div>';
    return '<div class="sfqc-sec">日別アクティブ（直近' + DAYS + '日・人数と解答数）</div>' +
      '<div class="sfqc-dash-card">' + legend + svg +
      '<div class="sfqc-ts-axis">' + axis + '</div>' +
      '<div class="sfqc-ts-readout" id="sfqc-ts-readout">各日にカーソルを乗せる／タップすると、その日の人数・解答数が出ます。</div>' +
      '<div class="sfqc-itnote">期間の総解答 ' + totAns.toLocaleString() + ' 件・学習があった日 ' + actDays + '/' + DAYS + '日。緑の棒＝解答数／青い折れ線＝アクティブ人数（各系列はそれぞれの最大値を基準に高さを正規化）。</div></div>';
  }

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
    if (adminColUnsub) { adminColUnsub(); adminColUnsub = null; }
    if (adminRenderTimer) { clearTimeout(adminRenderTimer); adminRenderTimer = null; }
  }

  function refreshUser(u) {
    u.certs.forEach(function (c) { c.stats = statsOf(c.store); });
    u.certs.sort(function (a, b) { return b.stats.attempts - a.stats.attempts; });
    u.agg = aggregateUser(u.certs);
    return u;
  }
  function rebuildRows() {
    adminRows = [];
    adminUsers.forEach(function (u) {
      u.certs.forEach(function (c) {
        adminRows.push({ uid: u.uid, cert: c.cert, name: u.name, updated: u.updated, store: c.store, stats: c.stats });
      });
    });
  }
  function findUser(uid) { for (var i = 0; i < adminUsers.length; i++) if (adminUsers[i].uid === uid) return adminUsers[i]; return null; }
  function syncPendingBadge() {
    setAdminPending(adminUsers.filter(function (u) { return isApplicant(u) && !(currentUser && u.uid === currentUser.uid); }).length);
  }

  function ingestAdminDocs(snap) {
    adminFeedback = [];
    adminLogEntries = [];
    var byUid = {}, netCleanup = [];
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
      if (currentUser && d.id === currentUser.uid && Array.isArray(data.adminLog)) adminLogEntries = data.adminLog.slice();
      var netPruned = pruneNetworkData(data, Date.now());
      if (netPruned.changed) netCleanup.push({ uid: d.id, devices: netPruned.devices, access: netPruned.access });
      var entry = { uid: d.id, name: nm, email: email, updated: data.updated || 0, access: (data.access || 'pending'), req: (data.req || null), maintOk: !!data.maintOk, expiredAt: data.expiredAt || 0, approvedAt: data.approvedAt || 0, elective: (data.elective || ''), chat: (Array.isArray(data.chat) ? data.chat : []), notices: (Array.isArray(data.notices) ? data.notices : []), read: (data.read && typeof data.read === 'object' ? data.read : {}), lastLogin: data.lastLogin || 0, lastSeen: data.lastSeen || 0, logins: (Array.isArray(data.logins) ? data.logins : []), netDevices: netPruned.devices, netAccess: netPruned.access, netUpdated: data.netUpdated || 0, certs: [] };
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
    if (isAdmin && db && netCleanup.length) {
      netCleanup.forEach(function (x) {
        db.collection(COLLECTION).doc(x.uid).update('netDevices', x.devices, 'netAccess', x.access).catch(function () {});
      });
    }
    adminUsers = Object.keys(byUid).map(function (k) { return refreshUser(byUid[k]); });
    adminFeedback.sort(function (a, b) { return (b.fb.ts || 0) - (a.fb.ts || 0); });
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
    adminColUnsub = db.collection(COLLECTION).onSnapshot(function (snap) {
      ingestAdminDocs(snap);
      if (first) {
        first = false;
        loadBroadcasts(function () {
          db.collection(BROADCAST_COL).doc(MAINT_DOC).get()
            .then(function (m) { lastMaint = (m && m.exists && m.data()) || null; }).catch(function () {})
            .then(function () { if (elAdmin && elAdmin.classList.contains('show')) renderAdmin(); });
        });
        return;
      }
      scheduleAdminRender();
    }, function (e) {
      if (body && !adminUsers.length) body.innerHTML = '<div class="sfqc-empty">読み込みに失敗しました。<br>管理者として権限（Firestoreルール）が設定されているか確認してください。<br><small>' + esc(e && e.message) + '</small></div>';
    });
  }
  function scheduleAdminRender() {
    if (adminRenderTimer) clearTimeout(adminRenderTimer);
    adminRenderTimer = setTimeout(function () {
      if (!elAdmin || !elAdmin.classList.contains('show')) return;
      syncPendingBadge();
      var ae = document.activeElement;
      if (ae && (ae.id === 'sfqc-dm-q' || ae.id === 'sfqc-q' || ae.id === 'sfqc-cmp-text' || ae.id === 'sfqc-chat-text')) return;
      var cmp = document.getElementById('sfqc-compose'); if (cmp && cmp.classList.contains('show')) return;
      if (document.querySelector('.sfqc-detail.show')) return;
      renderAdmin();
    }, 1500);
  }

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
  function fmtDateTime(ms) {
    if (!ms) return '—';
    try { var d = new Date(ms); var p = function (n) { return ('0' + n).slice(-2); };
      return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
    catch (e) { return '—'; }
  }
  function fmtAgo(ms) {
    if (!ms) return '—';
    var s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return s + '秒前';
    if (s < 3600) return Math.floor(s / 60) + '分前';
    if (s < 86400) return Math.floor(s / 3600) + '時間前';
    return Math.floor(s / 86400) + '日前';
  }

  /* -----------------------------------------------------------------
   * 接続元・端末情報
   * 生の IP は企業回線との照合にだけ使い、Firestore には保存しない。
   * GitHub Pages はサーバーログを提供しないため、Cloudflare の公開 trace
   * と ipwho.is の回線情報をベストエフォートで取得する。失敗時もログインは妨げない。
   * ----------------------------------------------------------------- */
  function networkConfig() {
    var c = window.SFQ_NETWORK_MONITORING;
    return (c && typeof c === 'object') ? c : {};
  }
  function networkRetainDays() {
    var n = Number(networkConfig().retainDays || NETWORK_DEFAULT_DAYS);
    return (isFinite(n) && n >= 1 && n <= 365) ? Math.round(n) : NETWORK_DEFAULT_DAYS;
  }
  function cleanNetText(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120);
  }
  function parseTrace(text) {
    var out = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf('='); if (i <= 0) return;
      out[line.slice(0, i)] = line.slice(i + 1);
    });
    return out;
  }
  function ipv4Int(ip) {
    var p = String(ip || '').split('.'); if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return null;
      var x = Number(p[i]); if (x < 0 || x > 255) return null;
      n = ((n << 8) | x) >>> 0;
    }
    return n >>> 0;
  }
  function ipInCidr(ip, cidr) {
    ip = String(ip || '').trim(); cidr = String(cidr || '').trim();
    if (!ip || !cidr) return false;
    if (cidr.indexOf('/') < 0) return ip.toLowerCase() === cidr.toLowerCase();
    var a = cidr.split('/'); if (a.length !== 2) return false;
    var x = ipv4Int(ip), y = ipv4Int(a[0]), bits = Number(a[1]);
    if (x == null || y == null || !isFinite(bits) || bits < 0 || bits > 32 || Math.floor(bits) !== bits) return false;
    var mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((x & mask) >>> 0) === ((y & mask) >>> 0);
  }
  function maskIp(ip) {
    ip = cleanNetText(ip, 80);
    var p = ip.split('.');
    if (p.length === 4 && ipv4Int(ip) != null) return p[0] + '.' + p[1] + '.' + p[2] + '.xxx';
    if (ip.indexOf(':') >= 0) {
      var h = ip.split(':').filter(function (x) { return x !== ''; });
      return h.slice(0, 4).join(':') + '::';
    }
    return '';
  }
  function safeRegexMatch(text, pattern) {
    try { return new RegExp(String(pattern), 'i').test(text || ''); } catch (e) { return false; }
  }
  function corporateMatch(ip, org, defs) {
    defs = Array.isArray(defs) ? defs : [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i] || {}, cidrs = Array.isArray(d.cidrs) ? d.cidrs : [];
      for (var j = 0; j < cidrs.length; j++) {
        if (ipInCidr(ip, cidrs[j])) return { name: cleanNetText(d.name || '登録企業', 80), by: 'ip', confidence: 'high' };
      }
      var pats = Array.isArray(d.orgPatterns) ? d.orgPatterns : [];
      for (j = 0; j < pats.length; j++) {
        if (safeRegexMatch(org, pats[j])) return { name: cleanNetText(d.name || '登録企業', 80), by: 'org', confidence: 'medium' };
      }
    }
    return null;
  }
  function classifyNetwork(ip, org, trace, defs) {
    org = cleanNetText(org, 120); trace = trace || {};
    var corp = corporateMatch(ip, org, defs);
    if (corp) return { kind: 'corp', label: '🏢 ' + corp.name + '（' + (corp.by === 'ip' ? 'IP一致' : '回線名一致') + '）', confidence: corp.confidence };
    if (trace.gateway && trace.gateway !== 'off') return { kind: 'secure', label: '🛡️ Cloudflare Gateway経由', confidence: 'high' };
    if (trace.warp && trace.warp !== 'off') return { kind: 'secure', label: '🛡️ Cloudflare WARP経由', confidence: 'medium' };
    if (/zscaler|netskope|palo alto|prisma access|globalprotect|cisco umbrella|cloudflare|iboss|menlo security|fortinet/i.test(org)) {
      return { kind: 'secure', label: '🛡️ 企業VPN／セキュアゲートウェイの可能性', confidence: 'medium' };
    }
    if (/nordvpn|surfshark|mullvad|expressvpn|express technologies|proton|private internet access|cyberghost|windscribe/i.test(org)) {
      return { kind: 'secure', label: '🛡️ VPN回線の可能性', confidence: 'medium' };
    }
    if (/amazon|google cloud|microsoft|azure|digitalocean|linode|vultr|ovh|akamai|oracle cloud|hetzner|choopa/i.test(org)) {
      return { kind: 'hosting', label: '☁️ クラウド／ホスティング回線の可能性', confidence: 'medium' };
    }
    if (org) return { kind: 'normal', label: '🌐 通常回線／判定なし', confidence: 'low' };
    return { kind: 'unknown', label: '❔ 回線判定なし', confidence: 'low' };
  }
  function randomDeviceId() {
    try {
      var b = new Uint8Array(12); crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    } catch (e) { return 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }
  function deviceId(uid) {
    var key = 'sfq_device_id_' + cleanNetText(uid || 'anonymous', 80), id = '';
    try { id = localStorage.getItem(key) || ''; } catch (e) {}
    if (!/^[a-z0-9_-]{12,64}$/i.test(id)) {
      id = randomDeviceId();
      try { localStorage.setItem(key, id); } catch (e2) {}
    }
    return id;
  }
  function deviceInfo() {
    var ua = (navigator && navigator.userAgent) || '', browser = '不明', os = '不明', m;
    if ((m = ua.match(/Edg\/([\d.]+)/))) browser = 'Edge ' + m[1];
    else if ((m = ua.match(/OPR\/([\d.]+)/))) browser = 'Opera ' + m[1];
    else if ((m = ua.match(/SamsungBrowser\/([\d.]+)/))) browser = 'Samsung Internet ' + m[1];
    else if ((m = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/))) browser = 'Chrome ' + m[1];
    else if ((m = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/))) browser = 'Firefox ' + m[1];
    else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) browser = 'Safari ' + m[1];
    if (/Windows NT 10\.0/.test(ua)) os = 'Windows';
    else if (/Android\s*([\d.]*)/i.test(ua)) os = 'Android' + (RegExp.$1 ? ' ' + RegExp.$1 : '');
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS/iPadOS';
    else if (/Mac OS X\s*([\d_]+)/.test(ua)) os = 'macOS ' + RegExp.$1.replace(/_/g, '.');
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var scr = ''; try { if (screen && screen.width && screen.height) scr = screen.width + '×' + screen.height; } catch (e2) {}
    return { browser: cleanNetText(browser, 80), os: cleanNetText(os, 80), language: cleanNetText(navigator.language || '', 20), timezone: cleanNetText(tz, 60), screen: cleanNetText(scr, 30), ua: cleanNetText(ua, 300) };
  }
  function netFetch(url, asText) {
    if (!url || typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
    var work = fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asText ? r.text() : r.json();
    });
    return Promise.race([work, new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 7000); })]);
  }
  function collectNetworkSnapshot() {
    var cfg = networkConfig(), dev = deviceInfo();
    var base = { deviceId: currentDeviceId || deviceId(currentUser && currentUser.uid), browser: dev.browser, os: dev.os, language: dev.language, timezone: dev.timezone, screen: dev.screen, ua: dev.ua,
      ip: '', org: '', asn: '', country: '', region: '', city: '', kind: 'unknown', label: '❔ 回線判定なし', confidence: 'low', source: 'device-only' };
    var traceUrl = cleanNetText(cfg.traceUrl || 'https://www.cloudflare.com/cdn-cgi/trace', 300);
    return netFetch(traceUrl, true).then(function (txt) {
      var tr = parseTrace(txt), rawIp = cleanNetText(tr.ip, 80);
      base.ip = maskIp(rawIp); base.country = cleanNetText(tr.loc, 60); base.source = 'cloudflare';
      var lookupUrl = cleanNetText(cfg.lookupUrl || 'https://ipwho.is/{ip}', 400).replace('{ip}', encodeURIComponent(rawIp));
      if (!rawIp || !lookupUrl) return { base: base, rawIp: rawIp, trace: tr };
      return netFetch(lookupUrl, false).then(function (g) {
        if (!g || g.success === false) return { base: base, rawIp: rawIp, trace: tr };
        var c = g.connection || {};
        base.org = cleanNetText(c.org || c.isp || g.company || '', 120);
        base.asn = cleanNetText(c.asn ? ('AS' + c.asn) : (g.asn || ''), 80);
        base.country = cleanNetText(g.country || base.country, 60);
        base.region = cleanNetText(g.region || '', 80); base.city = cleanNetText(g.city || '', 80);
        base.source = 'cloudflare+ipwhois';
        return { base: base, rawIp: rawIp, trace: tr };
      }).catch(function () { return { base: base, rawIp: rawIp, trace: tr }; });
    }).catch(function () { return { base: base, rawIp: '', trace: {} }; }).then(function (x) {
      var cls = classifyNetwork(x.rawIp, x.base.org, x.trace, cfg.corporateNetworks);
      x.base.kind = cls.kind; x.base.label = cls.label; x.base.confidence = cls.confidence;
      return x.base;
    });
  }
  function pruneNetworkData(data, now) {
    data = data || {}; now = now || Date.now();
    var cutoff = now - networkRetainDays() * 86400000, devices = {}, changed = false;
    var src = (data.netDevices && typeof data.netDevices === 'object') ? data.netDevices : {};
    Object.keys(src).forEach(function (k) {
      var d = src[k] || {};
      if ((d.lastSeen || 0) >= cutoff) devices[k] = d; else changed = true;
    });
    var oldLogs = Array.isArray(data.netAccess) ? data.netAccess : [];
    var logs = oldLogs.filter(function (e) { return e && (e.ts || 0) >= cutoff; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 50);
    if (logs.length !== oldLogs.length) changed = true;
    return { devices: devices, access: logs, changed: changed };
  }
  function networkRecordedThisSession(uid, setNow) {
    var k = 'sfq_net_recorded_' + uid;
    try {
      if (!setNow) return !!sessionStorage.getItem(k);
      sessionStorage.setItem(k, '1'); return true;
    } catch (e) { return false; }
  }
  function clearNetworkSessionMark(uid) { try { sessionStorage.removeItem('sfq_net_recorded_' + uid); } catch (e) {} }
  function recordNetworkVisit(uid) {
    var cfg = networkConfig();
    var did = deviceId(uid); currentDeviceId = did;
    if (!db || !uid || cfg.enabled === false || networkRecordedThisSession(uid, false)) return;
    collectNetworkSnapshot().then(function (net) {
      var now = Date.now(), ref = db.collection(COLLECTION).doc(uid);
      return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (snap) {
          var data = (snap.exists && snap.data()) || {}, pruned = pruneNetworkData(data, now);
          var devices = pruned.devices, prev = devices[did] || {};
          net.deviceId = did; net.firstSeen = prev.firstSeen || now; net.lastSeen = now; net.loginCount = (prev.loginCount || 0) + 1;
          devices[did] = net;
          var ev = { ts: now, deviceId: did, browser: net.browser, os: net.os, ip: net.ip, org: net.org, asn: net.asn,
            country: net.country, region: net.region, city: net.city, kind: net.kind, label: net.label, confidence: net.confidence };
          var logs = pruned.access;
          var newest = logs[0];
          if (!newest || newest.deviceId !== did || newest.ip !== ev.ip || (now - (newest.ts || 0)) > 60000) logs = [ev].concat(logs);
          logs = logs.slice(0, 50);
          tx.set(ref, { netDevices: devices, netAccess: logs, netUpdated: now }, { merge: true });
        });
      });
    }).then(function () { networkRecordedThisSession(uid, true); }).catch(function () { clearNetworkSessionMark(uid); });
  }
  function activeDevicesOf(u, now) {
    now = now || Date.now(); var ds = (u && u.netDevices) || {};
    return Object.keys(ds).filter(function (k) { return ds[k] && (now - (ds[k].lastSeen || 0)) <= ONLINE_MS; });
  }
  function latestNetworkOf(u) {
    var logs = (u && Array.isArray(u.netAccess)) ? u.netAccess : [];
    if (logs.length) return logs.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
    var ds = (u && u.netDevices) || {}, best = null;
    Object.keys(ds).forEach(function (k) { var d = ds[k]; if (d && (!best || (d.lastSeen || 0) > (best.lastSeen || 0))) best = d; });
    return best;
  }
  function networkAlertsOf(u) {
    var out = [], active = activeDevicesOf(u);
    if (active.length > 1) out.push('複数端末が同時にオンライン（' + active.length + '台）');
    var logs = ((u && u.netAccess) || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (logs.length > 1 && logs[0].ip && logs[1].ip && logs[0].ip !== logs[1].ip && logs[0].deviceId !== logs[1].deviceId && (logs[0].ts - logs[1].ts) <= 600000) {
      out.push('10分以内に別端末・別回線からアクセス');
    }
    return out;
  }
  function netChipClass(n) {
    return n && n.kind === 'corp' ? 'corp' : n && n.kind === 'secure' ? 'warn' : n && n.kind === 'hosting' ? 'host' : 'unknown';
  }

  function recordLogin(uid, data) {
    if (!db || !uid) return;
    var now = Date.now();
    var logins = (data && Array.isArray(data.logins)) ? data.logins.slice() : [];
    logins.push(now); if (logins.length > 30) logins = logins.slice(-30);
    db.collection(COLLECTION).doc(uid).set({ lastLogin: now, lastSeen: now, logins: logins }, { merge: true }).catch(function () {});
  }
  function presenceWrite(uid) {
    if (!db || !uid || document.hidden) return;
    var now = Date.now(), ref = db.collection(COLLECTION).doc(uid);
    if (currentDeviceId && networkConfig().enabled !== false) {
      try {
        ref.update('lastSeen', now, 'netUpdated', now,
          new firebase.firestore.FieldPath('netDevices', currentDeviceId, 'lastSeen'), now).catch(function () {
            ref.set({ lastSeen: now }, { merge: true }).catch(function () {});
          });
        return;
      } catch (e) {}
    }
    ref.set({ lastSeen: now }, { merge: true }).catch(function () {});
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
    if (adminAccess !== 'all') list = list.filter(function (u) { return accessStateOf(u) === adminAccess; });
    if (adminMaintOk) list = list.filter(function (u) { return !!u.maintOk; });
    if (adminNetwork === 'alert') list = list.filter(function (u) { return networkAlertsOf(u).length > 0; });
    else if (adminNetwork === 'corp') list = list.filter(function (u) { var n = latestNetworkOf(u); return n && n.kind === 'corp'; });
    else if (adminNetwork === 'secure') list = list.filter(function (u) { var n = latestNetworkOf(u); return n && (n.kind === 'secure' || n.kind === 'hosting'); });
    list.sort(function (a, b) {
      if (adminSort === 'answered') return b.agg.answered - a.agg.answered;
      if (adminSort === 'rate')     return b.agg.rate - a.agg.rate;
      if (adminSort === 'days')     return b.agg.daysActive - a.agg.daysActive;
      if (adminSort === 'name')     return (a.name || '').localeCompare(b.name || '', 'ja');
      return (b.updated || 0) - (a.updated || 0);
    });
    return list;
  }

  function isApplicant(u) { return (u.access || 'pending') !== 'approved' && u.req && u.req.ts; }

  function accessStateOf(u) {
    var acc = (u && u.access) || 'pending';
    if (acc === 'approved' || acc === 'blocked') return acc;
    return (u && u.req && u.req.ts) ? 'applied' : 'noreq';
  }
  var ACCESS_CHIP = {
    approved: ['ok', '✅ 承認済み', '利用できます'],
    blocked:  ['block', '🚫 停止中', '管理者が停止しました'],
    applied:  ['pend', '📩 承認待ち（申請あり）', '本人が申請済み＝あなたの承認を待っています'],
    noreq:    ['none', '✋ 未申請', 'まだ本人が利用申請をしていません（承認しても構いません）']
  };
  function accessChipHTML(u) {
    var m = ACCESS_CHIP[accessStateOf(u)] || ACCESS_CHIP.noreq;
    return '<span class="sfqc-acc-access ' + m[0] + '" title="' + esc(m[2]) + '">' + m[1] + '</span>';
  }
  function reqChipHTML(u) {
    if (!(u && u.req && u.req.ts)) return '';
    var unblock = (u.access === 'blocked');
    return '<span class="sfqc-acc-access pend" title="' + (unblock ? '停止の解除を申請しています' : 'あなたの承認を待っています') + '">' +
      (unblock ? '📩 解除申請 ' : '📝 申請 ') + esc(fmtDate(u.req.ts)) + '</span>';
  }
  function applicationsSectionHTML() {
    var apps = adminUsers.filter(isApplicant);
    apps.sort(function (a, b) { return (b.req.ts || 0) - (a.req.ts || 0); });
    var unblockN = apps.filter(function (u) { return u.access === 'blocked'; }).length;
    var head = '<div class="sfqc-sec" style="margin-top:0">🔔 申請（あなたの対応待ち） ' +
      '<span class="sfqc-fb-count">' + apps.length + '件' + (unblockN ? '（うち解除申請 ' + unblockN + '件）' : '') + '</span></div>';
    if (!apps.length) {
      adminSelApps = {};
      return head + '<div class="sfqc-empty" style="padding:14px">あなたの承認を待っている申請はありません。<br>' +
        '<small>まだ申請していないアカウントは、下の一覧の「✋ 未申請」で確認できます（そのまま承認することもできます）。</small></div>' +
        '<div class="sfqc-divider"></div>';
    }
    var present = {}; apps.forEach(function (u) { present[u.uid] = 1; });
    Object.keys(adminSelApps).forEach(function (k) { if (!present[k]) delete adminSelApps[k]; });
    var selCount = Object.keys(adminSelApps).length;
    var bulk = '<div class="sfqc-app-bulk">' +
        '<label class="sfqc-app-selall"><input type="checkbox" id="sfqc-app-all"' + (selCount && selCount === apps.length ? ' checked' : '') + '> すべて選択</label>' +
        '<span class="sfqc-count">' + selCount + ' 件選択</span>' +
        '<button class="sfqc-mini" id="sfqc-app-bulk-approve"' + (selCount ? '' : ' disabled') + '>✅ 選択を一括承認</button>' +
      '</div>';
    var cards = apps.map(function (u) {
      var isBlock = (u.access === 'blocked');
      var stateChip = accessChipHTML(u);
      var reqChip = reqChipHTML(u);
      var expChip = u.expiredAt ? '<span class="sfqc-acc-access maint" title="' + INACTIVE_DAYS + '日以上アクセスがなく承認が失効しました">🧹 休眠失効 ' + esc(fmtDate(u.expiredAt)) + '</span>' : '';
      var emailLabel = u.email ? '<span class="sfqc-acc-email">' + esc(u.email) + '</span>' : '';
      return '<div class="sfqc-app-item' + (isBlock ? ' is-block' : '') + '">' +
          '<div class="sfqc-app-info">' +
            '<label class="sfqc-app-check"><input type="checkbox" class="sfqc-app-sel" data-sel-uid="' + esc(u.uid) + '"' + (adminSelApps[u.uid] ? ' checked' : '') + '></label>' +
            '<span class="sfqc-app-name">👤 ' + esc(u.name) + '</span>' + emailLabel + stateChip + reqChip + expChip +
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
    rebuildRows();
    syncPendingBadge();
    if (!adminUsers.length) { body.innerHTML = '<div class="sfqc-empty">アカウントがまだありません。</div>'; return; }
    var list = filterSortUsers();

    var certSet = {}; adminRows.forEach(function (r) { certSet[r.cert] = 1; });
    var certChips = '<button class="sfqc-fchip' + (adminCert === 'all' ? ' on' : '') + '" data-cert="all">すべて</button>';
    Object.keys(certSet).forEach(function (ck) { certChips += '<button class="sfqc-fchip' + (adminCert === ck ? ' on' : '') + '" data-cert="' + esc(ck) + '">' + esc(ck) + '</button>'; });
    var sortBtn = function (k, l) { return '<button class="sfqc-sort' + (adminSort === k ? ' on' : '') + '" data-sort="' + k + '">' + l + '</button>'; };

    var totalUnread = adminUsers.reduce(function (s, u) { return s + chatUnreadCount(u.chat, 'admin', u.uid); }, 0);
    var fbPending = adminFeedback.filter(function (r) { return !r.reply; }).length;
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
      html += maintenanceSectionHTML();
      html += adminDashboardHTML();
      html += auditLogHTML();
    } else if (adminTab === 'ann') {
      html += announcementsSectionHTML();
    } else if (adminTab === 'dm') {
      html += dmSectionHTML();
    } else {
      html += applicationsSectionHTML();
      html += '<div class="sfqc-sec">ユーザー</div>';
      html += '<div class="sfqc-toolbar">' +
          '<input id="sfqc-q" class="sfqc-search" type="search" placeholder="🔍 名前・メール・UIDで絞り込み" value="' + esc(adminFilter) + '">' +
          '<span class="sfqc-count">' + list.length + ' / ' + adminUsers.length + '人</span>' +
        '</div>';
      var accessCounts = { approved: 0, applied: 0, noreq: 0, blocked: 0, unblockReq: 0 };
      adminUsers.forEach(function (u) {
        var k = accessStateOf(u); if (accessCounts[k] != null) accessCounts[k]++;
        if (k === 'blocked' && u.req && u.req.ts) accessCounts.unblockReq++;
      });
      html += '<div class="sfqc-toolbar sfqc-toolbar2">' +
          '<span class="sfqc-sort-label">資格:</span>' + certChips +
          '<span class="sfqc-sort-label">状態:</span>' +
          '<button class="sfqc-fchip' + (adminActivity === 'week' ? ' on' : '') + '" data-act="week">7日以内</button>' +
          '<button class="sfqc-fchip' + (adminActivity === 'dormant' ? ' on' : '') + '" data-act="dormant">休眠30日+</button>' +
          '<button class="sfqc-fchip' + (adminPass ? ' on' : '') + '" data-pass="1">合格者</button>' +
          '<span class="sfqc-sort-label">アクセス:</span>' +
          '<button class="sfqc-fchip' + (adminAccess === 'approved' ? ' on' : '') + '" data-access="approved">✅ 承認済み ' + accessCounts.approved + '</button>' +
          '<button class="sfqc-fchip' + (adminAccess === 'applied' ? ' on' : '') + '" data-access="applied" title="本人が申請済み＝あなたの承認を待っています">📩 承認待ち（申請あり） ' + accessCounts.applied + '</button>' +
          '<button class="sfqc-fchip' + (adminAccess === 'noreq' ? ' on' : '') + '" data-access="noreq" title="まだ本人が利用申請をしていません">✋ 未申請 ' + accessCounts.noreq + '</button>' +
          '<button class="sfqc-fchip' + (adminAccess === 'blocked' ? ' on' : '') + '" data-access="blocked"' +
            (accessCounts.unblockReq ? ' title="うち ' + accessCounts.unblockReq + ' 件は解除を申請しています"' : '') +
            '>🚫 停止中 ' + accessCounts.blocked + (accessCounts.unblockReq ? '（📩' + accessCounts.unblockReq + '）' : '') + '</button>' +
          '<button class="sfqc-fchip' + (adminMaintOk ? ' on' : '') + '" data-maintok="1" title="メンテナンス中でも利用できるアカウントだけを表示">🛠 メンテ許可</button>' +
        '</div>';
      html += '<div class="sfqc-toolbar sfqc-toolbar2">' +
          '<span class="sfqc-sort-label">接続:</span>' +
          '<button class="sfqc-fchip' + (adminNetwork === 'alert' ? ' on' : '') + '" data-network="alert">⚠ 接続確認</button>' +
          '<button class="sfqc-fchip' + (adminNetwork === 'corp' ? ' on' : '') + '" data-network="corp">🏢 登録企業回線</button>' +
          '<button class="sfqc-fchip' + (adminNetwork === 'secure' ? ' on' : '') + '" data-network="secure">🛡️ VPN/クラウド候補</button>' +
        '</div>';
      html += '<div class="sfqc-toolbar sfqc-toolbar2">' +
          '<span class="sfqc-sort-label">並び順:</span>' +
          sortBtn('updated', '最終更新') + sortBtn('answered', '解答数') + sortBtn('rate', '正答率') + sortBtn('days', '学習日数') + sortBtn('name', '名前') +
        '</div>';

      var nowSweep = Date.now();
      var expTargets = adminUsers.filter(function (u) { return accessExpired(u, nowSweep); });
      html += '<div class="sfqc-app-bulk">' +
          '<span style="font-weight:700">🧹 休眠アカウント</span>' +
          '<span class="sfqc-count">' + INACTIVE_DAYS + '日以上アクセスなしの承認済み ' + expTargets.length + ' 人</span>' +
          '<button class="sfqc-mini sfqc-danger" id="sfqc-expire-sweep"' + (expTargets.length ? '' : ' disabled') + '>承認を一括解除</button>' +
        '</div>';

      var present = {}; list.forEach(function (u) { present[u.uid] = 1; });
      Object.keys(adminSelUsers).forEach(function (k) { if (!present[k]) delete adminSelUsers[k]; });
      var selN = Object.keys(adminSelUsers).length;
      html += '<div class="sfqc-app-bulk">' +
          '<label class="sfqc-app-selall"><input type="checkbox" id="sfqc-usel-all"' + (selN && selN === list.length ? ' checked' : '') + '> すべて選択</label>' +
          '<span class="sfqc-count">' + selN + ' 人選択</span>' +
          '<button class="sfqc-mini" id="sfqc-ubulk-notice"' + (selN ? '' : ' disabled') + '>📩 一括お知らせ</button>' +
          '<button class="sfqc-mini" id="sfqc-ubulk-mokon"' + (selN ? '' : ' disabled') + '>🛠 メンテ許可</button>' +
          '<button class="sfqc-mini" id="sfqc-ubulk-mokoff"' + (selN ? '' : ' disabled') + '>🛠 許可解除</button>' +
          '<button class="sfqc-mini sfqc-danger" id="sfqc-ubulk-unapprove"' + (selN ? '' : ' disabled') + ' title="承認待ちに戻します（本人は再申請が必要・進捗は残ります）">⏳ 承認解除</button>' +
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
        var accChip = accessChipHTML(u);
        var reqAtChip = reqChipHTML(u);
        var accBtn = (u.access === 'approved')
          ? '<button class="sfqc-act-block" data-acc-uid="' + esc(u.uid) + '" data-acc-name="' + esc(u.name) + '" data-acc-state="blocked">⏸ 停止</button>'
          : '<button class="sfqc-act-approve" data-acc-uid="' + esc(u.uid) + '" data-acc-name="' + esc(u.name) + '" data-acc-state="approved">✅ 承認</button>';
        var maintChip = u.maintOk ? '<span class="sfqc-acc-access maint" title="メンテナンス中でもログイン・学習できます">🛠 メンテ中も可</span>' : '';
        var expChipRow = (u.expiredAt && u.access !== 'approved')
          ? '<span class="sfqc-acc-access maint" title="' + INACTIVE_DAYS + '日以上アクセスがなく承認が失効しました">🧹 休眠失効</span>' : '';
        var latestNet = latestNetworkOf(u), netAlerts = networkAlertsOf(u);
        var netChip = latestNet ? '<span class="sfqc-net-chip ' + netChipClass(latestNet) + '" title="' + esc((latestNet.org || '') + (latestNet.ip ? ' / ' + latestNet.ip : '')) + '">' + esc(latestNet.label || '接続情報あり') + '</span>' : '';
        var netAlertChip = netAlerts.length ? '<span class="sfqc-net-chip warn" title="' + esc(netAlerts.join(' / ')) + '">⚠ 接続確認</span>' : '';
        var maintBtn = '<button class="sfqc-act-maint' + (u.maintOk ? ' on' : '') + '" data-mok-uid="' + esc(u.uid) + '" data-mok-name="' + esc(u.name) + '" data-mok-state="' + (u.maintOk ? '0' : '1') + '" title="メンテナンス中でも利用できるアカウントにする">' +
          (u.maintOk ? '🛠 メンテ許可を解除' : '🛠 メンテ許可') + '</button>';
        html +=
          '<div class="sfqc-acc">' +
            '<div class="sfqc-acc-head">' +
              '<div class="sfqc-acc-id">' +
                '<label class="sfqc-app-check"><input type="checkbox" class="sfqc-usel" data-usel-uid="' + esc(u.uid) + '"' + (adminSelUsers[u.uid] ? ' checked' : '') + '></label>' +
                '<span class="sfqc-acc-name">👤 ' + esc(u.name) + '</span>' + accChip + reqAtChip + maintChip + expChipRow + netChip + netAlertChip +
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
                accBtn + maintBtn +
                '<button class="sfqc-act-detail" data-i="' + i + '">詳細 ▾</button>' +
              '</span>' +
            '</div>' +
            '<div class="sfqc-detail" id="sfqc-det-' + i + '"></div>' +
          '</div>';
      });
    }
    var prevScroll = body.scrollTop;
    body.innerHTML = html;
    try { body.scrollTop = prevScroll; } catch (e) {}

    body.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { adminTab = b.getAttribute('data-tab'); renderAdmin(); });
    });
    var bcNew = document.getElementById('sfqc-bc-new'); if (bcNew) bcNew.addEventListener('click', function () { openCompose({ mode: 'broadcast' }); });
    var ntNew = document.getElementById('sfqc-nt-new'); if (ntNew) ntNew.addEventListener('click', function () { openCompose({ mode: 'notice' }); });
    body.querySelectorAll('[data-bcedit]').forEach(function (b) { b.addEventListener('click', function () { editBroadcast(b.getAttribute('data-bcedit')); }); });
    body.querySelectorAll('[data-bcdel]').forEach(function (b) { b.addEventListener('click', function () { deleteBroadcast(b.getAttribute('data-bcdel')); }); });
    body.querySelectorAll('[data-ntedit]').forEach(function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-ntedit').split('|'); editNotice(p[0], p[1]); }); });
    body.querySelectorAll('[data-ntdel]').forEach(function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-ntdel').split('|'); deleteNotice(p[0], p[1]); }); });
    var maintNew = document.getElementById('sfqc-maint-new'); if (maintNew) maintNew.addEventListener('click', openQueueNew);
    var maintQ = document.getElementById('sfqc-maint-queue'); if (maintQ) maintQ.addEventListener('click', openQueueList);
    var maintEditR = document.getElementById('sfqc-maint-edit-recur'); if (maintEditR) maintEditR.addEventListener('click', openRecurringEditor);
    var fullStopBtn = document.getElementById('sfqc-fullstop'); if (fullStopBtn) fullStopBtn.addEventListener('click', toggleFullStop);
    var mailTestBtn = document.getElementById('sfqc-mailtest'); if (mailTestBtn) mailTestBtn.addEventListener('click', sendMailTest);
    var dmIn = document.getElementById('sfqc-dm-q');
    if (dmIn) {
      dmIn.addEventListener('input', function () { dmFilter = dmIn.value; renderAdmin(); setTimeout(function () { var n = document.getElementById('sfqc-dm-q'); if (n) { n.focus(); n.selectionStart = n.selectionEnd = n.value.length; } }, 0); });
    }
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
    body.querySelectorAll('[data-network]').forEach(function (b) {
      b.addEventListener('click', function () { var v = b.getAttribute('data-network'); adminNetwork = (adminNetwork === v ? 'all' : v); renderAdmin(); });
    });
    body.querySelectorAll('[data-acc-uid]').forEach(function (b) {
      b.addEventListener('click', function () { setAccess(b.getAttribute('data-acc-uid'), b.getAttribute('data-acc-name'), b.getAttribute('data-acc-state')); });
    });
    body.querySelectorAll('[data-maintok]').forEach(function (b) {
      b.addEventListener('click', function () { adminMaintOk = !adminMaintOk; renderAdmin(); });
    });
    body.querySelectorAll('[data-mok-uid]').forEach(function (b) {
      b.addEventListener('click', function () { setMaintOk(b.getAttribute('data-mok-uid'), b.getAttribute('data-mok-name'), b.getAttribute('data-mok-state') === '1'); });
    });
    body.querySelectorAll('[data-rej-uid]').forEach(function (b) {
      b.addEventListener('click', function () { rejectApplication(b.getAttribute('data-rej-uid'), b.getAttribute('data-rej-name')); });
    });
    body.querySelectorAll('.sfqc-act-detail').forEach(function (b) {
      b.addEventListener('click', function () { toggleDetail(+b.getAttribute('data-i')); });
    });
    body.querySelectorAll('[data-chat-uid]').forEach(function (b) {
      b.addEventListener('click', function () { openChat(b.getAttribute('data-chat-uid'), b.getAttribute('data-chat-name'), 'admin'); });
    });
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
    body.querySelectorAll('[data-openq]').forEach(function (b) {
      b.addEventListener('click', function () { var id = b.getAttribute('data-openq'); closeAdmin(); if (window.jumpQ) window.jumpQ(Number(id)); });
    });
    body.querySelectorAll('[data-dashcert]').forEach(function (b) {
      b.addEventListener('click', function () { adminDashCert = b.getAttribute('data-dashcert'); renderAdmin(); });
    });
    var qCsv = document.getElementById('sfqc-q-csv'); if (qCsv) qCsv.addEventListener('click', function () { exportQuestionRates('csv'); });
    var qJson = document.getElementById('sfqc-q-json'); if (qJson) qJson.addEventListener('click', function () { exportQuestionRates('json'); });
    body.querySelectorAll('[data-ts-label]').forEach(function (b) {
      var show = function () { var ro = document.getElementById('sfqc-ts-readout'); if (ro) ro.textContent = '📅 ' + b.getAttribute('data-ts-label'); };
      b.addEventListener('click', show);
      b.addEventListener('mouseenter', show);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    });
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
    body.querySelectorAll('.sfqc-usel').forEach(function (b) {
      b.addEventListener('change', function () { var uid = b.getAttribute('data-usel-uid'); if (b.checked) adminSelUsers[uid] = 1; else delete adminSelUsers[uid]; renderAdmin(); });
    });
    var uselAll = document.getElementById('sfqc-usel-all');
    if (uselAll) uselAll.addEventListener('change', function () { adminSelUsers = {}; if (uselAll.checked) filterSortUsers().forEach(function (u) { adminSelUsers[u.uid] = 1; }); renderAdmin(); });
    var ubN = document.getElementById('sfqc-ubulk-notice'); if (ubN) ubN.addEventListener('click', bulkNotice);
    var exSweep = document.getElementById('sfqc-expire-sweep'); if (exSweep) exSweep.addEventListener('click', sweepExpiredAccess);
    var ubMOn = document.getElementById('sfqc-ubulk-mokon'); if (ubMOn) ubMOn.addEventListener('click', function () { bulkMaintOk(true); });
    var ubMOff = document.getElementById('sfqc-ubulk-mokoff'); if (ubMOff) ubMOff.addEventListener('click', function () { bulkMaintOk(false); });
    var ubU = document.getElementById('sfqc-ubulk-unapprove'); if (ubU) ubU.addEventListener('click', bulkUnapprove);
    var ubB = document.getElementById('sfqc-ubulk-block'); if (ubB) ubB.addEventListener('click', bulkBlock);
    var ubR = document.getElementById('sfqc-ubulk-reset'); if (ubR) ubR.addEventListener('click', bulkResetUsers);
    body.querySelectorAll('[data-reply-uid]').forEach(function (b) {
      b.addEventListener('click', function () { replyFeedback(b.getAttribute('data-reply-uid'), b.getAttribute('data-reply-fid'), b.getAttribute('data-reply-name')); });
    });
  }

  function certDetailHTML(c, uid, name) {
    var s = c.stats;
    var examDateLabel = s.examDate ? esc(s.examDate) : '未設定';
    var goalLabel = s.goal ? (s.goal + '問/日') : '未設定';
    var lastExam = s.examLastTs ? fmtDate(s.examLastTs) : '—';
    var acqDate = (c.store && c.store.acquiredDate) || '';
    var revokeBtn = acqDate
      ? '<button class="sfqc-act-revoke" data-uid="' + esc(uid) + '" data-cert="' + esc(c.cert) + '" data-name="' + esc(name) + '">🎓 取得取消</button>'
      : '';
    return '' +
      '<div class="sfqc-cert">' +
        '<div class="sfqc-cert-head">' +
          '<span class="sfqc-cert-name">📘 ' + esc(c.cert) + (acqDate ? ' <span class="sfqc-acc-access ok">🎓 取得済み</span>' : '') + '</span>' +
          '<span class="sfqc-cert-actions">' +
            revokeBtn +
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
          kv('資格取得', acqDate || '未取得') +
        '</div>' +
      '</div>';
  }

  function networkDetailHTML(u) {
    var ds = (u && u.netDevices) || {};
    var devices = Object.keys(ds).map(function (k) { var d = ds[k] || {}; d._id = k; return d; })
      .sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
    var logs = ((u && u.netAccess) || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!devices.length && !logs.length) {
      return '<div class="sfqc-sec">🔐 接続・端末情報</div><div class="sfqc-net-card">まだ接続情報がありません。新版の公開後、承認済みの利用者が次にアクセスすると記録されます。</div>';
    }
    var latest = latestNetworkOf(u), alerts = networkAlertsOf(u), active = activeDevicesOf(u);
    var html = '<div class="sfqc-sec">🔐 接続・端末情報</div>';
    if (alerts.length) html += '<div class="sfqc-net-alert">⚠️ ' + esc(alerts.join(' ／ ')) + '</div>';
    html += '<div class="sfqc-kv-grid">' +
      kv('最新の接続判定', latest ? (latest.label || '判定なし') : '—') +
      kv('マスク済みIP', latest && latest.ip ? latest.ip : '—') +
      kv('回線組織 / ASN', latest ? ([latest.org, latest.asn].filter(Boolean).join(' / ') || '—') : '—') +
      kv('国・地域', latest ? ([latest.country, latest.region, latest.city].filter(Boolean).join(' / ') || '—') : '—') +
      kv('登録端末', devices.length + ' 台') +
      kv('現在オンライン端末', active.length + ' 台') +
      '</div>';
    html += '<div class="sfqc-net-grid">' + devices.map(function (d) {
      var loc = [d.country, d.region, d.city].filter(Boolean).join(' / ');
      var on = active.indexOf(d._id) >= 0;
      return '<div class="sfqc-net-card"><strong>' + (on ? '🟢 ' : '💻 ') + esc((d.os || '不明') + ' / ' + (d.browser || '不明')) + '</strong><br>' +
        '<span class="sfqc-net-chip ' + netChipClass(d) + '">' + esc(d.label || '判定なし') + '</span><br>' +
        'IP: ' + esc(d.ip || '—') + '<br>回線: ' + esc([d.org, d.asn].filter(Boolean).join(' / ') || '—') + '<br>' +
        '地域: ' + esc(loc || '—') + '<br>言語/時差: ' + esc([d.language, d.timezone].filter(Boolean).join(' / ') || '—') + '<br>' +
        '画面: ' + esc(d.screen || '—') + '　記録: ' + (d.loginCount || 0) + '回<br>' +
        '<span class="muted">端末ID ' + esc(String(d._id || '').slice(0, 12)) + '… ／ 初回 ' + esc(fmtDateTime(d.firstSeen)) + ' ／ 最終 ' + esc(fmtDateTime(d.lastSeen)) + '</span></div>';
    }).join('') + '</div>';
    if (logs.length) {
      html += '<details class="sfqc-rd"><summary>🌐 接続履歴（直近' + networkRetainDays() + '日・' + logs.length + '件）</summary><div class="sfqc-login-hist">' +
        logs.slice(0, 30).map(function (e, idx) {
          return '<div class="sfqc-login-row"><span class="sfqc-login-no">' + (idx + 1) + '</span><span>🕒 ' + esc(fmtDateTime(e.ts)) + '　' +
            esc(e.ip || '—') + '　' + esc(e.org || '回線不明') + '　' + esc(e.label || '') + '　' + esc((e.os || '') + (e.browser ? ' / ' + e.browser : '')) + '</span>' +
            (idx === 0 ? '<span class="sfqc-login-latest">最新</span>' : '') + '</div>';
        }).join('') + '</div></details>';
    }
    html += '<div class="sfqc-itnote">IP・VPN・企業回線の判定は参考情報です。携帯回線、共有回線、VPN、スプリットトンネル等で変わるため、この情報だけで本人性や不正利用を断定しないでください。生のIPは保存していません。</div>';
    return html;
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
    html += '<div class="sfqc-meta">' +
      '<div>UID: <code>' + esc(u.uid) + '</code></div>' +
      (u.email ? '<div>メール: ' + esc(u.email) + '</div>' : '') +
      '<div>状態: ' + (isOnline(u) ? '🟢 オンライン' : '⚪ オフライン') + '（最終アクセス ' + esc(u.lastSeen ? fmtDateTime(u.lastSeen) : '—') + '）</div>' +
      '<div>最終ログイン: ' + esc(u.lastLogin ? fmtDateTime(u.lastLogin) : '—') + '</div>' +
      (u.req && u.req.ts ? '<div>申請: ' + esc(u.req.name || u.name) + '（' + esc(fmtDate(u.req.ts)) + '）</div>' : '') +
      (u.elective ? '<div>選択中の解除資格(elective): <code>' + esc(u.elective) + '</code> <button class="sfqc-act-revoke sfqc-el-reset" data-eluid="' + esc(u.uid) + '" data-elname="' + esc(u.name) + '">選択をリセット</button></div>' : '') +
      '</div>';
    if (u.logins && u.logins.length) {
      var recent = u.logins.slice().sort(function (a, b) { return b - a; }).slice(0, 15);
      html += '<details class="sfqc-rd"><summary>🕑 ログイン履歴（' + u.logins.length + '件中・最新' + recent.length + '件）</summary>' +
        '<div class="sfqc-login-hist">' + recent.map(function (t, idx) {
          return '<div class="sfqc-login-row"><span class="sfqc-login-no">' + (idx + 1) + '</span>🕒 ' + esc(fmtDateTime(t)) +
            (idx === 0 ? '<span class="sfqc-login-latest">最新</span>' : '') + '</div>';
        }).join('') + '</div></details>';
    }
    html += networkDetailHTML(u);
    html += '<div><button class="sfqc-del-doc" data-deluid="' + esc(u.uid) + '" data-delname="' + esc(u.name) + '">🗑 このアカウントを完全削除（全データ）</button></div>';
    u.certs.forEach(function (c) { html += certDetailHTML(c, u.uid, u.name); });
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

    box.querySelectorAll('.sfqc-act-revoke[data-uid]').forEach(function (b) {
      b.addEventListener('click', function () { revokeAcquire(b.getAttribute('data-uid'), b.getAttribute('data-cert'), b.getAttribute('data-name')); });
    });
    box.querySelectorAll('.sfqc-el-reset').forEach(function (b) {
      b.addEventListener('click', function () { adminResetElective(b.getAttribute('data-eluid'), b.getAttribute('data-elname')); });
    });
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

  function rejectApplication(uid, name) {
    if (!isAdmin || !db || !uid) return;
    var ru = findUser(uid), rBlocked = !!(ru && ru.access === 'blocked');
    if (!confirm('「' + name + '」の' + (rBlocked ? '解除申請' : '利用申請') + 'を却下します。\n' +
      (rBlocked ? '（アカウントは「停止中」のままです。本人は再度、解除を申請できます）'
                : '（アカウントは「承認待ち」のままで、本人は再申請できます。完全に締め出す場合は「停止」を使ってください）') +
      '\n\nよろしいですか？')) return;
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

  function setAccess(uid, name, state) {
    if (!isAdmin || !db) return;
    var verb = state === 'approved' ? '承認' : '停止';
    if (!confirm('「' + name + '」を' + verb + 'します。よろしいですか？')) return;
    var ts = Date.now();
    var rec = { access: state, updated: ts };
    if (state === 'approved') rec.approvedAt = ts;
    db.collection(COLLECTION).doc(uid).set(rec, { merge: true })
      .then(function () {
        var u = findUser(uid); if (u) { u.access = state; u.updated = ts; if (state === 'approved') u.approvedAt = ts; }
        if (state === 'approved') delete adminSelApps[uid];
        logAdmin(verb, name);
        toastSafe('「' + name + '」を' + verb + 'しました'); renderAdmin();
      })
      .catch(function (e) { alert('変更に失敗しました: ' + (e && e.message)); });
  }

  function setMaintOk(uid, name, on) {
    if (!isAdmin || !db) return;
    var verb = on ? 'メンテナンス中も利用できるように' : 'メンテナンス中の利用を';
    if (!confirm('「' + name + '」を' + verb + (on ? 'します。' : '不可（通常どおり）にします。') + 'よろしいですか？')) return;
    db.collection(COLLECTION).doc(uid).set({ maintOk: on, updated: Date.now() }, { merge: true })
      .then(function () {
        var u = findUser(uid); if (u) { u.maintOk = on; u.updated = Date.now(); }
        logAdmin('メンテ許可', name + '／' + (on ? 'ON' : 'OFF'));
        toastSafe('「' + name + '」のメンテ許可を' + (on ? '付与' : '解除') + 'しました'); renderAdmin();
      })
      .catch(function (e) { alert('変更に失敗しました: ' + (e && e.message)); });
  }

  function sweepExpiredAccess() {
    if (!isAdmin || !db) return;
    var now = Date.now();
    var targets = adminUsers.filter(function (u) { return accessExpired(u, now); });
    if (!targets.length) { toastSafe('対象のアカウントはありません'); return; }
    if (!confirm(INACTIVE_DAYS + '日以上アクセスがない承認済みアカウント ' + targets.length + ' 件の承認を解除します。\n' +
      '本人は次回ログイン時に再申請が必要になります（学習の進捗は消えません）。よろしいですか？')) return;
    var ps = targets.map(function (u) {
      var payload = { access: 'pending', expiredAt: now, expiredDays: inactiveDaysOf(u, now), updated: now };
      try { payload.req = firebase.firestore.FieldValue.delete(); } catch (e) {}
      return db.collection(COLLECTION).doc(u.uid).set(payload, { merge: true })
        .then(function () { return { uid: u.uid, ok: true }; })
        .catch(function () { return { uid: u.uid, ok: false }; });
    });
    Promise.all(ps).then(function (res) {
      var done = 0;
      res.forEach(function (r) {
        if (!r.ok) return;
        done++;
        var u = findUser(r.uid); if (u) { u.access = 'pending'; u.req = null; u.updated = now; }
      });
      logAdmin('休眠承認解除', done + '件');
      toastSafe(done + ' 件の承認を解除しました' + (done < targets.length ? '（' + (targets.length - done) + '件失敗）' : ''));
      renderAdmin();
    });
  }

  function bulkMaintOk(on) {
    if (!isAdmin || !db) return;
    var uids = Object.keys(adminSelUsers); if (!uids.length) return;
    if (!confirm(uids.length + ' 人のメンテ許可を' + (on ? '付与' : '解除') + 'します。よろしいですか？')) return;
    var ts = Date.now();
    var ps = uids.map(function (uid) {
      return db.collection(COLLECTION).doc(uid).set({ maintOk: on, updated: ts }, { merge: true })
        .then(function () { return { uid: uid, ok: true }; })
        .catch(function () { return { uid: uid, ok: false }; });
    });
    Promise.all(ps).then(function (res) {
      var done = 0;
      res.forEach(function (r) { if (!r.ok) return; done++; var u = findUser(r.uid); if (u) { u.maintOk = on; u.updated = ts; } });
      logAdmin('一括メンテ許可', done + '件／' + (on ? 'ON' : 'OFF'));
      toastSafe(done + ' 人のメンテ許可を' + (on ? '付与' : '解除') + 'しました' + (done < uids.length ? '（' + (uids.length - done) + '件失敗）' : ''));
      renderAdmin();
    });
  }

  function bulkApprove(uids) {
    if (!isAdmin || !db || !uids || !uids.length) return;
    if (!confirm(uids.length + ' 件の申請をまとめて承認します。よろしいですか？')) return;
    var ts = Date.now();
    var ps = uids.map(function (uid) {
      return db.collection(COLLECTION).doc(uid).set({ access: 'approved', approvedAt: ts, updated: ts }, { merge: true })
        .then(function () { return { uid: uid, ok: true }; })
        .catch(function () { return { uid: uid, ok: false }; });
    });
    Promise.all(ps).then(function (res) {
      var done = 0;
      res.forEach(function (r) {
        if (!r.ok) return;
        done++;
        var u = findUser(r.uid); if (u) { u.access = 'approved'; u.approvedAt = ts; u.updated = ts; }
        delete adminSelApps[r.uid];
      });
      logAdmin('一括承認', done + '件');
      toastSafe(done + ' 件を承認しました' + (done < uids.length ? '（' + (uids.length - done) + '件失敗）' : ''));
      renderAdmin();
    });
  }

  function bulkNotice() {
    var uids = Object.keys(adminSelUsers); if (!uids.length) return;
    openCompose({ mode: 'notice', uids: uids });
  }
  function bulkUnapprove() {
    var uids = Object.keys(adminSelUsers); if (!isAdmin || !db || !uids.length) return;
    var targets = uids.filter(function (uid) { var u = findUser(uid); return u && u.access === 'approved'; });
    var skipped = uids.length - targets.length;
    if (!targets.length) { toastSafe('選択の中に承認済みのアカウントがありません'); return; }
    if (!confirm(targets.length + ' 人の承認を解除して「承認待ち」に戻します。\n' +
      '本人は次回ログイン時に利用申請のやり直しが必要です（学習の進捗は消えません）。\n' +
      (skipped ? '※ 停止中・承認待ちの ' + skipped + ' 件は対象外です。\n' : '') +
      '\nよろしいですか？')) return;
    var FV = firebase.firestore.FieldValue, ts = Date.now();
    Promise.all(targets.map(function (uid) {
      return db.collection(COLLECTION).doc(uid)
        .set({ access: 'pending', req: FV.delete(), expiredAt: FV.delete(), updated: ts }, { merge: true })
        .then(function () {
          var u = findUser(uid); if (u) { u.access = 'pending'; u.req = null; u.expiredAt = 0; u.updated = ts; }
          delete adminSelApps[uid];
          return true;
        }).catch(function () { return false; });
    })).then(function (res) {
      var n = res.filter(Boolean).length; adminSelUsers = {};
      logAdmin('一括承認解除', n + '件');
      toastSafe(n + ' 人の承認を解除しました' + (n < targets.length ? '（' + (targets.length - n) + '件失敗）' : ''));
      renderAdmin();
    });
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

  function revokeAcquire(uid, cert, name) {
    if (!isAdmin || !db) return;
    var u = findUser(uid); if (!u) return;
    var c = u.certs.filter(function (x) { return x.cert === cert; })[0];
    if (!c || !c.store || !c.store.acquiredDate) { toastSafe('この資格は取得済みではありません'); return; }
    if (!confirm('「' + name + '」［' + cert + '］の「取得済み」を取り消します。\n本人の学習ロックが解除され、再び学習できるようになります。\n（進捗データはそのまま保持されます）\n\nよろしいですか？')) return;
    var ref = db.collection(COLLECTION).doc(uid);
    var FP = firebase.firestore.FieldPath;
    var ns;
    try { ns = JSON.parse(JSON.stringify(c.store)); } catch (e) { ns = c.store; }
    ns.acquiredDate = ''; ns.acqLock = 0;
    var p = (cert === '(旧)' || cert === '—')
      ? ref.update('store', ns, 'updated', Date.now())
      : ref.update(new FP('stores', cert), ns, 'updated', Date.now());
    p.then(function () {
        c.store = ns; u.updated = Date.now(); refreshUser(u);
        logAdmin('取得済み取消', name + '［' + cert + '］');
        toastSafe('「' + name + '」［' + cert + '］の取得済みを取り消しました'); renderAdmin();
      })
      .catch(function (e) { alert('取り消しに失敗しました: ' + (e && e.message)); });
  }

  function adminResetElective(uid, name) {
    if (!isAdmin || !db || !uid) return;
    if (!confirm('「' + name + '」が選択中の「解除する資格(elective)」をリセットします。\n本人は残りの資格からもう一度選び直せるようになります。\n（取得済みの資格や進捗には影響しません）\n\nよろしいですか？')) return;
    var FV = firebase.firestore.FieldValue;
    db.collection(COLLECTION).doc(uid).update({ elective: FV.delete(), updated: Date.now() })
      .then(function () {
        var u = findUser(uid); if (u) { u.elective = ''; u.updated = Date.now(); }
        logAdmin('elective リセット', name);
        toastSafe('「' + name + '」の選択をリセットしました'); renderAdmin();
      })
      .catch(function (e) { alert('リセットに失敗しました: ' + (e && e.message)); });
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

  function fbCatLabel(k) {
    var m = { bug: '🐞 不具合', answer: '❌ 正解誤り', exp: '📝 解説誤り', choice: '🔀 選択肢', japanese: '🗾 日本語', request: '💡 要望', other: '＊ その他' };
    return m[k] || k || '—';
  }
  function lastChatMsg(chat) {
    if (!Array.isArray(chat) || !chat.length) return null;
    var m = null; chat.forEach(function (x) { if (x && (!m || (x.ts || 0) > (m.ts || 0))) m = x; });
    return m;
  }
  function annAudience() { var myUid = (currentUser && currentUser.uid) || ''; return adminUsers.filter(function (u) { return u.uid !== myUid; }); }

  function announcementsSectionHTML() {
    var now = Date.now();
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
    var pending = all.filter(function (r) { return !r.reply; }).length;
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
      var openLink = '';
      if (fb.qid && fb.cert === CERT_KEY && typeof window.jumpQ === 'function') {
        openLink = '<button class="sfqc-fb-open" data-openq="' + esc(String(fb.qid)) + '">🔎 Q' + esc(String(fb.qid)) + ' を開く</button>';
      } else if (fb.url) {
        var fbUrlSafe = safeUrl(fb.url);
        if (fbUrlSafe) openLink = '<a class="sfqc-fb-open" href="' + esc(fbUrlSafe) + '" target="_blank" rel="noopener">🔗 報告ページ' + (fb.qid ? '（Q' + esc(String(fb.qid)) + '）' : '') + 'を開く</a>';
      }
      var fbRefSafe = fb.ref ? safeUrl(fb.ref) : '';
      var links = (openLink || fbRefSafe)
        ? '<div class="sfqc-fb-ref">' + openLink + (fbRefSafe ? (openLink ? ' ・ ' : '') + '<a href="' + esc(fbRefSafe) + '" target="_blank" rel="noopener">参照リンク</a>' : '') + '</div>'
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
      lines.push(row.map(csvCell).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    dlBlob(blob, 'sfquiz-feedback-' + new Date().toISOString().slice(0, 10) + '.csv');
  }

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
      lines.push(row.map(csvCell).join(','));
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
      '学習日数', '学習時間(分)', '最終学習日', '受験予定日', '日次目標',
      '接続判定', '判定信頼度', 'マスク済みIP', '回線組織', 'ASN', '接続国', '接続地域', '接続都市',
      '端末数', 'オンライン端末数', '接続注意'
    ];
    var lines = [head.join(',')];
    adminUsers.forEach(function (u) {
      var n = latestNetworkOf(u), ds = Object.keys(u.netDevices || {}), active = activeDevicesOf(u), alerts = networkAlertsOf(u);
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
          s.daysActive, Math.round((s.studySec || 0) / 60), s.lastStudyDate, s.examDate, s.goal,
          n ? n.label : '', n ? n.confidence : '', n ? n.ip : '', n ? n.org : '', n ? n.asn : '',
          n ? n.country : '', n ? n.region : '', n ? n.city : '', ds.length, active.length, alerts.join(' / ')
        ];
        lines.push(row.map(csvCell).join(','));
      });
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'sfquiz_accounts_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.__sfqcTest = { statsOf: statsOf, aggregateUser: aggregateUser, perQuestionStats: perQuestionStats, emptyStore: emptyStore,
    maintStatus: maintStatus, maintShouldBlock: maintShouldBlock,
    accessExpired: accessExpired, inactiveDaysOf: inactiveDaysOf, cacheApproval: cacheApproval, cachedApprovalValid: cachedApprovalValid,
    accessStateOf: accessStateOf, isApplicant: isApplicant,
    mailEnabled: mailEnabled, mailParams: mailParams, mailThrottled: mailThrottled, idOf: idOf,
    sha256Hex: sha256Hex, matchAdmin: matchAdmin, sanitizeId: sanitizeId,
    parseTrace: parseTrace, ipv4Int: ipv4Int, ipInCidr: ipInCidr, maskIp: maskIp,
    corporateMatch: corporateMatch, classifyNetwork: classifyNetwork, pruneNetworkData: pruneNetworkData,
    activeDevicesOf: activeDevicesOf, latestNetworkOf: latestNetworkOf, networkAlertsOf: networkAlertsOf, networkDetailHTML: networkDetailHTML,
    INACTIVE_DAYS: INACTIVE_DAYS };

  function init() {
    ROLE = window.SFQ_PAGE_ROLE || (window.__setStore ? 'client' : 'gateway');
    HOME_URL = window.SFQ_HOME_URL || 'index.html';

    buildUI();
    setupSWUpdate();

    window.__sfqAccount = function () {
      var h = location.hostname, loc = (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '');
      return { loggedIn: !!currentUser, name: currentName || '', email: currentEmail || '', isAdmin: !!isAdmin,
               status: (elStatus ? elStatus.textContent : '') || '', configured: configOk(), local: loc };
    };
    window.__sfqLogout = function () { doLogout(); };
    window.__sfqOpenAdmin = function () { openAdmin(); };

    var _h = location.hostname;
    if (_h === 'localhost' || _h === '127.0.0.1' || _h === '::1' || _h === '') {
      hideOverlay();
      try { console.info('[cloud-sync] ローカル環境のためログイン/同期をスキップ（ローカル保存のみ）'); } catch (e) {}
      return;
    }

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

    if (ROLE !== 'client') showOverlay();

    auth.onAuthStateChanged(function (user) {
      if (user) {
        onLogin(user);
      } else {
        currentUser = null; isAdmin = false;
        stopAccessWatch(); stopAdminPending(); stopUserMessaging(); stopPresence();
        setBadge(''); setStatus(''); showAdminBtn(false); setAdminPending(0); closeAdmin();
        hideLock(); showOverlay();
        if (expiredNotice) {
          expiredNotice = false;
          setMsg(INACTIVE_DAYS + '日以上ご利用がなかったため、自動的にログアウトしました。ログインのうえ、もう一度利用を申請してください。', 'err');
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
