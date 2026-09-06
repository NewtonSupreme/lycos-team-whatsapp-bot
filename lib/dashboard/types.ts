import type { LucideIcon } from 'lucide-react';
import type { Permisos } from '@/types';

/** Anchos permitidos, en columnas de una retícula de 12. */
export type WidgetSpan = 3 | 4 | 5 | 6 | 8 | 12;

/** Altos, en pasos fijos para que las filas no queden dentadas. */
export type WidgetHeight = 'sm' | 'md' | 'lg';

export const HEIGHT_CLASS: Record<WidgetHeight, string> = {
  sm: 'min-h-[9rem]',
  md: 'min-h-[15rem]',
  lg: 'min-h-[21rem]',
};

export const SPAN_CLASS: Record<WidgetSpan, string> = {
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
};

/** Cómo se dibuja el dato. El usuario elige entre las formas que tengan sentido. */
export type WidgetVisual = 'kpi' | 'linea' | 'area' | 'barras' | 'dona' | 'lista' | 'medidor';

export const VISUAL_LABEL: Record<WidgetVisual, string> = {
  kpi: 'Número',
  linea: 'Línea',
  area: 'Área',
  barras: 'Barras',
  dona: 'Dona',
  lista: 'Lista',
  medidor: 'Medidor',
};

export interface WidgetContext {
  /** Sede activa. null = todas. */
  sedeId: string | null;
}

/**
 * Definición de un widget disponible en el catálogo.
 *
 * Cada widget trae su propia consulta en vez de recibir un paquete de datos
 * común: así el panel solo pide a la base lo que el usuario realmente puso en
 * pantalla, y agregar un widget nuevo no obliga a tocar un cargador central.
 */
export interface WidgetDefinition<T = unknown> {
  id: string;
  title: string;
  description: string;
  /** De qué módulo sale el dato. Agrupa el catálogo. */
  module: string;
  icon: LucideIcon;
  permKey?: keyof Permisos;
  defaultSpan: WidgetSpan;
  defaultHeight: WidgetHeight;
  /** Formas de dibujo que tienen sentido para este dato. */
  visuals: readonly WidgetVisual[];
  load: (ctx: WidgetContext) => Promise<T>;
  render: (data: T, visual: WidgetVisual) => React.ReactNode;
}

/** Una instancia colocada en el panel del usuario. */
export interface WidgetInstance {
  /** Identificador de la instancia: un mismo widget puede repetirse. */
  key: string;
  defId: string;
  span: WidgetSpan;
  height: WidgetHeight;
  visual: WidgetVisual;
  /** Título propio, si el usuario lo renombró. */
  title?: string;
}

export interface DashboardLayout {
  version: 1;
  widgets: WidgetInstance[];
}
