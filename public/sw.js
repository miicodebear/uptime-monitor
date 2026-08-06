/* global self, clients */

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Uptime Alert',
    body: 'A monitored website is DOWN!',
    url: '/',
    domain: null,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const title = data.title || 'Uptime Alert';
  const body =
    data.body ||
    (data.domain
      ? `Alert: ${data.domain} is DOWN!`
      : 'A monitored website is DOWN!');

  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [120, 60, 120],
    data: {
      url: data.url || '/',
      domain: data.domain || null,
    },
    actions: data.url
      ? [
          { action: 'open-site', title: 'Open site' },
          { action: 'open-dashboard', title: 'Dashboard' },
        ]
      : [],
    requireInteraction: true,
    tag: data.domain ? `down-${data.domain}` : 'uptime-down',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifyData = event.notification.data || {};
  let targetUrl = '/';

  if (event.action === 'open-dashboard') {
    targetUrl = '/';
  } else if (event.action === 'open-site' || !event.action) {
    targetUrl = notifyData.url || '/';
  }

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && targetUrl) {
            try {
              await client.navigate(targetUrl);
              return;
            } catch {
              // Fall through to openWindow
            }
          }
        }
      }

      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
