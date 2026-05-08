import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });
    }

    // Delete from custom usuarios table
    const { error } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando usuario:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error: any) {
    console.error('Error in delete-user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
