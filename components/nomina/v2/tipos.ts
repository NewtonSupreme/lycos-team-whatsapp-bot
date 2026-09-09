import type { EmployeeEarnings } from '@/types';

export type Moneda = 'usd' | 'ves';

/**
 * Fila de la tabla de nómina.
 *
 * El motor calcula todo en dólares (ver `lib/payroll/currency.ts`), así que los
 * montos viajan en USD y la conversión a bolívares ocurre solo al pintar. De lo
 * contrario, cada tasa distinta que pasara por aquí dejaría cifras que ya no
 * suman entre sí.
 */
export interface FilaEmpleado {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  departamento: string;
  fotoUrl?: string | null;
  sueldoBase: number;
  comisiones: number;
  overrides: number;
  devengado: number;
  deducciones: number;
  neto: number;
  trabajos: number;
  liquidado: boolean;
  /** El cálculo completo, para el detalle, el recibo y la liquidación. */
  earnings: EmployeeEarnings;
}

export function formatoMonto(n: number, moneda: Moneda, tasa: number): string {
  const v = moneda === 'ves' ? n * tasa : n;
  return moneda === 'ves'
    ? `Bs. ${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Iniciales para el hueco del retrato mientras no haya foto. */
export function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

/** Quita acentos para que "Rodriguez" encuentre a "Rodríguez". */
export function normaliza(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
