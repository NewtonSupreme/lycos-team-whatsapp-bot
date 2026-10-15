import { NextRequest, NextResponse } from 'next/server';
import { leerSesion } from '@/lib/session-token';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SEDE_ID = process.env.WHATSAPP_DEFAULT_SEDE_ID || '310595c5-5258-47fa-9b69-5ad9932685a7';

export async function POST(request: NextRequest) {
  try {
    let to = '', message = '', file: File | null = null, location: any = null, interactive: any = null, previewUrl = false, quotedMessageId = '';
    const contentType = request.headers.get('content-type') || '';
    
    let operatorName = '';

    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      to = (fd.get('to') as string) || '';
      message = (fd.get('message') as string) || '';
      quotedMessageId = (fd.get('quoted_message_id') as string) || '';
      operatorName = (fd.get('operator_name') as string) || '';
      const f = fd.get('file');
      if (f && typeof f === 'object' && (f as File).name) {
        file = f as File;
      }
    } else {
      const body = await request.json();
      to = body.to;
      message = body.message || '';
      location = body.location || null;
      interactive = body.interactive || null;
      previewUrl = body.preview_url === true;
      quotedMessageId = body.quoted_message_id || '';
      operatorName = body.operator_name || '';
    }

    if (!operatorName) {
      try {
        const cookieStore = await cookies();
        const username = leerSesion(cookieStore.get('lycos_session')?.value);
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
          const mimeType = file.type || '';
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
        
        if (mediaType === 'audio') {
          payload[mediaType].voice = true;
        }
        
        if (mediaType === 'document' && file?.name) {
          payload[mediaType].filename = file.name;
        }

        // Meta supports captions for image/video/document
        if (message && mediaType !== 'audio') {
          payload[mediaType].caption = message;
        }
      } else if (interactive) {
        payload.type = 'interactive';
        payload.interactive = interactive;
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

      const rawBody = location 
        ? `[Ubicación: ${location.name || 'Sede'}]` 
        : (interactive ? `[Botones: ${interactive.body?.text || 'Interactivo'}]` : (mediaType === 'audio' && !message ? '[Mensaje de voz]' : message));
      const dbBody = operatorName ? `${rawBody} [env:${operatorName}]` : rawBody;

      await db.from('mensajes_whatsapp').insert({
        from_number: 'system',
        to_number: to.replace(/[^0-9]/g, ''),
        body: dbBody,
        tipo: 'saliente',
        estado: 'enviado',
        es_ia: false,
        ...(waMessageId ? { wa_message_id: waMessageId } : {}),
        ...(mediaId ? { media_url: mediaId, media_type: mediaType } : {}),
        sede_id: effectiveSedeId
      });
      const mediaIcon = mediaType === 'image' ? '📷' : mediaType === 'video' ? '🎥' : mediaType === 'audio' ? '🎙️' : mediaType === 'document' ? '📎' : '';
      const previewMsg = location
        ? `📍 Ubicación: ${location.name || 'Sede'}`
        : interactive
          ? `🔘 ${interactive.body?.text || 'Interactivo'}`
          : mediaIcon
            ? `${mediaIcon} ${message || (mediaType === 'image' ? 'Imagen' : mediaType === 'video' ? 'Video' : mediaType === 'audio' ? 'Audio' : 'Documento')}`
            : message;
      await db.from('conversaciones').upsert({
        telefono: to.replace(/[^0-9]/g, ''),
        ultimo_mensaje: previewMsg,
        ultimo_mensaje_at: new Date().toISOString(),
        // Solo pasar a humano si es un texto directo (no ubicación ni botones)
        ...((!location && !interactive) ? { estado: 'humano' } : {}),
        sede_id: effectiveSedeId
      }, { onConflict: 'telefono' });
    }

    return NextResponse.json({ success: true, messageId: waMessageId });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
