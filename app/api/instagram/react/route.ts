import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN;

export async function POST(request: NextRequest) {
  if (!INSTAGRAM_TOKEN) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  try {
    const { to, messageId, emoji } = await request.json();

    if (!to || !messageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Reaction in IG
    const metaResp = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${INSTAGRAM_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: to },
        sender_action: "react",
        reaction: emoji || "unlike"
      }),
    });

    if (!metaResp.ok) {
      const err = await metaResp.text();
      console.error('❌ Meta Reaction Error:', err);
      // Fallback but don't crash
    }

    // 2. Update local DB
    if (supabase) {
      await supabase
        .from('mensajes_instagram')
        .update({ reaccion: emoji || null })
        .eq('ig_message_id', messageId);
    }

    return NextResponse.json({ status: 'ok', emoji });

  } catch (error) {
    console.error('❌ Reaction Route Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
