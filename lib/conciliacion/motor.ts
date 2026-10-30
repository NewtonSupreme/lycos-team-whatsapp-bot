// ─────────────────────────────────────────────────────────────────────────────
// Motor de conciliación bancaria.
//
// Cruza cada movimiento del estado de cuenta con lo que el sistema dice que
// entró o salió por ESA cuenta, y explica cada diferencia.
// Soporta Banesco, BNC 8201 (Iniciales / General), BNC 8215 (Cuotas Cashea),
// Banco Exterior y Cashea.
// Permite traspasos entre cuentas y justificaciones contables con soporte.
// ─────────────────────────────────────────────────────────────────────────────

import type { BankBin } from '@/lib/reporte/ventas-mapping';
import type { BancoConciliable, ClaseMovimiento, EstadoLeido, MovimientoBanco } from './leer-estado';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const TOL = 0.01;
const num2 = (x: number) => (x > 0 ? '+' : '') + x.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Diferencia de redondeo (tasa con 4 decimales) que se acepta como «el mismo pago» el mismo día. */
const CENTIMOS = 0.05;
/** Hasta aquí es redondeo de la tasa (4 decimales) y el pago se da por conciliado; más es «monto distinto». */
const REDONDEO = 0.02;

/** Qué columnas del sistema corresponden a cada estado de cuenta. */
export const CUENTAS_DEL_BANCO: Record<BancoConciliable, BankBin[]> = {
  banesco: ['pago_movil_banesco', 'punto_banesco'],
  bnc: ['bnc', 'cashea'],
  bnc_cuotas: ['bnc', 'cashea'],
  exterior: ['pago_movil_exterior'],
  cashea: ['cashea', 'bnc'],
};

export const NOMBRE_CUENTA: Record<string, string> = {
  pago_movil_banesco: 'PM / Transf. Banesco', punto_banesco: 'Punto Banesco', bnc: 'PM / Transf. BNC',
  punto_bancamiga: 'Punto Bancamiga', pago_movil_exterior: 'PM Exterior', efectivo_bs: 'Efectivo Bs',
  dolares: 'Efectivo $', zelle: 'Zelle', binance: 'Binance', cashea: 'Cashea',
};

