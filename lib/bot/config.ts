import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Lo que se puede encender y apagar del bot de WhatsApp desde Configuración › Bot de WhatsApp.
 *
 * Vive en configuracion_sistema (clave «ia_bot»), la misma fila de siempre. Cada opción está
 * conectada a un punto concreto del bot (ver el comentario de cada una): si aquí dice apagado,
 * el bot de verdad no lo hace. Se lee con una caché de 20 s, así que un cambio se nota en el
 * siguiente mensaje que llegue.
 */

export interface HorarioBot {
  activo: boolean;
  /** 0 = domingo … 6 = sábado */
  dias: number[];
  desde: string; // HH:MM, hora de Venezuela
  hasta: string;
  /** Fuera de horario: contestar igual, mandar el mensaje fijo (una vez) o no contestar. */
  fuera: 'responder' | 'mensaje' | 'silencio';
  mensaje: string;
}

export interface ConfigBot {
  /** Interruptor general: apagado, el bot no contesta a nadie (los mensajes se guardan y avisan). */
  bot_whatsapp_global_activo: boolean;
  /** El bot contesta a los clientes. Apagado: solo los registra y avisa al asesor. */
  responder_clientes: boolean;
  /** El personal puede usar el bot (Modo Dios: registrar servicios, consultar, etc.). */
  modo_dios: boolean;
  horario: HorarioBot;
  bienvenida: { activa: boolean; texto: string };
  /** Da precios (de la lista del inventario). Apagado: pasa al asesor cuando piden precio. */
  dar_precios: boolean;
  /** Ofrece y calcula Cashea. */
  ofrecer_cashea: boolean;
  /** Ubicación automática (mapa, video, beneficios y tarjeta de la sede). */
  flujo_ubicacion: boolean;
  /** Enlaces de Instagram/TikTok cuando piden redes. */
  flujo_redes: boolean;
  /** Tarjeta de contacto del asesor cuando hace falta una persona. */
  tarjeta_asesor: boolean;
  /** Fotos de los silenciadores que recomienda. */
  imagenes_silenciadores: boolean;
  multimedia: { audio: boolean; imagen: boolean; video: boolean; sticker: boolean };
  /** Alertas de atención a pantalla completa para los asesores, por tipo. */
  alertas: { activas: boolean; tipos: Record<string, boolean> };
  /** Push a quien atiende WhatsApp con cada mensaje de cliente. */
  push_mensajes: boolean;
}

export const SALUDO_DEFECTO = '{saludo}{nombre} 👋 Bienvenido a Lycos Team, especialistas en silenciadores, escapes y mecánica en San Antonio de los Altos. Soy el asistente virtual del taller: te ayudo con precios, citas, el estado de tu carro y lo que necesites, y si hace falta te paso con un asesor. ¿En qué te ayudo hoy? 🔧';

export const CONFIG_BOT_DEFECTO: ConfigBot = {
  bot_whatsapp_global_activo: true,
  responder_clientes: true,
  modo_dios: true,
  horario: {
    activo: false, dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '17:00', fuera: 'responder',
    mensaje: '¡Hola! 🌙 En este momento el taller está cerrado. Te atendemos de lunes a sábado de 8:00 a.m. a 5:00 p.m. Déjanos tu mensaje y apenas abramos te respondemos. 🔧',
  },
  bienvenida: { activa: true, texto: SALUDO_DEFECTO },
  dar_precios: true,
  ofrecer_cashea: true,
  flujo_ubicacion: true,
  flujo_redes: true,
  tarjeta_asesor: true,
  imagenes_silenciadores: true,
  multimedia: { audio: true, imagen: true, video: true, sticker: true },
  alertas: { activas: true, tipos: {} },
  push_mensajes: true,
};

