// ============================================================
// Lycos Team - Service Worker v2
// Notificaciones push: que suenen siempre, que se vean bien y que no se pierdan.
// ============================================================

// v2 · cambiar este archivo hace que los navegadores instalen la versión nueva.
const ICONO = '/Nuevo_Lycos_LOGO.png';
// La clave pública VAPID llega en la URL del registro (/sw.js?k=…) para poder
// re-suscribirse solo cuando el navegador renueve la suscripción.
const CLAVE = new URL(self.location.href).searchParams.get('k') || '';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Vibración según lo que es: lo urgente insiste, un mensaje es corto.
const VIBRA = {
  'atencion-cliente': [400, 150, 400, 150, 400],
  'whatsapp-human': [300, 120, 300, 120, 300],
  'tramite_alert': [300, 120, 300],
  'pago-proveedor': [300, 120, 300],
  'prueba': [200, 100, 200],
};

let pendientes = 0;

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Lycos Team', body: event.data ? event.data.text() : '' }; }
  const tipo = data.type || 'general';
  const titulo = data.title || 'Lycos Team';
  const opciones = {
    body: data.body || 'Nueva notificación',
    icon: ICONO,
    badge: ICONO,
    // Misma etiqueta = se agrupa en un solo aviso, pero renotify hace que VUELVA A SONAR
    // (antes los avisos con la misma etiqueta se reemplazaban en silencio).
    tag: data.tag || `${tipo}-${Date.now()}`,
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    silent: false,
    timestamp: data.ts || Date.now(),
    vibrate: VIBRA[tipo] || [200, 100, 200],
    data: { url: data.url || '/dashboard', type: tipo },
    actions: [{ action: 'abrir', title: 'Abrir' }],
  };
  pendientes += 1;
  event.waitUntil((async () => {
    await self.registration.showNotification(titulo, opciones);
    try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(pendientes); } catch { /* sin insignia */ }
    // La pestaña abierta se entera al instante (sonido y aviso dentro de la app).
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) v.postMessage({ lycos: 'push', titulo, cuerpo: opciones.body, tipo, url: opciones.data.url });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  pendientes = Math.max(0, pendientes - 1);
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil((async () => {
    try { if (self.navigator.clearAppBadge && pendientes === 0) await self.navigator.clearAppBadge(); } catch { /* noop */ }
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (v.url.startsWith(self.location.origin) && 'focus' in v) {
        await v.focus();
        try { await v.navigate(url); } catch { v.postMessage({ lycos: 'navegar', url }); }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

self.addEventListener('notificationclose', () => { pendientes = Math.max(0, pendientes - 1); });

// El navegador renovó (o perdió) la suscripción: se vuelve a suscribir y se avisa al servidor,
// si no ese aparato dejaba de recibir sin que nadie se enterara.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const viejo = event.oldSubscription ? event.oldSubscription.endpoint : null;
    let nueva = event.newSubscription;
    if (!nueva && CLAVE) {
      const b = atob(CLAVE.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (CLAVE.length % 4)) % 4));
      const clave = Uint8Array.from(b, (c) => c.charCodeAt(0));
      nueva = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
    }
    if (!nueva) return;
    await fetch('/api/push/subscribe', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nueva.toJSON(), viejo }),
    });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.lycos === 'limpiar-insignia') {
    pendientes = 0;
    try { if (self.navigator.clearAppBadge) self.navigator.clearAppBadge(); } catch { /* noop */ }
  }
});
