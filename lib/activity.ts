import { supabase } from './supabase';

/**
 * Registra una acción en el log de actividad.
 */
export async function logActivity({
  usuario,
  modulo,
  accion,
  detalles,
  referencia_id,
  referencia_tabla
}: {
  usuario: string;
  modulo: string;
  accion: string;
  detalles?: string | null;
  referencia_id?: string | null;
  referencia_tabla?: string | null;
}) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('logs_actividad')
      .insert({
        usuario,
        modulo,
        accion,
        detalles,
        referencia_id,
        referencia_tabla
      });

    if (error) {
      console.error('Error logging activity:', error);
    }
  } catch (err) {
    console.error('Exception in logActivity:', err);
  }
}
