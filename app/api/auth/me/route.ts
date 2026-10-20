import { NextRequest, NextResponse } from 'next/server';
import { hashClave, verificarClave } from '@/lib/password';
import { rolConAcceso } from '@/types';
import { leerSesion, firmarSesion } from '@/lib/session-token';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const username = leerSesion(cookieStore.get('lycos_session')?.value);
    if (!username) return NextResponse.json({ user: null });

    const db = getDb();
    if (!db) return NextResponse.json({ user: null });

    const { data: user } = await db
      .from('usuarios')
      .select('id, username, nombre, email, rol, avatar_url, sede_id, permisos, activo')
      .eq('username', username)
      .single();

    if (!user || user.activo === false || !rolConAcceso(user.rol)) {
      cookieStore.delete('lycos_session');
      return NextResponse.json({ user: null });
    }

    // Refresh cookie maxAge on every request (keepalive)
    cookieStore.set('lycos_session', firmarSesion(username), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
    });

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const username = leerSesion(cookieStore.get('lycos_session')?.value);
    if (!username) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    const db = getDb();
    if (!db) return NextResponse.json({ error: 'Base de datos no disponible' }, { status: 500 });

    // Verify current password
    const { data: user } = await db
      .from('usuarios')
      .select('password_hash')
      .eq('username', username)
      .single();

    if (!user || !(await verificarClave(String(currentPassword || ''), user.password_hash)).ok) {
      return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 401 });
    }
    if (String(newPassword || '').trim().length < 6) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    // Update password
    const { error } = await db
      .from('usuarios')
      .update({ password_hash: await hashClave(String(newPassword).trim()), updated_at: new Date().toISOString() })
      .eq('username', username);

    if (error) return NextResponse.json({ error: 'Error al actualizar contraseña' }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/auth/me:', error);
    return NextResponse.json({ error: 'Error en el servidor: ' + error.message }, { status: 500 });
  }
}
