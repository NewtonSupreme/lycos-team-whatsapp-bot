import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const n2 = (n: unknown) => Number((Number(n) || 0).toFixed(2));
const hoyISO = () => new Date().toISOString().slice(0, 10);

interface ItemEntrante {
  descripcion?: string;
  cantidad?: number;
  costo_unitario?: number;
  inventario_id?: string | null;
}

/**
 * Órdenes de compra: lo que se le pidió a un proveedor y todavía no ha llegado.
 *
 * Están aparte de `egresos` a propósito. Lo pedido es un compromiso, no un
 * gasto: meterlo en egresos haría que el mes cerrara con dinero que aún no ha
 * salido. El gasto nace cuando la mercancía llega, y entonces la orden guarda
 * el `egreso_id` para que la misma compra no se cuente dos veces.
 */

/** Alta de una orden de compra, con su desglose. */
export async function POST(req: NextRequest) {
  const auth = await authorize('vehiculos', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    proveedor?: string; proveedor_id?: string | null;
    fecha?: string; fecha_esperada?: string | null;
    items?: ItemEntrante[]; notas?: string; enlace?: string;
    estado_pago?: string; fecha_vencimiento?: string | null;
    moneda?: string; tasa?: number; sede?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const proveedor = String(body.proveedor || '').trim();
  if (!proveedor) {
    return NextResponse.json({ error: 'Indica a quién se le está comprando.' }, { status: 400 });
  }

  const items = (body.items || [])
    .map(it => {
      const cantidad = Math.max(0, Number(it.cantidad) || 0);
      const costo = Math.max(0, Number(it.costo_unitario) || 0);
      return {
        descripcion: String(it.descripcion || '').trim(),
        cantidad,
        costo_unitario: n2(costo),
        total: n2(cantidad * costo),
        inventario_id: it.inventario_id || null,
      };
    })
    .filter(it => it.descripcion && it.cantidad > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: 'La orden necesita al menos un renglón.' }, { status: 400 });
  }

  const total = n2(items.reduce((s, it) => s + it.total, 0));
  const sedeId = auth.effectiveSede(body.sede ?? null) ?? auth.user!.sede_id ?? null;

  // ── La fecha de vencimiento, desde los días de crédito del proveedor ───────
  // Pedirla a mano es lo que hacía que la mitad de las compras a crédito se
  // quedaran sin fecha, y sin fecha la alerta de pago nunca salta.
  let vence = body.fecha_vencimiento || null;
  const estadoPago = ['pagado', 'por_pagar', 'parcial'].includes(String(body.estado_pago))
    ? String(body.estado_pago) : 'por_pagar';

  if (!vence && estadoPago !== 'pagado' && body.proveedor_id) {
    const { data: prov } = await auth.db.from('proveedores')
      .select('dias_credito').eq('id', body.proveedor_id).maybeSingle();
    const dias = Number(prov?.dias_credito) || 0;
    if (dias > 0) {
      const base = new Date(`${(body.fecha || hoyISO()).slice(0, 10)}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() + dias);
      vence = base.toISOString().slice(0, 10);
    }
  }

  // Un correlativo corto para poder nombrarla por teléfono.
  const { count } = await auth.db.from('ordenes_compra')
    .select('id', { count: 'exact', head: true });
  const correlativo = `OC-${String((count || 0) + 1).padStart(4, '0')}`;

  const { data: orden, error } = await auth.db.from('ordenes_compra').insert({
    correlativo,
    proveedor,
    proveedor_id: body.proveedor_id || null,
    fecha: (body.fecha || hoyISO()).slice(0, 10),
    fecha_esperada: body.fecha_esperada || null,
    estado: 'pendiente',
    estado_pago: estadoPago,
    monto_pagado: estadoPago === 'pagado' ? total : 0,
    fecha_vencimiento: vence,
    total,
    moneda: body.moneda || 'USD',
    tasa: Number(body.tasa) || null,
    notas: (body.notas || '').trim() || null,
    enlace: (body.enlace || '').trim() || null,
    creado_por: auth.user!.nombre,
    sede_id: sedeId,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: errItems } = await auth.db.from('ordenes_compra_items')
    .insert(items.map(it => ({ ...it, orden_id: orden.id })));

  if (errItems) {
    // Una orden sin renglones no dice nada y su total quedaría inventado: se
    // retira entera en vez de dejar media guardada.
    await auth.db.from('ordenes_compra').delete().eq('id', orden.id);
    return NextResponse.json({ error: errItems.message }, { status: 400 });
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Orden de compra',
    detalles: `${correlativo} · ${proveedor} · $${total.toFixed(2)} · ${items.length} renglón(es)`,
    referencia_id: orden.id, referencia_tabla: 'ordenes_compra', sede_id: sedeId,
  });

  return NextResponse.json({ orden, items: items.length });
}

/** Los renglones de una orden. Query: ?orden=<id> */
export async function GET(req: NextRequest) {
  const auth = await authorize('vehiculos', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orden = new URL(req.url).searchParams.get('orden');
  if (!orden) return NextResponse.json({ error: 'Indica la orden.' }, { status: 400 });

  const { data, error } = await auth.db.from('ordenes_compra_items')
    .select('*').eq('orden_id', orden).order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}
