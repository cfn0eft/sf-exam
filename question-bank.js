/* Authenticated question delivery. No public JSON or persistent-cache fallback. */
(function () {
  'use strict';
  var db, auth, generation = 0, accessKey = '', ready = false, initialized = false;
  var cache = new Map(), ownUnsub, initResolve, initError;
  var initPromise = new Promise(function (resolve) { initResolve = resolve; });
  function notify() { window.dispatchEvent(new Event('sfq-bank-access')); }
  function invalidate(key, allowed) {
    if (accessKey === key && ready === allowed) return;
    accessKey = key; ready = allowed; generation++; cache.clear(); notify();
  }
  function initialize(a, d) {
    if (initialized) return;
    initialized = true; auth = a; db = d; initResolve();
    auth.onAuthStateChanged(function (user) {
      if (ownUnsub) ownUnsub();
      invalidate('', false);
      if (!user) return;
      // UID-based administrator status is still enforced by Firestore Rules.
      var uid = user.uid;
      ownUnsub = db.collection('progress').doc(uid).onSnapshot({ includeMetadataChanges: true }, function (snap) {
        if (!auth.currentUser || auth.currentUser.uid !== uid) return;
        if (snap.metadata.hasPendingWrites) return;
        if (snap.metadata.fromCache) { invalidate('', false); return; }
        var data = snap.exists ? snap.data() : {};
        var key = [uid, data.access || '', data.specialistAccess === true].join(':');
        // Admins are permitted even if their own progress document is absent.
        // All actual reads, including those after a forged UI flag, hit the server.
        invalidate(key, true);
      }, function () { invalidate('', false); });
    });
    window.addEventListener('offline', function () { invalidate('', false); });
  }
  async function digest(text) {
    var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function timeout(promise, ms) {
    var timer;
    return Promise.race([promise, new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('問題の取得がタイムアウトしました。通信を確認して再試行してください。')); }, ms);
    })]).finally(function () { clearTimeout(timer); });
  }
  async function load(slug, onAuthorized) {
    await timeout(initPromise, 15000);
    if (initError) throw initError;
    if (!auth.currentUser || !ready) {
      var pending = new Error('ログインと利用承認を確認しています。');
      pending.code = 'bank-auth-pending';
      throw pending;
    }
    if (!/^[a-z][a-z-]+$/.test(slug)) throw new Error('資格が不正です。');
    var token = generation;
    if (cache.has(slug)) return cache.get(slug);
    var task = timeout((async function () {
      var ref = db.collection('questionBanks').doc(slug);
      var snapshot = await ref.get({ source: 'server' });
      if (!snapshot.exists) throw new Error('問題データの準備中です。');
      var m = snapshot.data();
      if (m.schema !== 1 || !Array.isArray(m.chunks) || !m.chunks.length || m.chunks.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(m.activeVersion)) throw new Error('問題データの構成が不正です。');
      if (typeof onAuthorized === 'function') onAuthorized();
      var bank = [];
      // Sequential reads bound memory and avoid bursts of dependent rule reads.
      for (var part of m.chunks) {
        if (!/^part-\d+$/.test(part.id)) throw new Error('問題データの分割情報が不正です。');
        var doc = await ref.collection('versions').doc(m.activeVersion).collection('chunks').doc(part.id).get({ source: 'server' });
        if (token !== generation) throw new Error('利用状態が変わりました。再度ログインしてください。');
        var data = doc.exists ? doc.data() : {};
        if (typeof data.json !== 'string' || await digest(data.json) !== part.sha256) throw new Error('問題データの照合に失敗しました。');
        var rows = JSON.parse(data.json);
        if (!Array.isArray(rows) || rows.length !== part.count) throw new Error('問題数が一致しません。');
        bank.push.apply(bank, rows);
      }
      var bankHash = await digest(JSON.stringify(bank));
      if (token !== generation || bank.length !== m.count || bankHash !== m.sha256) throw new Error('問題データの照合に失敗しました。');
      if (new Set(bank.map(function (q) { return q.id; })).size !== bank.length || bank.some(function (q) { return !q.question || !Array.isArray(q.choices) || !Array.isArray(q.answers); })) throw new Error('問題の形式が不正です。');
      return bank;
    })(), 30000);
    cache.set(slug, task);
    try { return await task; } catch (e) { if (cache.get(slug) === task) cache.delete(slug); throw e; }
  }
  function failInitialization(message) {
    if (initialized) return;
    initError = new Error(message);
    initError.code = 'bank-init-failed';
    initResolve();
  }
  window.SFQ_BANK = { initialize: initialize, failInitialization: failInitialization, load: load, generation: function () { return generation; } };
})();
