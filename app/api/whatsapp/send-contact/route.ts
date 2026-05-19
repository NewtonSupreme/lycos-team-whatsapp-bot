import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const ASESOR_PHONE = '584123343519';
const ASESOR_DISPLAY_NAME = 'Asesor Lycos Team';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const to = body.to;
    let operatorName = body.operator_name || '';

    if (!to) {
      return NextResponse.json({ error: 'Falta el número de destino' }, { status: 400 });
    }

    if (!operatorName) {
      try {
        const cookieStore = await cookies();
        const username = cookieStore.get('lycos_session')?.value;
        if (username) {
          const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
          const dbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
          if (dbUrl && dbKey) {
            const db = createClient(dbUrl, dbKey);
            const { data: usr } = await db.from('usuarios')
              .select('nombre')
              .eq('username', username)
              .maybeSingle();
            if (usr?.nombre) {
              operatorName = usr.nombre;
            } else {
              operatorName = username.charAt(0).toUpperCase() + username.slice(1);
            }
          }
        }
      } catch (e) {
        console.error('Error fetching operator name from session:', e);
      }
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return NextResponse.json({ error: 'TOKEN o PHONE_ID no configurados' }, { status: 500 });
    }

    const normalizedTo = to.replace(/[^0-9]/g, '');

    // ── Meta Contact Payload ──────────────────────────────────────────────────
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'contacts',
      contacts: [
        {
          name: {
            formatted_name: ASESOR_DISPLAY_NAME,
            first_name: 'Asesor',
            last_name: 'Lycos Team'
          },
          phones: [
            {
              phone: `+${ASESOR_PHONE}`,
              type: 'WORK',
              wa_id: ASESOR_PHONE
            }
          ]
        }
      ]
    };

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ Meta API Error (Send Contact):', JSON.stringify(err));
      return NextResponse.json({ error: 'Error enviando tarjeta de contacto' }, { status: 422 });
    }

    const data = await response.json();
    const waMessageId = data.messages?.[0]?.id || null;

    // ── Save to Supabase ──────────────────────────────────────────────────────
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const dbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (dbUrl && dbKey) {
      const db = createClient(dbUrl, dbKey);
      const dbBody = operatorName 
        ? `[Tarjeta de contacto: ${ASESOR_DISPLAY_NAME}] [env:${operatorName}]` 
        : `[Tarjeta de contacto: ${ASESOR_DISPLAY_NAME}]`;

      await db.from('mensajes_whatsapp').insert({
        from_number: 'system',
        to_number: normalizedTo,
        body: dbBody,
        tipo: 'saliente',
        estado: 'enviado',
        es_ia: false,
        wa_message_id: waMessageId
      });

      // Update last message metadata (without changing mode)
      await db.from('conversaciones').update({
        ultimo_mensaje: `[Tarjeta de contacto: ${ASESOR_DISPLAY_NAME}]`,
        ultimo_mensaje_at: new Date().toISOString()
      }).eq('telefono', normalizedTo);
    }

    return NextResponse.json({ success: true, messageId: waMessageId });
  } catch (error) {
    console.error('Send Contact error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
