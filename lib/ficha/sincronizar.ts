/**
 * Lo que pasa cuando se toca un renglón de la ficha del vehículo.
 *
 * Un renglón de la ficha no es una anotación suelta: es tres cosas a la vez.
 *
 *   1. Lo que se le COBRA al cliente        → `servicios.items` y su costo
 *   2. Lo que le COSTÓ al taller            → `egresos` (gasto de la empresa)
 *   3. La hoja de utilidad de ese carro     → `vehiculo_partidas`
 *
 * Antes solo se escribía la tercera. Por eso la ficha «se editaba en tiempo
 * real» sin pertenecer a ningún trabajo, el precio del cliente no se
 * actualizaba, y los repuestos comprados no aparecían como gasto en ningún
 * reporte: los gastos del mes salían en cero teniendo piezas compradas.
 *
 * Aquí se mantienen los tres en sincronía desde un solo sitio. Que sea uno
 * importa: con la lógica repartida entre la ficha, la orden y los egresos,
 * cualquier camino que se olvide de uno de los tres deja las cuentas
 * descuadradas y nadie se entera hasta el cierre.
 */

import { binsDeFuente, cuentaPrincipal, soloConDinero } from '@/lib/pagos/desglose';

/** La forma mínima del cliente de base de datos que se necesita. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (tabla: string) => any };

export interface RenglonOrden {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  inventario_id?: string | null;
  costo_unitario?: number;
  stock_descontado?: number;
  sin_descuento?: boolean;
  es_mano_obra?: boolean;
}

export interface Partida {
  id: string;
  servicio_id: string | null;
  vehiculo_id: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  placa: string | null;
  vehiculo_info: string | null;
  fecha: string;
  descripcion: string;
  tipo: string;
  cantidad: number;
  precio_venta: number;
  costo: number;
  origen: string;
  proveedor: string | null;
  proveedor_id: string | null;
  estado_pago: string;
  monto_pagado: number | null;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  enlace: string | null;
  clave_item: string | null;
  sede_id: string | null;
  /** De qué cuentas salió lo pagado al proveedor, cada una en su moneda. */
  metodos_pago?: Record<string, number> | null;
  /** La tasa con la que se pagaron los bolívares. */
  tasa_pago?: number | null;
}

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * La descripción reducida a comparable.
 *
 * La orden guarda sus renglones en un jsonb sin identificadores, así que la
 * única forma de emparejarlos con la ficha es por el texto. Sin normalizar,
 * bastaba una tilde o un espacio doble para no reconocerlo y ofrecerlo otra
 * vez —y cobrarlo dos veces—.
 */
export const claveRenglon = (t: unknown): string =>
  String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** Suma de los renglones de una orden. */
export const totalDeRenglones = (rs: readonly RenglonOrden[]) =>
  r2(rs.reduce((s, r) => s + (Number(r.total) || 0), 0));

// ── 1. El cobro al cliente ──────────────────────────────────────────────────

/**
 * Escribe el renglón en la orden y recalcula lo que se le cobra al cliente.
 *
 * Es lo que el usuario echaba en falta: al anotar un repuesto en la ficha, el
 * precio de la orden tenía que subir solo. Antes había que ir a Servicios y
 * teclearlo otra vez, y las dos cifras acababan distintas.
 *
 * `clave` identifica el renglón dentro del jsonb. Si ya existe, se actualiza en
 * su sitio en vez de añadir un duplicado.
 */
export async function ponerRenglonEnOrden(
  db: Db,
  servicioId: string,
  renglon: RenglonOrden,
  claveAnterior?: string | null,
): Promise<{ ok: boolean; total: number; aviso?: string }> {
  const { data: orden, error } = await db.from('servicios')
    .select('id, items, costo_estimado, costo_final')
    .eq('id', servicioId).maybeSingle();

  if (error || !orden) {
    return { ok: false, total: 0, aviso: 'No se pudo leer la orden para actualizar su precio.' };
  }

  const items: RenglonOrden[] = Array.isArray(orden.items) ? [...orden.items] : [];
  const buscada = claveRenglon(claveAnterior || renglon.descripcion);
  const i = items.findIndex(x => claveRenglon(x.descripcion) === buscada);

  if (i >= 0) {
    // Se conservan el enlace al almacén y la marca de lo ya descontado: si se
    // perdieran, el próximo guardado volvería a restar del stock.
    items[i] = { ...items[i], ...renglon };
  } else {
    items.push(renglon);
  }

  const total = totalDeRenglones(items);

  const { error: errUp } = await db.from('servicios').update({
    items,
    // `costo_estimado` es lo que se le cobra. Se recalcula siempre desde los
    // renglones: es la única forma de que la orden y la ficha digan lo mismo.
    costo_estimado: total,
    updated_at: new Date().toISOString(),
  }).eq('id', servicioId);

  if (errUp) return { ok: false, total, aviso: 'No se pudo actualizar el precio de la orden.' };
  return { ok: true, total };
}

