// ─────────────────────────────────────────────────────────────────────────────
// Motor de conciliación bancaria.
//
// Cruza cada movimiento del estado de cuenta con lo que el sistema dice que
// entró o salió por ESA cuenta, y explica cada diferencia. No inventa nada: un
// movimiento queda «conciliado» solo si el monto coincide al céntimo (o, en lo
// que el sistema lleva en dólares, a la tasa del día con tolerancia declarada).
//
// El sistema casi nunca guarda la referencia del pago, así que la llave
// principal es monto exacto + fecha. Las pasadas van de la más segura a la más
// floja y cada emparejamiento dice con qué regla se hizo:
//
//   1. Referencia y monto iguales.
//   2. Monto exacto, mismo día.
//   3. Monto exacto, hasta 3 días de diferencia (registro atrasado o fin de semana).
//   4. Monto exacto, hasta 10 días (fecha lejana: se marca para revisar).
//   5. Uno contra varios: un pago del banco = 2 o 3 registros del sistema, o al revés.
//   6. Dólares a tasa (Cashea dentro del BNC): ±1,5 % y ±3 días.
//   7. Monto casi igual (±1 Bs o ±0,5 %): DIFERENCIA, no conciliado.
//   8. Lo que sobra en el banco se busca en las demás cuentas del sistema:
//      «registrado en otro banco».
//
// Antes de cruzar, el estado se limpia: los reversos se emparejan con su
// original y salen los dos; las comisiones de un pago (misma referencia, ≤1,5 %)
// se separan como gasto bancario.
// ─────────────────────────────────────────────────────────────────────────────

import type { BankBin } from '@/lib/reporte/ventas-mapping';
import type { BancoConciliable, ClaseMovimiento, EstadoLeido, MovimientoBanco } from './leer-estado';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const TOL = 0.01;

/** Qué columnas del sistema corresponden a cada estado de cuenta. */
export const CUENTAS_DEL_BANCO: Record<BancoConciliable, BankBin[]> = {
  banesco: ['pago_movil_banesco', 'punto_banesco'],
  // La cuenta BNC del estado es la de Cashea: ahí entran las iniciales y cuotas.
  bnc: ['bnc', 'cashea'],
  exterior: ['pago_movil_exterior'],
  cashea: ['cashea'],
};

export const NOMBRE_CUENTA: Record<string, string> = {
  pago_movil_banesco: 'PM / Transf. Banesco', punto_banesco: 'Punto Banesco', bnc: 'PM / Transf. BNC',
  punto_bancamiga: 'Punto Bancamiga', pago_movil_exterior: 'PM Exterior', efectivo_bs: 'Efectivo Bs',
  dolares: 'Efectivo $', zelle: 'Zelle', binance: 'Binance', cashea: 'Cashea',
};

/** Un registro del sistema que dice que entró o salió dinero por una cuenta. */
export interface AsientoSistema {
  id: string;
  tabla: 'ventas_dia' | 'abonos' | 'egresos';
  registroId: string;
  fecha: string;
  sentido: 'ingreso' | 'egreso';
  cuenta: BankBin;
  /** En la moneda de la cuenta: Bs, o USD si la cuenta es en dólares (Cashea). */
  monto: number;
  enDolares: boolean;
  usd: number;
  tasa: number;
  concepto: string;
  detalle: string;
  placa: string | null;
  referencia: string | null;
  servicioId: string | null;
}

export type Regla =
  | 'referencia' | 'mismo_dia' | 'fecha_cercana' | 'fecha_lejana'
  | 'agrupado_banco' | 'agrupado_sistema' | 'tasa_dolar' | 'cashea_usd';

export const REGLA_TEXTO: Record<Regla, string> = {
  referencia: 'Referencia y monto',
  mismo_dia: 'Monto exacto, mismo día',
  fecha_cercana: 'Monto exacto, fecha cercana',
  fecha_lejana: 'Monto exacto, fecha lejana',
  agrupado_banco: 'Un pago cubre varios registros',
  agrupado_sistema: 'Varios pagos de un registro',
  tasa_dolar: 'Dólares a la tasa del día',
  cashea_usd: 'Cuota Cashea en dólares',
};

export interface Pareja {
  regla: Regla;
  confianza: 'alta' | 'media' | 'revisar';
  banco: MovimientoBanco[];
  sistema: AsientoSistema[];
  diferenciaDias: number;
  diferenciaMonto: number;
}

export interface Diferencia {
  banco: MovimientoBanco;
  sistema: AsientoSistema;
  diferencia: number; // banco − sistema
  diferenciaDias: number;
}

export interface EnOtraCuenta {
  banco: MovimientoBanco;
  sistema: AsientoSistema;
}

/** Venta financiada con Cashea, para casarla con sus cuotas. */
export interface VentaCashea {
  id: string;
  fecha: string;
  cliente: string;
  placa: string | null;
  total: number;
  inicial: number;
  financiado: number;
  /** Columna «cashea» de la venta: la inicial (o, en las viejas, todo). */
  casheaCol: number;
  servicioId: string | null;
  /** Cuotas de Cashea ya registradas como cobro en el sistema (USD, todas las fechas). */
  cuotasRegistradasUSD: number;
}

