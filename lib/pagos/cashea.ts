/**
 * Las cuentas de un financiamiento con Cashea.
 *
 * Están aquí y no en cada pantalla porque el punto de venta y las órdenes de
 * servicio tienen que llegar al mismo número. Cuando cada uno lo calculaba por
 * su cuenta, la inicial del POS y la del servicio no coincidían y el cliente
 * pagaba una cosa distinta según por dónde se le cobrara.
 *
 * Dos reglas que no son negociables:
 *
 *   · Cashea financia SOBRE el precio con IVA. El 16% no es opcional en cuanto
 *     se usa Cashea: de ese total salen la inicial y las cuotas, así que
 *     calcularlo sin IVA daría una inicial más baja que la que Cashea cobra.
 *
 *   · La inicial se cobra HOY; el resto queda pendiente por cobrar, no como
 *     venta cerrada. Contarlo todo como cobrado infla la caja del día con
 *     dinero que aún no ha entrado.
 *
 * Sobre la moneda: al cliente se le enseña en bolívares, porque es como paga.
 * Pero el importe que se guarda va en dólares, que es la moneda de la cuenta de
 * Cashea en el reporte. Meter ahí los bolívares es lo que infló las cuentas en
 * $44.103 —tres cobros con el monto en Bs dentro de una cuenta en dólares—.
 */

export const IVA = 0.16;

/** Los porcentajes de inicial que ofrece Cashea. */
export const PORCENTAJES_CASHEA = [10, 20, 30, 40, 50, 60] as const;
export type PorcentajeCashea = (typeof PORCENTAJES_CASHEA)[number];

/** Cuántas cuotas van después de la inicial. Hoy Cashea cobra tres. */
export const CUOTAS_CASHEA = 3;

export interface PlanCashea {
  /** Precio sin IVA. */
  subtotal: number;
  /** Lo que Cashea financia: el precio con el 16% incluido. */
  total: number;
  /** El 16% en dinero, para poder mostrarlo aparte. */
  iva: number;
  pct: PorcentajeCashea;
  /** Lo que el cliente paga hoy. */
  inicial: number;
  /** Lo que queda pendiente después de la inicial. */
  resto: number;
  /** Cada una de las cuotas quincenales. */
  cuota: number;
  cuotas: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Calcula el plan a partir del precio SIN IVA. */
export function planCashea(subtotalSinIva: number, pct: PorcentajeCashea): PlanCashea {
  const subtotal = r2(Math.max(0, Number(subtotalSinIva) || 0));
  const total = r2(subtotal * (1 + IVA));
  const inicial = r2(total * (pct / 100));
  const resto = r2(total - inicial);
  return {
    subtotal,
    total,
    iva: r2(total - subtotal),
    pct,
    inicial,
    resto,
    // La última cuota absorbe el céntimo del redondeo; se reparte a la vista.
    cuota: r2(resto / CUOTAS_CASHEA),
    cuotas: CUOTAS_CASHEA,
  };
}

/** Un porcentaje válido, por si llega cualquier cosa de la interfaz. */
export function normalizarPct(v: unknown): PorcentajeCashea {
  const n = Math.round(Number(v) || 0);
  const encontrado = PORCENTAJES_CASHEA.find(p => p === n);
  return encontrado ?? 30;
}
