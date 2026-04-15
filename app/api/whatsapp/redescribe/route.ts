/**
 * POST /api/whatsapp/redescribe
 * Re-descarga y re-analiza una imagen cuya descripción falló.
 * Body: { messageId: string }  ← ID de la fila en mensajes_whatsapp
 *
 * Flujo:
 * 1. Busca el mensaje en la DB por ID
 * 2. Usa media_url (= WhatsApp media_id) para re-descargar la imagen
 * 3. Re-describe con Gemini Vision
 * 4. Actualiza el body del mensaje en la DB
 * 5. Llama a processCoreLogic para que el bot responda con la descripción real
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processCoreLogic } from '../webhook/route';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function describeImage(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const systemPrompt =
    'Eres un analista de imágenes de un taller automotriz. Detalla brevemente y de forma muy precisa qué se ve en la imagen para que el chatbot lo entienda y pueda ayudar al cliente. Si hay texto relevante en la imagen, menciónalo. Responde siempre en español.';

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`🖼️ [redescribe] Intentando con modelo: ${model}`);
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{
              role: 'user',
              parts: [
                { inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } },
                { text: 'Describe esta imagen detalladamente pensando como mecánico:' },
              ],
            }],
            generationConfig: { temperature: 0.4 },
          }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }
      const errText = await resp.text();
      console.error(`❌ Gemini Vision error ${resp.status} con ${model}:`, errText.substring(0, 200));
      if (resp.status === 429 || resp.status === 503) continue;
      break; 
    } catch (e) {
      console.error('❌ describeImage excepcion:', e);
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { messageId } = await request.json();
    if (!messageId) {
      return NextResponse.json({ error: 'messageId requerido' }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'DB no disponible' }, { status: 500 });
    }

    // 1. Buscar el mensaje original
    const { data: msg, error: msgErr } = await db
      .from('mensajes_whatsapp')
      .select('id, from_number, media_url, media_type, wa_message_id, body, tipo')
      .eq('id', messageId)
      .single();

    if (msgErr || !msg) {
      return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
    }

    if (msg.media_type !== 'image') {
      return NextResponse.json({ error: 'El mensaje no es de tipo image' }, { status: 400 });
    }

    const imageId = msg.media_url;
    if (!imageId) {
      return NextResponse.json({ error: 'No hay media_id guardado para esta imagen' }, { status: 400 });
    }

    if (!WHATSAPP_TOKEN) {
      return NextResponse.json({ error: 'WhatsApp token no configurado' }, { status: 500 });
    }

    // 2. Descargar la imagen de la API de WhatsApp
    console.log(`🔄 [redescribe] Re-descargando imagen: ${imageId}`);
    const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${imageId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    if (!mediaUrlResp.ok) {
      const errText = await mediaUrlResp.text();
      console.error('❌ Error obteniendo URL de la imagen:', errText);
      return NextResponse.json(
        { error: `Error al obtener la URL de la imagen de WhatsApp: ${mediaUrlResp.status}. La imagen puede haber expirado (>30 días).`, detail: errText.substring(0, 200) },
        { status: 502 }
      );
    }

    const mediaData = await mediaUrlResp.json();
    if (!mediaData.url) {
      return NextResponse.json({ error: 'API de WhatsApp no devolvió URL de imagen' }, { status: 502 });
    }

    const mediaResp = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    if (!mediaResp.ok) {
      return NextResponse.json({ error: 'Error descargando el binario de la imagen' }, { status: 502 });
    }

    const arrayBuffer = await mediaResp.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = mediaData.mime_type || 'image/jpeg';

    // 3. Re-describir con Gemini Vision
    console.log(`🖼️ [redescribe] Re-describiendo imagen de ${msg.from_number}...`);
    const description = await describeImage(base64Data, mimeType);

    if (!description) {
      return NextResponse.json({ error: 'La descripción de la imagen volvió a fallar. Intenta de nuevo.' }, { status: 422 });
    }

    const newBody = `[Imagen enviada por el cliente. Descripción automática (analízala y respondele en base a esto): ${description}]`;
    console.log(`✅ [redescribe] Descripción: "${description.substring(0, 80)}"`);

    // 4. Actualizar el body del mensaje en la DB
    await db.from('mensajes_whatsapp').update({ body: newBody }).eq('id', messageId);

    // 5. Ejecutar processCoreLogic para que la IA responda con el contenido real de la imagen
    const fromNumber = msg.from_number;
    const waMessageId = msg.wa_message_id || null;

    console.log(`🤖 [redescribe] Procesando respuesta IA para ${fromNumber}...`);
    try {
      await processCoreLogic(db, fromNumber, newBody, waMessageId, undefined);
    } catch (e) {
      console.error('❌ [redescribe] Error en processCoreLogic:', e);
      return NextResponse.json(
        { error: 'Imagen descrita pero falló la IA al responder', description },
        { status: 207 }
      );
    }

    return NextResponse.json({
      success: true,
      description,
      message: `Imagen analizada correctamente y respondida por la IA.`,
    });

  } catch (error) {
    console.error('❌ [redescribe] Error general:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
