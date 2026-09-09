import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { BANK_METHODS, binToUSD } from '@/lib/reporte/ventas-mapping';
import { categoriaLabel, inferirCategoria } from '@/lib/categorias';
import {
  COLOR_ESTADO, ETIQUETA_ESTADO, colorReporte,
  type BarraIngreso, type ClienteTop, type OrdenReciente, type ProductoUsado,
  type PuntoDia, type ReporteGeneral, type TajadaReporte,
} from '@/lib/reportes/general';

export const dynamic = 'force-dynamic';

/**
 * El panel general de Reportes, en una sola llamada.
 *
 * Los cuatro indicadores, los gráficos y las tres listas salen de las mismas
 * filas. Calcularlos por separado daría cifras que no cuadran entre sí, que en
 * un reporte es peor que no tenerlas.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const DIA = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dosDig = (n: number) => String(n).padStart(2, '0');

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function variacion(actual: number, previo: number): number | null {
  if (!previo) return null;
  return r2(((actual - previo) / Math.abs(previo)) * 100);
}

interface FilaVenta {
  id: string; fecha: string | null; cliente: string | null; cliente_id: string | null;
  categoria: string | null; total_ingresos: number | null;
  tasa: number | null; tasa_cambio: number | null;
  [bin: string]: unknown;
}

/** Lo cobrado en una venta, en dólares, con la tasa de su propio día. */
function ingresoUSD(v: FilaVenta): number {
  const tasa = Number(v.tasa) || Number(v.tasa_cambio) || 0;
  let suma = 0;
  let hayBins = false;
  for (const m of BANK_METHODS) {
    const nativo = Number(v[m.id] as number) || 0;
    if (nativo === 0) continue;
    hayBins = true;
    suma += binToUSD(m.id, nativo, tasa);
  }
  // La mayoría de las ventas no tiene desglose por banco; para esas el importe
  // registrado es `total_ingresos`, que ya está en dólares.
  return hayBins ? r2(suma) : r2(Number(v.total_ingresos) || 0);
}

