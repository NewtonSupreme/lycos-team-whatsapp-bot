import { NextResponse } from 'next/server';
import { getSessionUser, serverDb } from '@/lib/auth-server';
import { enviarPush } from '@/lib/push-helper';

export const dynamic = 'force-dynamic';

/** Manda una notificación de prueba a los aparatos del usuario que la pide. */
export async function POST() {
  const db = serverDb();
  const user = db ? await getSessionUser(db).catch(() => null) : null;
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { count } = await db!.from('push_subscriptions').select('endpoint', { count: 'exact', head: true }).eq('usuario_id', user.id);
  const r = await enviarPush({
    title: '🔔 Notificaciones activas', body: `Hola ${user.nombre}: así te van a llegar los avisos de Lycos Team.`,
    type: 'prueba', url: '/dashboard', tag: `prueba-${Date.now()}`, usuarios: [user.id], urgencia: 'high', ttl: 600,
  });
  return NextResponse.json({ ...r, aparatos: count || 0 });
}
