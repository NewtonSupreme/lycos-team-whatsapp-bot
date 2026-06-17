import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveRol, MASTER_ADMIN_USERNAME } from '@/types';

async function getRequester(db: any) {
  try {
    const username = (await cookies()).get('lycos_session')?.value;
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
      return NextResponse.json({ error: 'Configuración del servidor incompleta (ENV)' }, { status: 500 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { id, email, nombre, sede_id, rol, activo, telefono, username, permisos, password } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });
    }

    // REGLA: solo el usuario maestro 'administrador' puede ESCALAR a alguien al rol admin.
    // (Editar otros campos de un admin existente sigue permitido para cualquier admin.)
    if (rol !== undefined && resolveRol(rol) === 'admin') {
      const { data: target } = await supabaseAdmin.from('usuarios').select('rol').eq('id', id).maybeSingle();
      const yaEraAdmin = target && resolveRol(target.rol) === 'admin';
      if (!yaEraAdmin) {
        const requester = await getRequester(supabaseAdmin);
        if (!requester || requester.username !== MASTER_ADMIN_USERNAME) {
          return NextResponse.json(
            { error: `Solo el usuario "${MASTER_ADMIN_USERNAME}" puede asignar el rol de Administrador.` },
            { status: 403 }
          );
        }
      }
    }

    const updates: any = {
      username,
      nombre,
      email,
      rol,
      activo: activo !== undefined ? activo : true,
      sede_id,
      telefono: telefono || null,
      updated_at: new Date().toISOString()
    };

    if (permisos !== undefined) {
      updates.permisos = permisos;
    }

    // Reseteo opcional de contraseña (solo si el admin escribió una nueva)
    if (typeof password === 'string' && password.trim().length > 0) {
      updates.password_hash = password.trim();
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // If column doesn't exist, try update without permisos
      if (error.message?.includes('column') || error.message?.includes('permisos')) {
        delete updates.permisos;
        const { data: retryUser, error: retryError } = await supabaseAdmin
          .from('usuarios')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (retryError) {
          return NextResponse.json({ error: retryError.message }, { status: 500 });
        }
        return NextResponse.json({ message: 'Usuario actualizado (sin permisos — columna no disponible)', user: retryUser });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Usuario actualizado exitosamente', user: updatedUser });
  } catch (error: any) {
    console.error('Error in update-user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
