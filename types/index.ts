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
export type RoleIcon = 'crown' | 'eye' | 'shield' | 'dollar' | 'headset' | 'hardhat' | 'wrench';

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
    nombre: 'dueno', label: 'Dueño',
    descripcion: 'Visualiza absolutamente todo en todas las sedes. Solo lectura: no crea, edita ni elimina.',
    icon: 'eye', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
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

// REGLA DEL SISTEMA: la eliminación definitiva (eliminar) es exclusiva del admin.
// Por eso ningún rol por defecto (excepto admin) trae eliminar=true.
// manage = crear/leer/editar sin eliminar · ver = solo lectura · none = sin acceso.
function manage(crear: boolean, leer: boolean, editar: boolean): CrudPermiso {
  return { crear, leer, editar, eliminar: false };
}
const ver = (): CrudPermiso => ({ crear: false, leer: true, editar: false, eliminar: false });
const none = (): CrudPermiso => ({ crear: false, leer: false, editar: false, eliminar: false });

export const PERMISOS_DEFAULT: Record<string, Permisos> = {
  // Administración — acceso total (único rol que puede eliminar).
  admin: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: full(true),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: full(true),
    calculadora: full(true), configuracion: full(true), empleados: full(true), distribuidor: full(true), presupuestos: full(true)
  },
  // Dueño — ve absolutamente todo en todas las sedes. Solo lectura (no crea, edita ni elimina).
  dueno: {
    dashboard: ver(), clientes: ver(), vehiculos: ver(), servicios: ver(), taller: ver(),
    agenda: ver(), whatsapp: ver(), leads: ver(), inventario: ver(), papelera: ver(),
    ventas: ver(), ia_asistente: ver(), reportes: ver(), actividad: ver(),
    calculadora: full(true), configuracion: ver(), empleados: ver(), distribuidor: ver(), presupuestos: ver()
  },
  // Supervisor de Sede — amplio en su sede; sin configuración del sistema; gestiona personal. Sin eliminar.
  supervisor: {
    dashboard: manage(true, true, true), clientes: manage(true, true, true), vehiculos: manage(true, true, true),
    servicios: manage(true, true, true), taller: manage(true, true, true), agenda: manage(true, true, true), whatsapp: manage(true, true, true),
    leads: manage(true, true, true), inventario: manage(true, true, true), papelera: manage(false, true, true),
    ventas: manage(true, true, true), ia_asistente: manage(true, true, true), reportes: ver(), actividad: ver(),
    calculadora: full(true), configuracion: none(), empleados: manage(true, true, true), distribuidor: manage(true, true, true), presupuestos: manage(true, true, true)
  },
  // Cobranza — facturación, ventas y presupuestos; lectura de clientes/servicios/inventario para facturar.
  cobranza: {
    dashboard: ver(), clientes: manage(false, true, true), vehiculos: ver(),
    servicios: ver(), taller: none(), agenda: none(), whatsapp: ver(),
    leads: none(), inventario: ver(), papelera: none(), ventas: manage(true, true, true),
    ia_asistente: none(), reportes: ver(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: manage(true, true, true)
  },
  // Atención al Cliente — recepción: clientes, vehículos, citas, mensajería y presupuestos.
  atencion_cliente: {
    dashboard: ver(), clientes: manage(true, true, true), vehiculos: manage(true, true, true),
    servicios: ver(), taller: ver(), agenda: manage(true, true, true), whatsapp: manage(true, true, true),
    leads: manage(true, true, true), inventario: ver(), papelera: none(), ventas: none(),
    ia_asistente: manage(true, true, true), reportes: none(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: manage(true, true, true)
  },
  // Jefe de Taller — manda en el taller: servicios, vehículos e inventario.
  jefe_taller: {
    dashboard: ver(), clientes: ver(), vehiculos: manage(true, true, true),
    servicios: manage(true, true, true), taller: manage(true, true, true), agenda: ver(), whatsapp: none(),
    leads: none(), inventario: manage(true, true, true), papelera: none(), ventas: none(),
    ia_asistente: none(), reportes: ver(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: ver(), presupuestos: manage(true, true, false)
  },
  // Mecánico — ejecuta servicios; sin eliminar, sin áreas administrativas.
  mecanico: {
    dashboard: ver(), clientes: none(), vehiculos: ver(),
    servicios: manage(true, true, true), taller: manage(false, true, true), agenda: none(), whatsapp: none(),
    leads: none(), inventario: ver(), papelera: none(), ventas: none(),
    ia_asistente: none(), reportes: none(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: none()
  },
};

// REGLA DEL SISTEMA: la eliminación definitiva es exclusiva del Administrador.
// Se fuerza eliminar=false en TODOS los roles excepto admin (incluye módulos-
// herramienta como calculadora). El admin puede reactivar permisos puntuales
// por-usuario desde Gestión de Empleados si lo desea.
for (const [rol, perms] of Object.entries(PERMISOS_DEFAULT)) {
  if (rol === 'admin') continue;
  const soloLectura = rol === 'dueno'; // el Dueño ve todo pero nunca crea/edita/elimina
  for (const mod of MODULES) {
    const p = normalizePermiso(perms[mod]);
    perms[mod] = soloLectura
      ? { crear: false, leer: p.leer, editar: false, eliminar: false }
      : { ...p, eliminar: false };
  }
}

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

// ── Reglas de sistema ───────────────────────────────────────────────────────
// Único usuario maestro autorizado a crear/asignar el rol de Administrador.
export const MASTER_ADMIN_USERNAME = 'administrador';

// ── Capacidades del Chatbot (Modo Dios) por rol ─────────────────────────────
// Derivadas de los permisos del rol para que el panel y el webhook usen la
// MISMA fuente de verdad sobre lo que cada rol puede hacer desde WhatsApp.
export interface ChatbotCapability {
  key: string;
  label: string;
  allowed: boolean;
  detail: string;
}

export interface ChatbotAccess {
  puedeUsarModoDios: boolean;
  alcanceSede: 'todas' | 'su_sede';
  capabilities: ChatbotCapability[];
}

export function getChatbotCapabilities(
  rol: string | undefined | null,
  storedPermisos?: Record<string, PermisoValue>,
  defaultsOverride?: Record<string, Permisos> | null
): ChatbotAccess {
  const meta = getRoleMeta(rol || '');
  const p = getPermisos(rol, storedPermisos, defaultsOverride);
  const can = (m: keyof Permisos, a: keyof CrudPermiso = 'leer') => hasPermiso(p[m], a);
  const esAdmin = resolveRol(rol) === 'admin';
  const puedeUsarModoDios = can('ia_asistente', 'leer');

  const capabilities: ChatbotCapability[] = [
    { key: 'consultar', label: 'Consultar el sistema (Modo Dios)', allowed: puedeUsarModoDios,
      detail: 'Ventas, servicios, citas, inventario, reportes, clientes y vehículos en tiempo real.' },
    { key: 'servicios', label: 'Registrar / editar servicios por chat', allowed: puedeUsarModoDios && (can('servicios', 'crear') || can('servicios', 'editar')),
      detail: 'Crear y actualizar órdenes de taller desde WhatsApp.' },
    { key: 'citas', label: 'Agendar / editar citas por chat', allowed: puedeUsarModoDios && (can('agenda', 'crear') || can('agenda', 'editar')),
      detail: 'Crear y modificar citas en la agenda.' },
    { key: 'clientes', label: 'Registrar / editar clientes por chat', allowed: puedeUsarModoDios && (can('clientes', 'crear') || can('clientes', 'editar')),
      detail: 'Alta y actualización de clientes y sus datos.' },
    { key: 'inventario', label: 'Gestionar inventario / stock por chat', allowed: puedeUsarModoDios && (can('inventario', 'crear') || can('inventario', 'editar')),
      detail: 'Actualizar precios, existencias y productos.' },
    { key: 'eliminar', label: 'Eliminar registros por chat', allowed: esAdmin,
      detail: 'La eliminación definitiva es exclusiva del Administrador.' },
  ];

  return { puedeUsarModoDios, alcanceSede: meta?.multiSede ? 'todas' : 'su_sede', capabilities };
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
  precio_fabricante?: number | null;
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
  precio_fabricante?: number;
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

// ── Notas de Ganancia (Fabricante → Distribuidor → Reventa) ────────────
export interface NotaGananciaItem {
  nombre: string;
  codigo?: string | null;
  cantidad: number;
  precio_fabricante: number;   // costo unitario (lo que se paga al fabricante)
  precio_venta: number;        // reventa unitaria (a Lycos/talleres)
  ganancia_unit: number;       // precio_venta - precio_fabricante
  ganancia_total: number;      // ganancia_unit * cantidad
}

export interface NotaGanancia {
  id: string;
  numero_nota: string;         // NG-YYYY-XXXX
  fecha: string;
  cliente: string;             // a quién se le revende
  responsable: string;
  items: NotaGananciaItem[];
  total_costo: number;
  total_venta: number;
  total_ganancia: number;
  observaciones?: string | null;
  sede_id?: string | null;
  created_at: string;
  updated_at?: string;
}

/**
 * Fila unificada de ganancia para la tabla del módulo (distribución auto + nota manual).
 */
export interface GananciaRow {
  id: string;
  origen: 'distribucion' | 'manual';
  numero_nota: string;
  fecha: string;
  cliente: string;             // sede destino o cliente manual
  responsable: string;
  total_costo: number;
  total_venta: number;
  total_ganancia: number;
  margen_pct: number;          // total_ganancia / total_venta * 100
  // referencias a la entidad original (para abrir detalle / PDF)
  distribucion?: Distribucion;
  nota?: NotaGanancia;
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
  venta_id?: string | null;
  created_at: string;
  updated_at: string;
  sede_id?: string | null;
}

export interface Abono {
  id: string;
  venta_id: string;
  monto: number;
  monto_bs?: number | null;
  tasa_cambio?: number | null;
  metodo_pago: string;
  moneda: string;
  saldo_antes?: number | null;
  saldo_despues?: number | null;
  nota?: string | null;
  registrado_por: string;
  sede_id?: string | null;
  created_at: string;
}
