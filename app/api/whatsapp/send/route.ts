import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { to, message } = await request.json();

    if (!to || !message) {
      return NextResponse.json({ error: 'Faltan parámetros: to, message' }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    let waMessageId: string | null = null;

    if (!token || !phoneId) {
      // Demo mode - simulate success
      console.warn('[send] Sin TOKEN de WhatsApp — modo demo.');
    } else {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to.replace(/[^0-9]/g, ''),
            type: 'text',
            text: { preview_url: false, body: message },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        console.error('❌ Meta API Error (Manual Send):', JSON.stringify(err));
        return NextResponse.json({ error: err.error?.message || 'Error enviando mensaje' }, { status: 400 });
      }

      const data = await response.json();
      waMessageId = data.messages?.[0]?.id || null;
    }

    // Save to Supabase + mark conversation as 'humano' to pause bot
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const dbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (dbUrl && dbKey) {
      const db = createClient(dbUrl, dbKey);
      await db.from('mensajes_whatsapp').insert({
        from_number: 'system',
        to_number: to.replace(/[^0-9]/g, ''),
        body: message,
        tipo: 'saliente',
        estado: 'enviado',
        es_ia: false,
        ...(waMessageId ? { wa_message_id: waMessageId } : {}),
      });
      await db.from('conversaciones').upsert({
        telefono: to.replace(/[^0-9]/g, ''),
        ultimo_mensaje: message,
        ultimo_mensaje_at: new Date().toISOString(),
        estado: 'humano',
      }, { onConflict: 'telefono' });
    }

    return NextResponse.json({ success: true, messageId: waMessageId });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
