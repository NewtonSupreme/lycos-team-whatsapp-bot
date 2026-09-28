import {
  BANK_BIN_IDS, binsFromLegacyMetodos, binToUSD, emptyBins, type BankBin, type Bins,
} from '@/lib/reporte/ventas-mapping';

/**
 * Cómo se pagó algo, dicho como lo diría una persona.
 *
 * El dinero se guarda en diez cuentas —`pago_movil_banesco`, `dolares`,
 * `zelle`…—, cada una en su moneda. Eso sirve para cuadrar el día, pero no se
 * puede imprimir tal cual en una factura. Aquí se traduce a líneas del tipo
 * «Pago Móvil / Transferencia · Banesco · Bs. 12.845,90 (≈ $15,00)».
 *
 * La misma regla sirve para un cobro a un cliente y para un pago a un
 * proveedor: las cuentas son las del taller en los dos casos. Tenerla en un
 * solo sitio es lo que garantiza que la factura, el reporte de egresos y la
 * ficha del vehículo digan lo mismo del mismo dinero.
 */

export type MonedaPago = 'Bs' | 'USD' | 'EUR';

export interface LineaPago {
  /** La cuenta, o `euros` para el cobro en euros de las filas antiguas. */
  cuenta: BankBin | 'euros';
  /** Cómo se pagó: «Pago Móvil / Transferencia», «Efectivo», «Zelle»… */
  metodo: string;
  /** El banco, cuando lo hay. */
  banco: string | null;
  moneda: MonedaPago;
  /** El importe en la moneda en que entró o salió. */
  monto: number;
  /** Su equivalente en dólares, a la tasa del pago. */
  usd: number;
  /**
   * Viene de una clave genérica de antes (`pago_movil`, `efectivo_usd`) y no
   * de una de las diez cuentas: el método es cierto, la cuenta no se sabe.
   */
  generica?: boolean;
}

const NOMBRES: Record<BankBin, { metodo: string; banco: string | null; moneda: 'Bs' | 'USD' }> = {
  pago_movil_banesco: { metodo: 'Pago Móvil / Transferencia', banco: 'Banesco', moneda: 'Bs' },
  punto_banesco: { metodo: 'Punto de venta', banco: 'Banesco', moneda: 'Bs' },
  bnc: { metodo: 'Pago Móvil / Transferencia', banco: 'BNC', moneda: 'Bs' },
  punto_bancamiga: { metodo: 'Punto / Pago Móvil', banco: 'Bancamiga', moneda: 'Bs' },
  pago_movil_exterior: { metodo: 'Pago Móvil', banco: 'Banco Exterior', moneda: 'Bs' },
  efectivo_bs: { metodo: 'Efectivo en bolívares', banco: null, moneda: 'Bs' },
  dolares: { metodo: 'Efectivo en divisa', banco: null, moneda: 'USD' },
  zelle: { metodo: 'Zelle', banco: null, moneda: 'USD' },
  binance: { metodo: 'Binance', banco: null, moneda: 'USD' },
  // Lo de Cashea se liquida en el BNC: se dice así en facturas y reportes.
  cashea: { metodo: 'Cashea', banco: 'BNC', moneda: 'USD' },
};

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** Las diez cuentas leídas de las columnas de una fila (`ventas_dia`). */
export function binsDeColumnas(fila: Record<string, unknown> | null | undefined): Bins {
  const b = emptyBins();
  if (!fila) return b;
  for (const id of BANK_BIN_IDS) b[id] = r2(fila[id]);
  return b;
}

const hayDinero = (b: Bins) => BANK_BIN_IDS.some(id => (b[id] || 0) > 0);

/**
 * Las cuentas de un cobro o un pago, venga de donde venga.
 *
 * Primero las columnas por banco —el dato preciso, lo que realmente entró—; si
 * están vacías, el `metodos_pago` con las claves exactas o las genéricas de
 * antes (`pago_movil`, `efectivo_usd`…). Una fila que no trae nada devuelve
 * todas las cuentas en cero, no un «efectivo» inventado.
 */
