export type EstadoEmpleado = 'activo' | 'vacaciones' | 'permiso' | 'inactivo';

export interface EmpleadoRRHH {
  id: string;
  nombre: string;
  username?: string | null;
  email?: string | null;
  telefono?: string | null;
  cedula?: string | null;
  rol: string;
  especialidad?: string | null;
  foto_url?: string | null;
  avatar_url?: string | null;
  activo?: boolean | null;
  sede_id?: string | null;
  cargo?: string | null;
  area?: string | null;
  tipo_contrato?: string | null;
  fecha_ingreso?: string | null;
  fecha_nacimiento?: string | null;
  fecha_egreso?: string | null;
  estado: EstadoEmpleado;
  asistencia_hoy?: string | null;
}

export interface VacacionProxima {
  id: string;
  empleado_id: string;
  nombre: string;
  foto_url: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number | null;
  estado: string;
  nota?: string | null;
}

export interface Evaluacion {
  id: string;
  empleado_id: string;
  fecha: string;
  puntaje: number;
  periodo?: string | null;
  comentario?: string | null;
  evaluador?: string | null;
}

export interface Capacitacion {
  id: string;
  empleado_id: string;
  titulo: string;
  fecha: string;
  estado: string;
  institucion?: string | null;
  nota?: string | null;
}

export interface Cumpleanos {
  id: string;
  nombre: string;
  foto_url: string | null;
  fecha: string;
  dias: number;
}

export interface KpisRRHH {
  total: number;
  presentes: number;
  tardanzas: number;
  ausentes: number;
  pctPresentes: number;
  enVacaciones: number;
  permisos: number;
  cumpleanosMes: number;
  rotacion: number;
  bajas: number;
}

export interface ResumenRRHH {
  fecha: string;
  empleados: EmpleadoRRHH[];
  kpis: KpisRRHH;
  asistenciaHoy: { presentes: number; tardanzas: number; ausentes: number };
  cumpleanos: Cumpleanos[];
  vacacionesProximas: VacacionProxima[];
  evaluaciones: Evaluacion[];
  capacitaciones: Capacitacion[];
  distribucion: { area: string; total: number; pct: number }[];
  antiguedad: { label: string; total: number }[];
  sinFechaIngreso: number;
}

/** Una fila cualquiera de las tablas de RRHH, tal como llega de la API. */
export type RegistroRRHH = Record<string, string | number | boolean | null | undefined>;

export const AREAS = ['Taller', 'Atención al Cliente', 'Administración', 'Almacén', 'Gerencia'] as const;
export const CONTRATOS = ['Tiempo completo', 'Medio tiempo', 'Por comisión', 'Contratado'] as const;

/** Paleta fija por posición: el color de un área no cambia entre recargas. */
export const COLORES = ['#f97316', '#7c3aed', '#eab308', '#ec4899', '#3b82f6', '#14b8a6', '#94a3b8'] as const;

export const ESTADO_TINTE: Record<EstadoEmpleado, string> = {
  activo: 'bg-[#e8f7ee] text-[#15803d]',
  vacaciones: 'bg-[#fdf5e2] text-[#a16207]',
  permiso: 'bg-[#e7f0fe] text-[#1d4ed8]',
  inactivo: 'bg-[#f2f3f5] text-[#5b616e]',
};

export const ESTADO_LABEL: Record<EstadoEmpleado, string> = {
  activo: 'Activo', vacaciones: 'Vacaciones', permiso: 'Permiso', inactivo: 'Inactivo',
};

export const iniciales = (n: string) =>
  n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

export const normaliza = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** "15/01/2023" a partir de un ISO, sin sorpresas de zona horaria. */
export function fechaCorta(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
export function fechaLarga(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

/** "3 años, 7 meses" desde la fecha de ingreso. */
export function antiguedadTexto(desde?: string | null, hoy = new Date()): string {
  if (!desde) return 'Sin fecha de ingreso';
  const d = new Date(String(desde).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'Sin fecha de ingreso';
  let meses = (hoy.getFullYear() - d.getFullYear()) * 12 + (hoy.getMonth() - d.getMonth());
  if (hoy.getDate() < d.getDate()) meses -= 1;
  if (meses < 0) return 'Ingreso futuro';
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const partes: string[] = [];
  if (a > 0) partes.push(`${a} año${a === 1 ? '' : 's'}`);
  if (m > 0 || a === 0) partes.push(`${m} mes${m === 1 ? '' : 'es'}`);
  return partes.join(', ');
}

/** Días de un rango, ambos extremos incluidos. */
export function diasEntre(inicio: string, fin: string): number {
  const a = new Date(inicio + 'T00:00:00').getTime();
  const b = new Date(fin + 'T00:00:00').getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Mensaje legible de un error desconocido, sin recurrir a `any`. */
export function mensajeError(e: unknown, porDefecto = 'Ocurrió un error'): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return porDefecto;
}
