import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoLeido, MovimientoBanco } from '@/lib/conciliacion/leer-estado';
import { leerCasheaGuardado } from '@/lib/pagos/cashea';
import { registrarCobro } from '@/lib/pagos/registrar-cobro';
import { planDeCuotas, type PlanCuotas } from './cuotas';
import { cruzar, diasEntre, ganadora, pistaDeFecha, type Ancla, type FichaOrden, type VentaParaCruce } from './identificar';

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
  /** Días entre la venta y el día estimado de la compra. */
  desfase: number;
  /** Qué tan bien explica la orden (0–160). Se propone sola desde 75 y con 20 de ventaja. */
  puntaje: number;
  /** Por qué es candidata: monto, fecha, cédula… */
  razones: string[];
  /** Algo que revisar en la venta (financiado distinto, no marcada como Cashea…). */
  aviso: string | null;
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
  /** Otras ventas de esas fechas (de cualquier método de pago), para elegir a mano. */
  otras: VentaCandidata[];
  /** El día estimado de la compra y de dónde sale. */
  estimado: { fecha: string | null; margen: number; razones: string[] };
}

export interface PreviaCashea {
  desde: string; hasta: string;
  grupos: GrupoCashea[];
  /** Órdenes de las que se conoce cédula/cliente por un reporte de órdenes. */
  fichas: number;
  resumen: {
    pagos: number; yaAplicados: number; nuevos: number; nuevosUSD: number;
    enlazadas: number; sugeridas: number; porResolver: number; iniciales: number;
  };
}

const CLAVE_FICHAS = 'cashea_ordenes';

/** Lo que se sabe de cada orden por los reportes de órdenes de Cashea (cédula, cliente, total…). */
export async function leerFichasOrdenes(db: SupabaseClient): Promise<Record<string, FichaOrden>> {
  const { data } = await db.from('configuracion').select('valor').eq('clave', CLAVE_FICHAS).is('sede_id', null)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.valor as Record<string, FichaOrden>) || {};
}

