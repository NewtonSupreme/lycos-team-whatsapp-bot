import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Registro de actividad del lado del servidor (API routes / webhook).
 * A diferencia de lib/activity.ts (cliente), recibe el client y el sede_id
 * de forma explícita. Tolerante a fallos: nunca lanza.
 */
export async function logActivityServer(
  db: SupabaseClient,
  entry: {
    usuario: string;
    modulo: string;
    accion: string;
    detalles?: string | null;
    referencia_id?: string | null;
    referencia_tabla?: string | null;
    sede_id?: string | null;
  }
): Promise<void> {
  try {
    await db.from('logs_actividad').insert({
      usuario: entry.usuario,
      modulo: entry.modulo,
      accion: entry.accion,
      detalles: entry.detalles ?? null,
      referencia_id: entry.referencia_id ?? null,
      referencia_tabla: entry.referencia_tabla ?? null,
      sede_id: entry.sede_id ?? null,
    });
  } catch (err) {
    console.error('logActivityServer error:', err);
  }
}
