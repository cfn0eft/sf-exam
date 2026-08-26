(function () {
  'use strict';

  var MANUAL_MAINTENANCE = false;
  var PREVIEW_HASH = '609f365149f3895e959cacb67e4e5db5de44022695655f18719202f83288da07';

  var PREVIEW_KEY = 'sfq_preview_ok';

  window.SFQ_hasPreview = function () {
    try { return sessionStorage.getItem(PREVIEW_KEY) === '1'; } catch (e) { return false; }
  };

  var BASE = '';
  try {
    var sc = document.currentScript;
    if (sc && sc.src) BASE = sc.src.replace(/maintenance\.js.*$/, '');
  } catch (e) {}

  function redirectIfNeeded() {
    if (!MANUAL_MAINTENANCE) return;
    if (/maintenance\.html(?:[?#]|$)/.test(location.pathname)) return;
    location.replace(BASE + 'maintenance.html');
  }

  function sha256hex(str) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.reject();
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function stripPreviewParam() {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('preview');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
    } catch (e) {}
  }

  if (window.SFQ_hasPreview()) return;

  var um = /[?&]preview=([^&#]+)/.exec(location.search);
  if (um) {
    var candidate = '';
    try { candidate = decodeURIComponent(um[1]); } catch (e) { candidate = um[1]; }
    sha256hex(candidate).then(function (h) {
      if (h === PREVIEW_HASH) {
        try { sessionStorage.setItem(PREVIEW_KEY, '1'); } catch (e) {}
        stripPreviewParam();
      } else {
        redirectIfNeeded();
      }
    }, function () { redirectIfNeeded(); });
    return;
  }

  redirectIfNeeded();
})();
