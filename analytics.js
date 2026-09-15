(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-PQSXG5S47Z';
  var isProduction = location.protocol === 'https:'
    && location.hostname === 'cfn0eft.github.io'
    && (location.pathname === '/sf-exam' || location.pathname.indexOf('/sf-exam/') === 0);

  // ローカル開発や別ホストのプレビューを本番集計に混ぜない。
  if (!isProduction) return;

  function safeUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(value);
      return url.origin + url.pathname;
    } catch (_) {
      return '';
    }
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  // Cookie・広告用途を無効化した Consent Mode で、匿名のページ閲覧だけを計測する。
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: location.origin + location.pathname,
    page_referrer: safeUrl(document.referrer)
  });

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
  document.head.appendChild(script);
})();
