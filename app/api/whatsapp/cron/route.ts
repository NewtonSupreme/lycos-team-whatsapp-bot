/**
 * /api/whatsapp/cron — Manual retry endpoint
 * Triggered from the CRM "Reintentar IA" button only.
 * Vercel Hobby Plan: no scheduled cron jobs.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processCoreLogic } from '../webhook/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const ASESOR_PHONE = '584123343519';

async function sendMsgSimple(to: string, body: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''), type: 'text',
        text: { preview_url: false, body },
      }),
    });
  } catch { /* silent */ }
}

export async function processPendingMessages(
  db: ReturnType<typeof getDb>,
  limitCount = 10
): Promise<{ succeeded: number; still_pending: number; abandoned: number }> {
  if (!db) return { succeeded: 0, still_pending: 0, abandoned: 0 };

  const MAX_INTENTOS = 10;

  // 1. Deep sweep: Find orphaned incoming messages (last 3 hours)
  try {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: orphanedMsgs } = await db.from('mensajes_whatsapp')
      .select('*')
      .eq('tipo', 'entrante')
      .gte('created_at', threeHoursAgo)
      .order('created_at', { ascending: false })
      .limit(200);

    if (orphanedMsgs) {
      const byPhone = new Map<string, any>();
      for (const m of orphanedMsgs) {
        if (!byPhone.has(m.from_number)) byPhone.set(m.from_number, m);
      }

      for (const [phone, latestMsg] of byPhone.entries()) {
        const { data: sentAfter } = await db.from('mensajes_whatsapp')
          .select('id')
          .eq('to_number', phone)
          .eq('tipo', 'saliente')
          .gt('created_at', latestMsg.created_at)
          .limit(1);

        if (!sentAfter || sentAfter.length === 0) {
          const { data: q } = await db.from('mensajes_pendientes_ia')
            .select('id, status')
            .eq('wa_message_id', latestMsg.wa_message_id)
            .limit(1);
            
          if (!q || q.length === 0) {
            const { data: conv } = await db.from('conversaciones').select('estado').eq('telefono', phone).maybeSingle();
            if (conv?.estado !== 'humano') {
              await db.from('mensajes_pendientes_ia').insert({
                from_number: phone,
                message_body: latestMsg.body,
                wa_message_id: latestMsg.wa_message_id,
                inserted_timestamp: latestMsg.created_at,
                intentos: 0,
                status: 'pending',
                sede_id: latestMsg.sede_id || '310595c5-5258-47fa-9b69-5ad9932685a7'
              });
              console.log(`🧹 Escaneo profundo: Agregado a cola mensaje huérfano de ${phone}`);
            }
          } else if (q[0].status === 'failed' || q[0].status === 'completed') {
             // Si el escaneo dice que NO hay salida, pero en la cola dice completado/fallido, lo forzamos a pendiente
             await db.from('mensajes_pendientes_ia').update({ status: 'pending', intentos: 0 }).eq('id', q[0].id);
             console.log(`🧹 Escaneo profundo: Re-encolado mensaje fallido/falso-completado de ${phone}`);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error en escaneo profundo de huérfanos:', e);
  }

  // 2. Process the queue
  const { data: pendientes } = await db
    .from('mensajes_pendientes_ia')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limitCount);

  if (!pendientes || pendientes.length === 0) return { succeeded: 0, still_pending: 0, abandoned: 0 };

  let succeeded = 0, stillPending = 0, abandoned = 0;

  for (const row of pendientes) {
    const { id, from_number, message_body, wa_message_id, wa_profile_name, intentos, inserted_timestamp } = row;
    const newIntentos = (intentos || 0) + 1;

    await db.from('mensajes_pendientes_ia').update({
      intentos: newIntentos,
      ultimo_intento_at: new Date().toISOString(),
    }).eq('id', id);

    // (The 'Already replied' check was removed so that old messages blocked by the holding message are successfully retried)

    // Human takeover?
    const { data: conv } = await db.from('conversaciones').select('estado').eq('telefono', from_number).maybeSingle();
    if (conv?.estado === 'humano') {
      await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
      succeeded++;
      continue;
    }

    // Retry AI
    let ok = false;
    try {
      await processCoreLogic(db, from_number, message_body, wa_message_id || null, wa_profile_name || undefined);
      const { data: sent } = await db
        .from('mensajes_whatsapp').select('id')
        .eq('from_number', 'system').eq('to_number', from_number).eq('tipo', 'saliente')
        .gt('created_at', inserted_timestamp).limit(1);
      if (sent && sent.length > 0) ok = true;
    } catch { /* silent */ }

    if (ok) {
      await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', id);
      succeeded++;
    } else if (newIntentos >= MAX_INTENTOS) {
      await db.from('mensajes_pendientes_ia').update({
        status: 'failed',
        error_log: `Abandoned after ${newIntentos} attempts.`,
      }).eq('id', id);
      await sendMsgSimple(ASESOR_PHONE,
        `🚨 *Atención manual requerida*\nEl bot no pudo responder a *${from_number}* tras ${newIntentos} intentos.\n\nMensaje: "${message_body.substring(0, 200)}"`
      );
      await sendMsgSimple(from_number,
        `Disculpa la demora 🙏 Un asesor te contactará pronto para ayudarte personalmente. ¡Gracias por tu paciencia! 😊`
      );
      abandoned++;
    } else {
      stillPending++;
    }
  }

  return { succeeded, still_pending: stillPending, abandoned };
}

// Manual trigger (called from CRM "Reintentar IA" button)
export async function GET() {
  const db = getDb();
  const result = await processPendingMessages(db, 20);
  return NextResponse.json({ status: 'ok', ...result });
}
