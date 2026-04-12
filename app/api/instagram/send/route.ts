import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN || '';

export async function POST(request: Request) {
  try {
    const { to, text, isAiMode } = await request.json();

    if (!to || !text) {
      return NextResponse.json({ error: 'Missing to or text' }, { status: 400 });
    }
    
    if (!INSTAGRAM_TOKEN) {
      return NextResponse.json({ error: 'Missing INSTAGRAM_TOKEN in environment' }, { status: 500 });
    }

    const payload = {
      recipient: { id: to },
      message: { text: text }
    };

    const resp = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${INSTAGRAM_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Error enviando mensaje manual a Instagram:', errorText);
      return NextResponse.json({ error: 'Error sending to Instagram', raw: errorText }, { status: 500 });
    }

    const data = await resp.json();
    const ig_message_id = data.message_id || 'manual_ig_msg';

    // Log the sent message into the database
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (supabaseUrl && supabaseKey) {
      const db = createClient(supabaseUrl, supabaseKey);
      await db.from('mensajes_instagram').insert({
        from_id: 'system',
        to_id: to,
        body: text,
        tipo: 'saliente',
        es_ia: !!isAiMode,
        ig_message_id: ig_message_id,
      });
      
      // Update the conversation's ultimo_mensaje
      await db.from('conversaciones_instagram')
        .update({
          ultimo_mensaje: text.substring(0, 200),
          ultimo_mensaje_at: new Date().toISOString(),
        })
        .eq('ig_id', to);
    }

    return NextResponse.json({ success: true, message_id: ig_message_id });
  } catch (error: any) {
    console.error('Error in send IG API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
