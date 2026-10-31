'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BellRing, BellOff, Loader2, Smartphone, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';

/**
 * Las notificaciones push del panel, en TODAS las pantallas.
 *
 * Antes solo las registraba la cabecera clásica: quien entraba por las pantallas nuevas
 * (Finanzas, Ficha, Proveedores…) nunca quedaba suscrito, y el permiso se pedía sin que la
 * persona tocara nada (Chrome y el iPhone lo bloquean en silencio). Ahora:
 *
 *   · en cada carga se registra el service worker y se renueva la suscripción atada al usuario;
 *   · si falta el permiso, aparece un aviso con el botón para activarlas (el navegador solo lo
 *     concede si se pide tocando un botón); si están bloqueadas, explica cómo desbloquearlas;
 *   · en iPhone, sin instalar la app en la pantalla de inicio no hay notificaciones: lo dice;
 *   · con la app abierta, cada aviso suena y sale dentro de la app también;
 *   · «Probar» manda una notificación de verdad a los aparatos del usuario.
 */

function claveVapid(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function sonar(urgente: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = urgente ? 988 : 784; g.gain.value = 0.07;
    o.start(); setTimeout(() => { o.frequency.value = urgente ? 740 : 988; }, 140); setTimeout(() => { o.stop(); void ctx.close(); }, urgente ? 420 : 280);
  } catch { /* sin sonido hasta que la persona toque la página */ }
}

const OCULTO = 'lycos-push-aviso-oculto';

