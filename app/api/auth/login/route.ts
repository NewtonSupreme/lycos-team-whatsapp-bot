import { NextRequest, NextResponse } from 'next/server';
import { firmarSesion } from '@/lib/session-token';
import { hashClave, verificarClave } from '@/lib/password';
import { rolConAcceso } from '@/types';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseUserAgent(ua: string) {
  let browser = 'Desconocido';
  let os = 'Desconocido';
  let device_type = 'Desktop';

  if (/mobile|android|iphone|ipad/i.test(ua)) device_type = 'Móvil';
  else if (/tablet|ipad/i.test(ua)) device_type = 'Tablet';

  if (/chrome/i.test(ua) && !/edge|opr/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/edge/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';

  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';

  return { browser, os, device_type };
}

/**
 * Deja constancia del intento de acceso, correcto o fallido.
 *
 * El panel de Configuración muestra el último acceso de cada usuario y los
 * intentos fallidos de las últimas 24 horas. Sin este registro esos dos datos
 * no existen, y un panel de seguridad que enseña cifras inventadas es peor que
 * uno que no las enseña.
 *
 * Nunca bloquea el inicio de sesión: si el registro falla, se entra igual.
 */
async function registrarIntento(
  db: ReturnType<typeof getDb>,
  request: NextRequest,
  usuario: string,
  exito: boolean,
  motivo?: string,
): Promise<void> {
  if (!db) return;
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;
    await db.from('intentos_acceso').insert({
      usuario, exito, motivo: motivo || null, ip,
      agente: (request.headers.get('user-agent') || '').slice(0, 300) || null,
    });
  } catch { /* el rastro es deseable, no imprescindible */ }
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const db = getDb();

    // Normalize: accept username or email@lycosteam.com
    const username = email.toLowerCase().trim().replace('@lycosteam.com', '');

    if (!db) {
      return NextResponse.json({ error: 'Base de datos no disponible' }, { status: 500 });
    }

    // (Aquí había cuentas «de respaldo» con una clave fija escrita en el código
    // que entraban sin mirar la base, una de ellas como admin. Se quitaron el
    // 2026-10-20: toda cuenta se valida contra la base.)

    // Look up user in DB
    const { data: user, error } = await db
      .from('usuarios')
      .select('id, username, nombre, email, password_hash, rol, activo, sede_id, permisos')
      .eq('username', username)
      .eq('activo', true)
      .single();

    if (error || !user) {
      await registrarIntento(db, request, username, false, 'usuario inexistente o inactivo');
      return NextResponse.json({ error: 'Credenciales inválidas o cuenta no autorizada' }, { status: 401 });
    }

    const clave = await verificarClave(String(password || ''), user.password_hash);
    if (!clave.ok) {
      await registrarIntento(db, request, username, false, 'contraseña incorrecta');
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
    }
    // El personal de nómina (mecánicos) no es usuario del sistema: carga su
    // trabajo desde la pantalla del taller.
    if (!rolConAcceso(user.rol)) {
      await registrarIntento(db, request, username, false, 'personal sin acceso');
      return NextResponse.json({ error: 'Esta ficha es de personal de nómina y no tiene acceso al sistema. Usa la pantalla del taller.' }, { status: 403 });
    }
    // Clave guardada en el formato viejo (texto plano): se cambia por su hash ya.
    if (clave.migrar) {
      await db.from('usuarios').update({ password_hash: await hashClave(String(password)) }).eq('id', user.id);
    }

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('lycos_session', firmarSesion(username), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
    });

    // Register session in DB
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'Desconocida';
    const ua = request.headers.get('user-agent') || '';
    const { browser, os, device_type } = parseUserAgent(ua);

    try {
      await db.from('sessions').insert({
        username: user.username,
        ip_address: ip,
        user_agent: ua.slice(0, 500),
        browser,
        os,
        device_type,
        location: `IP: ${ip}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch { /* non-blocking */ }

    await registrarIntento(db, request, user.username, true);

    return NextResponse.json({
      success: true,
      id: user.id,
      nombre: user.nombre,
      username: user.username,
      rol: user.rol,
      sede_id: user.sede_id,
      permisos: user.permisos
    });
  } catch {
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
