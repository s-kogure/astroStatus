/**
 * astroStatus Service Worker
 *
 * - App Shell キャッシュ（CSS/JS/HTML/フォント/画像）
 * - data/ はネットワーク優先（cronで更新されるため）
 * - push通知の受信・表示
 */

const CACHE_NAME = 'astrostatus-v1';

const APP_SHELL = [
  './',
  './index.html',
  './src/css/reset.min.css',
  './src/css/style.css',
  './src/css/icons.css',
  './src/js/app.js',
  './src/js/ui_affects.js',
  './src/js/push-subscribe.js',
  './src/images/icons/fonts/Untitled.woff2',
  './src/images/bg/bg_moon.svg',
  './src/images/bg/bg_star.svg',
  './src/images/icons/chevron_down.svg',
  './src/images/icons/status/status-ok.png',
  './src/images/icons/status/status-caution.png',
  './src/images/icons/status/status-notice.png',
];

// ── Install: App Shell をキャッシュ ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: 古いキャッシュを削除 ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: data/ はネットワーク優先、それ以外はキャッシュ優先 ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // data/ 配下（current.json, schedule.json）はネットワーク優先
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App Shell: キャッシュ優先
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ── Push通知の受信 ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: './src/images/pwa_android.png',
    badge: './src/images/pwa_android.png',
    tag: data.tag || 'astrostatus',
    data: { url: data.url || './' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'astroStatus', options)
  );
});

// ── 通知クリック時にアプリを開く ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('astro'));
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
