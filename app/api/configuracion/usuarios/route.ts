import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getRoleMeta, ROLE_CATALOG } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Todo lo que el panel de Configuración necesita saber de los usuarios.
 *
 * Las cifras salen de datos reales o no salen. El "último acceso" y los
 * "intentos fallidos" vienen de `intentos_acceso`, que se empezó a registrar
 * en el login: mientras no haya historia, se devuelven en cero y el panel lo
 * dice, en lugar de enseñar un número bonito que no significa nada.
 */

interface Usuario {
  id: string; username: string | null; nombre: string; email: string | null;
  rol: string; activo: boolean | null; sede_id: string | null;
  avatar_url: string | null; foto_url: string | null; telefono: string | null;
  created_at: string;
}

export async function GET() {
  const auth = await authorize('configuracion', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: gente }, { data: sedes }, { data: roles }] = await Promise.all([
    auth.db.from('usuarios')
      .select('id, username, nombre, email, rol, activo, sede_id, avatar_url, foto_url, telefono, created_at')
      .order('nombre'),
    auth.db.from('sedes').select('id, nombre, es_principal'),
    auth.db.from('roles').select('nombre, label, descripcion'),
  ]);

  const usuarios = (gente || []) as Usuario[];
  const nombreSede = new Map((sedes || []).map(s => [s.id as string, s.nombre as string]));

  // ── Último acceso por usuario ────────────────────────────────────────────
  const desde24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: accesos }, { data: fallidos }] = await Promise.all([
    auth.db.from('intentos_acceso')
      .select('usuario, created_at')
      .eq('exito', true)
      .order('created_at', { ascending: false })
      .limit(2000),
    auth.db.from('intentos_acceso')
      .select('usuario, motivo, ip, created_at')
      .eq('exito', false)
      .gte('created_at', desde24h)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const ultimoAcceso = new Map<string, string>();
  for (const a of (accesos || []) as { usuario: string; created_at: string }[]) {
    // La consulta viene ordenada de más nuevo a más viejo: el primero gana.
    if (!ultimoAcceso.has(a.usuario)) ultimoAcceso.set(a.usuario, a.created_at);
  }

  const filas = usuarios.map(u => {
    const meta = getRoleMeta(u.rol);
    return {
      id: u.id,
      username: u.username || '—',
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      rolLabel: meta?.label || u.rol,
      sede: u.sede_id ? (nombreSede.get(u.sede_id) || '—') : 'Todas',
      activo: u.activo !== false,
      foto: u.foto_url || u.avatar_url || null,
      telefono: u.telefono,
      creado: u.created_at,
      ultimoAcceso: (u.username && ultimoAcceso.get(u.username)) || null,
    };
  });

  // ── Cuántos usuarios tiene cada rol ──────────────────────────────────────
  const porRol = new Map<string, number>();
  for (const u of usuarios) porRol.set(u.rol, (porRol.get(u.rol) || 0) + 1);

  const catalogoRoles = (roles || []).length > 0
    ? (roles || []).map(r => ({
      nombre: r.nombre as string,
      label: (r.label as string) || (r.nombre as string),
      descripcion: (r.descripcion as string) || '',
      usuarios: porRol.get(r.nombre as string) || 0,
    }))
    : ROLE_CATALOG.map(r => ({
      nombre: r.nombre, label: r.label, descripcion: r.descripcion,
      usuarios: porRol.get(r.nombre) || 0,
    }));

  // ── El acceso más reciente de cualquiera ─────────────────────────────────
  const masReciente = [...ultimoAcceso.entries()].sort((a, b) => b[1].localeCompare(a[1]))[0];
  const quienEntro = masReciente
    ? usuarios.find(u => u.username === masReciente[0])?.nombre || masReciente[0]
    : null;

  // ── Altas del mes anterior, para la variación ────────────────────────────
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const altasEsteMes = usuarios.filter(u => u.created_at >= inicioMes).length;
  const antesDelMes = usuarios.length - altasEsteMes;

  return NextResponse.json({
    usuarios: filas,
    sedes: sedes || [],
    roles: catalogoRoles.sort((a, b) => b.usuarios - a.usuarios || a.label.localeCompare(b.label)),
    kpis: {
      total: usuarios.length,
      activos: usuarios.filter(u => u.activo !== false).length,
      rolesCreados: catalogoRoles.filter(r => r.usuarios > 0).length,
      rolesDefinidos: catalogoRoles.length,
      altasEsteMes,
      // Sin nadie de antes no hay variación que calcular; se devuelve null y el
      // panel omite la línea en vez de mostrar un +100% engañoso.
      variacionPct: antesDelMes > 0 ? Math.round((altasEsteMes / antesDelMes) * 1000) / 10 : null,
      ultimoAcceso: masReciente ? masReciente[1] : null,
      ultimoAccesoQuien: quienEntro,
      intentosFallidos24h: (fallidos || []).length,
      // El registro de accesos es nuevo: mientras esté vacío conviene decirlo.
      hayHistorialAccesos: (accesos || []).length > 0 || (fallidos || []).length > 0,
    },
    fallidos: (fallidos || []).slice(0, 10),
  });
}
