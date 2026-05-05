import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { email, nombre, apellido, sede_id, rol } = await req.json();

    if (!email || !nombre || !sede_id || !rol) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    const username = email.split('@')[0].toLowerCase();

    // Insert into custom usuarios table
    const { data: newUser, error } = await supabaseAdmin.from('usuarios').insert({
      username: username,
      nombre: `${nombre} ${apellido}`.trim(),
      email: email,
      password_hash: 'lycos2026', // Custom auth uses plain text/hash field
      rol: rol,
      activo: true,
      sede_id: sede_id
    }).select().single();

    if (error) {
      console.error('Error creando usuario:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Usuario creado exitosamente', user: newUser });
  } catch (error: any) {
    console.error('Error in create-user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
