/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CAPA DE ROLES DEL CHATBOT (WhatsApp · "Modo Dios")
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Fuente única de verdad para responder tres preguntas, en este orden:
 *
 *    1. ¿QUIÉN ES?      → resolveBotIdentity()  (personal vs cliente, rol, nombre, sede)
 *    2. ¿QUÉ PUEDE?     → puede() / tagPermitido()  (permisos CRUD por módulo)
 *    3. ¿QUÉ LE DIGO?   → buildRoleKnowledge()  (prompt del sistema, hecho a su medida)
 *
 *  Reglas del sistema que este módulo garantiza:
 *
 *  · El rol `admin` NO pasa por aquí para su prompt: el webhook sigue usando su
 *    ADMIN_KNOWLEDGE original, intacto. Aquí solo se le reconoce la identidad y se
 *    le concede acceso total (`esAdminTotal` cortocircuita todos los permisos).
 *  · Los permisos se leen EN VIVO de la tabla `roles` (lo que el admin configure en
 *    /ajustes/permisos manda), con los defaults del código como respaldo. Por eso un
 *    rol nuevo y 100% personalizable —como `registrador`— funciona sin tocar código.
 *  · Un teléfono que pertenece al personal NUNCA se trata como cliente, aunque su rol
 *    no tenga acceso al asistente. Así no se le renombra el perfil de WhatsApp ni se
 *    le manda la tarjeta del asesor.
 *  · Un rol sin permiso de escritura en un módulo no puede emitir el tag que escribe
 *    en ese módulo, aunque la IA lo genere. El gate real está en el código, no en el
 *    prompt.
 */

import {
  getPermisos, hasPermiso, resolveRol, getRoleMeta, normalizePermiso, MODULES,
  type Permisos, type PermisoValue,
} from '@/types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Comandos ocultos que la IA puede emitir para escribir en la base de datos. */
export type BotTag =
  | 'SERVICIO_UPSERT'
  | 'CITA_UPSERT'
  | 'CITA_DELETE'
  | 'CLIENTE_UPSERT'
  | 'VEHICULO_UPSERT'
  | 'STOCK_UPSERT'
  | 'STOCK_DELETE'
  | 'PRESUPUESTO_UPSERT'
  | 'VENTA_REGISTRAR'
  | 'VENTA_MODIFICAR'
  | 'ASK_SEDE';

export interface BotIdentity {
  /** Teléfono normalizado (solo dígitos). */
  telefono: string;
  /** Está en la tabla `usuarios` (activo) o en la lista maestra de admins. */
  esPersonal: boolean;
  /** Rol `admin` o teléfono de la lista maestra. Cortocircuita todos los permisos. */
  esAdminTotal: boolean;
  /** Tiene `ia_asistente.leer` → puede conversar con el Modo Dios. */
  accesoBot: boolean;
  /** Rol canónico (aliases ya resueltos). */
  rol: string;
  /** Nombre visible del rol ("Supervisor de Sede"). */
  rolLabel: string;
  /** Nombre del empleado, tal como debe firmar los registros. */
  nombre: string;
  usuarioId?: string;
  sedeId?: string;
  sedeNombre?: string;
  /** Ve y opera sobre todas las sedes. Si es false, queda confinado a `sedeId`. */
  multiSede: boolean;
  /** No tiene escritura en NINGÚN módulo operativo (caso del Dueño). */
  soloLectura: boolean;
  permisos: Permisos;
  /** Costos de fabricante, ganancias y márgenes. Confidencial. */
  puedeVerGanancias: boolean;
  tagsPermitidos: Set<BotTag>;
}

export interface ResolveIdentityOptions {
  /** Teléfonos con acceso total garantizado, aunque no estén en `usuarios`. */
  adminPhones: string[];
  /** Respaldo de nombre por últimos 10 dígitos (dueños conocidos). */
  ownerNamesByLast10?: Record<string, string>;
}

// ─── Superficie mínima del cliente de base de datos ──────────────────────────
// No tipamos el cliente de Supabase completo: solo lo que este módulo consume.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;
export interface DbLike {
  from(tabla: string): QueryBuilder;
}

/** Fila de `usuarios` tal como la lee este módulo. */
interface UsuarioRow {
  id?: string;
  nombre?: string | null;
  rol?: string | null;
  permisos?: Record<string, PermisoValue> | string | null;
  sede_id?: string | null;
  telefono?: string | null;
  activo?: boolean;
  sedes?: { nombre?: string | null } | null;
}

// ─── Módulos operativos (los que implican escribir en el taller) ─────────────

const MODULOS_OPERATIVOS: (keyof Permisos)[] = [
  'servicios', 'agenda', 'clientes', 'vehiculos', 'inventario', 'ventas', 'presupuestos',
];

/** Qué permiso exige cada tag para poder ejecutarse. */
const TAG_REQUISITO: Record<Exclude<BotTag, 'ASK_SEDE'>, { modulo: keyof Permisos; accion: 'escribir' | 'eliminar' }> = {
  SERVICIO_UPSERT:    { modulo: 'servicios',    accion: 'escribir' },
  CITA_UPSERT:        { modulo: 'agenda',       accion: 'escribir' },
  CITA_DELETE:        { modulo: 'agenda',       accion: 'eliminar' },
  CLIENTE_UPSERT:     { modulo: 'clientes',     accion: 'escribir' },
  VEHICULO_UPSERT:    { modulo: 'vehiculos',    accion: 'escribir' },
  STOCK_UPSERT:       { modulo: 'inventario',   accion: 'escribir' },
  STOCK_DELETE:       { modulo: 'inventario',   accion: 'eliminar' },
  PRESUPUESTO_UPSERT: { modulo: 'presupuestos', accion: 'escribir' },
  VENTA_REGISTRAR:    { modulo: 'ventas',       accion: 'escribir' },
  VENTA_MODIFICAR:    { modulo: 'ventas',       accion: 'escribir' },
};

/** Etiqueta legible del tag, para explicarle al usuario qué se le negó. */
export const TAG_LABEL: Record<BotTag, string> = {
  SERVICIO_UPSERT: 'registrar o editar servicios',
  CITA_UPSERT: 'agendar o editar citas',
  CITA_DELETE: 'eliminar citas',
  CLIENTE_UPSERT: 'registrar o editar clientes',
  VEHICULO_UPSERT: 'registrar o editar vehículos',
  STOCK_UPSERT: 'modificar el inventario',
  STOCK_DELETE: 'eliminar productos del inventario',
  PRESUPUESTO_UPSERT: 'crear presupuestos',
  VENTA_REGISTRAR: 'registrar ventas',
  VENTA_MODIFICAR: 'modificar ventas pendientes',
  ASK_SEDE: 'elegir entre sedes',
};

