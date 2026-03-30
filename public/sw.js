// ============================================================
// Lycos Team - Service Worker v1.0
// Maneja notificaciones push en background
// ============================================================

const CACHE_NAME = 'lycos-team-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Recibir notificación push ─────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Lycos Team', body: event.data.text(), type: 'general' };
  }

  const title = data.title || 'Lycos Team';
  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/logo-icon-white.png',
    badge: '/logo-icon-white.png',
    tag: data.tag || data.type || 'general',
    data: {
      url: data.url || '/dashboard',
      type: data.type || 'general',
    },
    requireInteraction: data.requireInteraction || false,
    silent: false,
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Click en notificación → abrir/enfocar la app ─────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
