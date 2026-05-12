import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { email, nombre, apellido, sede_id, rol, activo, password_hash } = await req.json();

    if (!email || !nombre || !sede_id || !rol) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    const isTechnical = rol === 'mecanico' || rol === 'jefe_taller';
    let username = email ? email.split('@')[0].toLowerCase() : nombre.replace(/\s+/g, '_').toLowerCase();
    
    // If it's technical staff or email is missing, ensure uniqueness with a timestamp
    if (isTechnical || !email) {
      username = `${username}_${Date.now()}`;
    }

    // Ensure email is not empty for the DB if not provided
    const finalEmail = email || `${username}@lycosteam.internal`;

    // Insert into custom usuarios table
    const { data: newUser, error } = await supabaseAdmin.from('usuarios').insert({
      username: username,
      nombre: apellido ? `${nombre} ${apellido}`.trim() : nombre,
      email: finalEmail,
      password_hash: password_hash || 'lycos2026', 
      rol: rol,
      activo: activo !== undefined ? activo : true,
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
