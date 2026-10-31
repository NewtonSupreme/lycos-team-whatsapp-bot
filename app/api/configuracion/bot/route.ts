import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { normalizarConfigBot, olvidarConfigBot, textoBienvenida, type ConfigBot } from '@/lib/bot/config';

export const dynamic = 'force-dynamic';

/*
 * Configuración del bot de WhatsApp.
 *   GET            → la configuración vigente (con los valores por defecto donde falte)
 *   PATCH {…}      → cambia solo lo enviado; queda en la bitácora quién cambió qué
 */

async function leer(db: NonNullable<Awaited<ReturnType<typeof authorize>>['db']>) {
  const { data } = await db.from('configuracion_sistema').select('id, valor, updated_at, updated_by').eq('clave', 'ia_bot').maybeSingle();
  return { fila: data, config: normalizarConfigBot(data?.valor) };
}

export async function GET() {
  const auth = await authorize('configuracion', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { fila, config } = await leer(auth.db);
  return NextResponse.json({
    config, actualizado: fila?.updated_at || null, por: fila?.updated_by || null,
    vistaBienvenida: textoBienvenida(config, 'Buenos días', 'María'),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

const ETIQUETA: Record<string, string> = {
  bot_whatsapp_global_activo: 'Bot encendido', responder_clientes: 'Contestar a clientes', modo_dios: 'Modo Dios (personal)',
  horario: 'Horario de atención', bienvenida: 'Mensaje de bienvenida', dar_precios: 'Dar precios', ofrecer_cashea: 'Ofrecer Cashea',
  flujo_ubicacion: 'Ubicación automática', flujo_redes: 'Redes sociales', tarjeta_asesor: 'Tarjeta del asesor',
  imagenes_silenciadores: 'Fotos de silenciadores', multimedia: 'Análisis de audio/fotos/videos/stickers', alertas: 'Alertas de atención', push_mensajes: 'Push por cada mensaje',
};

export async function PATCH(req: NextRequest) {
  const auth = await authorize('configuracion', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const cambios = await req.json().catch(() => ({})) as Partial<ConfigBot>;
  const { fila, config } = await leer(auth.db);
  const unido = normalizarConfigBot({
    ...config, ...cambios,
    horario: { ...config.horario, ...(cambios.horario || {}) },
    bienvenida: { ...config.bienvenida, ...(cambios.bienvenida || {}) },
    multimedia: { ...config.multimedia, ...(cambios.multimedia || {}) },
    alertas: { ...config.alertas, ...(cambios.alertas || {}), tipos: { ...config.alertas.tipos, ...(cambios.alertas?.tipos || {}) } },
  });
  if (unido.horario.activo && !unido.horario.dias.length) return NextResponse.json({ error: 'Elige al menos un día de atención.' }, { status: 400 });
  if (!unido.bienvenida.texto.trim()) return NextResponse.json({ error: 'El mensaje de bienvenida no puede quedar vacío.' }, { status: 400 });

  const usuario = auth.user?.nombre || 'Usuario';
  const ahora = new Date().toISOString();
  const { error } = fila?.id
    ? await auth.db.from('configuracion_sistema').update({ valor: unido, updated_at: ahora, updated_by: usuario }).eq('id', fila.id)
    : await auth.db.from('configuracion_sistema').insert({ clave: 'ia_bot', valor: unido, descripcion: 'Configuración del bot IA', updated_at: ahora, updated_by: usuario });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  olvidarConfigBot();

  const que = Object.keys(cambios).map(k => {
    const v = (cambios as Record<string, unknown>)[k];
    return `${ETIQUETA[k] || k}: ${typeof v === 'boolean' ? (v ? 'encendido' : 'apagado') : 'cambiado'}`;
  }).join(' · ');
  await logActivityServer(auth.db, { usuario, modulo: 'Configuración', accion: 'Cambió el bot de WhatsApp', detalles: que || 'sin cambios', referencia_tabla: 'configuracion_sistema', referencia_id: fila?.id || null, sede_id: null });
  return NextResponse.json({ config: unido, actualizado: ahora, por: usuario, vistaBienvenida: textoBienvenida(unido, 'Buenos días', 'María') });
}
