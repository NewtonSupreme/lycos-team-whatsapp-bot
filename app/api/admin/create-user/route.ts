import { createClient } from '@supabase/supabase-js';
import { leerSesion } from '@/lib/session-token';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveRol, rolConAcceso } from '@/types';
import { SIN_CLAVE, hashClave } from '@/lib/password';

// Devuelve el usuario que hace la petición (según la cookie de sesión).
async function getRequester(db: any) {
  try {
    const username = leerSesion((await cookies()).get('lycos_session')?.value);
    if (!username) return null;
    const { data } = await db.from('usuarios').select('username, rol').eq('username', username).maybeSingle();
    return data;
  } catch { return null; }
}

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

    const { email, nombre, apellido, sede_id, rol, activo, password_hash, telefono, username: manualUsername, cedula, especialidad, foto_url,
            cargo, area, tipo_contrato, fecha_ingreso, fecha_nacimiento } = await req.json();

    if (!nombre || !rol) {
      return NextResponse.json({ error: 'Faltan datos requeridos (nombre, rol)' }, { status: 400 });
    }

    // REGLA: solo un Usuario Maestro puede crear o asignar el rol de Usuario Maestro.
    if (resolveRol(rol) === 'admin') {
      const requester = await getRequester(supabaseAdmin);
      if (!requester || resolveRol(requester.rol) !== 'admin') {
        return NextResponse.json(
          { error: 'Solo un Usuario Maestro puede crear o asignar el rol de Usuario Maestro.' },
          { status: 403 }
        );
      }
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
      username = email ? email.split('@')[0].toLowerCase() : nombre.replace(/\s+/g, '_').toLowerCase();
      // Ensure uniqueness when no email was provided
      if (!email) {
        username = `${username}_${Date.now()}`;
      }
    }

    // Ensure email is not empty for the DB if not provided
    const finalEmail = email || `${username}@lycosteam.internal`;

    // Insert into custom usuarios table
    console.log(`👤 [CreateUser] Registering ${nombre} with role ${rol} and phone ${telefono || 'N/A'}`);

    const { data: newUser, error } = await supabaseAdmin.from('usuarios').insert({
      username: username,
      nombre: apellido ? `${nombre} ${apellido}`.trim() : nombre,
      email: finalEmail,
      // El personal de nómina no inicia sesión: no lleva clave. El resto, con hash.
      password_hash: rolConAcceso(rol) ? await hashClave(String(password_hash || 'lycos2026')) : SIN_CLAVE,
      rol: rol,
      // Todos los roles tienen acceso al panel; nuevos usuarios heredan los
      // permisos de su rol (permisos por-usuario quedan en NULL).
      activo: activo !== undefined ? activo : true,
      sede_id: sede_id,
      telefono: telefono || null,
      cedula: cedula || null,
      especialidad: especialidad || null,
      foto_url: foto_url || null,
      cargo: cargo || null,
      area: area || null,
      tipo_contrato: tipo_contrato || null,
      fecha_ingreso: fecha_ingreso || null,
      fecha_nacimiento: fecha_nacimiento || null,
    }).select().single();

    if (error) {
      console.error('❌ [CreateUser] DB Error:', error.message);
      return NextResponse.json({ error: `Error en base de datos: ${error.message}` }, { status: 500 });
    }

    console.log(`✅ [CreateUser] User created successfully: ${newUser.id}`);
    const { password_hash: _clave, ...sinClave } = newUser;
    void _clave;
    return NextResponse.json({ message: 'Usuario creado exitosamente', user: sinClave });
  } catch (error: any) {
    console.error('Error in create-user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
