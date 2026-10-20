import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, serverDb } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/*
 * El perfil propio: leerlo y cambiar nombre, teléfono, bio y foto.
 *
 * Antes la pantalla escribía directo en `usuarios` con la clave pública, lo
 * que obligaba a dejar esa tabla abierta a cualquiera (también la columna de
 * la clave y el rol). Ahora pasa por aquí y solo toca la fila de quien tiene
 * la sesión, y solo esos campos.
 */
const COLUMNAS = 'id, username, nombre, email, telefono, bio, rol, avatar_url';

export async function GET() {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Servidor sin base de datos.' }, { status: 500 });
  const yo = await getSessionUser(db);
  if (!yo) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { data } = await db.from('usuarios').select(COLUMNAS).eq('id', yo.id).maybeSingle();
  return NextResponse.json({ perfil: data });
}

export async function PATCH(req: NextRequest) {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Servidor sin base de datos.' }, { status: 500 });
  const yo = await getSessionUser(db);
  if (!yo) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const texto = (k: string, max: number) => {
    if (body[k] === undefined) return;
    cambios[k] = body[k] === null ? null : String(body[k]).trim().slice(0, max);
  };
  texto('nombre', 120); texto('telefono', 40); texto('bio', 500); texto('avatar_url', 500);
  if (cambios.nombre === '') return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 });

  const { data, error } = await db.from('usuarios').update(cambios).eq('id', yo.id).select(COLUMNAS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ perfil: data });
}