export default function ActivadorPush() {
  const router = useRouter();
  const user = useAppStore(s => s.user);
  const setPushRegistered = useAppStore(s => s.setPushRegistered);
  const [estado, setEstado] = useState<'cargando' | 'sin_soporte' | 'ios_sin_instalar' | 'pedir' | 'bloqueado' | 'activo'>('cargando');
  const [oculto, setOculto] = useState(true);
  const [trabajando, setTrabajando] = useState(false);

  const suscribir = useCallback(async (): Promise<boolean> => {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return false;
    const reg = await navigator.serviceWorker.register(`/sw.js?k=${encodeURIComponent(vapid)}`, { updateViaCache: 'none' });
    void reg.update().catch(() => {});
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Una suscripción hecha con otra clave no recibe nada: se rehace.
    if (sub) {
      const k = sub.options?.applicationServerKey;
      const actual = k ? btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
      if (actual && actual !== vapid.replace(/=+$/, '')) { await sub.unsubscribe().catch(() => {}); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveVapid(vapid) });
    const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
    if (r.ok) setPushRegistered(true);
    return r.ok;
  }, [setPushRegistered]);

  // Al entrar: ¿se puede, hay permiso? Si lo hay, se renueva la suscripción.
  useEffect(() => {
    if (!user) return;
    try { setOculto(sessionStorage.getItem(OCULTO) === '1'); } catch { setOculto(false); }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEstado(ios && !instalada ? 'ios_sin_instalar' : 'sin_soporte'); return;
    }
    if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }
    if (Notification.permission === 'default') { setEstado('pedir'); return; }
    suscribir().then(ok => setEstado(ok ? 'activo' : 'pedir')).catch(() => setEstado('pedir'));
  }, [user, suscribir]);

  // Con la app abierta: el aviso también sale aquí dentro, con sonido.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const alMensaje = (ev: MessageEvent) => {
      const d = ev.data as { lycos?: string; titulo?: string; cuerpo?: string; tipo?: string; url?: string };
      if (d?.lycos === 'navegar' && d.url) { router.push(d.url); return; }
      if (d?.lycos !== 'push' || document.visibilityState !== 'visible') return;
      const urgente = /atencion|human|alerta|pago|emergencia/.test(d.tipo || '');
      sonar(urgente);
      toast(d.titulo || 'Lycos Team', {
        description: d.cuerpo, duration: urgente ? 15000 : 6000,
        action: d.url ? { label: 'Abrir', onClick: () => router.push(d.url!) } : undefined,
      });
    };
    navigator.serviceWorker.addEventListener('message', alMensaje);
    // Al volver a la app se limpia el número del ícono.
    const alVolver = () => { if (document.visibilityState === 'visible') navigator.serviceWorker.controller?.postMessage({ lycos: 'limpiar-insignia' }); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { navigator.serviceWorker.removeEventListener('message', alMensaje); document.removeEventListener('visibilitychange', alVolver); };
  }, [router]);

  // «Probar notificaciones» desde cualquier parte (la campana, el perfil…).
  useEffect(() => {
    const probar = async () => {
      try {
        if (Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { setEstado(p === 'denied' ? 'bloqueado' : 'pedir'); setOculto(false); return; } }
        await suscribir(); setEstado('activo');
        const r = await fetch('/api/push/prueba', { method: 'POST' }).then(x => x.json());
        if (r.sent > 0) toast.success(`Notificación de prueba enviada a ${r.sent} aparato(s). Debe llegarte en segundos.`);
        else toast.error('No se pudo enviar la prueba a este aparato. Revisa que las notificaciones del navegador estén permitidas.');
      } catch { toast.error('No se pudo probar las notificaciones en este navegador.'); }
    };
    const h = () => { void probar(); };
    window.addEventListener('lycos:probar-push', h);
    return () => window.removeEventListener('lycos:probar-push', h);
  }, [suscribir]);

  const activar = async () => {
    setTrabajando(true);
    try {
      const p = await Notification.requestPermission();
      if (p === 'granted') {
        const ok = await suscribir();
        setEstado(ok ? 'activo' : 'pedir');
        if (ok) { toast.success('Notificaciones activadas en este aparato.'); window.dispatchEvent(new Event('lycos:probar-push')); }
      } else setEstado(p === 'denied' ? 'bloqueado' : 'pedir');
    } finally { setTrabajando(false); }
  };
  const ocultar = () => { setOculto(true); try { sessionStorage.setItem(OCULTO, '1'); } catch { /* noop */ } };

  if (!user || oculto || estado === 'cargando' || estado === 'activo' || estado === 'sin_soporte') return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[150] mx-auto flex max-w-[560px] items-start gap-3 rounded-2xl border border-orange-300 bg-white p-3.5 shadow-2xl dark:border-orange-500/40 dark:bg-zinc-900 sm:bottom-5" role="status">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-500/15">
        {estado === 'bloqueado' ? <BellOff className="h-5 w-5" /> : estado === 'ios_sin_instalar' ? <Smartphone className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1 text-[13px] text-zinc-800 dark:text-zinc-100">
        {estado === 'pedir' && (<>
          <p className="font-bold">Activa las notificaciones</p>
          <p className="text-[12px] text-zinc-500">Para enterarte al instante de los mensajes de WhatsApp, clientes que necesitan atención y pagos.</p>
          <button type="button" onClick={activar} disabled={trabajando} className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-orange-500 px-3.5 text-[13px] font-bold text-white hover:bg-orange-600 disabled:opacity-60">
            {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Activar en este aparato
          </button>
        </>)}
        {estado === 'bloqueado' && (<>
          <p className="font-bold">Las notificaciones están bloqueadas en este navegador</p>
          <p className="text-[12px] text-zinc-500">Toca el candado (🔒) junto a la dirección → Notificaciones → Permitir, y recarga la página. En el teléfono: Ajustes de Chrome → Notificaciones del sitio.</p>
        </>)}
        {estado === 'ios_sin_instalar' && (<>
          <p className="font-bold">En iPhone hay que instalar la app</p>
          <p className="text-[12px] text-zinc-500">Toca Compartir (⬆️) → «Agregar a pantalla de inicio», abre Lycos CRM desde el ícono y activa las notificaciones.</p>
        </>)}
      </div>
      <button type="button" onClick={ocultar} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Ocultar por ahora"><X className="h-4 w-4" /></button>
    </div>
  );
}
