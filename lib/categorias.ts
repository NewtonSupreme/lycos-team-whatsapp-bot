/**
 * Catálogo ÚNICO de clasificación de servicios y métodos de pago.
 *
 * Fuente de verdad compartida por: la orden de servicio, el POS, el reporte de
 * ventas (Excel) y el chatbot. Cada categoría/método sabe a qué COLUMNA de
 * `ventas_dia` se vuelca, que es lo que el reporte de ventas lee.
 */

// ── Clasificación de servicios ──────────────────────────────────────────────
export interface CategoriaVenta {
  key: string;
  label: string;
  /** Columna de ventas_dia donde se acumula el monto (null = sin columna propia). */
  columna: string | null;
  /** Zona equivalente del motor de nómina. */
  zona: string;
}

export const CATEGORIAS_VENTA: CategoriaVenta[] = [
  { key: 'silenciador', label: 'Silenciador / Escape', columna: 'silenciador', zona: 'escape' },
  { key: 'cauchera',    label: 'Cauchera',              columna: 'cauchera',    zona: 'cauchera' },
  { key: 'alineacion',  label: 'Alineación y Balanceo', columna: 'alineacion',  zona: 'alineacion' },
  { key: 'electronica', label: 'Electrónica',           columna: 'electronica', zona: 'electronica' },
  { key: 'mecanica',    label: 'Mecánica',              columna: 'mecanica',    zona: 'mecanica' },
  { key: 'frenos',      label: 'Frenos',                columna: 'frenos',      zona: 'frenos' },
  { key: 'lavado',      label: 'Autolavado',            columna: 'lavado',      zona: 'autolavado' },
  { key: 'repuestos',   label: 'Repuestos',             columna: 'repuestos',   zona: 'general' },
  { key: 'latoneria',   label: 'Latonería y Pintura',   columna: null,          zona: 'latoneria' },
  { key: 'otro',        label: 'Otro servicio',         columna: null,          zona: 'general' },
];

export const CATEGORIA_KEYS = CATEGORIAS_VENTA.map(c => c.key);

export function getCategoria(key?: string | null): CategoriaVenta | undefined {
  if (!key) return undefined;
  return CATEGORIAS_VENTA.find(c => c.key === key);
}

export function categoriaLabel(key?: string | null): string {
  return getCategoria(key)?.label || 'Sin clasificar';
}

/** Zona de nómina equivalente a una categoría de venta. */
export function categoriaToZona(key?: string | null): string {
  return getCategoria(key)?.zona || 'general';
}

/**
 * Devuelve el objeto de columnas de `ventas_dia` con el monto puesto en la
 * categoría correcta. Así el reporte deja de amontonar todo en "Total (Servicios)".
 */
export function buildCategoriaColumns(categoria: string | null | undefined, monto: number): Record<string, number> {
  const cat = getCategoria(categoria);
  if (!cat || !cat.columna) return {};
  return { [cat.columna]: Number(monto) || 0 };
}

/**
 * Infiere la categoría a partir de texto libre (descripción / tipo de servicio).
 * Útil para clasificar registros del bot o históricos sin categoría.
 */
export function inferirCategoria(texto?: string | null): string {
  // Sin acentos: media base está escrita "reparacion" y la otra media "reparación".
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!t) return 'otro';

  // El orden importa: lo más específico primero. "liga de frenos" es frenos
  // aunque diga "liga", y "tren delantero" es alineación aunque diga "tren".
  if (/alinea|balanceo|tren delantero|caster|camber|convergencia/.test(t)) return 'alineacion';
  if (/freno|pastilla|disco de freno|liga de freno|zapata|bomba de freno/.test(t)) return 'frenos';
  if (/caucho|goma|neumat|cauchera|rotacion|ponchad|vulcaniz|rin|tripa/.test(t)) return 'cauchera';
  // Vocabulario real del taller: bajante, intermedio, punta, mofle, catalítico.
  if (/silenciador|escape|resonador|flexible|bajante|intermedio|mofle|catalit|punta de escape|soldadura|tubo|cola/.test(t)) return 'silenciador';
  if (/lavado|autolavado|pulitura|encerad|limpieza|aspirad/.test(t)) return 'lavado';
  if (/electr|scanner|escaner|bater|alternador|arranque|cableado|fusible|luces/.test(t)) return 'electronica';
  if (/laton|pintura|latoner|masilla|fondo|abolladura|golpe/.test(t)) return 'latoneria';
  if (/mecan|motor|caja|embrague|clutch|suspension|amortiguador|revision|tren trasero|rotula|bujes|correa de tiempo/.test(t)) return 'mecanica';
  if (/repuesto|filtro|aceite|refrigerante|bujia|correa|liga|valvulina/.test(t)) return 'repuestos';
  return 'otro';
}

