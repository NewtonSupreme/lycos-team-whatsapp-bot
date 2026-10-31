import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/*
 * Alertas de atención al cliente (las abre el bot de WhatsApp).
 *
 *   GET                                  → abiertas y no pospuestas, la más urgente primero,
 *                                          con los últimos mensajes de cada conversación
 *   POST { id, accion: 'atendida', nota } → la cierra (queda quién y qué se hizo)
 *   POST { id, accion: 'posponer', minutos }
 *   POST { id, accion: 'tomar' }          → la conversación pasa a una persona (el bot calla)
 *   POST { id, accion: 'descartar', nota }
 */

const PESO: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export async function GET(req: NextRequest) {
  const auth = await authorize('whatsapp', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sede = auth.effectiveSede(new URL(req.url).searchParams.get('sede'));
  const ahora = new Date().toISOString();
  let q = auth.db.from('alertas_atencion').select('*').eq('estado', 'abierta')
    .or(`pospuesta_hasta.is.null,pospuesta_hasta.lt.${ahora}`).order('created_at', { ascending: true }).limit(30);
  if (sede) q = q.or(`sede_id.is.null,sede_id.eq.${sede}`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ alertas: [], error: error.message });
  const alertas = (data || []).sort((a, b) => (PESO[a.prioridad] ?? 1) - (PESO[b.prioridad] ?? 1) || a.created_at.localeCompare(b.created_at));
  // Los últimos mensajes de cada conversación: el contexto real del problema.
  const conMensajes = await Promise.all(alertas.slice(0, 5).map(async a => {
    const { data: m } = await auth.db.from('mensajes_whatsapp').select('body, tipo, created_at, es_ia, media_type')
      .or(`from_number.eq.${a.telefono},to_number.eq.${a.telefono}`).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(8);
    const { data: c } = await auth.db.from('conversaciones').select('estado').eq('telefono', a.telefono).maybeSingle();
    return { ...a, modo: c?.estado || 'ia', mensajes: (m || []).reverse() };
  }));
  return NextResponse.json({ alertas: [...conMensajes, ...alertas.slice(5)], total: alertas.length }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await authorize('whatsapp', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({}));
  const usuario = auth.user?.nombre || 'Usuario';
  const { data: a } = await auth.db.from('alertas_atencion').select('*').eq('id', String(b.id || '')).maybeSingle();
  if (!a) return NextResponse.json({ error: 'Esa alerta ya no existe.' }, { status: 404 });
  const ahora = new Date().toISOString();

  if (b.accion === 'posponer') {
    const min = Math.min(240, Math.max(5, Number(b.minutos) || 15));
    await auth.db.from('alertas_atencion').update({ pospuesta_hasta: new Date(Date.now() + min * 60000).toISOString(), updated_at: ahora }).eq('id', a.id);
    return NextResponse.json({ ok: true });
  }
  if (b.accion === 'tomar') {
    await auth.db.from('conversaciones').update({ estado: 'humano' }).eq('telefono', a.telefono);
    await logActivityServer(auth.db, { usuario, modulo: 'WhatsApp', accion: 'Tomó el control de una conversación', detalles: `${a.cliente_nombre || a.telefono} · alerta: ${a.tipo}`, referencia_tabla: 'alertas_atencion', referencia_id: a.id, sede_id: a.sede_id });
    return NextResponse.json({ ok: true });
  }
  if (b.accion === 'atendida' || b.accion === 'descartar') {
    const nota = String(b.nota || '').trim().slice(0, 500) || null;
    await auth.db.from('alertas_atencion').update({
      estado: b.accion === 'atendida' ? 'atendida' : 'descartada', atendida_por: usuario, atendida_en: ahora, nota_cierre: nota, updated_at: ahora,
    }).eq('id', a.id);
    await logActivityServer(auth.db, { usuario, modulo: 'WhatsApp', accion: b.accion === 'atendida' ? 'Atendió una alerta de cliente' : 'Descartó una alerta de cliente', detalles: `${a.cliente_nombre || a.telefono} · ${a.tipo}${nota ? ` · ${nota}` : ''}`, referencia_tabla: 'alertas_atencion', referencia_id: a.id, sede_id: a.sede_id });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 });
}
