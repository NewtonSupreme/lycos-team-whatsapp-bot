export type UserRole = string;

export interface CrudPermiso {
  crear: boolean;
  leer: boolean;
  editar: boolean;
  eliminar: boolean;
}

export type PermisoValue = boolean | CrudPermiso;

export interface Permisos {
  dashboard: CrudPermiso;
  clientes: CrudPermiso;
  vehiculos: CrudPermiso;
  servicios: CrudPermiso;
  taller: CrudPermiso;
  agenda: CrudPermiso;
  whatsapp: CrudPermiso;
  leads: CrudPermiso;
  inventario: CrudPermiso;
  papelera: CrudPermiso;
  ventas: CrudPermiso;
  ia_asistente: CrudPermiso;
  reportes: CrudPermiso;
  actividad: CrudPermiso;
  calculadora: CrudPermiso;
  configuracion: CrudPermiso;
  empleados: CrudPermiso;
  distribuidor: CrudPermiso;
  presupuestos: CrudPermiso;
}

export const MODULES: (keyof Permisos)[] = [
  'dashboard', 'clientes', 'vehiculos', 'servicios', 'taller',
  'agenda', 'whatsapp', 'leads', 'inventario', 'papelera',
  'ventas', 'ia_asistente', 'reportes', 'actividad', 'calculadora',
  'configuracion', 'empleados', 'distribuidor', 'presupuestos'
];

export function accesoToCrud(acceso: boolean): CrudPermiso {
  return { crear: acceso, leer: acceso, editar: acceso, eliminar: acceso };
}

export function crudToAcceso(crud: CrudPermiso): boolean {
  return crud.leer || crud.crear || crud.editar || crud.eliminar;
}

export function normalizePermiso(pv: PermisoValue | undefined): CrudPermiso {
  if (pv === undefined || pv === null) return { crear: false, leer: false, editar: false, eliminar: false };
  if (typeof pv === 'boolean') return accesoToCrud(pv);
  return pv;
}

export function hasPermiso(pv: PermisoValue | undefined, action: keyof CrudPermiso = 'leer'): boolean {
  return normalizePermiso(pv)[action] === true;
}

export interface Role {
  id: string;
  nombre: string;
  label: string;
  descripcion: string;
  permisos: Record<string, PermisoValue>;
  created_at: string;
}

function perm(crear: boolean, leer: boolean, editar: boolean, eliminar: boolean): CrudPermiso {
  return { crear, leer, editar, eliminar };
}
function full(acceso: boolean): CrudPermiso {
  return { crear: acceso, leer: acceso, editar: acceso, eliminar: acceso };
}

// ── Catálogo canónico de roles ─────────────────────────────────────────────
// Fuente única de verdad para los roles del sistema Lycos Team.
// El admin puede reconfigurar los permisos de cada rol desde /ajustes/permisos
// y los permisos por-usuario desde Gestión de Empleados.
export type RoleIcon = 'crown' | 'shield' | 'dollar' | 'headset' | 'hardhat' | 'wrench';

export interface RoleMeta {
  nombre: string;        // slug interno (clave en BD)
  label: string;        // nombre visible
  descripcion: string;
  icon: RoleIcon;
  color: string;        // clases tailwind para el badge
  /** Puede iniciar sesión en el panel */
  conAcceso: boolean;
  /** Personal técnico (taller) */
  esTecnico: boolean;
  /** Un supervisor (no admin) puede asignar este rol al crear/editar personal */
  asignablePorSupervisor: boolean;
  /** Puede ver/cambiar entre todas las sedes (solo admin) */
  multiSede: boolean;
}

