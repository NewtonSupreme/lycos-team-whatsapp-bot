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
  nomina: CrudPermiso;
}

export const MODULES: (keyof Permisos)[] = [
  'dashboard', 'clientes', 'vehiculos', 'servicios', 'taller',
  'agenda', 'whatsapp', 'leads', 'inventario', 'papelera',
  'ventas', 'ia_asistente', 'reportes', 'actividad', 'calculadora',
  'configuracion', 'empleados', 'distribuidor', 'presupuestos', 'nomina'
];

/**
 * El nombre de cada módulo tal como se le llama en la interfaz.
 *
 * Va junto a `MODULES` para que no se puedan desincronizar: añadir un módulo
 * a la lista sin ponerle nombre aquí es un error de tipos, no una etiqueta
 * fea que aparece en la pantalla de permisos.
 */
export const MODULOS_LABEL: Record<keyof Permisos, string> = {
  dashboard: 'Panel',
  clientes: 'Clientes',
  vehiculos: 'Vehículos',
  servicios: 'Servicios',
  taller: 'Taller',
  agenda: 'Agenda',
  whatsapp: 'WhatsApp',
  leads: 'Leads',
  inventario: 'Inventario',
  papelera: 'Papelera',
  ventas: 'Ventas',
  ia_asistente: 'Asistente IA',
  reportes: 'Reportes',
  actividad: 'Actividad',
  calculadora: 'Calculadora',
  configuracion: 'Configuración',
  empleados: 'Empleados',
  distribuidor: 'Distribución',
  presupuestos: 'Presupuestos',
  nomina: 'Nómina',
};

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
export type RoleIcon = 'crown' | 'eye' | 'shield' | 'dollar' | 'headset' | 'hardhat' | 'wrench' | 'clipboard';

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
    nombre: 'admin', label: 'Usuario Maestro',
    descripcion: 'Control total del sistema y de todas las sedes. Único que configura, elimina y asigna Maestros.',
    icon: 'crown', color: 'bg-red-500/10 text-red-500 border-red-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: false, multiSede: true,
  },
  {
    nombre: 'supervisor', label: 'Supervisor',
    descripcion: 'Dirige la operación de su sede: órdenes, taller, agenda, personal y la nómina del día a día. No ve finanzas.',
    icon: 'shield', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: false, multiSede: false,
  },
  {
    nombre: 'administracion', label: 'Administración',
    descripcion: 'Finanzas de la empresa: reportes, conciliación bancaria, gastos, cuentas por pagar y cobrar, pago de nómina y proveedores. No configura el sistema.',
    icon: 'eye', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: false, multiSede: false,
  },
  {
    nombre: 'cobranza', label: 'Cobranza',
    descripcion: 'Caja: punto de venta, cobros y abonos, facturas, cierre del día y cuentas por cobrar.',
    icon: 'dollar', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'almacen', label: 'Almacén',
    descripcion: 'Inventario y repuestos: entradas, salidas, stock, proveedores y órdenes de compra.',
    icon: 'clipboard', color: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'atencion_cliente', label: 'Atención al Cliente',
    descripcion: 'Recepción: clientes, vehículos, citas, WhatsApp, ingreso de órdenes y presupuestos. No maneja dinero.',
    icon: 'headset', color: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'jefe_taller', label: 'Jefe de Taller',
    descripcion: 'Manda en el piso: órdenes, mecánicos asignados, vehículos y su ficha (gastos de repuestos) e inventario. No ve la ganancia de la empresa.',
    icon: 'hardhat', color: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    conAcceso: true, esTecnico: true, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'presupuesto', label: 'Presupuesto',
    descripcion: 'Cotiza: presupuestos, ingreso del vehículo con su trabajo y su precio, clientes y vehículos.',
    icon: 'clipboard', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    nombre: 'taller', label: 'Taller (pantalla)',
    descripcion: 'Cuenta de la TV o PC del taller: muestra los vehículos en curso y deja a los mecánicos cargar trabajos, mano de obra y precios. Nada más.',
    icon: 'wrench', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    conAcceso: true, esTecnico: false, asignablePorSupervisor: true, multiSede: false,
  },
  {
    // No es un usuario del sistema: es personal que cobra por nómina. Vive en
    // la misma tabla para que sus trabajos, reglas y pagos sigan enlazados.
    nombre: 'mecanico', label: 'Personal de nómina',
    descripcion: 'Mecánicos y demás personal que cobra por nómina. No inicia sesión: carga su trabajo desde la pantalla del taller.',
    icon: 'wrench', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    conAcceso: false, esTecnico: true, asignablePorSupervisor: true, multiSede: false,
  },
];