/** Une lo guardado con los valores por defecto (lo que falte, por defecto). */
export function normalizarConfigBot(v: unknown): ConfigBot {
  const g = (v && typeof v === 'object' ? v : {}) as Partial<ConfigBot>;
  const d = CONFIG_BOT_DEFECTO;
  const b = (x: unknown, def: boolean) => (typeof x === 'boolean' ? x : def);
  const hora = (x: unknown, def: string) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : def);
  return {
    bot_whatsapp_global_activo: b(g.bot_whatsapp_global_activo, d.bot_whatsapp_global_activo),
    responder_clientes: b(g.responder_clientes, d.responder_clientes),
    modo_dios: b(g.modo_dios, d.modo_dios),
    horario: {
      activo: b(g.horario?.activo, d.horario.activo),
      dias: Array.isArray(g.horario?.dias) ? g.horario!.dias.filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : d.horario.dias,
      desde: hora(g.horario?.desde, d.horario.desde), hasta: hora(g.horario?.hasta, d.horario.hasta),
      fuera: ['responder', 'mensaje', 'silencio'].includes(String(g.horario?.fuera)) ? g.horario!.fuera : d.horario.fuera,
      mensaje: String(g.horario?.mensaje || d.horario.mensaje).slice(0, 700),
    },
    bienvenida: { activa: b(g.bienvenida?.activa, d.bienvenida.activa), texto: String(g.bienvenida?.texto || d.bienvenida.texto).slice(0, 700) },
    dar_precios: b(g.dar_precios, d.dar_precios),
    ofrecer_cashea: b(g.ofrecer_cashea, d.ofrecer_cashea),
    flujo_ubicacion: b(g.flujo_ubicacion, d.flujo_ubicacion),
    flujo_redes: b(g.flujo_redes, d.flujo_redes),
    tarjeta_asesor: b(g.tarjeta_asesor, d.tarjeta_asesor),
    imagenes_silenciadores: b(g.imagenes_silenciadores, d.imagenes_silenciadores),
    multimedia: {
      audio: b(g.multimedia?.audio, true), imagen: b(g.multimedia?.imagen, true),
      video: b(g.multimedia?.video, true), sticker: b(g.multimedia?.sticker, true),
    },
    alertas: { activas: b(g.alertas?.activas, true), tipos: (g.alertas?.tipos && typeof g.alertas.tipos === 'object') ? g.alertas.tipos : {} },
    push_mensajes: b(g.push_mensajes, d.push_mensajes),
  };
}

let cache: { valor: ConfigBot; en: number } | null = null;

export async function leerConfigBot(db: SupabaseClient): Promise<ConfigBot> {
  if (cache && Date.now() - cache.en < 20000) return cache.valor;
  try {
    const { data } = await db.from('configuracion_sistema').select('valor').eq('clave', 'ia_bot').maybeSingle();
    cache = { valor: normalizarConfigBot(data?.valor), en: Date.now() };
  } catch {
    cache = { valor: cache?.valor || CONFIG_BOT_DEFECTO, en: Date.now() };
  }
  return cache.valor;
}

export function olvidarConfigBot() { cache = null; }

/** ¿Está el taller dentro del horario de atención ahora (hora de Venezuela)? */
export function dentroDeHorario(h: HorarioBot, ahora = new Date()): boolean {
  if (!h.activo) return true;
  const vz = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  if (!h.dias.includes(vz.getDay())) return false;
  const m = vz.getHours() * 60 + vz.getMinutes();
  const [a, b] = [h.desde, h.hasta].map(x => { const [hh, mm] = x.split(':').map(Number); return hh * 60 + mm; });
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

/** La bienvenida con el saludo de la hora y el nombre (si se sabe). */
export function textoBienvenida(c: ConfigBot, saludo: string, nombre?: string | null): string {
  return c.bienvenida.texto
    .replace(/\{saludo\}/g, saludo)
    .replace(/\{nombre\}/g, nombre ? `, ${nombre.split(' ')[0]}` : '')
    .replace(/\s+([,.!?])/g, '$1').trim();
}
