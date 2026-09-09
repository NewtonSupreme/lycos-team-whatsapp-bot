/**
 * Los siete recursos de RRHH, con su tabla y los campos que la API acepta.
 *
 * La lista blanca es deliberada: el cliente manda un objeto y solo estas claves
 * llegan a la base. Así una columna nueva no queda escribible por accidente y
 * `sede_id` siempre lo pone el servidor, nunca el navegador.
 */
export interface RecursoRRHH {
  tabla: string;
  campos: readonly string[];
  /** Columna y dirección del orden por defecto. */
  orden: { campo: string; asc: boolean };
  /** Recursos que cuelgan de un empleado (todos menos reclutamiento). */
  porEmpleado: boolean;
}

export const RECURSOS = {
  asistencia: {
    tabla: 'rrhh_asistencia',
    campos: ['empleado_id', 'fecha', 'estado', 'hora_entrada', 'hora_salida', 'nota', 'registrado_por'],
    orden: { campo: 'fecha', asc: false },
    porEmpleado: true,
  },
  vacaciones: {
    tabla: 'rrhh_vacaciones',
    campos: ['empleado_id', 'fecha_inicio', 'fecha_fin', 'dias', 'estado', 'nota', 'aprobado_por'],
    orden: { campo: 'fecha_inicio', asc: false },
    porEmpleado: true,
  },
  permisos: {
    tabla: 'rrhh_permisos',
    campos: ['empleado_id', 'fecha_inicio', 'fecha_fin', 'tipo', 'motivo', 'remunerado', 'estado', 'aprobado_por'],
    orden: { campo: 'fecha_inicio', asc: false },
    porEmpleado: true,
  },
  evaluaciones: {
    tabla: 'rrhh_evaluaciones',
    campos: ['empleado_id', 'fecha', 'puntaje', 'periodo', 'comentario', 'evaluador'],
    orden: { campo: 'fecha', asc: false },
    porEmpleado: true,
  },
  capacitaciones: {
    tabla: 'rrhh_capacitaciones',
    campos: ['empleado_id', 'titulo', 'fecha', 'estado', 'institucion', 'nota'],
    orden: { campo: 'fecha', asc: false },
    porEmpleado: true,
  },
  documentos: {
    tabla: 'rrhh_documentos',
    campos: ['empleado_id', 'tipo', 'nombre', 'url', 'vence_el'],
    orden: { campo: 'created_at', asc: false },
    porEmpleado: true,
  },
  reclutamiento: {
    tabla: 'rrhh_reclutamiento',
    campos: ['candidato', 'cargo', 'telefono', 'email', 'fuente', 'estado', 'nota'],
    orden: { campo: 'created_at', asc: false },
    porEmpleado: false,
  },
} as const satisfies Record<string, RecursoRRHH>;

export type RecursoKey = keyof typeof RECURSOS;

export const esRecurso = (v: string): v is RecursoKey =>
  Object.prototype.hasOwnProperty.call(RECURSOS, v);

/** Deja pasar solo los campos declarados del recurso. */
export function limpiar(recurso: RecursoKey, body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of RECURSOS[recurso].campos) {
    if (body?.[campo] !== undefined) out[campo] = body[campo];
  }
  return out;
}

/** Días que abarca un rango, ambos extremos incluidos. */
export function diasEntre(inicio: string, fin: string): number {
  const a = new Date(inicio + 'T00:00:00').getTime();
  const b = new Date(fin + 'T00:00:00').getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