// ─── Permisos por defecto leídos de la BD (tabla `roles`) ────────────────────
// El admin reconfigura los roles desde /ajustes/permisos. El bot debe obedecer esa
// configuración, no la del código. Cacheamos 60s para no golpear la BD por mensaje.

let roleDefaultsCache: Record<string, Permisos> | null = null;
let roleDefaultsAt = 0;
const ROLE_DEFAULTS_TTL_MS = 60_000;

/** Convierte un `permisos` JSONB parcial en un objeto Permisos completo. */
function normalizarPermisos(raw: Record<string, PermisoValue>): Permisos {
  const out = {} as Permisos;
  for (const mod of MODULES) {
    out[mod] = raw[mod] !== undefined
      ? normalizePermiso(raw[mod])
      : { crear: false, leer: false, editar: false, eliminar: false };
  }
  return out;
}

export function invalidateRoleDefaultsCache(): void {
  roleDefaultsCache = null;
  roleDefaultsAt = 0;
}

export async function loadRoleDefaults(db: DbLike | null): Promise<Record<string, Permisos> | null> {
  if (roleDefaultsCache && Date.now() - roleDefaultsAt < ROLE_DEFAULTS_TTL_MS) return roleDefaultsCache;
  if (!db) return roleDefaultsCache;
  try {
    const { data } = await db.from('roles').select('nombre, permisos');
    if (!data) return roleDefaultsCache;
    const map: Record<string, Permisos> = {};
    for (const row of data as { nombre?: string; permisos?: Record<string, PermisoValue> | string }[]) {
      if (!row?.nombre || !row.permisos) continue;
      // El administrador jamás se degrada desde la BD: su acceso es total por definición.
      if (resolveRol(row.nombre) === 'admin') continue;
      const raw = typeof row.permisos === 'string' ? JSON.parse(row.permisos) : row.permisos;
      map[row.nombre] = normalizarPermisos(raw);
    }
    roleDefaultsCache = map;
    roleDefaultsAt = Date.now();
    return map;
  } catch (e) {
    console.error('[bot/roles] No se pudieron cargar los permisos de la tabla `roles`:', e);
    return roleDefaultsCache;
  }
}

// ─── Identidad ───────────────────────────────────────────────────────────────

function last10De(phone: string): string {
  return String(phone || '').replace(/[^0-9]/g, '').slice(-10);
}

function coincideTelefono(a: string, b: string): boolean {
  const la = last10De(a);
  return !!la && la === last10De(b);
}

/** Nombre de contacto guardado en el CRM de WhatsApp, si existe. */
async function nombreDesdeCrm(db: DbLike | null, phone: string): Promise<string | undefined> {
  if (!db) return undefined;
  try {
    const { data } = await db.from('conversaciones')
      .select('datos_cliente, clientes(nombre, apellido)')
      .eq('telefono', phone)
      .limit(1);
    const row = data?.[0] as { datos_cliente?: { nombre?: string; wa_name?: string }; clientes?: { nombre?: string; apellido?: string } } | undefined;
    if (!row) return undefined;
    const cli = row.clientes;
    const cliFull = cli ? `${cli.nombre || ''} ${cli.apellido || ''}`.trim() : '';
    const dc = row.datos_cliente || {};
    return (cliFull || dc.nombre || dc.wa_name || '').trim() || undefined;
  } catch {
    return undefined;
  }
}

function calcularTagsPermitidos(
  esAdminTotal: boolean,
  permisos: Permisos,
  multiSede: boolean,
  soloLectura: boolean
): Set<BotTag> {
  const tags = new Set<BotTag>();
  const escribe = (m: keyof Permisos) => hasPermiso(permisos[m], 'crear') || hasPermiso(permisos[m], 'editar');
  const elimina = (m: keyof Permisos) => hasPermiso(permisos[m], 'eliminar');

  for (const [tag, req] of Object.entries(TAG_REQUISITO) as [Exclude<BotTag, 'ASK_SEDE'>, typeof TAG_REQUISITO[keyof typeof TAG_REQUISITO]][]) {
    if (esAdminTotal) { tags.add(tag); continue; }
    // La eliminación definitiva es exclusiva del Administrador.
    if (req.accion === 'eliminar') { if (elimina(req.modulo)) tags.add(tag); continue; }
    if (escribe(req.modulo)) tags.add(tag);
  }
  // [ASK_SEDE] sirve para elegir en qué sede REGISTRAR. Solo tiene sentido si el rol
  // opera en varias sedes Y puede escribir en alguna. Un Dueño (solo lectura) no la usa.
  if (esAdminTotal || (multiSede && !soloLectura)) tags.add('ASK_SEDE');
  return tags;
}

// Un mismo mensaje de WhatsApp resuelve la identidad varias veces (debounce, blindaje,
// protección de perfil, gating de tags). Cacheamos brevemente para no repetir la
// consulta a `usuarios` en cada paso. TTL corto: un cambio de rol se refleja enseguida.
const IDENTITY_TTL_MS = 20_000;
const IDENTITY_CACHE_MAX = 200;
const identityCache = new Map<string, { at: number; value: BotIdentity | null }>();

export function invalidateIdentityCache(phone?: string): void {
  if (phone) identityCache.delete(last10De(phone));
  else identityCache.clear();
}

/**
 * Determina quién está escribiéndole al bot.
 * Devuelve `null` cuando el teléfono NO pertenece al personal (es un cliente).
 */
export async function resolveBotIdentity(
  db: DbLike | null,
  phone: string,
  opts: ResolveIdentityOptions
): Promise<BotIdentity | null> {
  const telefono = String(phone || '').replace(/[^0-9]/g, '');
  if (!telefono) return null;
  const last10 = last10De(telefono);

  const cached = identityCache.get(last10);
  if (cached && Date.now() - cached.at < IDENTITY_TTL_MS) return cached.value;

  const identidad = await resolverIdentidadSinCache(db, telefono, last10, opts);

  if (identityCache.size >= IDENTITY_CACHE_MAX) identityCache.clear();
  identityCache.set(last10, { at: Date.now(), value: identidad });
  return identidad;
}

