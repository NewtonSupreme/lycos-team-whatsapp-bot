/**
 * /api/whatsapp/cron — Manual retry endpoint (Vercel Hobby Plan)
 *
 * Since Vercel Hobby doesn't support scheduled cron jobs, this endpoint
 * can be triggered manually from the CRM dashboard or by an external free
 * service (e.g. cron-job.org, UptimeRobot) to process pending AI messages.
 *
 * The webhook also auto-retries pending messages whenever the same user
 * sends a new message ("piggyback retry" strategy).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processCoreLogic } from '../webhook/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_INTENTOS = 10;
const MIN_AGE_SECONDS = 90;
const ASESOR_PHONE = '584123343519';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function sendMsgSimple(to: string, body: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { preview_url: false, body },
      }),
    });
  } catch (e) {
    console.error('❌ [RETRY] sendMsgSimple error:', e);
  }
}

export async function processPendingMessages(db: ReturnType<typeof getDb>, limitCount = 10): Promise<{ succeeded: number; still_pending: number; abandoned: number }> {
  if (!db) return { succeeded: 0, still_pending: 0, abandoned: 0 };

  const cutoff = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();
  const { data: pendientes, error } = await db
    .from('mensajes_pendientes_ia')
    .select('*')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limitCount);

  if (error || !pendientes || pendientes.length === 0) {
    return { succeeded: 0, still_pending: 0, abandoned: 0 };
  }

  console.log(`🔄 [RETRY] Procesando ${pendientes.length} mensajes pendientes...`);
  let succeeded = 0, stillPending = 0, abandoned = 0;

  for (const row of pendientes) {
    const { id, from_number, message_body, wa_message_id, wa_profile_name, intentos, inserted_timestamp } = row;
    const newIntentos = (intentos || 0) + 1;

    await db.from('mensajes_pendientes_ia').update({
      intentos: newIntentos,
      ultimo_intento_at: new Date().toISOString(),
    }).eq('id', id);

    // Skip if already replied after failure
    const { data: laterReply } = await db
      .from('mensajes_whatsapp')
      .select('id')
      .eq('from_number', 'system')
      .eq('to_number', from_number)
      .eq('tipo', 'saliente')
      .gt('created_at', inserted_timestamp)
      .limit(1);

    if (laterReply && laterReply.length > 0) {
      await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
      console.log(`⏩ [RETRY] ${from_number} ya respondido. Completado.`);
      succeeded++;
      continue;
    }

    // Skip if human took over
    const { data: conv } = await db.from('conversaciones').select('estado').eq('telefono', from_number).maybeSingle();
    if (conv?.estado === 'humano') {
      await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
      succeeded++;
      continue;
    }

    // Attempt retry
    let ok = false;
    try {
      await processCoreLogic(db, from_number, message_body, wa_message_id || null, wa_profile_name || undefined);
      const { data: sent } = await db
        .from('mensajes_whatsapp')
        .select('id')
        .eq('from_number', 'system')
        .eq('to_number', from_number)
        .eq('tipo', 'saliente')
        .gt('created_at', inserted_timestamp)
        .limit(1);
      if (sent && sent.length > 0) ok = true;
    } catch (e) {
      console.error(`❌ [RETRY] processCoreLogic error para ${from_number}:`, e);
    }

    if (ok) {
      await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
      console.log(`✅ [RETRY] ${from_number} respondido ok (intento ${newIntentos}).`);
      succeeded++;
    } else if (newIntentos >= MAX_INTENTOS) {
      await db.from('mensajes_pendientes_ia').update({
        status: 'failed',
        error_log: `Fallo tras ${newIntentos} intentos.`,
      }).eq('id', id);
      console.error(`🚨 [RETRY] ABANDONO ${from_number} tras ${newIntentos} intentos.`);

      // Notify asesor
      await sendMsgSimple(
        ASESOR_PHONE,
        `🚨 *Atención manual requerida*\nEl bot no pudo responder a *${from_number}* tras ${newIntentos} intentos.\n\nMensaje: "${message_body.substring(0, 200)}"`
      );
      // Notify client
      await sendMsgSimple(
        from_number,
        `Disculpa la demora 🙏 Un asesor de Lycos Team te contactará pronto para ayudarte personalmente. ¡Gracias por tu paciencia! 😊`
      );
      abandoned++;
    } else {
      stillPending++;
    }
  }

  return { succeeded, still_pending: stillPending, abandoned };
}

// ─── GET: Manual trigger endpoint ─────────────────────────────────────────────
export async function GET() {
  const db = getDb();
  const result = await processPendingMessages(db, 20);
  console.log(`📊 [RETRY MANUAL] succeeded=${result.succeeded} pending=${result.still_pending} abandoned=${result.abandoned}`);
  return NextResponse.json({ status: 'ok', ...result });
}
