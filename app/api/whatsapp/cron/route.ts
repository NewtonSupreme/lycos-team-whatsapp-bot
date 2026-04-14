import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processCoreLogic } from '../webhook/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — plenty for multi-model retries

const MAX_INTENTOS = 10;          // Give up after 10 cron cycles
const MIN_AGE_SECONDS = 60;       // Only retry messages at least 60s old
const ASESOR_PHONE = '584123343519';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Send a plain WhatsApp text — minimal version for the cron, avoids circular import issues */
async function sendMsgCron(to: string, body: string) {
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
    console.error('❌ [CRON] sendMsgCron error:', e);
  }
}

// ─── GET: Vercel Cron endpoint ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // Validate cron secret (Vercel sets Authorization: Bearer <CRON_SECRET>)
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn('⛔ [CRON] Unauthorized request rejected.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    console.error('❌ [CRON] No DB connection.');
    return NextResponse.json({ error: 'No DB' }, { status: 500 });
  }

  // Fetch pending messages with enough age (avoid racing with live retry)
  const cutoff = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();
  const { data: pendientes, error: fetchErr } = await db
    .from('mensajes_pendientes_ia')
    .select('*')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(10); // Process up to 10 per cron tick to stay within time budget

  if (fetchErr) {
    console.error('❌ [CRON] Error fetching pendientes:', fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!pendientes || pendientes.length === 0) {
    console.log('✅ [CRON] No hay mensajes pendientes de IA.');
    return NextResponse.json({ status: 'ok', processed: 0 });
  }

  console.log(`🔄 [CRON] Procesando ${pendientes.length} mensajes pendientes...`);
  let succeeded = 0;
  let failed = 0;
  let abandoned = 0;

  for (const row of pendientes) {
    const { id, from_number, message_body, wa_message_id, wa_profile_name, intentos } = row;

    // Mark as being retried (update counter + timestamp)
    const newIntentos = (intentos || 0) + 1;
    await db.from('mensajes_pendientes_ia').update({
      intentos: newIntentos,
      ultimo_intento_at: new Date().toISOString(),
    }).eq('id', id);

    // Check if already replied since the message was queued (avoid duplicate replies)
    try {
      const { data: laterReply } = await db
        .from('mensajes_whatsapp')
        .select('id')
        .eq('from_number', 'system')
        .eq('to_number', from_number)
        .eq('tipo', 'saliente')
        .gt('created_at', row.inserted_timestamp)
        .limit(1);

      if (laterReply && laterReply.length > 0) {
        console.log(`⏩ [CRON] ${from_number} ya fue respondido después del fallo. Marcando completado.`);
        await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
        succeeded++;
        continue;
      }
    } catch { /* proceed anyway */ }

    // Check conversation state — skip if now in human mode
    try {
      const { data: conv } = await db.from('conversaciones').select('estado').eq('telefono', from_number).single();
      if (conv?.estado === 'humano') {
        console.log(`👤 [CRON] ${from_number} en modo humano. Marcando completado sin IA.`);
        await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
        succeeded++;
        continue;
      }
    } catch { /* no conversation row — proceed */ }

    // Attempt to process via AI
    console.log(`🔄 [CRON] Reintentando (${newIntentos}/${MAX_INTENTOS}) para ${from_number}...`);
    let processedOk = false;
    try {
      await processCoreLogic(db, from_number, message_body, wa_message_id || null, wa_profile_name || undefined);

      // Verify a reply was actually sent
      const { data: sentMsg } = await db
        .from('mensajes_whatsapp')
        .select('id')
        .eq('from_number', 'system')
        .eq('to_number', from_number)
        .eq('tipo', 'saliente')
        .gt('created_at', row.inserted_timestamp)
        .limit(1);

      if (sentMsg && sentMsg.length > 0) {
        processedOk = true;
      }
    } catch (e) {
      console.error(`❌ [CRON] Error en processCoreLogic para ${from_number}:`, e);
    }

    if (processedOk) {
      await db.from('mensajes_pendientes_ia').update({
        status: 'completed',
        error_log: null,
      }).eq('id', id);
      console.log(`✅ [CRON] Mensaje de ${from_number} respondido exitosamente en intento ${newIntentos}.`);
      succeeded++;
    } else if (newIntentos >= MAX_INTENTOS) {
      // Give up — mark failed and notify human advisor
      await db.from('mensajes_pendientes_ia').update({
        status: 'failed',
        error_log: `Fallo tras ${newIntentos} intentos del cron.`,
      }).eq('id', id);
      console.error(`🚨 [CRON] ABANDONO después de ${newIntentos} intentos para ${from_number}.`);

      // Notify asesor
      await sendMsgCron(
        ASESOR_PHONE,
        `🚨 *ATENCIÓN MANUAL REQUERIDA*\n\nEl chatbot no pudo responder al cliente *${from_number}* después de ${newIntentos} intentos.\n\nMensaje del cliente:\n"${message_body.substring(0, 200)}"\n\nPor favor responde manualmente en el CRM.`
      );

      // Also tell the client that a person will help them
      await sendMsgCron(
        from_number,
        `Disculpa la demora 🙏 En breve un asesor de Lycos Team te contactará personalmente para ayudarte. ¡Gracias por tu paciencia! 😊`
      );

      abandoned++;
    } else {
      // Will retry on next cron tick
      console.log(`🔁 [CRON] ${from_number} fallido, se reintentará (intento ${newIntentos}/${MAX_INTENTOS}).`);
      failed++;
    }
  }

  console.log(`📊 [CRON] Resultado: ${succeeded} exitosos | ${failed} pendientes | ${abandoned} abandonados`);
  return NextResponse.json({
    status: 'ok',
    processed: pendientes.length,
    succeeded,
    still_pending: failed,
    abandoned,
  });
}