export const ROLE_LABELS: Record<string, string> =
  Object.fromEntries(ROLE_CATALOG.map(r => [r.nombre, r.label]));

export function getRoleMeta(rol: string): RoleMeta | undefined {
  return ROLE_CATALOG.find(r => r.nombre === resolveRol(rol));
}

/** ¿Este rol puede iniciar sesión? Los roles creados a mano desde Permisos sí. */
export function rolConAcceso(rol?: string | null): boolean {
  const meta = getRoleMeta(String(rol || ''));
  return meta ? meta.conAcceso : true;
}

// Roles heredados → rol canónico. Permite que la app funcione correctamente
// incluso antes de migrar la base de datos.
export const ROLE_ALIASES: Record<string, string> = {
  gerente: 'supervisor',
  empleado: 'atencion_cliente',
  mecanico_acceso: 'mecanico',
  personal: 'mecanico',
  jefe_taller_acceso: 'jefe_taller',
  // Rótulos en español que quedaron guardados en `usuarios.rol` antes de canonizar.
  administrador: 'admin',
  maestro: 'admin',
  'administración': 'administracion',
  // Roles retirados el 2026-10-20: si quedara alguno, cae en el más parecido.
  'dueño': 'administracion',
  dueno: 'administracion',
  owner: 'administracion',
  propietario: 'administracion',
  registrador: 'presupuesto',
  'almacén': 'almacen',
};

/** Normaliza el rol crudo de la BD (recorta y baja a minúsculas) y resuelve aliases. */
export function resolveRol(rol?: string | null): string {
  if (!rol) return 'atencion_cliente';
  const limpio = String(rol).trim().toLowerCase();
  if (!limpio) return 'atencion_cliente';
  return ROLE_ALIASES[limpio] || limpio;
}

// REGLA DEL SISTEMA: la eliminación definitiva (eliminar) es exclusiva del Maestro.
// Por eso ningún rol por defecto (excepto admin) trae eliminar=true.
// manage = crear/leer/editar sin eliminar · ver = solo lectura · none = sin acceso.
function manage(crear: boolean, leer: boolean, editar: boolean): CrudPermiso {
  return { crear, leer, editar, eliminar: false };
}
const ver = (): CrudPermiso => ({ crear: false, leer: true, editar: false, eliminar: false });
const none = (): CrudPermiso => ({ crear: false, leer: false, editar: false, eliminar: false });
const todo = () => manage(true, true, true);

/*
 * Qué abre cada módulo (para leer la tabla):
 *   reportes     → Reportes, Finanzas, Conciliación bancaria y gastos generales: la ganancia de la empresa.
 *   vehiculos    → Vehículos y su ficha, con los gastos de repuestos por carro.
 *   distribuidor → Distribución, Proveedores y órdenes de compra (también el proveedor de un gasto en la ficha).
 *   taller       → La pantalla del taller (TV/PC) y el mapa del taller.
 *   nomina       → Trabajos de los mecánicos, reglas de comisión y pagos.
 */
