import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoLeido, MovimientoBanco } from '@/lib/conciliacion/leer-estado';
import { leerCasheaGuardado } from '@/lib/pagos/cashea';
import { registrarCobro } from '@/lib/pagos/registrar-cobro';
import { planDeCuotas, type PlanCuotas } from './cuotas';

/*
 * Descontar las cuotas de Cashea desde su reporte.
 *
 * El reporte de cuotas cobradas trae, por cada pago: el día, los dólares, la
 * referencia, qué cuota(s) cubre y el # de orden de Cashea. Lo que NO trae es
 * algo que el sistema reconozca: el «# Factura» es el de la factura fiscal en
 * papel, que el sistema no guarda. Así que la primera vez que aparece una
 * orden hay que decir de qué venta es; desde ahí queda enlazada y las cuotas
 * siguientes se descuentan solas.
 *
 * Para no equivocarse:
 *   · una orden solo se enlaza sola si hay UNA venta que cuadra al céntimo
 *     (lo financiado entre 3 = la cuota) y de la fecha que toca; si hay dos o
 *     ninguna, se pregunta;
 *   · cada pago se descuenta una sola vez: su referencia queda en la nota del
 *     cobro y subir el mismo reporte otra vez no descuenta nada;
 *   · el cobro va por el camino de siempre (registrarCobro), con el día en que
 *     se pagó la cuota, y no puede pasar de lo que la venta debe;
 *   · la inicial (cuota 0) no se descuenta: ya entró el día de la venta.
 */

const CLAVE = 'cashea_enlaces';
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const masDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

interface Enlace { venta_id: string; orden: string | null; factura: string | null; por: string; el: string }
/** Por clave de orden («orden·cuota») y por factura («f:153»). */
type Enlaces = Record<string, Enlace>;

/**
 * El número de factura como lo escriben: «000000153», «0000147», «A000697».
 * Se comparan sin los ceros de delante para que «153» y «000000153» sean la misma.
 */
export function normalizarFactura(f: string | null | undefined): string {
  return String(f || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(?=\d)/, '$1');
}

export interface PagoCashea {
  ref: string; fecha: string; usd: number; ves: number; tasa: number | null;
  cuotas: number[]; aplicado: boolean;
}

export interface VentaCandidata {
  id: string; fecha: string; cliente: string; placa: string | null; total: number;
  inicial: number; falta: number; plan: PlanCuotas | null;
  /** Días entre la venta y la fecha en que, por la cuota pagada, debió comprarse. */
  desfase: number;
}

export type EstadoGrupo = 'enlazada' | 'sugerida' | 'ambigua' | 'sin_venta' | 'solo_inicial';

export interface GrupoCashea {
  clave: string; orden: string; factura: string | null;
  /** Lo que vale UNA cuota en esta orden. */
  cuotaUSD: number;
  pagos: PagoCashea[];
  nuevos: number; nuevosUSD: number;
  estado: EstadoGrupo;
  venta: VentaCandidata | null;
  /** Las que cuadran al céntimo. */
  candidatas: VentaCandidata[];
  /** Otras ventas con Cashea de esas fechas, para elegir a mano. */
  otras: VentaCandidata[];
}

export interface PreviaCashea {
  desde: string; hasta: string;
  grupos: GrupoCashea[];
  resumen: {
    pagos: number; yaAplicados: number; nuevos: number; nuevosUSD: number;
    enlazadas: number; sugeridas: number; porResolver: number; iniciales: number;
  };
}

async function leerEnlaces(db: SupabaseClient): Promise<{ id: string | null; enlaces: Enlaces }> {
  const { data } = await db.from('configuracion').select('id, valor').eq('clave', CLAVE).is('sede_id', null)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return { id: data?.id ?? null, enlaces: (data?.valor as Enlaces) || {} };
}

