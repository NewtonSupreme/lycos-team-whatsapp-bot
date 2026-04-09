import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export async function POST(request: NextRequest) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  try {
    const { to, messageId, emoji } = await request.json();

    if (!to || !messageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Send reaction to Meta
    // If emoji is empty string, it removes the reaction
    const metaResp = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''),
        type: 'reaction',
        reaction: {
          message_id: messageId,
          emoji: emoji || ''
        }
      }),
    });

    if (!metaResp.ok) {
      const err = await metaResp.json();
      console.error('❌ Meta Reaction Error:', JSON.stringify(err));
      return NextResponse.json({ error: 'Meta API Error', details: err }, { status: 400 });
    }

    // 2. Update local DB
    if (supabase) {
      await supabase
        .from('mensajes_whatsapp')
        .update({ reaccion: emoji || null })
        .eq('wa_message_id', messageId);
    }

    return NextResponse.json({ status: 'ok', emoji });

  } catch (error) {
    console.error('❌ Reaction Route Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
