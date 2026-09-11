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

/**
 * Los porcentajes de inicial que ofrece Cashea.
 *
 * El 0% existe y hay que poder elegirlo: Cashea aprueba planes sin inicial y
 * entonces el taller no cobra nada ese día —todo queda financiado—. Faltaba, y
 * sin él un plan al 0% había que meterlo a mano y acababa mal registrado.
 *
 * Con 0% el importe del cobro es cero, así que «¿se está usando Cashea?» NO se
 * puede deducir de que el monto sea mayor que cero. Hace falta un interruptor
 * explícito; si no, el 0% apaga el IVA obligatorio y el saldo financiado.
 */
export const PORCENTAJES_CASHEA = [0, 10, 20, 30, 40, 50, 60] as const;
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

/**
 * Un porcentaje válido, por si llega cualquier cosa de la interfaz.
 *
 * Ojo con el 0: `Number(v) || 0` lo dejaba en 0 y antes 0 no estaba en la
 * lista, así que caía en el 30 por omisión. Ahora el 0 es un plan legítimo y
 * tiene que sobrevivir; solo lo que NO está en la lista cae en el 30.
 *
 * Y ojo con lo vacío: `Number(null)` y `Number('')` valen 0, que ahora ES un
 * plan válido. Sin apartarlos primero, «esta venta no lleva Cashea» se
 * convertiría en «lleva Cashea al 0%» y aparecería un crédito financiado por el
 * total de una venta que se pagó al contado.
 */
export function normalizarPct(v: unknown): PorcentajeCashea {
  if (v === null || v === undefined || v === '') return 30;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 30;
  return PORCENTAJES_CASHEA.find(p => p === n) ?? 30;
}

/**
 * Lo que de verdad entra en caja hoy con este plan.
 *
 * Es la inicial y nada más. El resto es crédito: el taller lo cobrará en
 * cuotas, o se lo pagará Cashea, pero hoy no ha entrado. Contarlo como ingreso
 * del día infla la caja con dinero que no está.
 */
export const ingresoDeHoy = (plan: PlanCashea) => plan.inicial;

/** Y lo que queda a deber. Con 0% de inicial, es el total. */
export const creditoPendiente = (plan: PlanCashea) => plan.resto;

// ── Cómo se guarda y cómo se lee ────────────────────────────────────────────

export interface RepartoCashea {
  pct: PorcentajeCashea;
  /** Lo que se cobró hoy por Cashea. Es lo único que es ingreso del día. */
  inicial: number;
  /** Lo que queda financiado: crédito, no caja. */
  financiado: number;
  /** El total financiado por Cashea, con IVA. */
  total: number;
  iva: number;
}

/**
 * Reparte una venta financiada con Cashea entre lo cobrado y lo financiado.
 *
 * Esta es la regla que faltaba y que descuadraba la caja: en la cuenta de
 * Cashea se estaba guardando el importe COMPLETO de la venta, así que el día
 * cerraba como si hubiera entrado todo. De 27 ventas con Cashea, las 27 tenían
 * la inicial en cero y el total metido en la cuenta.
 *
 * Lo correcto: la inicial entra hoy, el resto es un crédito que se cobrará en
 * cuotas. Son dos cifras distintas y nunca se suman.
 */
export function repartirCashea(subtotalSinIva: number, pct: unknown): RepartoCashea {
  const plan = planCashea(subtotalSinIva, normalizarPct(pct));
  return {
    pct: plan.pct,
    inicial: plan.inicial,
    financiado: plan.resto,
    total: plan.total,
    iva: plan.iva,
  };
}

/**
 * Cómo interpretar una venta con Cashea ya guardada.
 *
 * Hay dos generaciones de filas y no significan lo mismo:
 *
 *   · Con el reparto hecho —`cashea_pct`, o `inicial`/`financiado` rellenos—:
 *     la cuenta de Cashea tiene solo la inicial y el resto está en `financiado`.
 *     Se leen tal cual.
 *
 *   · Sin nada de eso (las 27 históricas): la cuenta tiene el importe COMPLETO
 *     y la inicial está en cero. No se puede saber qué inicial se cobró de
 *     verdad, así que NO se adivina —repartirlo por un porcentaje inventado
 *     sería peor que dejarlo—: se devuelve como estaba y se marca `legado`
 *     para que el reporte pueda decir que esa cifra mezcla cobro y crédito.
 *
 * Se mira también `inicial`/`financiado` y no solo el porcentaje porque el bot
 * escribe el reparto sin guardar un porcentaje redondo: el operador dicta la
 * inicial en bolívares y de ahí puede salir cualquier porcentaje. Exigir
 * `cashea_pct` habría mandado esas ventas al camino de las históricas, y su
 * inicial —que sí se conoce— se habría dado por perdida.
 */
export function leerCasheaGuardado(fila: {
  cashea?: unknown;
  cashea_pct?: unknown;
  inicial?: unknown;
  financiado?: unknown;
  saldo_pendiente?: unknown;
}): { usa: boolean; legado: boolean; inicial: number; financiado: number; enCuenta: number } {
  const enCuenta = r2(Number(fila.cashea) || 0);
  const inicial = r2(Number(fila.inicial) || 0);
  const financiado = r2(Number(fila.financiado) || 0);

  const pct = fila.cashea_pct;
  const tienePct = pct !== null && pct !== undefined && Number.isFinite(Number(pct));
  const repartida = tienePct || inicial > 0 || financiado > 0;

  if (!repartida) {
    return {
      usa: enCuenta > 0,
      legado: enCuenta > 0,
      inicial: 0,
      financiado: r2(Number(fila.saldo_pendiente) || 0),
      enCuenta,
    };
  }

  return {
    usa: true,
    legado: false,
    // Con el reparto hecho, lo que hay en la cuenta ES la inicial; la columna
    // manda cuando está, por si la venta llevaba además otro método de pago.
    inicial: inicial || enCuenta,
    financiado: financiado || r2(Number(fila.saldo_pendiente) || 0),
    enCuenta,
  };
}
