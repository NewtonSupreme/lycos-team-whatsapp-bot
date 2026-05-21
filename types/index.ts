export type UserRole = 'admin' | 'empleado' | 'cliente' | 'mecanico' | 'mecanico_acceso' | 'jefe_taller' | 'jefe_taller_acceso' | 'gerente';

export interface Permisos {
  dashboard: boolean;
  clientes: boolean;
  vehiculos: boolean;
  servicios: boolean;
  taller: boolean;
  agenda: boolean;
  whatsapp: boolean;
  leads: boolean;
  inventario: boolean;
  papelera: boolean;
  ventas: boolean;
  ia_asistente: boolean;
  reportes: boolean;
  actividad: boolean;
  calculadora: boolean;
  configuracion: boolean;
  empleados: boolean;
}

export const PERMISOS_DEFAULT: Record<string, Permisos> = {
  admin: {
    dashboard: true, clientes: true, vehiculos: true, servicios: true, taller: true,
    agenda: true, whatsapp: true, leads: true, inventario: true, papelera: true,
    ventas: true, ia_asistente: true, reportes: true, actividad: true,
    calculadora: true, configuracion: true, empleados: true
  },
  gerente: {
    dashboard: true, clientes: true, vehiculos: true, servicios: true, taller: true,
    agenda: true, whatsapp: true, leads: true, inventario: true, papelera: false,
    ventas: true, ia_asistente: true, reportes: true, actividad: false,
    calculadora: true, configuracion: false, empleados: false
  },
  empleado: {
    dashboard: true, clientes: true, vehiculos: true, servicios: true, taller: true,
    agenda: true, whatsapp: true, leads: false, inventario: true, papelera: false,
    ventas: true, ia_asistente: false, reportes: false, actividad: false,
    calculadora: true, configuracion: false, empleados: false
  },
  mecanico_acceso: {
    dashboard: true, clientes: false, vehiculos: false, servicios: true, taller: true,
    agenda: false, whatsapp: false, leads: false, inventario: false, papelera: false,
    ventas: false, ia_asistente: false, reportes: false, actividad: false,
    calculadora: true, configuracion: false, empleados: false
  },
  jefe_taller_acceso: {
    dashboard: true, clientes: true, vehiculos: true, servicios: true, taller: true,
    agenda: false, whatsapp: false, leads: false, inventario: true, papelera: false,
    ventas: true, ia_asistente: false, reportes: false, actividad: false,
    calculadora: true, configuracion: false, empleados: false
  },
};

export function getPermisos(rol: string, storedPermisos?: Partial<Permisos>): Permisos {
  const defaults = PERMISOS_DEFAULT[rol] || PERMISOS_DEFAULT.empleado;
  if (!storedPermisos) return defaults;
  return { ...defaults, ...storedPermisos };
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  username: string;
  rol: UserRole;
  avatar_url?: string;
  telefono?: string;
  created_at: string;
  sede_id?: string;
  permisos?: Partial<Permisos>;
}

export interface Cliente {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  cedula?: string;
  direccion?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
  sede_id?: string;
  vehiculos?: Vehiculo[];
}

export interface Vehiculo {
  id: string;
  cliente_id: string;
  marca: string;
  modelo: string;
  anio: number;
  placa: string;
  color?: string;
  kilometraje?: number;
  vin?: string;
  estado: 'activo' | 'en_servicio' | 'listo' | 'inactivo';
  notas?: string;
  created_at: string;
  sede_id?: string;
  cliente?: Cliente;
  servicios?: Servicio[];
}

export type TipoServicio = 'mecanica' | 'electronica' | 'cerrajeria' | 'diagnostico' | 'motor' | 'emergencia' | 'otro';
export type EstadoServicio = 'pendiente' | 'en_proceso' | 'finalizado' | 'cancelado';

export interface Servicio {
  id: string;
  vehiculo_id: string;
  tipo: TipoServicio;
  descripcion: string;
  estado: EstadoServicio;
  tecnico_id?: string;
  costo_estimado?: number;
  costo_final?: number;
  fecha_inicio?: string;
  fecha_fin?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
  vehiculo?: Vehiculo;
  tecnico?: User;
}

export interface Cita {
  id: string;
  cliente_id?: string | null;
  vehiculo_id?: string | null;
  fecha: string;
  hora: string;
  tipo_servicio: TipoServicio;
  descripcion?: string;
  estado: 'confirmada' | 'pendiente' | 'cancelada' | 'completada' | 'ocupado';
  notas?: string;
  telefono?: string;
  nombre_cliente?: string;
  vehiculo_info?: string;
  duracion_minutos?: number;
  costo_estimado?: number;
  created_at: string;
  sede_id?: string;
  cliente?: Cliente;
  vehiculo?: Vehiculo;
}

export interface MensajeWhatsApp {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: string;
  tipo: 'entrante' | 'saliente';
  estado: 'enviado' | 'entregado' | 'leido' | 'error';
  media_url?: string;
  media_type?: string;
  es_ia?: boolean;
  wa_message_id?: string;
  cliente_id?: string;
  quoted_wa_id?: string;
}

export interface Conversacion {
  id: string;
  telefono: string;
  cliente_id?: string;
  ultimo_mensaje: string;
  ultimo_mensaje_at: string;
  mensajes_sin_leer: number;
  estado: 'activa' | 'cerrada' | 'bot' | 'humano';
  cliente?: Cliente;
  mensajes?: MensajeWhatsApp[];
}

export interface DashboardStats {
  totalClientes: number;
  totalVehiculos: number;
  serviciosActivos: number;
  conversacionesHoy: number;
  ingresosMes: number;
  serviciosCompletados: number;
  citasHoy: number;
  mensajesIA: number;
}

export interface Notification {
  id: string;
  tipo: 'info' | 'success' | 'warning' | 'error';
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  usuario: string;
  accion: string;
  modulo: string;
  detalles?: string | null;
  referencia_id?: string | null;
  referencia_tabla?: string | null;
  sede_id?: string;
  created_at: string;
}

export type InventarioCategoria = 
  | 'silenciador' | 'resonador' | 'cola_cromada' | 'flexible' 
  | 'filtro_aceite' | 'filtro_gasolina' | 'liquido' | 'frenos' 
  | 'electrico' | 'oficina' | 'otro' | 'general';

export interface InventarioItem {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: InventarioCategoria;
  marca: string | null;
  descripcion: string | null;
  precio_usd: number | null;
  precio_bs: number | null;
  stock: number;
  stock_minimo: number;
  unidad: string;
  notas: string | null;
  ubicacion?: string;
  clasificacion?: string;
  activo: boolean;
  orden?: number;
  created_at: string;
  updated_at: string;
}
