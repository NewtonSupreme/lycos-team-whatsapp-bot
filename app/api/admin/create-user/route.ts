import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !url) {
      console.error('Missing Supabase configuration:', { url: !!url, serviceKey: !!serviceKey });
      return NextResponse.json({ error: 'Configuración del servidor incompleta (ENV)' }, { status: 500 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { email, nombre, apellido, sede_id, rol, activo, password_hash, telefono, username: manualUsername } = await req.json();

    if (!email || !nombre || !sede_id || !rol) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    let username = manualUsername;

    if (username) {
      // Check if username already exists
      const { data: existingUser } = await supabaseAdmin
        .from('usuarios')
        .select('id')
        .eq('username', username)
        .single();
      
      if (existingUser) {
        return NextResponse.json({ error: 'El nombre de usuario ya está en uso' }, { status: 400 });
      }
    } else {
      // Auto-generate if not provided
      const isTechnical = rol === 'mecanico' || rol === 'jefe_taller';
      username = email ? email.split('@')[0].toLowerCase() : nombre.replace(/\s+/g, '_').toLowerCase();
      
      // If it's technical staff or email is missing, ensure uniqueness with a timestamp
      if (isTechnical || !email) {
        username = `${username}_${Date.now()}`;
      }
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
      sede_id: sede_id,
      telefono: telefono || null
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