export interface OrdenCashea {
  orden: string;
  factura: string;
  cuotas: MovimientoBanco[];
  cuotaUSD: number;
  cobradoUSD: number;
  cobradoBs: number;
  /** La cuota más alta pagada: con la 3 pagada, se debieron cobrar 3 cuotas. */
  ultimaCuota: number;
  fechaEstimadaVenta: string;
  venta: VentaCashea | null;
  candidatos: number;
  /** Lo que según Cashea ya se cobró hasta la última cuota (cuota × número). */
  esperadoUSD: number;
  registradoUSD: number;
  estado: 'al_dia' | 'cuotas_sin_registrar' | 'venta_no_encontrada' | 'registrado_de_mas';
  nota: string;
  /** Si no se identificó la venta: las que encajan por plan y fecha (no confirmadas). */
  posibles: Array<{ fecha: string; cliente: string; placa: string | null; total: number; plan: string; metodo: string }>;
}

export interface GrupoBanco {
  clase: ClaseMovimiento;
  titulo: string;
  movimientos: MovimientoBanco[];
  total: number;
}

export interface ResultadoConciliacion {
  banco: BancoConciliable;
  estado: Omit<EstadoLeido, 'movimientos'>;
  /** Ingresos: cobros del banco ↔ ventas y cobros del sistema. */
  ingresos: {
    conciliados: Pareja[];
    diferencias: Diferencia[];
    enOtraCuenta: EnOtraCuenta[];
    sinRegistrar: Array<MovimientoBanco & { pista: string | null }>;
    noLlegaron: AsientoSistema[];
    /**
     * Iniciales de Cashea guardadas en la cuenta «Cashea / BNC» que no entraron
     * por ahí (ni en el BNC ni como «cuota 0» de Cashea): el cliente pagó la
     * inicial por otra vía y la venta no lo dice.
     */
    inicialesSinCuenta: AsientoSistema[];
    totalBanco: number;
    totalSistema: number;
  };
  /** Egresos: pagos del banco ↔ gastos del sistema. */
  egresos: {
    conciliados: Pareja[];
    diferencias: Diferencia[];
    sinRegistrar: Array<MovimientoBanco & { pista: string | null }>;
    noSalieron: AsientoSistema[];
    totalBanco: number;
    totalSistema: number;
  };
  /** Lo que el banco mueve y no es venta ni gasto del taller. */
  propiosDelBanco: GrupoBanco[];
  reversos: Array<{ original: MovimientoBanco; reverso: MovimientoBanco }>;
  /** Cashea por orden: cada compra financiada, sus cuotas y su venta en el sistema. */
  ordenesCashea: OrdenCashea[];
  /** Cashea: cuotas del reporte que aparecen (o no) en el estado del BNC. */
  cruceCashea: null | {
    archivo: 'bnc' | 'cashea';
    encontradas: Array<{ cuota: MovimientoBanco; abono: MovimientoBanco }>;
    faltanEnBnc: MovimientoBanco[];
    pmBncSinCuota: MovimientoBanco[];
  };
  /**
   * La prueba: cada bolívar que entró y salió del banco, repartido en una sola
   * categoría. Si la suma de las categorías no da el total del banco, algo se
   * quedó fuera y se dice.
   */
  explicacion: {
    entradas: Array<{ concepto: string; monto: number; tono: 'ok' | 'aviso' | 'mal' | 'neutro' }>;
    salidas: Array<{ concepto: string; monto: number; tono: 'ok' | 'aviso' | 'mal' | 'neutro' }>;
    totalEntradas: number;
    totalSalidas: number;
    cuadraEntradas: boolean;
    cuadraSalidas: boolean;
  };
  veredicto: {
    cuadra: boolean;
    porcentaje: number;
    /** Dinero que el banco y el sistema cuentan distinto, sumado en valor absoluto. */
    enJuego: number;
    titulares: string[];
  };
  totalMovimientos: number;
}

// ── Limpieza del estado ────────────────────────────────────────────────────

const ES_INGRESO: ReadonlySet<ClaseMovimiento> = new Set(['cobro_pago_movil', 'cobro_transferencia', 'cobro_punto', 'otro_credito', 'cuota_cashea']);
const ES_EGRESO: ReadonlySet<ClaseMovimiento> = new Set(['pago_pago_movil', 'pago_transferencia', 'compra_pos', 'otro_debito']);

const TITULO_CLASE: Partial<Record<ClaseMovimiento, string>> = {
  comision: 'Comisiones y cargos del banco',
  impuesto: 'Impuestos y retenciones (SENIAT, ISLR, IGTF)',
  interes: 'Intereses abonados',
  traspaso_interno: 'Traspasos entre cuentas propias',
  liquidacion_cashea: 'Liquidaciones de Grupo Cashea',
};

