/*
 * Cache cleanup worker.
 *
 * Offline caching was intentionally retired. Older releases registered a
 * cache-first worker, so this final worker exists only to remove those caches
 * and unregister itself. It does not intercept fetch requests.
 */
const RELEASE = 'sf-exam-v176';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => /^sf-exam(?:-|$)/.test(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});
