import { supabaseAdmin } from './supabase-admin';
import { sendGlobalPushNotification } from './push-helper';

export async function createGlobalNotification(payload: {
  sede_id: string;
  tipo: 'info' | 'success' | 'warning' | 'error';
  titulo: string;
  mensaje: string;
  entidad_tipo?: string;
  entidad_id?: string;
  url?: string;
}) {
  try {
    // 1. Insert into persistent notificaciones table
    const { data: notif, error } = await supabaseAdmin
      .from('notificaciones')
      .insert({
        sede_id: payload.sede_id,
        tipo: payload.tipo,
        titulo: payload.titulo,
        mensaje: payload.mensaje,
        entidad_tipo: payload.entidad_tipo,
        entidad_id: payload.entidad_id,
        leida: false
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error insertando notificacion en BD:', error);
      return { success: false, error };
    }

    // 2. Broadcast Web Push
    const pushType = payload.entidad_tipo ? `${payload.entidad_tipo}-notif` : 'general';
    await sendGlobalPushNotification({
      title: payload.titulo,
      body: payload.mensaje,
      type: pushType,
      url: payload.url || '/dashboard',
      tag: payload.entidad_tipo || 'general'
    });

    return { success: true, notificacion_id: notif.id };
  } catch (err) {
    console.error('Error in createGlobalNotification:', err);
    return { success: false, error: err };
  }
}
