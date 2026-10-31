import webpush from 'web-push';
import { supabaseAdmin } from './supabase-admin';
import { getPermisos, hasPermiso, resolveRol, type Permisos } from '@/types';

/*
 * Notificaciones push: que lleguen YA, a quien deben, y que quede constancia.
 *
 *   · urgencia alta: Android/Windows las entregan al momento aunque el aparato esté en reposo
 *     (sin «urgency» el sistema puede juntarlas y entregarlas minutos después);
 *   · TTL: si el aparato está apagado o sin datos, el aviso le llega al conectarse (hasta 24 h
 *     para lo urgente) en vez de perderse;
 *   · a quién: cada aparato está atado a su usuario; un aviso de WhatsApp le llega a quien tiene
 *     el módulo de WhatsApp (y de su sede), no a todos. Los aparatos viejos sin usuario reciben
 *     todo hasta que la app los vuelva a registrar con su usuario;
 *   · constancia: push_envios guarda cada envío (a cuántos aparatos, cuántos fallaron) y cada
 *     aparato guarda su último envío bueno y sus fallos. Los que el servicio da por muertos
 *     (404/410) se borran solos.
 */

let iniciado = false;
export function initWebPush() {
  if (iniciado) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@lycosteam.com';
  if (publicKey && privateKey) { webpush.setVapidDetails(subject, publicKey, privateKey); iniciado = true; }
  return iniciado;
}

export interface PushPayload {
  title: string;
  body: string;
  /** whatsapp-message, atencion-cliente, pago-proveedor… decide sonido, vibración e insistencia. */
  type?: string;
  url?: string;
  /** Avisos con la misma etiqueta se agrupan en uno (pero vuelven a sonar). */
  tag?: string;
  requireInteraction?: boolean;
  /** Solo a quien puede ver este módulo (whatsapp, reportes, ventas…). */
  modulo?: keyof Permisos;
  /** Solo a usuarios de esta sede (los admin multisede lo reciben siempre). */
  sede?: string | null;
  /** Solo a estos usuarios (ids). */
  usuarios?: string[];
  /** Prioridad: alta por defecto. */
  urgencia?: 'very-low' | 'low' | 'normal' | 'high';
  /** Segundos que el servicio guarda el aviso si el aparato no está conectado. */
  ttl?: number;
}

const URGENTES = /atencion|human|alerta|pago|emergencia|tramite/;

let cacheRoles: { valor: Record<string, Permisos> | null; en: number } | null = null;
async function rolesPorDefecto(): Promise<Record<string, Permisos> | null> {
  if (cacheRoles && Date.now() - cacheRoles.en < 5 * 60000) return cacheRoles.valor;
  const { data } = await supabaseAdmin.from('roles').select('nombre, permisos');
  const out: Record<string, Permisos> = {};
  for (const r of data || []) if (r?.nombre && r?.permisos) out[r.nombre] = typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos;
  cacheRoles = { valor: Object.keys(out).length ? out : null, en: Date.now() };
  return cacheRoles.valor;
}

interface Sub { endpoint: string; p256dh: string; auth: string; usuario_id: string | null; fallos: number | null }

/** A qué aparatos va este aviso. */
export async function destinatarios(p: PushPayload): Promise<Sub[]> {
  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('endpoint, p256dh, auth, usuario_id, fallos');
  const lista = (subs || []) as Sub[];
  if (!p.modulo && !p.sede && !p.usuarios?.length) return lista;
  const ids = [...new Set(lista.map(s => s.usuario_id).filter(Boolean) as string[])];
  const { data: us } = ids.length ? await supabaseAdmin.from('usuarios').select('id, rol, permisos, sede_id, activo').in('id', ids) : { data: [] };
  const defaults = await rolesPorDefecto();
  const porId = new Map((us || []).map(u => [String(u.id), u]));
  return lista.filter(s => {
    if (!s.usuario_id) return !p.usuarios?.length; // aparato viejo sin usuario: recibe hasta que se vuelva a registrar
    const u = porId.get(s.usuario_id);
    if (!u || u.activo === false) return false;
    if (p.usuarios?.length && !p.usuarios.includes(String(u.id))) return false;
    const admin = resolveRol(u.rol) === 'admin';
    if (p.modulo && !admin) {
      const permisos = getPermisos(u.rol, (typeof u.permisos === 'string' ? JSON.parse(u.permisos) : u.permisos) as never, defaults);
      if (!hasPermiso(permisos[p.modulo], 'leer')) return false;
    }
    if (p.sede && !admin && u.sede_id && u.sede_id !== p.sede) return false;
    return true;
  });
}

export async function enviarPush(payload: PushPayload): Promise<{ success: boolean; sent: number; failed: number; error?: string }> {
  if (!initWebPush()) {
    console.warn('⚠️ Push sin configurar (faltan las claves VAPID)');
    return { success: false, sent: 0, failed: 0, error: 'Push notifications not configured' };
  }
  const t0 = Date.now();
  const tipo = payload.type || 'general';
  const urgente = URGENTES.test(tipo);
  const subs = await destinatarios(payload);
  if (!subs.length) return { success: true, sent: 0, failed: 0 };

  const cuerpo = JSON.stringify({
    title: payload.title, body: payload.body, type: tipo, url: payload.url || '/dashboard',
    tag: payload.tag || `${tipo}-${t0}`, requireInteraction: payload.requireInteraction ?? urgente, ts: t0,
  });
  const opciones = {
    TTL: payload.ttl ?? (urgente ? 86400 : 4 * 3600),
    urgency: payload.urgencia ?? (tipo === 'general' ? 'normal' : 'high'),
    timeout: 8000,
  } as const;

  const ok: string[] = []; const muertos: string[] = []; const fallidos: Array<{ endpoint: string; error: string; fallos: number }> = [];
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, opciones);
      ok.push(s.endpoint);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      if (e?.statusCode === 404 || e?.statusCode === 410) muertos.push(s.endpoint);
      else fallidos.push({ endpoint: s.endpoint, error: `${e?.statusCode || ''} ${String(e?.body || e?.message || '').slice(0, 160)}`.trim(), fallos: (s.fallos || 0) + 1 });
    }
  }));

  // Constancia: quién recibió, quién falló, y los aparatos muertos fuera.
  const ahora = new Date().toISOString();
  const tareas: PromiseLike<unknown>[] = [];
  if (ok.length) tareas.push(supabaseAdmin.from('push_subscriptions').update({ ultimo_ok: ahora, fallos: 0, ultimo_error: null }).in('endpoint', ok));
  if (muertos.length) tareas.push(supabaseAdmin.from('push_subscriptions').delete().in('endpoint', muertos));
  for (const f of fallidos) tareas.push(supabaseAdmin.from('push_subscriptions').update({ fallos: f.fallos, ultimo_error: f.error, updated_at: ahora }).eq('endpoint', f.endpoint));
  tareas.push(supabaseAdmin.from('push_envios').insert({
    titulo: payload.title.slice(0, 200), tipo, modulo: payload.modulo || null, url: payload.url || null,
    aparatos: subs.length, enviados: ok.length, fallidos: fallidos.length, borrados: muertos.length, ms: Date.now() - t0,
  }));
  await Promise.allSettled(tareas);
  return { success: true, sent: ok.length, failed: fallidos.length };
}

/** Compatibilidad: el nombre de siempre. */
export const sendGlobalPushNotification = enviarPush;
