/**
 * Descuento de inventario desde las órdenes de servicio y del taller.
 *
 * El punto de venta ya descontaba porque su carrito sale del catálogo y cada
 * renglón lleva el `id` del producto. Las órdenes de servicio y las del taller
 * escriben sus renglones a mano —«ALINEACIÓN», «Instalación de resonador»— sin
 * enlace a nada, así que el repuesto salía físicamente del almacén y el stock
 * seguía intacto.
 *
 * Aquí se cierra ese hueco sin obligar a que TODO venga del inventario: la mano
 * de obra y los servicios no son productos y no deben tener existencias. Un
 * renglón descuenta solo si alguien lo eligió del catálogo.
 *
 * Lo delicado es no descontar dos veces. Una orden se edita varias veces —se
 * añade trabajo, se corrige el precio, se cambia el estado— y cada guardado
 * volvería a restar. Por eso el propio renglón recuerda que ya se descontó:
 * `stock_descontado` es la marca, y va dentro del renglón para que viaje con él
 * sin tablas nuevas.
 */

export interface RenglonServicio {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  /** Producto del catálogo. Sin esto, el renglón no toca el inventario. */
  inventario_id?: string | null;
  /** Cuántas unidades ya se restaron del stock por este renglón. */
  stock_descontado?: number;
  /** Costo unitario al momento de tomarlo, para la utilidad real. */
  costo_unitario?: number;
  /**
   * El renglón dejó de descontar (alguien lo desligó del almacén).
   *
   * Se marca en vez de borrar `inventario_id` porque lo que ya salió del stock
   * hay que poder devolverlo: sin saber de qué producto era, esas unidades
   * quedarían restadas para siempre.
   */
  sin_descuento?: boolean;
}

export interface ResultadoDescuento {
  /** Los renglones con su marca de descuento al día. */
  items: RenglonServicio[];
  /** Qué se movió, para poder decirlo y para el registro de actividad. */
  movimientos: { nombre: string; cantidad: number; stockAntes: number; stockDespues: number }[];
  /** Problemas que NO impiden guardar, pero hay que contar. */
  avisos: string[];
}

/**
 * Lo mínimo que se necesita del cliente de base de datos.
 *
 * Describirlo estructuralmente hacía que TypeScript intentara casarlo con los
 * tipos generados de Supabase y se rindiera («type instantiation is excessively
 * deep»). Aquí sólo hace falta poder consultar y actualizar, así que se pide
 * eso y nada más.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteDb = { from: (tabla: string) => any };

const entero = (n: unknown) => Math.max(0, Math.round(Number(n) || 0));

/**
 * Ajusta el stock según los renglones de una orden.
 *
 * Devuelve los renglones actualizados: hay que guardarlos, porque llevan la
 * marca de lo ya descontado. Si no se guardan, el siguiente guardado vuelve a
 * restar.
 *
 * Soporta que la cantidad de un renglón CAMBIE: si estaba en 2 y pasa a 5,
 * resta 3 más; si baja a 1, devuelve 1 al almacén. Eso es lo que permite
 * corregir un error sin descuadrar las existencias.
 */
export async function ajustarInventarioDeOrden(
  db: ClienteDb,
  items: readonly RenglonServicio[],
): Promise<ResultadoDescuento> {
  const salida: RenglonServicio[] = items.map(x => ({ ...x }));
  const movimientos: ResultadoDescuento['movimientos'] = [];
  const avisos: string[] = [];

  const delCatalogo = salida.filter(x => x.inventario_id);
  if (delCatalogo.length === 0) return { items: salida, movimientos, avisos };

  const ids = [...new Set(delCatalogo.map(x => String(x.inventario_id)))];

  const { data, error } = await db.from('inventario').select('id, nombre, stock, precio_usd').in('id', ids);
  if (error) {
    avisos.push('No se pudo leer el inventario, así que no se ajustó el stock.');
    return { items: salida, movimientos, avisos };
  }

  const catalogo = new Map(
    ((data || []) as { id: string; nombre: string; stock: number; precio_usd: number }[])
      .map(p => [p.id, p]),
  );

  // Varios renglones pueden apuntar al mismo producto: se acumula el neto por
  // producto antes de escribir, o la segunda escritura pisaría la primera.
  const neto = new Map<string, number>();

  for (const it of salida) {
    if (!it.inventario_id) continue;
    const prod = catalogo.get(String(it.inventario_id));
    if (!prod) {
      avisos.push(`«${it.descripcion}» apunta a un producto que ya no está en el inventario.`);
      continue;
    }
    // Un renglón desligado tiene objetivo cero: la diferencia contra lo ya
    // restado es justamente lo que hay que devolver al almacén.
    const quiere = it.sin_descuento ? 0 : entero(it.cantidad);
    const yaRestado = entero(it.stock_descontado);
    const diferencia = quiere - yaRestado;
    if (diferencia !== 0) neto.set(prod.id, (neto.get(prod.id) || 0) + diferencia);
    it.stock_descontado = quiere;
  }

  for (const [id, cambio] of neto) {
    const prod = catalogo.get(id)!;
    const antes = entero(prod.stock);

    // El stock no baja de cero: es un contador de lo que hay, no una deuda. Se
    // avisa porque significa que se vendió algo que el sistema no tenía.
    const despues = Math.max(0, antes - cambio);
    if (cambio > antes) {
      avisos.push(
        `«${prod.nombre}»: se necesitan ${cambio} y solo había ${antes} en existencia. `
        + 'El stock queda en 0; revisa si falta cargar mercancía.',
      );
    }

    const { error: e } = await db.from('inventario')
      .update({ stock: despues, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (e) {
      avisos.push(`No se pudo ajustar el stock de «${prod.nombre}».`);
      // Se deshace la marca: si no se restó, el renglón no puede decir que sí.
      for (const it of salida) {
        if (String(it.inventario_id) === id) it.stock_descontado = entero(it.stock_descontado) - cambio;
      }
      continue;
    }

    movimientos.push({ nombre: prod.nombre, cantidad: cambio, stockAntes: antes, stockDespues: despues });
  }

  return { items: salida, movimientos, avisos };
}

/**
 * Devuelve al almacén todo lo que una orden había descontado.
 *
 * Se usa al anular o cancelar: el repuesto que no salió del taller tiene que
 * volver a contarse, o el inventario queda corto para siempre.
 */
export async function devolverInventarioDeOrden(
  db: ClienteDb,
  items: readonly RenglonServicio[],
): Promise<ResultadoDescuento> {
  // Devolver es descontar con cantidad cero: el ajuste calcula la diferencia.
  const aCero = items.map(x => ({ ...x, cantidad: 0 }));
  const r = await ajustarInventarioDeOrden(db, aCero);
  // Se conserva la cantidad original del renglón; lo que se pone a cero es la
  // marca, para que reactivar la orden vuelva a descontar.
  return {
    ...r,
    items: r.items.map((x, i) => ({ ...x, cantidad: items[i]?.cantidad ?? x.cantidad, stock_descontado: 0 })),
  };
}

/** Resumen legible de lo que se movió, para el aviso al usuario. */
export function resumirMovimientos(m: ResultadoDescuento['movimientos']): string {
  if (m.length === 0) return '';
  const partes = m.map(x => x.cantidad > 0
    ? `${x.nombre} −${x.cantidad} (quedan ${x.stockDespues})`
    : `${x.nombre} +${Math.abs(x.cantidad)} (quedan ${x.stockDespues})`);
  return `Inventario: ${partes.join(' · ')}`;
}
