import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  binsFromLegacyMetodos, binsTotalUSD, binToUSD,
  BANK_METHODS, DEPT_LABELS, type Bins, type BankBin, type DeptKey,
} from '@/lib/reporte/ventas-mapping';
import { leerCasheaGuardado } from '@/lib/pagos/cashea';
import { lineasDeMetodos, resumenCorto } from '@/lib/pagos/desglose';
import { mecanicoDeOrden } from '@/lib/facturas/mecanico';

// Comisión que cobra el banco por cada transacción de punto de venta (referencial, ajustable).
const COMISION_PUNTO_PCT = 0.05;
const DEPT_KEYS: DeptKey[] = ['silenciador', 'cauchera', 'alineacion', 'electronica', 'mecanica', 'frenos', 'lavado', 'repuestos'];

const n = (x: unknown) => Number(x) || 0;
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

interface VentaNorm {
  nombre: string;
  carro: string;
  /** La placa aparte: es lo que identifica al carro, y en el texto se recortaba. */
  placa: string;
  departamentos: Record<DeptKey, number>;
  total: number;
  contado: number;
  cashea: number;
  iva: number;
  inicial: number;
  financiado: number;
  porCobrar: number;
  bancos: Bins;
}

/**
 * El vehículo de la venta, para la columna CARRO del reporte.
 *
 * Se mira primero la COLUMNA y solo después se rasca el texto de las notas.
 * Antes iba al revés —solo notas— y una venta con su `vehiculo_info` y su
 * placa bien guardados salía con lo que hubiera escrito alguien en la nota, o
 * en blanco. El último recurso es la primera línea del desglose, que no es el
 * carro sino el trabajo: se deja porque en las filas viejas no hay nada mejor.
 */
/** La placa de una fila: la columna, o la que venga escrita en el texto. */
function extraerPlaca(placa?: string | null, ...textos: Array<string | null | undefined>): string {
  const directa = String(placa || '').trim().toUpperCase();
  if (directa) return directa;
  const m = textos.join(' ').toUpperCase()
    .match(/\b([A-Z]{2,3}\d{2,3}[A-Z]{1,3}|[A-Z]\d{2}[A-Z]\d{2}[A-Z]?)\b/);
  return m ? m[1] : '';
}

/** El carro sin la placa, para cuando la placa va en su propia columna. */
function sinPlaca(carro: string, placa: string): string {
  if (!placa) return carro;
  return carro.replace(new RegExp(`\\(?\\b${placa}\\b\\)?`, 'i'), '').replace(/\s+/g, ' ').trim();
}

function extraerVehiculo(
  notas: string | null,
  desglose: unknown,
  vehiculoInfo?: string | null,
  placa?: string | null,
): string {
  const info = String(vehiculoInfo || '').trim();
  const pl = String(placa || '').trim().toUpperCase();
  if (info) {
    // La placa no se repite si ya viene dentro del texto del vehículo.
    const yaTiene = pl && info.toUpperCase().replace(/[^A-Z0-9]/g, '')
      .includes(pl.replace(/[^A-Z0-9]/g, ''));
    return [info, (pl && !yaTiene) ? pl : ''].filter(Boolean).join(' ');
  }
  if (pl) return pl;

  const m = (notas || '').match(/Veh[ií]culo:\s*([^|[\]]+)/i);
  if (m) return m[1].trim();
  if (Array.isArray(desglose) && desglose[0]?.descripcion) return String(desglose[0].descripcion);
  return '';
}