// ── Métodos de pago ─────────────────────────────────────────────────────────
export interface MetodoPago {
  key: string;
  label: string;
  /** Columna de ventas_dia donde se acumula (null = solo va en metodos_pago jsonb). */
  columna: string | null;
  moneda: 'USD' | 'VES' | 'EUR';
}

export const METODOS_PAGO: MetodoPago[] = [
  { key: 'efectivo_usd',        label: 'Efectivo USD ($)',     columna: 'dolares',             moneda: 'USD' },
  { key: 'zelle',               label: 'Zelle',                columna: 'zelle',               moneda: 'USD' },
  { key: 'binance',             label: 'Binance',              columna: 'binance',             moneda: 'USD' },
  { key: 'cashea',              label: 'Cashea',               columna: 'cashea',              moneda: 'USD' },
  { key: 'pago_movil_banesco',  label: 'Pago Móvil Banesco',   columna: 'pago_movil_banesco',  moneda: 'VES' },
  { key: 'pago_movil_exterior', label: 'Pago Móvil Exterior',  columna: 'pago_movil_exterior', moneda: 'VES' },
  { key: 'punto_bancamiga',     label: 'Punto Bancamiga',      columna: 'punto_bancamiga',     moneda: 'VES' },
  { key: 'punto_banesco',       label: 'Punto Banesco',        columna: 'punto_banesco',       moneda: 'VES' },
  { key: 'bnc',                 label: 'BNC',                  columna: 'bnc',                 moneda: 'VES' },
  { key: 'efectivo_bs',         label: 'Efectivo Bs',          columna: 'efectivo_bs',         moneda: 'VES' },
  { key: 'transferencia',       label: 'Transferencia',        columna: null,                  moneda: 'USD' },
  // Cobro por punto de venta en divisa. No hay columna para esto en el reporte,
  // así que se registra como método conocido y `metodosSinMapear()` lo lista
  // aparte: preferible verlo pendiente de clasificar a que desaparezca.
  { key: 'punto_usd',           label: 'Punto de venta ($)',   columna: null,                  moneda: 'USD' },
  { key: 'euros',               label: 'Euros (€)',            columna: null,                  moneda: 'EUR' },
  { key: 'otro',                label: 'Otro',                 columna: null,                  moneda: 'USD' },
];

export function metodoPagoLabel(key: string): string {
  return METODOS_PAGO.find(m => m.key === key)?.label || key.replace(/_/g, ' ');
}

/**
 * Alias históricos usados por el POS/bot → clave canónica.
 *
 * Cada clave que falte aquí es dinero que desaparece del reporte: al no
 * encontrar columna, `buildPagoColumns` la descartaba en silencio. Se
 * detectaron 7 cobros por $4.103,99 con claves sin mapear, así que ahora
 * también existe `metodosSinMapear()` para que salgan a la vista en vez de
 * perderse.
 */
const ALIAS_METODO: Record<string, string> = {
  divisas: 'efectivo_usd',
  dolares: 'efectivo_usd',
  efectivo: 'efectivo_usd',
  pago_movil: 'pago_movil_banesco',
  pagomovil: 'pago_movil_banesco',
  punto_de_venta: 'punto_banesco',
  punto: 'punto_banesco',
  efectivo_ves: 'efectivo_bs',
  bolivares: 'efectivo_bs',
  // Un punto de venta en bolívares es el punto Banesco, que es la columna en Bs.
  punto_de_venta_ves: 'punto_banesco',
  punto_ves: 'punto_banesco',
  // Cashea siempre se liquida en dólares; el sufijo era ruido.
  cashea_usd: 'cashea',
  punto_de_venta_usd: 'punto_usd',
  // Ojo: `punto_de_venta_usd` NO se mapea a propósito. No hay columna de punto
  // en divisa y meterlo en la de bolívares falsearía el reporte. Sale listado
  // por `metodosSinMapear()` para que administración decida dónde va.
};

export function normalizeMetodo(key: string): string {
  const k = (key || '').toLowerCase().trim();
  return ALIAS_METODO[k] || k;
}

