// Los estados de cuenta que se pueden conciliar. Aparte del lector para que el
// navegador (PDF, pantalla) no cargue la librería de Excel.

export type BancoConciliable = 'banesco' | 'bnc' | 'bnc_cuotas' | 'exterior' | 'cashea';

export const BANCOS_CONCILIABLES: Record<BancoConciliable, { nombre: string; moneda: 'Bs' | 'USD'; plantilla: string }> = {
  banesco: { nombre: 'Banesco', moneda: 'Bs', plantilla: 'Movimientos de Banesco Online exportados a Excel (.xls)' },
  bnc: { nombre: 'BNC 8201 · Iniciales / General', moneda: 'Bs', plantilla: 'Reporte «Movimientos entre fechas» de BNC en Línea (.xls)' },
  bnc_cuotas: { nombre: 'BNC 8215 · Cuotas Cashea', moneda: 'Bs', plantilla: 'Reporte «Movimientos entre fechas» de BNC en Línea cuenta 8215 (.xls)' },
  exterior: { nombre: 'Banco Exterior', moneda: 'Bs', plantilla: 'Movimientos de Exterior en Línea exportados a Excel (.xls)' },
  cashea: { nombre: 'Cashea', moneda: 'USD', plantilla: 'Reporte de pagos de cuotas del portal de comercios Cashea (.xlsx)' },
};

