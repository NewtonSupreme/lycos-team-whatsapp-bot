import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ficha económica de un vehículo.
 *
 * Responde a la pregunta del dueño: "¿le estoy cobrando bien a este carro?".
 * Muestra renglón por renglón lo que se le cobra al cliente y lo que costó, de
 * dónde salió cada repuesto y si al proveedor ya se le pagó.
 *
 * Además reconcilia con lo que quedó registrado en ventas y egresos: si la
 * ficha dice una cosa y la caja dice otra, algo se escapó. Por eso los dos
 * totales viajan separados y nunca se suman entre sí.
 */

export type OrigenPartida = 'taller' | 'cliente';
export type TipoPartida = 'repuesto' | 'mano_obra' | 'servicio' | 'insumo';
export type EstadoPago = 'no_aplica' | 'pagado' | 'por_pagar' | 'parcial';

export interface Partida {
  id: string;
  vehiculo_id: string | null;
  placa: string | null;
  vehiculo_info: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  servicio_id: string | null;
  fecha: string;
  descripcion: string;
  tipo: TipoPartida;
  cantidad: number;
  precio_venta: number;
  costo: number;
  moneda: string;
  origen: OrigenPartida;
  proveedor_id: string | null;
  proveedor: string | null;
  enlace: string | null;
  comprobante_url: string | null;
  estado_pago: EstadoPago;
  monto_pagado: number;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  nota: string | null;
  registrado_por: string | null;
  sede_id: string | null;
  /**
   * La descripción normalizada del renglón de la orden del que salió.
   *
   * Sobrevive a que alguien corrija el texto de la partida después, que es lo
   * que antes rompía el emparejamiento y hacía que el mismo renglón se
   * ofreciera —y se cobrara— dos veces.
   */
  clave_item?: string | null;
}

/**
 * Estados en los que el trabajo sigue abierto.
 *
 * Importa para la ficha: sobre un trabajo cerrado, cambiar el precio al cliente
 * es reescribir algo ya cobrado. La pantalla lo advierte antes de dejar.
 */
const ABIERTOS = new Set(['pendiente', 'en_proceso', 'en_revision', 'confirmada']);

/** Una partida con sus totales ya resueltos. */
export interface PartidaCalculada extends Partida {
  total_venta: number;
  total_costo: number;
  utilidad: number;
  margen: number;
  /** Lo que aún se le debe al proveedor por este renglón. */
  saldo_proveedor: number;
}

/** Un renglón de la orden, tal como lo ve la ficha. */
export interface ItemOrden {
  descripcion?: string;
  cantidad?: number;
  precio_unitario?: number;
  total?: number;
  /** Producto del almacén, cuando el renglón es mercancía y no mano de obra. */
  inventario_id?: string | null;
  /** Lo que costó la pieza al taller. Es la mitad que faltaba para la utilidad. */
  costo_unitario?: number;
  es_mano_obra?: boolean;
  /** Unidades ya restadas del almacén por este renglón. */
  stock_descontado?: number;
  /** La descripción normalizada, para emparejarlo con la ficha. */
  clave: string;
  /** Si este renglón ya tiene su costo anotado en la ficha. */
  enFicha: boolean;
}

export interface ServicioFicha {
  id: string;
  fecha: string | null;
  tipo: string | null;
  tipo_personalizado?: string | null;
  estado: string | null;
  descripcion: string | null;
  costo_final: number | null;
  total_pagado: number | null;
  costo_estimado: number | null;
  /** El importe que se muestra, ya resuelto entre los tres campos. */
  monto: number;
  /** De cuál de los tres salió: cambia lo que significa la cifra. */
  montoOrigen: 'final' | 'pagado' | 'estimado' | 'ninguno';
  /** Si el trabajo sigue abierto. Solo sobre uno abierto se debería editar. */
  abierto: boolean;
  /** Renglones de la orden, si los tiene. */
  items: ItemOrden[];
  /** Lo que suman los renglones de la orden: el precio al cliente. */
  totalItems: number;
  /** Renglones de la ficha enlazados a este trabajo. */
  nPartidas: number;
  /** Lo que costó al taller según la ficha, solo de este trabajo. */
  costoFicha: number;
}

