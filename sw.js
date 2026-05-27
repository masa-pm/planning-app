'use strict';

const CACHE_NAME = 'plan-app-v1';
const PRECACHE = ['./manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // HTML は常にサーバーから取得
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(url.href, { cache: 'no-store' }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Firebase / Google 系はキャッシュしない
  const noCacheHosts = ['googleapis.com', 'gstatic.com', 'google.com'];
  if (noCacheHosts.some(h => url.hostname.includes(h))) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── 通知スケジュール管理 ──────────────────────────────────────────────────────
let _timers = [];

self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SCHEDULE_NOTIFICATIONS') {
    // 既存タイマーをすべてクリア
    _timers.forEach(t => clearTimeout(t));
    _timers = [];

    for (const item of (data.items || [])) {
      if (!item.delay || item.delay <= 0) continue;
      const t = setTimeout(() => {
        self.registration.showNotification(item.title, {
          body:    item.body,
          icon:    './icon-192.svg',
          badge:   './icon-192.svg',
          tag:     item.tag,
          vibrate: [200, 100, 200],
        });
      }, item.delay);
      _timers.push(t);
    }
    console.log(`[plan-sw] Scheduled ${_timers.length} notifications`);
  }

  if (data.type === 'CANCEL_NOTIFICATIONS') {
    _timers.forEach(t => clearTimeout(t));
    _timers = [];
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow('./index.html');
    })
  );
});