export const PERMISOS_DEFAULT: Record<string, Permisos> = {
  // Usuario Maestro — acceso total (único rol que puede eliminar).
  admin: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: full(true),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: full(true),
    calculadora: full(true), configuracion: full(true), empleados: full(true), distribuidor: full(true), presupuestos: full(true), nomina: full(true)
  },
  // Supervisor — la operación de su sede, sin finanzas ni configuración.
  supervisor: {
    dashboard: ver(), clientes: todo(), vehiculos: todo(), servicios: todo(), taller: todo(),
    agenda: todo(), whatsapp: todo(), leads: todo(), inventario: ver(), papelera: none(),
    ventas: ver(), ia_asistente: todo(), reportes: none(), actividad: ver(),
    calculadora: full(true), configuracion: none(), empleados: todo(), distribuidor: todo(), presupuestos: todo(), nomina: todo()
  },
  // Administración — las finanzas de la empresa. Ve todo lo operativo, no configura.
  administracion: {
    dashboard: ver(), clientes: todo(), vehiculos: todo(), servicios: ver(), taller: ver(),
    agenda: ver(), whatsapp: ver(), leads: ver(), inventario: ver(), papelera: ver(),
    ventas: todo(), ia_asistente: todo(), reportes: todo(), actividad: ver(),
    calculadora: full(true), configuracion: none(), empleados: todo(), distribuidor: todo(), presupuestos: ver(), nomina: todo()
  },
  // Cobranza — la caja: ventas, cobros, facturas y cierre.
  cobranza: {
    dashboard: ver(), clientes: todo(), vehiculos: ver(), servicios: ver(), taller: none(),
    agenda: none(), whatsapp: ver(), leads: none(), inventario: ver(), papelera: none(),
    ventas: todo(), ia_asistente: none(), reportes: ver(), actividad: none(),
    calculadora: full(true), configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: ver(), nomina: none()
  },
  // Almacén — inventario, proveedores y compras.
  almacen: {
    dashboard: ver(), clientes: none(), vehiculos: ver(), servicios: ver(), taller: ver(),
    agenda: none(), whatsapp: none(), leads: none(), inventario: todo(), papelera: none(),
    ventas: none(), ia_asistente: none(), reportes: none(), actividad: none(),
    calculadora: full(true), configuracion: none(), empleados: none(), distribuidor: todo(), presupuestos: ver(), nomina: none()
  },
  // Atención al Cliente — recepción. Registra la entrada, no toca dinero.
  atencion_cliente: {
    dashboard: ver(), clientes: todo(), vehiculos: todo(), servicios: manage(true, true, false), taller: ver(),
    agenda: todo(), whatsapp: todo(), leads: todo(), inventario: ver(), papelera: none(),
    ventas: none(), ia_asistente: todo(), reportes: none(), actividad: none(),
    calculadora: full(true), configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: todo(), nomina: none()
  },
  // Jefe de Taller — el piso: órdenes, mecánicos, vehículos y su ficha, inventario.
  jefe_taller: {
    dashboard: ver(), clientes: todo(), vehiculos: todo(), servicios: todo(), taller: todo(),
    agenda: ver(), whatsapp: none(), leads: none(), inventario: todo(), papelera: none(),
    ventas: none(), ia_asistente: todo(), reportes: none(), actividad: none(),
    calculadora: full(true), configuracion: none(), empleados: ver(), distribuidor: todo(), presupuestos: todo(), nomina: manage(true, true, true)
  },
  // Presupuesto — cotiza y registra el ingreso con su precio.
  presupuesto: {
    dashboard: ver(), clientes: todo(), vehiculos: todo(), servicios: manage(true, true, true), taller: ver(),
    agenda: ver(), whatsapp: ver(), leads: ver(), inventario: ver(), papelera: none(),
    ventas: none(), ia_asistente: todo(), reportes: none(), actividad: none(),
    calculadora: full(true), configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: todo(), nomina: none()
  },
  // Taller (pantalla) — solo la pantalla del taller: ver y cargar trabajos.
  taller: {
    dashboard: none(), clientes: none(), vehiculos: none(), servicios: ver(), taller: manage(true, true, true),
    agenda: none(), whatsapp: none(), leads: none(), inventario: none(), papelera: none(),
    ventas: none(), ia_asistente: none(), reportes: none(), actividad: none(),
    calculadora: none(), configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: none(), nomina: none()
  },
  // Personal de nómina — no entra al sistema.
  mecanico: {
    dashboard: none(), clientes: none(), vehiculos: none(), servicios: none(), taller: none(),
    agenda: none(), whatsapp: none(), leads: none(), inventario: none(), papelera: none(),
    ventas: none(), ia_asistente: none(), reportes: none(), actividad: none(),
    calculadora: none(), configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: none(), nomina: none()
  },
};

// REGLA DEL SISTEMA: la eliminación definitiva es exclusiva del Usuario Maestro.
// Se fuerza eliminar=false en TODOS los roles excepto admin.
for (const [rol, perms] of Object.entries(PERMISOS_DEFAULT)) {
  if (rol === 'admin') continue;
  for (const mod of MODULES) perms[mod] = { ...normalizePermiso(perms[mod]), eliminar: false };
}

// Permiso mínimo seguro para roles desconocidos: solo lectura del dashboard.
const MINIMAL_PERMISOS: Permisos = {
  dashboard: perm(false, true, false, false), clientes: full(false), vehiculos: full(false), servicios: full(false),
  taller: full(false), agenda: full(false), whatsapp: full(false), leads: full(false), inventario: full(false),
  papelera: full(false), ventas: full(false), ia_asistente: full(false), reportes: full(false), actividad: full(false),
  calculadora: full(true), configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(false), nomina: full(false)
};

