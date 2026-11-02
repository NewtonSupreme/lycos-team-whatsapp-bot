import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { leerSesion } from '@/lib/session-token';
import { createClient } from '@supabase/supabase-js';
import {
  MASTER_ADMIN_USERNAME,
  obtenerEstadoSuspension,
  cambiarEstadoSuspension,
  esUsuarioAdministradorMaster,
} from '@/lib/suspension';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET: Devuelve el estado actual de la suspensión del sistema.
 * Es accesible por el cliente para sincronizar el estado visual en tiempo real.
 */
export async function GET() {
  try {
    const estado = await obtenerEstadoSuspension();
    return NextResponse.json(
      { ok: true, estado },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Error en GET /api/sistema/suspension:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al consultar estado de suspensión', estado: { suspendido: false } },
      { status: 500 }
    );
  }
}

/**
 * POST: Activa o desactiva la suspensión completa del sistema (Kill Switch).
 * SEGURIDAD ESTRICTA:
 * Exclusivamente autorizado para el usuario 'administrador'.
 * Cualquier otra cuenta (incluso roles admin diferentes) es denegada.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('lycos_session')?.value;
    const username = leerSesion(sessionToken);

    if (!username) {
      return NextResponse.json(
        { ok: false, error: 'Sesión no válida o no iniciada.' },
        { status: 401 }
      );
    }

    // Comprobación rápida por username decodificado
    if (!esUsuarioAdministradorMaster(username)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Acceso denegado: Esta función está reservada exclusivamente para el usuario de Leandro. Tu cuenta ("${username}") no tiene privilegios para operar el interruptor de emergencia.`,
        },
        { status: 403 }
      );

    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: 'Servicio de base de datos no disponible.' },
        { status: 500 }
      );
    }

    // Verificar en BD que el usuario exista y esté activo
    const { data: usuarioDb, error: errUser } = await db
      .from('usuarios')
      .select('id, username, activo')
      .eq('username', username)
      .maybeSingle();

    if (errUser || !usuarioDb || usuarioDb.activo === false) {
      return NextResponse.json(
        { ok: false, error: 'Usuario inexistente o inactivo.' },
        { status: 403 }
      );
    }

    if (!esUsuarioAdministradorMaster(usuarioDb.username)) {
      return NextResponse.json(
        { ok: false, error: 'Acceso no autorizado.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const suspendido = Boolean(body.suspendido);
    const motivo = typeof body.motivo === 'string' ? body.motivo : undefined;

    const nuevoEstado = await cambiarEstadoSuspension({
      suspendido,
      usuario: usuarioDb.username,
      motivo,
    }, db);

    return NextResponse.json(
      {
        ok: true,
        mensaje: suspendido
          ? 'Sistema suspendido con éxito. Todos los accesos y el chatbot han sido apagados.'
          : 'Sistema reanudado con éxito. Operaciones restauradas en tiempo real.',
        estado: nuevoEstado,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Error en POST /api/sistema/suspension:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al modificar suspensión del sistema' },
      { status: 500 }
    );
  }
}
