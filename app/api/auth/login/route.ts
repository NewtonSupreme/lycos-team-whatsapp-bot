import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const db = getDb();

    // Normalize: accept username or email@lycosteam.com
    const username = email.toLowerCase().trim().replace('@lycosteam.com', '');

    if (!db) {
      // Fallback without DB
      const ACCOUNTS: Record<string, string> = {
        administrador: 'administrador', daniela: 'daniela',
        alejandra: 'alejandra', andrea: 'andrea',
      };
      if (ACCOUNTS[username] && password === 'lycos2026') {
        const cookieStore = await cookies();
        cookieStore.set('lycos_session', username, {
          httpOnly: true, secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
        });
        return NextResponse.json({ success: true, nombre: username, rol: username === 'administrador' ? 'admin' : 'usuario' });
      }
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // Look up user in DB
    const { data: user, error } = await db
      .from('usuarios')
      .select('username, nombre, email, password_hash, rol, activo')
      .eq('username', username)
      .eq('activo', true)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Credenciales inválidas o cuenta no autorizada' }, { status: 401 });
    }

    if (user.password_hash !== password) {
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
    }

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('lycos_session', username, {
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

    return NextResponse.json({
      success: true,
      nombre: user.nombre,
      username: user.username,
      rol: user.rol,
    });
  } catch {
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
