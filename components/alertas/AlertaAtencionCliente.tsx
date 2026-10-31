'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon, BadgeDollarSign, Bot, CarFront, CheckCircle2, Clock, FileText, HandCoins, Headphones,
  Loader2, MessageCircle, Siren, UserRoundCheck, Wrench, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { conEmojis } from '@/components/whatsapp/EmojiWhatsApp';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { getPermisos, hasPermiso, resolveRol } from '@/types';

/**
 * Cuando un cliente de WhatsApp necesita a una persona, salta esto a pantalla completa
 * (como la alerta de pago a proveedores) para el que atiende WhatsApp.
 *
 * Cada escenario se ve distinto —un reclamo no es una venta lista ni un pago por confirmar—
 * y trae el motivo real, los últimos mensajes y qué hacer. Salidas: abrir la conversación,
 * tomar el control (el bot se calla), marcarla atendida con una nota o recordarla más tarde.
 * Nada se pierde: «recordar» la vuelve a sacar sola y atenderla deja quién y qué se hizo.
 */

interface Mensaje { body: string; tipo: string; created_at: string; es_ia: boolean | null; media_type: string | null }
interface Alerta {
  id: string; telefono: string; cliente_nombre: string | null; tipo: string; prioridad: string; motivo: string;
  sugerencia: string | null; ultimo_mensaje: string | null; veces: number; created_at: string; modo?: string; mensajes?: Mensaje[];
}

const ESTILO: Record<string, { color: string; fondo: string; icono: React.ReactNode; etiqueta: string }> = {
  reclamo: { color: '#dc2626', fondo: 'from-red-600 to-rose-700', icono: <AlertOctagon className="h-7 w-7" />, etiqueta: 'Reclamo' },
  emergencia: { color: '#b91c1c', fondo: 'from-red-700 to-orange-600', icono: <Siren className="h-7 w-7" />, etiqueta: 'Emergencia' },
  pide_asesor: { color: '#ea580c', fondo: 'from-orange-500 to-amber-600', icono: <Headphones className="h-7 w-7" />, etiqueta: 'Quiere un asesor' },
  negociacion: { color: '#d97706', fondo: 'from-amber-500 to-yellow-600', icono: <HandCoins className="h-7 w-7" />, etiqueta: 'Negociación' },
  venta_lista: { color: '#16a34a', fondo: 'from-emerald-600 to-green-700', icono: <CarFront className="h-7 w-7" />, etiqueta: 'Venta lista' },
  pago_reportado: { color: '#2563eb', fondo: 'from-blue-600 to-indigo-700', icono: <BadgeDollarSign className="h-7 w-7" />, etiqueta: 'Pago reportado' },
  tramite: { color: '#7c3aed', fondo: 'from-violet-600 to-purple-700', icono: <FileText className="h-7 w-7" />, etiqueta: 'Trámite' },
  consulta_tecnica: { color: '#0891b2', fondo: 'from-cyan-600 to-sky-700', icono: <Wrench className="h-7 w-7" />, etiqueta: 'Consulta técnica' },
  bot_no_pudo: { color: '#475569', fondo: 'from-slate-600 to-slate-800', icono: <Bot className="h-7 w-7" />, etiqueta: 'Sin respuesta del bot' },
};
const TITULO: Record<string, string> = {
  reclamo: 'Cliente molesto o con un reclamo', emergencia: 'Emergencia: carro varado o accidentado', pide_asesor: 'Quiere hablar con una persona',
  negociacion: 'Pide un precio especial o una promoción', venta_lista: 'Listo para comprar o venir al taller', pago_reportado: 'Reportó un pago o envió un comprobante',
  tramite: 'Pide un trámite (RCV o certificado)', consulta_tecnica: 'Consulta técnica que necesita un mecánico', bot_no_pudo: 'El bot no pudo responder',
};

const hace = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });

function pitido() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); setTimeout(() => { o.frequency.value = 660; }, 160); setTimeout(() => { o.stop(); void ctx.close(); }, 340);
  } catch { /* el navegador no deja sonar sin un toque previo */ }
}