export interface FichaVehiculo {
  vehiculo: {
    id: string | null;
    placa: string;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    color: string | null;
    vin: string | null;
    kilometraje: number | null;
    info: string;
  } | null;
  cliente: { id: string | null; nombre: string; telefono: string | null } | null;
  partidas: PartidaCalculada[];
  totales: {
    venta: number;
    costo: number;
    utilidad: number;
    margen: number;
    /** Repuestos que puso el cliente: no cuestan, pero conviene verlos. */
    aportadoPorCliente: number;
    porPagar: number;
    partidas: number;
  };
  /** Lo que quedó asentado en caja, para comparar con la ficha. */
  registrado: {
    ingresos: number;
    egresos: number;
    utilidad: number;
    nVentas: number;
    nEgresos: number;
  };
  /** Diferencias entre la ficha y la caja. Vacío = todo cuadra. */
  alertas: string[];
  servicios: ServicioFicha[];
  /**
   * El trabajo al que se enlaza la ficha por omisión.
   *
   * La ficha se estaba usando como una libreta por vehículo: se editaba «en
   * tiempo real» sin pertenecer a ningún trabajo, así que no se sabía a qué
   * servicio cargarle el gasto ni qué precio actualizar. Abriéndola ya apuntada
   * al trabajo abierto del carro, cada renglón nace enlazado.
   *
   * Es el servicio abierto más reciente; si no hay ninguno abierto, el último.
   */
  servicioActivo: string | null;
  /**
   * Renglones sacados de las órdenes que aún no se han pasado a la ficha.
   *
   * La tabla de partidas empieza vacía en todos los vehículos, pero 351 de
   * las 522 órdenes ya traen su desglose. En vez de una ficha en blanco que
   * hay que teclear entera, se ofrecen esos renglones para añadirlos con un
   * clic y completarles el costo y el proveedor.
   */
  sugeridas: {
    servicio_id: string;
    fecha: string | null;
    descripcion: string;
    cantidad: number;
    precio_venta: number;
    /**
     * Lo que costó la pieza, cuando el renglón salió del almacén.
     *
     * Los renglones enlazados al inventario ya traen su costo, así que la
     * partida entra a la ficha con la utilidad hecha en vez de pedir que
     * alguien la busque y la teclee.
     */
    costo_unitario: number;
    /** El producto del almacén, si lo hay. */
    inventario_id: string | null;
  }[];
}

const n2 = (n: unknown) => Number((Number(n) || 0).toFixed(2));

export function calcularPartida(p: Partida): PartidaCalculada {
  const cantidad = Number(p.cantidad) || 0;
  const total_venta = n2(cantidad * (Number(p.precio_venta) || 0));
  const total_costo = n2(cantidad * (Number(p.costo) || 0));
  const utilidad = n2(total_venta - total_costo);
  // Lo que falta pagarle al proveedor por este renglón. Un renglón 'pagado' o
  // que no aplica no debe nada, aunque quedara un monto_pagado a medias.
  const saldo_proveedor =
    p.estado_pago === 'por_pagar' ? total_costo
      : p.estado_pago === 'parcial' ? Math.max(0, n2(total_costo - (Number(p.monto_pagado) || 0)))
        : 0;

  return {
    ...p,
    cantidad,
    precio_venta: n2(p.precio_venta),
    costo: n2(p.costo),
    monto_pagado: n2(p.monto_pagado),
    total_venta,
    total_costo,
    utilidad,
    margen: total_venta > 0 ? Number(((utilidad / total_venta) * 100).toFixed(1)) : 0,
    saldo_proveedor,
  };
}

