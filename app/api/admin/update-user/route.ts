import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !url) {
      return NextResponse.json({ error: 'Configuración del servidor incompleta (ENV)' }, { status: 500 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { id, email, nombre, sede_id, rol, activo, telefono, username } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });
    }

    // 1. Update in custom usuarios table
    const { data: updatedUser, error } = await supabaseAdmin
      .from('usuarios')
      .update({
        username,
        nombre,
        email,
        rol,
        activo: activo !== undefined ? activo : true,
        sede_id,
        telefono: telefono || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando usuario:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Optional: If email changed, we might want to update Supabase Auth too
    // but typically we manage auth separately or via this admin client.
    // For now, updating the table is the priority.

    return NextResponse.json({ message: 'Usuario actualizado exitosamente', user: updatedUser });
  } catch (error: any) {
    console.error('Error in update-user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