/**
 * Empareja reversos con su original y separa las comisiones de cada pago.
 * Devuelve los movimientos que quedan para conciliar.
 */
function limpiar(movs: MovimientoBanco[]) {
  const usados = new Set<number>();
  const reversos: Array<{ original: MovimientoBanco; reverso: MovimientoBanco }> = [];
  for (const rev of movs.filter(m => m.clase === 'reverso')) {
    const original = movs.find(m => !usados.has(m.fila) && m.fila !== rev.fila && m.clase !== 'reverso'
      && Math.abs(m.monto + rev.monto) <= TOL
      && (m.referencia === rev.referencia || Math.abs(dias(m.fecha, rev.fecha)) <= 1));
    if (original) { usados.add(original.fila); usados.add(rev.fila); reversos.push({ original, reverso: rev }); }
  }
  // Comisión de un pago: misma referencia que un débito mayor y ≤ 1,5 % de él.
  const reclasificados = movs.map(m => {
    if (m.monto >= 0 || m.clase === 'comision' || !m.referencia || /^0+$/.test(m.referencia)) return m;
    const padre = movs.find(p => p.fila !== m.fila && p.referencia === m.referencia && p.monto < m.monto
      && Math.abs(m.monto) <= Math.abs(p.monto) * 0.015);
    return padre ? { ...m, clase: 'comision' as const } : m;
  });
  return { vivos: reclasificados.filter(m => !usados.has(m.fila)), reversos };
}

// ── Emparejador genérico ───────────────────────────────────────────────────

interface Lado { banco: MovimientoBanco[]; sistema: AsientoSistema[] }