/**
 * Convierte `{ efectivo_usd: 30, zelle: 20 }` en las COLUMNAS de ventas_dia
 * (`{ dolares: 30, zelle: 20 }`) para que el reporte de ventas las muestre
 * exactamente donde deben ir.
 */
export function buildPagoColumns(metodos: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!metodos) return out;
  for (const [rawKey, valor] of Object.entries(metodos)) {
    const monto = Number(valor) || 0;
    if (monto <= 0) continue;
    const key = normalizeMetodo(rawKey);
    const def = METODOS_PAGO.find(m => m.key === key);
    if (def?.columna) out[def.columna] = (out[def.columna] || 0) + monto;
  }
  return out;
}

/** Todas las columnas de pago de `ventas_dia`, en un solo sitio. */
export const COLUMNAS_PAGO: readonly string[] =
  [...new Set(METODOS_PAGO.map(m => m.columna).filter(Boolean) as string[])];

/**
 * Las columnas de pago COMPLETAS, con cero en las que no llevan dinero.
 *
 * `buildPagoColumns` devuelve solo las columnas con importe, y eso está bien
 * para un alta. Pero al ACTUALIZAR una venta, las columnas que no viajan en el
 * payload conservan su valor anterior: si un cobro se pasa de Divisa a Pago
 * Móvil, la Divisa se queda con el importe viejo y el reporte suma las dos.
 *
 * Así aparecieron $130 de la nada en el reporte del 16/09 —una venta de $150
 * cobrada íntegra por pago móvil exterior que arrastraba $130 en Divisa de una
 * versión anterior de la misma venta— y ocho casos más, unos $300 y Bs 1,09
 * millones entre todos.
 *
 * Esta versión escribe las diez columnas siempre, así que el dinero que ya no
 * está se borra. Se usa solo donde el desglose que se pasa es el DEFINITIVO de
 * la venta; para un desglose parcial o aproximado, `buildPagoColumns`.
 */
export function buildPagoColumnsCompletas(
  metodos: Record<string, number> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of COLUMNAS_PAGO) out[col] = 0;
  return { ...out, ...buildPagoColumns(metodos) };
}

/**
 * Los cobros que NO caen en ninguna columna del reporte.
 *
 * Devuelve lo que `buildPagoColumns` deja fuera, para poder avisar en vez de
 * perderlo. Un método sin columna propia —transferencia, euros, otro— no es un
 * error; una clave desconocida sí, y es plata que no aparece en ningún lado.
 */
export function metodosSinMapear(
  metodos: Record<string, number> | null | undefined,
): { clave: string; monto: number; conocido: boolean }[] {
  if (!metodos) return [];
  const fuera: { clave: string; monto: number; conocido: boolean }[] = [];
  for (const [rawKey, valor] of Object.entries(metodos)) {
    const monto = Number(valor) || 0;
    if (monto <= 0) continue;
    const key = normalizeMetodo(rawKey);
    const def = METODOS_PAGO.find(m => m.key === key);
    if (!def?.columna) fuera.push({ clave: rawKey, monto, conocido: !!def });
  }
  return fuera;
}

/** Suma total de los métodos de pago. */
export function sumaMetodos(metodos: Record<string, number> | null | undefined): number {
  if (!metodos) return 0;
  return Object.values(metodos).reduce((s, v) => s + (Number(v) || 0), 0);
}

/**
 * El departamento de una venta, a partir de su categoría: uno solo.
 *
 * Al cerrar una orden desde el tablero, la venta recibía dos: el de su
 * categoría y otro deducido del «tipo» de la orden —casi siempre «repuestos»—.
 * El resumen por sistema del reporte diario sumaba así casi el doble de lo
 * vendido: 52 ventas y $5.417 contados dos veces. Lo que no tiene columna
 * propia (latonería, otros) no va a ningún departamento.
 */
export function deptItemsDeCategoria(
  categoria: string | null | undefined,
  monto: number,
): { dept: 'silenciador' | 'cauchera' | 'alineacion' | 'electronica' | 'mecanica' | 'frenos' | 'lavado' | 'repuestos'; monto: number }[] {
  const col = getCategoria(categoria)?.columna;
  const validas = ['silenciador', 'cauchera', 'alineacion', 'electronica', 'mecanica', 'frenos', 'lavado', 'repuestos'] as const;
  return col && (validas as readonly string[]).includes(col)
    ? [{ dept: col as (typeof validas)[number], monto: Number(monto) || 0 }]
    : [];
}