/** Un registro del sistema que dice que entró o salió dinero por una cuenta. */
export interface AsientoSistema {
  id: string;
  tabla: 'ventas_dia' | 'abonos' | 'egresos' | 'pagos_proveedor';
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
  | 'agrupado_banco' | 'agrupado_sistema' | 'tasa_dolar' | 'cashea_usd' | 'inicial_tardia' | 'redondeo';

export const REGLA_TEXTO: Record<Regla, string> = {
  referencia: 'Referencia y monto',
  mismo_dia: 'Monto exacto, mismo día',
  fecha_cercana: 'Monto exacto, fecha cercana',
  fecha_lejana: 'Monto exacto, fecha lejana',
  agrupado_banco: 'Un pago cubre varios registros',
  agrupado_sistema: 'Varios pagos de un registro',
  tasa_dolar: 'Dólares a la tasa del día',
  cashea_usd: 'Cuota Cashea en dólares',
  inicial_tardia: 'Inicial de Cashea pagada días después de la venta',
  redondeo: 'Mismo día, redondeo de la tasa (hasta 0,02 Bs)',
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

/** Justificación contable asociada a un movimiento bancario o diferencia. */
export interface JustificacionConciliacion {
  id: string;
  movimientoHash: string;
  tipo: 'ingreso' | 'egreso' | 'diferencia' | 'sistema';
  motivo: string;
  fecha: string;
  monto: number;
  usuario: string;
  createdAt: string;
}

/** Información de un traspaso entre cuentas registrado en el sistema. */
export interface TraspasoCuentaInfo {
  id: string;
  fecha: string;
  origen_id: string;
  destino_id: string;
  origen_nombre: string;
  destino_nombre: string;
  monto: number;
  monto_destino: number;
  tasa: number | null;
  motivo: string | null;
  registrado_por: string | null;
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
  casheaCol: number;
  servicioId: string | null;
  cuotasRegistradasUSD: number;
}

export interface OrdenCashea {
  orden: string;
  factura: string;
  cuotas: MovimientoBanco[];
  cuotaUSD: number;
  cobradoUSD: number;
  cobradoBs: number;
  ultimaCuota: number;
  fechaEstimadaVenta: string;
  venta: VentaCashea | null;
  candidatos: number;
  esperadoUSD: number;
  registradoUSD: number;
  estado: 'al_dia' | 'cuotas_sin_registrar' | 'venta_no_encontrada' | 'registrado_de_mas';
  nota: string;
  posibles: Array<{ fecha: string; cliente: string; placa: string | null; total: number; plan: string; metodo: string }>;
}

export interface GrupoBanco {
  clase: ClaseMovimiento;
  titulo: string;
  movimientos: MovimientoBanco[];
  total: number;
}

export interface SistemaJustificado {
  sistema: AsientoSistema;
  justificacion: { motivo: string; usuario: string; fecha: string };
}

export interface ResultadoConciliacion {
  banco: BancoConciliable;
  estado: Omit<EstadoLeido, 'movimientos'>;
  ingresos: {
    conciliados: Pareja[];
    diferencias: Diferencia[];
    enOtraCuenta: EnOtraCuenta[];
    sinRegistrar: Array<MovimientoBanco & { pista: string | null }>;
    justificados: Array<MovimientoBanco & { pista: string | null }>;
    noLlegaron: AsientoSistema[];
    inicialesSinCuenta: AsientoSistema[];
    /** Registros del sistema que no están en el estado y que alguien justificó (con su motivo). */
    sistemaJustificados: SistemaJustificado[];
    totalBanco: number;
    totalSistema: number;
  };
  egresos: {
    conciliados: Pareja[];
    diferencias: Diferencia[];
    sinRegistrar: Array<MovimientoBanco & { pista: string | null }>;
    justificados: Array<MovimientoBanco & { pista: string | null }>;
    noSalieron: AsientoSistema[];
    sistemaJustificados: SistemaJustificado[];
    totalBanco: number;
    totalSistema: number;
  };
  propiosDelBanco: GrupoBanco[];
  reversos: Array<{ original: MovimientoBanco; reverso: MovimientoBanco }>;
  traspasosInternos: {
    banco: MovimientoBanco[];
    registrados: TraspasoCuentaInfo[];
    conciliados: Array<{ banco: MovimientoBanco; traspaso: TraspasoCuentaInfo }>;
    pendientesRegistro: MovimientoBanco[];
    total: number;
  };
  ordenesCashea: OrdenCashea[];
  cruceCashea: null | {
    archivo: 'bnc' | 'cashea';
    encontradas: Array<{ cuota: MovimientoBanco; abono: MovimientoBanco }>;
    faltanEnBnc: MovimientoBanco[];
    pmBncSinCuota: MovimientoBanco[];
  };
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

function limpiar(movs: MovimientoBanco[]) {
  const usados = new Set<number>();
  const reversos: Array<{ original: MovimientoBanco; reverso: MovimientoBanco }> = [];
  for (const rev of movs.filter(m => m.clase === 'reverso')) {
    const original = movs.find(m => !usados.has(m.fila) && m.fila !== rev.fila && m.clase !== 'reverso'
      && Math.abs(m.monto + rev.monto) <= TOL
      && (m.referencia === rev.referencia || Math.abs(dias(m.fecha, rev.fecha)) <= 1));
    if (original) { usados.add(original.fila); usados.add(rev.fila); reversos.push({ original, reverso: rev }); }
  }
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

function emparejar(lado: Lado, opciones: { ventanaCashea: number; dolaresATasa: boolean; periodo?: { desde: string; hasta: string } }) {
  const libresB = new Set(lado.banco.map(m => m.fila));
  const libresS = new Set(lado.sistema.map(s => s.id));
  const parejas: Pareja[] = [];
  const montoB = (m: MovimientoBanco) => Math.abs(m.clase === 'cuota_cashea' ? (m.usd ?? m.monto) : m.monto);
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
      cands.sort((a, b) => Math.abs(dias(m.fecha, a.fecha)) - Math.abs(dias(m.fecha, b.fecha))
        // a igual distancia, el registro del mismo día o anterior al banco (el banco nunca se adelanta a la venta)
        || Number(a.fecha > m.fecha) - Number(b.fecha > m.fecha)
        || Math.abs(montoB(m) - a.monto) - Math.abs(montoB(m) - b.monto));
      tomar(regla, confianza, [m], [cands[0]]);
    }
  };
  // Un registro posterior al último día del estado no puede explicar un movimiento del
  // estado: es del día siguiente y queda fuera de este período (no se le «roba» a otro).
  const posterior = (s: AsientoSistema) => !!opciones.periodo && s.fecha > opciones.periodo.hasta;
  const igual = (m: MovimientoBanco, s: AsientoSistema) => Math.abs(montoB(m) - s.monto) <= TOL;
  const refIgual = (m: MovimientoBanco, s: AsientoSistema) => {
    const a = (s.referencia || '').replace(/\D/g, ''); const b = m.referencia.replace(/\D/g, '');
    return a.length >= 4 && b.length >= 4 && (b.endsWith(a.slice(-6)) || a.endsWith(b.slice(-6)));
  };
  const ventana = (s: AsientoSistema, n: number) => (s.enDolares ? Math.max(n, opciones.ventanaCashea) : n);

  pasada('referencia', 'alta', (m, s) => igual(m, s) && refIgual(m, s));
  pasada('mismo_dia', 'alta', (m, s) => igual(m, s) && m.fecha === s.fecha);

  // El mismo día y el monto a un céntimo o pocos (redondeo de la tasa): es ese pago.
  // Va ANTES de las pasadas por fecha para que un registro de otro día con el monto
  // exacto no se lleve el movimiento de quien sí pagó ese día.
  const diferencias: Diferencia[] = [];
  for (const m of lado.banco) {
    if (!libresB.has(m.fila) || m.clase === 'cuota_cashea') continue;
    const mb = montoB(m);
    const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && !s.enDolares && s.fecha === m.fecha
      && Math.abs(mb - s.monto) <= CENTIMOS);
    if (!cands.length) continue;
    cands.sort((a, b) => Math.abs(mb - a.monto) - Math.abs(mb - b.monto));
    if (Math.abs(mb - cands[0].monto) <= REDONDEO + 1e-9) { tomar('redondeo', 'alta', [m], [cands[0]]); continue; }
    libresB.delete(m.fila); libresS.delete(cands[0].id);
    diferencias.push({ banco: m, sistema: cands[0], diferencia: r2(mb - cands[0].monto), diferenciaDias: 0 });
  }

  pasada('fecha_cercana', 'alta', (m, s) => igual(m, s) && !posterior(s) && Math.abs(dias(m.fecha, s.fecha)) <= ventana(s, 3));
  pasada('fecha_lejana', 'revisar', (m, s) => igual(m, s) && !posterior(s) && Math.abs(dias(m.fecha, s.fecha)) <= ventana(s, 10));

  // Uno contra varios (2 o 3)
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
    const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && !posterior(s) && Math.abs(dias(m.fecha, s.fecha)) <= 2 && s.monto < montoB(m)).slice(0, 25);
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

