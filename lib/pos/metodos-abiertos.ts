import type { BankBin, Bins } from '@/lib/reporte/ventas-mapping';

/**
 * Qué métodos de pago hay que mostrar abiertos al reabrir un cobro.
 *
 * El panel de métodos arrancaba SIEMPRE con «Efectivo» abierto y el resto
 * plegado. Al reabrir una orden cobrada por pago móvil, la pantalla decía
 * «Efectivo» y el monto real quedaba escondido dentro de un grupo cerrado: el
 * dato estaba guardado en la base, pero parecía que no.
 *
 * Vive aquí y no dentro del componente porque es la única parte con reglas que
 * merecen prueba propia, y un `.tsx` con JSX no se puede correr suelto.
 */

/**
 * Con qué método se enseña cada cuenta.
 *
 * Hace falta elegir porque varios métodos comparten cuenta: Pago Móvil y
 * Transferencia caen los dos en Banesco, y Débito, Crédito y Punto de Venta en
 * los mismos dos puntos. Sin elegir uno, un cobro se mostraría repetido en tres
 * sitios; eligiéndolo, el dinero aparece exactamente una vez.
 */
export const METODO_DE_CUENTA: Record<BankBin, string> = {
  dolares: 'efectivo',
  efectivo_bs: 'efectivo',
  pago_movil_banesco: 'pago_movil',
  pago_movil_exterior: 'pago_movil',
  bnc: 'transferencia',
  punto_banesco: 'pdv',
  punto_bancamiga: 'pdv',
  zelle: 'zelle',
  binance: 'binance',
  cashea: 'cashea',
};

/** Los métodos que llevan dinero en este cobro, o «efectivo» si es nuevo. */
export function metodosConDinero(bins: Bins, casheaActivo: boolean): string[] {
  const abiertos = new Set<string>();
  for (const [cuenta, monto] of Object.entries(bins) as [BankBin, number][]) {
    if ((Number(monto) || 0) > 0) abiertos.add(METODO_DE_CUENTA[cuenta]);
  }
  // Un plan de Cashea al 0% no deja monto, y aun así la orden va financiada.
  if (casheaActivo) abiertos.add('cashea');
  // Un cobro nuevo empieza por lo más común.
  return abiertos.size > 0 ? [...abiertos] : ['efectivo'];
}
