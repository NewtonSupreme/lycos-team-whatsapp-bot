/**
 * Cuánto de un renglón de la orden es mano de obra.
 *
 * La nómina calculaba la comisión sobre el precio completo del renglón. En un
 * renglón de mano de obra está bien, pero en uno que lleva una pieza comprada
 * por el taller —un silenciador de $55 que costó $50— el mecánico cobraba su
 * porcentaje sobre los $50 de la pieza también, como si todo fuera su trabajo.
 *
 * La mano de obra es el precio menos lo que costó la pieza que puso el taller.
 * El costo sale de la ficha del vehículo (donde se anota qué costó cada
 * repuesto) o del almacén, si la pieza salió de allí. Lo que trajo el cliente
 * no cuesta nada al taller: ese renglón es mano de obra entera.
 */

export interface RenglonParaNomina {
  total: number;
  cantidad?: number;
  /** Marcado en la orden como mano de obra. */
  es_mano_obra?: boolean;
  /** Costo unitario conocido por el almacén. */
  costo_unitario?: number | null;
}

export interface CostoDeFicha {
  /** Costo total de la pieza (cantidad × costo) según la ficha. */
  costo: number;
  /** 'taller' si la compró el taller; 'cliente' si la trajo el cliente. */
  origen: string;
  tipo: string;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function manoObraDeRenglon(r: RenglonParaNomina, ficha?: CostoDeFicha | null): number {
  const total = r2(r.total);
  if (total <= 0) return 0;
  if (r.es_mano_obra) return total;
  // La ficha manda: es donde se anota lo que de verdad costó.
  if (ficha) {
    if (ficha.origen === 'cliente' || ficha.tipo === 'mano_obra') return total;
    return Math.max(0, r2(total - r2(ficha.costo)));
  }
  const costoAlmacen = r2((Number(r.costo_unitario) || 0) * (Number(r.cantidad) || 1));
  if (costoAlmacen > 0) return Math.max(0, r2(total - costoAlmacen));
  // Sin costo conocido no hay nada que descontar.
  return total;
}
