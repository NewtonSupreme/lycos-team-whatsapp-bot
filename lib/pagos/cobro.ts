import {
  BANK_BIN_IDS, BANK_METHODS, binsTotalUSD, emptyBins, type BankBin, type Bins,
} from '@/lib/reporte/ventas-mapping';

/** Las cuentas que se llevan en bolívares. */
const CUENTAS_BS: BankBin[] = BANK_METHODS.filter(m => m.moneda === 'Bs').map(m => m.id);

/**
 * Cobrar una deuda: un abono o el pago completo de una venta pendiente.
 *
 * Una venta pendiente guarda dos deudas distintas dentro de su saldo:
 *   · lo que financió Cashea (`financiado`), que paga Cashea y entra al BNC;
 *   · lo que debe el propio cliente (`por_cobrar`).
 * Un cobro por Cashea baja primero lo financiado; cualquier otro método, lo
 * que debe el cliente. Si sobra de uno, pasa al otro.
 *
 * El cobro es un hecho con su propio día: la venta conserva su fecha, y el
 * dinero cuenta en el día en que entró. Aquí no hay base de datos, solo la
 * cuenta, para poder probarla y usarla igual en la API y en la pantalla.
 */

export interface VentaPendiente {
  saldo_pendiente?: number | string | null;
  financiado?: number | string | null;
  por_cobrar?: number | string | null;
  abono?: number | string | null;
}

export interface ResultadoCobro {
  /** Lo cobrado ahora, en dólares a la tasa del cobro. */
  montoUSD: number;
  /** La parte en bolívares, para `abonos.monto_bs`. */
  montoBs: number;
  saldoAntes: number;
  saldoDespues: number;
  financiado: number;
  porCobrar: number;
  abonoTotal: number;
  estado: 'pagado' | 'pendiente';
  /** El cobro liquida la venta. */
  liquida: boolean;
}

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** Menos de un céntimo por dólar de diferencia es redondeo de la tasa. */
export const margenCobro = (saldo: number) => Math.max(0.05, saldo * 0.01);

/** Solo las diez cuentas, con importes positivos. */
export function limpiarCuentas(entrada: Record<string, unknown> | null | undefined): Bins {
  const b = emptyBins();
  if (!entrada || typeof entrada !== 'object') return b;
  for (const id of BANK_BIN_IDS) {
    const v = r2((entrada as Record<string, unknown>)[id]);
    if (v > 0) b[id] = v;
  }
  return b;
}

export type ErrorCobro = 'sin_monto' | 'sin_saldo' | 'pasa_del_saldo' | 'sin_tasa';

export function calcularCobro(
  venta: VentaPendiente,
  cuentas: Bins,
  tasa: number,
): ResultadoCobro | { error: ErrorCobro; detalle: string } {
  const saldo = r2(venta.saldo_pendiente);
  if (saldo <= 0.009) return { error: 'sin_saldo', detalle: 'Esta venta ya no debe nada.' };

  const hayBs = CUENTAS_BS.some(id => cuentas[id] > 0);
  if (hayBs && !(tasa > 0)) return { error: 'sin_tasa', detalle: 'Falta la tasa para convertir los bolívares.' };

  const monto = binsTotalUSD(cuentas, tasa);
  if (monto <= 0) return { error: 'sin_monto', detalle: 'Indica cuánto se cobró y por dónde.' };
  if (monto > saldo + margenCobro(saldo)) {
    return {
      error: 'pasa_del_saldo',
      detalle: `Se cobran $${monto.toFixed(2)} y la venta solo debe $${saldo.toFixed(2)}.`,
    };
  }

  // Lo que queda por debajo del margen es redondeo: la venta queda saldada.
  const liquida = saldo - monto <= margenCobro(saldo);
  const aplicado = liquida ? saldo : monto;

  let financiado = r2(venta.financiado);
  let porCobrar = r2(venta.por_cobrar);
  // Las ventas viejas solo tenían el saldo: la deuda sin repartir es del cliente.
  if (r2(financiado + porCobrar) < saldo - 0.01) porCobrar = r2(saldo - financiado);

  const deCashea = Math.min(aplicado, r2(cuentas.cashea));
  let resto = r2(aplicado);
  const bajaFinanciado = (x: number) => { const b = Math.min(financiado, x); financiado = r2(financiado - b); resto = r2(resto - b); };
  const bajaCliente = (x: number) => { const b = Math.min(porCobrar, x); porCobrar = r2(porCobrar - b); resto = r2(resto - b); };
  bajaFinanciado(deCashea);
  bajaCliente(resto);
  bajaFinanciado(resto);

  const saldoDespues = liquida ? 0 : r2(Math.max(0, saldo - aplicado));
  if (liquida) { financiado = 0; porCobrar = 0; }

  const montoBs = r2(CUENTAS_BS.reduce((s, id) => s + (cuentas[id] || 0), 0));

  return {
    montoUSD: r2(monto),
    montoBs,
    saldoAntes: saldo,
    saldoDespues,
    financiado,
    porCobrar,
    abonoTotal: r2(r2(venta.abono) + monto),
    estado: saldoDespues > 0.009 ? 'pendiente' : 'pagado',
    liquida,
  };
}