export function getPermisos(
  rol: string | undefined | null,
  storedPermisos?: Record<string, PermisoValue>,
  defaultsOverride?: Record<string, Permisos> | null
): Permisos {
  const canonical = resolveRol(rol);
  const codeDefaults = PERMISOS_DEFAULT[canonical] || (rol ? PERMISOS_DEFAULT[rol] : undefined) || MINIMAL_PERMISOS;
  const source = defaultsOverride ?? PERMISOS_DEFAULT;
  const rawDefaults = source[canonical] || (rol ? source[rol] : undefined) || codeDefaults;

  // Asegurar que todos los módulos existan en defaults por si el rol en BD
  // se guardó antes de añadir un nuevo módulo (p.ej. nomina, presupuestos).
  const defaults: any = {};
  for (const mod of MODULES) {
    if (rawDefaults[mod] !== undefined && rawDefaults[mod] !== null) {
      defaults[mod] = normalizePermiso(rawDefaults[mod]);
    } else if (codeDefaults[mod] !== undefined && codeDefaults[mod] !== null) {
      defaults[mod] = normalizePermiso(codeDefaults[mod]);
    } else {
      defaults[mod] = { crear: false, leer: false, editar: false, eliminar: false };
    }
  }

  if (!storedPermisos) return defaults as Permisos;
  
  const merged = { ...defaults };
  for (const [key, val] of Object.entries(storedPermisos)) {
    if (key in defaults && val !== undefined && val !== null) {
      merged[key as keyof Permisos] = normalizePermiso(val);
    }
  }
  return merged as Permisos;
}