export function binsDeFuente(fuente: {
  columnas?: Record<string, unknown> | null;
  metodos_pago?: Record<string, unknown> | null;
}): Bins {
  const col = binsDeColumnas(fuente.columnas);
  if (hayDinero(col)) return col;
  const mp = fuente.metodos_pago && typeof fuente.metodos_pago === 'object' ? fuente.metodos_pago : null;
  return binsFromLegacyMetodos(mp);
}

/**
 * Las líneas de pago, en el orden en que se suelen leer: bancos en bolívares,
 * luego divisa, y Cashea al final.
 *
 * Los euros de las filas antiguas no tienen cuenta propia —se guardaban como
 * `euros`— y se listan aparte en vez de mezclarlos con los dólares, que es lo
 * que haría la aproximación del reporte.
 */
export function lineasDePago(
  bins: Bins,
  tasa: number,
  extra?: { euros?: number; tasaEuro?: number },
): LineaPago[] {
  const lineas: LineaPago[] = [];
  for (const id of BANK_BIN_IDS) {
    const monto = r2(bins[id]);
    if (monto <= 0) continue;
    const n = NOMBRES[id];
    lineas.push({
      cuenta: id, metodo: n.metodo, banco: n.banco, moneda: n.moneda,
      monto, usd: binToUSD(id, monto, tasa),
    });
  }
  const euros = r2(extra?.euros);
  if (euros > 0) {
    const t = Number(extra?.tasaEuro) || 0;
    lineas.push({
      cuenta: 'euros', metodo: 'Efectivo en euros', banco: null, moneda: 'EUR',
      monto: euros, usd: t > 0 ? r2(euros / t) : 0,
    });
  }
  return lineas;
}

/** Los euros que traiga un `metodos_pago` antiguo. */
export function eurosDe(metodos: Record<string, unknown> | null | undefined): number {
  return r2(metodos && typeof metodos === 'object' ? (metodos as Record<string, unknown>).euros : 0);
}

/** «Pago único», «Pago mixto (3 métodos)» o «Sin pago registrado». */
export function tipoDePago(lineas: readonly LineaPago[]): string {
  if (lineas.length === 0) return 'Sin pago registrado';
  if (lineas.length === 1) return 'Pago único';
  return `Pago mixto (${lineas.length} métodos)`;
}