function emparejar(lado: Lado, opciones: { ventanaCashea: number; dolaresATasa: boolean }) {
  const libresB = new Set(lado.banco.map(m => m.fila));
  const libresS = new Set(lado.sistema.map(s => s.id));
  const parejas: Pareja[] = [];
  const montoB = (m: MovimientoBanco) => Math.abs(m.clase === 'cuota_cashea' ? (m.usd ?? m.monto) : m.monto);
  // En dólares solo se compara directo con el reporte de Cashea (que trae USD).
  const comparable = (s: AsientoSistema, m: MovimientoBanco) => (s.enDolares ? m.clase === 'cuota_cashea' : m.clase !== 'cuota_cashea');

  const tomar = (regla: Regla, confianza: Pareja['confianza'], b: MovimientoBanco[], s: AsientoSistema[]) => {
    b.forEach(x => libresB.delete(x.fila)); s.forEach(x => libresS.delete(x.id));
    const tb = r2(b.reduce((a, x) => a + montoB(x), 0)); const ts = r2(s.reduce((a, x) => a + x.monto, 0));
    parejas.push({ regla, confianza, banco: b, sistema: s, diferenciaDias: Math.abs(dias(b[0].fecha, s[0].fecha)), diferenciaMonto: r2(tb - ts) });
  };

  const pasada = (regla: Regla, confianza: Pareja['confianza'], cumple: (m: MovimientoBanco, s: AsientoSistema) => boolean) => {
    for (const m of lado.banco) {
      if (!libresB.has(m.fila)) continue;
      const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && cumple(m, s));
      if (!cands.length) continue;
      cands.sort((a, b) => Math.abs(dias(m.fecha, a.fecha)) - Math.abs(dias(m.fecha, b.fecha)));
      tomar(regla, confianza, [m], [cands[0]]);
    }
  };
  const igual = (m: MovimientoBanco, s: AsientoSistema) => Math.abs(montoB(m) - s.monto) <= TOL;
  const refIgual = (m: MovimientoBanco, s: AsientoSistema) => {
    const a = (s.referencia || '').replace(/\D/g, ''); const b = m.referencia.replace(/\D/g, '');
    return a.length >= 4 && b.length >= 4 && (b.endsWith(a.slice(-6)) || a.endsWith(b.slice(-6)));
  };
  const ventana = (s: AsientoSistema, n: number) => (s.enDolares ? Math.max(n, opciones.ventanaCashea) : n);

  pasada('referencia', 'alta', (m, s) => igual(m, s) && refIgual(m, s));
  pasada('mismo_dia', 'alta', (m, s) => igual(m, s) && m.fecha === s.fecha);
  pasada('fecha_cercana', 'alta', (m, s) => igual(m, s) && Math.abs(dias(m.fecha, s.fecha)) <= ventana(s, 3));
  pasada('fecha_lejana', 'revisar', (m, s) => igual(m, s) && Math.abs(dias(m.fecha, s.fecha)) <= ventana(s, 10));

  // Uno contra varios (2 o 3), dentro de ±2 días y en la misma moneda.
  const combos = <T,>(arr: T[], k: number): T[][] => {
    const out: T[][] = [];
    const rec = (i: number, acc: T[]) => {
      if (acc.length === k) { out.push(acc); return; }
      for (let j = i; j < arr.length && out.length < 5000; j++) rec(j + 1, [...acc, arr[j]]);
    };
    rec(0, []); return out;
  };
  for (const m of lado.banco) {
    if (!libresB.has(m.fila)) continue;
    const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && Math.abs(dias(m.fecha, s.fecha)) <= 2 && s.monto < montoB(m)).slice(0, 25);
    let hecho = false;
    for (const k of [2, 3]) {
      for (const c of combos(cands, k)) {
        if (Math.abs(c.reduce((a, s) => a + s.monto, 0) - montoB(m)) <= TOL) { tomar('agrupado_banco', 'media', [m], c); hecho = true; break; }
      }
      if (hecho) break;
    }
  }
  for (const s of lado.sistema) {
    if (!libresS.has(s.id)) continue;
    const cands = lado.banco.filter(m => libresB.has(m.fila) && comparable(s, m) && Math.abs(dias(m.fecha, s.fecha)) <= 2 && montoB(m) < s.monto).slice(0, 25);
    let hecho = false;
    for (const k of [2, 3]) {
      for (const c of combos(cands, k)) {
        if (Math.abs(c.reduce((a, m) => a + montoB(m), 0) - s.monto) <= TOL) { tomar('agrupado_sistema', 'media', c, [s]); hecho = true; break; }
      }
      if (hecho) break;
    }
  }

  // Dólares del sistema (Cashea dentro del BNC) contra bolívares del banco.
  if (opciones.dolaresATasa) {
    for (const m of lado.banco) {
      if (!libresB.has(m.fila) || m.clase === 'cuota_cashea') continue;
      const cands = lado.sistema.filter(s => libresS.has(s.id) && s.enDolares && s.tasa > 0 && Math.abs(dias(m.fecha, s.fecha)) <= 3
        && Math.abs(s.usd * s.tasa - Math.abs(m.monto)) <= Math.abs(m.monto) * 0.015);
      if (!cands.length) continue;
      cands.sort((a, b) => Math.abs(a.usd * a.tasa - Math.abs(m.monto)) - Math.abs(b.usd * b.tasa - Math.abs(m.monto)));
      libresB.delete(m.fila); libresS.delete(cands[0].id);
      parejas.push({ regla: 'tasa_dolar', confianza: 'media', banco: [m], sistema: [cands[0]], diferenciaDias: Math.abs(dias(m.fecha, cands[0].fecha)), diferenciaMonto: r2(Math.abs(m.monto) - cands[0].usd * cands[0].tasa) });
    }
  }

  // Casi iguales: diferencia de monto (no se dan por conciliados).
  const diferencias: Diferencia[] = [];
  for (const m of lado.banco) {
    if (!libresB.has(m.fila)) continue;
    const mb = montoB(m);
    const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && Math.abs(dias(m.fecha, s.fecha)) <= 3
      && Math.abs(mb - s.monto) <= Math.max(m.clase === 'cuota_cashea' ? 0.05 : 1, s.monto * 0.005));
    if (!cands.length) continue;
    cands.sort((a, b) => Math.abs(mb - a.monto) - Math.abs(mb - b.monto));
    libresB.delete(m.fila); libresS.delete(cands[0].id);
    diferencias.push({ banco: m, sistema: cands[0], diferencia: r2(mb - cands[0].monto), diferenciaDias: Math.abs(dias(m.fecha, cands[0].fecha)) });
  }

  return {
    parejas, diferencias,
    sobrantesBanco: lado.banco.filter(m => libresB.has(m.fila)),
    sobrantesSistema: lado.sistema.filter(s => libresS.has(s.id)),
  };
}

// ── Entrada principal ──────────────────────────────────────────────────────

export interface DatosSistema {
  /** Asientos de las cuentas de este banco, en una ventana algo mayor que el período. */
  propios: AsientoSistema[];
  /** Asientos de las DEMÁS cuentas (para «registrado en otro banco»). */
  otros: AsientoSistema[];
  /** Personal: nombre y cédula, para reconocer pagos de nómina en el banco. */
  personal: Array<{ nombre: string; cedula: string | null }>;
  /** Ventas con Cashea de los últimos meses (solo para BNC y Cashea). */
  ventasCashea: VentaCashea[];
  /** Todas las ventas del mismo lapso, para sugerir candidatas. */
  ventasRecientes: Array<{ id: string; fecha: string; cliente: string; placa: string | null; total: number; metodo: string }>;
}