// ── Reglas de sistema ───────────────────────────────────────────────────────
// Cuenta maestra genérica. Asignar el rol de Usuario Maestro lo puede hacer
// cualquier Usuario Maestro (Juan y esta cuenta), no solo ella.
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

  const escribe = (m: keyof Permisos) => can(m, 'crear') || can(m, 'editar');

  const capabilities: ChatbotCapability[] = [
    { key: 'consultar', label: 'Consultar el sistema (Modo Dios)', allowed: puedeUsarModoDios,
      detail: 'Ventas, servicios, citas, inventario, reportes, clientes y vehículos en tiempo real.' },
    { key: 'servicios', label: 'Registrar / editar servicios por chat', allowed: puedeUsarModoDios && escribe('servicios'),
      detail: 'Crear y actualizar órdenes de taller desde WhatsApp.' },
    { key: 'vehiculos', label: 'Registrar / editar vehículos por chat', allowed: puedeUsarModoDios && escribe('vehiculos'),
      detail: 'Ingresar vehículos al sistema con su placa, marca, modelo y año.' },
    { key: 'citas', label: 'Agendar / editar citas por chat', allowed: puedeUsarModoDios && escribe('agenda'),
      detail: 'Crear y modificar citas en la agenda.' },
    { key: 'clientes', label: 'Registrar / editar clientes por chat', allowed: puedeUsarModoDios && escribe('clientes'),
      detail: 'Alta y actualización de clientes y sus datos.' },
    { key: 'presupuestos', label: 'Crear presupuestos por chat', allowed: puedeUsarModoDios && escribe('presupuestos'),
      detail: 'Registrar presupuestos con ítems, cantidades y precios.' },
    { key: 'ventas', label: 'Registrar / cobrar ventas por chat', allowed: puedeUsarModoDios && escribe('ventas'),
      detail: 'Registrar ventas, abonos y marcar pendientes como pagadas.' },
    { key: 'inventario', label: 'Gestionar inventario / stock por chat', allowed: puedeUsarModoDios && escribe('inventario'),
      detail: 'Actualizar precios, existencias y productos.' },
    { key: 'ganancias', label: 'Ver ganancias y márgenes (confidencial)', allowed: puedeUsarModoDios && (esAdmin || resolveRol(rol) === 'dueno' || can('distribuidor', 'leer')),
      detail: 'Costo de fabricante, reventa y margen. Nunca visible para clientes.' },
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

// ══════════════════════════════════════════════════════════════════════════
//  NÓMINA · COMISIONES DINÁMICAS · ABONOS  (Motor v2.0)
// ══════════════════════════════════════════════════════════════════════════

/** Monedas soportadas por el motor de nómina (canónico = USD). */
export type MonedaNomina = 'USD' | 'EUR' | 'VES';

/** Zonas operativas — coinciden con las categorías de ventas_dia. */
export type ZonaTrabajo =
  | 'alineacion' | 'mecanica' | 'escape' | 'frenos'
  | 'autolavado' | 'cauchera' | 'electronica' | 'latoneria' | 'general' | 'all';

export const ZONAS_TRABAJO: { key: ZonaTrabajo; label: string }[] = [
  { key: 'alineacion', label: 'Alineación y Balanceo' },
  { key: 'mecanica', label: 'Mecánica' },
  { key: 'escape', label: 'Escapes / Silenciadores' },
  { key: 'frenos', label: 'Frenos' },
  { key: 'autolavado', label: 'Autolavado' },
  { key: 'cauchera', label: 'Cauchera' },
  { key: 'electronica', label: 'Electrónica' },
  { key: 'latoneria', label: 'Latonería y Pintura' },
  { key: 'general', label: 'General' },
];

export type TipoReglaComision = 'porcentaje' | 'fijo_semanal' | 'override_cascada' | 'tarifa_flat';
export type BaseComision = 'mano_obra' | 'ingreso_total';

/** Regla de comisión dinámica vinculada a un empleado (sin hardcodear nombres). */
export interface CommissionRule {
  id: string;
  empleado_id: string | null;
  zona: ZonaTrabajo;
  tipo_regla: TipoReglaComision;
  base: BaseComision;
  valor: number;                 // % (25, 40, 7) o monto fijo semanal (40)
  moneda: MonedaNomina;
  aplica_monedas: MonedaNomina[] | null;   // null = cualquier moneda
  proveedor_pct: number;         // % al proveedor externo (puente)
  proveedor_nombre: string | null;
  prioridad: number;
  condiciones: Record<string, any>;
  descripcion: string | null;
  activo: boolean;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  sede_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tarifa a destajo (Freddy, revisión $2, etc.). */
export interface FlatRate {
  id: string;
  empleado_id: string | null;
  zona: ZonaTrabajo;
  servicio_key: string;
  label: string;
  monto: number;
  moneda: MonedaNomina;
  activo: boolean;
  sede_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoJob = 'pendiente' | 'liquidado' | 'anulado';

/** Asignación de trabajo a técnico con snapshot congelado del cálculo. */
export interface JobAssignment {
  id: string;
  fecha: string;
  empleado_id: string | null;
  es_taller: boolean;
  empleado_nombre: string | null;
  zona: ZonaTrabajo;
  tipo_trabajo: string | null;
  servicio_key: string | null;
  descripcion: string | null;
  referencia_tabla: string | null;
  referencia_id: string | null;
  ingreso_total: number;
  mano_obra: number;
  cantidad: number;
  moneda: MonedaNomina;
  tasa_cambio: number;
  ingreso_usd: number;
  mano_obra_usd: number;
  regla_id: string | null;
  tipo_regla: TipoReglaComision | null;
  comision: number;
  comision_moneda: MonedaNomina;
  comision_usd: number;
  es_override: boolean;
  override_de: string | null;
  proveedor_monto: number;
  proveedor_monto_usd: number;
  proveedor_nombre: string | null;
  lycos_neto: number;
  desglose: Record<string, any>;
  estado: EstadoJob;
  payroll_ledger_id: string | null;
  sede_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoLiquidacion = 'borrador' | 'pagado' | 'anulado';

/** Liquidación de nómina por empleado y período. */
export interface PayrollLedger {
  id: string;
  empleado_id: string | null;
  empleado_nombre: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  moneda: MonedaNomina;
  sueldo_base: number;
  total_comisiones: number;
  total_overrides: number;
  total_flat: number;
  bruto: number;
  deducciones: number;
  total_pagar: number;
  desglose_monedas: Record<string, number>;
  detalle: unknown[];
  recibo_numero: string | null;
  nota: string | null;
  estado: EstadoLiquidacion;
  pagado_at: string | null;
  pagado_por: string | null;
  metodo_pago: string | null;
  sede_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoAdelanto = 'pendiente' | 'aplicado' | 'anulado';

export interface PayrollAdvance {
  id: string;
  empleado_id: string | null;
  empleado_nombre: string | null;
  fecha: string;
  monto: number;
  moneda: MonedaNomina;
  tasa_cambio: number;
  monto_usd: number;
  motivo: string | null;
  estado: EstadoAdelanto;
  payroll_ledger_id: string | null;
  sede_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** Resumen calculado de las ganancias de un empleado en un período. */
export interface EmployeeEarnings {
  empleado_id: string;
  empleado_nombre: string;
  rol: string;
  periodo_inicio: string;
  periodo_fin: string;
  sueldo_base: number;          // USD
  total_comisiones: number;     // USD (comisiones directas, sin overrides)
  total_overrides: number;      // USD (cascada, p.ej. Jim 7%)
  total_flat: number;           // USD (destajo)
  bruto: number;                // USD
  deducciones: number;          // USD (adelantos pendientes)
  total_pagar: number;          // USD
  desglose_monedas: Record<string, number>;
  jobs: JobAssignment[];
  adelantos: PayrollAdvance[];
  /** Trabajos de órdenes que siguen abiertas: se pagan al entregarse el carro. */
  jobs_en_curso?: JobAssignment[];
  en_curso_usd?: number;
  liquidado: boolean;
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