  // Dólares del sistema contra bolívares del banco
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

  // Coma o punto corrido: el sistema tiene el monto del banco ×10, ×100 o ÷10, ÷100 (35.449,08 digitado
  // como 3.544.908). Es un error de captura del mismo pago: se enseña como diferencia para corregirlo.
  for (const m of lado.banco) {
    if (!libresB.has(m.fila) || m.clase === 'cuota_cashea') continue;
    const mb = montoB(m);
    if (mb < 1) continue;
    const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && !s.enDolares && !posterior(s)
      && Math.abs(dias(m.fecha, s.fecha)) <= 1
      && [10, 100, 1000].some(f => Math.abs(s.monto - mb * f) <= 0.01 * f || Math.abs(s.monto * f - mb) <= 0.01 * f));
    if (!cands.length) continue;
    libresB.delete(m.fila); libresS.delete(cands[0].id);
    diferencias.push({ banco: m, sistema: cands[0], diferencia: r2(mb - cands[0].monto), diferenciaDias: Math.abs(dias(m.fecha, cands[0].fecha)) });
  }

  // Diferencias
  for (const m of lado.banco) {
    if (!libresB.has(m.fila)) continue;
    const mb = montoB(m);
    const cands = lado.sistema.filter(s => libresS.has(s.id) && comparable(s, m) && !posterior(s) && Math.abs(dias(m.fecha, s.fecha)) <= 3
      && Math.abs(mb - s.monto) <= Math.max(m.clase === 'cuota_cashea' ? 0.05 : 1, s.monto * 0.005));
    if (!cands.length) continue;
    cands.sort((a, b) => Math.abs(dias(m.fecha, a.fecha)) - Math.abs(dias(m.fecha, b.fecha)) || Math.abs(mb - a.monto) - Math.abs(mb - b.monto));
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
  propios: AsientoSistema[];
  otros: AsientoSistema[];
  personal: Array<{ nombre: string; cedula: string | null }>;
  ventasCashea: VentaCashea[];
  ventasRecientes: Array<{ id: string; fecha: string; cliente: string; placa: string | null; total: number; metodo: string }>;
  justificaciones: JustificacionConciliacion[];
  traspasos: TraspasoCuentaInfo[];
}

