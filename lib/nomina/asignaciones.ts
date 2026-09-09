import type { AsignacionEmpleado, ItemDesglose } from '@/components/nomina/PersonalYComisiones';

/**
 * Único convertidor de "quién hizo el trabajo" a los trabajos del motor de nómina.
 *
 * Lo comparten la orden de servicio y el punto de venta. Antes cada pantalla
 * armaba el payload a su manera y el POS mandaba como descripción el nombre del
 * cliente: como el motor decide el porcentaje leyendo
 * `servicio_key + tipo_trabajo + descripción`, las reglas por tipo de servicio
 * —rotación 40 %, reparación 30 %, revisión 40 %— nunca coincidían desde el POS
 * y todo caía en la regla genérica.
 */

export interface JobParaNomina {
  empleado_id: string | null;
  es_taller: boolean;
  zona: string;
  tipo_trabajo: string;
  servicio_key: string | null;
  cantidad: number;
  moneda: string;
  referencia_tabla: string;
  referencia_id: string | null;
  fecha: string;
  descripcion: string;
  ingreso_total: number;
  mano_obra: number;
  comision_manual?: number;
}

export interface ContextoTrabajo {
  items: ItemDesglose[];
  costoTotal: number;
  /** Tipo de servicio de la orden; entra en el texto que evalúan las reglas. */
  tipoTrabajo: string;
  /** Respaldo cuando la asignación no tiene renglones propios. */
  descripcionBase: string;
  referenciaTabla: string;
  referenciaId: string | null;
  fecha: string;
}

/**
 * Genera UN TRABAJO POR RENGLÓN asignado, para que cada servicio se comisione
 * con su propio porcentaje —igual que las relaciones de pago a mano—. Con
 * comisión fijada por administración se registra un solo trabajo con ese monto.
 */
export function buildJobsDesdeAsignacion(a: AsignacionEmpleado, ctx: ContextoTrabajo): JobParaNomina[] {
  const base = {
    empleado_id: a.empleado_id,
    es_taller: a.es_taller,
    zona: a.zona,
    tipo_trabajo: ctx.tipoTrabajo,
    servicio_key: a.servicio_key || null,
    cantidad: a.cantidad || 1,
    moneda: 'USD',
    referencia_tabla: ctx.referenciaTabla,
    referencia_id: ctx.referenciaId,
    fecha: ctx.fecha,
  };

  const asignados = a.item_idx.map(i => ctx.items[i]).filter(Boolean);
  const manoObraTotal = asignados.length > 0
    ? asignados.reduce((s, it) => s + (Number(it.total) || 0), 0)
    : (Number(a.mano_obra_manual) || 0);

  if (a.comision_manual != null && a.comision_manual > 0) {
    return [{
      ...base,
      descripcion: asignados.length > 0 ? asignados.map(it => it.descripcion).join(' + ') : ctx.descripcionBase,
      ingreso_total: manoObraTotal || ctx.costoTotal,
      mano_obra: manoObraTotal,
      comision_manual: Number(a.comision_manual),
    }];
  }

  if (asignados.length > 0) {
    return asignados.map(it => ({
      ...base,
      descripcion: it.descripcion,
      ingreso_total: Number(it.total) || 0,
      mano_obra: Number(it.total) || 0,
    }));
  }

  return [{
    ...base,
    descripcion: ctx.descripcionBase,
    ingreso_total: manoObraTotal || ctx.costoTotal,
    mano_obra: manoObraTotal,
  }];
}

/** Las asignaciones que sí se pueden registrar. */
export const asignacionesValidas = (v: readonly AsignacionEmpleado[]) =>
  v.filter(a => a.empleado_id || a.es_taller);
