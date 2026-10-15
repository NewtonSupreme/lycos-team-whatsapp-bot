import { authorize } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const auth = await authorize('empleados', 'eliminar');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !url) {
      console.error('❌ [DeleteUser] Missing Supabase config');
      return NextResponse.json({ error: 'Configuración del servidor incompleta (ENV)' }, { status: 500 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });
    }

    console.log(`🗑️ [DeleteUser] Attempting to delete user ID: ${id}`);

    // 1. Try to delete from Supabase Auth
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authErr) {
      console.log('ℹ️ [DeleteUser] User not found in Auth or already deleted from Auth');
    }

    // 2. Delete from custom usuarios table
    const { error: dbErr } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (dbErr) {
      console.error('❌ [DeleteUser] DB Error:', dbErr.message);
      return NextResponse.json({ error: `Error en base de datos: ${dbErr.message}` }, { status: 500 });
    }

    console.log(`✅ [DeleteUser] User ${id} deleted successfully from all tables.`);
    return NextResponse.json({ message: 'Usuario eliminado completamente de la base de datos y sistema de autenticación.' });
  } catch (error: any) {
    console.error('🚨 [DeleteUser] Critical Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
