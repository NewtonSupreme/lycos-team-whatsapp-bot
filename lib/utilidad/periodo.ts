// ─────────────────────────────────────────────────────────────────────────────
// Utilidad de un período (un día, una semana, un mes) y el diagnóstico de lo que
// la distorsiona.
//
// DOS MIRADAS, NUNCA MEZCLADAS (mezclarlas es lo que producía «utilidades» raras):
//
//   · Resultado (lo ganado):  Ventas del período (base, sin IVA)
//                             − Costo de los carros (repuestos, insumos, terceros)
//                             − Gastos del taller (nómina, alquiler, luz, transporte…)
//                             = Utilidad.  El IVA no es ingreso: se le debe al SENIAT.
//   · Caja (lo cobrado):      Lo que entró de verdad (ventas pagadas, inicial de Cashea,
//                             cuotas y abonos) − lo que salió en gastos pagados.
//
// Cada monto en Bs se suma en Bs exactos y su equivalente en dólares se da DOS veces:
// a la tasa del día en que entró (el valor real de ese día) y a la tasa de hoy
// (lo que vale ahora). La diferencia es la diferencia cambiaria del período.
//
// El costo de un carro se reconoce JUNTO CON SU VENTA (no el día en que se compró la pieza):
//   · pieza comprada antes de cobrar → cuenta el día de la venta de ese carro;
//   · carro todavía en el taller y sin cobrar → «trabajo en proceso»: se muestra aparte y no
//     resta hasta que se registre la venta (si no, una semana de compras parece una pérdida);
//   · pieza comprada después de cobrar (garantía, retoque) o sin venta ni orden abierta → su día.
// Así cada venta carga con su costo y un período nunca se come el costo de otro.
//
// Una utilidad negativa NO se esconde ni se ajusta: puede ser real (un mes de
// alquiler y nómina con pocas ventas) o puede venir de datos mal cargados. El
// diagnóstico separa una cosa de la otra con los registros exactos.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { BANK_METHODS, binToUSD, type BankBin } from '@/lib/reporte/ventas-mapping';
import { binsDeFila } from '@/lib/reporte/entradas';
import { getCategoria, inferirCategoria } from '@/lib/categorias';
import { leerCasheaGuardado } from '@/lib/pagos/cashea';
import { CATEGORIAS_EGRESO, grupoDe } from '@/components/egresos/tipos';
import { binsDeFila as columnasDeCobro, revisarEgreso, revisarVenta, TITULOS } from '@/lib/finanzas/cuadre';

type Fila = Record<string, unknown>;
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;
const s = (x: unknown) => String(x ?? '');
const iso = (x: unknown) => s(x).slice(0, 10);
const masDias = (f: string, k: number) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const norm = (t: unknown) => s(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const MONEDA_BIN = new Map(BANK_METHODS.map(m => [m.id, m.moneda]));
const NOMBRE_BIN = new Map(BANK_METHODS.map(m => [m.id, m.label]));
const BANCO_DE_BIN: Record<string, string> = { pago_movil_banesco: 'banesco', punto_banesco: 'banesco', bnc: 'bnc', cashea: 'bnc', pago_movil_exterior: 'exterior' };
const NOMBRE_BANCO: Record<string, string> = { banesco: 'Banesco', bnc: 'BNC', bnc_cuotas: 'BNC', exterior: 'Banco Exterior', cashea: 'Cashea' };

// ── Tipos de salida ─────────────────────────────────────────────────────────

export interface Linea { clave: string; etiqueta: string; usd: number; n: number }

export interface DiaUtilidad {
  fecha: string; ventas: number; costo: number; gastos: number; utilidad: number;
  cobradoUsd: number; pagadoUsd: number; nVentas: number;
}

/** Un costo cargado a un trabajo (repuesto, insumo, trabajo de terceros). */
export interface CostoTrabajo { id: string; fecha: string; descripcion: string; categoria: string; usd: number; proveedor: string | null }

/** Lo que dejó UN trabajo (una venta del período): lo cobrado sin IVA menos lo que costó. */
export interface TrabajoUtilidad {
  ventaId: string; servicioId: string | null; fecha: string;
  cliente: string; placa: string | null; vehiculo: string | null;
  categoria: string; categoriaEtiqueta: string;
  venta: number; costo: number; utilidad: number; margen: number;
  costos: CostoTrabajo[];
  items: Array<{ descripcion: string; cantidad: number; total: number }>;
}

/** Por categoría (departamento): cuánto se vende, cuánto cuesta y cuánto deja. */
export interface CategoriaUtilidad {
  clave: string; etiqueta: string; ventas: number; costo: number; utilidad: number; margen: number; n: number; ticket: number;
  /** Trabajos con utilidad negativa en esta categoría. */
  enPerdida: number;
}

export interface EstadoResultados {
  desde: string; hasta: string; dias: number; tasaHoy: number; tasaHoyFecha: string | null;
  ventas: {
    base: number; iva: number; facturado: number; n: number;
    porDepartamento: Linea[];
    contadoRecibido: number; casheaInicial: number; casheaFinanciado: number; credito: number;
  };
  costoCarros: {
    total: number; porCategoria: Linea[]; n: number;
    /** Comprado ANTES del período para carros que se cobraron en el período. */
    traidoDeAntes: number;
    /** Comprado en el período para carros que siguen en el taller sin cobrar: no resta todavía. */
    enProceso: { total: number; n: number; porPlaca: Array<{ placa: string; usd: number; n: number }> };
  };
  gastosTaller: { total: number; porCategoria: Linea[]; n: number };
  utilidadBruta: number; utilidad: number; margenBruto: number; margen: number;
  caja: {
    entradas: { bs: number; usdDelDia: number; usdHoy: number; usdDirecto: number; cuotasCashea: number; abonos: number };
    totalEntradoUsdDelDia: number; totalEntradoUsdHoy: number; diferenciaCambiaria: number;
    gastosPagadosUsd: number; gastosPorPagarUsd: number; netoCajaUsd: number;
    porCuenta: Array<{ cuenta: string; nombre: string; moneda: 'Bs' | 'USD'; monto: number; usdDelDia: number; usdHoy: number }>;
  };
  porDia: DiaUtilidad[];
  /** Cada venta del período con su costo. Σ costo de los trabajos + costoSinTrabajo = costoCarros.total. */
  trabajos: TrabajoUtilidad[];
  porCategoria: CategoriaUtilidad[];
  /** Costo reconocido en el período que no es de ninguna venta del período (retoques de trabajos de antes, piezas sin venta). */
  costoSinTrabajo: { total: number; n: number; costos: CostoTrabajo[] };
  avisos: string[];
}

export type Severidad = 'critico' | 'alto' | 'medio' | 'info';
export type Efecto = 'infla' | 'reduce' | 'caja' | 'neutro';

export interface RegistroHallazgo {
  tabla: string; id: string; fecha: string; descripcion: string; usd: number;
  enlace?: string; detalle?: string;
}

export interface Hallazgo {
  id: string; severidad: Severidad; efecto: Efecto; titulo: string; explicacion: string;
  /** Cuánto mueve la utilidad (o la caja) si se corrige: + subiría, − bajaría. 0 si no se puede saber. */
  impactoUsd: number; accion: string; registros: RegistroHallazgo[]; total: number;
}

export interface EstadoConciliacionBanco {
  banco: string; nombre: string; ultimaCorrida: null | {
    id: string; archivo: string | null; huella: string | null; cargada: string; usuario: string | null;
    desde: string; hasta: string; porcentaje: number; pendientes: number; cuadra: boolean; versionesAnteriores: number;
  };
  diasConMovimiento: number; diasCubiertos: number; diasSinConciliar: string[]; cambiosDespues: number;
}

export interface Diagnostico {
  puntaje: number;
  resumen: { criticos: number; altos: number; medios: number; info: number; infla: number; reduce: number; caja: number };
  hallazgos: Hallazgo[];
  conciliacion: EstadoConciliacionBanco[];
}

// ── Carga ───────────────────────────────────────────────────────────────────

async function todas(construir: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await construir().range(i, i + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data || []) as Fila[]));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

