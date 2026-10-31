import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Cuándo el bot llama a una persona, y qué le dice.
 *
 * Cada escenario es distinto (color, urgencia, qué hacer) para que el asesor sepa de un vistazo
 * si es un cliente molesto, una emergencia en la vía, una venta que se puede cerrar ya o un pago
 * que hay que confirmar. La alerta trae el MOTIVO REAL (lo que el cliente dijo o pidió), no un
 * «nuevo mensaje».
 */

export type TipoAtencion = 'reclamo' | 'emergencia' | 'pide_asesor' | 'negociacion' | 'venta_lista'
  | 'pago_reportado' | 'tramite' | 'consulta_tecnica' | 'bot_no_pudo';

export const TIPOS_ATENCION: Record<TipoAtencion, { titulo: string; prioridad: 'alta' | 'media' | 'baja'; sugerencia: string }> = {
  reclamo: { titulo: 'Cliente molesto o con un reclamo', prioridad: 'alta', sugerencia: 'Escríbele tú ya: discúlpate, entiende qué pasó y ofrécele una solución o una revisión sin costo. Revisa su último trabajo en la ficha del vehículo.' },
  emergencia: { titulo: 'Emergencia: carro varado o accidentado', prioridad: 'alta', sugerencia: 'Llámalo: pregunta dónde está y si necesita grúa. Dile cuándo lo pueden atender.' },
  pide_asesor: { titulo: 'Quiere hablar con una persona', prioridad: 'alta', sugerencia: 'Respóndele tú en la conversación. El bot ya le pasó el contacto del asesor.' },
  negociacion: { titulo: 'Pide un precio especial o una promoción', prioridad: 'media', sugerencia: 'Ofrécele la promo en divisas o el mejor precio posible; el bot no puede negociar.' },
  venta_lista: { titulo: 'Listo para comprar o venir al taller', prioridad: 'media', sugerencia: 'Confírmale el día y la hora, y que lo esperan. Es una venta casi cerrada.' },
  pago_reportado: { titulo: 'Reportó un pago o envió un comprobante', prioridad: 'media', sugerencia: 'Verifica el pago en el banco y regístralo (o concílialo). Confírmale al cliente que llegó.' },
  tramite: { titulo: 'Pide un trámite (RCV o certificado médico)', prioridad: 'media', sugerencia: 'Atiende el trámite: pide los datos que faltan y dale el precio y el tiempo de entrega.' },
  consulta_tecnica: { titulo: 'Consulta técnica que necesita un mecánico', prioridad: 'media', sugerencia: 'Que un mecánico revise lo que describe (o el video/foto) y le responda, o invítalo a una revisión gratuita.' },
  bot_no_pudo: { titulo: 'El bot no pudo responder', prioridad: 'alta', sugerencia: 'Respóndele tú: el cliente quedó sin respuesta.' },
};

export const esTipoAtencion = (t: string): t is TipoAtencion => t in TIPOS_ATENCION;

/** Emergencias que no pueden depender de que la IA las note. */
export function detectarEmergencia(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\b(grua|accidente|choque|chocaron|me choc|varad[oa]|me quede (botado|accidentado|en la via)|se me apago en|no (me )?(prende|arranca|enciende)|humo (blanco|negro)? ?(sale|saliendo)|se recalento|recalentando|se incendi)/.test(t);
}

/**
 * Abre una alerta, o actualiza la que ya está abierta para ese cliente y escenario.
 * Devuelve si es nueva (para avisar por push solo una vez).
 */
export async function abrirAlertaAtencion(db: SupabaseClient, a: {
  telefono: string; tipo: TipoAtencion; motivo: string; sugerencia?: string | null;
  cliente?: string | null; ultimoMensaje?: string | null; sedeId?: string | null;
}): Promise<{ nueva: boolean; id: string | null }> {
  const cfg = TIPOS_ATENCION[a.tipo];
  const fila = {
    telefono: a.telefono, tipo: a.tipo, prioridad: cfg.prioridad,
    motivo: a.motivo.slice(0, 600), sugerencia: (a.sugerencia || cfg.sugerencia).slice(0, 600),
    cliente_nombre: a.cliente || null, ultimo_mensaje: (a.ultimoMensaje || '').slice(0, 600) || null, sede_id: a.sedeId || null,
  };
  const { data, error } = await db.from('alertas_atencion').insert(fila).select('id').single();
  if (!error) return { nueva: true, id: data?.id || null };
  if (error.code !== '23505') { console.error('alerta de atención:', error.message); return { nueva: false, id: null }; }
  // Ya había una abierta: se pone al día y vuelve a salir aunque estuviera pospuesta.
  const { data: abierta } = await db.from('alertas_atencion').select('id, veces').eq('telefono', a.telefono).eq('tipo', a.tipo).eq('estado', 'abierta').maybeSingle();
  if (!abierta) return { nueva: false, id: null };
  await db.from('alertas_atencion').update({
    motivo: fila.motivo, ultimo_mensaje: fila.ultimo_mensaje, cliente_nombre: fila.cliente_nombre || undefined,
    veces: (abierta.veces || 1) + 1, pospuesta_hasta: null, updated_at: new Date().toISOString(),
  }).eq('id', abierta.id);
  return { nueva: false, id: abierta.id };
}
