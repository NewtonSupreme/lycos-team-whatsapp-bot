import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, serverDb } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/*
 * Registrar este aparato para recibir notificaciones.
 *
 *   POST { endpoint, keys, viejo? } → guarda (o renueva) la suscripción atada al usuario de la sesión.
 *                                     `viejo` = el endpoint anterior cuando el navegador la renovó.
 *   DELETE { endpoint }             → la quita (al cerrar sesión o desactivar).
 *
 * Se llama en cada carga del panel: así una suscripción que el navegador cambió, o un aparato
 * que pasó a otro usuario, queda siempre al día.
 */
export async function POST(req: NextRequest) {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Servidor sin base de datos' }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const endpoint = String(b.endpoint || '');
  if (!endpoint || !b.keys?.p256dh || !b.keys?.auth) return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
  const user = await getSessionUser(db).catch(() => null);
  if (b.viejo && b.viejo !== endpoint) await db.from('push_subscriptions').delete().eq('endpoint', String(b.viejo));
  const { error } = await db.from('push_subscriptions').upsert({
    endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, user_agent: req.headers.get('user-agent') || '',
    usuario_id: user?.id ?? null, usuario_nombre: user?.nombre ?? null, rol: user?.rol ?? null, sede_id: user?.sede_id ?? null,
    fallos: 0, ultimo_error: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, usuario: user?.nombre ?? null });
}

export async function DELETE(req: NextRequest) {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Servidor sin base de datos' }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  if (b.endpoint) await db.from('push_subscriptions').delete().eq('endpoint', String(b.endpoint));
  return NextResponse.json({ success: true });
}
