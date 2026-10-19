// ─────────────────────────────────────────────────────────────────────────────
// Las cuatro columnas del tablero de Servicios.
//
// Los estados de la base NO cambian (ventas, nómina, reportes e inventario los
// siguen leyendo igual); solo se agrupan para verlos y se renombran:
//
//   Entrada        ← pendiente, confirmada        (el carro llegó)
//   En taller      ← en_revision, en_proceso      (lo están trabajando)
//   Pagada         ← completada / finalizado      (se cobró y se entregó)
//   Por confirmar  ← cancelada                    (antes «visitante»: vino,
//                                                   preguntó y no se quedó)
//
// Lo que pasa 24 h en Entrada sin moverse cae solo a «Por confirmar»
// (ver /api/servicios/vencer-entradas).
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnaId = 'entrada' | 'taller' | 'pagada' | 'por_confirmar';

export interface ColumnaTablero {
  id: ColumnaId;
  label: string;
  /** Estados de la base que se ven en esta columna. */
  estados: readonly string[];
  /** Estado que se guarda al soltar una orden en esta columna. */
  destino: string;
  /** Explicación corta para la cabecera. */
  ayuda: string;
}

export const COLUMNAS_TABLERO: readonly ColumnaTablero[] = [
  { id: 'entrada', label: 'Entrada', estados: ['pendiente', 'confirmada'], destino: 'pendiente', ayuda: 'Recién llegados' },
  { id: 'taller', label: 'En taller', estados: ['en_revision', 'en_proceso', 'en_progreso'], destino: 'en_proceso', ayuda: 'Trabajándose' },
  { id: 'pagada', label: 'Pagada', estados: ['completada', 'completado', 'finalizado', 'finalizada'], destino: 'completada', ayuda: 'Cobrada y entregada' },
  { id: 'por_confirmar', label: 'Por confirmar', estados: ['cancelada', 'cancelado', 'anulada'], destino: 'cancelada', ayuda: 'Solo datos: no se cobra' },
];

export function columnaDeEstado(estado?: string | null): ColumnaTablero {
  const e = String(estado || '').toLowerCase();
  return COLUMNAS_TABLERO.find(c => c.estados.includes(e)) ?? COLUMNAS_TABLERO[0];
}

/** Nombre visible de cada estado en todo el sistema (PDF, reportes, fichas). */
export const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Entrada',
  confirmada: 'Entrada',
  en_revision: 'En taller (revisión)',
  en_proceso: 'En taller',
  en_progreso: 'En taller',
  completada: 'Pagada',
  completado: 'Pagada',
  finalizado: 'Pagada',
  finalizada: 'Pagada',
  cancelada: 'Por confirmar',
  cancelado: 'Por confirmar',
  anulada: 'Por confirmar',
};

export function etiquetaEstado(estado?: string | null): string {
  const e = String(estado || '').toLowerCase();
  return ETIQUETA_ESTADO[e] ?? (e ? e.replace(/_/g, ' ') : '—');
}

/** Horas en Entrada sin moverse antes de pasar solo a «Por confirmar». */
export const HORAS_PARA_POR_CONFIRMAR = 24;
export const ESTADOS_QUE_VENCEN = ['pendiente', 'confirmada'] as const;