export function conciliar(estado: EstadoLeido, sistema: DatosSistema, cruce?: EstadoLeido | null): ResultadoConciliacion {
  const { vivos: vivosCrudos, reversos } = limpiar(estado.movimientos);
  const enPeriodo = (s: AsientoSistema) => s.fecha >= estado.desde && s.fecha <= estado.hasta;

  // ── Cruce Cashea ↔ BNC por referencia y monto en bolívares
  let cruceCashea: ResultadoConciliacion['cruceCashea'] = null;
  const esBnc = estado.banco === 'bnc' || estado.banco === 'bnc_cuotas';
  const cruceEsBnc = cruce?.banco === 'bnc' || cruce?.banco === 'bnc_cuotas';
  const cuotas = estado.banco === 'cashea' ? estado.movimientos : cruce?.banco === 'cashea' ? cruce.movimientos : null;
  const bnc = esBnc ? estado.movimientos : cruceEsBnc ? cruce!.movimientos : null;
  const cuotaDelAbono = new Map<number, MovimientoBanco>();

  if (cuotas && bnc) {
    const libres = new Set(bnc.filter(m => m.clase === 'cobro_pago_movil' || m.clase === 'cuota_cashea').map(m => m.fila));
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

  const vivos: MovimientoBanco[] = esBnc && cuotaDelAbono.size
    ? vivosCrudos.map(m => {
      const c = cuotaDelAbono.get(m.fila);
      return c
        ? { ...m, clase: 'cuota_cashea' as const, usd: c.usd, tasa: c.tasa, cuota: c.cuota, cuotas: c.cuotas, orden: c.orden, factura: c.factura, descripcion: `Cashea · ${c.descripcion}` }
        : m;
    })
    : vivosCrudos;

  // ── Identificación de Justificaciones existentes
  const hashMov = (m: MovimientoBanco) =>
    m.referencia ? `${m.fecha}_${m.referencia}_${Math.abs(m.monto)}` : `${m.fecha}_fila${m.fila}_${Math.abs(m.monto)}`;

  const justificarSiAplica = (m: MovimientoBanco) => {
    const h = hashMov(m);
    const j = (sistema.justificaciones || []).find(x =>
      x.movimientoHash === h ||
      (x.fecha === m.fecha && Math.abs(x.monto - Math.abs(m.monto)) <= 0.01 && (m.referencia ? x.movimientoHash.includes(m.referencia) : true))
    );
    if (j) {
      m.justificado = true;
      m.justificacion = { motivo: j.motivo, usuario: j.usuario, fecha: j.fecha };
      return true;
    }
    return false;
  };

  // ── Traspasos entre cuentas internas
  const movsTraspaso = vivos.filter(m => m.clase === 'traspaso_interno');
  const libresTraspasos = new Set((sistema.traspasos || []).map(t => t.id));
  const traspasosConciliados: Array<{ banco: MovimientoBanco; traspaso: TraspasoCuentaInfo }> = [];
  const traspasosPendientes: MovimientoBanco[] = [];

  for (const m of movsTraspaso) {
    const mb = Math.abs(m.monto);
    const cand = (sistema.traspasos || []).find(t =>
      libresTraspasos.has(t.id) &&
      (Math.abs(t.monto - mb) <= TOL || Math.abs(t.monto_destino - mb) <= TOL) &&
      Math.abs(dias(m.fecha, t.fecha)) <= 3
    );
    if (cand) {
      libresTraspasos.delete(cand.id);
      traspasosConciliados.push({ banco: m, traspaso: cand });
    } else {
      traspasosPendientes.push(m);
    }
  }

  // ── Ingresos
  const bIng = vivos.filter(m => ES_INGRESO.has(m.clase));
  const sIng = sistema.propios.filter(s => s.sentido === 'ingreso');
  const ing = emparejar({ banco: bIng, sistema: sIng }, { ventanaCashea: 20, dolaresATasa: esBnc, periodo: { desde: estado.desde, hasta: estado.hasta } });

  // ── Inicial de Cashea pagada DÍAS DESPUÉS de la venta ────────────────────────
  // La venta anota la inicial el día de la orden (p. ej. 31/08) y el cliente la paga al BNC
  // semanas después (23/10): ese día no hay ninguna venta que el cruce por fecha alcance. Se
  // busca, entre las ventas con Cashea de los 120 días anteriores, la inicial que equivale a
  // ese pago (dólares a la tasa del día del banco, ±1,5 %). Si hay UNA sola se empareja y se
  // marca «revisar»; si hay varias se muestran como pista para que se elija a mano.
  const pistaInicial = new Map<number, string>();
  if (esBnc && (sistema.ventasCashea || []).length) {
    const yaEnLaCorrida = new Set<string>();
    for (const x of [...ing.parejas.flatMap(q => q.sistema), ...ing.diferencias.map(d => d.sistema), ...ing.sobrantesSistema]) yaEnLaCorrida.add(x.registroId);
    const usadasAqui = new Set<string>();
    const restantes: MovimientoBanco[] = [];
    for (const m of ing.sobrantesBanco) {
      const tasaBanco = m.tasa && m.tasa > 0 ? m.tasa : 0;
      if (!tasaBanco || (m.clase !== 'cobro_pago_movil' && m.clase !== 'otro_credito')) { restantes.push(m); continue; }
      const usdBanco = Math.abs(m.monto) / tasaBanco;
      const cands = (sistema.ventasCashea || []).filter(v => v.inicial > 0 && !yaEnLaCorrida.has(v.id) && !usadasAqui.has(v.id)
        && v.fecha <= m.fecha && dias(m.fecha, v.fecha) <= 120
        && Math.abs(usdBanco - v.inicial) <= Math.max(0.5, v.inicial * 0.015));
      if (cands.length === 1) {
        const v = cands[0];
        usadasAqui.add(v.id);
        const as: AsientoSistema = {
          id: `ventas_dia:${v.id}:inicial`, tabla: 'ventas_dia', registroId: v.id, fecha: v.fecha, sentido: 'ingreso', cuenta: 'cashea',
          monto: v.inicial, enDolares: true, usd: v.inicial, tasa: tasaBanco, concepto: v.cliente,
          detalle: `Inicial de Cashea · venta del ${v.fecha} (pagada el ${m.fecha})`, placa: v.placa, referencia: null, servicioId: v.servicioId,
        };
        const confirmada = (sistema.justificaciones || []).some(j => j.movimientoHash === hashMov(m) && /^Confirmado/.test(j.motivo));
        ing.parejas.push({ regla: 'inicial_tardia', confianza: confirmada ? 'alta' : 'revisar', banco: [m], sistema: [as], diferenciaDias: Math.abs(dias(m.fecha, v.fecha)), diferenciaMonto: r2(usdBanco - v.inicial) });
        continue;
      }
      if (cands.length > 1) {
        pistaInicial.set(m.fila, `Podría ser la inicial de Cashea de: ${cands.slice(0, 3).map(v => `${v.cliente} (${v.fecha}, $${v.inicial.toFixed(2)})`).join(' · ')}`);
      }
      restantes.push(m);
    }
    ing.sobrantesBanco = restantes;
  }

  const libresOtros = new Set(sistema.otros.map(s => s.id));
  const enOtraCuenta: EnOtraCuenta[] = [];
  const sinRegistrarBruto: Array<MovimientoBanco & { pista: string | null }> = [];
  for (const m of ing.sobrantesBanco) {
    const c = sistema.otros.filter(s => libresOtros.has(s.id) && s.sentido === 'ingreso' && !s.enDolares
      && Math.abs(s.monto - Math.abs(m.monto)) <= TOL && Math.abs(dias(m.fecha, s.fecha)) <= 3)
      .sort((a, b) => Math.abs(dias(m.fecha, a.fecha)) - Math.abs(dias(m.fecha, b.fecha)))[0];
    if (c) { libresOtros.delete(c.id); enOtraCuenta.push({ banco: m, sistema: c }); } else sinRegistrarBruto.push({ ...m, pista: null });
  }

  const sinRegistrar: Array<MovimientoBanco & { pista: string | null }> = [];
  const justificadosIngresos: Array<MovimientoBanco & { pista: string | null }> = [];
  for (const m of sinRegistrarBruto) {
    if (justificarSiAplica(m)) {
      justificadosIngresos.push(m);
    } else {
      sinRegistrar.push(m);
    }
  }

  // Un monto distinto que ya se justificó deja de ser pendiente: pasa a «Justificados» con su motivo.
  ing.diferencias = ing.diferencias.filter(d => {
    if (!justificarSiAplica(d.banco)) return true;
    justificadosIngresos.push({ ...d.banco, pista: `Monto distinto de ${num2(d.diferencia)} con ${d.sistema.concepto}` });
    return false;
  });

  const esInicialCashea = (s: AsientoSistema) => s.cuenta === 'cashea' && s.tabla === 'ventas_dia';
  // Un registro del sistema que no está en el estado y que alguien justificó («sis:<id>») deja de estar pendiente.
  const justSis = new Map((sistema.justificaciones || []).filter(j => j.movimientoHash.startsWith('sis:')).map(j => [j.movimientoHash.slice(4), j]));
  const sistemaJustIng: SistemaJustificado[] = [];
  const sinJustificarSis = (xs: AsientoSistema[], destino: SistemaJustificado[]) => xs.filter(x => {
    const j = justSis.get(x.id);
    if (!j) return true;
    destino.push({ sistema: x, justificacion: { motivo: j.motivo, usuario: j.usuario, fecha: j.fecha } });
    return false;
  });
  const pendientesSis = sinJustificarSis(ing.sobrantesSistema.filter(enPeriodo), sistemaJustIng);
  const noLlegaron = pendientesSis.filter(s => !esInicialCashea(s));
  const inicialesSinCuenta = pendientesSis.filter(esInicialCashea);
  const ordenesCashea = cuotas ? casarOrdenesCashea(cuotas, sistema.ventasCashea, sistema.ventasRecientes) : [];

  // ── Egresos
  const bEgr = vivos.filter(m => ES_EGRESO.has(m.clase));
  const sEgr = sistema.propios.filter(s => s.sentido === 'egreso');
  const sistemaJustEgr: SistemaJustificado[] = [];
  const egr = emparejar({ banco: bEgr, sistema: sEgr }, { ventanaCashea: 3, dolaresATasa: false, periodo: { desde: estado.desde, hasta: estado.hasta } });

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

  const egrSinRegistrar: Array<MovimientoBanco & { pista: string | null }> = [];
  const justificadosEgresos: Array<MovimientoBanco & { pista: string | null }> = [];
  for (const m of egr.sobrantesBanco) {
    const conPista = { ...m, pista: pista(m) };
    if (justificarSiAplica(conPista)) {
      justificadosEgresos.push(conPista);
    } else {
      egrSinRegistrar.push(conPista);
    }
  }

  egr.diferencias = egr.diferencias.filter(d => {
    if (!justificarSiAplica(d.banco)) return true;
    justificadosEgresos.push({ ...d.banco, pista: `Monto distinto de ${num2(d.diferencia)} con ${d.sistema.concepto}` });
    return false;
  });

  for (const m of sinRegistrar) {
    m.pista = m.clase === 'cuota_cashea'
      ? 'Cuota cobrada por Cashea sin su cobro registrado en el sistema'
      : (pistaInicial.get(m.fila) ?? pista(m)?.replace('Posible pago a', 'Viene de') ?? null);
  }

  // ── Lo propio del banco
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

  const totalJustificadoIngresos = r2(justificadosIngresos.reduce((a, m) => a + montoMov(m), 0));
  const totalJustificadoEgresos = r2(justificadosEgresos.reduce((a, m) => a + Math.abs(m.monto), 0));

  const conflictos = sinRegistrar.length + noLlegaron.length + inicialesSinCuenta.length + ing.diferencias.length + enOtraCuenta.length
    + egrSinRegistrar.length + egr.diferencias.length + (cruceCashea?.faltanEnBnc.length || 0) + ordenesCashea.filter(o => o.estado !== 'al_dia').length
    + ing.parejas.filter(p => p.confianza === 'revisar').length;

  const enJuego = r2(
    sinRegistrar.reduce((a, m) => a + montoMov(m), 0)
    + inicialesSinCuenta.reduce((a, s) => a + (enDolaresBanco ? s.monto : s.usd * s.tasa), 0)
    + noLlegaron.reduce((a, s) => a + (s.enDolares && !enDolaresBanco ? s.usd * s.tasa : s.monto), 0)
    + ing.diferencias.reduce((a, d) => a + Math.min(Math.abs(d.diferencia), Math.abs(montoMov(d.banco))), 0)
    + egrSinRegistrar.reduce((a, m) => a + Math.abs(m.monto), 0)
    + egr.diferencias.reduce((a, d) => a + Math.min(Math.abs(d.diferencia), Math.abs(d.banco.monto)), 0),
  );

  const noSalieron = sinJustificarSis(egr.sobrantesSistema.filter(enPeriodo), sistemaJustEgr);
  const relevantes = bIng.length + bEgr.length + noLlegaron.length + noSalieron.length + sistemaJustIng.length + sistemaJustEgr.length;
  const conciliadosN = ing.parejas.reduce((a, p) => a + p.banco.length, 0)
    + egr.parejas.reduce((a, p) => a + p.banco.length, 0)
    + justificadosIngresos.length + justificadosEgresos.length
    + sistemaJustIng.length + sistemaJustEgr.length
    + traspasosConciliados.length;
  const porcentaje = relevantes ? Math.min(100, Math.round((conciliadosN / relevantes) * 1000) / 10) : 100;

  const titulares: string[] = [];
  if (estado.saltosDeSaldo.length) titulares.push(`El archivo tiene ${estado.saltosDeSaldo.length} salto(s) de saldo: falta o sobra alguna fila.`);
  if (sinRegistrar.length) titulares.push(`${sinRegistrar.length} cobro(s) en el banco pendientes de registrar o justificar.`);
  if (justificadosIngresos.length + justificadosEgresos.length > 0) {
    titulares.push(`${justificadosIngresos.length + justificadosEgresos.length} movimiento(s) justificado(s) con soporte contable.`);
  }
  if (traspasosPendientes.length > 0) {
    titulares.push(`${traspasosPendientes.length} traspaso(s) entre cuentas del banco listos para registrar en el sistema.`);
  }
  if (enOtraCuenta.length) titulares.push(`${enOtraCuenta.length} cobro(s) registrados en el sistema con OTRA cuenta.`);
  if (inicialesSinCuenta.length) titulares.push(`${inicialesSinCuenta.length} inicial(es) de Cashea anotadas en «Cashea / BNC» que no entraron por esa cuenta.`);
  if (noLlegaron.length) titulares.push(`${noLlegaron.length} cobro(s) registrados a este banco que no aparecen en el estado.`);
  if (ing.diferencias.length + egr.diferencias.length) titulares.push(`${ing.diferencias.length + egr.diferencias.length} pago(s) con monto distinto entre banco y sistema.`);
  if (egrSinRegistrar.length) titulares.push(`${egrSinRegistrar.length} pago(s) a terceros salieron del banco sin gasto registrado.`);
  const sinVenta = ordenesCashea.filter(o => o.estado === 'venta_no_encontrada').length;
  if (sinVenta) titulares.push(`${sinVenta} orden(es) de Cashea sin venta identificable en el sistema.`);
  if (cruceCashea?.faltanEnBnc.length) titulares.push(`${cruceCashea.faltanEnBnc.length} cuota(s) de Cashea que no aparecen en el BNC.`);
  if (!titulares.length) titulares.push('Cada movimiento del banco tiene su registro o justificación en el sistema, al céntimo.');

  // ── La prueba de cada bolívar
  const absB = (ms: MovimientoBanco[]) => r2(ms.reduce((a, m) => a + Math.abs(m.monto), 0));
  const gruposMas = propiosDelBanco.map(g => ({ concepto: g.titulo, monto: r2(g.movimientos.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0)) }));
  const gruposMenos = propiosDelBanco.map(g => ({ concepto: g.titulo, monto: r2(g.movimientos.filter(m => m.monto < 0).reduce((a, m) => a - m.monto, 0)) }));
  const lado = reversos.reduce((a, x) => a + Math.max(x.original.monto, x.reverso.monto, 0), 0);
  const entradas = [
    { concepto: 'Cobros conciliados con el sistema', monto: r2(ing.parejas.reduce((a, p) => a + absB(p.banco), 0)), tono: 'ok' as const },
    ...(totalJustificadoIngresos > 0 ? [{ concepto: 'Cobros con justificativo contable', monto: totalJustificadoIngresos, tono: 'ok' as const }] : []),
    { concepto: 'Cobros registrados con otra cuenta', monto: absB(enOtraCuenta.map(x => x.banco)), tono: 'aviso' as const },
    { concepto: 'Cobros con monto distinto', monto: absB(ing.diferencias.map(d => d.banco)), tono: 'aviso' as const },
    { concepto: 'Cobros que no están en el sistema', monto: absB(sinRegistrar), tono: 'mal' as const },
    ...gruposMas.map(g => ({ ...g, tono: 'neutro' as const })),
    { concepto: 'Reversos (se anulan con su original)', monto: r2(lado), tono: 'neutro' as const },
  ].filter(x => x.monto > 0);

  const salidas = [
    { concepto: 'Pagos conciliados con gastos', monto: r2(egr.parejas.reduce((a, p) => a + absB(p.banco), 0)), tono: 'ok' as const },
    ...(totalJustificadoEgresos > 0 ? [{ concepto: 'Pagos con justificativo contable', monto: totalJustificadoEgresos, tono: 'ok' as const }] : []),
    { concepto: 'Pagos con monto distinto', monto: absB(egr.diferencias.map(d => d.banco)), tono: 'aviso' as const },
    { concepto: 'Pagos sin gasto registrado', monto: absB(egrSinRegistrar), tono: 'mal' as const },
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
      conciliados: ing.parejas, diferencias: ing.diferencias, enOtraCuenta, sinRegistrar,
      justificados: justificadosIngresos, noLlegaron, inicialesSinCuenta, sistemaJustificados: sistemaJustIng,
      totalBanco: totalIngBanco, totalSistema: totalIngSistema,
    },
    egresos: {
      conciliados: egr.parejas, diferencias: egr.diferencias,
      sinRegistrar: egrSinRegistrar,
      justificados: justificadosEgresos,
      noSalieron, sistemaJustificados: sistemaJustEgr,
      totalBanco: sum(bEgr), totalSistema: r2(sEgr.filter(enPeriodo).reduce((a, s) => a + s.monto, 0)),
    },
    propiosDelBanco, reversos,
    traspasosInternos: {
      banco: movsTraspaso,
      registrados: sistema.traspasos || [],
      conciliados: traspasosConciliados,
      pendientesRegistro: traspasosPendientes,
      total: r2(movsTraspaso.reduce((a, m) => a + Math.abs(m.monto), 0)),
    },
    cruceCashea, ordenesCashea, explicacion,
    veredicto: { cuadra: conflictos === 0 && estado.saltosDeSaldo.length === 0, porcentaje, enJuego, titulares },
    totalMovimientos: estado.movimientos.length,
  };
}

// ── Cashea por orden ───────────────────────────────────────────────────────

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
