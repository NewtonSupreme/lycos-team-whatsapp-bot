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
  const t = (texto || '').toLowerCase();
  if (!t) return 'otro';
  if (/silenciador|escape|resonador|flexible|tubo|cola/.test(t)) return 'silenciador';
  if (/alinea|balanceo|tren delantero/.test(t)) return 'alineacion';
  if (/caucho|goma|neumat|cauchera|rotaci/.test(t)) return 'cauchera';
  if (/freno|pastilla|disco|liga de freno/.test(t)) return 'frenos';
  if (/lavado|autolavado|pulitura|limpieza/.test(t)) return 'lavado';
  if (/electr|scanner|escaner|bater|alternador|arranque/.test(t)) return 'electronica';
  if (/laton|pintura|latoner/.test(t)) return 'latoneria';
  if (/repuesto|filtro|aceite|refrigerante|bujia|correa/.test(t)) return 'repuestos';
  if (/mecan|motor|caja|embrague|clutch|suspension|amortiguador|revisi/.test(t)) return 'mecanica';
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
  { key: 'euros',               label: 'Euros (€)',            columna: null,                  moneda: 'EUR' },
  { key: 'otro',                label: 'Otro',                 columna: null,                  moneda: 'USD' },
];

export function metodoPagoLabel(key: string): string {
  return METODOS_PAGO.find(m => m.key === key)?.label || key.replace(/_/g, ' ');
}

/** Alias históricos usados por el POS/bot → clave canónica. */
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

/** Suma total de los métodos de pago. */
export function sumaMetodos(metodos: Record<string, number> | null | undefined): number {
  if (!metodos) return 0;
  return Object.values(metodos).reduce((s, v) => s + (Number(v) || 0), 0);
}