async function guardarEnlaces(db: SupabaseClient, id: string | null, enlaces: Enlaces) {
  const ahora = new Date().toISOString();
  const { error } = id
    ? await db.from('configuracion').update({ valor: enlaces, updated_at: ahora }).eq('id', id)
    : await db.from('configuracion').insert({ clave: CLAVE, valor: enlaces, sede_id: null, updated_at: ahora });
  if (error) throw new Error(error.message);
}

/** Las referencias de cuotas de Cashea ya descontadas (van en la nota del cobro). */
async function refsAplicadas(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db.from('abonos').select('nota').ilike('nota', 'Cashea · %ref %').limit(5000);
  const s = new Set<string>();
  for (const a of data || []) {
    const m = /ref (\S+)/.exec(String(a.nota || ''));
    if (m) s.add(m[1]);
  }
  return s;
}

const textoCuotas = (c: number[]) => {
  const n = c.filter(x => x > 0);
  if (!n.length) return 'inicial';
  return n.length === 1 ? `cuota ${n[0]}` : `cuotas ${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
};

/** Agrupa los pagos por orden y por valor de cuota: una orden puede traer dos compras. */
function agrupar(movs: MovimientoBanco[]) {
  const grupos: Array<{ clave: string; orden: string; factura: string | null; cuotaUSD: number; movs: MovimientoBanco[]; inicial: boolean }> = [];
  for (const m of movs.filter(x => x.clase === 'cuota_cashea')) {
    const orden = String(m.orden || m.referencia);
    const cs = m.cuotas?.length ? m.cuotas : [m.cuota ?? 1];
    const soloInicial = cs.every(c => c === 0);
    const porCuota = r2((m.usd || 0) / Math.max(1, cs.filter(c => c > 0).length || 1));
    const g = grupos.find(x => x.orden === orden && x.inicial === soloInicial && (soloInicial || Math.abs(x.cuotaUSD - porCuota) <= 0.02));
    if (g) g.movs.push(m);
    else grupos.push({ clave: `${orden}·${soloInicial ? 'inicial' : porCuota.toFixed(2)}`, orden, factura: m.factura || null, cuotaUSD: porCuota, movs: [m], inicial: soloInicial });
  }
  return grupos;
}

export async function prepararDescuento(db: SupabaseClient, estado: EstadoLeido, sede: string | null): Promise<PreviaCashea> {
  const grupos = agrupar(estado.movimientos);
  const [{ enlaces }, aplicadas] = await Promise.all([leerEnlaces(db), refsAplicadas(db)]);

  // Las ventas con Cashea de las fechas posibles: hasta 60 días antes del primer pago.
  const primero = estado.movimientos.map(m => m.fecha).sort()[0] || estado.desde;
  const ultimo = estado.movimientos.map(m => m.fecha).sort().reverse()[0] || estado.hasta;
  let q = db.from('ventas_dia')
    .select('id, fecha, cliente, placa, total_ingresos, con_iva, cashea, cashea_pct, inicial, financiado, saldo_pendiente, sede_id')
    .gte('fecha', masDias(primero, -60)).lte('fecha', masDias(ultimo, 3))
    .or('cashea.gt.0,financiado.gt.0,cashea_pct.not.is.null')
    .limit(2000);
  if (sede) q = q.eq('sede_id', sede);
  const { data: ventas } = await q;
  // Más las ya enlazadas, aunque sean más viejas.
  const enlazadasIds = [...new Set(Object.values(enlaces).map(e => e.venta_id))].filter(id => !(ventas || []).some(v => v.id === id));
  const { data: viejas } = enlazadasIds.length
    ? await db.from('ventas_dia').select('id, fecha, cliente, placa, total_ingresos, con_iva, cashea, cashea_pct, inicial, financiado, saldo_pendiente, sede_id').in('id', enlazadasIds)
    : { data: [] as NonNullable<typeof ventas> };
  const pool = [...(ventas || []), ...(viejas || [])];

  const { data: abs } = pool.length
    ? await db.from('abonos').select('venta_id, fecha, created_at, monto, metodo_pago').in('venta_id', pool.map(v => v.id))
    : { data: [] as Array<{ venta_id: string; fecha: string | null; created_at: string; monto: number; metodo_pago: string | null }> };
  const hoy = hoyCaracas();
  const resumenVenta = (v: (typeof pool)[number]): Omit<VentaCandidata, 'desfase'> => {
    const g = leerCasheaGuardado(v);
    const pagos = (abs || []).filter(a => a.venta_id === v.id && a.metodo_pago !== 'inicial')
      .map(a => ({ fecha: (a.fecha || a.created_at).slice(0, 10), monto: r2(a.monto) }));
    const plan = planDeCuotas({ fecha: v.fecha, faltaHoy: Math.min(r2(v.saldo_pendiente), g.financiado), pagos }, hoy);
    return {
      id: v.id, fecha: v.fecha, cliente: String(v.cliente || 'Sin nombre').trim(), placa: v.placa || null,
      total: r2(r2(v.total_ingresos) * (v.con_iva ? 1.16 : 1)), inicial: g.inicial, falta: plan?.falta ?? 0, plan,
    };
  };
  const resumenes = new Map(pool.map(v => [v.id, resumenVenta(v)]));
  const usadas = new Set(Object.values(enlaces).map(e => e.venta_id));

  // Primero las órdenes con menos dudas, para que una venta no se la quede la orden equivocada.
  const armados = grupos.map(g => {
    const pagos: PagoCashea[] = g.movs.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => ({
      ref: m.referencia, fecha: m.fecha, usd: r2(m.usd || 0), ves: r2(Math.abs(m.monto)), tasa: m.tasa ?? null,
      cuotas: m.cuotas?.length ? m.cuotas : [m.cuota ?? 1], aplicado: aplicadas.has(m.referencia),
    }));
    const pagosCuota = pagos.filter(p => p.cuotas.some(c => c > 0));
    const nuevos = pagosCuota.filter(p => !p.aplicado);
    const primerPago = pagos[0];
    // Por la cuota que se pagó y su día, cuándo debió ser la compra.
    const minCuota = Math.min(...pagos.flatMap(p => p.cuotas.filter(c => c > 0)), 99);
    const compra = masDias(primerPago.fecha, -14 * (minCuota === 99 ? 0 : minCuota));
    const conDesfase = (id: string): VentaCandidata => ({ ...resumenes.get(id)!, desfase: dias(compra, resumenes.get(id)!.fecha) });

    // Primero por la factura (exacto), luego por la orden ya enlazada.
    const enlace = (g.factura && enlaces[`f:${normalizarFactura(g.factura)}`]) || enlaces[g.clave];
    const venta = enlace && resumenes.has(enlace.venta_id) ? conDesfase(enlace.venta_id) : null;
    return { g, pagos, nuevos, compra, conDesfase, venta, primerPago };
  });

  const salida: GrupoCashea[] = [];
  const porResolver = armados.filter(a => !a.venta).map(a => {
    const maxPagoFecha = a.pagos.map(p => p.fecha).sort().reverse()[0] || a.primerPago.fecha;
    const libres = pool.filter(v => !usadas.has(v.id) && v.fecha <= masDias(maxPagoFecha, 3));
    const cuadra = (id: string) => {
      const r = resumenes.get(id)!;
      return a.g.inicial ? Math.abs(r.inicial - a.g.cuotaUSD) <= 0.03 : !!r.plan && Math.abs(r.plan.cuota - a.g.cuotaUSD) <= 0.03;
    };
    const candidatas = libres.filter(v => cuadra(v.id)).map(v => a.conDesfase(v.id))
      .filter(c => Math.abs(c.desfase) <= 21).sort((x, y) => Math.abs(x.desfase) - Math.abs(y.desfase));
    return { ...a, candidatas, maxPagoFecha };
  }).sort((x, y) => x.candidatas.length - y.candidatas.length);

  for (const a of armados.filter(x => x.venta)) {
    salida.push({
      clave: a.g.clave, orden: a.g.orden, factura: a.g.factura, cuotaUSD: a.g.cuotaUSD, pagos: a.pagos,
      nuevos: a.nuevos.length, nuevosUSD: r2(a.nuevos.reduce((s, p) => s + p.usd, 0)),
      estado: a.g.inicial ? 'solo_inicial' : 'enlazada', venta: a.venta, candidatas: [], otras: [],
    });
  }
  for (const a of porResolver) {
    const candidatas = a.candidatas.filter(c => !usadas.has(c.id));
    // Solo se sugiere cuando hay UNA que cuadra y de la fecha que toca.
    const unica = candidatas.length === 1 && Math.abs(candidatas[0].desfase) <= 10 ? candidatas[0] : null;
    if (unica && !a.g.inicial) usadas.add(unica.id);
    const otras = pool.filter(v => !usadas.has(v.id) && v.fecha <= masDias(a.maxPagoFecha, 3) && !candidatas.some(c => c.id === v.id))
      .map(v => a.conDesfase(v.id)).filter(c => Math.abs(c.desfase) <= 30)
      .sort((x, y) => Math.abs(x.desfase) - Math.abs(y.desfase)).slice(0, 12);
    salida.push({
      clave: a.g.clave, orden: a.g.orden, factura: a.g.factura, cuotaUSD: a.g.cuotaUSD, pagos: a.pagos,
      nuevos: a.nuevos.length, nuevosUSD: r2(a.nuevos.reduce((s, p) => s + p.usd, 0)),
      estado: a.g.inicial ? 'solo_inicial' : unica ? 'sugerida' : candidatas.length > 1 ? 'ambigua' : 'sin_venta',
      venta: unica, candidatas, otras,
    });
  }

  const orden: Record<EstadoGrupo, number> = { ambigua: 0, sin_venta: 1, sugerida: 2, enlazada: 3, solo_inicial: 4 };
  salida.sort((a, b) => orden[a.estado] - orden[b.estado] || b.nuevosUSD - a.nuevosUSD);
  const todos = salida.flatMap(g => g.pagos);
  const deCuota = salida.filter(g => g.estado !== 'solo_inicial');
  return {
    desde: estado.desde, hasta: estado.hasta, grupos: salida,
    resumen: {
      pagos: todos.length,
      yaAplicados: todos.filter(p => p.aplicado).length,
      nuevos: deCuota.reduce((s, g) => s + g.nuevos, 0),
      nuevosUSD: r2(deCuota.reduce((s, g) => s + g.nuevosUSD, 0)),
      enlazadas: salida.filter(g => g.estado === 'enlazada').length,
      sugeridas: salida.filter(g => g.estado === 'sugerida').length,
      porResolver: salida.filter(g => g.estado === 'ambigua' || g.estado === 'sin_venta').length,
      iniciales: salida.filter(g => g.estado === 'solo_inicial').length,
    },
  };
}

export interface ResultadoDescuento {
  aplicados: Array<{ orden: string; cliente: string; ref: string; fecha: string; usd: number; cuotas: string; quedaDebiendo: number }>;
  rechazados: Array<{ orden: string; cliente: string; ref: string; usd: number; motivo: string }>;
  enlazadas: number;
  totalUSD: number;
}

/**
 * Descuenta las cuotas nuevas. `elecciones` dice, para cada orden por enlazar,
 * de qué venta es (las sugeridas llegan marcadas desde la pantalla; las que no
 * vienen en `elecciones` y no estaban enlazadas, no se tocan).
 */
export async function aplicarDescuento(
  db: SupabaseClient, estado: EstadoLeido, sede: string | null,
  elecciones: Record<string, string | null>, usuario: string,
): Promise<ResultadoDescuento> {
  const previa = await prepararDescuento(db, estado, sede);
  const { id, enlaces } = await leerEnlaces(db);
  const salida: ResultadoDescuento = { aplicados: [], rechazados: [], enlazadas: 0, totalUSD: 0 };
  const yaEnUso = new Set(Object.values(enlaces).map(e => e.venta_id));

  for (const g of previa.grupos) {
    if (g.estado === 'solo_inicial') continue;
    let venta = g.estado === 'enlazada' ? g.venta : null;
    const elegida = elecciones[g.clave];
    if (!venta && elegida) {
      // Solo se acepta una venta que se ofreció para esta orden.
      venta = [g.venta, ...g.candidatas, ...g.otras].find(v => v?.id === elegida) || null;
      if (!venta || yaEnUso.has(venta.id)) continue;
      enlaces[g.clave] = { venta_id: venta.id, orden: g.orden, factura: g.factura, por: usuario, el: new Date().toISOString() };
      if (g.factura && normalizarFactura(g.factura)) {
        enlaces[`f:${normalizarFactura(g.factura)}`] = { venta_id: venta.id, orden: g.orden, factura: g.factura, por: usuario, el: new Date().toISOString() };
      }
      yaEnUso.add(venta.id);
      salida.enlazadas++;
    }
    if (!venta) continue;

    for (const p of g.pagos.filter(x => !x.aplicado && x.cuotas.some(c => c > 0))) {
      const r = await registrarCobro(db, venta.id, {
        cuentas: { cashea: p.usd }, tasa: p.tasa, fecha: p.fecha, usuario,
        nota: `Cashea · ${textoCuotas(p.cuotas)} · ref ${p.ref} · orden ${g.orden}${g.factura ? ` · factura ${g.factura}` : ''}`,
      });
      if (r.ok) {
        salida.aplicados.push({ orden: g.orden, cliente: venta.cliente, ref: p.ref, fecha: p.fecha, usd: p.usd, cuotas: textoCuotas(p.cuotas), quedaDebiendo: r.cobro.saldoDespues });
        salida.totalUSD = r2(salida.totalUSD + p.usd);
      } else {
        salida.rechazados.push({ orden: g.orden, cliente: venta.cliente, ref: p.ref, usd: p.usd, motivo: r.error });
      }
    }
  }
  if (salida.enlazadas) await guardarEnlaces(db, id, enlaces);
  return salida;
}

/** La factura de Cashea de cada venta enlazada: venta_id → número tal como se escribió. */
export async function facturasCashea(db: SupabaseClient): Promise<Map<string, string>> {
  const { enlaces } = await leerEnlaces(db);
  const m = new Map<string, string>();
  for (const [k, e] of Object.entries(enlaces)) if (k.startsWith('f:') && e.factura) m.set(e.venta_id, e.factura);
  return m;
}

/**
 * Anota el número de factura que se puso en Cashea para una venta. Con él, el
 * reporte de Cashea encuentra la venta sin dudas. Vacío = quitarlo.
 */
export async function enlazarFactura(
  db: SupabaseClient, ventaId: string, factura: string, usuario: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const n = normalizarFactura(factura);
  const { id, enlaces } = await leerEnlaces(db);
  const otra = n ? enlaces[`f:${n}`] : null;
  if (otra && otra.venta_id !== ventaId) {
    const { data: v } = await db.from('ventas_dia').select('cliente, fecha').eq('id', otra.venta_id).maybeSingle();
    return { ok: false, error: `La factura ${factura} ya es de otra venta${v ? ` (${v.cliente}, ${v.fecha})` : ''}.` };
  }
  // Una venta, una factura: se quita la que tuviera antes.
  for (const [k, e] of Object.entries(enlaces)) if (k.startsWith('f:') && e.venta_id === ventaId) delete enlaces[k];
  if (n) enlaces[`f:${n}`] = { venta_id: ventaId, orden: null, factura: factura.trim(), por: usuario, el: new Date().toISOString() };
  await guardarEnlaces(db, id, enlaces);
  return { ok: true };
}
