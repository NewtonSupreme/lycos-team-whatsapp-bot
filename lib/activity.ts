import { supabase } from './supabase';
import { withSedeInsert } from './db-filters';

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

  const payload = withSedeInsert({
    usuario,
    modulo,
    accion,
    detalles,
    referencia_id,
    referencia_tabla
  });

  console.log('logActivity: intentando insertar:', payload);
  try {
    const { error } = await supabase
      .from('logs_actividad')
      .insert(payload);

    if (error) {
      console.error('Error logging activity:', error);
    } else {
      console.log('logActivity: insertado con éxito');
    }
  } catch (err) {
    console.error('Exception in logActivity:', err);
  }
}

