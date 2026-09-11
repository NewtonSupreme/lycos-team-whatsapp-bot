import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import {
  claveRenglon, ponerRenglonEnOrden, quitarRenglonDeOrden,
} from '@/lib/ficha/sincronizar';

export const dynamic = 'force-dynamic';

/**
 * Los renglones de una orden, editables desde la ficha del vehículo.
 *
 * Hacía falta porque en la ficha no había forma de tocar lo que la orden ya
 * traía: los renglones del registro original quedaban fijos —un trabajo
 * anotado por error se cobraba igual— y los «renglones pendientes» que la ficha
 * ofrece añadir no se podían descartar, solo aceptar.
 *
 * Aquí se puede quitar y corregir. El precio de la orden se recalcula solo:
 * `costo_estimado` sale siempre de la suma de sus renglones, que es lo único
 * que mantiene a la ficha y a la orden diciendo lo mismo.
 */

/** Quita un renglón de la orden. Body: { servicio, descripcion } */
export async function DELETE(req: NextRequest) {
  const auth = await authorize('servicios', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { servicio?: string; descripcion?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const servicio = String(body.servicio || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  if (!servicio || !descripcion) {
    return NextResponse.json({ error: 'Indica la orden y el renglón.' }, { status: 400 });
  }

  const r = await quitarRenglonDeOrden(auth.db, servicio, descripcion);
  if (!r.ok) return NextResponse.json({ error: r.aviso || 'No se pudo quitar.' }, { status: 400 });

  // Si ese renglón tenía partida en la ficha, se retira también: dejarla
  // dejaría la ficha cobrando algo que la orden ya no cobra.
  const { data: partidas } = await auth.db.from('vehiculo_partidas')
    .select('id, descripcion, clave_item').eq('servicio_id', servicio).limit(200);

  const clave = claveRenglon(descripcion);
  const sobra = ((partidas as { id: string; descripcion: string; clave_item: string | null }[]) || [])
    .filter(x => claveRenglon(x.clave_item || x.descripcion) === clave);

  for (const x of sobra) {
    // El egreso se va en cascada con la partida.
    await auth.db.from('vehiculo_partidas').delete().eq('id', x.id);
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'servicios', accion: 'Renglón quitado de la orden',
    detalles: `«${descripcion}» · la orden queda en $${r.total.toFixed(2)}`,
    referencia_id: servicio, referencia_tabla: 'servicios',
  });

  return NextResponse.json({
    ok: true,
    total: r.total,
    partidasRetiradas: sobra.length,
  });
}

/**
 * Corrige un renglón de la orden sin pasar por la ficha.
 * Body: { servicio, descripcion, precio_unitario?, cantidad?, nuevaDescripcion? }
 */
export async function PATCH(req: NextRequest) {
  const auth = await authorize('servicios', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    servicio?: string; descripcion?: string; nuevaDescripcion?: string;
    precio_unitario?: number; cantidad?: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const servicio = String(body.servicio || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  if (!servicio || !descripcion) {
    return NextResponse.json({ error: 'Indica la orden y el renglón.' }, { status: 400 });
  }

  const { data: orden } = await auth.db.from('servicios')
    .select('items').eq('id', servicio).maybeSingle();
  const items = Array.isArray(orden?.items) ? orden!.items : [];
  const actual = items.find((x: { descripcion?: string }) =>
    claveRenglon(x.descripcion) === claveRenglon(descripcion));

  if (!actual) return NextResponse.json({ error: 'Ese renglón no está en la orden.' }, { status: 404 });

  const cantidad = Math.max(1, Number(body.cantidad ?? actual.cantidad) || 1);
  const precio = Math.max(0, Number(body.precio_unitario ?? actual.precio_unitario) || 0);

  const r = await ponerRenglonEnOrden(auth.db, servicio, {
    ...actual,
    descripcion: String(body.nuevaDescripcion || actual.descripcion).trim(),
    cantidad,
    precio_unitario: precio,
    total: Math.round(cantidad * precio * 100) / 100,
  }, descripcion);

  if (!r.ok) return NextResponse.json({ error: r.aviso || 'No se pudo corregir.' }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'servicios', accion: 'Renglón corregido',
    detalles: `«${descripcion}» · la orden queda en $${r.total.toFixed(2)}`,
    referencia_id: servicio, referencia_tabla: 'servicios',
  });

  return NextResponse.json({ ok: true, total: r.total });
}
