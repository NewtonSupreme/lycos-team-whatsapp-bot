import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/*
 * El detalle económico de UN trabajo: cliente, vehículo, cada renglón con su precio, su costo y
 * lo que dejó, la mano de obra de los mecánicos y lo cobrado.
 *
 *   GET ?venta=<id>&costos=<id,id,…>
 *
 * `costos` son los gastos que la utilidad del período le cargó a este trabajo (misma regla que
 * el total del período): así el detalle y el resumen dicen la misma cifra.
 */

const n = (x: unknown) => Number(x) || 0;
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const clave = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const parecido = (a: string, b: string) => !!a && !!b && (a === b || (a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b)));

interface Renglon {
  descripcion: string; cantidad: number; precio: number; costo: number; utilidad: number; margen: number;
  tipo: 'pieza' | 'mano_obra' | 'servicio'; costoDe: string; sinCosto: boolean;
  costos: Array<{ id: string; descripcion: string; usd: number; proveedor: string | null; repetido: boolean }>;
}

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const u = new URL(req.url).searchParams;
  const ventaId = u.get('venta') || '';
  const idsCostos = (u.get('costos') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 200);
  const db = auth.db;

  const { data: v } = await db.from('ventas_dia').select('*').eq('id', ventaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Esa venta ya no existe.' }, { status: 404 });

  const [{ data: servicio }, { data: egresos }, { data: abonos }] = await Promise.all([
    v.servicio_id ? db.from('servicios').select('id, fecha, estado, tipo, descripcion, items, nombre_cliente, vehiculo_info, placa').eq('id', v.servicio_id).maybeSingle() : Promise.resolve({ data: null }),
    idsCostos.length ? db.from('egresos').select('id, fecha, proveedor, categoria, notas, desglose, total_egresos, moneda, tasa_cambio, partida_id, estado_pago') .in('id', idsCostos) : Promise.resolve({ data: [] }),
    db.from('abonos').select('fecha, monto, metodo_pago, nota').eq('venta_id', ventaId).order('fecha'),
  ]);
  const partidaIds = (egresos || []).map(e => e.partida_id).filter(Boolean);
  const [{ data: partidas }, { data: nomina }, { data: veh }] = await Promise.all([
    partidaIds.length ? db.from('vehiculo_partidas').select('id, descripcion, cantidad, costo, precio_venta, tipo, origen').in('id', partidaIds) : Promise.resolve({ data: [] }),
    v.servicio_id ? db.from('job_assignments').select('empleado_nombre, descripcion, mano_obra_usd, comision_usd, estado, es_override').eq('referencia_id', v.servicio_id).neq('estado', 'anulado') : Promise.resolve({ data: [] }),
    v.vehiculo_id ? db.from('vehiculos').select('marca, modelo, anio, color, placa').eq('id', v.vehiculo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const partidaDe = new Map((partidas || []).map(p => [p.id, p]));

  // Los costos, en dólares, con su descripción (la del renglón de ficha si nació de uno).
  const costos = (egresos || []).map(e => {
    const usd = String(e.moneda || 'USD').toUpperCase() === 'USD' ? n(e.total_egresos) : (n(e.tasa_cambio) > 0 ? n(e.total_egresos) / n(e.tasa_cambio) : 0);
    const p = e.partida_id ? partidaDe.get(e.partida_id) : null;
    const desc = p?.descripcion || (Array.isArray(e.desglose) && e.desglose.map((d: { descripcion?: string }) => d?.descripcion).filter(Boolean).join(', ')) || String(e.notas || '').replace(/\[[^\]]*\]/g, '').trim() || String(e.categoria || 'Costo');
    return { id: e.id as string, descripcion: desc, usd: r2(usd), proveedor: (e.proveedor as string) || null, k: clave(desc), repetido: false, usado: false, fecha: String(e.fecha || '').slice(0, 10) };
  });
  // Mismo concepto y mismo monto dos veces en un trabajo: casi siempre se cargó doble.
  const vistos = new Map<string, number>();
  for (const c of costos) { const k = `${c.k}|${c.usd}`; vistos.set(k, (vistos.get(k) || 0) + 1); }
  for (const c of costos) c.repetido = (vistos.get(`${c.k}|${c.usd}`) || 0) > 1;

  // Los renglones: los de la orden (traen tipo y costo de almacén) o, si no hay, los de la venta.
  type Item = { descripcion?: string; cantidad?: number; precio_unitario?: number; total?: number; costo_unitario?: number; es_mano_obra?: boolean; inventario_id?: string | null };
  const itemsOrden = (Array.isArray(servicio?.items) ? servicio!.items : []) as Item[];
  const itemsVenta = (Array.isArray(v.desglose) ? v.desglose : []) as Item[];
  const base = (itemsOrden.length ? itemsOrden : itemsVenta).filter(it => String(it?.descripcion || '').trim());

  const renglones: Renglon[] = base.map(it => {
    const desc = String(it.descripcion).trim(); const k = clave(desc);
    const cant = n(it.cantidad) || 1;
    const precio = r2(n(it.total) || cant * n(it.precio_unitario));
    const suyos = costos.filter(c => !c.usado && parecido(k, c.k));
    suyos.forEach(c => { c.usado = true; });
    let costo = r2(suyos.reduce((s, c) => s + c.usd, 0)); let costoDe = suyos.length ? 'gasto registrado' : '';
    if (!suyos.length && n(it.costo_unitario) > 0) { costo = r2(n(it.costo_unitario) * cant); costoDe = 'costo del almacén (no está en gastos)'; }
    const esMO = !!it.es_mano_obra || /mano de obra|instalaci|servicio|diagn|revisi|alineaci|balanceo|lavado|soldadura/.test(k);
    return {
      descripcion: desc, cantidad: cant, precio, costo, utilidad: r2(precio - costo), margen: precio > 0 ? r2(((precio - costo) / precio) * 100) : 0,
      tipo: esMO ? (it.inventario_id ? 'pieza' : 'mano_obra') : 'pieza', costoDe, sinCosto: !costo && !esMO,
      costos: suyos.map(c => ({ id: c.id, descripcion: c.descripcion, usd: c.usd, proveedor: c.proveedor, repetido: c.repetido })),
    };
  });
  const otrosCostos = costos.filter(c => !c.usado).map(c => ({ id: c.id, descripcion: c.descripcion, usd: c.usd, proveedor: c.proveedor, repetido: c.repetido, fecha: c.fecha }));

  const venta = r2(n(v.total_ingresos));
  const sumaRenglones = r2(renglones.reduce((s, x) => s + x.precio, 0));
  const costoTotal = r2(costos.reduce((s, c) => s + c.usd, 0));
  const costoAlmacen = r2(renglones.filter(x => x.costoDe.startsWith('costo del almacén')).reduce((s, x) => s + x.costo, 0));
  const comisiones = r2((nomina || []).reduce((s, j) => s + n(j.comision_usd), 0));
  const utilidad = r2(venta - costoTotal);
  const avisos: string[] = [];
  if (renglones.length && Math.abs(sumaRenglones - venta) >= 1) avisos.push(`Los renglones suman $${sumaRenglones.toFixed(2)} y la venta registrada (sin IVA) es $${venta.toFixed(2)}: revisa si hubo descuento, IVA incluido o un renglón de más.`);
  if (costos.some(c => c.repetido)) avisos.push('Hay costos con el mismo concepto y el mismo monto cargados más de una vez en este trabajo: revisa si se registraron doble.');
  if (renglones.some(x => x.sinCosto)) avisos.push(`${renglones.filter(x => x.sinCosto).length} pieza(s) sin costo anotado: si costaron algo, la ganancia real es menor.`);
  if (costoAlmacen > 0) avisos.push(`$${costoAlmacen.toFixed(2)} de costo anotado en la orden (piezas del almacén o mano de obra de terceros) no está cargado a este trabajo como gasto. Con ese costo, el trabajo deja $${r2(utilidad - costoAlmacen).toFixed(2)} y no $${utilidad.toFixed(2)}. Si la mercancía se registró como gasto al comprarla, ya está restada en el período; si no, la utilidad del período está inflada en esa cifra.`);

  return NextResponse.json({
    venta: {
      id: v.id, fecha: v.fecha, cliente: v.cliente, placa: v.placa, vehiculo: v.vehiculo_info || (veh ? [veh.marca, veh.modelo, veh.anio].filter(Boolean).join(' ') : null),
      color: veh?.color || null, base: venta, iva: r2(v.con_iva ? venta * 0.16 : n(v.iva)), saldoPendiente: r2(n(v.saldo_pendiente)), estado: v.estado, servicioId: v.servicio_id,
      ordenEstado: servicio?.estado || null, ordenDescripcion: servicio?.descripcion || null,
    },
    renglones, otrosCostos,
    nomina: (nomina || []).map(j => ({ empleado: j.empleado_nombre || 'Taller', descripcion: j.descripcion || '', manoObra: r2(n(j.mano_obra_usd)), comision: r2(n(j.comision_usd)), estado: j.estado, override: !!j.es_override })),
    cobros: (abonos || []).map(a => ({ fecha: String(a.fecha || '').slice(0, 10), monto: r2(n(a.monto)), metodo: a.metodo_pago, nota: a.nota })),
    totales: {
      venta, costo: costoTotal, utilidad, margen: venta > 0 ? r2((utilidad / venta) * 100) : 0,
      comisiones, despuesDeManoDeObra: r2(utilidad - comisiones), costoAlmacenSinGasto: costoAlmacen,
    },
    avisos,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
