import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    let to = '', message = '', file: File | null = null;
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      to = (fd.get('to') as string) || '';
      message = (fd.get('message') as string) || '';
      const f = fd.get('file');
      if (f && typeof f === 'object' && (f as File).name) {
        file = f as File;
      }
    } else {
      const body = await request.json();
      to = body.to;
      message = body.message || '';
    }

    if (!to && (!message && !file)) {
      return NextResponse.json({ error: 'Faltan parámetros: to, message o archivo' }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    let waMessageId: string | null = null;
    let mediaId: string | null = null;
    let mediaType: string | null = null;

    if (!token || !phoneId) {
      console.warn('[send] Sin TOKEN de WhatsApp — modo demo.');
    } else {
      // 1. Upload media to Meta if attached
      if (file) {
        const fdMeta = new FormData();
        fdMeta.append('messaging_product', 'whatsapp');
        // Asegurar que se pase explicitamente el nombre del archivo en la cabecera multipart
        fdMeta.append('file', file, file.name || 'documento.pdf');
        if (file.type) fdMeta.append('type', file.type);
        
        const upRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/media`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fdMeta
        });
        const upData = await upRes.json();
        if (upData.id) {
          mediaId = upData.id;
          if (file.type.startsWith('image/')) mediaType = 'image';
          else if (file.type.startsWith('video/')) mediaType = 'video';
          else if (file.type.startsWith('audio/')) mediaType = 'audio';
          else mediaType = 'document';
        } else {
          console.error('❌ Error subiendo media a Meta:', JSON.stringify(upData));
          return NextResponse.json({ error: 'Fallo al subir archivo a WhatsApp' }, { status: 400 });
        }
      }

      // 2. Send Message
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''),
      };

      if (mediaId && mediaType) {
        payload.type = mediaType;
        payload[mediaType] = { id: mediaId };
        
        if (mediaType === 'document' && file?.name) {
          payload[mediaType].filename = file.name;
        }

        // Meta supports captions for image/video/document
        if (message && mediaType !== 'audio') {
          payload[mediaType].caption = message;
        }
      } else {
        payload.type = 'text';
        payload.text = { preview_url: false, body: message };
      }

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
        ...(mediaId ? { media_url: mediaId, media_type: mediaType } : {}),
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
