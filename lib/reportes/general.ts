/**
 * Lo que enseña la pestaña General de Reportes.
 *
 * Igual que en Finanzas, todo viaja en DÓLARES y la conversión a bolívares se
 * hace al pintar: dos cobros hechos con tasas distintas no se pueden sumar si
 * cada uno llega ya convertido, y el total del mes cambiaría según cuándo se
 * abriera la pantalla.
 */

export interface KpiConSerie {
  valor: number;
  variacion: number | null;
  /** La serie del período, para la línea pequeña de la tarjeta. */
  serie: number[];
}

export interface TajadaReporte {
  clave: string;
  etiqueta: string;
  valor: number;
  pct: number;
  color: string;
}

export interface BarraIngreso {
  clave: string;
  etiqueta: string;
  monto: number;
  pct: number;
  color: string;
}

export interface PuntoDia {
  etiqueta: string;
  ingresos: number;
  egresos: number;
}

export interface ClienteTop {
  id: string | null;
  nombre: string;
  monto: number;
  servicios: number;
}

export interface OrdenReciente {
  id: string;
  numero: string;
  fecha: string;
  cliente: string;
  vehiculo: string;
  servicio: string;
  estado: string;
  total: number;
}

export interface ProductoUsado {
  id: string | null;
  nombre: string;
  usos: number;
  total: number;
}

export interface ReporteGeneral {
  desde: string;
  hasta: string;
  tasa: number;
  kpis: {
    ingresos: KpiConSerie;
    servicios: KpiConSerie;
    clientes: KpiConSerie;
    ticket: KpiConSerie;
  };
  ingresosVsEgresos: PuntoDia[];
  tendencia: PuntoDia[];
  serviciosPorCategoria: TajadaReporte[];
  totalServicios: number;
  ingresosPorTipo: BarraIngreso[];
  estadosOrdenes: TajadaReporte[];
  totalOrdenes: number;
  topClientes: ClienteTop[];
  ultimasOrdenes: OrdenReciente[];
  productosUsados: ProductoUsado[];
  avisos: string[];
}

/** Paleta compartida con Finanzas: la misma cosa, del mismo color. */
export const COLORES_REPORTE = [
  '#f97316', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899',
  '#14b8a6', '#eab308', '#a3a3a3',
] as const;

export const colorReporte = (i: number) => COLORES_REPORTE[i % COLORES_REPORTE.length];

/** Los colores de cada estado de orden, iguales a los del tablero de Servicios. */
export const COLOR_ESTADO: Record<string, string> = {
  completada: '#22c55e',
  completado: '#22c55e',
  finalizado: '#22c55e',
  en_proceso: '#f97316',
  en_progreso: '#f97316',
  en_revision: '#3b82f6',
  confirmada: '#8b5cf6',
  cancelada: '#ef4444',
  cancelado: '#ef4444',
  pendiente: '#a3a3a3',
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  completada: 'Completadas',
  completado: 'Completadas',
  finalizado: 'Completadas',
  en_proceso: 'En taller',
  en_progreso: 'En taller',
  en_revision: 'En revisión',
  confirmada: 'Confirmadas',
  cancelada: 'Canceladas',
  cancelado: 'Canceladas',
  pendiente: 'Pendientes',
};