/**
 * Quita un renglón de la orden y recalcula su precio.
 *
 * Hacía falta porque no había forma de borrar lo que la orden ya traía: los
 * renglones que venían del registro original quedaban fijos, y un trabajo
 * anotado por error se cobraba igual.
 */
export async function quitarRenglonDeOrden(
  db: Db,
  servicioId: string,
  descripcion: string,
): Promise<{ ok: boolean; total: number; quitado: RenglonOrden | null; aviso?: string }> {
  const { data: orden, error } = await db.from('servicios')
    .select('id, items').eq('id', servicioId).maybeSingle();

  if (error || !orden) {
    return { ok: false, total: 0, quitado: null, aviso: 'No se pudo leer la orden.' };
  }

  const items: RenglonOrden[] = Array.isArray(orden.items) ? orden.items : [];
  const clave = claveRenglon(descripcion);
  const quitado = items.find(x => claveRenglon(x.descripcion) === clave) || null;
  const quedan = items.filter(x => claveRenglon(x.descripcion) !== clave);

  if (!quitado) return { ok: true, total: totalDeRenglones(items), quitado: null };

  const total = totalDeRenglones(quedan);
  const { error: errUp } = await db.from('servicios').update({
    items: quedan, costo_estimado: total, updated_at: new Date().toISOString(),
  }).eq('id', servicioId);

  if (errUp) return { ok: false, total, quitado, aviso: 'No se pudo quitar el renglón de la orden.' };
  return { ok: true, total, quitado };
}

// ── 2. El gasto de la empresa ───────────────────────────────────────────────

/**
 * ¿Este renglón es un gasto del taller?
 *
 * Solo si el taller puso la pieza y le costó algo. Lo que trae el cliente no
 * cuesta, y la mano de obra propia no es una compra: registrarlas como gasto
 * duplicaría los costos del mes.
 */
export const esGastoDelTaller = (p: Pick<Partida, 'origen' | 'costo' | 'tipo'>) =>
  p.origen !== 'cliente' && Number(p.costo) > 0 && p.tipo !== 'mano_obra';

/**
 * Crea, actualiza o borra el egreso que corresponde a este renglón.
 *
 * El egreso queda atado al renglón por `egresos.partida_id`, con borrado en
 * cascada: un renglón tiene a lo sumo un gasto, y al borrar el renglón su gasto
 * se va con él. Antes no había enlace, así que borrar dejaba el gasto huérfano
 * y volver a guardar lo duplicaba.
 *
 * Y lleva el vehículo, el servicio y la fecha: es lo que permite preguntar
 * «¿cuánto me costó ESTE carro en ESTE trabajo?» y que los reportes por día
 * cuadren.
 */