export const ROLE_CATALOG: RoleMeta[] = [
  {
    nombre: 'admin', label: 'Administración',
    descripcion: 'Control total del sistema y de todas las sedes.',
    icon: 'crown', color: 'bg-red-500/10 text-red-500 border-red-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: false, multiSede: true,
  },
  {
    nombre: 'supervisor', label: 'Supervisor de Sede',
    descripcion: 'Gestiona su sede asignada: operaciones, personal y ventas.',
    icon: 'shield', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: false, multiSede: false,
  },
  {
    nombre: 'cobranza', label: 'Cobranza',
    descripcion: 'Facturación, ventas, presupuestos y reportes financieros.',
    icon: 'dollar', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'atencion_cliente', label: 'Atención al Cliente',
    descripcion: 'Recepción: clientes, vehículos, citas y mensajería.',
    icon: 'headset', color: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'jefe_taller', label: 'Jefe de Taller',
    descripcion: 'Lidera el taller: servicios, vehículos e inventario.',
    icon: 'hardhat', color: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    conAcceso: true, esTecnico: true, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'mecanico', label: 'Mecánico',
    descripcion: 'Ejecuta y actualiza los servicios del taller.',
    icon: 'wrench', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    conAcceso: true, esTecnico: true, asignablePorSupervisor: true, multiSede: false,
  },
];

export const ROLE_LABELS: Record<string, string> =
  Object.fromEntries(ROLE_CATALOG.map(r => [r.nombre, r.label]));

export function getRoleMeta(rol: string): RoleMeta | undefined {
  return ROLE_CATALOG.find(r => r.nombre === resolveRol(rol));
}

// Roles heredados → rol canónico. Permite que la app funcione correctamente
// incluso antes de migrar la base de datos.
export const ROLE_ALIASES: Record<string, string> = {
  gerente: 'supervisor',
  empleado: 'atencion_cliente',
  mecanico_acceso: 'mecanico',
  jefe_taller_acceso: 'jefe_taller',
};

export function resolveRol(rol?: string | null): string {
  if (!rol) return 'atencion_cliente';
  return ROLE_ALIASES[rol] || rol;
}