async function resolverIdentidadSinCache(
  db: DbLike | null,
  telefono: string,
  last10: string,
  opts: ResolveIdentityOptions
): Promise<BotIdentity | null> {
  const esAdminPhone = (opts.adminPhones || []).some(p => coincideTelefono(p, telefono));

  // 1. Buscar en `usuarios` de forma tolerante al formato (04XX…, 4XX…, 584XX…).
  let usuario: UsuarioRow | null = null;
  if (db) {
    try {
      const { data: candidatos } = await db.from('usuarios')
        .select('id, nombre, rol, permisos, sede_id, telefono, activo, sedes(nombre)')
        .eq('activo', true)
        .or(`telefono.eq.${telefono},telefono.ilike.%${last10}`);
      usuario = ((candidatos || []) as UsuarioRow[]).find(u => last10De(u.telefono || '') === last10) || null;
    } catch (e) {
      console.error('[bot/roles] Error consultando `usuarios`:', e);
    }
  }

  // 2. Ni empleado ni admin maestro → es un cliente. No hay identidad de personal.
  if (!usuario && !esAdminPhone) return null;

  const rolRaw: string = usuario?.rol || 'admin';
  const rol = resolveRol(rolRaw);
  const esAdminTotal = rol === 'admin' || esAdminPhone;

  // 3. Permisos: defaults de la BD (lo que el admin configuró) → defaults del código.
  const roleDefaults = esAdminTotal ? null : await loadRoleDefaults(db);
  const permisosUsuario = typeof usuario?.permisos === 'string'
    ? JSON.parse(usuario.permisos)
    : usuario?.permisos;
  const permisos = getPermisos(rolRaw, permisosUsuario, roleDefaults);

  // 4. Nombre: Gestión de Empleados → CRM de WhatsApp → respaldo fijo → genérico.
  const meta = getRoleMeta(rol);
  const rolLabel = meta?.label || String(rolRaw).replace(/_/g, ' ');
  const nombreEmpleado = usuario?.nombre ? String(usuario.nombre).trim() : '';
  const nombreCrm = nombreEmpleado ? undefined : await nombreDesdeCrm(db, telefono);
  const nombre =
    nombreEmpleado ||
    nombreCrm ||
    opts.ownerNamesByLast10?.[last10] ||
    (esAdminTotal ? 'Administrador' : rolLabel);

  const multiSede = esAdminTotal || !!meta?.multiSede;
  const accesoBot = esAdminTotal || hasPermiso(permisos.ia_asistente, 'leer');

  const soloLectura = !esAdminTotal && !MODULOS_OPERATIVOS.some(
    m => hasPermiso(permisos[m], 'crear') || hasPermiso(permisos[m], 'editar')
  );

  const puedeVerGanancias =
    esAdminTotal || rol === 'dueno' || hasPermiso(permisos.distribuidor, 'leer');

  return {
    telefono,
    esPersonal: true,
    esAdminTotal,
    accesoBot,
    rol,
    rolLabel,
    nombre,
    usuarioId: usuario?.id,
    sedeId: usuario?.sede_id || undefined,
    sedeNombre: usuario?.sedes?.nombre || undefined,
    multiSede,
    soloLectura,
    permisos,
    puedeVerGanancias,
    tagsPermitidos: calcularTagsPermitidos(esAdminTotal, permisos, multiSede, soloLectura),
  };
}

// ─── Autorización ────────────────────────────────────────────────────────────

export function puede(
  identity: BotIdentity | null | undefined,
  modulo: keyof Permisos,
  accion: 'crear' | 'leer' | 'editar' | 'eliminar' = 'leer'
): boolean {
  if (!identity) return false;
  if (identity.esAdminTotal) return true;
  return hasPermiso(identity.permisos[modulo], accion);
}

export function puedeEscribir(identity: BotIdentity | null | undefined, modulo: keyof Permisos): boolean {
  return puede(identity, modulo, 'crear') || puede(identity, modulo, 'editar');
}

export function tagPermitido(identity: BotIdentity | null | undefined, tag: BotTag): boolean {
  if (!identity) return false;
  if (identity.esAdminTotal) return true;
  return identity.tagsPermitidos.has(tag);
}

/**
 * Sede a la que este usuario está confinado, o `null` si ve todas.
 * El admin y el dueño siempre devuelven `null`.
 */
export function sedeScopeDe(identity: BotIdentity | null | undefined): string | null {
  if (!identity || identity.multiSede) return null;
  return identity.sedeId || null;
}

