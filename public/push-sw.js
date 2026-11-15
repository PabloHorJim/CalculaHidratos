// Loaded by the service worker (see vite.config.ts): shows the notifications sent by /api/notify.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* not JSON: show a generic notice */ }
  event.waitUntil(self.registration.showNotification(data.title || 'CarbCalc', {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || 'carbcalc',
    renotify: true,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    for (const client of windows) if ('focus' in client) return client.focus();
    return self.clients.openWindow((event.notification.data && event.notification.data.url) || '/');
  }));
});