const montoServicio = (s: {
  costo_final: number | null; total_pagado: number | null; costo_estimado: number | null;
}) => Math.max(
  Number(s.costo_final) || 0, Number(s.total_pagado) || 0, Number(s.costo_estimado) || 0,
);

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = new Date();

  const desde = url.searchParams.get('desde')
    || iso(new Date(hoy.getTime() - 29 * DIA));
  const hasta = url.searchParams.get('hasta') || iso(hoy);

  const dDesde = new Date(`${desde}T00:00:00`);
  const dHasta = new Date(`${hasta}T00:00:00`);
  const dias = Math.max(1, Math.round((dHasta.getTime() - dDesde.getTime()) / DIA) + 1);
  const prevHasta = iso(new Date(dDesde.getTime() - DIA));
  const prevDesde = iso(new Date(dDesde.getTime() - dias * DIA));

  const binCols = BANK_METHODS.map(m => m.id).join(', ');
  const conSede = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    (sede ? q.eq('sede_id', sede) : q);

  const [rVentas, rPrev, rServicios, rServPrev, rEgresos, rTasa] = await Promise.all([
    conSede(auth.db.from('ventas_dia')
      .select(`id, fecha, cliente, cliente_id, categoria, total_ingresos, tasa, tasa_cambio, ${binCols}`)
      .gte('fecha', desde).lte('fecha', hasta).limit(5000)),
    conSede(auth.db.from('ventas_dia')
      .select(`id, fecha, cliente, cliente_id, total_ingresos, tasa, tasa_cambio, ${binCols}`)
      .gte('fecha', prevDesde).lte('fecha', prevHasta).limit(5000)),
    conSede(auth.db.from('servicios')
      .select('id, fecha, hora, estado, categoria, tipo, tipo_personalizado, descripcion, '
        + 'nombre_cliente, cliente_id, vehiculo_info, placa, items, '
        + 'costo_final, total_pagado, costo_estimado')
      .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).limit(3000)),
    conSede(auth.db.from('servicios')
      .select('id, cliente_id, nombre_cliente, estado, costo_final, total_pagado, costo_estimado')
      .gte('fecha', prevDesde).lte('fecha', prevHasta).limit(3000)),
    conSede(auth.db.from('egresos')
      .select('id, fecha, total_egresos, moneda, tasa_cambio')
      .gte('fecha', desde).lte('fecha', hasta).limit(3000)),
    auth.db.from('tasas_bcv').select('bcv').order('fecha', { ascending: false }).limit(1),
  ]);

  if (rVentas.error) return NextResponse.json({ error: rVentas.error.message }, { status: 500 });

  const avisos: string[] = [];
  for (const [que, r] of [
    ['los servicios', rServicios], ['los gastos', rEgresos],
  ] as const) {
    if (r.error) avisos.push(`No se pudieron leer ${que}: ${r.error.message}`);
  }

  const ventas = (rVentas.data as unknown as FilaVenta[]) || [];
  const ventasPrev = (rPrev.data as unknown as FilaVenta[]) || [];
  const tasa = Number((rTasa.data as { bcv: number }[] | null)?.[0]?.bcv) || 0;

  type FilaServicio = {
    id: string; fecha: string | null; hora: string | null; estado: string | null;
    categoria: string | null; tipo: string | null; tipo_personalizado: string | null;
    descripcion: string | null; nombre_cliente: string | null; cliente_id: string | null;
    vehiculo_info: string | null; placa: string | null;
    items: { descripcion?: string; cantidad?: number; total?: number; inventario_id?: string | null }[] | null;
    costo_final: number | null; total_pagado: number | null; costo_estimado: number | null;
  };

  // El cast pasa por unknown: el select multilinea rompe la inferencia de
  // PostgREST y sin esto TypeScript ve un tipo de error en vez de las filas.
  const servicios = (rServicios.data as unknown as FilaServicio[]) || [];
  const serviciosPrev = (rServPrev.data as unknown as FilaServicio[]) || [];

  const CANCELADOS = new Set(['cancelada', 'cancelado', 'anulada']);
  const hechos = servicios.filter(s => !CANCELADOS.has(String(s.estado || '').toLowerCase()));
  const hechosPrev = serviciosPrev.filter(s => !CANCELADOS.has(String(s.estado || '').toLowerCase()));

  // ── Egresos, en dólares ───────────────────────────────────────────────────
  const egresos = (rEgresos.data as {
    fecha: string | null; total_egresos: number | null; moneda: string | null; tasa_cambio: number | null;
  }[]) || [];
  const egresoUSD = (e: typeof egresos[number]) => {
    const m = Number(e.total_egresos) || 0;
    if (String(e.moneda || 'USD').toUpperCase() === 'USD') return r2(m);
    const t = Number(e.tasa_cambio) || 0;
    return t > 0 ? r2(m / t) : 0;
  };

  // ── Serie por día, para las líneas y las barras ───────────────────────────
  // Se recorren TODOS los días del período, no solo los que tienen ventas: un
  // día sin trabajo es información, y saltárselo deforma la tendencia.
  const porDia = new Map<string, { ingresos: number; egresos: number; servicios: number; clientes: Set<string> }>();
  for (let i = 0; i < Math.min(dias, 190); i += 1) {
    porDia.set(iso(new Date(dDesde.getTime() + i * DIA)),
      { ingresos: 0, egresos: 0, servicios: 0, clientes: new Set() });
  }
  const dia = (f?: string | null) => porDia.get(String(f || '').slice(0, 10));

  for (const v of ventas) { const d = dia(v.fecha); if (d) d.ingresos += ingresoUSD(v); }
  for (const e of egresos) { const d = dia(e.fecha); if (d) d.egresos += egresoUSD(e); }
  for (const s of hechos) {
    const d = dia(s.fecha);
    if (!d) continue;
    d.servicios += 1;
    d.clientes.add(s.cliente_id || s.nombre_cliente || s.id);
  }

  const serie: PuntoDia[] = [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([f, x]) => {
      const d = new Date(`${f}T00:00:00`);
      return {
        etiqueta: `${dosDig(d.getDate())} ${MES_CORTO[d.getMonth()]}`,
        ingresos: r2(x.ingresos),
        egresos: r2(x.egresos),
      };
    });

  // El gráfico de barras y la tendencia enseñan los últimos días del período:
  // treinta barras no se leen, y siete cuentan la semana.
  const ultimos = (n: number) => serie.slice(-n);

  // ── Los cuatro indicadores ────────────────────────────────────────────────
  const ingresos = r2(ventas.reduce((s, v) => s + ingresoUSD(v), 0));
  const ingresosPrev = r2(ventasPrev.reduce((s, v) => s + ingresoUSD(v), 0));

  const nServicios = hechos.length;
  const nServiciosPrev = hechosPrev.length;

  const clientesUnicos = new Set(hechos.map(s => s.cliente_id || s.nombre_cliente).filter(Boolean));
  const clientesPrev = new Set(hechosPrev.map(s => s.cliente_id || s.nombre_cliente).filter(Boolean));

  const facturado = r2(hechos.reduce((s, x) => s + montoServicio(x), 0));
  const facturadoPrev = r2(hechosPrev.reduce((s, x) => s + montoServicio(x), 0));
  const ticket = nServicios > 0 ? r2(facturado / nServicios) : 0;
  const ticketPrev = nServiciosPrev > 0 ? r2(facturadoPrev / nServiciosPrev) : 0;

  const kpis: ReporteGeneral['kpis'] = {
    ingresos: {
      valor: ingresos, variacion: variacion(ingresos, ingresosPrev),
      serie: serie.map(x => x.ingresos),
    },
    servicios: {
      valor: nServicios, variacion: variacion(nServicios, nServiciosPrev),
      serie: [...porDia.values()].map(x => x.servicios),
    },
    clientes: {
      valor: clientesUnicos.size, variacion: variacion(clientesUnicos.size, clientesPrev.size),
      serie: [...porDia.values()].map(x => x.clientes.size),
    },
    ticket: {
      valor: ticket, variacion: variacion(ticket, ticketPrev),
      serie: [...porDia.values()].map(x => (x.servicios > 0 ? r2(x.ingresos / x.servicios) : 0)),
    },
  };

  // ── Servicios por categoría ───────────────────────────────────────────────
  //
  // Solo 4 de 526 órdenes tienen `categoria` guardada: la escriben las
  // pantallas nuevas, y el histórico entero viene sin ella. Tomándola tal cual,
  // el 97,7% caía en «Otro servicio» y los dos paneles de categoría eran un
  // círculo de un solo color.
  //
  // Así que cuando falta se infiere del texto de la orden, con el mismo
  // clasificador que usan el reporte de ventas y la nómina. No es adivinar: la
  // descripción dice «alineación» o «cambio de silenciador», y de ahí sale.
  const categoriaDe = (s: FilaServicio): string => {
    const guardada = String(s.categoria || '').toLowerCase().trim();
    if (guardada && guardada !== 'otro') return guardada;
    return inferirCategoria(
      [s.tipo_personalizado, s.descripcion, s.tipo].filter(Boolean).join(' '),
    );
  };

  const catCount = new Map<string, number>();
  const catMonto = new Map<string, number>();
  for (const s of hechos) {
    const k = categoriaDe(s);
    catCount.set(k, (catCount.get(k) || 0) + 1);
    catMonto.set(k, (catMonto.get(k) || 0) + montoServicio(s));
  }

  const serviciosPorCategoria: TajadaReporte[] = [...catCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([clave, valor], i) => ({
      clave, etiqueta: categoriaLabel(clave), valor,
      pct: nServicios > 0 ? r2((valor / nServicios) * 100) : 0,
      color: colorReporte(i),
    }));

  const totalPorTipo = [...catMonto.values()].reduce((a, b) => a + b, 0);
  const ingresosPorTipo: BarraIngreso[] = [...catMonto.entries()]
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([clave, monto], i) => ({
      clave, etiqueta: categoriaLabel(clave), monto: r2(monto),
      pct: totalPorTipo > 0 ? r2((monto / totalPorTipo) * 100) : 0,
      color: colorReporte(i),
    }));

  // ── Estados de las órdenes ────────────────────────────────────────────────
  // Aquí sí entran las canceladas: el reparto de estados sin las canceladas
  // esconde justo lo que hay que vigilar.
  const estCount = new Map<string, number>();
  for (const s of servicios) {
    const k = String(s.estado || 'pendiente').toLowerCase();
    estCount.set(k, (estCount.get(k) || 0) + 1);
  }
  // Varios estados significan lo mismo («completada» y «finalizado»), así que
  // se agrupan por su etiqueta para no partir la misma tajada en dos.
  const porEtiqueta = new Map<string, { n: number; color: string }>();
  for (const [k, n] of estCount) {
    const et = ETIQUETA_ESTADO[k] || k.replace(/_/g, ' ');
    const prev = porEtiqueta.get(et);
    porEtiqueta.set(et, { n: (prev?.n || 0) + n, color: prev?.color || COLOR_ESTADO[k] || '#a3a3a3' });
  }
  const totalOrdenes = servicios.length;
  const estadosOrdenes: TajadaReporte[] = [...porEtiqueta.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([etiqueta, x]) => ({
      clave: etiqueta, etiqueta, valor: x.n,
      pct: totalOrdenes > 0 ? r2((x.n / totalOrdenes) * 100) : 0,
      color: x.color,
    }));

  // ── Top 5 clientes ────────────────────────────────────────────────────────
  const porCliente = new Map<string, ClienteTop>();
  for (const s of hechos) {
    const clave = s.cliente_id || (s.nombre_cliente || '').trim().toLowerCase();
    if (!clave) continue;
    const actual = porCliente.get(clave) || {
      id: s.cliente_id, nombre: s.nombre_cliente || 'Sin nombre', monto: 0, servicios: 0,
    };
    actual.monto += montoServicio(s);
    actual.servicios += 1;
    porCliente.set(clave, actual);
  }
  const topClientes = [...porCliente.values()]
    .map(c => ({ ...c, monto: r2(c.monto) }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  // ── Últimas órdenes ───────────────────────────────────────────────────────
  const ultimasOrdenes: OrdenReciente[] = servicios.slice(0, 8).map(s => ({
    id: s.id,
    // Las órdenes no llevan número propio; se usan los últimos dígitos de su
    // identificador para poder nombrarlas sin inventar un correlativo.
    numero: `OS-${s.id.replace(/\D/g, '').slice(-4).padStart(4, '0')}`,
    fecha: (s.fecha || '').slice(0, 10),
    cliente: s.nombre_cliente || 'Sin cliente',
    vehiculo: s.vehiculo_info || s.placa || '—',
    servicio: s.tipo_personalizado || categoriaLabel(categoriaDe(s)) || s.tipo || 'Servicio',
    estado: String(s.estado || 'pendiente'),
    total: r2(montoServicio(s)),
  }));

  // ── Productos más utilizados ──────────────────────────────────────────────
  // Salen de los renglones de las órdenes. Solo cuentan los enlazados al
  // almacén: un renglón escrito a mano no es un producto identificable, y
  // meterlo aquí llenaría la lista de «mano de obra» y «soldadura».
  const porProducto = new Map<string, ProductoUsado>();
  let renglonesSueltos = 0;
  for (const s of hechos) {
    for (const it of (Array.isArray(s.items) ? s.items : [])) {
      const nombre = String(it?.descripcion || '').trim();
      if (!nombre) continue;
      if (!it?.inventario_id) { renglonesSueltos += 1; continue; }
      const actual = porProducto.get(it.inventario_id) || {
        id: it.inventario_id, nombre, usos: 0, total: 0,
      };
      actual.usos += Number(it.cantidad) || 1;
      actual.total += Number(it.total) || 0;
      porProducto.set(it.inventario_id, actual);
    }
  }
  const productosUsados = [...porProducto.values()]
    .map(p => ({ ...p, total: r2(p.total) }))
    .sort((a, b) => b.usos - a.usos)
    .slice(0, 6);

  if (productosUsados.length === 0 && renglonesSueltos > 0) {
    avisos.push(
      `Ningún renglón del período está enlazado al inventario (${renglonesSueltos} escritos a mano), `
      + 'así que no se puede saber qué productos se usaron. Tómalos del almacén al registrar el trabajo.',
    );
  }

  if (!tasa) avisos.push('No hay tasa del BCV registrada; los importes se muestran en dólares.');

  const salida: ReporteGeneral = {
    desde, hasta, tasa, kpis,
    ingresosVsEgresos: ultimos(7),
    tendencia: ultimos(Math.min(14, serie.length)),
    serviciosPorCategoria, totalServicios: nServicios,
    ingresosPorTipo, estadosOrdenes, totalOrdenes,
    topClientes, ultimasOrdenes, productosUsados, avisos,
  };

  return NextResponse.json(salida);
}
