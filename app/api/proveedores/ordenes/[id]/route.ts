import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const n2 = (n: unknown) => Number((Number(n) || 0).toFixed(2));
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Cambia el estado de una orden de compra.
 *
 * Body: { estado?, estado_pago?, fecha_esperada?, notas? }
 *
 * Recibirla es lo que convierte el compromiso en gasto: hasta que la mercancía
 * no llega, lo pedido no ha costado nada todavía. Al marcarla `recibida` se crea
 * su egreso y la orden se queda con el `egreso_id`, para que la misma compra no
 * pueda contarse dos veces si alguien vuelve a pulsar.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('distribuidor', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    estado?: string; estado_pago?: string; monto_pagado?: number;
    fecha_esperada?: string | null; fecha_vencimiento?: string | null; notas?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const { data: orden } = await auth.db.from('ordenes_compra')
    .select('*').eq('id', id).maybeSingle();
  if (!orden) return NextResponse.json({ error: 'Esa orden ya no existe.' }, { status: 404 });

  const ESTADOS = ['borrador', 'pendiente', 'parcial', 'recibida', 'cancelada'];
  const PAGOS = ['pagado', 'por_pagar', 'parcial'];

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.estado && ESTADOS.includes(body.estado)) cambios.estado = body.estado;
  if (body.estado_pago && PAGOS.includes(body.estado_pago)) {
    cambios.estado_pago = body.estado_pago;
    cambios.monto_pagado = body.estado_pago === 'pagado'
      ? n2(orden.total)
      : body.estado_pago === 'parcial' ? n2(body.monto_pagado) : 0;
  }
  if (body.fecha_esperada !== undefined) cambios.fecha_esperada = body.fecha_esperada || null;
  if (body.fecha_vencimiento !== undefined) cambios.fecha_vencimiento = body.fecha_vencimiento || null;
  if (body.notas !== undefined) cambios.notas = (body.notas || '').trim() || null;

  const recibiendo = cambios.estado === 'recibida' && orden.estado !== 'recibida';
  if (recibiendo) cambios.fecha_recibida = hoyISO();

  // Una orden cancelada no puede dejar su gasto vivo: sería un costo por algo
  // que nunca llegó.
  const cancelando = cambios.estado === 'cancelada' && orden.egreso_id;
  if (cancelando) {
    await auth.db.from('egresos').delete().eq('id', orden.egreso_id);
    cambios.egreso_id = null;
  }

  const avisos: string[] = [];

  if (recibiendo && !orden.egreso_id) {
    const { data: items } = await auth.db.from('ordenes_compra_items')
      .select('id, descripcion, cantidad, costo_unitario, total').eq('orden_id', id);

    const filas = (items as {
      id: string; descripcion: string; cantidad: number;
      costo_unitario: number; total: number;
    }[]) || [];

    const desglose = filas.map(it => ({
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad) || 1,
      precio_unitario: n2(it.costo_unitario),
      total: n2(it.total),
    }));

    const { data: egreso, error } = await auth.db.from('egresos').insert({
      fecha: hoyISO(),
      categoria: 'repuestos',
      total_egresos: n2(orden.total),
      moneda: orden.moneda || 'USD',
      proveedor: orden.proveedor,
      proveedor_id: orden.proveedor_id,
      estado_pago: (cambios.estado_pago as string) || orden.estado_pago,
      monto_pagado: (cambios.monto_pagado as number) ?? n2(orden.monto_pagado),
      fecha_vencimiento: (cambios.fecha_vencimiento as string) ?? orden.fecha_vencimiento,
      enlace: orden.enlace,
      origen: 'orden_compra',
      orden_compra_id: id,
      notas: `Orden de compra ${orden.correlativo || id} · ${orden.proveedor}`,
      desglose,
      creado_por: auth.user!.nombre,
      sede_id: orden.sede_id,
    }).select('id').single();

    if (error) {
      // El gasto es lo importante de recibir una orden: sin él la compra no
      // aparece en ningún reporte. Se dice en vez de dejarlo pasar en silencio.
      avisos.push(`La orden se marcó recibida pero no se pudo registrar el gasto: ${error.message}`);
    } else {
      cambios.egreso_id = egreso.id;
      // Recibida entera: cada renglón queda con todo lo pedido como llegado.
      // Una entrega a medias se marca como `parcial`, que no pasa por aquí.
      for (const it of filas) {
        await auth.db.from('ordenes_compra_items')
          .update({ recibido: Number(it.cantidad) || 0 }).eq('id', it.id);
      }
    }
  }

  const { data, error } = await auth.db.from('ordenes_compra')
    .update(cambios).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Orden de compra actualizada',
    detalles: `${data.correlativo || id} · ${data.proveedor} · ${data.estado}`
      + (recibiendo ? ` · gasto de $${n2(data.total).toFixed(2)} registrado` : ''),
    referencia_id: id, referencia_tabla: 'ordenes_compra', sede_id: data.sede_id,
  });

  return NextResponse.json({ orden: data, avisos });
}

/** Borra una orden y su desglose. El gasto, si lo generó, se va con ella. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('distribuidor', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: orden } = await auth.db.from('ordenes_compra')
    .select('id, correlativo, proveedor, egreso_id').eq('id', id).maybeSingle();
  if (!orden) return NextResponse.json({ error: 'Esa orden ya no existe.' }, { status: 404 });

  // Primero el gasto: si se borrara la orden antes, el egreso quedaría suelto
  // inflando los costos del mes sin nada que lo explique.
  if (orden.egreso_id) await auth.db.from('egresos').delete().eq('id', orden.egreso_id);

  const { error } = await auth.db.from('ordenes_compra').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Orden de compra borrada',
    detalles: `${orden.correlativo || id} · ${orden.proveedor}`,
    referencia_id: id, referencia_tabla: 'ordenes_compra',
  });

  return NextResponse.json({ ok: true });
}
