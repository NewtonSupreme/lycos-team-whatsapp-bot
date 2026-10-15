/**
 * RBAC del lado del servidor para API routes.
 * Resuelve el usuario desde la cookie de sesión `lycos_session`, carga los
 * defaults de rol desde la tabla `roles` (para honrar la personalización que el
 * admin hace en /ajustes/permisos) y evalúa permisos CRUD por módulo.
 */
import { cookies } from 'next/headers';
import { leerSesion } from '@/lib/session-token';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPermisos, hasPermiso, resolveRol, type Permisos, type CrudPermiso } from '@/types';

export interface SessionUser {
  id: string;
  username: string;
  nombre: string;
  email?: string;
  rol: string;
  sede_id: string | null;
  permisos?: Record<string, unknown> | null;
  multiSede: boolean;
}

export function serverDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function loadRoleDefaults(db: SupabaseClient): Promise<Record<string, Permisos> | null> {
  try {
    const { data } = await db.from('roles').select('nombre, permisos');
    if (!data || data.length === 0) return null;
    const map: Record<string, Permisos> = {};
    for (const r of data as any[]) {
      if (r?.nombre && r?.permisos) {
        const p = typeof r.permisos === 'string' ? JSON.parse(r.permisos) : r.permisos;
        map[r.nombre] = p as Permisos;
      }
    }
    return Object.keys(map).length ? map : null;
  } catch { return null; }
}

export async function getSessionUser(db: SupabaseClient): Promise<SessionUser | null> {
  try {
    const username = leerSesion((await cookies()).get('lycos_session')?.value);
    if (!username) return null;
    const { data } = await db.from('usuarios')
      .select('id, username, nombre, email, rol, sede_id, permisos, activo')
      .eq('username', username).maybeSingle();
    if (!data || data.activo === false) return null;
    const multiSede = ['admin', 'dueno'].includes(resolveRol(data.rol));
    return {
      id: data.id, username: data.username, nombre: data.nombre, email: data.email,
      rol: data.rol, sede_id: data.sede_id ?? null,
      permisos: data.permisos ?? null, multiSede,
    };
  } catch { return null; }
}

export interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  user?: SessionUser;
  db: SupabaseClient;
  /** sede efectiva: la sede del usuario, o la pedida si es multi-sede */
  effectiveSede: (requested?: string | null) => string | null;
  can: (modulo: keyof Permisos, accion?: keyof CrudPermiso) => boolean;
}

/**
 * Autoriza una petición a un módulo/acción. Devuelve helpers de permiso y sede.
 * Uso:
 *   const auth = await authorize('nomina', 'leer');
 *   if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
 */
export async function authorize(
  modulo: keyof Permisos,
  accion: keyof CrudPermiso = 'leer'
): Promise<AuthResult> {
  const db = serverDb();
  if (!db) {
    return {
      ok: false, status: 500, error: 'Servidor sin configuración de base de datos.',
      db: null as any, effectiveSede: () => null, can: () => false,
    };
  }
  const user = await getSessionUser(db);
  const roleDefaults = await loadRoleDefaults(db);

  const can = (m: keyof Permisos, a: keyof CrudPermiso = 'leer') => {
    if (!user) return false;
    if (resolveRol(user.rol) === 'admin') return true;
    const permisos = getPermisos(user.rol, user.permisos as any, roleDefaults);
    return hasPermiso(permisos[m], a);
  };

  const effectiveSede = (requested?: string | null) => {
    if (!user) return null;
    if (user.multiSede) return requested ?? null;     // admin/dueño: puede pedir cualquier sede (o todas=null)
    return user.sede_id;                              // resto: bloqueado a su sede
  };

  if (!user) return { ok: false, status: 401, error: 'No autenticado.', db, effectiveSede, can };
  if (!can(modulo, accion)) {
    return { ok: false, status: 403, error: 'No tienes permiso para esta acción.', user, db, effectiveSede, can };
  }
  return { ok: true, status: 200, user, db, effectiveSede, can };
}
