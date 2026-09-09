import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { normalizarPartida } from '../route';

export const dynamic = 'force-dynamic';

/** Edita un renglón de la ficha. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('vehiculos', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  // Se normaliza sobre el registro completo: si solo llega `estado_pago`, hay
  // que conocer el costo real para saber si ese estado es siquiera posible.
  const { data: actual } = await auth.db.from('vehiculo_partidas').select('*').eq('id', id).maybeSingle();
  if (!actual) return NextResponse.json({ error: 'El renglón ya no existe.' }, { status: 404 });

  const cambios = normalizarPartida({ ...actual, ...body });
  cambios.updated_at = new Date().toISOString();

  const { data, error } = await auth.db.from('vehiculo_partidas').update(cambios).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Ficha · renglón editado',
    detalles: `${data.descripcion} · placa ${data.placa || '—'}`,
    referencia_id: id, referencia_tabla: 'vehiculo_partidas', sede_id: data.sede_id,
  });

  return NextResponse.json({ partida: data });
}

/** Borra un renglón. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('vehiculos', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.db.from('vehiculo_partidas').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Ficha · renglón borrado',
    detalles: `Renglón ${id}`, referencia_id: id, referencia_tabla: 'vehiculo_partidas',
  });

  return NextResponse.json({ ok: true });
}
