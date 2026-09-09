import type { RecursoKey } from '@/lib/rrhh/recursos';

export interface Campo {
  id: string;
  label: string;
  tipo: 'texto' | 'fecha' | 'hora' | 'numero' | 'select' | 'textarea' | 'check';
  opciones?: readonly string[];
  requerido?: boolean;
  completo?: boolean;
  paso?: string;
  min?: number;
  max?: number;
  ayuda?: string;
}

export interface Columna {
  id: string;
  label: string;
  tipo?: 'fecha' | 'estado' | 'texto' | 'numero' | 'check' | 'enlace';
}

/**
 * Formulario y tabla de cada recurso, declarados una sola vez.
 *
 * Las claves coinciden con las columnas que la API acepta (`lib/rrhh/recursos`),
 * así que un campo que no esté allí no llega a la base aunque se agregue aquí.
 */
export const CAMPOS: Record<RecursoKey, readonly Campo[]> = {
  asistencia: [
    { id: 'fecha', label: 'Fecha', tipo: 'fecha', requerido: true },
    { id: 'estado', label: 'Estado', tipo: 'select', requerido: true, opciones: ['presente', 'tardanza', 'ausente', 'permiso', 'vacaciones'] },
    { id: 'hora_entrada', label: 'Hora de entrada', tipo: 'hora' },
    { id: 'hora_salida', label: 'Hora de salida', tipo: 'hora' },
    { id: 'nota', label: 'Nota', tipo: 'textarea', completo: true },
  ],
  vacaciones: [
    { id: 'fecha_inicio', label: 'Desde', tipo: 'fecha', requerido: true },
    { id: 'fecha_fin', label: 'Hasta', tipo: 'fecha', requerido: true, ayuda: 'Los días se calculan del rango.' },
    { id: 'estado', label: 'Estado', tipo: 'select', requerido: true, opciones: ['solicitada', 'aprobada', 'rechazada', 'disfrutada'] },
    { id: 'nota', label: 'Nota', tipo: 'textarea', completo: true },
  ],
  permisos: [
    { id: 'fecha_inicio', label: 'Desde', tipo: 'fecha', requerido: true },
    { id: 'fecha_fin', label: 'Hasta', tipo: 'fecha', requerido: true },
    { id: 'tipo', label: 'Tipo', tipo: 'select', requerido: true, opciones: ['personal', 'médico', 'familiar', 'estudio', 'otro'] },
    { id: 'estado', label: 'Estado', tipo: 'select', requerido: true, opciones: ['solicitado', 'aprobado', 'rechazado'] },
    { id: 'remunerado', label: 'Remunerado', tipo: 'check' },
    { id: 'motivo', label: 'Motivo', tipo: 'textarea', completo: true },
  ],
  evaluaciones: [
    { id: 'fecha', label: 'Fecha', tipo: 'fecha', requerido: true },
    { id: 'puntaje', label: 'Puntaje (0 a 5)', tipo: 'numero', requerido: true, paso: '0.1', min: 0, max: 5 },
    { id: 'periodo', label: 'Período', tipo: 'texto' },
    { id: 'evaluador', label: 'Evaluador', tipo: 'texto' },
    { id: 'comentario', label: 'Comentario', tipo: 'textarea', completo: true },
  ],
  capacitaciones: [
    { id: 'titulo', label: 'Título', tipo: 'texto', requerido: true, completo: true },
    { id: 'fecha', label: 'Fecha', tipo: 'fecha', requerido: true },
    { id: 'estado', label: 'Estado', tipo: 'select', requerido: true, opciones: ['pendiente', 'en_curso', 'completado'] },
    { id: 'institucion', label: 'Institución', tipo: 'texto' },
    { id: 'nota', label: 'Nota', tipo: 'textarea', completo: true },
  ],
  documentos: [
    { id: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true, completo: true },
    { id: 'tipo', label: 'Tipo', tipo: 'select', requerido: true, opciones: ['contrato', 'cédula', 'título', 'certificado', 'carta', 'otro'] },
    { id: 'vence_el', label: 'Vence el', tipo: 'fecha' },
    { id: 'url', label: 'Enlace al archivo', tipo: 'texto', completo: true, ayuda: 'Pega la dirección del documento si ya está subido.' },
  ],
  reclutamiento: [
    { id: 'candidato', label: 'Candidato', tipo: 'texto', requerido: true },
    { id: 'cargo', label: 'Cargo al que aspira', tipo: 'texto' },
    { id: 'telefono', label: 'Teléfono', tipo: 'texto' },
    { id: 'email', label: 'Correo', tipo: 'texto' },
    { id: 'fuente', label: 'Fuente', tipo: 'texto' },
    { id: 'estado', label: 'Estado', tipo: 'select', requerido: true, opciones: ['recibido', 'entrevista', 'prueba', 'contratado', 'descartado'] },
    { id: 'nota', label: 'Nota', tipo: 'textarea', completo: true },
  ],
};

