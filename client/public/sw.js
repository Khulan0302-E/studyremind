// Service worker: офлайн үед апп нээгдэх (app shell кэш) + мэдэгдлийн товч
const CACHE = 'studyremind-v2';
const SHELL = ['/', '/index.html', '/app.js', '/app.css', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // API-г апп өөрөө кэшилнэ
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put('/index.html', r.clone())); return r; }).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => { if (r.ok && url.origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  const action = e.action || 'open';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) {
      all[0].postMessage({ type: 'notif-action', action, taskId });
      if (action === 'open') return all[0].focus();
      return undefined;
    }
    return self.clients.openWindow(taskId ? `/?task=${taskId}&action=${action}` : '/');
  })());
});