interface Datos {
  ventas: Fila[]; abonos: Fila[]; egresos: Fila[]; egresosAntes: Fila[]; egresosCercanos: Fila[];
  ventasCercanas: Fila[]; casheaVentas: Fila[]; casheaAbonos: Fila[]; nomina: Fila[]; trabajos: Fila[];
  servicios: Fila[]; ventasDeServicios: Set<string>; corridas: Fila[]; tasas: Array<{ fecha: string; bcv: number }>;
  cobradoDespues: Map<string, number>; metodosOrden: Map<string, unknown>; placasAbiertas: Set<string>;
  egresosCarros: Fila[]; ventasPlacas: Fila[];
}

async function cargar(db: SupabaseClient, desde: string, hasta: string, sede: string | null): Promise<Datos> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el constructor anidado agota la inferencia de tipos
  const conSede = (q: any) => (sede ? q.eq('sede_id', sede) : q);
  const [ventas, abonos, egresos, egresosAntes, egresosCercanos, ventasCercanas, casheaVentas, nomina, trabajos, servicios, corridas, tasasR] = await Promise.all([
    todas(() => conSede(db.from('ventas_dia').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas(() => conSede(db.from('abonos').select('id, venta_id, fecha, monto, monto_bs, tasa_cambio, metodos_pago, metodo_pago, nota').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas(() => conSede(db.from('egresos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas(() => conSede(db.from('egresos').select('fecha, categoria, total_egresos, moneda, tasa_cambio, placa, vehiculo_id').gte('fecha', masDias(desde, -92)).lt('fecha', desde))),
    todas(() => conSede(db.from('egresos').select('id, fecha, placa, vehiculo_id, servicio_id, categoria, total_egresos, moneda, tasa_cambio').gte('fecha', masDias(desde, -20)).lte('fecha', masDias(hasta, 20)))),
    todas(() => conSede(db.from('ventas_dia').select('id, fecha, placa, vehiculo_id, servicio_id, cliente, total_ingresos').gte('fecha', masDias(desde, -45)).lte('fecha', masDias(hasta, 30)))),
    todas(() => conSede(db.from('ventas_dia').select('id, fecha, cliente, placa, total_ingresos, con_iva, cashea, cashea_pct, inicial, financiado, saldo_pendiente').gte('fecha', masDias(hasta, -75)).lte('fecha', hasta).gt('financiado', 0))),
    todas(() => conSede(db.from('payroll_ledger').select('id, empleado_nombre, total_pagar, moneda, estado, pagado_at, periodo_inicio, periodo_fin').gte('pagado_at', `${desde}T00:00:00`).lte('pagado_at', `${hasta}T23:59:59`))).catch(() => []),
    todas(() => conSede(db.from('job_assignments').select('id, fecha, empleado_nombre, comision_usd, estado').gte('fecha', desde).lte('fecha', hasta))).catch(() => []),
    todas(() => conSede(db.from('servicios').select('id, fecha, estado, nombre_cliente, placa, costo_estimado, costo_final, total_pagado, items, updated_at').gte('fecha', desde).lte('fecha', hasta))),
    db.from('conciliacion_corridas').select('id, banco, desde, hasta, archivo, usuario, cuadra, porcentaje, pendientes, created_at, resumen').lte('desde', hasta).gte('hasta', desde).order('created_at', { ascending: false }).limit(300).then(r => (r.data || []) as Fila[]),
    db.from('tasas_bcv').select('fecha, bcv').lte('fecha', hasta).gte('fecha', masDias(desde, -10)).order('fecha').then(r => (r.data || []) as Fila[]),
  ]);
  const casheaAbonos: Fila[] = [];
  const ids = casheaVentas.map(v => s(v.id));
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('abonos').select('venta_id, fecha, monto, metodos_pago, metodo_pago').in('venta_id', ids.slice(i, i + 200));
    casheaAbonos.push(...((data || []) as Fila[]));
  }
  const ventasDeServicios = new Set<string>();
  const sids = servicios.map(x => s(x.id));
  for (let i = 0; i < sids.length; i += 200) {
    const { data } = await db.from('ventas_dia').select('servicio_id').in('servicio_id', sids.slice(i, i + 200));
    for (const v of data || []) if (v.servicio_id) ventasDeServicios.add(s(v.servicio_id));
  }
  // Para el cuadre de cada venta: lo cobrado otros días y lo que dice su orden.
  const cobradoDespues = new Map<string, number>();
  const vids = ventas.map(v => s(v.id));
  for (let i = 0; i < vids.length; i += 200) {
    const { data } = await db.from('abonos').select('venta_id, monto, metodo_pago').in('venta_id', vids.slice(i, i + 200));
    for (const a of data || []) if (a.metodo_pago !== 'inicial') cobradoDespues.set(s(a.venta_id), r2((cobradoDespues.get(s(a.venta_id)) || 0) + n(a.monto)));
  }
  const metodosOrden = new Map<string, unknown>();
  const oids = [...new Set(ventas.map(v => s(v.servicio_id)).filter(Boolean))];
  for (let i = 0; i < oids.length; i += 200) {
    const { data } = await db.from('servicios').select('id, metodos_pago').in('id', oids.slice(i, i + 200));
    for (const x of data || []) metodosOrden.set(s(x.id), x.metodos_pago);
  }
  // Carros con orden abierta: su gasto sin venta es normal (aún no se cobra).
  const placasAbiertas = new Set<string>();
  {
    const { data } = await db.from('servicios').select('placa').not('estado', 'in', '("completada","completado","finalizado","cancelada","cancelado","anulada")').not('placa', 'is', null).limit(2000);
    for (const x of data || []) placasAbiertas.add(norm(x.placa));
  }
  // Costos de carros desde 90 días antes (para las ventas del período) y las ventas de esos carros hasta hoy.
  const hoyC = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  const [egresosAmplio, ventasPlacas] = await Promise.all([
    todas(() => conSede(db.from('egresos').select('*').gte('fecha', masDias(desde, -90)).lte('fecha', hasta).order('fecha'))),
    todas(() => conSede(db.from('ventas_dia').select('id, fecha, placa, servicio_id').gte('fecha', masDias(desde, -135)).lte('fecha', hoyC))),
  ]);
  const egresosCarros = egresosAmplio.filter(g => grupoDe({ categoria: s(g.categoria), placa: g.placa as string | null, vehiculo_id: g.vehiculo_id as string | null }) === 'carros');
  return {
    egresosCarros, ventasPlacas,
    cobradoDespues, metodosOrden, placasAbiertas,
    ventas, abonos, egresos, egresosAntes, egresosCercanos, ventasCercanas, casheaVentas, casheaAbonos, nomina, trabajos, servicios,
    ventasDeServicios, corridas, tasas: tasasR.map(t => ({ fecha: iso(t.fecha), bcv: n(t.bcv) })).filter(t => t.bcv > 0),
  };
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

/** Lo que de verdad entró por cada cuenta en una venta: sus columnas. El método de pago solo vale si la venta está saldada. */
function cobradoDe(v: Fila): Record<string, number> {
  const cols = columnasDeCobro(v) as unknown as Record<string, number>;
  if (Object.values(cols).some(x => x > 0)) return cols;
  if (n(v.saldo_pendiente) > 0.009) return {};
  return binsDeFila(v) as unknown as Record<string, number>;
}

const egresoUsd = (e: Fila) => (s(e.moneda || 'USD').toUpperCase() === 'USD' ? n(e.total_egresos) : (n(e.tasa_cambio) > 0 ? n(e.total_egresos) / n(e.tasa_cambio) : 0));
const etiquetaCat = (id: string) => CATEGORIAS_EGRESO.find(c => c.id === id)?.label.replace(/\s*\(.*\)$/, '') || (id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ') : 'Sin categoría');
const ivaDe = (v: Fila) => (v.con_iva ? r2(n(v.total_ingresos) * 0.16) : n(v.iva));
const departamento = (v: Fila): { clave: string; etiqueta: string } => {
  const texto = [...(Array.isArray(v.desglose) ? (v.desglose as Fila[]).map(d => s(d?.descripcion)) : []), s(v.notas)].join(' ');
  const cat = getCategoria(s(v.categoria)) || getCategoria(inferirCategoria(texto));
  return cat ? { clave: cat.key, etiqueta: cat.label } : { clave: 'otro', etiqueta: 'Otro servicio' };
};

export interface Resultado { estado: EstadoResultados; diagnostico: Diagnostico }

export async function analizarPeriodo(db: SupabaseClient, o: { desde: string; hasta: string; sede: string | null }): Promise<Resultado> {
  const { desde, hasta, sede } = o;
  const d = await cargar(db, desde, hasta, sede);
  const avisos: string[] = [];

  const { data: tHoy } = await db.from('tasas_bcv').select('fecha, bcv').gt('bcv', 0).order('fecha', { ascending: false }).limit(1).maybeSingle();
  const tasaHoy = n(tHoy?.bcv);
  if (!tasaHoy) avisos.push('No hay tasa BCV registrada: no se puede dar el equivalente a la tasa de hoy.');
  const tasaDelDia = (f: string) => { let t = 0; for (const x of d.tasas) { if (x.fecha <= f) t = x.bcv; else break; } return t; };

  // ── Ventas
  const dep = new Map<string, Linea>();
  let base = 0, iva = 0, contado = 0, casheaInicial = 0, casheaFinanciado = 0, credito = 0;
  const porDia = new Map<string, DiaUtilidad>();
  const dia = (f: string) => porDia.get(f) || porDia.set(f, { fecha: f, ventas: 0, costo: 0, gastos: 0, utilidad: 0, cobradoUsd: 0, pagadoUsd: 0, nVentas: 0 }).get(f)!;
  const porCuenta = new Map<string, { monto: number; usdDelDia: number; usdHoy: number }>();
  let entradasBs = 0, entradasUsdDelDiaBs = 0, entradasUsdHoyBs = 0, entradasUsdDirecto = 0;
  const sinTasa: RegistroHallazgo[] = [];

  const sumarCobro = (bins: Record<string, number>, tasaFila: number, fecha: string, ref: { tabla: string; id: string; desc: string }) => {
    let usd = 0;
    for (const m of BANK_METHODS) {
      const monto = n(bins[m.id]); if (monto <= 0) continue;
      const pc = porCuenta.get(m.id) || { monto: 0, usdDelDia: 0, usdHoy: 0 };
      pc.monto += monto;
      if (m.moneda === 'Bs') {
        const t = tasaFila || tasaDelDia(fecha);
        if (!t) sinTasa.push({ tabla: ref.tabla, id: ref.id, fecha, descripcion: `${ref.desc} · ${m.label}`, usd: 0, detalle: `Bs ${monto.toFixed(2)} sin tasa` });
        const ud = t > 0 ? monto / t : 0;
        entradasBs += monto; entradasUsdDelDiaBs += ud; entradasUsdHoyBs += tasaHoy > 0 ? monto / tasaHoy : 0;
        pc.usdDelDia += ud; pc.usdHoy += tasaHoy > 0 ? monto / tasaHoy : 0; usd += ud;
      } else {
        entradasUsdDirecto += monto; pc.usdDelDia += monto; pc.usdHoy += monto; usd += monto;
      }
      porCuenta.set(m.id, pc);
    }
    return usd;
  };

  const trabajos = new Map<string, TrabajoUtilidad>();
  for (const v of d.ventas) {
    const f = iso(v.fecha); const total = n(v.total_ingresos);
    base += total; iva += ivaDe(v);
    const dd = departamento(v);
    trabajos.set(s(v.id), {
      ventaId: s(v.id), servicioId: v.servicio_id ? s(v.servicio_id) : null, fecha: f,
      cliente: s(v.cliente).trim() || 'Sin nombre', placa: v.placa ? s(v.placa).toUpperCase() : null, vehiculo: v.vehiculo_info ? s(v.vehiculo_info) : null,
      categoria: dd.clave, categoriaEtiqueta: dd.etiqueta, venta: total, costo: 0, utilidad: 0, margen: 0, costos: [],
      items: (Array.isArray(v.desglose) ? (v.desglose as Fila[]) : []).filter(x => s(x?.descripcion).trim())
        .map(x => ({ descripcion: s(x.descripcion).trim(), cantidad: n(x.cantidad) || 1, total: r2(n(x.total)) })),
    });
    const l = dep.get(dd.clave) || { clave: dd.clave, etiqueta: dd.etiqueta, usd: 0, n: 0 };
    l.usd += total; l.n++; dep.set(dd.clave, l);
    const bins = cobradoDe(v);
    const tasaV = n(v.tasa_cambio) || n(v.tasa);
    const cobrado = sumarCobro(bins, tasaV, f, { tabla: 'ventas_dia', id: s(v.id), desc: s(v.cliente) });
    const cx = leerCasheaGuardado(v);
    casheaInicial += n(bins.cashea);
    contado += cobrado - n(bins.cashea);
    if (cx.usa && !cx.legado) casheaFinanciado += cx.financiado;
    else credito += n(v.saldo_pendiente);
    const x = dia(f); x.ventas += total; x.cobradoUsd += cobrado; x.nVentas++;
  }
  let cuotasCashea = 0, abonosUsd = 0;
  for (const a of d.abonos) {
    if (s(a.metodo_pago) === 'inicial') continue; // la inicial ya está dentro de su venta
    const mp = a.metodos_pago && typeof a.metodos_pago === 'object' ? a.metodos_pago as Record<string, number> : {};
    const f = iso(a.fecha);
    const usd = sumarCobro(mp, n(a.tasa_cambio), f, { tabla: 'abonos', id: s(a.id), desc: 'Cobro' });
    if (n(mp.cashea) > 0) cuotasCashea += n(mp.cashea); else abonosUsd += usd;
    dia(f).cobradoUsd += usd;
  }

  // ── Costos y gastos
  const costoCat = new Map<string, Linea>(); const gastoCat = new Map<string, Linea>();
  let costo = 0, gastos = 0, pagados = 0, porPagar = 0, nCosto = 0, nGasto = 0;
  // ¿Cuándo cuenta el costo de cada pieza? El día de la venta de su carro (ver la cabecera).
  const ventasDe = new Map<string, Array<{ f: string; id: string }>>();
  for (const v of d.ventasPlacas) {
    for (const k of [v.placa ? `p:${norm(v.placa)}` : '', v.servicio_id ? `s:${s(v.servicio_id)}` : ''].filter(Boolean)) (ventasDe.get(k) || ventasDe.set(k, []).get(k)!).push({ f: iso(v.fecha), id: s(v.id) });
  }
  for (const l of ventasDe.values()) l.sort((a, b) => a.f.localeCompare(b.f));
  /** Cuándo cuenta el costo (r: null = trabajo en proceso) y de qué venta es. */
  const reconocer = (g: Fila): { r: string | null; venta: string | null } => {
    const f = iso(g.fecha);
    const claves = [g.servicio_id ? `s:${s(g.servicio_id)}` : '', g.placa ? `p:${norm(g.placa)}` : ''].filter(Boolean);
    if (!claves.length) return { r: f, venta: null };
    // Primero las ventas de su misma orden; luego las de la placa.
    const lista = claves.flatMap(k => ventasDe.get(k) || []);
    const ordenadas = [...lista].sort((a, b) => a.f.localeCompare(b.f));
    const despues = ordenadas.find(x => x.f >= f);
    if (despues && diasEntre(f, despues.f) <= 120) return { r: despues.f, venta: lista.find(x => x.f === despues.f)?.id || despues.id };
    const antes = [...ordenadas].reverse().find(x => x.f < f && diasEntre(x.f, f) <= 45);
    if (antes) return { r: f, venta: antes.id };
    if (g.placa && d.placasAbiertas.has(norm(g.placa))) return { r: null, venta: null };
    return { r: f, venta: null };
  };
  const sinTrabajo = { total: 0, n: 0, costos: [] as CostoTrabajo[] };
  const lineaCosto = (g: Fila, usd: number, cat: string): CostoTrabajo => ({
    id: s(g.id), fecha: iso(g.fecha), categoria: cat, usd: r2(usd), proveedor: g.proveedor ? s(g.proveedor) : null,
    descripcion: (Array.isArray(g.desglose) && (g.desglose as Fila[]).map(x => s(x?.descripcion)).filter(Boolean).join(', ')) || s(g.notas).replace(/\[[^\]]*\]/g, '').trim() || etiquetaCat(cat),
  });
  let traido = 0;
  const wip = new Map<string, { placa: string; usd: number; n: number }>();
  for (const g of d.egresosCarros) {
    const { r, venta: deVenta } = reconocer(g); const usd = egresoUsd(g); const f = iso(g.fecha);
    if (r === null) { if (f >= desde && f <= hasta) { const k = norm(g.placa) || '—'; const x = wip.get(k) || { placa: s(g.placa) || '—', usd: 0, n: 0 }; x.usd += usd; x.n++; wip.set(k, x); } continue; }
    if (r < desde || r > hasta) continue;
    const cat = s(g.categoria) || 'otro';
    const l = costoCat.get(cat) || { clave: cat, etiqueta: etiquetaCat(cat), usd: 0, n: 0 };
    l.usd += usd; l.n++; costoCat.set(cat, l);
    costo += usd; nCosto++; dia(r).costo += usd;
    if (f < desde) traido += usd;
    const t = deVenta ? trabajos.get(deVenta) : undefined;
    if (t) { t.costo += usd; t.costos.push(lineaCosto(g, usd, cat)); }
    else { sinTrabajo.total += usd; sinTrabajo.n++; sinTrabajo.costos.push(lineaCosto(g, usd, cat)); }
  }

  for (const e of d.egresos) {
    const usd = egresoUsd(e); const f = iso(e.fecha); const cat = s(e.categoria) || 'otro';
    if (s(e.moneda || 'USD').toUpperCase() !== 'USD' && !(n(e.tasa_cambio) > 0)) sinTasa.push({ tabla: 'egresos', id: s(e.id), fecha: f, descripcion: s(e.proveedor || e.cliente || 'Gasto'), usd: 0, detalle: 'Gasto en Bs sin tasa: queda fuera del total' });
    const enCarros = grupoDe({ categoria: cat, placa: e.placa as string | null, vehiculo_id: e.vehiculo_id as string | null }) === 'carros';
    // Los costos de carros ya se contaron arriba, en su fecha de reconocimiento; aquí solo la caja.
    if (!enCarros) {
      const l = gastoCat.get(cat) || { clave: cat, etiqueta: etiquetaCat(cat), usd: 0, n: 0 };
      l.usd += usd; l.n++; gastoCat.set(cat, l);
      gastos += usd; nGasto++; dia(f).gastos += usd;
    }
    const estado = s(e.estado_pago || 'pagado');
    const pagado = estado === 'pagado' ? usd : estado === 'parcial' ? Math.min(usd, n(e.monto_pagado)) : 0;
    pagados += pagado; porPagar += usd - pagado; dia(f).pagadoUsd += pagado;
  }

  const ordenar = (m: Map<string, Linea>) => [...m.values()].map(x => ({ ...x, usd: r2(x.usd) })).sort((a, b) => b.usd - a.usd);
  const utilidadBruta = r2(base - costo);
  const utilidad = r2(base - costo - gastos);
  const dias = Math.max(1, diasEntre(desde, hasta) + 1);
  const listaDias: DiaUtilidad[] = [];
  for (let f = desde; f <= hasta; f = masDias(f, 1)) {
    const x = porDia.get(f) || { fecha: f, ventas: 0, costo: 0, gastos: 0, utilidad: 0, cobradoUsd: 0, pagadoUsd: 0, nVentas: 0 };
    listaDias.push({ ...x, ventas: r2(x.ventas), costo: r2(x.costo), gastos: r2(x.gastos), utilidad: r2(x.ventas - x.costo - x.gastos), cobradoUsd: r2(x.cobradoUsd), pagadoUsd: r2(x.pagadoUsd) });
  }
  const totalDelDia = r2(entradasUsdDelDiaBs + entradasUsdDirecto);
  const totalHoy = r2(entradasUsdHoyBs + entradasUsdDirecto);

  const listaTrabajos = [...trabajos.values()].map(t => {
    const venta = r2(t.venta); const costoT = r2(t.costo); const util = r2(venta - costoT);
    return { ...t, venta, costo: costoT, utilidad: util, margen: venta > 0 ? r2((util / venta) * 100) : 0, costos: t.costos.sort((a, b) => b.usd - a.usd) };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.venta - a.venta);
  const cats = new Map<string, CategoriaUtilidad>();
  for (const t of listaTrabajos) {
    const c = cats.get(t.categoria) || { clave: t.categoria, etiqueta: t.categoriaEtiqueta, ventas: 0, costo: 0, utilidad: 0, margen: 0, n: 0, ticket: 0, enPerdida: 0 };
    c.ventas += t.venta; c.costo += t.costo; c.n++; if (t.utilidad < -0.009) c.enPerdida++;
    cats.set(t.categoria, c);
  }
  const porCategoria = [...cats.values()].map(c => {
    const ventas = r2(c.ventas); const costoC = r2(c.costo); const util = r2(ventas - costoC);
    return { ...c, ventas, costo: costoC, utilidad: util, margen: ventas > 0 ? r2((util / ventas) * 100) : 0, ticket: c.n ? r2(ventas / c.n) : 0 };
  }).sort((a, b) => b.utilidad - a.utilidad);

  const estado: EstadoResultados = {
    desde, hasta, dias, tasaHoy, tasaHoyFecha: tHoy ? iso(tHoy.fecha) : null,
    ventas: {
      base: r2(base), iva: r2(iva), facturado: r2(base + iva), n: d.ventas.length, porDepartamento: ordenar(dep),
      contadoRecibido: r2(contado), casheaInicial: r2(casheaInicial), casheaFinanciado: r2(casheaFinanciado), credito: r2(credito),
    },
    costoCarros: {
      total: r2(costo), porCategoria: ordenar(costoCat), n: nCosto, traidoDeAntes: r2(traido),
      enProceso: { total: r2([...wip.values()].reduce((t, x) => t + x.usd, 0)), n: [...wip.values()].reduce((t, x) => t + x.n, 0), porPlaca: [...wip.values()].map(x => ({ ...x, usd: r2(x.usd) })).sort((a, b) => b.usd - a.usd) },
    },
    gastosTaller: { total: r2(gastos), porCategoria: ordenar(gastoCat), n: nGasto },
    utilidadBruta, utilidad,
    margenBruto: base > 0 ? r2((utilidadBruta / base) * 100) : 0,
    margen: base > 0 ? r2((utilidad / base) * 100) : 0,
    caja: {
      entradas: { bs: r2(entradasBs), usdDelDia: r2(entradasUsdDelDiaBs), usdHoy: r2(entradasUsdHoyBs), usdDirecto: r2(entradasUsdDirecto), cuotasCashea: r2(cuotasCashea), abonos: r2(abonosUsd) },
      totalEntradoUsdDelDia: totalDelDia, totalEntradoUsdHoy: totalHoy, diferenciaCambiaria: r2(totalHoy - totalDelDia),
      gastosPagadosUsd: r2(pagados), gastosPorPagarUsd: r2(porPagar), netoCajaUsd: r2(totalDelDia - pagados),
      porCuenta: [...porCuenta.entries()].map(([id, x]) => ({ cuenta: id, nombre: NOMBRE_BIN.get(id as BankBin) || id, moneda: (MONEDA_BIN.get(id as BankBin) || 'USD') as 'Bs' | 'USD', monto: r2(x.monto), usdDelDia: r2(x.usdDelDia), usdHoy: r2(x.usdHoy) })).sort((a, b) => b.usdDelDia - a.usdDelDia),
    },
    porDia: listaDias,
    trabajos: listaTrabajos,
    porCategoria,
    costoSinTrabajo: { total: r2(sinTrabajo.total), n: sinTrabajo.n, costos: sinTrabajo.costos.sort((a, b) => b.usd - a.usd) },
    avisos,
  };

  const diagnostico = diagnosticar(d, estado, { desde, hasta, tasaDelDia, sinTasa });
  return { estado, diagnostico };
}

// ── Diagnóstico ─────────────────────────────────────────────────────────────

function diagnosticar(d: Datos, e: EstadoResultados, o: { desde: string; hasta: string; tasaDelDia: (f: string) => number; sinTasa: RegistroHallazgo[] }): Diagnostico {
  const { desde, hasta } = o;
  const H: Hallazgo[] = [];
  // Los que se crean solo cuando ocurren (dentro de un if) van siempre; los de lista, solo si encontraron algo.
  const condicional = /^(utilidad_negativa|nomina_del_dia|nomina_sin_gasto|comisiones_pendientes|pendientes_|desactualizada_)/;
  const add = (h: Omit<Hallazgo, 'total'>) => { if (h.registros.length || h.impactoUsd || condicional.test(h.id)) H.push({ ...h, impactoUsd: r2(h.impactoUsd), total: h.registros.length }); };
  const venta = (v: Fila, usd = n(v.total_ingresos), detalle?: string): RegistroHallazgo => ({ tabla: 'ventas_dia', id: s(v.id), fecha: iso(v.fecha), descripcion: `${s(v.cliente) || 'Cliente'}${v.placa ? ` · ${s(v.placa)}` : ''}`, usd: r2(usd), detalle });
  const gasto = (g: Fila, detalle?: string): RegistroHallazgo => ({ tabla: 'egresos', id: s(g.id), fecha: iso(g.fecha), descripcion: `${s(g.proveedor || g.cliente || 'Gasto')}${g.placa ? ` · ${s(g.placa)}` : ''}`, usd: r2(egresoUsd(g)), detalle });

  // 1 · Utilidad negativa: se explica, no se maquilla.
  if (e.utilidad < 0) {
    const mayores = [...e.gastosTaller.porCategoria, ...e.costoCarros.porCategoria].sort((a, b) => b.usd - a.usd).slice(0, 4);
    add({
      id: 'utilidad_negativa', severidad: 'critico', efecto: 'neutro', titulo: `La utilidad del período es negativa (${e.utilidad.toFixed(2)} $)`,
      explicacion: `Se vendieron $${e.ventas.base.toFixed(2)} y se gastaron $${(e.costoCarros.total + e.gastosTaller.total).toFixed(2)}. Puede ser real (gastos fijos grandes en un período corto) o venir de datos mal cargados: revisa los hallazgos de abajo, sobre todo los que «reducen» la utilidad. Mayores rubros: ${mayores.map(m => `${m.etiqueta} $${m.usd.toFixed(2)}`).join(', ')}.`,
      impactoUsd: 0, accion: 'Corrige primero los hallazgos marcados como «baja la utilidad» y vuelve a calcular.', registros: [],
    });
    const nomina = e.gastosTaller.porCategoria.find(x => x.clave === 'nomina')?.usd || 0;
    if (e.dias <= 3 && nomina > 0 && nomina >= e.gastosTaller.total * 0.4) {
      add({ id: 'nomina_del_dia', severidad: 'info', efecto: 'neutro', titulo: `Ese día se pagó la nómina ($${nomina.toFixed(2)})`, explicacion: 'La nómina es de toda la semana pero se registra el día en que se paga: ese día sale con utilidad baja o negativa y los demás días salen más altos. Para saber cuánto se ganó, mira la semana o el mes completo.', impactoUsd: 0, accion: 'Usa «Esta semana» o «Este mes» en Finanzas › Utilidad.', registros: [] });
    }
  }

  // 1b · Una devolución a un cliente no es un gasto del taller: es devolver un cobro que no correspondía.
  {
    const devol = d.egresos.filter(g => /devoluci|reembols|reintegr/i.test(`${s(g.notas)} ${JSON.stringify(g.desglose || '')}`));
    add({ id: 'devolucion_como_gasto', severidad: 'alto', efecto: 'reduce', titulo: 'Devoluciones a clientes registradas como gasto', explicacion: 'Devolverle a un cliente un pago equivocado no es un gasto: es deshacer un cobro. Si el cobro equivocado no está como venta, contar la devolución como gasto baja la utilidad sin razón.', impactoUsd: devol.reduce((t, g) => t + egresoUsd(g), 0), accion: 'Revisa cada una: si el cobro original no se registró como venta, la devolución no debe ir como gasto (márcala como traspaso o justifícala en la conciliación).', registros: devol.map(g => gasto(g, 'Devolución')) });
  }

  // 1c · Trabajo en proceso: piezas compradas para carros que aún no se cobran (no restan todavía)
  if (e.costoCarros.enProceso.total > 0) {
    add({ id: 'trabajo_en_proceso', severidad: 'info', efecto: 'neutro', titulo: `$${e.costoCarros.enProceso.total.toFixed(2)} en piezas de carros que siguen en el taller`, explicacion: 'Se compraron en el período para carros con orden abierta y sin cobrar. No se restan hasta que se registre la venta de cada carro: así la utilidad no sale negativa por comprar antes de cobrar. Si alguno de esos carros ya se entregó, falta registrar su venta.', impactoUsd: 0, accion: 'Cobra y registra la venta de cada carro al entregarlo.', registros: e.costoCarros.enProceso.porPlaca.map(x => ({ tabla: 'placa', id: x.placa, fecha: e.hasta, descripcion: `Carro · ${x.placa}`, usd: x.usd, detalle: `${x.n} gasto(s) sin venta todavía` })) });
  }

  // 2 · Ventas duplicadas (mismo cliente, mismo día, lo recibido igual)
  {
    const reg: RegistroHallazgo[] = []; let imp = 0;
    const grupos = new Map<string, Fila[]>();
    for (const v of d.ventas) { const k = `${iso(v.fecha)}|${norm(v.cliente)}`; if (!norm(v.cliente) || norm(v.cliente) === 'consumidor final') continue; (grupos.get(k) || grupos.set(k, []).get(k)!).push(v); }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const a = n(g[i].total_ingresos) * (g[i].con_iva ? 1.16 : 1), b = n(g[j].total_ingresos) * (g[j].con_iva ? 1.16 : 1);
        if (a > 0 && Math.abs(a - b) <= Math.max(0.5, a * 0.01)) { reg.push(venta(g[i]), venta(g[j], n(g[j].total_ingresos), 'posible repetida')); imp -= n(g[j].total_ingresos); }
      }
    }
    add({ id: 'ventas_duplicadas', severidad: 'critico', efecto: 'infla', titulo: 'Ventas registradas dos veces', explicacion: 'El mismo cliente, el mismo día y el mismo monto cobrado aparecen más de una vez: el ingreso se cuenta doble.', impactoUsd: imp, accion: 'Abre cada par y elimina la repetida (va a la papelera).', registros: reg });
  }

  // 3 · Gastos duplicados (mismo proveedor y monto, ±1 día, o misma referencia)
  {
    const reg: RegistroHallazgo[] = []; let imp = 0; const vistos = new Set<string>();
    const ord = [...d.egresos].sort((a, b) => iso(a.fecha).localeCompare(iso(b.fecha)));
    for (let i = 0; i < ord.length; i++) for (let j = i + 1; j < ord.length && diasEntre(iso(ord[i].fecha), iso(ord[j].fecha)) <= 1; j++) {
      const a = ord[i], b = ord[j];
      const mismaRef = s(a.comprobante_referencia).length >= 4 && s(a.comprobante_referencia) === s(b.comprobante_referencia);
      const mismo = norm(a.proveedor || a.cliente) && norm(a.proveedor || a.cliente) === norm(b.proveedor || b.cliente) && Math.abs(egresoUsd(a) - egresoUsd(b)) < 0.01
        && norm(a.placa) === norm(b.placa) && s(a.categoria) === s(b.categoria)
        && norm(JSON.stringify(a.desglose || a.notas)) === norm(JSON.stringify(b.desglose || b.notas));
      if ((mismaRef || mismo) && !vistos.has(s(b.id))) { vistos.add(s(b.id)); reg.push(gasto(a), gasto(b, 'posible repetido')); imp += egresoUsd(b); }
    }
    add({ id: 'gastos_duplicados', severidad: 'alto', efecto: 'reduce', titulo: 'Gastos registrados dos veces', explicacion: 'Mismo proveedor, mismo monto y mismo concepto en días seguidos (o la misma referencia bancaria): el gasto se cuenta doble.', impactoUsd: imp, accion: 'Verifica cada par y elimina el repetido.', registros: reg });
  }

  // 4 · Cuadre de cada venta y cada gasto (las mismas reglas que Finanzas › Cuadre)
  {
    const porTipo = new Map<string, { gravedad: string; reg: RegistroHallazgo[] }>();
    for (const v of d.ventas) {
      const fila = { ...v, orden_metodos: v.servicio_id ? d.metodosOrden.get(s(v.servicio_id)) ?? null : null, cobrado_despues: d.cobradoDespues.get(s(v.id)) || 0 };
      for (const h of revisarVenta(fila, o.tasaDelDia(iso(v.fecha)))) {
        const x = porTipo.get(h.tipo) || { gravedad: h.gravedad, reg: [] };
        x.reg.push(venta(v, h.diferenciaUSD, h.detalle)); porTipo.set(h.tipo, x);
      }
    }
    for (const g of d.egresos) for (const h of revisarEgreso(g)) {
      const x = porTipo.get(h.tipo) || { gravedad: h.gravedad, reg: [] };
      x.reg.push(gasto(g, h.detalle)); porTipo.set(h.tipo, x);
    }
    for (const [tipo, x] of porTipo) {
      add({
        id: `cuadre_${tipo}`, severidad: x.gravedad === 'alta' ? 'alto' : x.gravedad === 'media' ? 'medio' : 'info',
        efecto: ['cuenta_duplicada', 'cobro_de_mas', 'cobro_de_menos', 'pagada_sin_registro', 'tasa_sospechosa'].includes(tipo) ? 'caja' : 'neutro',
        titulo: TITULOS[tipo as keyof typeof TITULOS] || tipo,
        explicacion: 'El total de la venta (con su IVA), lo que entró por cada cuenta y lo que quedó debiendo no dicen lo mismo. Se corrige en Finanzas › Cuadre, una por una o las seguras de un clic.',
        impactoUsd: 0, accion: 'Finanzas › Cuadre', registros: x.reg.sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd)),
      });
    }
  }

  // 5 · Ventas sin cuenta de cobro (ni banco ni método) y sin deuda
  {
    const reg = d.ventas.filter(v => {
      const bins = cobradoDe(v);
      const hay = BANK_METHODS.some(m => n(bins[m.id]) > 0) || (v.metodos_pago && Object.values(v.metodos_pago as Record<string, unknown>).some(x => n(x) > 0));
      return n(v.total_ingresos) > 0 && !hay && n(v.saldo_pendiente) <= 0 && n(v.financiado) <= 0;
    }).map(v => venta(v));
    add({ id: 'venta_sin_cuenta', severidad: 'medio', efecto: 'caja', titulo: 'Ventas pagadas sin decir dónde entró el dinero', explicacion: 'La venta figura como pagada pero sin cuenta: ese dinero no aparece en ningún banco ni caja, y la conciliación nunca la podrá encontrar.', impactoUsd: 0, accion: 'Indica en cada venta cómo pagó el cliente.', registros: reg });
  }

  // 6 · Ventas de carros sin costo registrado (la utilidad sale inflada si el repuesto no se cargó)
  {
    const conCosto = new Set<string>();
    for (const g of d.egresosCercanos) {
      if (grupoDe({ categoria: s(g.categoria), placa: g.placa as string | null, vehiculo_id: g.vehiculo_id as string | null }) !== 'carros') continue;
      if (g.servicio_id) conCosto.add(`s:${s(g.servicio_id)}`);
      if (g.placa) conCosto.add(`p:${norm(g.placa)}`);
    }
    const conItems = new Set(d.servicios.filter(x => Array.isArray(x.items) && (x.items as Fila[]).some(it => n(it.costo_unitario) > 0)).map(x => s(x.id)));
    const REQUIEREN = new Set(['repuestos', 'silenciador', 'mecanica', 'frenos', 'electronica']);
    const reg = d.ventas.filter(v => {
      if (!REQUIEREN.has(departamento(v).clave) || n(v.total_ingresos) < 40) return false;
      return !(v.servicio_id && (conCosto.has(`s:${s(v.servicio_id)}`) || conItems.has(s(v.servicio_id)))) && !(v.placa && conCosto.has(`p:${norm(v.placa)}`));
    }).map(v => venta(v, n(v.total_ingresos), departamento(v).etiqueta));
    add({ id: 'venta_sin_costo', severidad: 'alto', efecto: 'infla', titulo: 'Trabajos con piezas que no tienen costo cargado', explicacion: 'Son ventas de repuestos, mecánica, escape, frenos o electrónica de $40 o más sin ningún gasto de pieza para ese carro ni costo en el almacén. Si se usó una pieza, la utilidad de esa venta sale más alta de lo real.', impactoUsd: 0, accion: 'Carga el costo en la ficha del vehículo (o confirma que el cliente trajo la pieza).', registros: reg });
  }

  // 7 · Gastos de un carro sin venta (se gastó en el carro y no consta el cobro)
  {
    const conVenta = new Set<string>();
    for (const v of d.ventasCercanas) { if (v.servicio_id) conVenta.add(`s:${s(v.servicio_id)}`); if (v.placa) conVenta.add(`p:${norm(v.placa)}`); if (v.vehiculo_id) conVenta.add(`v:${s(v.vehiculo_id)}`); }
    const reg = d.egresos.filter(g => grupoDe({ categoria: s(g.categoria), placa: g.placa as string | null, vehiculo_id: g.vehiculo_id as string | null }) === 'carros' && (g.placa || g.vehiculo_id || g.servicio_id)
      && !(g.servicio_id && conVenta.has(`s:${s(g.servicio_id)}`)) && !(g.placa && conVenta.has(`p:${norm(g.placa)}`)) && !(g.vehiculo_id && conVenta.has(`v:${s(g.vehiculo_id)}`)))
      .filter(g => !(g.placa && d.placasAbiertas.has(norm(g.placa))))
      .map(g => gasto(g, 'Sin venta de ese carro entre 45 días antes y 30 después, y sin orden abierta'));
    add({ id: 'costo_sin_venta', severidad: 'alto', efecto: 'reduce', titulo: 'Gastos de un carro que no tiene venta', explicacion: 'Se compró o pagó algo para un carro y no hay ninguna venta de ese carro cerca de esa fecha: o el trabajo aún no se cobró (carro en el taller), o se cobró y no se registró.', impactoUsd: 0, accion: 'Revisa la ficha del carro: cobra o registra la venta que falta.', registros: reg });
  }

  // 7b · Una inicial o cuota de Cashea registrada como venta NUEVA (ya estaba dentro de su venta)
  {
    const reg: RegistroHallazgo[] = []; let imp = 0;
    for (const v of d.ventas) {
      if (n(v.financiado) > 0 || n(v.cashea) > 0) continue;
      const total = n(v.total_ingresos) * (v.con_iva ? 1.16 : 1);
      const madre = d.casheaVentas.find(c => s(c.id) !== s(v.id) && norm(c.cliente) && norm(c.cliente) === norm(v.cliente) && iso(c.fecha) < iso(v.fecha)
        && (Math.abs(n(c.inicial) - total) <= 0.5 || Math.abs(n(c.financiado) / 3 - total) <= 0.5));
      if (madre) {
        imp -= n(v.total_ingresos);
        reg.push(venta(v, n(v.total_ingresos), `Coincide con la ${Math.abs(n(madre.inicial) - total) <= 0.5 ? 'inicial' : 'cuota'} de Cashea de su venta del ${iso(madre.fecha)} ($${n(madre.total_ingresos).toFixed(2)}): ese dinero ya está contado en esa venta`));
      }
    }
    add({ id: 'cashea_como_venta', severidad: 'critico', efecto: 'infla', titulo: 'Inicial o cuota de Cashea registrada como venta nueva', explicacion: 'El pago es la inicial (o una cuota) de una venta con Cashea de días antes. Registrarlo como venta nueva cuenta ese dinero dos veces en los ingresos. Debe ir como cobro de la venta original.', impactoUsd: imp, accion: 'Elimina la venta nueva y confirma el pago contra la venta original en Conciliación bancaria.', registros: reg });
  }

  // 8 · Cashea: cuotas que ya debieron pagarse y no están registradas
  {
    const reg: RegistroHallazgo[] = []; let falta = 0;
    for (const v of d.casheaVentas) {
      const fin = n(v.financiado); if (fin <= 0) continue;
      const cuota = r2(fin / 3); const fv = iso(v.fecha);
      const vencidas = [1, 2, 3].filter(k => masDias(fv, 14 * k) <= hasta).length;
      if (!vencidas) continue;
      const cobrado = d.casheaAbonos.filter(a => s(a.venta_id) === s(v.id) && s(a.metodo_pago) !== 'inicial').reduce((t, a) => t + n(a.monto), 0);
      const esperado = r2(cuota * vencidas); const dif = r2(esperado - cobrado);
      if (dif > 0.5) { falta += dif; reg.push(venta(v, dif, `${vencidas} cuota(s) vencida(s) de $${cuota.toFixed(2)} · registrado $${cobrado.toFixed(2)} · falta $${dif.toFixed(2)}${n(v.saldo_pendiente) <= 0.009 ? ' · la venta figura saldada sin cobros' : ''}`)); }
    }
    add({ id: 'cashea_sin_registrar', severidad: 'critico', efecto: 'caja', titulo: 'Cuotas de Cashea vencidas que no están registradas', explicacion: 'Cashea paga las cuotas cada 14 días pase lo que pase. Si la cuota ya venció y no hay cobro registrado, el dinero entró al BNC pero el sistema no lo sabe: falta en la caja y la venta sigue apareciendo como deuda.', impactoUsd: falta, accion: 'Sube el reporte de Cashea en Conciliación bancaria: las cuotas se descuentan solas.', registros: reg.sort((a, b) => b.usd - a.usd) });
  }

  // 9 · Gastos fijos que faltan este período (estaban los meses anteriores)
  if (e.dias >= 25) {
    const antes = new Map<string, { usd: number; meses: Set<string> }>();
    for (const g of d.egresosAntes) { const c = s(g.categoria); if (!['servicios', 'local', 'nomina', 'impuestos'].includes(c)) continue; const x = antes.get(c) || { usd: 0, meses: new Set<string>() }; x.usd += egresoUsd(g); x.meses.add(iso(g.fecha).slice(0, 7)); antes.set(c, x); }
    const ahora = new Set(d.egresos.map(g => s(g.categoria)));
    const reg: RegistroHallazgo[] = []; let imp = 0;
    for (const [c, x] of antes) if (!ahora.has(c) && x.meses.size >= 2) { const prom = x.usd / x.meses.size; imp -= prom; reg.push({ tabla: 'categoria', id: c, fecha: hasta, descripcion: etiquetaCat(c), usd: r2(prom), detalle: `Promedio de los ${x.meses.size} meses anteriores` }); }
    add({ id: 'gastos_fijos_faltan', severidad: 'alto', efecto: 'infla', titulo: 'Gastos fijos que este período no se registraron', explicacion: 'Estos gastos se registraron los meses anteriores y en este período no aparece ninguno. Si se pagaron, la utilidad sale inflada por ese monto.', impactoUsd: imp, accion: 'Registra el gasto del período (o confirma que este mes no se pagó).', registros: reg });
  }

  // 10 · Nómina pagada que no está como gasto
  {
    const pagadaUsd = d.nomina.filter(p => s(p.estado) === 'pagado').reduce((t, p) => t + (s(p.moneda || 'USD').toUpperCase() === 'USD' ? n(p.total_pagar) : 0), 0);
    const comoGasto = d.egresos.filter(g => s(g.categoria) === 'nomina').reduce((t, g) => t + egresoUsd(g), 0);
    if (pagadaUsd > 0 && pagadaUsd - comoGasto > Math.max(5, pagadaUsd * 0.05)) {
      add({ id: 'nomina_sin_gasto', severidad: 'alto', efecto: 'infla', titulo: 'Nómina pagada que no aparece como gasto', explicacion: `La nómina marca pagados $${pagadaUsd.toFixed(2)} en el período y los gastos de nómina suman $${comoGasto.toFixed(2)}. La diferencia no está restando de la utilidad.`, impactoUsd: -(pagadaUsd - comoGasto), accion: 'Registra el pago de nómina como gasto (o revisa si se pagó en bolívares y falta convertirlo).', registros: d.nomina.filter(p => s(p.estado) === 'pagado').map(p => ({ tabla: 'payroll_ledger', id: s(p.id), fecha: iso(p.pagado_at), descripcion: s(p.empleado_nombre), usd: r2(n(p.total_pagar)), detalle: `${s(p.moneda)} · ${iso(p.periodo_inicio)} a ${iso(p.periodo_fin)}` })) });
    }
    const pendientes = d.trabajos.filter(t => s(t.estado) === 'pendiente').reduce((t, x) => t + n(x.comision_usd), 0);
    if (pendientes > 0) add({ id: 'comisiones_pendientes', severidad: 'info', efecto: 'infla', titulo: `Comisiones generadas aún sin pagar: $${pendientes.toFixed(2)}`, explicacion: 'Los trabajos del período generaron comisiones que todavía no se liquidan. Son un gasto ya comprometido: cuando se paguen, la utilidad del período real será menor.', impactoUsd: -pendientes, accion: 'Liquídalas en Nómina para que entren como gasto.', registros: [] });
  }

  // 11 · Órdenes completadas sin venta (trabajo hecho que no se cobró en el sistema)
  {
    const reg = d.servicios.filter(x => ['completada', 'completado', 'finalizado'].includes(s(x.estado)) && !d.ventasDeServicios.has(s(x.id))
      && Math.max(n(x.costo_final), n(x.costo_estimado), n(x.total_pagado)) > 0)
      .map(x => ({ tabla: 'servicios', id: s(x.id), fecha: iso(x.fecha), descripcion: `${s(x.nombre_cliente)}${x.placa ? ` · ${s(x.placa)}` : ''}`, usd: r2(Math.max(n(x.costo_final), n(x.costo_estimado))), detalle: 'Orden completada sin venta' }));
    add({ id: 'orden_sin_venta', severidad: 'alto', efecto: 'reduce', titulo: 'Órdenes completadas que no tienen venta', explicacion: 'El trabajo figura terminado pero no hay venta: ese ingreso no está en la utilidad (o la venta se borró al reabrir la orden).', impactoUsd: reg.reduce((t, x) => t + x.usd, 0), accion: 'Abre la orden y regístrale el cobro (o anúlala si no se hizo).', registros: reg });
  }

  // 12 · Montos en bolívares sin tasa
  add({ id: 'sin_tasa', severidad: 'alto', efecto: 'neutro', titulo: 'Montos en bolívares sin tasa', explicacion: 'Sin la tasa de ese día no se puede pasar a dólares: el monto queda fuera de los totales en dólares.', impactoUsd: 0, accion: 'Pon la tasa del día en la venta o el gasto.', registros: o.sinTasa });

  // 13 · Gastos pagados sin cuenta
  {
    const reg = d.egresos.filter(g => s(g.estado_pago || 'pagado') !== 'por_pagar' && !g.metodo_pago && !(g.metodos_pago && Object.values(g.metodos_pago as Record<string, unknown>).some(x => n(x) > 0))).map(g => gasto(g));
    add({ id: 'gasto_sin_cuenta', severidad: 'medio', efecto: 'caja', titulo: 'Gastos pagados sin decir de qué cuenta salió', explicacion: 'El gasto cuenta para la utilidad, pero no se sabe de qué banco o caja salió: los saldos de las cuentas no cuadran con el banco.', impactoUsd: 0, accion: 'Indica en cada gasto de qué cuenta salió.', registros: reg });
  }

  // 14 · Gastos con categoría que el sistema no reconoce
  {
    const validas = new Set(CATEGORIAS_EGRESO.map(c => c.id));
    const reg = d.egresos.filter(g => !validas.has(s(g.categoria))).map(g => gasto(g, `Categoría «${s(g.categoria) || 'vacía'}»`));
    add({ id: 'categoria_desconocida', severidad: 'info', efecto: 'neutro', titulo: 'Gastos con categoría no estándar', explicacion: 'Su categoría no es ninguna de las del sistema: se cuentan como gasto del taller aunque quizá sean de un carro, y no salen en su rubro.', impactoUsd: 0, accion: 'Edita cada gasto y elige su categoría.', registros: reg });
  }

  // 15 · Ventas registradas días después
  {
    const reg = d.ventas.filter(v => diasEntre(iso(v.fecha), iso(v.created_at)) >= 2).map(v => venta(v, n(v.total_ingresos), `Con fecha ${iso(v.fecha)}, registrada el ${iso(v.created_at)} por ${s(v.creado_por) || '—'}`));
    add({ id: 'registro_tardio', severidad: 'info', efecto: 'neutro', titulo: 'Ventas registradas con días de atraso', explicacion: 'Se cargaron dos o más días después de su fecha: los reportes y cierres de esos días ya impresos no las tienen.', impactoUsd: 0, accion: 'Vuelve a sacar el reporte de esos días.', registros: reg });
  }

  // 16 · Conciliación bancaria del período: qué versión del estado se usó y qué cambió después
  const conciliacion = estadoConciliacion(d, desde, hasta);
  for (const b of conciliacion) {
    if (b.diasSinConciliar.length) add({ id: `sin_conciliar_${b.banco}`, severidad: 'medio', efecto: 'caja', titulo: `${b.nombre}: ${b.diasSinConciliar.length} día(s) con movimiento sin conciliar`, explicacion: 'Esos días hubo ventas o gastos por este banco y ningún estado de cuenta los cubre: nadie ha comprobado que el dinero entró o salió.', impactoUsd: 0, accion: 'Sube el estado de cuenta de esos días.', registros: b.diasSinConciliar.slice(0, 31).map(f => ({ tabla: 'dia', id: `${b.banco}:${f}`, fecha: f, descripcion: b.nombre, usd: 0 })) });
    if (b.ultimaCorrida && b.ultimaCorrida.pendientes > 0) add({ id: `pendientes_${b.banco}`, severidad: 'alto', efecto: 'caja', titulo: `${b.nombre}: ${b.ultimaCorrida.pendientes} pendiente(s) en la última conciliación`, explicacion: `La última conciliación (${b.ultimaCorrida.archivo || 'archivo'}, cargada ${b.ultimaCorrida.cargada}) dejó movimientos sin explicar: cobros sin registrar, montos distintos o registros que no llegaron.`, impactoUsd: 0, accion: 'Abre Conciliación bancaria y resuelve los pendientes.', registros: [] });
    if (b.cambiosDespues > 0) add({ id: `desactualizada_${b.banco}`, severidad: 'medio', efecto: 'neutro', titulo: `${b.nombre}: ${b.cambiosDespues} registro(s) cambiados después de conciliar`, explicacion: 'Ventas o gastos de este banco se crearon o modificaron después de la última conciliación del período: lo conciliado ya no es lo que hay.', impactoUsd: 0, accion: 'Vuelve a conciliar ese estado de cuenta.', registros: [] });
  }

  const orden: Record<Severidad, number> = { critico: 0, alto: 1, medio: 2, info: 3 };
  H.sort((a, b) => orden[a.severidad] - orden[b.severidad] || Math.abs(b.impactoUsd) - Math.abs(a.impactoUsd) || b.total - a.total);
  const cuenta = (f: (h: Hallazgo) => boolean) => H.filter(f).length;
  const penal = cuenta(h => h.severidad === 'critico') * 10 + cuenta(h => h.severidad === 'alto') * 5 + cuenta(h => h.severidad === 'medio') * 2;
  return {
    puntaje: Math.max(0, 100 - penal),
    resumen: { criticos: cuenta(h => h.severidad === 'critico'), altos: cuenta(h => h.severidad === 'alto'), medios: cuenta(h => h.severidad === 'medio'), info: cuenta(h => h.severidad === 'info'),
      infla: cuenta(h => h.efecto === 'infla'), reduce: cuenta(h => h.efecto === 'reduce'), caja: cuenta(h => h.efecto === 'caja') },
    hallazgos: H, conciliacion,
  };
}

function estadoConciliacion(d: Datos, desde: string, hasta: string): EstadoConciliacionBanco[] {
  // Qué días hubo movimiento por cada banco (ventas, cobros o gastos).
  const dias = new Map<string, Set<string>>();
  const marcar = (bin: string, f: string) => { const b = BANCO_DE_BIN[bin]; if (!b || f < desde || f > hasta) return; (dias.get(b) || dias.set(b, new Set()).get(b)!).add(f); };
  for (const v of d.ventas) { const bins = cobradoDe(v); for (const m of BANK_METHODS) if (n(bins[m.id]) > 0) marcar(m.id, iso(v.fecha)); }
  for (const a of d.abonos) { const mp = (a.metodos_pago || {}) as Record<string, unknown>; for (const k of Object.keys(mp)) if (n(mp[k]) > 0) marcar(k, iso(a.fecha)); }
  for (const g of d.egresos) { const mp = (g.metodos_pago || {}) as Record<string, unknown>; const ks = Object.keys(mp).filter(k => n(mp[k]) > 0); for (const k of ks.length ? ks : [s(g.metodo_pago)]) marcar(k, iso(g.fecha)); }

  return [...dias.keys()].map(banco => {
    const propias = d.corridas.filter(c => (banco === 'bnc' ? ['bnc', 'bnc_cuotas', 'cashea'] : [banco]).includes(s(c.banco)));
    const cubiertos = new Set<string>();
    for (const c of propias) for (let f = iso(c.desde); f <= iso(c.hasta); f = masDias(f, 1)) cubiertos.add(f);
    const conMov = [...(dias.get(banco) || [])].sort();
    const ult = propias[0] || null; // ya vienen de la más nueva a la más vieja
    const mismas = ult ? propias.filter(c => c.banco === ult.banco && iso(c.desde) === iso(ult.desde) && iso(c.hasta) === iso(ult.hasta)) : [];
    let cambios = 0;
    if (ult) {
      const corte = s(ult.created_at);
      const bins = Object.entries(BANCO_DE_BIN).filter(([, b]) => b === banco).map(([k]) => k);
      for (const v of d.ventas) if (iso(v.fecha) >= iso(ult.desde) && iso(v.fecha) <= iso(ult.hasta) && s(v.updated_at || v.created_at) > corte && bins.some(k => n(cobradoDe(v)[k]) > 0)) cambios++;
      for (const g of d.egresos) if (iso(g.fecha) >= iso(ult.desde) && iso(g.fecha) <= iso(ult.hasta) && s(g.updated_at || g.created_at) > corte && bins.some(k => n(((g.metodos_pago || {}) as Record<string, unknown>)[k]) > 0 || g.metodo_pago === k)) cambios++;
    }
    const res = (ult?.resumen || {}) as Fila;
    return {
      banco, nombre: NOMBRE_BANCO[banco] || banco,
      ultimaCorrida: ult ? {
        id: s(ult.id), archivo: (ult.archivo as string) || null, huella: (res.huella as string) || null,
        cargada: new Date(s(ult.created_at)).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
        usuario: (ult.usuario as string) || null, desde: iso(ult.desde), hasta: iso(ult.hasta), porcentaje: n(ult.porcentaje), pendientes: n(ult.pendientes), cuadra: !!ult.cuadra,
        versionesAnteriores: Math.max(0, mismas.length - 1),
      } : null,
      diasConMovimiento: conMov.length, diasCubiertos: conMov.filter(f => cubiertos.has(f)).length,
      diasSinConciliar: conMov.filter(f => !cubiertos.has(f)), cambiosDespues: cambios,
    };
  });
}
