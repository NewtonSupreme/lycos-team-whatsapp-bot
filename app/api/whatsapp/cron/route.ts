import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120; // Permitir 2 minutos de duración para la ejecución total del CRON
export const dynamic = 'force-dynamic'; // Desactivar caché (vital en un cron job)

export async function GET() {
  // Configuración de Supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return NextResponse.json({ error: 'Faltan credenciales de DB' }, { status: 500 });
  const db = createClient(url, key);

  try {
    // Definimos la ventana de tiempo del watchdog: Mensajes entre hace 15 y 3 minutos
    // Así detectamos los que se quedaron estancados sin respuesta recientemente.
    const now = new Date();
    const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    console.log(`⏱️ [CRON] Buscando chats colgados entre ${fifteenMinutesAgo} y ${threeMinutesAgo}...`);

    // Consultar mensajes entrantes colgados dentro de nuestra ventana
    const { data: mensajesPendientes, error } = await db
      .from('mensajes_whatsapp')
      .select('*')
      .eq('tipo', 'entrante')
      .gt('created_at', fifteenMinutesAgo)
      .lt('created_at', threeMinutesAgo)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ CRON DB Error:', error);
      return NextResponse.json({ error: 'DB fetch failed' }, { status: 500 });
    }

    if (!mensajesPendientes || mensajesPendientes.length === 0) {
      return NextResponse.json({ status: 'ok', retried: 0, msg: 'No se encontraron conversaciones colgadas.' });
    }

    // Agrupar por teléfono y quedarse solo con el último mensaje
    const latestByPhone = new Map<string, { id: string, from_number: string, body: string, created_at: string, wa_message_id: string }>();
    for (const msg of mensajesPendientes) {
      if (!latestByPhone.has(msg.from_number)) {
        latestByPhone.set(msg.from_number, msg);
      }
    }

    let retried = 0;
    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://lycos-team.vercel.app'}/api/whatsapp/webhook`;

    for (const [phone, msg] of latestByPhone.entries()) {
      // Doble verificación: ¿Acaso ya respondimos a este cliente o él mandó un mensaje más actual que todavía no cumple 3 minutos?
      const { data: newerMsg } = await db
        .from('mensajes_whatsapp')
        .select('id, tipo')
        .or(`from_number.eq.${phone},to_number.eq.${phone}`)
        .gt('created_at', msg.created_at)
        .limit(1);

      if (newerMsg && newerMsg.length > 0) {
        // Hay un mensaje más nuevo posterior a este "candidato", así que omitimos el reintento
        continue;
      }

      console.log(`🆘 [CRON] Detectada conversación ignorada con ${phone}. Enviando reintento...`);

      // Hacer la llamada interna al webhook pasando el flag whatsapp_cron_retry
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            object: 'whatsapp_cron_retry',
            from: phone,
            messageBody: msg.body,
            wa_message_id: msg.wa_message_id || `cron_${msg.id}`,
            insertedTimestamp: msg.created_at
          }),
        });
        retried++;
      } catch (err) {
        console.error(`🚨 CRON fetch error para ${phone}:`, err);
      }
    }

    return NextResponse.json({ status: 'ok', retried, msg: `Se intervinieron ${retried} conversaciones colgadas.` });
  } catch (error) {
    console.error('❌ CRON Fatal Error:', error);
    return NextResponse.json({ error }, { status: 500 });
  }
}
