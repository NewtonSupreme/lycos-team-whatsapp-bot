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

    const { id, email, nombre, sede_id, rol, activo, telefono, username, permisos, password, especialidad, cedula, foto_url, alias,
            cargo, area, tipo_contrato, fecha_ingreso, fecha_nacimiento } = await req.json();

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

    // Solo se actualiza lo que venga definido: así una acción parcial
    // (p. ej. activar/desactivar) no borra el resto de los datos del usuario.
    const updates: any = { updated_at: new Date().toISOString() };
    if (username !== undefined) updates.username = username;
    if (nombre !== undefined) updates.nombre = nombre;
    if (email !== undefined) updates.email = email;
    if (rol !== undefined) updates.rol = rol;
    if (activo !== undefined) {
      updates.activo = activo;
      // Dar de baja sella la fecha de salida y reactivar la borra: sin este
      // dato la rotación anual tendría que adivinarse desde `updated_at`.
      updates.fecha_egreso = activo ? null : new Date().toISOString().slice(0, 10);
    }
    if (sede_id !== undefined) updates.sede_id = sede_id;
    if (telefono !== undefined) updates.telefono = telefono || null;
    if (especialidad !== undefined) updates.especialidad = especialidad || null;
    if (cedula !== undefined) updates.cedula = cedula || null;
    if (foto_url !== undefined) updates.foto_url = foto_url || null;
    if (alias !== undefined) updates.alias = alias || null;
    // Ficha laboral de RRHH. Las fechas vacías se guardan como NULL: una
    // cadena vacía en una columna `date` revienta el update entero.
    if (cargo !== undefined) updates.cargo = cargo || null;
    if (area !== undefined) updates.area = area || null;
    if (tipo_contrato !== undefined) updates.tipo_contrato = tipo_contrato || null;
    if (fecha_ingreso !== undefined) updates.fecha_ingreso = fecha_ingreso || null;
    if (fecha_nacimiento !== undefined) updates.fecha_nacimiento = fecha_nacimiento || null;
    if (permisos !== undefined) updates.permisos = permisos;

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
