import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SEDE_ID = process.env.WHATSAPP_DEFAULT_SEDE_ID || '310595c5-5258-47fa-9b69-5ad9932685a7';

export async function POST(request: NextRequest) {
  try {
    let to = '', message = '', file: File | null = null, location: any = null, previewUrl = false, quotedMessageId = '';
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      to = (fd.get('to') as string) || '';
      message = (fd.get('message') as string) || '';
      quotedMessageId = (fd.get('quoted_message_id') as string) || '';
      const f = fd.get('file');
      if (f && typeof f === 'object' && (f as File).name) {
        file = f as File;
      }
    } else {
      const body = await request.json();
      to = body.to;
      message = body.message || '';
      location = body.location || null;
      previewUrl = body.preview_url === true;
      quotedMessageId = body.quoted_message_id || '';
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
        
        const upRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fdMeta
        });
        const upData = await upRes.json();
        if (upData.id) {
          mediaId = upData.id;
<<<<<<< HEAD
          console.log(`✅ Media subida con éxito: ${mediaId} (${mimeType})`);
          if (mimeType.startsWith('image/')) mediaType = 'image';
          else if (mimeType.startsWith('video/')) mediaType = 'video';
          else if (mimeType.startsWith('audio/')) mediaType = 'audio';
          else mediaType = 'document';
        } else {
          console.error('❌ Error subiendo media a Meta:', JSON.stringify(upData, null, 2));
          return NextResponse.json({ 
            error: 'Fallo al subir archivo a WhatsApp', 
            details: upData.error?.message || 'Error desconocido en subida de media'
          }, { status: 400 });
=======
          if (file.type.startsWith('image/')) mediaType = 'image';
          else if (file.type.startsWith('video/')) mediaType = 'video';
          else if (file.type.startsWith('audio/')) mediaType = 'audio';
          else mediaType = 'document';
        } else {
          console.error('❌ Error subiendo media a Meta:', JSON.stringify(upData));
          return NextResponse.json({ error: 'Fallo al subir archivo a WhatsApp' }, { status: 400 });
>>>>>>> parent of beeccc5 (fix notas de voz y mensajes interactivos en ubicacion)
        }
      }

      // 2. Send Message
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''),
      };

      if (quotedMessageId) {
        payload.context = { message_id: quotedMessageId };
      }

      if (location) {
        payload.type = 'location';
        payload.location = {
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name || 'Lycos Team',
          address: location.address || ''
        };
      } else if (mediaId && mediaType) {
        payload.type = mediaType;
        payload[mediaType] = { id: mediaId };
        
        // Meta is EXTREMELY strict with voice notes. Only OGG/Opus is officially supported for voice:true.
        // If we're not sure it's a real OGG, we send it as regular audio to ensure it actually arrives.
        if (mediaType === 'audio' && (file?.type === 'audio/ogg' || file?.name?.endsWith('.ogg'))) {
          payload[mediaType].voice = true;
        }
        
        if (mediaType === 'document' && file?.name) {
          payload[mediaType].filename = file.name;
        }

        // Meta supports captions for image/video/document
        if (message && mediaType !== 'audio') {
          payload[mediaType].caption = message;
        }
      } else {
        payload.type = 'text';
        payload.text = { preview_url: previewUrl, body: message };
      }

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
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
        console.error('❌ Meta API Error (Messages):', JSON.stringify(err, null, 2));
        return NextResponse.json({ 
          error: err.error?.message || 'Error enviando mensaje',
          code: err.error?.code,
          subcode: err.error?.error_subcode
        }, { status: 400 });
      }

      const data = await response.json();
      waMessageId = data.messages?.[0]?.id || null;
      console.log(`✅ Mensaje enviado a Meta. ID: ${waMessageId}`);
    }

    // Save to Supabase + mark conversation as 'humano' to pause bot
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const dbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (dbUrl && dbKey) {
      const db = createClient(dbUrl, dbKey);
      
      // Look up existing sede_id for this conversation
      let effectiveSedeId = DEFAULT_SEDE_ID;
      try {
        const { data: existingConv } = await db.from('conversaciones')
          .select('sede_id')
          .eq('telefono', to.replace(/[^0-9]/g, ''))
          .maybeSingle();
        if (existingConv?.sede_id) {
          effectiveSedeId = existingConv.sede_id;
        }
      } catch (e) {
        console.error('Error buscando sede_id:', e);
      }

      await db.from('mensajes_whatsapp').insert({
        from_number: 'system',
        to_number: to.replace(/[^0-9]/g, ''),
        body: location 
          ? `[Ubicación: ${location.name || 'Sede'}]` 
          : (mediaType === 'audio' && !message ? '[Mensaje de voz]' : message),
        tipo: 'saliente',
        estado: 'enviado',
        es_ia: false,
        ...(waMessageId ? { wa_message_id: waMessageId } : {}),
        ...(mediaId ? { media_url: mediaId, media_type: mediaType } : {}),
        ...(quotedMessageId ? { quoted_wa_id: quotedMessageId } : {}),
        sede_id: effectiveSedeId
      });
      await db.from('conversaciones').upsert({
        telefono: to.replace(/[^0-9]/g, ''),
        ultimo_mensaje: location ? `📍 Ubicación: ${location.name || 'Sede'}` : message,
        ultimo_mensaje_at: new Date().toISOString(),
        estado: 'humano',
        sede_id: effectiveSedeId
      }, { onConflict: 'telefono' });
    }

    return NextResponse.json({ success: true, messageId: waMessageId });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
