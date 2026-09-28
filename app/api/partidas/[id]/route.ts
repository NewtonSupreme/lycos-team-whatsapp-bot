import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { recalcularTrabajosDeServicio } from '@/lib/nomina/servicio-nomina';
import { normalizarPartida } from '../route';
import {
  claveRenglon, quitarRenglonDeOrden, sincronizarDesdePartida, type Partida,
} from '@/lib/ficha/sincronizar';

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

  // El renglón ya está guardado; ahora se pone al día lo que depende de él: el
  // precio de la orden y el gasto de la empresa. Si la descripción cambió, se
  // pasa la anterior para poder encontrar su renglón en la orden en vez de
  // añadir uno nuevo y dejar el viejo cobrándose.
  const claveAnterior = claveRenglon(actual.descripcion) !== claveRenglon(data.descripcion)
    ? (actual.clave_item || actual.descripcion)
    : (actual.clave_item || data.descripcion);

  const sinc = await sincronizarDesdePartida(auth.db, data as Partida, auth.user!.nombre, {
    claveAnterior,
  });

  // La mano de obra de la orden depende del costo de sus piezas: si cambió, las
  // comisiones pendientes se recalculan. Un fallo aquí nunca tumba el renglón.
  if (data?.servicio_id) {
    try { await recalcularTrabajosDeServicio(auth.db, data.servicio_id, auth.user!.nombre); }
    catch (e) { console.error('No se pudo recalcular la nómina de la orden:', e); }
  }

  // La clave queda guardada para poder reencontrar el renglón la próxima vez
  // aunque alguien corrija el texto.
  await auth.db.from('vehiculo_partidas')
    .update({ clave_item: claveRenglon(data.descripcion) }).eq('id', id);

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Ficha · renglón editado',
    detalles: `${data.descripcion} · placa ${data.placa || '—'}`,
    referencia_id: id, referencia_tabla: 'vehiculo_partidas', sede_id: data.sede_id,
  });

  return NextResponse.json({ partida: data, ...sinc });
}

/** Borra un renglón. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('vehiculos', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Se lee antes de borrar: hace falta saber a qué orden pertenecía para
  // quitarle el renglón y bajarle el precio.
  const { data: previa } = await auth.db.from('vehiculo_partidas')
    .select('id, servicio_id, descripcion, clave_item, placa').eq('id', id).maybeSingle();

  const { error } = await auth.db.from('vehiculo_partidas').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // El gasto asociado se va solo: `egresos.partida_id` borra en cascada. Lo que
  // hay que hacer a mano es quitar el renglón de la orden, porque si no el
  // cliente seguiría viendo ese cobro.
  const avisos: string[] = [];
  let totalOrden: number | null = null;
  const quitarDeOrden = _req.headers.get('x-quitar-de-orden') !== 'no';

  if (previa?.servicio_id && quitarDeOrden) {
    const r = await quitarRenglonDeOrden(
      auth.db, previa.servicio_id, previa.clave_item || previa.descripcion,
    );
    totalOrden = r.total;
    if (r.aviso) avisos.push(r.aviso);
  }

  if (previa?.servicio_id) {
    try { await recalcularTrabajosDeServicio(auth.db, previa.servicio_id, auth.user!.nombre); }
    catch (e) { console.error('No se pudo recalcular la nómina de la orden:', e); }
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Ficha · renglón borrado',
    detalles: `${previa?.descripcion || id} · placa ${previa?.placa || '—'}`,
    referencia_id: id, referencia_tabla: 'vehiculo_partidas',
  });

  return NextResponse.json({ ok: true, totalOrden, avisos });
}
