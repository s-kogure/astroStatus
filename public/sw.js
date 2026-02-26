/**
 * astroStatus Service Worker
 *
 * キャッシュ戦略:
 * - HTML/CSS/JS: Stale-While-Revalidate（キャッシュから即応答 + 裏で最新取得 → 次回反映）
 * - 画像/フォント: Cache-First（変更頻度が低いため）
 * - data/: Network-First（cronで更新されるため）
 * - push通知の受信・表示
 *
 * CACHE_VERSION をインクリメントすると、デプロイ時に全キャッシュがクリアされる
 */

const CACHE_VERSION = 2;
const CACHE_NAME = `astrostatus-v${CACHE_VERSION}`;

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

// Stale-While-Revalidate 対象（HTML/CSS/JS）
// キャッシュから即座に返しつつ、裏でネットワーク取得してキャッシュを更新する
const SWR_PATTERNS = [
  /\.html(\?.*)?$/,
  /\.css(\?.*)?$/,
  /\.js(\?.*)?$/,
  /\/$/,  // index.html へのルートアクセス
];

function isSWRTarget(url) {
  return SWR_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

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

// ── Fetch ──
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

  // HTML/CSS/JS: Stale-While-Revalidate
  // キャッシュがあれば即座に返し、裏でネットワークから最新版を取得してキャッシュ更新
  if (isSWRTarget(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // 画像・フォント等: Cache-First（変更頻度が低い）
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