/** El importe con su moneda, a la venezolana: «Bs. 12.845,90», «$15,00», «€10,00». */
export function montoConMoneda(monto: number, moneda: MonedaPago): string {
  const cifra = (Number(monto) || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  if (moneda === 'Bs') return `Bs. ${cifra}`;
  if (moneda === 'EUR') return `€${cifra}`;
  return `$${cifra}`;
}

/** El método con su banco: «Pago Móvil / Transferencia · Banesco». */
export function nombreDeLinea(l: LineaPago): string {
  return l.banco ? `${l.metodo} · ${l.banco}` : l.metodo;
}

/**
 * Una frase corta para una celda: «Pago Móvil · Banco Exterior» o
 * «Mixto: Efectivo en divisa + Zelle».
 */
export function resumenCorto(lineas: readonly LineaPago[]): string {
  if (lineas.length === 0) return '—';
  if (lineas.length === 1) return nombreDeLinea(lineas[0]);
  return `Mixto: ${lineas.map(l => (l.banco ? `${l.metodo.split(' /')[0]} ${l.banco}` : l.metodo)).join(' + ')}`;
}

/** El total en dólares de unas líneas. */
export function totalUSD(lineas: readonly LineaPago[]): number {
  return r2(lineas.reduce((s, l) => s + l.usd, 0));
}

/**
 * Las claves genéricas de antes, que no dicen el banco.
 *
 * Una venta vieja guarda `{ pago_movil: 12834 }` sin decir a qué cuenta entró.
 * Atribuirla a Banesco —como hace la aproximación del reporte— sería imprimir
 * en una factura un banco que nadie registró, así que aquí se nombra el método
 * sin banco.
 */
const GENERICAS: Record<string, { metodo: string; moneda: MonedaPago }> = {
  pago_movil: { metodo: 'Pago Móvil', moneda: 'Bs' },
  pagomovil: { metodo: 'Pago Móvil', moneda: 'Bs' },
  transferencia: { metodo: 'Transferencia', moneda: 'Bs' },
  punto_de_venta: { metodo: 'Punto de venta', moneda: 'Bs' },
  punto_de_venta_ves: { metodo: 'Punto de venta', moneda: 'Bs' },
  punto: { metodo: 'Punto de venta', moneda: 'Bs' },
  punto_usd: { metodo: 'Punto de venta en divisa', moneda: 'USD' },
  punto_de_venta_usd: { metodo: 'Punto de venta en divisa', moneda: 'USD' },
  efectivo_usd: { metodo: 'Efectivo en divisa', moneda: 'USD' },
  divisas: { metodo: 'Efectivo en divisa', moneda: 'USD' },
  efectivo: { metodo: 'Efectivo en divisa', moneda: 'USD' },
  efectivo_ves: { metodo: 'Efectivo en bolívares', moneda: 'Bs' },
  bolivares: { metodo: 'Efectivo en bolívares', moneda: 'Bs' },
  cashea_usd: { metodo: 'Cashea / BNC', moneda: 'USD' },
  euros: { metodo: 'Efectivo en euros', moneda: 'EUR' },
  otro: { metodo: 'Otro', moneda: 'USD' },
};

/**
 * Las líneas de un `metodos_pago` tal cual venga: las diez cuentas con su
 * banco y las claves genéricas sin inventarle uno.
 */
export function lineasDeMetodos(
  metodos: Record<string, unknown> | null | undefined,
  tasa: number,
  tasaEuro = 0,
): LineaPago[] {
  if (!metodos || typeof metodos !== 'object') return [];
  const exactas = emptyBins();
  const sueltas: LineaPago[] = [];
  for (const [k, v] of Object.entries(metodos)) {
    const monto = r2(v);
    if (monto <= 0) continue;
    if ((BANK_BIN_IDS as string[]).includes(k)) { exactas[k as BankBin] += monto; continue; }
    const g = GENERICAS[k] || { metodo: k.replace(/_/g, ' '), moneda: 'USD' as MonedaPago };
    const usd = g.moneda === 'Bs' ? (tasa > 0 ? r2(monto / tasa) : 0)
      : g.moneda === 'EUR' ? (tasaEuro > 0 ? r2(monto / tasaEuro) : 0)
        : monto;
    sueltas.push({ cuenta: k === 'euros' ? 'euros' : 'dolares', metodo: g.metodo, banco: null, moneda: g.moneda, monto, usd, generica: true });
  }
  return [...lineasDePago(exactas, tasa), ...sueltas];
}

/**
 * La cuenta que lleva la mayor parte del dinero, o `null` si no hay pago.
 *
 * `egresos.metodo_pago` guardaba UNA cuenta y Finanzas le descuenta ahí el
 * gasto entero. Con el desglose completo en `metodos_pago` eso ya no hace
 * falta, pero la columna se sigue llenando para lo que aún la lea.
 */
export function cuentaPrincipal(bins: Bins, tasa: number): BankBin | null {
  let mejor: BankBin | null = null;
  let max = 0;
  for (const id of BANK_BIN_IDS) {
    const usd = binToUSD(id, bins[id] || 0, tasa);
    if (usd > max) { max = usd; mejor = id; }
  }
  return mejor;
}

/** Deja solo las cuentas con dinero; `null` si no queda ninguna. */
export function soloConDinero(bins: Partial<Bins> | null | undefined): Partial<Bins> | null {
  if (!bins || typeof bins !== 'object') return null;
  const out: Partial<Bins> = {};
  for (const id of BANK_BIN_IDS) {
    const v = r2((bins as Record<string, unknown>)[id]);
    if (v > 0) out[id] = v;
  }
  return Object.keys(out).length ? out : null;
}
