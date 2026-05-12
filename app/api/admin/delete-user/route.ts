import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });
    }

    // 1. Try to delete from Supabase Auth (if they have an auth account)
    try {
      await supabaseAdmin.auth.admin.deleteUser(id);
    } catch (authErr) {
      // Ignore if user doesn't exist in auth.users (common for technical staff)
      console.log('User not found in Auth or already deleted');
    }

    // 2. Delete from custom usuarios table
    const { error } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando usuario de la tabla:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Usuario eliminado completamente' });
  } catch (error: any) {
    console.error('Error in delete-user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