/** Guarda (y completa) las fichas de un reporte de órdenes. Lo ya sabido no se borra. */
export async function guardarFichasOrdenes(db: SupabaseClient, nuevas: FichaOrden[]): Promise<{ nuevas: number; actualizadas: number; total: number }> {
  const { data } = await db.from('configuracion').select('id, valor').eq('clave', CLAVE_FICHAS).is('sede_id', null)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const actual = (data?.valor as Record<string, FichaOrden>) || {};
  let n = 0, a = 0;
  for (const f of nuevas) {
    if (!f.orden) continue;
    const antes = actual[f.orden];
    if (!antes) n++; else a++;
    const junto: FichaOrden = { ...(antes || {}), orden: f.orden };
    for (const [k, v] of Object.entries(f)) if (v != null && v !== '') (junto as unknown as Record<string, unknown>)[k] = v;
    actual[f.orden] = junto;
  }
  const ahora = new Date().toISOString();
  const { error } = data?.id
    ? await db.from('configuracion').update({ valor: actual, updated_at: ahora }).eq('id', data.id)
    : await db.from('configuracion').insert({ clave: CLAVE_FICHAS, valor: actual, sede_id: null, updated_at: ahora });
  if (error) throw new Error(error.message);
  return { nuevas: n, actualizadas: a, total: Object.keys(actual).length };
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
  const [{ enlaces }, aplicadas, fichas] = await Promise.all([leerEnlaces(db), refsAplicadas(db), leerFichasOrdenes(db)]);
  // Lo que traiga el propio reporte (cédula, cliente) completa la ficha de la orden.
  for (const m of estado.movimientos) {
    if (!m.orden || (!m.cedula && !m.cliente)) continue;
    fichas[m.orden] = { ...(fichas[m.orden] || { orden: m.orden }), cedula: fichas[m.orden]?.cedula || m.cedula || null, cliente: fichas[m.orden]?.cliente || m.cliente || null };
  }

  // Todas las ventas de las fechas posibles (no solo las marcadas como Cashea: muchas se
  // registraron como pago móvil o efectivo): hasta 75 días antes del primer pago.
  const fechasMov = estado.movimientos.map(m => m.fecha).sort();
  const primero = fechasMov[0] || estado.desde;
  const ultimo = fechasMov[fechasMov.length - 1] || estado.hasta;
  const COLS = 'id, fecha, cliente, cliente_id, placa, total_ingresos, con_iva, cashea, cashea_pct, inicial, financiado, saldo_pendiente, sede_id';
  type FilaVenta = { id: string; fecha: string; cliente: string | null; cliente_id: string | null; placa: string | null; total_ingresos: number; con_iva: boolean | null; cashea: number | null; cashea_pct: number | null; inicial: number | null; financiado: number | null; saldo_pendiente: number | null; sede_id: string | null };
  const ventas: FilaVenta[] = [];
  for (let i = 0; ; i += 1000) {
    let q = db.from('ventas_dia').select(COLS).gte('fecha', masDias(primero, -75)).lte('fecha', masDias(ultimo, 3)).order('fecha').range(i, i + 999);
    if (sede) q = q.eq('sede_id', sede);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    ventas.push(...((data || []) as FilaVenta[]));
    if (!data || data.length < 1000) break;
  }
  // Más las ya enlazadas, aunque sean más viejas.
  const enlazadasIds = [...new Set(Object.values(enlaces).map(e => e.venta_id))].filter(id => !ventas.some(v => v.id === id));
  const { data: viejas } = enlazadasIds.length
    ? await db.from('ventas_dia').select(COLS).in('id', enlazadasIds)
    : { data: [] as FilaVenta[] };
  const pool = [...ventas, ...((viejas || []) as FilaVenta[])];

  // Cédula del cliente de cada venta.
  const cedulas = new Map<string, string>();
  const idsCli = [...new Set(pool.map(v => v.cliente_id).filter(Boolean) as string[])];
  for (let i = 0; i < idsCli.length; i += 200) {
    const { data } = await db.from('clientes').select('id, cedula').in('id', idsCli.slice(i, i + 200));
    for (const c of data || []) if (c.cedula) cedulas.set(c.id, c.cedula);
  }

  const abs: Array<{ venta_id: string; fecha: string | null; created_at: string; monto: number; metodo_pago: string | null }> = [];
  const idsPool = pool.map(v => v.id);
  for (let i = 0; i < idsPool.length; i += 200) {
    const { data } = await db.from('abonos').select('venta_id, fecha, created_at, monto, metodo_pago').in('venta_id', idsPool.slice(i, i + 200));
    abs.push(...(data || []));
  }
  const hoy = hoyCaracas();
  const resumenVenta = (v: FilaVenta): Omit<VentaCandidata, 'desfase' | 'puntaje' | 'razones' | 'aviso'> & { cruce: VentaParaCruce } => {
    const g = leerCasheaGuardado(v);
    const pagos = abs.filter(a => a.venta_id === v.id && a.metodo_pago !== 'inicial')
      .map(a => ({ fecha: (a.fecha || a.created_at).slice(0, 10), monto: r2(a.monto) }));
    const plan = g.usa ? planDeCuotas({ fecha: v.fecha, faltaHoy: Math.min(r2(Number(v.saldo_pendiente)), g.financiado), pagos }, hoy) : null;
    // Cashea siempre cobra con IVA: el total que vio es la base × 1,16, se guardara como se guardara.
    const total = r2(r2(v.total_ingresos) * 1.16);
    return {
      id: v.id, fecha: v.fecha, cliente: String(v.cliente || 'Sin nombre').trim(), placa: v.placa || null,
      total, inicial: g.inicial, falta: plan?.falta ?? 0, plan,
      cruce: {
        id: v.id, fecha: v.fecha, cliente: String(v.cliente || ''), cliente_id: v.cliente_id, cedula: v.cliente_id ? cedulas.get(v.cliente_id) || null : null,
        // El total que vio Cashea lleva IVA; si la venta se guardó sin él, se prueban las dos.
        totalConIva: total, financiadoGuardado: plan?.financiado ?? (g.usa ? g.financiado : 0), cuotaGuardada: plan?.cuota ?? null, usaCashea: g.usa,
        inicialGuardada: g.inicial || g.enCuenta,
      },
    };
  };
  const resumenes = new Map(pool.map(v => [v.id, resumenVenta(v)]));
  const sinIva = new Map(pool.map(v => [v.id, r2(v.total_ingresos)]));
  const usadas = new Set(Object.values(enlaces).map(e => e.venta_id));

  // Anclas para fechar una orden por su número o su factura: lo ya enlazado, las iniciales y las fichas.
  const anclasOrden: Ancla[] = []; const anclasFactura: Ancla[] = [];
  for (const [k, e] of Object.entries(enlaces)) {
    const r = resumenes.get(e.venta_id); if (!r) continue;
    if (k.startsWith('f:')) anclasFactura.push({ n: Number(k.slice(2).replace(/\D/g, '')), fecha: r.fecha });
    else if (e.orden) anclasOrden.push({ n: Number(e.orden), fecha: r.fecha });
  }
  for (const m of estado.movimientos) if (m.orden && m.cuotas?.includes(0)) anclasOrden.push({ n: Number(m.orden), fecha: m.fecha });
  for (const f of Object.values(fichas)) {
    if (f.fecha) anclasOrden.push({ n: Number(f.orden), fecha: f.fecha });
    if (f.fecha && f.factura) anclasFactura.push({ n: Number(String(f.factura).replace(/\D/g, '')), fecha: f.fecha });
  }

  const armados = grupos.map(g => {
    const pagos: PagoCashea[] = g.movs.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => ({
      ref: m.referencia, fecha: m.fecha, usd: r2(m.usd || 0), ves: r2(Math.abs(m.monto)), tasa: m.tasa ?? null,
      cuotas: m.cuotas?.length ? m.cuotas : [m.cuota ?? 1], aplicado: aplicadas.has(m.referencia),
    }));
    const nuevos = pagos.filter(p => p.cuotas.some(c => c > 0) && !p.aplicado);
    // Los pagos de toda la orden (también los de otra compra de la misma orden) fechan la compra.
    const pagosOrden = estado.movimientos.filter(m => String(m.orden || m.referencia) === g.orden).map(m => ({ fecha: m.fecha, cuotas: m.cuotas?.length ? m.cuotas : [m.cuota ?? 1] }));
    const ficha = fichas[g.orden] || null;
    const pista = pistaDeFecha({ orden: g.orden, factura: g.factura, pagos: pagosOrden, anclasOrden: anclasOrden.filter(a => String(a.n) !== g.orden), anclasFactura, ficha });
    const inicialUSD = (() => { const m = g.movs.find(x => x.cuotas?.includes(0) && (x.cuotas?.length || 0) === 1); return m ? r2(m.usd || 0) : (ficha?.inicial ?? null); })();
    const enlace = (g.factura && enlaces[`f:${normalizarFactura(g.factura)}`]) || enlaces[g.clave];
    const cand = (id: string): VentaCandidata => {
      const r = resumenes.get(id)!;
      let c = cruzar(r.cruce, { cuotaUSD: g.cuotaUSD, inicialUSD, pista, ficha });
      // Venta guardada sin IVA: se prueba también con su total tal cual.
      if (!c.montoCuadra && Math.abs(sinIva.get(id)! - r.total) > 0.01) {
        const c2 = cruzar({ ...r.cruce, totalConIva: sinIva.get(id)!, sinIva: true }, { cuotaUSD: g.cuotaUSD, inicialUSD, pista, ficha });
        if (c2.puntaje > c.puntaje) c = c2;
      }
      const { cruce: _omit, ...resto } = r; void _omit;
      return { ...resto, desfase: pista.fecha ? diasEntre(pista.fecha, r.fecha) : 0, puntaje: c.puntaje, razones: c.razones, aviso: c.aviso };
    };
    const venta = enlace && resumenes.has(enlace.venta_id) ? cand(enlace.venta_id) : null;
    return { g, pagos, nuevos, pista, cand, venta };
  });

  const salida: GrupoCashea[] = [];
  const base = (a: (typeof armados)[number]) => ({
    clave: a.g.clave, orden: a.g.orden, factura: a.g.factura, cuotaUSD: a.g.cuotaUSD, pagos: a.pagos,
    nuevos: a.nuevos.length, nuevosUSD: r2(a.nuevos.reduce((s, p) => s + p.usd, 0)),
    estimado: { fecha: a.pista.fecha, margen: a.pista.margen, razones: a.pista.razones },
  });
  for (const a of armados.filter(x => x.venta)) salida.push({ ...base(a), estado: a.g.inicial ? 'solo_inicial' : 'enlazada', venta: a.venta, candidatas: [], otras: [] });

  // Las candidatas de cada orden sin enlazar, con su puntaje.
  const pendientes = armados.filter(a => !a.venta).map(a => ({
    a, candidatas: pool.filter(v => !usadas.has(v.id)).map(v => a.cand(v.id)).filter(c => c.puntaje > 0).sort((x, y) => y.puntaje - x.puntaje),
  }));
  // Se asigna primero la orden con la ganadora más clara, para que una venta no se la quede la equivocada.
  const asignada = new Map<string, VentaCandidata>();
  for (let vuelta = 0; vuelta < pendientes.length; vuelta++) {
    let mejor: { i: number; v: VentaCandidata; ventaja: number } | null = null;
    pendientes.forEach((p, i) => {
      if (p.a.g.inicial || asignada.has(p.a.g.clave)) return;
      const libres = p.candidatas.filter(c => !usadas.has(c.id));
      const gana = ganadora(libres);
      if (!gana) return;
      const ventaja = gana.puntaje - (libres.find(c => c.id !== gana.id)?.puntaje ?? 0);
      if (!mejor || ventaja > mejor.ventaja) mejor = { i, v: gana, ventaja };
    });
    if (!mejor) break;
    const m = mejor as { i: number; v: VentaCandidata };
    asignada.set(pendientes[m.i].a.g.clave, m.v); usadas.add(m.v.id);
  }
  for (const p of pendientes) {
    const unica = asignada.get(p.a.g.clave) || null;
    const candidatas = p.candidatas.filter(c => c.id === unica?.id || !usadas.has(c.id)).slice(0, 8);
    const pista = p.a.pista;
    const centro = pista.fecha || pista.porRitmo[0] || pista.tope;
    const otras = pool.filter(v => !usadas.has(v.id) && !candidatas.some(c => c.id === v.id) && v.fecha <= masDias(pista.tope, 1)
      && Math.abs(diasEntre(centro, v.fecha)) <= Math.max(5, Math.min(pista.margen + 2, 12)))
      .map(v => p.a.cand(v.id)).sort((x, y) => Math.abs(x.desfase) - Math.abs(y.desfase)).slice(0, 15);
    salida.push({
      ...base(p.a),
      estado: p.a.g.inicial ? 'solo_inicial' : unica ? 'sugerida' : candidatas.length ? 'ambigua' : 'sin_venta',
      venta: unica, candidatas, otras,
    });
  }

  const orden: Record<EstadoGrupo, number> = { ambigua: 0, sin_venta: 1, sugerida: 2, enlazada: 3, solo_inicial: 4 };
  salida.sort((a, b) => orden[a.estado] - orden[b.estado] || b.nuevosUSD - a.nuevosUSD);
  const todos = salida.flatMap(g => g.pagos);
  const deCuota = salida.filter(g => g.estado !== 'solo_inicial');
  return {
    desde: estado.desde, hasta: estado.hasta, grupos: salida,
    fichas: Object.keys(fichas).length,
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
