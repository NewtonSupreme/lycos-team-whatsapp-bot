import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET: list all sessions (admin only) or own sessions
export async function GET() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('lycos_session')?.value;
    if (!username) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const db = getDb();
    if (!db) return NextResponse.json({ sessions: [] });

    // Only admin can see ALL sessions
    let query = db
      .from('sessions')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('last_active', { ascending: false });

    if (username !== 'administrador') {
      query = query.eq('username', username);
    }

    const { data: sessions } = await query.limit(100);
    return NextResponse.json({ sessions: sessions || [] });
  } catch {
    return NextResponse.json({ sessions: [] });
  }
}

// DELETE: remove a session by id (admin only)
export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('lycos_session')?.value;
    if (username !== 'administrador') {
      return NextResponse.json({ error: 'Solo el administrador puede eliminar sesiones' }, { status: 403 });
    }

    const { id } = await request.json();
    const db = getDb();
    if (!db || !id) return NextResponse.json({ error: 'Sin DB o ID' }, { status: 400 });

    await db.from('sessions').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
