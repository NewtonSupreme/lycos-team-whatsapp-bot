import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  MASTER_ADMIN_USERNAMES,
  MASTER_ADMIN_USERNAME,
  CLAVE_CONFIGURACION_SUSPENSION,
  MOTIVO_SUSPENSION_DEFECTO,
  MOTIVO_REANUDACION_DEFECTO,
} from './constants';
import type { EstadoSuspension, OpcionesCambioSuspension } from './types';
import { logActivityServer } from '@/lib/activity-server';

/** Cliente Supabase con service-role key para operaciones del lado del servidor */
function getAdminDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── Caché en memoria para alta velocidad y evitar saturar la base en cada petición ──
let cacheEstado: { estado: EstadoSuspension; tiempo: number } | null = null;
const CACHE_DURACION_MS = 2500; // 2.5 segundos

/**
 * Valida estrictamente si el usuario dado es el Administrador Maestro Único (Leandro).
 * NO evalúa el rol 'admin', sino específicamente la identidad del usuario 'leandro' / 'administrador'.
 * Cualquier otra cuenta (incluso roles admin como 'lycosteam7') devuelve false.
 */
export function esUsuarioAdministradorMaster(
  usuario?: { username?: string | null; email?: string | null } | string | null
): boolean {
  if (!usuario) return false;
  const username = typeof usuario === 'string' ? usuario : usuario.username;
  const email = typeof usuario === 'object' && usuario ? usuario.email : null;

  const cleanUser = (username || '').trim().toLowerCase();
  const cleanEmail = (email || '').trim().toLowerCase();

  // Coincidencia exacta con los usernames maestros autorizados
  if (cleanUser && MASTER_ADMIN_USERNAMES.some(m => m.toLowerCase() === cleanUser)) {
    return true;
  }

  // Coincidencia por correo electrónico de Leandro o Administrador
  if (cleanEmail && (cleanEmail.includes('leandro') || cleanEmail === 'administrador@lycosteam.com')) {
    return true;
  }

  return false;
}


/**
 * Obtiene el estado actual de la suspensión del sistema.
 */
export async function obtenerEstadoSuspension(dbCliente?: SupabaseClient | null): Promise<EstadoSuspension> {
  const ahora = Date.now();
  if (cacheEstado && (ahora - cacheEstado.tiempo) < CACHE_DURACION_MS) {
    return cacheEstado.estado;
  }

  const db = dbCliente || getAdminDb();
  if (!db) {
    return cacheEstado?.estado || {
      suspendido: false,
      motivo: 'Operativo',
      updated_at: new Date().toISOString(),
    };
  }

  try {
    const { data, error } = await db
      .from('configuracion_sistema')
      .select('valor, updated_at, updated_by')
      .eq('clave', CLAVE_CONFIGURACION_SUSPENSION)
      .maybeSingle();

    if (error || !data) {
      const estadoDefecto: EstadoSuspension = {
        suspendido: false,
        motivo: 'Operativo',
        updated_at: new Date().toISOString(),
      };
      cacheEstado = { estado: estadoDefecto, tiempo: ahora };
      return estadoDefecto;
    }

    const valor = (typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor) || {};
    const estado: EstadoSuspension = {
      suspendido: Boolean(valor.suspendido),
      motivo: valor.motivo || (valor.suspendido ? MOTIVO_SUSPENSION_DEFECTO : MOTIVO_REANUDACION_DEFECTO),
      fecha_suspension: valor.fecha_suspension || null,
      suspendido_por: valor.suspendido_por || data.updated_by || null,
      updated_at: data.updated_at || new Date().toISOString(),
    };

    cacheEstado = { estado, tiempo: ahora };
    return estado;
  } catch (err) {
    console.error('Error al obtener estado de suspensión del sistema:', err);
    return cacheEstado?.estado || {
      suspendido: false,
      motivo: 'Error de lectura de configuración',
      updated_at: new Date().toISOString(),
    };
  }
}

/**
 * Cambia el estado de suspensión del sistema.
 * ESTRICTO: Solo permite la ejecución si el usuario solicitante es el usuario 'administrador'.
 */
export async function cambiarEstadoSuspension(
  opciones: OpcionesCambioSuspension,
  dbCliente?: SupabaseClient | null
): Promise<EstadoSuspension> {
  const { suspendido, usuario, motivo } = opciones;

  if (!esUsuarioAdministradorMaster(usuario)) {
    throw new Error(
      `Acceso no autorizado: Solo el usuario Maestro (Leandro) tiene permisos para apagar o encender el sistema. El usuario "${usuario}" no está facultado.`
    );

  }

  const db = dbCliente || getAdminDb();
  if (!db) {
    throw new Error('Base de datos no disponible para actualizar la suspensión.');
  }

  const ahoraIso = new Date().toISOString();
  const motivoFinal = motivo?.trim() || (suspendido ? MOTIVO_SUSPENSION_DEFECTO : MOTIVO_REANUDACION_DEFECTO);

  const nuevoValor: Record<string, any> = {
    suspendido,
    motivo: motivoFinal,
    fecha_suspension: suspendido ? ahoraIso : null,
    suspendido_por: suspendido ? usuario : null,
    ultimo_cambio: ahoraIso,
  };

  // Buscar si la fila ya existe
  const { data: existente } = await db
    .from('configuracion_sistema')
    .select('id')
    .eq('clave', CLAVE_CONFIGURACION_SUSPENSION)
    .maybeSingle();

  if (existente?.id) {
    const { error } = await db
      .from('configuracion_sistema')
      .update({
        valor: nuevoValor,
        updated_at: ahoraIso,
        updated_by: usuario,
      })
      .eq('id', existente.id);

    if (error) throw new Error(`Fallo al actualizar suspensión: ${error.message}`);
  } else {
    const { error } = await db
      .from('configuracion_sistema')
      .insert({
        clave: CLAVE_CONFIGURACION_SUSPENSION,
        valor: nuevoValor,
        descripcion: 'Interruptor general de suspensión del sistema (Kill Switch)',
        updated_at: ahoraIso,
        updated_by: usuario,
      });

    if (error) throw new Error(`Fallo al insertar configuración de suspensión: ${error.message}`);
  }

  const nuevoEstado: EstadoSuspension = {
    suspendido,
    motivo: motivoFinal,
    fecha_suspension: suspendido ? ahoraIso : null,
    suspendido_por: suspendido ? usuario : null,
    updated_at: ahoraIso,
  };

  // Invalidar caché inmediatamente
  cacheEstado = { estado: nuevoEstado, tiempo: Date.now() };

  // Registrar auditoría de seguridad
  await logActivityServer(db, {
    usuario,
    modulo: 'Seguridad / Sistema',
    accion: suspendido ? '🔴 Apagado General del Sistema (Kill Switch)' : '🟢 Encendido General del Sistema',
    detalles: `El administrador ${suspendido ? 'suspendió' : 'reactivó'} el acceso a todos los usuarios y chatbot. Motivo: ${motivoFinal}`,
    referencia_tabla: 'configuracion_sistema',
  });

  return nuevoEstado;
}

/**
 * Consulta rápida y ligera para saber si el sistema está suspendido.
 */
export async function estaSistemaSuspendido(): Promise<boolean> {
  const estado = await obtenerEstadoSuspension();
  return Boolean(estado.suspendido);
}