interface Params {
  vehiculoId?: string | null;
  placa?: string | null;
  sedeId?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

export async function buildFichaVehiculo(db: SupabaseClient, p: Params): Promise<FichaVehiculo> {
  const placa = (p.placa || '').trim().toUpperCase();

  // ── Vehículo y cliente ───────────────────────────────────────────────────
  let vehiculo: FichaVehiculo['vehiculo'] = null;
  let cliente: FichaVehiculo['cliente'] = null;

  let vq = db.from('vehiculos').select('id, cliente_id, marca, modelo, anio, placa, color, kilometraje, vin');
  vq = p.vehiculoId ? vq.eq('id', p.vehiculoId) : vq.ilike('placa', placa);
  const { data: vehiculos } = await vq.limit(1);
  const v = vehiculos?.[0];

  if (v) {
    vehiculo = {
      id: v.id, placa: (v.placa || '').toUpperCase(),
      marca: v.marca, modelo: v.modelo, anio: v.anio, color: v.color,
      vin: v.vin, kilometraje: v.kilometraje,
      info: [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || '—',
    };
    if (v.cliente_id) {
      const { data: c } = await db.from('clientes').select('id, nombre, telefono').eq('id', v.cliente_id).maybeSingle();
      if (c) cliente = { id: c.id, nombre: c.nombre, telefono: c.telefono };
    }
  } else if (placa) {
    // La placa puede tener partidas aunque el vehículo no esté registrado.
    vehiculo = { id: null, placa, marca: null, modelo: null, anio: null, color: null, vin: null, kilometraje: null, info: '—' };
  }

  const idVehiculo = vehiculo?.id ?? null;
  const placaFinal = vehiculo?.placa || placa;

  // ── Partidas ─────────────────────────────────────────────────────────────
  let pq = db.from('vehiculo_partidas').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
  pq = idVehiculo ? pq.or(`vehiculo_id.eq.${idVehiculo},placa.ilike.${placaFinal}`) : pq.ilike('placa', placaFinal || '___sin_placa___');
  if (p.sedeId) pq = pq.eq('sede_id', p.sedeId);
  if (p.desde) pq = pq.gte('fecha', p.desde);
  if (p.hasta) pq = pq.lte('fecha', p.hasta);
  const { data: crudas } = await pq;

  const partidas = ((crudas || []) as Partida[]).map(calcularPartida);

  const totales = partidas.reduce((t, x) => ({
    venta: t.venta + x.total_venta,
    costo: t.costo + x.total_costo,
    utilidad: 0,
    margen: 0,
    aportadoPorCliente: t.aportadoPorCliente + (x.origen === 'cliente' ? 1 : 0),
    porPagar: t.porPagar + x.saldo_proveedor,
    partidas: t.partidas + 1,
  }), { venta: 0, costo: 0, utilidad: 0, margen: 0, aportadoPorCliente: 0, porPagar: 0, partidas: 0 });

  totales.venta = n2(totales.venta);
  totales.costo = n2(totales.costo);
  totales.utilidad = n2(totales.venta - totales.costo);
  totales.margen = totales.venta > 0 ? Number(((totales.utilidad / totales.venta) * 100).toFixed(1)) : 0;
  totales.porPagar = n2(totales.porPagar);

  // ── Lo que quedó en caja, para contrastar ────────────────────────────────
  const registrado = { ingresos: 0, egresos: 0, utilidad: 0, nVentas: 0, nEgresos: 0 };

  if (placaFinal || idVehiculo) {
    let ventasQ = db.from('ventas_dia').select('total_ingresos, placa, vehiculo_id');
    let egresosQ = db.from('egresos').select('total_egresos, placa, vehiculo_id');
    if (idVehiculo) {
      ventasQ = ventasQ.or(`vehiculo_id.eq.${idVehiculo},placa.ilike.${placaFinal}`);
      egresosQ = egresosQ.or(`vehiculo_id.eq.${idVehiculo},placa.ilike.${placaFinal}`);
    } else {
      ventasQ = ventasQ.ilike('placa', placaFinal);
      egresosQ = egresosQ.ilike('placa', placaFinal);
    }
    if (p.sedeId) { ventasQ = ventasQ.eq('sede_id', p.sedeId); egresosQ = egresosQ.eq('sede_id', p.sedeId); }

    const [{ data: ventas }, { data: egresos }] = await Promise.all([ventasQ, egresosQ]);
    (ventas || []).forEach(x => { registrado.ingresos += Number(x.total_ingresos) || 0; registrado.nVentas += 1; });
    (egresos || []).forEach(x => { registrado.egresos += Number(x.total_egresos) || 0; registrado.nEgresos += 1; });
    registrado.ingresos = n2(registrado.ingresos);
    registrado.egresos = n2(registrado.egresos);
    registrado.utilidad = n2(registrado.ingresos - registrado.egresos);
  }

  // ── Servicios del vehículo ───────────────────────────────────────────────
  // Se piden los TRES importes y también los renglones.
  //
  // Antes solo se leían `costo_final` y `total_pagado`, y de 522 órdenes
  // reales solo 9 tienen la primera y ninguna la segunda: el dinero está en
  // `costo_estimado` (413 órdenes). Por eso la ficha enseñaba $0,00 en casi
  // todos los servicios de todos los vehículos.
  let sq = db.from('servicios')
    .select('id, fecha, tipo, tipo_personalizado, estado, descripcion, items, '
      + 'costo_final, total_pagado, costo_estimado')
    .order('fecha', { ascending: false }).limit(20);
  sq = idVehiculo ? sq.eq('vehiculo_id', idVehiculo) : sq.ilike('placa', placaFinal || '___sin_placa___');
  if (p.sedeId) sq = sq.eq('sede_id', p.sedeId);
  const { data: serviciosRaw } = await sq;

  // El `select` va en varias líneas por legibilidad, y eso deja a PostgREST sin
  // inferir la forma de la fila. Se declara aquí, que además documenta qué se
  // pidió.
  const servicios = (serviciosRaw || []) as unknown as {
    id: string; fecha: string | null; tipo: string | null;
    tipo_personalizado: string | null; estado: string | null;
    descripcion: string | null;
    items: Omit<ItemOrden, 'clave' | 'enFicha'>[] | null;
    costo_final: number | null; total_pagado: number | null; costo_estimado: number | null;
  }[];

  // ── Emparejar los renglones de la orden con los de la ficha ─────────────
  //
  // Se compara por descripción porque es lo único que comparten: la orden
  // guarda sus renglones en un jsonb sin identificadores.
  //
  // La comparación va sin acentos ni espacios de más: el mismo renglón escrito
  // en la orden y a mano en la ficha rara vez coincide letra por letra, y
  // ofrecer de nuevo algo que ya está registrado invita a cobrarlo dos veces.
  const clave = (t: unknown) => String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  /**
   * ¿Este renglón de esta orden ya tiene su costo en la ficha?
   *
   * Se exige que la partida sea de ESTA orden, o que sea una partida vieja sin
   * orden asignada. Antes bastaba con que la descripción coincidiera en
   * cualquier parte de la ficha, así que un cambio de aceite de enero tapaba el
   * de marzo y el segundo nunca se podía costear.
   */
  const estaEnFicha = (servicioId: string, desc: string) => {
    const k = clave(desc);
    return partidas.some(x =>
      clave(x.clave_item || x.descripcion) === k
      && (x.servicio_id === servicioId || !x.servicio_id));
  };

  // ── El importe de cada servicio, resuelto ────────────────────────────────
  //
  // El orden importa: lo cobrado de verdad manda sobre lo presupuestado. Se
  // guarda de dónde salió porque no significan lo mismo —«$105 estimado» y
  // «$105 cobrado» son cosas distintas— y la pantalla lo distingue.
  const serviciosCalc: ServicioFicha[] = servicios.map(x => {
    const final = Number(x.costo_final) || 0;
    const pagado = Number(x.total_pagado) || 0;
    const estimado = Number(x.costo_estimado) || 0;
    const monto = final || pagado || estimado;
    const montoOrigen: 'final' | 'pagado' | 'estimado' | 'ninguno' =
      final ? 'final' : pagado ? 'pagado' : estimado ? 'estimado' : 'ninguno';

    const brutos = Array.isArray(x.items) ? x.items : [];
    const items: ItemOrden[] = brutos
      .filter(it => String(it?.descripcion || '').trim())
      .map(it => {
        const desc = String(it.descripcion).trim();
        return {
          ...it,
          descripcion: desc,
          clave: clave(desc),
          enFicha: estaEnFicha(x.id, desc),
        };
      });

    const mias = partidas.filter(pt => pt.servicio_id === x.id);

    return {
      ...x,
      items,
      totalItems: n2(items.reduce((s, it) =>
        s + (Number(it.total) || (Number(it.cantidad) || 1) * (Number(it.precio_unitario) || 0)), 0)),
      nPartidas: mias.length,
      costoFicha: n2(mias.reduce((s, pt) => s + pt.total_costo, 0)),
      monto: n2(monto),
      montoOrigen,
      abierto: ABIERTOS.has(String(x.estado || '').toLowerCase()),
    };
  });

  // ── A qué trabajo se engancha la ficha al abrirla ────────────────────────
  const servicioActivo =
    serviciosCalc.find(s => s.abierto)?.id ?? serviciosCalc[0]?.id ?? null;

  // ── Renglones de las órdenes que todavía no están en la ficha ───────────
  const sugeridas: FichaVehiculo['sugeridas'] = [];
  for (const sv of serviciosCalc) {
    for (const it of sv.items) {
      if (it.enFicha) continue;
      sugeridas.push({
        servicio_id: sv.id,
        fecha: sv.fecha,
        descripcion: it.descripcion!,
        cantidad: Number(it.cantidad) || 1,
        precio_venta: n2(Number(it.precio_unitario) || Number(it.total) || 0),
        costo_unitario: n2(Number(it.costo_unitario) || 0),
        inventario_id: it.inventario_id ?? null,
      });
    }
  }

  // ── Alertas: dónde la ficha y la caja no coinciden ──────────────────────
  const alertas: string[] = [];
  const dif = (a: number, b: number) => Math.abs(a - b) >= 1;

  if (totales.partidas === 0 && sugeridas.length > 0) {
    alertas.push(
      `Este vehículo tiene ${sugeridas.length} renglón(es) en sus órdenes que aún no están `
      + 'en la ficha. Añádelos para ver cuánto costó cada uno y qué se ganó.',
    );
  }
  if (totales.partidas > 0 && registrado.nVentas === 0) {
    alertas.push('La ficha tiene renglones pero no hay ninguna venta registrada para este vehículo.');
  }
  if (totales.partidas > 0 && registrado.nVentas > 0 && dif(totales.venta, registrado.ingresos)) {
    alertas.push(
      `Lo cobrado según la ficha ($${totales.venta.toFixed(2)}) no coincide con lo registrado en ventas ($${registrado.ingresos.toFixed(2)}).`,
    );
  }
  if (totales.costo > 0 && dif(totales.costo, registrado.egresos)) {
    alertas.push(
      `Los costos de la ficha ($${totales.costo.toFixed(2)}) no coinciden con los egresos registrados ($${registrado.egresos.toFixed(2)}).`,
    );
  }
  const sinPrecio = partidas.filter(x => x.total_venta === 0 && x.tipo !== 'insumo');
  if (sinPrecio.length > 0) {
    alertas.push(`${sinPrecio.length} renglón(es) sin precio al cliente: ${sinPrecio.slice(0, 3).map(x => x.descripcion).join(', ')}${sinPrecio.length > 3 ? '…' : ''}`);
  }
  const negativos = partidas.filter(x => x.utilidad < 0);
  if (negativos.length > 0) {
    alertas.push(`${negativos.length} renglón(es) se están cobrando por debajo del costo.`);
  }
  if (totales.porPagar > 0) {
    alertas.push(`Se le deben $${totales.porPagar.toFixed(2)} a proveedores por este vehículo.`);
  }

  return {
    vehiculo,
    cliente,
    partidas,
    totales,
    registrado,
    alertas,
    servicios: serviciosCalc,
    servicioActivo,
    sugeridas,
  };
}
