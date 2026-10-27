import { authorize } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  binsFromLegacyMetodos, binsTotalUSD, binToUSD,
  BANK_METHODS, DEPT_LABELS, type Bins, type BankBin, type DeptKey,
} from '@/lib/reporte/ventas-mapping';
import { leerCasheaGuardado } from '@/lib/pagos/cashea';
import { resumirEntradas } from '@/lib/reporte/entradas';
import { getCategoria, inferirCategoria } from '@/lib/categorias';
import { lineasDeMetodos, lineasDePago, montoConMoneda, resumenCorto } from '@/lib/pagos/desglose';
import { mecanicoDeOrden, servicioDeNotas } from '@/lib/facturas/mecanico';

// El reporte se arma con lo que hay en la base EN ESTE MOMENTO: nunca se sirve una copia vieja.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Comisión que cobra el banco por cada transacción de punto de venta (referencial, ajustable).
const COMISION_PUNTO_PCT = 0.05;
const DEPT_KEYS: DeptKey[] = ['silenciador', 'cauchera', 'alineacion', 'electronica', 'mecanica', 'frenos', 'lavado', 'repuestos'];

const n = (x: unknown) => Number(x) || 0;
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

interface VentaNorm {
  id: string;
  /** Sello del banco: 'conciliado', 'pendiente' (hay banco y aún no cuadra) o 'sin_banco' (efectivo, divisas o crédito). */
  verif: 'conciliado' | 'pendiente' | 'cambio' | 'sin_banco';
  /** Última vez que se tocó la venta: si es posterior a la conciliación, el sello ya no vale. */
  actualizado: string;
  nombre: string;
  carro: string;
  /** La placa aparte: es lo que identifica al carro, y en el texto se recortaba. */
  placa: string;
  /** Qué se le hizo: los renglones de la venta. */
  trabajo: string;
  /** Cómo pagó, cuenta por cuenta y en su moneda. */
  pago: string;
  /** Quién lo hizo; se completa después, en bloque. */
  mecanico: string;
  /** Para buscar el mecánico. */
  refs: string[];
  /** Lo que no es de ningún departamento: latonería y otros. */
  otros: number;
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
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0];
  // Fuera de admin y dueño, cada quien ve solo su sede aunque pida otra.
  const sede = auth.effectiveSede(searchParams.get('sede') || null) || '';

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
      /*
       * La venta sin departamento se clasifica aquí, con la misma regla que el
       * resto del sistema. Tres de cada cuatro ventas no traen departamento, y
       * así el «Resumen por sistema» decía $0 en silenciadores un día de
       * silenciadores. Lo que no es de ningún departamento —latonería, otros—
       * va aparte, para que la suma cuadre con los ingresos.
       */
      let otros = 0;
      const sinDept = DEPT_KEYS.every(k => deptCols[k] <= 0);
      if (sinDept && n(v.total_ingresos) > 0) {
        const texto = [
          ...(Array.isArray(v.desglose) ? v.desglose.map((d: any) => d?.descripcion) : []),
          v.notas,
        ].filter(Boolean).join(' ');
        const cat = getCategoria(v.categoria) || getCategoria(inferirCategoria(texto));
        const col = cat?.columna as DeptKey | null | undefined;
        if (col && DEPT_KEYS.includes(col)) deptCols[col] = n(v.total_ingresos);
        else otros = n(v.total_ingresos);
      }

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
      const renglones = Array.isArray(v.desglose)
        ? v.desglose.map((d: any) => {
          const c = n(d?.cantidad) || 1;
          const t = String(d?.descripcion || '').trim();
          return t ? `${c > 1 ? `${c} × ` : ''}${t}` : '';
        }).filter(Boolean)
        : [];
      const lineasPago = bankSum > 0
        ? lineasDePago(bancos, tasa)
        : lineasDeMetodos(v.metodos_pago, tasa);
      const sid = v.servicio_id || servicioDeNotas(v.notas);
      const hayBanco = BANK_METHODS.some(m => m.id !== 'efectivo_bs' && m.moneda === 'Bs' && bancos[m.id] > 0) || bancos.cashea > 0;
      return {
        id: String(v.id),
        actualizado: String(v.updated_at || v.created_at || ''),
        verif: (hayBanco ? 'pendiente' : 'sin_banco') as VentaNorm['verif'],
        nombre: v.cliente || 'Consumidor Final',
        carro: sinPlaca(carroTxt, placaV),
        placa: placaV,
        trabajo: renglones.join(' · ') || String(v.notas || '').replace(/\[ServicioID:[^\]]*\]/g, '').replace(/\|\s*Cliente:.*$/i, '').trim() || '—',
        pago: lineasPago.length
          ? lineasPago.map(l => `${l.banco ? `${l.metodo.split(' /')[0]} ${l.banco}` : l.metodo}: ${montoConMoneda(l.monto, l.moneda)}`).join('\n')
          : 'Sin cobro registrado',
        mecanico: '',
        refs: [sid, v.id].filter(Boolean),
        departamentos: deptCols,
        otros,
        total, contado, cashea, iva, inicial, financiado, porCobrar,
        bancos,
      };
    });

    // ── Quién hizo cada venta ───────────────────────────────────
    {
      const refs = [...new Set(ventas.flatMap(v => v.refs))];
      const servIds = [...new Set(ventas.map(v => v.refs[0]).filter(r => r && r !== ''))];
      const [{ data: jobs }, { data: ords }] = await Promise.all([
        refs.length ? db.from('job_assignments').select('referencia_id, empleado_nombre, es_taller').in('referencia_id', refs) : Promise.resolve({ data: [] }),
        servIds.length ? db.from('servicios').select('id, notas, seguimiento').in('id', servIds) : Promise.resolve({ data: [] }),
      ]);
      const porRef = new Map<string, any[]>();
      for (const j of (jobs || []) as any[]) {
        const l = porRef.get(j.referencia_id) || [];
        l.push(j);
        porRef.set(j.referencia_id, l);
      }
      const ordPor = new Map<string, any>(((ords || []) as any[]).map(o => [o.id, o]));
      for (const v of ventas) {
        const o = ordPor.get(v.refs[0]);
        v.mecanico = mecanicoDeOrden({
          trabajos: v.refs.flatMap(r => porRef.get(r) || []),
          notas: o?.notas ?? null,
          seguimiento: o?.seguimiento,
        }) || 'Sin asignar';
      }
    }

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
      { sistema: 'CASHEA / BNC', cantidad: countIf(v => v.cashea > 0), monto: totalesVentas.cashea },
      { sistema: 'ALINEACIÓN', cantidad: countIf(v => v.departamentos.alineacion > 0), monto: totDept.alineacion },
      { sistema: 'ELECTRÓNICA', cantidad: countIf(v => v.departamentos.electronica > 0), monto: totDept.electronica },
      { sistema: 'MECÁNICA', cantidad: countIf(v => v.departamentos.mecanica > 0), monto: totDept.mecanica },
      { sistema: 'FRENOS', cantidad: countIf(v => v.departamentos.frenos > 0), monto: totDept.frenos },
      { sistema: 'LAVADO', cantidad: countIf(v => v.departamentos.lavado > 0), monto: totDept.lavado },
      { sistema: 'REPUESTOS', cantidad: countIf(v => v.departamentos.repuestos > 0), monto: totDept.repuestos },
      { sistema: 'CAUCHERA', cantidad: countIf(v => v.departamentos.cauchera > 0), monto: totDept.cauchera },
      { sistema: 'LATONERÍA / OTROS', cantidad: countIf(v => v.otros > 0), monto: sum(v => v.otros) },
      { sistema: 'COMISIÓN PUNTO', cantidad: countIf(v => v.bancos.punto_banesco > 0 || v.bancos.punto_bancamiga > 0), monto: comisionPunto },
      { sistema: 'IMPUESTO', cantidad: countIf(v => v.iva > 0), monto: totalesVentas.iva },
    ];
    // Cashea/BNC y cuentas por cobrar dicen CÓMO se pagó lo de los departamentos,
    // no son venta aparte: se muestran, pero sumarlas contaba el dinero dos veces.
    const NO_SUMAN = new Set(['CUENTAS X COBRAR', 'CASHEA / BNC']);
    const sistemaTotal = r2(sistema.filter(x => !NO_SUMAN.has(x.sistema)).reduce((s, x) => s + x.monto, 0));

    // ── S4 · Forma de pago ──────────────────────────────────────
    const creditoTotal = r2(totalesVentas.porCobrar + totalesVentas.financiado);
    const formaPago = [
      { forma: 'CASHEA / BNC', cantidad: countIf(v => v.cashea > 0), monto: totalesVentas.cashea },
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
    // Cada cuenta en SU moneda: «recibido» es lo que entró tal cual (Bs o $);
    // los equivalentes van aparte. Antes los dólares salían en la columna «Bs».
    const metodoPago = BANK_METHODS
      .map(m => {
        const nativo = totBancos[m.id];
        const usd = binToUSD(m.id, nativo, tasa);
        return {
          metodo: m.short,
          moneda: m.moneda,
          cantidad: countIf(v => v.bancos[m.id] > 0),
          recibido: nativo,
          montoBs: m.moneda === 'Bs' ? nativo : r2(usd * tasa),
          tasa,
          montoUsd: usd,
        };
      })
      .filter(m => m.cantidad > 0 || m.recibido > 0);
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
    // El pago de cada carro: su venta (sea del día que sea) dice si ya pagó,
    // si Cashea lo financia o cuánto debe todavía.
    const ventaDeOrden = new Map<string, any>();
    if (segIds.length) {
      const { data: vs } = await db.from('ventas_dia')
        .select('servicio_id, saldo_pendiente, estado, cashea, cashea_pct, financiado, fecha, fecha_pago')
        .in('servicio_id', segIds);
      for (const v of (vs || [])) ventaDeOrden.set(v.servicio_id, v);
    }
    const pagoDe = (s: any): string => {
      const v = ventaDeOrden.get(s.id);
      const cerrada = ['completada', 'completado', 'finalizado', 'finalizada'].includes(String(s.estado));
      if (!v) {
        if (String(s.estado).startsWith('cancel')) return '—';
        return cerrada ? 'Sin cobro registrado' : 'Cobra al entregar';
      }
      const saldo = n(v.saldo_pendiente);
      if (saldo <= 0.009) {
        const f = v.fecha_pago && v.fecha_pago !== v.fecha
          ? ` el ${String(v.fecha_pago).split('-').reverse().slice(0, 2).join('/')}` : '';
        return `Pagado${f}`;
      }
      const cashea = n(v.cashea) > 0 || v.cashea_pct != null;
      return cashea ? `Cashea/BNC: pendiente $${saldo.toFixed(2)}` : `Debe $${saldo.toFixed(2)}`;
    };
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
        pago: pagoDe(s),
      };
    });

    // ── Cobros de ventas de otros días (abonos) ─────────────────
    //
    // Una venta del 21 cobrada el 25 es dinero que entró el 25. La venta
    // conserva su día; el cobro cuenta en el suyo, en sus cuentas.
    // La inicial se cobró el día de la venta y ya está en sus cuentas: no es un cobro de otro día.
    const abQ = db.from('abonos').select('*').eq('fecha', fecha).neq('metodo_pago', 'inicial')
      .order('created_at', { ascending: true });
    const { data: abRaw } = await applySede(abQ as any);
    const ventasDeAbonos = new Map<string, any>();
    const idsAb = [...new Set((abRaw || []).map((a: any) => a.venta_id).filter(Boolean))] as string[];
    if (idsAb.length) {
      const { data: vs } = await db.from('ventas_dia')
        .select('id, fecha, cliente, placa, vehiculo_info, notas, desglose, total_ingresos').in('id', idsAb);
      for (const v of (vs || [])) ventasDeAbonos.set(v.id, v);
    }
    const totCobros = Object.fromEntries(BANK_METHODS.map(m => [m.id, 0])) as unknown as Bins;
    const cobros = (abRaw || []).map((a: any) => {
      const v = ventasDeAbonos.get(a.venta_id) || {};
      const t = n(a.tasa_cambio) || tasa;
      const cuentas = a.metodos_pago && typeof a.metodos_pago === 'object' ? a.metodos_pago : null;
      const lineas = cuentas ? lineasDeMetodos(cuentas, t) : [];
      if (cuentas) for (const m of BANK_METHODS) totCobros[m.id] = r2(totCobros[m.id] + n(cuentas[m.id]));
      const placaV = extraerPlaca(v.placa, v.vehiculo_info, v.notas);
      return {
        cliente: v.cliente || 'Cliente',
        carro: sinPlaca(extraerVehiculo(v.notas, v.desglose, v.vehiculo_info, v.placa), placaV),
        placa: placaV,
        fechaVenta: v.fecha ? String(v.fecha).split('-').reverse().join('/') : '—',
        monto: n(a.monto),
        pago: lineas.length
          ? lineas.map(l => `${l.banco ? `${l.metodo.split(' /')[0]} ${l.banco}` : l.metodo}: ${montoConMoneda(l.monto, l.moneda)}`).join('\n')
          : (a.metodo_pago || 'Sin cuenta registrada'),
        saldoDespues: n(a.saldo_despues),
        tipo: n(a.saldo_despues) <= 0.009 ? 'Pago completo' : 'Abono',
      };
    });
    const cobrosTotal = r2(cobros.reduce((s2: number, c: any) => s2 + c.monto, 0));

    // ── S12 · Resumen de bancos (entradas del día) ──────────────
    // Todo lo que entró a cada banco ese día: lo de las ventas del día más lo
    // cobrado de ventas anteriores. Lo de Cashea se liquida en el BNC.
    // Cada cobro con la tasa de su propio día; las ventas con la del reporte.
    const entradas = resumirEntradas([
      ...ventas.map(v => ({ bins: v.bancos, tasa })),
      ...(abRaw || []).map((a: any) => ({
        bins: Object.fromEntries(BANK_METHODS.map(m => [m.id, n(a.metodos_pago?.[m.id])])) as unknown as Bins,
        tasa: n(a.tasa_cambio) || tasa,
      })),
    ], tasa);
    const cta = (id: BankBin) => entradas.cuentas.find(c => c.id === id)!;
    const fila = (banco: string, ids: BankBin[]) => {
      const cs = ids.map(cta);
      return {
        banco, moneda: cs[0].moneda,
        recibido: r2(cs.reduce((s2, c) => s2 + c.recibido, 0)),
        bs: r2(cs.reduce((s2, c) => s2 + c.bs, 0)),
        usd: r2(cs.reduce((s2, c) => s2 + c.usd, 0)),
      };
    };
    // Bolívares y dólares nunca en la misma fila: el BNC va partido en lo que
    // entró en Bs (pago móvil / transferencia) y lo de Cashea (en $).
    const bancos = [
      fila('BANESCO (PM / transf. / punto)', ['pago_movil_banesco', 'punto_banesco']),
      fila('BNC (PM / transferencia)', ['bnc']),
      fila('BNC · Cashea', ['cashea']),
      fila('BANCA AMIGA', ['punto_bancamiga']),
      fila('EXTERIOR', ['pago_movil_exterior']),
      fila('EFECTIVO BS', ['efectivo_bs']),
      fila('DIVISAS EFECTIVO', ['dolares']),
      fila('ZELLE', ['zelle']),
      fila('BINANCE', ['binance']),
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
      // Bolívares: lo que salió de cada cuenta en Bs es exacto; lo demás se pasa con la tasa del PROPIO gasto (no la del día del reporte).
      const tasaGasto = n(e.tasa_cambio) || tasa;
      const bsExactos = !debe && lineas.length
        ? r2(lineas.reduce((s: number, l: any) => s + (l.moneda === 'Bs' ? n(l.monto) : n(l.monto) * tasaGasto), 0))
        : null;
      return {
        concepto: (detalle || e.notas || e.categoria || e.cliente || 'Gasto').toString().slice(0, 120),
        proveedor: e.proveedor || e.cliente || '',
        placa: String(e.placa || '').toUpperCase(),
        cuenta: lineas.length ? resumenCorto(lineas) : (debe ? 'Por pagar' : 'Sin cuenta'),
        usd,
        bs: bsExactos ?? r2(usd * tasaGasto),
        id: String(e.id),
        verif: (lineas.some((l: any) => l.moneda === 'Bs') ? 'pendiente' : 'sin_banco') as 'conciliado' | 'pendiente' | 'cambio' | 'sin_banco',
        cuentas: lineas.map((l: any) => String(l.cuenta)),
        actualizado: String(e.updated_at || e.created_at || ''),
      };
    });
    const gastosTotal = { usd: r2(gastos.reduce((s: number, g: any) => s + g.usd, 0)), bs: r2(gastos.reduce((s: number, g: any) => s + g.bs, 0)) };

    // ── Conciliación bancaria: ¿esto que dice el reporte lo confirmó el banco? ──────────
    // Se toma la última conciliación de cada banco que cubre este día. Lo que se tocó DESPUÉS
    // de conciliar no conserva el sello: hay que volver a conciliar para que cuadre.
    const NOMBRE_BANCO: Record<string, string> = { banesco: 'Banesco', bnc: 'BNC', bnc_cuotas: 'BNC cuotas', exterior: 'Banco Exterior', cashea: 'Cashea' };
    const COBERTURA: Record<string, string[]> = { pago_movil_banesco: ['banesco'], punto_banesco: ['banesco'], bnc: ['bnc', 'bnc_cuotas'], cashea: ['bnc', 'bnc_cuotas', 'cashea'], pago_movil_exterior: ['exterior'] };
    let conciliacion: any = { estado: 'sin_banco', bancos: [] };
    try {
      let cq = db.from('conciliacion_corridas').select('banco, desde, hasta, archivo, usuario, cuadra, porcentaje, pendientes, en_juego, created_at, resumen')
        .lte('desde', fecha).gte('hasta', fecha).order('created_at', { ascending: false }).limit(40);
      if (sede) cq = cq.or(`sede_id.is.null,sede_id.eq.${sede}`);
      const { data: corridas } = await cq;
      const ultimaPorBanco = new Map<string, any>();
      for (const c of corridas || []) if (!ultimaPorBanco.has(c.banco)) ultimaPorBanco.set(c.banco, c);

      const confirmados = new Set<string>();
      for (const c of ultimaPorBanco.values()) for (const id of (c.resumen?.ids || [])) confirmados.add(`${c.banco}|${id}`);
      const idsDe = (bancos: string[], clave: string) => bancos.some(b => confirmados.has(`${b}|${clave}`));
      const enBanco = (cuentas: string[]) => [...new Set(cuentas.flatMap(c => COBERTURA[c] || []))];
      const corridaDe = (cuentas: string[]) => enBanco(cuentas).map(b => ultimaPorBanco.get(b)).filter(Boolean)
        .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];

      const sello = (clave: string, cuentas: string[], actualizado: string, actual: string) => {
        if (actual === 'sin_banco') return 'sin_banco';
        const bancosAplican = enBanco(cuentas);
        if (!idsDe(bancosAplican, clave)) return 'pendiente';
        const c = corridaDe(cuentas);
        return c && actualizado && actualizado > c.created_at ? 'cambio' : 'conciliado';
      };
      for (const v of ventas) {
        const cuentas = BANK_METHODS.filter(m => v.bancos[m.id] > 0).map(m => m.id);
        (v as any).verif = sello(`ventas_dia:${v.id}`, cuentas, v.actualizado, v.verif);
      }
      for (const g of gastos as any[]) g.verif = sello(`egresos:${g.id}`, g.cuentas || [], g.actualizado, g.verif);

      // ¿Falta conciliar algún banco que sí se usó ese día?
      const cuentasUsadas = new Set<string>([
        ...ventas.flatMap(v => BANK_METHODS.filter(m => v.bancos[m.id] > 0).map(m => m.id)),
        ...(gastos as any[]).flatMap(g => g.cuentas || []),
      ]);
      const sinConciliar = [...new Set([...cuentasUsadas].flatMap(c => (COBERTURA[c] ? [COBERTURA[c][0]] : [])))]
        .filter(b => !COBERTURA[b === 'banesco' ? 'pago_movil_banesco' : b === 'exterior' ? 'pago_movil_exterior' : 'bnc'].some(x => ultimaPorBanco.has(x)));

      const cambioDespues = (c: any) => [...ventas.filter(v => v.verif !== 'sin_banco').map(v => v.actualizado), ...(gastos as any[]).filter(g => g.verif !== 'sin_banco').map(g => g.actualizado)]
        .some(t => t && t > c.created_at);
      const bancos = [...ultimaPorBanco.values()].map((c: any) => ({
        banco: c.banco, nombre: NOMBRE_BANCO[c.banco] || c.banco,
        periodo: [c.desde, c.hasta].map((d: string) => String(d).slice(0, 10).split('-').reverse().join('/')).join(' al '),
        porcentaje: n(c.porcentaje), pendientes: n(c.pendientes), cuadra: !!c.cuadra, enJuego: n(c.en_juego),
        usuario: c.usuario || '', archivo: c.archivo || '',
        creada: new Date(c.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }),
        desactualizada: cambioDespues(c),
        pendientesDetalle: (c.resumen?.pendientesDetalle || []).filter((p: any) => String(p.fecha).slice(0, 10) === fecha).slice(0, 8),
      }));
      const hayBancoUsado = cuentasUsadas.size > 0;
      // Lo que entró de verdad a los bancos ese día (BNC y Cashea son el mismo dinero: se cuenta una vez).
      const filasEntrada: any[] = [];
      const yaBnc = ultimaPorBanco.has('bnc') || ultimaPorBanco.has('bnc_cuotas');
      for (const c of ultimaPorBanco.values()) {
        if (c.banco === 'cashea' && yaBnc) continue;
        const e = c.resumen?.entradasPorDia?.[fecha];
        if (!e) continue;
        const usdBanco = c.resumen?.moneda === 'USD';
        filasEntrada.push({
          banco: NOMBRE_BANCO[c.banco] || c.banco, moneda: usdBanco ? 'USD' : 'Bs',
          total: n(e.total), enSistema: n(e.enSistema), deVentasAnteriores: n(e.deVentasAnteriores),
          justificado: n(e.justificado), sinRegistrar: n(e.sinRegistrar), otraCuenta: n(e.otraCuenta),
          usd: usdBanco ? n(e.total) : (tasa > 0 ? r2(n(e.total) / tasa) : 0),
        });
      }
      const entradasBanco = filasEntrada.length ? {
        filas: filasEntrada,
        totalUsd: r2(filasEntrada.reduce((s, f) => s + f.usd, 0)),
        totalBs: r2(filasEntrada.filter(f => f.moneda === 'Bs').reduce((s, f) => s + f.total, 0)),
        deVentasAnterioresUsd: r2(filasEntrada.reduce((s, f) => s + (f.moneda === 'USD' ? f.deVentasAnteriores : (tasa > 0 ? f.deVentasAnteriores / tasa : 0)), 0)),
        sinRegistrarUsd: r2(filasEntrada.reduce((s, f) => s + (f.moneda === 'USD' ? f.sinRegistrar : (tasa > 0 ? f.sinRegistrar / tasa : 0)), 0)),
      } : null;
      conciliacion = {
        entradasBanco,
        estado: !bancos.length ? (hayBancoUsado ? 'sin_conciliar' : 'sin_banco')
          : bancos.some(b => b.desactualizada) ? 'desactualizada'
            : bancos.every(b => b.cuadra) && !sinConciliar.length ? 'conciliado' : 'parcial',
        bancos,
        sinConciliar: sinConciliar.map(b => NOMBRE_BANCO[b] || b),
        // Las conciliaciones hechas antes de esta versión no guardaron qué registros confirmaron: hay que repetirlas una vez.
        nota: [...ultimaPorBanco.values()].some((c: any) => !Array.isArray(c.resumen?.ids))
          ? 'Hay conciliaciones anteriores a esta versión: vuelve a subir su estado de cuenta una vez para ver el sello de cada venta y gasto.' : '',
      };
    } catch (e) {
      console.error('Reporte diario: no se pudo leer la conciliación', e);
    }
    // ── ¿El mismo pago registrado dos veces? (a mano y desde la conciliación, por ejemplo) ───────────
    // Mismo cliente y lo recibido igual (±1 %): suma doble al ingreso del día, y es lo primero que hay que mirar.
    const sinT = (t: string) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const recibido = (v: VentaNorm) => binsTotalUSD(v.bancos, tasa);
    const duplicados: Array<{ cliente: string; recibidoUsd: number; veces: number }> = [];
    for (let i = 0; i < ventas.length; i++) {
      const a = ventas[i]; const ra = recibido(a);
      if (ra <= 0 || sinT(a.nombre) === 'consumidor final') continue;
      for (let j = i + 1; j < ventas.length; j++) {
        const b = ventas[j]; const rb = recibido(b);
        if (sinT(a.nombre) === sinT(b.nombre) && rb > 0 && Math.abs(ra - rb) <= Math.max(0.5, ra * 0.01)) {
          (a as any).duplicada = true; (b as any).duplicada = true;
          if (!duplicados.some(d => sinT(d.cliente) === sinT(a.nombre) && Math.abs(d.recibidoUsd - ra) < 1)) duplicados.push({ cliente: a.nombre, recibidoUsd: r2(ra), veces: 2 });
        }
      }
    }
    const ventasOut = ventas.map(({ refs: _r, actualizado: _a, ...v }) => v);

    // ── Respuesta ───────────────────────────────────────────────
    const fechaLabel = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-VE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return NextResponse.json({
      fecha,
      fechaLabel,
      tasa,
      deptLabels: DEPT_LABELS,
      ventas: ventasOut,
      duplicados,
      conciliacion,
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
      cobros, cobrosTotal,
      bancos, entradas,
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