export const PERMISOS_DEFAULT: Record<string, Permisos> = {
  // Administración — acceso total.
  admin: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: full(true),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: full(true),
    calculadora: full(true), configuracion: full(true), empleados: full(true), distribuidor: full(true), presupuestos: full(true)
  },
  // Supervisor de Sede — amplio en su sede; sin configuración del sistema; gestiona personal (sin eliminar).
  supervisor: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: perm(false, true, true, false),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: perm(false, true, false, false),
    calculadora: full(true), configuracion: full(false), empleados: perm(true, true, true, false), distribuidor: full(true), presupuestos: full(true)
  },
  // Cobranza — facturación, ventas y presupuestos; lectura de clientes/servicios/inventario para facturar.
  cobranza: {
    dashboard: perm(false, true, false, false), clientes: perm(false, true, true, false), vehiculos: perm(false, true, false, false),
    servicios: perm(false, true, false, false), taller: full(false), agenda: full(false), whatsapp: perm(false, true, false, false),
    leads: full(false), inventario: perm(false, true, false, false), papelera: full(false), ventas: full(true),
    ia_asistente: full(false), reportes: perm(false, true, false, false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(true)
  },
  // Atención al Cliente — recepción: clientes, vehículos, citas, mensajería y presupuestos.
  atencion_cliente: {
    dashboard: perm(false, true, false, false), clientes: full(true), vehiculos: full(true),
    servicios: perm(false, true, false, false), taller: perm(false, true, false, false), agenda: full(true), whatsapp: full(true),
    leads: full(true), inventario: perm(false, true, false, false), papelera: full(false), ventas: full(false),
    ia_asistente: full(true), reportes: full(false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(true)
  },
  // Jefe de Taller — manda en el taller: servicios, vehículos e inventario.
  jefe_taller: {
    dashboard: perm(false, true, false, false), clientes: perm(false, true, false, false), vehiculos: full(true),
    servicios: full(true), taller: full(true), agenda: perm(false, true, false, false), whatsapp: full(false),
    leads: full(false), inventario: full(true), papelera: full(false), ventas: full(false),
    ia_asistente: full(false), reportes: perm(false, true, false, false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: perm(false, true, false, false), presupuestos: perm(true, true, false, false)
  },
  // Mecánico — ejecuta servicios; sin eliminar, sin áreas administrativas.
  mecanico: {
    dashboard: perm(false, true, false, false), clientes: full(false), vehiculos: perm(false, true, false, false),
    servicios: perm(true, true, true, false), taller: perm(false, true, true, false), agenda: full(false), whatsapp: full(false),
    leads: full(false), inventario: perm(false, true, false, false), papelera: full(false), ventas: full(false),
    ia_asistente: full(false), reportes: full(false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(false)
  },
};

// Permiso mínimo seguro para roles desconocidos: solo lectura del dashboard.
const MINIMAL_PERMISOS: Permisos = {
  dashboard: perm(false, true, false, false), clientes: full(false), vehiculos: full(false), servicios: full(false),
  taller: full(false), agenda: full(false), whatsapp: full(false), leads: full(false), inventario: full(false),
  papelera: full(false), ventas: full(false), ia_asistente: full(false), reportes: full(false), actividad: full(false),
  calculadora: full(true), configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(false)
};

export function getPermisos(
  rol: string | undefined | null,
  storedPermisos?: Record<string, PermisoValue>,
  defaultsOverride?: Record<string, Permisos> | null
): Permisos {
  const canonical = resolveRol(rol);
  const source = defaultsOverride ?? PERMISOS_DEFAULT;
  // Defaults del rol: BD (override) → catálogo de código → mínimo seguro.
  const defaults = source[canonical] || (rol ? source[rol] : undefined) || PERMISOS_DEFAULT[canonical] || MINIMAL_PERMISOS;
  if (!storedPermisos) return defaults;
  const merged = { ...defaults };
  for (const [key, val] of Object.entries(storedPermisos)) {
    if (key in defaults) {
      merged[key as keyof Permisos] = normalizePermiso(val);
    }
  }
  return merged;
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
  sede_id?: string;
}

// ── Distribuciones ───────────────────────────────────────────────────────
export interface DistribucionItem {
  inventario_id: string;
  nombre: string;
  codigo?: string | null;
  categoria: string;
  marca?: string | null;
  cantidad: number;
  stock_antes: number;
  stock_despues: number;
  precio_usd: number;
  unidad: string;
}

export interface Distribucion {
  id: string;
  numero_nota: string;
  fecha: string;
  sede_origen_id?: string | null;
  sede_origen_nombre: string;
  sede_destino_id?: string | null;
  sede_destino_nombre: string;
  responsable: string;
  recibe?: string | null;
  estado: 'pendiente' | 'en_transito' | 'completado' | 'anulado';
  observaciones?: string | null;
  items: DistribucionItem[];
  total_items: number;
  total_unidades: number;
  valor_total_usd: number;
  sede_id?: string | null;
  created_at: string;
  updated_at?: string;
}

// ── Presupuestos (Budgets/Quotes) ──────────────────────────────────────
export type Moneda = 'USD' | 'VES' | 'EUR';
export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aprobado' | 'rechazado' | 'vencido' | 'convertido';
export type TipoItemPresupuesto = 'servicio' | 'repuesto' | 'otro';

export interface PresupuestoItem {
  id: string;
  tipo: TipoItemPresupuesto;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  moneda: Moneda;
  total: number;
  inventario_id?: string;
  categoria?: string;
  notas?: string;
}

export interface Presupuesto {
  id: string;
  numero: string;
  cliente_id?: string | null;
  cliente_nombre: string;
  cliente_telefono?: string | null;
  cliente_cedula?: string | null;
  cliente_direccion?: string | null;
  vehiculo_id?: string | null;
  vehiculo_info?: string | null;
  moneda: Moneda;
  tasa_cambio?: number | null;
  items: PresupuestoItem[];
  subtotal: number;
  descuento: number;
  descuento_tipo: 'porcentaje' | 'monto';
  iva: number;
  total: number;
  notas?: string | null;
  condiciones?: string | null;
  estado: EstadoPresupuesto;
  validez_dias: number;
  fecha_expiracion?: string | null;
  creado_por: string;
  creado_por_id?: string | null;
  convertido_a?: string | null;
  created_at: string;
  updated_at: string;
  sede_id?: string | null;
}