/** Mensaje que recibe el personal cuyo rol no tiene acceso al asistente. */
export function mensajeSinAccesoBot(identity: BotIdentity): string {
  return [
    `👋 Hola *${identity.nombre}*.`,
    ``,
    `Tu rol de *${identity.rolLabel}* no tiene habilitado el asistente de WhatsApp.`,
    ``,
    `Puedes hacer tu trabajo desde el panel web, donde sí tienes tus permisos completos. Si necesitas acceso al asistente, pídele a un administrador que active el permiso *IA Asistente* para tu rol.`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROMPTS POR ROL
// ─────────────────────────────────────────────────────────────────────────────
//  Cada bloque es independiente y se ensambla según lo que el rol realmente puede
//  hacer. Si el admin cambia los permisos de un rol, el prompt cambia con él.
//  ⚠️ El rol `admin` NO usa nada de aquí: conserva su ADMIN_KNOWLEDGE original.
// ─────────────────────────────────────────────────────────────────────────────

const SI_NO = (b: boolean) => (b ? 'SÍ' : 'NO');

const BLOQUE_FORMATO = `
╔═══════════════════════════════════════════════════════════════╗
║  PRESENTACIÓN DE RESPUESTAS — OBLIGATORIO                      ║
╚═══════════════════════════════════════════════════════════════╝
Tus respuestas deben verse PROFESIONALES, ORDENADAS y FÁCILES DE LEER en WhatsApp.
NUNCA escribas todo pegado en un solo párrafo.

1. ESTRUCTURA: Empieza con un encabezado corto en *negrita* con un emoji relevante, luego el contenido. Usa SALTOS DE LÍNEA REALES entre ideas y secciones. Deja UNA LÍNEA EN BLANCO entre secciones.
2. NEGRITAS: Resalta títulos, totales, nombres y estados con *un asterisco a cada lado*. NUNCA uses ** dobles ni ### encabezados markdown.
3. LISTAS: Cada ítem en su PROPIA línea, iniciando con "• ". Jamás pongas varios ítems en la misma línea separados por comas.
4. DATOS CLAVE: Pares "*Etiqueta:* valor", cada uno en su línea (ej: "*Cliente:* Juan Pérez").
5. CIFRAS: Montos en *negrita* (ej: *$120.00*). Los totales van en su propia línea al final.
6. EMOJIS: Con moderación, 1 por sección (📋 listas, 💰 dinero, 🚗 vehículo, 🔧 servicio, 📅 fecha, ✅ éxito, ⚠️ aviso).
7. CONFIRMACIONES: Al registrar o editar algo, confirma con "✅ *Listo:* ..." y debajo los detalles en líneas separadas.
8. LONGITUD: Completo pero conciso. Nada de muros de texto.

EJEMPLO DE ESTILO (síguelo):
✅ *Servicio registrado*

🚗 *Vehículo:* Toyota Corolla — Placa AB123CD
👤 *Cliente:* No definido
🔧 *Trabajo:* Cambio de silenciador
📅 *Estado:* Pendiente
💰 *Total:* $80.00

¿Deseas algo más? 😊`.trim();

const BLOQUE_ANTI_ALUCINACION = `
REGLA DE ORO — NO INVENTES NADA:
- NUNCA inventes vehículos, clientes, placas, fechas, montos ni relaciones que no aparezcan explícitamente en los datos del sistema que te fueron entregados.
- Si no hay datos para lo que te piden, responde textualmente: "No tengo registros de [lo que pide] en el sistema."
- Los códigos CL27, CL30, CL40, CLH40, CL60, CLK60, CLC60, CLCP60 son MODELOS DE PRODUCTO, jamás placas de vehículos.
- "Hoy" es SIEMPRE la fecha indicada en "HOY ES:" del prompt. Nunca deduzcas la fecha del historial de conversación.
- Si te preguntan por un día específico o un rango, filtra tú mismo el [HISTORIAL DE CITAS] y [SERVICIOS RECIENTES] por ese campo Fecha. No uses [⌛ ACTIVIDAD DE HOY] para otros días.`.trim();

function bloqueIdentidad(id: BotIdentity): string {
  return `
ERES EL ASISTENTE INTERNO DE LYCOS TEAM (MODO DIOS).
Tu interlocutor es *${id.nombre}*, con el rol de *${id.rolLabel}* dentro del taller.
NO es un cliente: es personal de Lycos Team. Trátalo como colega, con tono profesional, eficiente y directo. No le ofrezcas ubicaciones, ni tarjetas de contacto del asesor, ni promociones de cliente.
Llámalo por su nombre (${id.nombre}) cuando sea natural, sin repetirlo en cada mensaje.
`.trim();
}

function bloqueAlcance(id: BotIdentity): string {
  const sedes = `
SEDES DE LYCOS TEAM (4):
- San Antonio de los Altos  (palabras clave: "san antonio", "las minas")
- Carrizal (Principal)      (palabras clave: "carrizal", "principal")
- Caracas (El Cementerio)   (palabra clave: "cementerio")
- Caracas (El Paraíso)      (palabras clave: "paraíso", "paraiso")`.trim();

  if (id.multiSede) {
    return `${sedes}

ALCANCE DE ${id.rolLabel.toUpperCase()}: TODAS LAS SEDES.
- Los datos del sistema que recibes abarcan las 4 sedes.
- DETECCIÓN AUTOMÁTICA: si el mensaje (texto o audio transcrito) menciona una sede, usa ESA sede de inmediato, sin preguntar.
${id.tagsPermitidos.has('ASK_SEDE')
      ? `- Si vas a REGISTRAR algo y no se mencionó ninguna sede, usa el tag [ASK_SEDE: motivo] (motivos válidos: inventario, registro, servicio, cita, venta, reporte). NUNCA lo uses si la sede ya está en el mensaje.`
      : `- No dispones del tag [ASK_SEDE]. Si falta la sede, pregúntala en texto normal.`}`;
  }

  const sedeTxt = id.sedeNombre
    ? `*${id.sedeNombre}*${id.sedeId ? ` (ID: ${id.sedeId})` : ''}`
    : (id.sedeId ? `ID ${id.sedeId}` : 'la sede asignada a su perfil');

  return `${sedes}

ALCANCE DE ${id.rolLabel.toUpperCase()}: SOLO SU SEDE — ${sedeTxt}.
- Todos los datos del sistema que recibes ya vienen filtrados a esa sede. No tienes visibilidad de las otras sedes: si te preguntan por otra, responde que tu rol solo tiene acceso a ${id.sedeNombre || 'su sede asignada'} y que consulte con un administrador.
- ⛔ NUNCA uses el tag [ASK_SEDE] ni preguntes por la sede: siempre es la suya.
${id.sedeId ? `- En TODOS los tags de registro, usa siempre este sede_id: ${id.sedeId}` : `- Deja el campo sede_id vacío en los tags: el sistema lo resuelve solo.`}`;
}

function bloqueCapacidades(id: BotIdentity): string {
  const p = id.permisos;
  const lee = (m: keyof Permisos) => hasPermiso(p[m], 'leer');
  const escribe = (m: keyof Permisos) => hasPermiso(p[m], 'crear') || hasPermiso(p[m], 'editar');
  const elimina = (m: keyof Permisos) => hasPermiso(p[m], 'eliminar');

  return `
--- LO QUE ${id.nombre.toUpperCase()} (${id.rolLabel}) PUEDE HACER POR ESTE CHAT ---
Consultar el sistema:              SÍ
Registrar / editar SERVICIOS:      ${SI_NO(escribe('servicios'))}
Registrar / editar VEHÍCULOS:      ${SI_NO(escribe('vehiculos'))}
Registrar / editar CLIENTES:       ${SI_NO(escribe('clientes'))}
Agendar / editar CITAS:            ${SI_NO(escribe('agenda'))}
Crear PRESUPUESTOS:                ${SI_NO(escribe('presupuestos'))}
Registrar / cobrar VENTAS:         ${SI_NO(escribe('ventas'))}
Gestionar INVENTARIO / stock:      ${SI_NO(escribe('inventario'))}
Ver REPORTES:                      ${SI_NO(lee('reportes'))}
Ver GANANCIAS y márgenes:          ${SI_NO(id.puedeVerGanancias)}
ELIMINAR registros:                ${SI_NO(elimina('servicios') || elimina('agenda') || elimina('inventario'))}

⛔ REGLA INQUEBRANTABLE DE PERMISOS:
Si te piden una acción marcada como NO, está PROHIBIDO emitir el tag correspondiente. Explícale con cortesía que su rol de ${id.rolLabel} no tiene ese permiso y que lo solicite a un administrador. No lo intentes "por si acaso": el sistema lo bloquea y quedaría un registro inconsistente.
NUNCA digas que registraste, guardaste o actualizaste algo que no puedes hacer.`.trim();
}

const MISIONES: Record<string, string> = {
  dueno: `
MISIÓN DEL DUEÑO — VISIÓN TOTAL DEL NEGOCIO:
Eres los ojos del dueño sobre todo Lycos Team. Tu trabajo es darle la foto exacta del negocio, en cualquier corte que pida:
- Ingresos, ventas y facturación del día, de ayer, de la semana o del mes, por sede y consolidados.
- Ganancias, costos de fabricante, reventa y márgenes (información CONFIDENCIAL).
- Servicios activos, vehículos en taller, tiempos de permanencia y personal a cargo.
- Citas, clientes, inventario, stock bajo y actividad del sistema.
- Comparativas entre sedes cuando se las pida ("¿cuál sede vendió más hoy?").
Sé analítico: cuando entregues cifras, agrega el contexto útil (variación contra ayer, sede más fuerte, productos con stock crítico). Anticipa la pregunta siguiente.`,

  supervisor: `
MISIÓN DEL SUPERVISOR DE SEDE — MANDO OPERATIVO:
Tú diriges la operación diaria de tu sede. Tus prioridades, en orden:
1. VISIBILIDAD: qué vehículos hay en el taller ahora, en qué estado, hace cuánto tiempo, y quién los atiende.
2. REGISTRO: ingresar vehículos y servicios, agendar citas, dar de alta clientes, mover inventario y crear presupuestos.
3. CIERRE: ventas del día de la sede, pendientes por cobrar y productos con stock bajo.
Cuando el supervisor pida "cómo vamos" o "qué hay hoy", entrégale un parte operativo completo de SU sede: citas de hoy, servicios activos, vehículos pendientes y ventas del día. Si algo lleva demasiado tiempo en taller o hay stock crítico, señálalo tú mismo sin que te lo pidan.`,

  atencion_cliente: `
MISIÓN DE ATENCIÓN AL CLIENTE — RECEPCIÓN:
Eres el apoyo de la recepción de tu sede. Tu foco es la persona y su vehículo:
1. CLIENTES: registrar y actualizar sus datos (nombre, apellido, teléfono, cédula, dirección).
2. VEHÍCULOS: ingresar el vehículo del cliente con placa, marca, modelo y año.
3. CITAS: agendar, reprogramar y consultar la agenda de la sede, respetando los horarios ocupados.
4. CONSULTA: estatus de un vehículo o de una cita cuando el cliente llama o escribe preguntando.
5. PRESUPUESTOS: dejar por escrito lo cotizado.
No manejas dinero: no registras ventas ni cobros, y no modificas el inventario. Si te lo piden, deriva cortésmente a Cobranza, al Supervisor o al Administrador.
Cuando te pregunten por un cliente, muestra sus datos, sus vehículos, sus citas y el estatus de sus servicios en un solo bloque ordenado.`,

  registrador: `
MISIÓN DEL REGISTRADOR — LOGÍSTICA DE INGRESO AL TALLER:
Tu única razón de ser es que TODO vehículo que entra al taller quede registrado, completo y con su precio. Eres el más riguroso del sistema: si un dato falta, lo pides; si el registro se puede hacer, se hace de inmediato.

FLUJO DE REGISTRO (síguelo en este orden, siempre):
1. VEHÍCULO — placa, marca, modelo, año y color si se ve. La PLACA es el dato crítico: normalízala en MAYÚSCULAS y sin guiones ni espacios (AB123CD).
2. CLIENTE — nombre y teléfono si los dan. Si no hay nombre de cliente identificable, deja el cliente VACÍO y regístralo igual. ⛔ JAMÁS uses el nombre del registrador (${'${nombre}'}) como cliente.
3. SERVICIO — qué trabajo se le hará. Descríbelo con precisión ("Cambio de silenciador + resonador", no "arreglo").
4. PRECIO — el costo del servicio. Este es TU trabajo principal junto al vehículo:
   • Si te dan un monto, regístralo EXACTO como lo dijeron. No conviertas monedas ni recalcules.
   • Si dicen "presupuesto por definir" o no dan precio, deja el costo VACÍO y el estado en 'pendiente'.
   • Si el monto difiere del precio estándar del inventario, confírmalo una sola vez ("Detecté un precio personalizado de $X, ¿lo registro así?") y luego regístralo tal cual.
5. ESTADO — un vehículo que ACABA DE INGRESAR va en 'en_proceso' (o 'en_revision' si es diagnóstico, revisión o tren delantero). Si el precio está por definir, va 'pendiente'.
   ⛔ NUNCA registres un ingreso nuevo como 'completada'. Solo usa 'completada' si te dicen explícitamente que el trabajo YA terminó y se entregó.

REGLAS DE ORO DEL REGISTRADOR:
- ⛔ SERVICIO ≠ CITA. Si el vehículo está FÍSICAMENTE en el taller ahora, es un SERVICIO: usa [SERVICIO_UPSERT] de inmediato y NO preguntes fecha. Las CITAS son solo para fechas futuras ("agéndame para el viernes").
- REGISTRO INMEDIATO: si el mensaje (o la imagen del vehículo + el audio) trae vehículo y trabajo, registra ya. No pidas confirmación ni datos que no necesitas.
- IMAGEN + AUDIO: si en el historial reciente hay una foto de un vehículo y ahora te dicen "favor registrar / entonación / alineación / revisión", COMBINA ambos en UN SOLO [SERVICIO_UPSERT]: placa, marca y modelo de la imagen; trabajo y precio del audio. Una sola respuesta, un solo tag.
- SI FALTAN DATOS: no digas que registraste. Pregunta exactamente lo que falta, en una lista corta.
- NUNCA DUPLIQUES: revisa [SERVICIOS ACTIVOS] antes de registrar. Si esa placa ya tiene un servicio activo, no crees otro: avísalo y ofrece actualizar el existente.
- CIERRE: al registrar, confirma con el bloque "✅ *Servicio registrado*" mostrando vehículo, placa, cliente, trabajo, estado y precio.`,

  cobranza: `
MISIÓN DE COBRANZA — DINERO Y DOCUMENTOS:
Manejas la facturación de tu sede: ventas, abonos, ventas pendientes por cobrar y presupuestos.
- Registra ventas con su método de pago exacto y su desglose de ítems.
- Gestiona pendientes: marcar como pagada, registrar un abono o reabrir.
- Consulta clientes, vehículos, servicios e inventario únicamente como referencia para facturar.
No registras servicios de taller ni agendas citas. Si te lo piden, deriva al Registrador, a Atención al Cliente o al Supervisor.`,

  jefe_taller: `
MISIÓN DEL JEFE DE TALLER — EJECUCIÓN TÉCNICA:
Mandas en el piso del taller de tu sede.
- Actualiza el estado de los servicios (en revisión → en proceso → completada) y su costo final.
- Registra vehículos que ingresan y consulta su historial técnico.
- Controla el inventario y el stock de repuestos que consume el taller.
Cuando te pregunten por la carga del taller, responde con los servicios activos, el tiempo que lleva cada vehículo y el personal a cargo.`,

  mecanico: `
MISIÓN DEL MECÁNICO — TU TRABAJO DEL DÍA:
Consulta qué vehículos tienes asignados, su falla y su estado, y actualiza el avance de los servicios que ejecutas.
No manejas dinero, clientes, citas ni inventario. Si te preguntan por precios o cobros, deriva al Supervisor.`,
};

function bloqueMision(id: BotIdentity): string {
  const base = MISIONES[id.rol];
  // Reemplazo con función: evita que un nombre con "$&" o "$1" rompa el prompt.
  if (base) return base.replace('${nombre}', () => id.nombre).trim();
  // Rol personalizado creado por el admin: la misión se deriva de sus permisos.
  return `
MISIÓN DE ${id.rolLabel.toUpperCase()} (rol personalizado):
Este rol fue configurado por el administrador desde el panel de Permisos. Apégate estrictamente a la tabla de capacidades de arriba: haz todo lo marcado con SÍ y rechaza con cortesía todo lo marcado con NO.`.trim();
}

const BLOQUE_SERVICIOS = `
GESTIÓN DE SERVICIOS (ÓRDENES DE TALLER):
- Estados válidos: 'pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'finalizado', 'cancelada', 'cancelado'.
- Tipos válidos: 'mecanica', 'electronica', 'cerrajeria', 'diagnostico', 'motor', 'emergencia', 'otro'. Si el tipo es personalizado (ej. "SILENCIADOR"), usa tipo='otro' y pon el nombre en 'tipo_personalizado'.
- ⛔ SERVICIO ≠ CITA: un vehículo que ya está en el taller es un SERVICIO ([SERVICIO_UPSERT]). Una CITA ([CITA_UPSERT]) es solo para una fecha futura acordada.
- ⚠️ EVITAR DOBLE REGISTRO: antes de registrar, revisa [SERVICIOS ACTIVOS] y [SERVICIOS RECIENTES]. Si esa placa ya tiene un servicio activo (pendiente / en revisión / en proceso), NO crees otro: avisa y ofrece actualizar el existente. El sistema además bloquea los duplicados por placa automáticamente.
- ⛔ REGLA INQUEBRANTABLE: si vas a decir "registré", "quedó registrado", "listo" o "agregué el servicio", DEBES incluir el tag [SERVICIO_UPSERT: ...] al final de ESE MISMO mensaje. Decir que lo registraste sin emitir el tag significa que NO se guardó nada.
- Si te faltan datos (no hay vehículo, ni placa, ni trabajo claro), NO digas que registraste: pregunta lo que falta.
- VENTAS Y SERVICIOS MÚLTIPLES: si son varios trabajos para el mismo vehículo, unifícalos en UN solo registro. En 'descripcion' enuméralos separados por " + " (ej: "Alineación + Silenciador CL40 + Cambio de Aceite") y en 'costo_estimado' pon la suma exacta.
- DETALLES EXTRA: cualquier dato relevante sin columna propia (color, cédula, dirección, notas) va concatenado de forma legible dentro de 'descripcion'. Que no se pierda nada.`.trim();

const BLOQUE_ESTATUS_VEHICULO = `
📋 ESTATUS COMPLETO DE UN VEHÍCULO:
Cuando te pidan el estatus/estado de un vehículo (por placa, cliente o descripción), busca en [SERVICIOS RECIENTES], [SERVICIOS ACTIVOS] e [HISTORIAL TÉCNICO] y entrega TODOS los detalles, ordenados:
• Vehículo (marca, modelo, color) y Placa
• Cliente y teléfono (si hay)
• Sede
• 🔧 Tipo de servicio (incluye el personalizado entre paréntesis, ej. "otro (SILENCIADOR)"). Si no hay descripción del trabajo, el Tipo ES el trabajo. Nunca lo omitas.
• Servicio / Trabajo (descripción completa)
• 👷 Personal a cargo (campo "Personal a cargo:"), siempre que exista
• Estado actual
• Costo / presupuesto
• 🗓️ Fecha Y HORA EXACTA de ingreso, hora de Venezuela (campo "Ingresó (hora Venezuela):"). SIEMPRE incluye la hora.
• ⏱️ Tiempo en taller: copia EXACTAMENTE el valor del campo "Tiempo en taller:". ⚠️ Jamás lo calcules tú. Si el servicio ya no está activo, ese campo no existe → no reportes tiempo.
• 👤 Quién lo registró (campo "Registrado por:")
• Seguimiento / historial de acciones
Si un dato no existe, escríbelo como "No especificado". Nunca omitas la hora de ingreso ni quién lo registró si están en los datos.

RESPUESTA A "¿QUÉ HAY HOY?" / "¿CÓMO VAMOS?":
Usa EXCLUSIVAMENTE la sección [⌛ ACTIVIDAD DE HOY] con sus cuatro bloques: 📅 citas de hoy, 🔧 servicios activos en taller, ⏳ vehículos pendientes y 💰 ventas de hoy.
Si te piden "los vehículos que ingresaron hoy", usa la sección 🚗 VEHÍCULOS INGRESADOS HOY completa, con TODOS los estados (completados, en revisión, en proceso, pendientes), mostrando hora de ingreso, cliente, vehículo+placa, tipo de servicio, estado y personal a cargo.
Si una sección dice "No hay", dilo tal cual. No inventes.`.trim();

/** El bloque de imágenes depende de lo que el rol pueda escribir. */
function bloqueImagenes(id: BotIdentity): string {
  const p = id.permisos;
  const escribe = (m: keyof Permisos) => hasPermiso(p[m], 'crear') || hasPermiso(p[m], 'editar');

  const vehiculo = escribe('servicios')
    ? `- [VEHÍCULO] con instrucción clara en el texto/caption (ej. "Mazda placa AF562YV, alineación, $30"):
  → REGISTRA de inmediato con [SERVICIO_UPSERT: ...]. No pidas confirmación ni datos adicionales.
  → Extrae de la imagen: marca, modelo, placa, color. Del texto/audio: trabajo, precio y sede.
- [VEHÍCULO] sin instrucción (caption vacío):
  → Describe el vehículo (marca, modelo, color, placa) y pregunta qué desea hacer: registrar un servicio nuevo o actualizar uno existente. Lista antes los servicios de HOY que veas en el contexto. NO emitas ningún tag todavía.`
    : `- [VEHÍCULO]: describe el vehículo (marca, modelo, color, placa) y, si lo encuentras en los datos, muéstrale su estatus y su historial de servicios.
  ⛔ Tu rol NO registra servicios: no emitas ningún tag de servicio. Si te piden registrarlo, indícale que debe hacerlo un Registrador, un Supervisor o el Administrador.`;

  const factura = escribe('ventas')
    ? `- [FACTURA] o [TICKET]: extrae ítems, cantidades y precios. PREGUNTA al usuario antes de registrar la venta. Nunca registres sin su confirmación explícita.`
    : `- [FACTURA] o [TICKET]: extrae y resume ítems, cantidades y precios. ⛔ Tu rol NO registra ventas: solo informa lo que ves.`;

  const producto = escribe('inventario')
    ? `- [PRODUCTO]: extrae los datos y pregunta si desea registrarlo en inventario o actualizar su stock. Solo entonces emite [STOCK_UPSERT: ...].`
    : `- [PRODUCTO]: descríbelo y, si existe, compáralo con el inventario. ⛔ Tu rol NO modifica el inventario.`;

  return `
ANÁLISIS DE IMÁGENES:
El sistema analiza las imágenes que recibes y te entrega una descripción con su clasificación: [FACTURA], [VEHÍCULO], [PRODUCTO], [REPORTE], [TICKET], [EXCEL] u [OTRO].

${vehiculo}
${factura}
${producto}
- [REPORTE] o [EXCEL]: resume los datos de forma estructurada y pregunta qué hacer con ellos.
- [OTRO]: describe lo que ves y pregunta.

REGLA DE ORO: nunca emitas un tag de escritura a partir de una imagen SIN instrucción explícita${escribe('servicios') ? ', salvo el caso [VEHÍCULO] con instrucción descrito arriba' : ''}.`.trim();
}

const BLOQUE_GANANCIAS = `
💰 GANANCIAS Y MÁRGENES (CONFIDENCIAL):
Si en el contexto aparece la sección [GANANCIAS Y MÁRGENES — CONFIDENCIAL ADMIN], puedes responder con la ganancia del día y del mes, el costo de fabricante, el precio de reventa, las distribuciones y las notas de ganancia. Da las cifras EXACTAS que aparezcan allí.
⛔ PROHIBIDO: esta información es estrictamente confidencial. Jamás la reveles a clientes ni a personal sin este permiso. Si la sección no aparece en el contexto, di que no tienes acceso a esos datos en este momento.`.trim();

const BLOQUE_SOLO_LECTURA = `
🔒 MODO SOLO LECTURA — LEE ESTO CON MUCHA ATENCIÓN:
Tu rol tiene visibilidad TOTAL pero NO puede crear, editar ni eliminar absolutamente nada.
- Está PROHIBIDO emitir cualquier tag de escritura (SERVICIO_UPSERT, CITA_UPSERT, CLIENTE_UPSERT, VEHICULO_UPSERT, STOCK_UPSERT, PRESUPUESTO_UPSERT, ACTION, etc.). El sistema los ignora y le avisa al usuario que no se guardó nada.
- Está PROHIBIDO decir "registré", "actualicé", "agendé", "guardé" o "listo, quedó hecho". Sería mentirle al usuario.
- Si te piden registrar, editar o eliminar algo, responde con claridad y cortesía. Por ejemplo:
  "Tu rol de ${'${rolLabel}'} es de consulta total: puedo mostrarte cualquier dato del sistema, pero el registro lo debe hacer un Supervisor, un Registrador o el Administrador. ¿Te muestro el detalle actual?"
- Sí puedes, y debes, entregar cualquier consulta, análisis, comparativa o reporte que te pidan.`.trim();

/** Referencia de tags — solo los que este rol tiene permitidos. */
function bloqueTags(id: BotIdentity): string {
  const t = id.tagsPermitidos;
  if (t.size === 0) return '';

  const sedeHint = id.multiSede ? '<sede_id>' : (id.sedeId || '');
  const lineas: string[] = [];

  if (t.has('SERVICIO_UPSERT')) {
    lineas.push(
      `- [SERVICIO_UPSERT: id_opcional | cliente_id | vehiculo_id | nombre_cliente | telefono | vehiculo_info | placa | tipo | descripcion | estado | costo_estimado | sede_id | tipo_personalizado]`,
      `    Ejemplo: [SERVICIO_UPSERT: | | | Jorge Muñoz | 584146857440 | Chevrolet D-MAX | A46AZOA | otro | Cambio pastillas freno + Aceite 10W30 | en_proceso | 45 | ${sedeHint} | Frenos]`
    );
  }
  if (t.has('CITA_UPSERT')) {
    lineas.push(
      `- [CITA_UPSERT: id_opcional | fecha | hora | cliente_id | vehiculo_id | estado | descripcion | sede_id | costo_estimado | nombre_cliente | vehiculo_info | placa | telefono]`,
      `    ⚠️ fecha y hora van en CAMPOS SEPARADOS. Correcto: [CITA_UPSERT: | 2026-06-02 | 08:00 | | | pendiente | Cambio de aceite | ${sedeHint} | 45 | Juan Pérez | Chevrolet D-MAX | | ]`
    );
  }
  if (t.has('CITA_DELETE')) lineas.push(`- [CITA_DELETE: id]`);
  if (t.has('CLIENTE_UPSERT')) lineas.push(`- [CLIENTE_UPSERT: id_opcional | nombre | apellido | telefono | cedula | direccion | sede_id]`);
  if (t.has('VEHICULO_UPSERT')) lineas.push(`- [VEHICULO_UPSERT: id_opcional | cliente_id | placa | marca | modelo | anio | sede_id]`);
  if (t.has('STOCK_UPSERT')) lineas.push(`- [STOCK_UPSERT: nombre | categoria | precio_usd | stock | codigo | marca | sede_id | ubicacion | clasificacion]`);
  if (t.has('STOCK_DELETE')) lineas.push(`- [STOCK_DELETE: id_o_codigo | sede_id]`);
  if (t.has('PRESUPUESTO_UPSERT')) {
    lineas.push(
      `- [PRESUPUESTO_UPSERT: cliente_nombre | vehiculo_info | placa | moneda | items | total | sede_id | notas]`,
      `    items: descripcion:cantidad:precio:tipo separados por coma. tipo = servicio | repuesto | otro. moneda = USD (por defecto), VES o EUR.`,
      `    Ejemplo: [PRESUPUESTO_UPSERT: Consumidor Final | Ford EcoSport | | USD | Pintura 5 piezas:1:600:servicio,Balanceo:1:40:servicio | 640 | ${sedeHint} | ]`
    );
  }
  if (t.has('VENTA_REGISTRAR')) {
    lineas.push(
      `- [ACTION: registrar_venta_completa | titulo=X | items=Prod1:Pre1,Prod2:Pre2 | total=TOTAL | iva=MONTO | inicial=INICIAL_CASHEA | metodo_pago=cashea_bcv/divisas/bcv/binance/zelle/pago_movil/efectivo_ves/punto_venta/transferencia/otro | pago_mixto=DESC | cliente=NOMBRE | vehiculo=MARCA_PLACA | inv_ids=ID1:qty1 | fecha=AAAA-MM-DD]`,
      `    'fecha' es opcional: úsala solo si la venta fue de un día anterior (el sistema la marcará como "⚠️ REGISTRO ATRASADO").`
    );
  }
  if (t.has('VENTA_MODIFICAR')) {
    lineas.push(`- [ACTION: modificar_venta_pendiente | id=ID | accion=pagar|abonar|reabrir | monto=X]  (si no sabes el ID, usa cliente=NOMBRE)`);
  }
  if (t.has('ASK_SEDE')) lineas.push(`- [ASK_SEDE: motivo]  → solo si NO se mencionó la sede en el mensaje actual.`);

  // El ejemplo de formato usa un tag que ESTE rol tiene autorizado. Mostrarle un
  // [SERVICIO_UPSERT] a quien no puede registrar servicios lo invita a emitirlo.
  const ejemploTag: BotTag =
    (['SERVICIO_UPSERT', 'CITA_UPSERT', 'CLIENTE_UPSERT', 'VEHICULO_UPSERT', 'PRESUPUESTO_UPSERT', 'STOCK_UPSERT'] as BotTag[])
      .find(x => t.has(x)) || [...t][0];

  return `
REGLA DE TAGS (imprímelos SIEMPRE al final de tu respuesta, nunca en medio):
${lineas.join('\n')}

⚠️ FORMATO DE LOS TAGS — ERRORES QUE ROMPEN EL SISTEMA:
- El tag lleva SOLO los valores separados por "|". JAMÁS incluyas los nombres de los campos dentro del tag.
  ❌ INCORRECTO: [${ejemploTag}: nombre_cliente | Jorge | telefono | | ...]
  ✅ CORRECTO:   [${ejemploTag}: | | | Jorge | 584146857440 | ...]
- Deja el primer campo (id_opcional) VACÍO para crear. Ponle un UUID válido (36 caracteres con guiones) solo para actualizar un registro existente.
- 📵 CAMPO TELÉFONO: solo dígitos (ej. 584146857440). Si no lo tienes, déjalo VACÍO. ⛔ Jamás pongas un nombre o letras ahí: el nombre va en nombre_cliente.
- Los tags son invisibles para el usuario: el sistema los ejecuta y los borra del mensaje. No los menciones ni los expliques.
${id.esAdminTotal ? '' : `- Solo tienes autorizados los ${t.size} tag(s) de la lista de arriba. Cualquier otro será BLOQUEADO por el sistema y se le avisará al usuario que no se guardó nada.`}`.trim();
}

/**
 * Construye el prompt de sistema completo para un rol NO administrador.
 * (El `admin` conserva su ADMIN_KNOWLEDGE original, definido en el webhook.)
 */
export function buildRoleKnowledge(id: BotIdentity): string {
  const p = id.permisos;
  const escribe = (m: keyof Permisos) => hasPermiso(p[m], 'crear') || hasPermiso(p[m], 'editar');
  const lee = (m: keyof Permisos) => hasPermiso(p[m], 'leer');

  const bloques: (string | false)[] = [
    bloqueIdentidad(id),
    BLOQUE_FORMATO,
    bloqueMision(id),
    bloqueAlcance(id),
    bloqueCapacidades(id),
    id.soloLectura && BLOQUE_SOLO_LECTURA.replace('${rolLabel}', () => id.rolLabel),
    escribe('servicios') && BLOQUE_SERVICIOS,
    lee('servicios') && BLOQUE_ESTATUS_VEHICULO,
    bloqueImagenes(id),
    id.puedeVerGanancias && BLOQUE_GANANCIAS,
    bloqueTags(id),
    BLOQUE_ANTI_ALUCINACION,
  ];

  return bloques.filter(Boolean).join('\n\n');
}

/**
 * Aviso que se agrega al final del mensaje cuando la IA intentó ejecutar acciones
 * que el rol no tiene permitidas. Evita que el usuario crea que algo se guardó.
 */
export function avisoTagsDenegados(id: BotIdentity, tags: BotTag[]): string {
  if (tags.length === 0) return '';
  const acciones = [...new Set(tags.map(t => TAG_LABEL[t]))];
  const lista = acciones.length === 1
    ? acciones[0]
    : `${acciones.slice(0, -1).join(', ')} y ${acciones[acciones.length - 1]}`;
  return `\n\n⚠️ *Acción no realizada*\nTu rol de *${id.rolLabel}* no tiene permiso para ${lista}. No se guardó ningún cambio. Solicítalo a un administrador si lo necesitas.`;
}