export function conciliar(estado: EstadoLeido, sistema: DatosSistema, cruce?: EstadoLeido | null): ResultadoConciliacion {
  const { vivos: vivosCrudos, reversos } = limpiar(estado.movimientos);
  const enPeriodo = (s: AsientoSistema) => s.fecha >= estado.desde && s.fecha <= estado.hasta;

  // ── Cruce Cashea ↔ BNC por referencia y monto en bolívares
  let cruceCashea: ResultadoConciliacion['cruceCashea'] = null;
  const cuotas = estado.banco === 'cashea' ? estado.movimientos : cruce?.banco === 'cashea' ? cruce.movimientos : null;
  const bnc = estado.banco === 'bnc' ? estado.movimientos : cruce?.banco === 'bnc' ? cruce.movimientos : null;
  const cuotaDelAbono = new Map<number, MovimientoBanco>();
  if (cuotas && bnc) {
    const libres = new Set(bnc.filter(m => m.clase === 'cobro_pago_movil').map(m => m.fila));
    const encontradas: Array<{ cuota: MovimientoBanco; abono: MovimientoBanco }> = [];
    const faltanEnBnc: MovimientoBanco[] = [];
    for (const c of cuotas) {
      const ref = c.referencia.replace(/\D/g, '');
      const a = bnc.find(m => libres.has(m.fila) && Math.abs(m.monto - c.monto) <= TOL
        && ref.length >= 4 && m.referencia.replace(/\D/g, '').endsWith(ref.slice(-8)))
        || bnc.find(m => libres.has(m.fila) && Math.abs(m.monto - c.monto) <= TOL && Math.abs(dias(m.fecha, c.fecha)) <= 1);
      if (a) { libres.delete(a.fila); encontradas.push({ cuota: c, abono: a }); cuotaDelAbono.set(a.fila, c); } else faltanEnBnc.push(c);
    }
    cruceCashea = {
      archivo: estado.banco === 'cashea' ? 'bnc' : 'cashea', encontradas, faltanEnBnc,
      pmBncSinCuota: bnc.filter(m => libres.has(m.fila)),
    };
  }
  // En el BNC, cada pago móvil que es una cuota de Cashea se concilia en
  // dólares contra el cobro registrado, al céntimo (la cuota trae su USD).
  const vivos: MovimientoBanco[] = estado.banco === 'bnc' && cuotaDelAbono.size
    ? vivosCrudos.map(m => {
      const c = cuotaDelAbono.get(m.fila);
      return c
        ? { ...m, clase: 'cuota_cashea' as const, usd: c.usd, tasa: c.tasa, cuota: c.cuota, cuotas: c.cuotas, orden: c.orden, factura: c.factura, descripcion: `Cashea · ${c.descripcion}` }
        : m;
    })
    : vivosCrudos;

  // ── Ingresos
  const bIng = vivos.filter(m => ES_INGRESO.has(m.clase));
  const sIng = sistema.propios.filter(s => s.sentido === 'ingreso');
  const ing = emparejar({ banco: bIng, sistema: sIng }, { ventanaCashea: 20, dolaresATasa: estado.banco === 'bnc' });
  // Lo que sobra en el banco: ¿está registrado en otra cuenta?
  const libresOtros = new Set(sistema.otros.map(s => s.id));
  const enOtraCuenta: EnOtraCuenta[] = [];
  const sinRegistrar: Array<MovimientoBanco & { pista: string | null }> = [];
  for (const m of ing.sobrantesBanco) {
    const c = sistema.otros.filter(s => libresOtros.has(s.id) && s.sentido === 'ingreso' && !s.enDolares
      && Math.abs(s.monto - Math.abs(m.monto)) <= TOL && Math.abs(dias(m.fecha, s.fecha)) <= 3)
      .sort((a, b) => Math.abs(dias(m.fecha, a.fecha)) - Math.abs(dias(m.fecha, b.fecha)))[0];
    if (c) { libresOtros.delete(c.id); enOtraCuenta.push({ banco: m, sistema: c }); } else sinRegistrar.push({ ...m, pista: null });
  }
  const esInicialCashea = (s: AsientoSistema) => s.cuenta === 'cashea' && s.tabla === 'ventas_dia';
  const noLlegaron = ing.sobrantesSistema.filter(enPeriodo).filter(s => !esInicialCashea(s));
  const inicialesSinCuenta = ing.sobrantesSistema.filter(enPeriodo).filter(esInicialCashea);
  const ordenesCashea = cuotas ? casarOrdenesCashea(cuotas, sistema.ventasCashea, sistema.ventasRecientes) : [];

  // ── Egresos
  const bEgr = vivos.filter(m => ES_EGRESO.has(m.clase));
  const sEgr = sistema.propios.filter(s => s.sentido === 'egreso');
  const egr = emparejar({ banco: bEgr, sistema: sEgr }, { ventanaCashea: 3, dolaresATasa: false });
  const pista = (m: MovimientoBanco): string | null => {
    const doc = (m.documento || '').replace(/\D/g, '');
    const desc = `${m.descripcion} ${m.detalle}`.toUpperCase();
    const p = sistema.personal.find(x => (doc && x.cedula && x.cedula.replace(/\D/g, '').replace(/^0+/, '') === doc.replace(/^0+/, ''))
      || x.nombre.toUpperCase().split(/\s+/).filter(w => w.length > 3).slice(0, 2).every(w => desc.includes(w)));
    if (p) return `Posible pago a ${p.nombre} (personal)`;
    if (/SENIAT|PLANILLA/.test(desc)) return 'Impuesto (SENIAT)';
    if (/CORPOELEC|DIGITEL|MOVISTAR|CANTV|INTER|AGUA|HIDRO/.test(desc)) return 'Servicio público / telefonía';
    if (m.clase === 'compra_pos') return 'Compra con tarjeta de débito';
    return null;
  };

  for (const m of sinRegistrar) {
    m.pista = m.clase === 'cuota_cashea'
      ? 'Cuota cobrada por Cashea sin su cobro registrado en el sistema'
      : (pista(m)?.replace('Posible pago a', 'Viene de') ?? null);
  }

  // ── Lo propio del banco (no es venta ni gasto)
  const grupos = new Map<ClaseMovimiento, MovimientoBanco[]>();
  for (const m of vivos) {
    if (ES_INGRESO.has(m.clase) || ES_EGRESO.has(m.clase)) continue;
    grupos.set(m.clase, [...(grupos.get(m.clase) || []), m]);
  }
  const propiosDelBanco: GrupoBanco[] = [...grupos.entries()].map(([clase, movimientos]) => ({
    clase, titulo: TITULO_CLASE[clase] || 'Otros movimientos', movimientos, total: r2(movimientos.reduce((a, m) => a + m.monto, 0)),
  })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const sum = (xs: Array<{ monto: number }>) => r2(xs.reduce((a, x) => a + Math.abs(x.monto), 0));
  const enDolaresBanco = estado.banco === 'cashea';
  const montoMov = (m: MovimientoBanco) => Math.abs(enDolaresBanco ? (m.usd ?? 0) : m.monto);
  const totalIngBanco = r2(bIng.reduce((a, m) => a + montoMov(m), 0));
  const totalIngSistema = r2(sIng.filter(enPeriodo).reduce((a, s) => a + (s.enDolares && !enDolaresBanco ? s.usd * s.tasa : s.monto), 0));

  const conflictos = sinRegistrar.length + noLlegaron.length + inicialesSinCuenta.length + ing.diferencias.length + enOtraCuenta.length
    + egr.sobrantesBanco.length + egr.diferencias.length + (cruceCashea?.faltanEnBnc.length || 0) + ordenesCashea.filter(o => o.estado !== 'al_dia').length
    + ing.parejas.filter(p => p.confianza === 'revisar').length;
  const enJuego = r2(
    sinRegistrar.reduce((a, m) => a + montoMov(m), 0)
    + inicialesSinCuenta.reduce((a, s) => a + (enDolaresBanco ? s.monto : s.usd * s.tasa), 0)
    + noLlegaron.reduce((a, s) => a + (s.enDolares && !enDolaresBanco ? s.usd * s.tasa : s.monto), 0)
    + ing.diferencias.reduce((a, d) => a + Math.abs(d.diferencia), 0)
    + egr.sobrantesBanco.reduce((a, m) => a + Math.abs(m.monto), 0)
    + egr.diferencias.reduce((a, d) => a + Math.abs(d.diferencia), 0),
  );
  const relevantes = bIng.length + bEgr.length + noLlegaron.length + egr.sobrantesSistema.filter(enPeriodo).length;
  const conciliadosN = ing.parejas.reduce((a, p) => a + p.banco.length, 0) + egr.parejas.reduce((a, p) => a + p.banco.length, 0);
  const porcentaje = relevantes ? Math.round((conciliadosN / relevantes) * 1000) / 10 : 100;

  const titulares: string[] = [];
  if (estado.saltosDeSaldo.length) titulares.push(`El archivo tiene ${estado.saltosDeSaldo.length} salto(s) de saldo: falta o sobra alguna fila.`);
  if (sinRegistrar.length) titulares.push(`${sinRegistrar.length} cobro(s) en el banco que no están registrados en el sistema.`);
  if (enOtraCuenta.length) titulares.push(`${enOtraCuenta.length} cobro(s) registrados en el sistema con OTRA cuenta.`);
  if (inicialesSinCuenta.length) titulares.push(`${inicialesSinCuenta.length} inicial(es) de Cashea anotadas en «Cashea / BNC» que no entraron por esa cuenta.`);
  if (noLlegaron.length) titulares.push(`${noLlegaron.length} cobro(s) registrados a este banco que no aparecen en el estado.`);
  if (ing.diferencias.length + egr.diferencias.length) titulares.push(`${ing.diferencias.length + egr.diferencias.length} pago(s) con monto distinto entre banco y sistema.`);
  if (egr.sobrantesBanco.length) titulares.push(`${egr.sobrantesBanco.length} pago(s) a terceros salieron del banco sin gasto registrado.`);
  const sinVenta = ordenesCashea.filter(o => o.estado === 'venta_no_encontrada').length;
  if (sinVenta) titulares.push(`${sinVenta} orden(es) de Cashea sin venta identificable en el sistema.`);
  if (cruceCashea?.faltanEnBnc.length) titulares.push(`${cruceCashea.faltanEnBnc.length} cuota(s) de Cashea que no aparecen en el BNC.`);
  if (!titulares.length) titulares.push('Cada movimiento del banco tiene su registro en el sistema, al céntimo.');

  // ── La prueba de cada bolívar
  const absB = (ms: MovimientoBanco[]) => r2(ms.reduce((a, m) => a + Math.abs(m.monto), 0));
  const gruposMas = propiosDelBanco.map(g => ({ concepto: g.titulo, monto: r2(g.movimientos.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0)) }));
  const gruposMenos = propiosDelBanco.map(g => ({ concepto: g.titulo, monto: r2(g.movimientos.filter(m => m.monto < 0).reduce((a, m) => a - m.monto, 0)) }));
  const lado = reversos.reduce((a, x) => a + Math.max(x.original.monto, x.reverso.monto, 0), 0);
  const entradas = [
    { concepto: 'Cobros conciliados con el sistema', monto: r2(ing.parejas.reduce((a, p) => a + absB(p.banco), 0)), tono: 'ok' as const },
    { concepto: 'Cobros registrados con otra cuenta', monto: absB(enOtraCuenta.map(x => x.banco)), tono: 'aviso' as const },
    { concepto: 'Cobros con monto distinto', monto: absB(ing.diferencias.map(d => d.banco)), tono: 'aviso' as const },
    { concepto: 'Cobros que no están en el sistema', monto: absB(sinRegistrar), tono: 'mal' as const },
    ...gruposMas.map(g => ({ ...g, tono: 'neutro' as const })),
    { concepto: 'Reversos (se anulan con su original)', monto: r2(lado), tono: 'neutro' as const },
  ].filter(x => x.monto > 0);
  const salidas = [
    { concepto: 'Pagos conciliados con gastos', monto: r2(egr.parejas.reduce((a, p) => a + absB(p.banco), 0)), tono: 'ok' as const },
    { concepto: 'Pagos con monto distinto', monto: absB(egr.diferencias.map(d => d.banco)), tono: 'aviso' as const },
    { concepto: 'Pagos sin gasto registrado', monto: absB(egr.sobrantesBanco), tono: 'mal' as const },
    ...gruposMenos.map(g => ({ ...g, tono: 'neutro' as const })),
    { concepto: 'Movimientos que luego se reversaron', monto: r2(lado), tono: 'neutro' as const },
  ].filter(x => x.monto > 0);
  const totalEntradas = r2(entradas.reduce((a, x) => a + x.monto, 0));
  const totalSalidas = r2(salidas.reduce((a, x) => a + x.monto, 0));
  const explicacion = {
    entradas, salidas, totalEntradas, totalSalidas,
    cuadraEntradas: Math.abs(totalEntradas - estado.totalCreditos) <= 0.01,
    cuadraSalidas: Math.abs(totalSalidas - estado.totalDebitos) <= 0.01,
  };

  const { movimientos: _m, ...cabecera } = estado;
  void _m;
  return {
    banco: estado.banco,
    estado: cabecera,
    ingresos: {
      conciliados: ing.parejas, diferencias: ing.diferencias, enOtraCuenta, sinRegistrar, noLlegaron, inicialesSinCuenta,
      totalBanco: totalIngBanco, totalSistema: totalIngSistema,
    },
    egresos: {
      conciliados: egr.parejas, diferencias: egr.diferencias,
      sinRegistrar: egr.sobrantesBanco.map(m => ({ ...m, pista: pista(m) })),
      noSalieron: egr.sobrantesSistema.filter(enPeriodo),
      totalBanco: sum(bEgr), totalSistema: r2(sEgr.filter(enPeriodo).reduce((a, s) => a + s.monto, 0)),
    },
    propiosDelBanco, reversos, cruceCashea, ordenesCashea, explicacion,
    veredicto: { cuadra: conflictos === 0 && estado.saltosDeSaldo.length === 0, porcentaje, enJuego, titulares },
    totalMovimientos: estado.movimientos.length,
  };
}