export const COLUMNAS: Record<RecursoKey, readonly Columna[]> = {
  asistencia: [
    { id: 'fecha', label: 'Fecha', tipo: 'fecha' },
    { id: 'estado', label: 'Estado', tipo: 'estado' },
    { id: 'hora_entrada', label: 'Entrada' },
    { id: 'hora_salida', label: 'Salida' },
    { id: 'nota', label: 'Nota' },
  ],
  vacaciones: [
    { id: 'fecha_inicio', label: 'Desde', tipo: 'fecha' },
    { id: 'fecha_fin', label: 'Hasta', tipo: 'fecha' },
    { id: 'dias', label: 'Días', tipo: 'numero' },
    { id: 'estado', label: 'Estado', tipo: 'estado' },
    { id: 'nota', label: 'Nota' },
  ],
  permisos: [
    { id: 'fecha_inicio', label: 'Desde', tipo: 'fecha' },
    { id: 'fecha_fin', label: 'Hasta', tipo: 'fecha' },
    { id: 'tipo', label: 'Tipo' },
    { id: 'remunerado', label: 'Remunerado', tipo: 'check' },
    { id: 'estado', label: 'Estado', tipo: 'estado' },
    { id: 'motivo', label: 'Motivo' },
  ],
  evaluaciones: [
    { id: 'fecha', label: 'Fecha', tipo: 'fecha' },
    { id: 'puntaje', label: 'Puntaje', tipo: 'numero' },
    { id: 'periodo', label: 'Período' },
    { id: 'evaluador', label: 'Evaluador' },
    { id: 'comentario', label: 'Comentario' },
  ],
  capacitaciones: [
    { id: 'titulo', label: 'Título' },
    { id: 'fecha', label: 'Fecha', tipo: 'fecha' },
    { id: 'estado', label: 'Estado', tipo: 'estado' },
    { id: 'institucion', label: 'Institución' },
  ],
  documentos: [
    { id: 'nombre', label: 'Documento' },
    { id: 'tipo', label: 'Tipo' },
    { id: 'vence_el', label: 'Vence', tipo: 'fecha' },
    { id: 'url', label: 'Archivo', tipo: 'enlace' },
  ],
  reclutamiento: [
    { id: 'candidato', label: 'Candidato' },
    { id: 'cargo', label: 'Cargo' },
    { id: 'telefono', label: 'Teléfono' },
    { id: 'email', label: 'Correo' },
    { id: 'estado', label: 'Estado', tipo: 'estado' },
    { id: 'fuente', label: 'Fuente' },
  ],
};

export const TITULOS: Record<RecursoKey, { plural: string; singular: string; vacio: string }> = {
  asistencia: { plural: 'Asistencia', singular: 'Registro de asistencia', vacio: 'Todavía no hay asistencia registrada.' },
  vacaciones: { plural: 'Vacaciones', singular: 'Vacaciones', vacio: 'No hay vacaciones registradas.' },
  permisos: { plural: 'Permisos', singular: 'Permiso', vacio: 'No hay permisos registrados.' },
  evaluaciones: { plural: 'Evaluaciones', singular: 'Evaluación', vacio: 'No hay evaluaciones registradas.' },
  capacitaciones: { plural: 'Capacitación', singular: 'Capacitación', vacio: 'No hay capacitaciones registradas.' },
  documentos: { plural: 'Documentos', singular: 'Documento', vacio: 'No hay documentos cargados.' },
  reclutamiento: { plural: 'Reclutamiento', singular: 'Candidato', vacio: 'No hay candidatos en proceso.' },
};

/** Colores de estado compartidos por tabla y ficha. */
export const TINTE_ESTADO: Record<string, string> = {
  presente: 'bg-[#e8f7ee] text-[#15803d]',
  aprobada: 'bg-[#e8f7ee] text-[#15803d]',
  aprobado: 'bg-[#e8f7ee] text-[#15803d]',
  completado: 'bg-[#e8f7ee] text-[#15803d]',
  contratado: 'bg-[#e8f7ee] text-[#15803d]',
  disfrutada: 'bg-[#e4f6f6] text-[#0d9488]',
  tardanza: 'bg-[#fdf5e2] text-[#a16207]',
  solicitada: 'bg-[#fdf5e2] text-[#a16207]',
  solicitado: 'bg-[#fdf5e2] text-[#a16207]',
  pendiente: 'bg-[#f2f3f5] text-[#5b616e]',
  recibido: 'bg-[#f2f3f5] text-[#5b616e]',
  en_curso: 'bg-[#e7f0fe] text-[#1d4ed8]',
  entrevista: 'bg-[#e7f0fe] text-[#1d4ed8]',
  prueba: 'bg-[#e7f0fe] text-[#1d4ed8]',
  permiso: 'bg-[#e7f0fe] text-[#1d4ed8]',
  vacaciones: 'bg-[#fff4ec] text-[#c2410c]',
  ausente: 'bg-[#fdeaea] text-[#dc2626]',
  rechazada: 'bg-[#fdeaea] text-[#dc2626]',
  rechazado: 'bg-[#fdeaea] text-[#dc2626]',
  descartado: 'bg-[#fdeaea] text-[#dc2626]',
};