// Resuelve la tasa BCV EXACTA que se usaba en la fecha dada (nunca la de hoy para un día pasado).
// Prioridad: (1) tasa registrada en las ventas del día; (2) tasa registrada ese mismo día en
// cualquier sede/tabla, o la más reciente ANTERIOR o igual (on-or-before); (3) la primera posterior.
async function resolveTasaDelDia(db: any, fecha: string, ventasRows: any[]): Promise<number> {
  // 1) Tasa de alguna venta del día ya cargada (filtrada por sede).
  for (const v of ventasRows) { const t = n(v.tasa_cambio) || n(v.tasa); if (t > 0) return t; }

  // 2) Última tasa positiva registrada en/antes de la fecha (global, BCV es igual para todas las sedes).
  const [vd, cc, fa, ab] = await Promise.all([
    db.from('ventas_dia').select('fecha, tasa_cambio, tasa').lte('fecha', fecha).gt('tasa_cambio', 0).order('fecha', { ascending: false }).limit(1).maybeSingle(),
    db.from('cierres_caja').select('fecha, tasa_bcv').lte('fecha', fecha).gt('tasa_bcv', 0).order('fecha', { ascending: false }).limit(1).maybeSingle(),
    db.from('facturas').select('fecha_emision, tasa_cambio').lte('fecha_emision', fecha).gt('tasa_cambio', 0).order('fecha_emision', { ascending: false }).limit(1).maybeSingle(),
    db.from('abonos').select('created_at, tasa_cambio').lte('created_at', `${fecha}T23:59:59`).gt('tasa_cambio', 0).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const cands: { fecha: string; tasa: number }[] = [];
  if (vd.data) cands.push({ fecha: vd.data.fecha, tasa: n(vd.data.tasa_cambio) || n(vd.data.tasa) });
  if (cc.data) cands.push({ fecha: cc.data.fecha, tasa: n(cc.data.tasa_bcv) });
  if (fa.data) cands.push({ fecha: fa.data.fecha_emision, tasa: n(fa.data.tasa_cambio) });
  if (ab.data) cands.push({ fecha: String(ab.data.created_at).slice(0, 10), tasa: n(ab.data.tasa_cambio) });
  if (cands.length) {
    cands.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)); // fecha más cercana primero
    return cands[0].tasa;
  }

  // 3) Si no hay ninguna en/antes, la primera posterior (histórico incompleto).
  const post = await db.from('ventas_dia').select('tasa_cambio, tasa').gt('fecha', fecha).gt('tasa_cambio', 0).order('fecha', { ascending: true }).limit(1).maybeSingle();
  if (post.data) return n(post.data.tasa_cambio) || n(post.data.tasa);
  return 0;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0];
  const sede = searchParams.get('sede') || '';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Faltan credenciales de base de datos' }, { status: 500 });
  }
  const db = createClient(supabaseUrl, supabaseKey);
  const applySede = <T extends { eq: (c: string, v: string) => T }>(q: T): T => (sede ? q.eq('sede_id', sede) : q);

  try {
    // ── Datos base del día ──────────────────────────────────────
    const ventasQ = db.from('ventas_dia').select('*').eq('fecha', fecha).order('created_at', { ascending: true });
    const { data: ventasRaw } = await applySede(ventasQ as any);
    const rows: any[] = ventasRaw || [];

    // Tasa BCV EXACTA de la fecha (histórica, nunca la de hoy para un día pasado)
    const tasa = await resolveTasaDelDia(db, fecha, rows);

    // ── Normalizar cada venta (columnas o fallback a metodos_pago) ──
    const ventas: VentaNorm[] = rows.map(v => {
      const deptCols: Record<DeptKey, number> = {
        silenciador: n(v.silenciador), cauchera: n(v.cauchera), alineacion: n(v.alineacion),
        electronica: n(v.electronica), mecanica: n(v.mecanica), frenos: n(v.frenos),
        lavado: n(v.lavado), repuestos: n(v.repuestos),
      };

      const bankCols: Bins = {
        pago_movil_banesco: n(v.pago_movil_banesco), bnc: n(v.bnc), punto_banesco: n(v.punto_banesco),
        punto_bancamiga: n(v.punto_bancamiga), pago_movil_exterior: n(v.pago_movil_exterior),
        dolares: n(v.dolares), binance: n(v.binance), zelle: n(v.zelle),
        efectivo_bs: n(v.efectivo_bs), cashea: n(v.cashea),
      };
      const bankSum = (Object.values(bankCols) as number[]).reduce((a, b) => a + b, 0);
      const bancos: Bins = bankSum > 0 ? bankCols : binsFromLegacyMetodos(v.metodos_pago);

      const recibidoUSD = binsTotalUSD(bancos, tasa);
      const cashea = r2(bancos.cashea);
      const contado = Math.max(0, r2(recibidoUSD - cashea));
      const saldo = n(v.saldo_pendiente);
      const total = n(v.total_ingresos);
      const iva = v.con_iva ? r2(total * 0.16) : n(v.iva);

      // ── Cashea: la inicial es lo cobrado, el resto es crédito ──────────────
      //
      // Una venta guardada con `cashea_pct` ya trae el reparto hecho: en la
      // cuenta de Cashea solo está la inicial. Se lee tal cual.
      //
      // Las filas viejas (sin porcentaje) tienen el importe COMPLETO metido en
      // la cuenta y la inicial en cero, así que su cifra mezcla cobro y crédito.
      // No se reparte a posteriori —inventar un porcentaje sería peor—: se
      // conserva el cálculo de siempre para no cambiarle el significado a lo
      // que ya estaba reportado.
      const cx = leerCasheaGuardado({
        cashea, cashea_pct: v.cashea_pct,
        inicial: v.inicial, financiado: v.financiado, saldo_pendiente: v.saldo_pendiente,
      });
      const esCashea = cx.usa;
      const inicial = !esCashea ? n(v.inicial) : cx.legado ? contado : cx.inicial;
      const financiado = !esCashea ? n(v.financiado) : cx.legado ? saldo : cx.financiado;
      const porCobrar = !esCashea ? (saldo || n(v.por_cobrar)) : n(v.por_cobrar);

      const carroTxt = extraerVehiculo(v.notas, v.desglose, v.vehiculo_info, v.placa);
      const placaV = extraerPlaca(v.placa, v.vehiculo_info, v.notas);
      return {
        nombre: v.cliente || 'Consumidor Final',
        carro: sinPlaca(carroTxt, placaV),
        placa: placaV,
        departamentos: deptCols,
        total, contado, cashea, iva, inicial, financiado, porCobrar,
        bancos,
      };
    });

    // ── Totales de la tabla principal ───────────────────────────
    const totDept = DEPT_KEYS.reduce((acc, k) => { acc[k] = r2(ventas.reduce((s, v) => s + v.departamentos[k], 0)); return acc; }, {} as Record<DeptKey, number>);
    const totBancos = BANK_METHODS.reduce((acc, m) => { acc[m.id] = r2(ventas.reduce((s, v) => s + v.bancos[m.id], 0)); return acc; }, {} as Record<BankBin, number>);
    const sum = (f: (v: VentaNorm) => number) => r2(ventas.reduce((s, v) => s + f(v), 0));
    const totalesVentas = {
      total: sum(v => v.total), contado: sum(v => v.contado), cashea: sum(v => v.cashea),
      iva: sum(v => v.iva), inicial: sum(v => v.inicial), financiado: sum(v => v.financiado),
      porCobrar: sum(v => v.porCobrar), departamentos: totDept, bancos: totBancos,
    };

    // ── S2 · Cuentas por cobrar (saldos abiertos) ───────────────
    const pcQ = db.from('ventas_dia').select('cliente, notas, desglose, saldo_pendiente, total_ingresos, estado, por_cobrar_detalle, placa, vehiculo_info')
      .gt('saldo_pendiente', 0).order('created_at', { ascending: false }).limit(100);
    const { data: pcRaw } = await applySede(pcQ as any);
    const porCobrar = (pcRaw || []).map((v: any) => ({
      nombre: v.cliente || 'Consumidor Final',
      carro: sinPlaca(extraerVehiculo(v.notas, v.desglose, v.vehiculo_info, v.placa),
        extraerPlaca(v.placa, v.vehiculo_info, v.notas)),
      placa: extraerPlaca(v.placa, v.vehiculo_info, v.notas),
      monto: n(v.saldo_pendiente),
      observacion: Array.isArray(v.por_cobrar_detalle) && v.por_cobrar_detalle[0]?.observacion
        ? String(v.por_cobrar_detalle[0].observacion)
        : (v.estado === 'pendiente' ? 'Pendiente por pagar' : ''),
    }));
    const porCobrarTotal = r2(porCobrar.reduce((s: number, x: any) => s + x.monto, 0));

    // ── S3 · Resumen de "SISTEMA" (departamentos + extras) ──────
    const countIf = (f: (v: VentaNorm) => boolean) => ventas.filter(f).length;
    const puntosUSD = binToUSD('punto_banesco', totBancos.punto_banesco, tasa) + binToUSD('punto_bancamiga', totBancos.punto_bancamiga, tasa);
    const comisionPunto = r2(puntosUSD * COMISION_PUNTO_PCT);
    const sistema = [
      { sistema: 'CUENTAS X COBRAR', cantidad: countIf(v => v.porCobrar > 0), monto: totalesVentas.porCobrar },
      { sistema: 'SILENCIADORES', cantidad: countIf(v => v.departamentos.silenciador > 0), monto: totDept.silenciador },
      { sistema: 'CASHEA', cantidad: countIf(v => v.cashea > 0), monto: totalesVentas.cashea },
      { sistema: 'ALINEACIÓN', cantidad: countIf(v => v.departamentos.alineacion > 0), monto: totDept.alineacion },
      { sistema: 'ELECTRÓNICA', cantidad: countIf(v => v.departamentos.electronica > 0), monto: totDept.electronica },
      { sistema: 'MECÁNICA', cantidad: countIf(v => v.departamentos.mecanica > 0), monto: totDept.mecanica },
      { sistema: 'FRENOS', cantidad: countIf(v => v.departamentos.frenos > 0), monto: totDept.frenos },
      { sistema: 'LAVADO', cantidad: countIf(v => v.departamentos.lavado > 0), monto: totDept.lavado },
      { sistema: 'COMISIÓN PUNTO', cantidad: countIf(v => v.bancos.punto_banesco > 0 || v.bancos.punto_bancamiga > 0), monto: comisionPunto },
      { sistema: 'IMPUESTO', cantidad: countIf(v => v.iva > 0), monto: totalesVentas.iva },
    ];
    const sistemaTotal = r2(sistema.reduce((s, x) => s + x.monto, 0));

    // ── S4 · Forma de pago ──────────────────────────────────────
    const creditoTotal = r2(totalesVentas.porCobrar + totalesVentas.financiado);
    const formaPago = [
      { forma: 'CASHEA', cantidad: countIf(v => v.cashea > 0), monto: totalesVentas.cashea },
      { forma: 'CONTADO', cantidad: countIf(v => v.contado > 0), monto: totalesVentas.contado },
      { forma: 'CRÉDITO', cantidad: countIf(v => v.porCobrar > 0 || v.financiado > 0), monto: creditoTotal },
    ];
    const formaPagoTotal = r2(formaPago.reduce((s, x) => s + x.monto, 0));

    // ── S5 · Facturas montos (base imponible + IVA) ─────────────
    const baseImponible = sum(v => (v.iva > 0 ? v.total : 0));
    const ivaTotal = totalesVentas.iva;
    const facturasMontos = { base: baseImponible, iva: ivaTotal, total: r2(baseImponible + ivaTotal) };

    // ── S6 · Caja montos ────────────────────────────────────────
    const caja = { inicial: totalesVentas.inicial, financiado: totalesVentas.financiado, total: r2(totalesVentas.inicial + totalesVentas.financiado) };

    // ── S7 · Detalle de método de pago (por banco) ──────────────
    const metodoPago = BANK_METHODS
      .filter(m => m.id !== 'cashea')
      .map(m => {
        const nativo = totBancos[m.id];
        const usd = binToUSD(m.id, nativo, tasa);
        return {
          metodo: m.short,
          moneda: m.moneda,
          cantidad: countIf(v => v.bancos[m.id] > 0),
          montoBs: m.moneda === 'Bs' ? nativo : r2(usd * tasa),
          tasa,
          montoUsd: usd,
        };
      });
    const metodoPagoTotalUsd = r2(metodoPago.reduce((s, x) => s + x.montoUsd, 0));

    // ── S8 · KPIs (métricas manuales del día) ───────────────────
    const mdQ = db.from('metricas_dia').select('*').eq('fecha', fecha).limit(1);
    const { data: mdRaw } = await applySede(mdQ as any);
    const md = (mdRaw && mdRaw[0]) || {};
    const kpiPar = (ini: number, nue: number) => ({ inicial: n(ini), nuevos: n(nue), total: n(ini) + n(nue) });
    const kpis = {
      redes: kpiPar(md.redes_inicial, md.redes_nuevos),
      app: kpiPar(md.app_inicial, md.app_nuevos),
      rcv: kpiPar(md.rcv_inicial, md.rcv_nuevos),
      cert: kpiPar(md.cert_inicial, md.cert_nuevos),
    };

    // ── S9 · Clientes en base de datos ──────────────────────────
    const clientesTotalQ = db.from('clientes').select('id', { count: 'exact', head: true });
    const { count: clientesTotal } = await applySede(clientesTotalQ as any);
    const clientesNuevosQ = db.from('clientes').select('id', { count: 'exact', head: true })
      .gte('created_at', `${fecha}T00:00:00`).lte('created_at', `${fecha}T23:59:59`);
    const { count: clientesNuevos } = await applySede(clientesNuevosQ as any);
    const clientesBD = { total: n(clientesTotal), nuevos: n(clientesNuevos) };

    // ── S10 · Control de inventario / artículos (salidas del día) ──
    const artMap = new Map<string, number>();
    for (const v of rows) {
      if (Array.isArray(v.desglose)) {
        for (const it of v.desglose) {
          const name = String(it.descripcion || '').trim();
          const cant = n(it.cantidad) || 1;
          if (name) artMap.set(name, (artMap.get(name) || 0) + cant);
        }
      }
    }
    const vsQ = db.from('ventas_silenciadores').select('modelo, cantidad')
      .gte('fecha', `${fecha}T00:00:00`).lte('fecha', `${fecha}T23:59:59`);
    const { data: vsRaw } = await applySede(vsQ as any);
    for (const s of (vsRaw || [])) {
      const name = String(s.modelo || '').trim();
      if (name) artMap.set(name, (artMap.get(name) || 0) + (n(s.cantidad) || 1));
    }
    const articulos = Array.from(artMap.entries())
      .map(([articulo, cantidad]) => ({ articulo, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // ── S11 · Carros en taller ──────────────────────────────────
    const tallerQ = db.from('servicios').select('vehiculo_info, placa, descripcion, tipo, registrado_por, estado, id')
      .in('estado', ['en_proceso', 'en_revision']).order('updated_at', { ascending: false }).limit(40);
    const { data: tallerRaw } = await applySede(tallerQ as any);
    const servIds = (tallerRaw || []).map((s: any) => s.id);
    const mecPorServicio = new Map<string, string>();
    if (servIds.length) {
      const { data: jobs } = await db.from('job_assignments').select('referencia_id, empleado_nombre')
        .in('referencia_id', servIds);
      for (const j of (jobs || [])) {
        if (j.referencia_id && j.empleado_nombre && !mecPorServicio.has(j.referencia_id)) {
          mecPorServicio.set(j.referencia_id, j.empleado_nombre);
        }
      }
    }
    const taller = (tallerRaw || []).map((s: any) => ({
      carro: s.vehiculo_info || '—',
      placa: String(s.placa || '').toUpperCase(),
      mecanico: mecPorServicio.get(s.id) || s.registrado_por || '—',
      trabajo: s.descripcion || s.tipo || '—',
    }));

    // ── S14 · Seguimiento de vehículos del día ──────────────────
    //
    // Como la hoja de seguimiento del cierre: cada carro que entró, se movió o
    // salió ese día, con su placa, su mecánico, en qué estado quedó y qué fue
    // lo último que se hizo. El reporte diario decía cuánto dinero entró, pero
    // no qué pasó en el piso.
    const diaIni = `${fecha}T04:00:00Z`;   // medianoche de Caracas (UTC-4)
    const diaFin = new Date(new Date(`${fecha}T04:00:00Z`).getTime() + 86400000).toISOString();
    const segQ = db.from('servicios')
      .select('id, fecha, hora, estado, nombre_cliente, vehiculo_info, placa, descripcion, tipo, tipo_personalizado, notas, seguimiento, created_at, updated_at, fecha_inicio, fecha_fin, costo_estimado, items')
      .or(`fecha.eq.${fecha},and(updated_at.gte.${diaIni},updated_at.lt.${diaFin})`)
      .order('created_at', { ascending: true }).limit(150);
    const { data: segRaw } = await applySede(segQ as any);
    const segIds = (segRaw || []).map((s: any) => s.id);
    const jobsPorServ = new Map<string, Array<{ empleado_nombre: string; es_taller: boolean }>>();
    if (segIds.length) {
      const { data: jobs } = await db.from('job_assignments')
        .select('referencia_id, empleado_nombre, es_taller').in('referencia_id', segIds);
      for (const j of (jobs || [])) {
        const l = jobsPorServ.get(j.referencia_id) || [];
        l.push(j);
        jobsPorServ.set(j.referencia_id, l);
      }
    }
    const horaVE = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const delDia = (iso?: string) => Boolean(iso) && String(iso) >= diaIni && String(iso) < diaFin;
    // `updated_at` solo sirve para traer candidatos: cualquier corrección de
    // datos lo mueve. Entra al reporte lo que de verdad pasó ese día —la orden
    // es del día, tiene una anotación de seguimiento ese día, o empezó o
    // terminó ese día—.
    const seMovio = (s: any) => s.fecha === fecha || delDia(s.fecha_inicio) || delDia(s.fecha_fin)
      || (Array.isArray(s.seguimiento) && s.seguimiento.some((e: any) => delDia(e?.fecha)));
    const seguimiento = (segRaw || []).filter(seMovio).map((s: any) => {
      const entradas: Array<{ fecha?: string; accion?: string }> = Array.isArray(s.seguimiento) ? s.seguimiento : [];
      const hoyMov = entradas.filter(e => delDia(e.fecha));
      const ultimo = (hoyMov.length ? hoyMov : entradas).slice(-1)[0];
      return {
        id: String(s.id).slice(0, 6).toUpperCase(),
        cliente: String(s.nombre_cliente || '').trim() || '—',
        carro: String(s.vehiculo_info || '').trim() || '—',
        placa: String(s.placa || '').trim().toUpperCase(),
        trabajo: String(s.descripcion || '').trim()
          || (s.tipo_personalizado && s.tipo_personalizado !== 'otro' ? s.tipo_personalizado : '')
          || (s.tipo && s.tipo !== 'otro' ? s.tipo : '')
          || (Array.isArray(s.items) ? s.items.map((i: any) => i?.descripcion).filter(Boolean).join(', ') : '')
          || 'Sin descripción',
        mecanico: mecanicoDeOrden({ trabajos: jobsPorServ.get(s.id), notas: s.notas, seguimiento: s.seguimiento }) || 'Sin asignar',
        estado: String(s.estado || 'pendiente'),
        entrada: s.fecha === fecha ? (s.hora ? String(s.hora).slice(0, 5) : horaVE(s.created_at)) : `desde ${String(s.fecha).split('-').reverse().slice(0, 2).join('/')}`,
        ultimo: ultimo?.accion ? `${ultimo.fecha ? horaVE(ultimo.fecha) + ' · ' : ''}${ultimo.accion}` : '—',
        movimientos: hoyMov.length,
        monto: n(s.costo_estimado),
      };
    });

    // ── S12 · Resumen de bancos (entradas del día) ──────────────
    const bancoBs = (ids: BankBin[]) => r2(ids.reduce((acc, id) => acc + totBancos[id], 0));
    const bancos = [
      { banco: 'BANESCO', bs: bancoBs(['pago_movil_banesco', 'punto_banesco']), usd: r2(binToUSD('pago_movil_banesco', totBancos.pago_movil_banesco, tasa) + binToUSD('punto_banesco', totBancos.punto_banesco, tasa)) },
      { banco: 'BNC', bs: totBancos.bnc, usd: binToUSD('bnc', totBancos.bnc, tasa) },
      { banco: 'BANCA AMIGA', bs: totBancos.punto_bancamiga, usd: binToUSD('punto_bancamiga', totBancos.punto_bancamiga, tasa) },
      { banco: 'EXTERIOR', bs: totBancos.pago_movil_exterior, usd: binToUSD('pago_movil_exterior', totBancos.pago_movil_exterior, tasa) },
      { banco: 'DIVISAS / CRIPTO', bs: r2((totBancos.dolares + totBancos.zelle + totBancos.binance) * tasa), usd: r2(totBancos.dolares + totBancos.zelle + totBancos.binance) },
    ];

    // ── S13 · Gastos del día ────────────────────────────────────
    const egQ = db.from('egresos').select('*').eq('fecha', fecha).order('created_at', { ascending: true });
    const { data: egRaw } = await applySede(egQ as any);
    const gastos = (egRaw || []).map((e: any) => {
      const detalle = Array.isArray(e.desglose) && e.desglose.length
        ? e.desglose.map((d: any) => d.descripcion).filter(Boolean).join(', ')
        : '';
      const usd = n(e.total_egresos);
      // De qué cuenta salió: el reparto guardado, o la cuenta suelta de antes.
      const reparto = e.metodos_pago && typeof e.metodos_pago === 'object'
        ? e.metodos_pago
        : (e.metodo_pago ? { [e.metodo_pago]: usd } : null);
      const lineas = lineasDeMetodos(reparto, n(e.tasa_cambio) || tasa);
      const debe = e.estado_pago === 'por_pagar' || e.estado_pago === 'parcial';
      return {
        concepto: (detalle || e.notas || e.categoria || e.cliente || 'Gasto').toString().slice(0, 120),
        proveedor: e.proveedor || e.cliente || '',
        placa: String(e.placa || '').toUpperCase(),
        cuenta: lineas.length ? resumenCorto(lineas) : (debe ? 'Por pagar' : 'Sin cuenta'),
        usd,
        bs: r2(usd * tasa),
      };
    });
    const gastosTotal = { usd: r2(gastos.reduce((s: number, g: any) => s + g.usd, 0)), bs: r2(gastos.reduce((s: number, g: any) => s + g.bs, 0)) };

    // ── Respuesta ───────────────────────────────────────────────
    const fechaLabel = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-VE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return NextResponse.json({
      fecha,
      fechaLabel,
      tasa,
      deptLabels: DEPT_LABELS,
      ventas,
      totalesVentas,
      porCobrar, porCobrarTotal,
      sistema, sistemaTotal,
      formaPago, formaPagoTotal,
      facturasMontos,
      caja,
      metodoPago, metodoPagoTotalUsd,
      kpis,
      clientesBD,
      articulos,
      taller,
      seguimiento,
      bancos,
      gastos, gastosTotal,
      // El servidor corre en UTC, asi que la hora se fija a Caracas: si no, el
      // pie de un reporte sacado a las 9 de la noche dice el dia siguiente.
      // Y los dos digitos evitan el «17/9/2026» suelto.
      generadoEn: new Date().toLocaleString('es-VE', {
        timeZone: 'America/Caracas',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      }),
    });
  } catch (err: any) {
    console.error('Error en reporte diario:', err);
    return NextResponse.json({ error: 'Error al generar el reporte diario', detalle: err?.message }, { status: 500 });
  }
}