export default function AlertaAtencionCliente() {
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede } = useSedeStore();
  const sedeId = currentSede?.id || null;
  const permisos = getPermisos(user?.rol || 'empleado', user?.permisos, roleDefaults);
  const puedeVer = resolveRol(user?.rol) === 'admin' || hasPermiso(permisos.whatsapp, 'leer');
  const puedeAtender = resolveRol(user?.rol) === 'admin' || hasPermiso(permisos.whatsapp, 'editar');

  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [error, setError] = useState('');
  const vistas = useRef<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/alertas/atencion${sedeId ? `?sede=${sedeId}` : ''}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const lista = (d.alertas || []) as Alerta[];
      if (lista.some(a => !vistas.current.has(`${a.id}:${a.veces}`))) pitido();
      lista.forEach(a => vistas.current.add(`${a.id}:${a.veces}`));
      setAlertas(lista);
    } catch { /* sin red: se reintenta en el próximo ciclo */ }
  }, [sedeId]);

  useEffect(() => {
    if (!user || !puedeVer) return;
    void cargar();
    const t = setInterval(cargar, 20000);
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    // Si llega la push de una alerta, se muestra al instante (sin esperar la próxima consulta).
    const alPush = (ev: MessageEvent) => { if (ev.data?.lycos === 'push' && /atencion|human|tramite/.test(String(ev.data.tipo || ''))) void cargar(); };
    navigator.serviceWorker?.addEventListener('message', alPush);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); navigator.serviceWorker?.removeEventListener('message', alPush); };
  }, [user, puedeVer, cargar]);

  const a = alertas[0];
  if (!a || !puedeVer) return null;
  const e = ESTILO[a.tipo] || ESTILO.pide_asesor;
  const nombre = a.cliente_nombre || a.telefono;

  const accion = async (accion: string, extra: Record<string, unknown> = {}) => {
    setOcupado(accion); setError('');
    try {
      const r = await fetch('/api/alertas/atencion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, accion, ...extra }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo.');
      if (accion !== 'tomar') { setAlertas(l => l.filter(x => x.id !== a.id)); setNota(''); }
      else setAlertas(l => l.map(x => (x.id === a.id ? { ...x, modo: 'humano' } : x)));
    } catch (x) { setError((x as Error).message); } finally { setOcupado(''); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="alerta-atencion-titulo">
      <div className="flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900">
        <div className={cn('relative bg-gradient-to-r px-5 py-4 text-white sm:px-6', e.fondo)}>
          <div className="flex items-start gap-3">
            <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20', a.prioridad === 'alta' && 'animate-pulse')}>{e.icono}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">{e.etiqueta}{a.prioridad === 'alta' ? ' · urgente' : ''}{alertas.length > 1 ? ` · ${alertas.length - 1} más en espera` : ''}</p>
              <h2 id="alerta-atencion-titulo" className="text-[20px] font-black leading-tight sm:text-[24px]">{TITULO[a.tipo] || 'Atender cliente'}</h2>
              <p className="mt-0.5 truncate text-[13px] text-white/90">{nombre}{a.cliente_nombre ? ` · ${a.telefono}` : ''} · {hace(a.created_at)}{a.veces > 1 ? ` · insistió ${a.veces} veces` : ''}</p>
            </div>
            <button type="button" onClick={() => accion('posponer', { minutos: 15 })} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15" aria-label="Recordar en 15 minutos"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-[#16181d] dark:text-zinc-100 sm:px-6">
          <div className="rounded-2xl border-l-4 bg-zinc-50 p-3 dark:bg-zinc-800/60" style={{ borderColor: e.color }}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Qué pasa</p>
            <p className="mt-0.5 text-[15px] font-semibold leading-snug">{conEmojis(a.motivo)}</p>
          </div>
          {a.sugerencia && (
            <div className="flex gap-2 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: e.color }} />
              <p className="text-[13px] leading-snug"><b>Qué hacer: </b>{a.sugerencia}</p>
            </div>
          )}
          {!!a.mensajes?.length && (
            <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500"><MessageCircle className="h-3.5 w-3.5" /> Últimos mensajes{a.modo === 'humano' ? ' · la conversación está en manos de una persona' : ''}</p>
              <ul className="space-y-1.5">
                {a.mensajes.map((m, i) => {
                  const entra = m.tipo === 'entrante';
                  return (
                    <li key={i} className={cn('flex', entra ? 'justify-start' : 'justify-end')}>
                      <span className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[12.5px] leading-snug [overflow-wrap:anywhere]',
                        entra ? 'rounded-bl-sm bg-zinc-100 dark:bg-zinc-800' : 'rounded-br-sm bg-emerald-100 dark:bg-emerald-900/40')}>
                        {conEmojis(m.body.length > 400 ? `${m.body.slice(0, 400)}…` : m.body)}
                        <span className="ml-2 text-[10px] text-zinc-500">{entra ? '' : m.es_ia ? 'bot · ' : 'asesor · '}{hora(m.created_at)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {puedeAtender && (
            <textarea value={nota} onChange={x => setNota(x.target.value)} rows={2} placeholder="Qué se hizo (opcional): «le escribí y viene mañana», «pago verificado en Banesco»…"
              className="w-full resize-none rounded-xl border border-zinc-300 bg-white p-2.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900" />
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700 sm:px-6">
          <Link href={`/dashboard/whatsapp?tel=${a.telefono}`} onClick={() => { window.dispatchEvent(new CustomEvent('lycos:abrir-conversacion', { detail: a.telefono })); void accion('posponer', { minutos: 10 }); }}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-bold text-white sm:flex-none" style={{ background: e.color }}>
            <MessageCircle className="h-4 w-4" /> Abrir la conversación
          </Link>
          {puedeAtender && a.modo !== 'humano' && (
            <button type="button" onClick={() => accion('tomar')} disabled={!!ocupado} className="flex h-11 items-center gap-2 rounded-xl border border-zinc-300 px-3 text-[13px] font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {ocupado === 'tomar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />} Tomar el control
            </button>
          )}
          {puedeAtender && (
            <button type="button" onClick={() => accion('atendida', { nota })} disabled={!!ocupado} className="flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-3 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
              {ocupado === 'atendida' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Ya lo atendí
            </button>
          )}
          <button type="button" onClick={() => accion('posponer', { minutos: 15 })} disabled={!!ocupado} className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800">
            <Clock className="h-4 w-4" /> En 15 min
          </button>
          {puedeAtender && (
            <button type="button" onClick={() => accion('descartar', { nota })} disabled={!!ocupado} className="ml-auto text-[12px] text-zinc-500 underline-offset-2 hover:underline">No requiere atención</button>
          )}
        </div>
      </div>
    </div>
  );
}