// ── Cashea por orden ───────────────────────────────────────────────────────

/**
 * Casa cada orden de Cashea con su venta. El reporte no trae cliente ni placa,
 * así que se usa lo que sí se sabe: las cuotas van cada 14 días (la venta fue
 * unos 14 × número de cuota días antes del pago) y lo financiado se divide en
 * 3 cuotas iguales. Entre varias ventas posibles gana la de fecha más cercana,
 * y se dice cuántas había.
 */
export function casarOrdenesCashea(cuotas: MovimientoBanco[], ventas: VentaCashea[], recientes: DatosSistema['ventasRecientes'] = []): OrdenCashea[] {
  const porOrden = new Map<string, MovimientoBanco[]>();
  for (const c of cuotas) {
    const k = c.orden || c.referencia;
    porOrden.set(k, [...(porOrden.get(k) || []), c]);
  }
  const usadas = new Set<string>();
  const ordenes = [...porOrden.entries()].map(([orden, cs]) => {
    cs.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const primera = cs.reduce((a, b) => ((a.cuota ?? 9) <= (b.cuota ?? 9) ? a : b));
    const estimada = new Date(Date.parse(primera.fecha) - 14 * (primera.cuota ?? 1) * 86_400_000).toISOString().slice(0, 10);
    // La cuota es la que se repite; la inicial (cuota 0) va aparte. Un pago
    // que cubre varias cuotas se divide entre ellas.
    const deCuota = cs.filter(c => (c.cuota ?? 1) > 0);
    const cuotaUSD = r2(Math.max(0, ...deCuota.map(c => (c.usd || 0) / Math.max(1, c.cuotas?.length || 1))));
    const ultimaCuota = Math.max(0, ...cs.flatMap(c => c.cuotas?.length ? c.cuotas : [c.cuota || 0]));
    return { orden, cs, primera, estimada, cuotaUSD, ultimaCuota };
  }).sort((a, b) => a.estimada.localeCompare(b.estimada));

  return ordenes.map(o => {
    const financiados = (v: VentaCashea) => [v.financiado, v.casheaCol, r2(v.total * 1.16 - v.inicial)].filter(x => x > 0);
    const inicialUSD = r2(o.cs.filter(c => c.cuota === 0 && (c.cuotas?.length || 1) === 1).reduce((a, c) => a + (c.usd || 0), 0));
    const cands = ventas.filter(v => !usadas.has(v.id) && v.fecha <= o.primera.fecha
      && Math.abs(dias(v.fecha, o.estimada)) <= 12
      && (o.cuotaUSD > 0
        ? financiados(v).some(f => Math.abs(f / 3 - o.cuotaUSD) <= 0.03)
        : Math.abs(v.casheaCol - inicialUSD) <= 0.03));
    cands.sort((a, b) => Math.abs(dias(a.fecha, o.estimada)) - Math.abs(dias(b.fecha, o.estimada)));
    const venta = cands[0] || null;
    if (venta) usadas.add(venta.id);
    const cobradoUSD = r2(o.cs.reduce((a, c) => a + (c.usd || 0), 0));
    const esperadoUSD = r2(o.cuotaUSD * o.ultimaCuota);
    // Candidatas, solo como sugerencia: ventas de la misma época cuyo total,
    // con algún plan de Cashea (0–60 % de inicial, con o sin IVA), da esta cuota.
    const posibles: OrdenCashea['posibles'] = [];
    if (!venta && o.cuotaUSD > 0) {
      for (const v of recientes) {
        if (Math.abs(dias(v.fecha, o.estimada)) > 14 || v.fecha > o.primera.fecha) continue;
        for (const iva of [1.16, 1]) {
          for (const p of [0, 10, 20, 30, 40, 50, 60]) {
            if (Math.abs((v.total * iva * (1 - p / 100)) / 3 - o.cuotaUSD) <= 0.03 && !posibles.some(x => x.fecha === v.fecha && x.cliente === v.cliente)) {
              posibles.push({ fecha: v.fecha, cliente: v.cliente, placa: v.placa, total: v.total, plan: `${p} % inicial${iva > 1 ? ' + IVA' : ''}`, metodo: v.metodo });
            }
          }
        }
      }
      posibles.sort((a, b) => Math.abs(dias(a.fecha, o.estimada)) - Math.abs(dias(b.fecha, o.estimada)));
      posibles.splice(3);
    }
    const registradoUSD = venta?.cuotasRegistradasUSD || 0;
    const estado: OrdenCashea['estado'] = !venta ? 'venta_no_encontrada'
      : registradoUSD + 0.01 < esperadoUSD ? 'cuotas_sin_registrar'
        : registradoUSD > esperadoUSD + o.cuotaUSD + 0.01 ? 'registrado_de_mas' : 'al_dia';
    const nota = !venta
      ? `Ninguna venta con Cashea cerca del ${o.estimada.split('-').reverse().join('/')} financia 3 × $${o.cuotaUSD.toFixed(2)}.`
      : estado === 'cuotas_sin_registrar'
        ? `Cashea ya cobró ${o.ultimaCuota} cuota(s) ($${esperadoUSD.toFixed(2)}); en el sistema hay $${registradoUSD.toFixed(2)} registrados.`
        : estado === 'registrado_de_mas'
          ? `En el sistema hay $${registradoUSD.toFixed(2)} cobrados, más de lo que Cashea reporta ($${esperadoUSD.toFixed(2)}).`
          : 'Cuotas registradas al día.';
    return {
      orden: o.orden, factura: o.primera.factura || '', cuotas: o.cs, cuotaUSD: o.cuotaUSD, cobradoUSD,
      cobradoBs: r2(o.cs.reduce((a, c) => a + c.monto, 0)), ultimaCuota: o.ultimaCuota,
      fechaEstimadaVenta: o.estimada, venta, candidatos: cands.length, esperadoUSD, registradoUSD, estado, nota, posibles,
    };
  }).sort((a, b) => a.orden.localeCompare(b.orden));
}
