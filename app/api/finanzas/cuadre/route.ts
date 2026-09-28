import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { revisarEgreso, revisarVenta, type Hallazgo, type TipoHallazgo } from '@/lib/finanzas/cuadre';
import { BANK_BIN_IDS, binsTotalUSD, emptyBins } from '@/lib/reporte/ventas-mapping';

export const dynamic = 'force-dynamic';

/**
 * El cuadre: cada venta y cada gasto contra lo que dicen sus cuentas.
 *
 * GET  → la lista de lo que no cuadra, con qué hacer en cada caso.
 * POST → aplica una corrección. `{ tabla, id, tipo }` para una, `{ seguras: true }`
 *        para todas las que tienen una sola explicación posible.
 *
 * La corrección NUNCA viene de la pantalla: se vuelve a calcular aquí con la
 * fila tal como está ahora. Si alguien la cambió mientras tanto, o ya no está
 * descuadrada, no se toca nada.
 */

type Fila = Record<string, unknown>;
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** La tasa BCV de cada día: la mediana de las ventas, sin la 518 por defecto. */
function tasasPorDia(ventas: Fila[]): Record<string, number> {
  const por: Record<string, number[]> = {};
  for (const v of ventas) {
    const t = Number(v.tasa_cambio) || 0;
    if (t <= 0 || t === 518) continue;
    const d = String(v.fecha).slice(0, 10);
    (por[d] = por[d] || []).push(t);
  }
  const out: Record<string, number> = {};
  for (const [d, l] of Object.entries(por)) {
    l.sort((a, b) => a - b);
    out[d] = l[Math.floor(l.length / 2)];
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cargar(db: any, sede: string | null) {
  let qv = db.from('ventas_dia').select('*').order('fecha', { ascending: false }).limit(5000);
  let qe = db.from('egresos').select('*').order('fecha', { ascending: false }).limit(5000);
  if (sede) { qv = qv.eq('sede_id', sede); qe = qe.eq('sede_id', sede); }
  const [{ data: ventas }, { data: egresos }] = await Promise.all([qv, qe]);

  // El cobro que guarda cada orden, para ver si dice lo mismo que su venta.
  const ids = [...new Set((ventas || []).map((v: Fila) => v.servicio_id).filter(Boolean))] as string[];
  const ordenes = new Map<string, Fila>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('servicios').select('id, metodos_pago, tasa_cambio').in('id', ids.slice(i, i + 200));
    for (const o of (data || [])) ordenes.set(o.id, o);
  }
  // Lo cobrado otros días por cada venta, en dólares.
  const cobrado = new Map<string, number>();
  const idsVentas = (ventas || []).map((v: Fila) => v.id as string);
  for (let i = 0; i < idsVentas.length; i += 200) {
    const { data } = await db.from('abonos').select('venta_id, monto, metodo_pago').in('venta_id', idsVentas.slice(i, i + 200));
    // La inicial se cobró el día de la venta y ya está en sus cuentas.
    for (const a of (data || []).filter((x: Fila) => x.metodo_pago !== 'inicial')) cobrado.set(a.venta_id, r2((cobrado.get(a.venta_id) || 0) + (Number(a.monto) || 0)));
  }
  const filas = (ventas || []).map((v: Fila) => ({
    ...v,
    orden_metodos: v.servicio_id ? ordenes.get(v.servicio_id as string)?.metodos_pago ?? null : null,
    cobrado_despues: cobrado.get(v.id as string) || 0,
  }));
  return { ventas: filas as Fila[], egresos: (egresos || []) as Fila[], tasas: tasasPorDia(filas) };
}

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sede = auth.effectiveSede(new URL(req.url).searchParams.get('sede'));

  const { ventas, egresos, tasas } = await cargar(auth.db, sede);

  const casos: Array<{
    tabla: 'ventas_dia' | 'egresos'; id: string; fecha: string; cliente: string;
    placa: string | null; vehiculo: string | null; total: number; servicio_id: string | null;
    hallazgos: Hallazgo[];
  }> = [];

  for (const v of ventas) {
    const h = revisarVenta(v, tasas[String(v.fecha).slice(0, 10)] || 0);
    if (!h.length) continue;
    casos.push({
      tabla: 'ventas_dia', id: String(v.id), fecha: String(v.fecha).slice(0, 10),
      cliente: String(v.cliente || 'Consumidor final'), placa: (v.placa as string) || null,
      vehiculo: (v.vehiculo_info as string) || null, total: r2(v.total_ingresos),
      servicio_id: (v.servicio_id as string) || null, hallazgos: h,
    });
  }
  for (const e of egresos) {
    const h = revisarEgreso(e);
    if (!h.length) continue;
    casos.push({
      tabla: 'egresos', id: String(e.id), fecha: String(e.fecha).slice(0, 10),
      cliente: String(e.proveedor || e.cliente || 'Gasto'), placa: (e.placa as string) || null,
      vehiculo: (e.vehiculo_info as string) || null, total: r2(e.total_egresos),
      servicio_id: (e.servicio_id as string) || null, hallazgos: h,
    });
  }

  const todos = casos.flatMap(c => c.hallazgos);
  return NextResponse.json({
    casos,
    resumen: {
      revisadas: ventas.length,
      gastosRevisados: egresos.length,
      conProblema: casos.length,
      seguras: todos.filter(h => h.correccion?.segura).length,
      enJuegoUSD: r2(todos.reduce((s, h) => s + Math.abs(h.diferenciaUSD || 0), 0)),
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aplicar(db: any, v: Fila, h: Hallazgo): Promise<string | null> {
  const c = h.correccion;
  if (!c) return 'Este caso no tiene corrección automática: ábrelo y corrígelo a mano.';
  const cambios: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(c.cambios)) cambios[k] = val === 'true' ? true : val === 'false' ? false : val;

  if (c.cobroSinMetodo) {
    const { error } = await db.from('abonos').insert({
      venta_id: v.id,
      fecha: c.cobroSinMetodo.fecha,
      monto: c.cobroSinMetodo.monto,
      metodo_pago: 'Sin registrar',
      moneda: 'USD',
      saldo_antes: c.cobroSinMetodo.monto,
      saldo_despues: 0,
      nota: 'Confirmado desde el cuadre: se dio por pagada sin decir por dónde entró el dinero',
      registrado_por: 'Cuadre',
      sede_id: v.sede_id ?? null,
    });
    if (error) return error.message;
  }
  if (Object.keys(cambios).length) {
    const { error } = await db.from('ventas_dia')
      .update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', v.id);
    if (error) return error.message;
  }
  // La orden guarda el mismo cobro que la venta ya corregida.
  if (c.aOrden && v.servicio_id) {
    const bins = emptyBins();
    for (const id of BANK_BIN_IDS) bins[id] = r2((c.aOrden as Record<string, unknown>)[id]);
    const tasa = Number(cambios.tasa_cambio) || Number(v.tasa_cambio) || 0;
    const { error } = await db.from('servicios').update({
      metodos_pago: bins, tasa_cambio: tasa || null, total_pagado: binsTotalUSD(bins, tasa),
    }).eq('id', v.servicio_id);
    if (error) return error.message;
  } else if (v.servicio_id && 'tasa_cambio' in cambios) {
    await db.from('servicios').update({ tasa_cambio: cambios.tasa_cambio }).eq('id', v.servicio_id);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await authorize('reportes', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { tabla?: string; id?: string; tipo?: TipoHallazgo; seguras?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const sede = auth.effectiveSede(null);
  const { ventas, tasas } = await cargar(auth.db, sede);
  const tasaDe = (v: Fila) => tasas[String(v.fecha).slice(0, 10)] || 0;

  const hechos: string[] = [];
  const errores: string[] = [];

  if (body.seguras) {
    for (const v of ventas) {
      for (const h of revisarVenta(v, tasaDe(v)).filter(x => x.correccion?.segura)) {
        const err = await aplicar(auth.db, v, h);
        if (err) errores.push(`${v.cliente}: ${err}`);
        else hechos.push(`${v.fecha} ${v.cliente}: ${h.correccion!.explicacion}`);
      }
    }
  } else {
    if (body.tabla !== 'ventas_dia') {
      return NextResponse.json({ error: 'Los gastos se corrigen desde Reportes › Egresos.' }, { status: 400 });
    }
    const v = ventas.find(x => x.id === body.id);
    if (!v) return NextResponse.json({ error: 'Esa venta ya no existe.' }, { status: 404 });
    const h = revisarVenta(v, tasaDe(v)).find(x => x.tipo === body.tipo);
    if (!h) return NextResponse.json({ error: 'Esta venta ya cuadra: no había nada que corregir.' }, { status: 409 });
    const err = await aplicar(auth.db, v, h);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    hechos.push(`${v.fecha} ${v.cliente}: ${h.correccion!.explicacion}`);
  }

  if (hechos.length) {
    await logActivityServer(auth.db, {
      usuario: auth.user!.nombre, modulo: 'finanzas', accion: 'Cuadre corregido',
      detalles: hechos.slice(0, 20).join(' | ') + (hechos.length > 20 ? ` (+${hechos.length - 20})` : ''),
      referencia_tabla: 'ventas_dia', sede_id: sede,
    });
  }
  return NextResponse.json({ corregidas: hechos.length, hechos, errores });
}
