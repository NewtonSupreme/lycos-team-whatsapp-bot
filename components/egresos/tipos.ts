import { binsDeFuente, lineasDeMetodos, type LineaPago } from '@/lib/pagos/desglose';
import { BANK_METHODS, emptyBins, type Bins } from '@/lib/reporte/ventas-mapping';

/** Una fila de `egresos` tal como la lee la pantalla de Reportes. */
export interface EgresoFila {
  id: string;
  fecha: string;
  hora?: string | null;
  cliente: string | null;
  total_egresos: number;
  categoria: string;
  desglose: Array<{ descripcion: string; cantidad: number; precio_unitario: number; total: number }>;
  notas: string | null;
  imagen_url: string | null;
  creado_por: string;
  created_at: string;
  cliente_id?: string | null;
  vehiculo_id?: string | null;
  servicio_id?: string | null;
  cliente_nombre?: string | null;
  vehiculo_info?: string | null;
  placa?: string | null;
  proveedor?: string | null;
  proveedor_id?: string | null;
  origen?: string | null;
  estado_pago?: string | null;
  monto_pagado?: number | null;
  fecha_pago?: string | null;
  fecha_vencimiento?: string | null;
  metodo_pago?: string | null;
  metodos_pago?: Record<string, number> | null;
  moneda?: string | null;
  tasa_cambio?: number | null;
  enlace?: string | null;
  partida_id?: string | null;
  orden_compra_id?: string | null;
}

/**
 * Las categorías de gasto, en dos grupos que no se pueden mezclar.
 *
 *   · Costos de los carros: lo que se gasta en un trabajo concreto —la pieza,
 *     el insumo, el lavado o la rectificación que se manda a hacer fuera—. Se
 *     descuenta de lo que se ganó con ESE carro.
 *   · Gastos del taller: lo que cuesta tener el taller abierto —luz, agua,
 *     alquiler, nómina, herramientas—. No es de ningún carro.
 *
 * Antes un lavado mandado a hacer para un carro caía en «Servicios (luz,
 * agua…)», y el reporte sumaba la luz del mes con los trabajos de terceros.
 */
export type GrupoEgreso = 'carros' | 'taller';

export const CATEGORIAS_EGRESO: { id: string; label: string; grupo: GrupoEgreso }[] = [
  { id: 'repuestos', label: 'Repuestos', grupo: 'carros' },
  { id: 'insumos', label: 'Insumos (aceites, grasas, silicón…)', grupo: 'carros' },
  { id: 'trabajos_terceros', label: 'Trabajos de terceros (lavado, torno, rectificación…)', grupo: 'carros' },
  { id: 'servicios', label: 'Servicios públicos (luz, agua, internet, teléfono)', grupo: 'taller' },
  { id: 'local', label: 'Alquiler y mantenimiento del local', grupo: 'taller' },
  { id: 'nomina', label: 'Nómina / personal', grupo: 'taller' },
  { id: 'herramientas', label: 'Herramientas y equipos', grupo: 'taller' },
  { id: 'transporte', label: 'Transporte (gasolina, fletes, motorizado)', grupo: 'taller' },
  { id: 'impuestos', label: 'Impuestos y permisos', grupo: 'taller' },
  { id: 'otro', label: 'Otro gasto', grupo: 'taller' },
];

/** El grupo de un gasto: si va contra un carro o es del taller. */
export function grupoDe(e: { categoria?: string | null; placa?: string | null; vehiculo_id?: string | null }): GrupoEgreso {
  const cat = CATEGORIAS_EGRESO.find(c => c.id === e.categoria);
  // Manda la categoría. Solo un gasto «otro» (o sin categoría) con placa se
  // entiende como costo de ese carro.
  if (cat && cat.id !== 'otro') return cat.grupo;
  return e.placa || e.vehiculo_id ? 'carros' : 'taller';
}

export { categoriaSugerida } from '@/lib/egresos/categoria';

export const etiquetaCategoria = (id?: string | null) =>
  CATEGORIAS_EGRESO.find(c => c.id === id)?.label.replace(/\s*\(.*\)$/, '')
  || (id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ') : 'Sin categoría');

export const ORIGENES: Record<string, string> = {
  ficha_vehiculo: 'Ficha del vehículo',
  panel: 'Registro manual',
  orden_compra: 'Orden de compra',
  bot: 'Bot de WhatsApp',
  whatsapp: 'Bot de WhatsApp',
  escaneo: 'Escaneado',
};

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cuánto de este gasto ya salió de caja, en dólares.
 *
 * Un egreso sin estado es de antes de que existiera la deuda con proveedores:
 * se registraba cuando ya estaba pagado.
 */
export function pagadoDe(e: EgresoFila): number {
  const total = r2(e.total_egresos);
  if (!e.estado_pago || e.estado_pago === 'pagado') return total;
  if (e.estado_pago === 'parcial') return Math.min(total, r2(e.monto_pagado));
  return 0;
}

export const debeDe = (e: EgresoFila) => Math.max(0, r2(r2(e.total_egresos) - pagadoDe(e)));

/**
 * De qué cuentas salió, cada una en su moneda.
 *
 * Con el reparto guardado (`metodos_pago`) es exacto. Los egresos de antes
 * solo dicen UNA cuenta en `metodo_pago` y el importe en dólares: se pasa a la
 * moneda de esa cuenta con la tasa del egreso. Si la cuenta no es una de las
 * diez —`efectivo_usd`, `punto_usd`— se lee como su equivalente.
 */
export function cuentasDe(e: EgresoFila): Bins {
  const pagado = pagadoDe(e);
  if (pagado <= 0) return emptyBins();
  if (e.metodos_pago && Object.values(e.metodos_pago).some(v => Number(v) > 0)) {
    return binsDeFuente({ metodos_pago: e.metodos_pago });
  }
  if (!e.metodo_pago) return emptyBins();
  const clave = e.metodo_pago === 'efectivo_usd' ? 'dolares' : e.metodo_pago;
  const meta = BANK_METHODS.find(m => m.id === clave);
  if (!meta) return emptyBins();
  const tasa = Number(e.tasa_cambio) || 0;
  const b = emptyBins();
  b[meta.id] = meta.moneda === 'Bs' ? (tasa > 0 ? r2(pagado * tasa) : 0) : pagado;
  return b;
}

/** Las líneas de pago de un egreso, para enseñarlas. */
export function lineasDeEgreso(e: EgresoFila): LineaPago[] {
  const b = cuentasDe(e);
  const plano: Record<string, number> = {};
  for (const [k, v] of Object.entries(b)) if (v > 0) plano[k] = v;
  return lineasDeMetodos(plano, Number(e.tasa_cambio) || 0);
}

/** El concepto del gasto en una línea. */
export function conceptoDe(e: EgresoFila): string {
  const items = Array.isArray(e.desglose) ? e.desglose.map(d => d?.descripcion).filter(Boolean) : [];
  if (items.length) return items.join(', ');
  const nota = String(e.notas || '').replace(/·\s*ficha del vehículo.*$/i, '').trim();
  return nota || etiquetaCategoria(e.categoria);
}