export async function sincronizarEgreso(
  db: Db,
  p: Partida,
  usuario: string,
): Promise<{ creado: boolean; borrado: boolean; aviso?: string }> {
  const gasto = r2(Number(p.costo) * (Number(p.cantidad) || 1));

  const { data: existente } = await db.from('egresos')
    .select('id').eq('partida_id', p.id).maybeSingle();

  // Dejó de ser un gasto —lo trajo el cliente, o se le puso costo cero—: se
  // retira el egreso en vez de dejarlo colgado inflando los gastos.
  if (!esGastoDelTaller(p) || gasto <= 0) {
    if (existente?.id) {
      const { error } = await db.from('egresos').delete().eq('id', existente.id);
      if (error) return { creado: false, borrado: false, aviso: 'No se pudo retirar el gasto anterior.' };
      return { creado: false, borrado: true };
    }
    return { creado: false, borrado: false };
  }

  // «No aplica» en la ficha significa que no hay nada que deberle a nadie, que
  // en un egreso es lo mismo que estar pagado.
  const estado = p.estado_pago === 'no_aplica' ? 'pagado' : p.estado_pago;
  // Solo lo que de verdad salió de caja lleva cuenta.
  const pagado = estado === 'pagado' || estado === 'parcial';

  const fila = {
    partida_id: p.id,
    fecha: String(p.fecha).slice(0, 10),
    // El gasto se atribuye al carro y al trabajo concretos.
    vehiculo_id: p.vehiculo_id,
    servicio_id: p.servicio_id,
    cliente_id: p.cliente_id,
    cliente_nombre: p.cliente_nombre,
    placa: p.placa,
    vehiculo_info: p.vehiculo_info,
    cliente: p.cliente_nombre,
    categoria: categoriaDeGasto(p.tipo),
    total_egresos: gasto,
    moneda: 'USD',
    // De qué cuenta salió el dinero. `metodos_pago` lleva el reparto entero
    // —un pago puede salir de dos cuentas— y `metodo_pago` la principal, que
    // es lo que aún leen las pantallas de antes.
    metodos_pago: pagado ? soloConDinero(p.metodos_pago as never) : null,
    metodo_pago: pagado && p.metodos_pago
      ? cuentaPrincipal(binsDeFuente({ metodos_pago: p.metodos_pago }), Number(p.tasa_pago) || 0)
      : null,
    tasa_cambio: pagado ? (Number(p.tasa_pago) || null) : null,
    proveedor: p.proveedor,
    proveedor_id: p.proveedor_id,
    estado_pago: estado,
    // Un gasto pagado lleva su importe completo como abonado. Copiar el
    // `monto_pagado` del renglón tal cual escribía cero —un renglón liquidado
    // pone su abono parcial a cero— y el egreso quedaba «pagado» debiendo todo.
    monto_pagado: estado === 'pagado' ? gasto : r2(p.monto_pagado),
    fecha_pago: estado === 'pagado'
      ? (p.fecha_pago || new Date().toISOString().slice(0, 10))
      : null,
    fecha_vencimiento: p.fecha_vencimiento,
    enlace: p.enlace,
    origen: 'ficha_vehiculo',
    notas: `${p.descripcion} · ficha del vehículo ${p.placa || ''}`.trim(),
    desglose: [{
      descripcion: p.descripcion,
      cantidad: Number(p.cantidad) || 1,
      precio_unitario: r2(p.costo),
      total: gasto,
    }],
    creado_por: usuario,
    sede_id: p.sede_id,
    updated_at: new Date().toISOString(),
  };

  const { error } = existente?.id
    ? await db.from('egresos').update(fila).eq('id', existente.id)
    : await db.from('egresos').insert(fila);

  if (error) {
    return { creado: false, borrado: false, aviso: `No se pudo registrar el gasto: ${error.message}` };
  }
  return { creado: !existente?.id, borrado: false };
}

/** La categoría de gasto que le toca a cada tipo de renglón. */
function categoriaDeGasto(tipo: string): string {
  if (tipo === 'insumo') return 'insumos';
  if (tipo === 'servicio') return 'servicios';
  return 'repuestos';
}

// ── 3. Todo junto ───────────────────────────────────────────────────────────

export interface ResultadoSincronia {
  /** Lo que ahora se le cobra al cliente por esa orden. */
  totalOrden: number | null;
  gastoCreado: boolean;
  gastoBorrado: boolean;
  avisos: string[];
}

/**
 * Sincroniza la orden y el egreso a partir de un renglón de la ficha.
 *
 * Se llama DESPUÉS de guardar la partida, contra lo que quedó grabado. Nunca
 * tumba el guardado: lo que falle sale como aviso, porque la partida ya está y
 * dejarla a medias sin decirlo es peor.
 */
export async function sincronizarDesdePartida(
  db: Db,
  p: Partida,
  usuario: string,
  opciones?: { claveAnterior?: string | null; actualizarOrden?: boolean },
): Promise<ResultadoSincronia> {
  const avisos: string[] = [];
  let totalOrden: number | null = null;

  if (p.servicio_id && opciones?.actualizarOrden !== false) {
    const r = await ponerRenglonEnOrden(db, p.servicio_id, {
      descripcion: p.descripcion,
      cantidad: Number(p.cantidad) || 1,
      precio_unitario: r2(p.precio_venta),
      total: r2(Number(p.precio_venta) * (Number(p.cantidad) || 1)),
      costo_unitario: r2(p.costo),
    }, opciones?.claveAnterior);
    totalOrden = r.total;
    if (r.aviso) avisos.push(r.aviso);
  } else if (!p.servicio_id) {
    avisos.push(
      'Este renglón no está enlazado a ninguna orden, así que no cambia lo que '
      + 'se le cobra al cliente. Elige el servicio para que se actualice solo.',
    );
  }

  const g = await sincronizarEgreso(db, p, usuario);
  if (g.aviso) avisos.push(g.aviso);

  return { totalOrden, gastoCreado: g.creado, gastoBorrado: g.borrado, avisos };
}
