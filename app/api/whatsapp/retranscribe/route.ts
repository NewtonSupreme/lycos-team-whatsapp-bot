/**
 * POST /api/whatsapp/retranscribe
 * Re-descarga y re-transcribe un audio que falló.
 * Body: { messageId: string }  ← ID de la fila en mensajes_whatsapp
 *
 * Flujo:
 * 1. Busca el mensaje en la DB por ID
 * 2. Usa el media_url (= WhatsApp media_id) para re-descargar el audio
 * 3. Re-transcribe con Gemini
 * 4. Actualiza el body del mensaje en la DB
 * 5. Llama a processCoreLogic para que el bot responda con la transcripción real
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processCoreLogic } from '../webhook/route';

const DEFAULT_SEDE_ID = process.env.WHATSAPP_DEFAULT_SEDE_ID || '310595c5-5258-47fa-9b69-5ad9932685a7';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// STT model chain: primary → fallback
const STT_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function transcribeAudio(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const systemPrompt =
    'Eres un sistema de reconocimiento de voz. Tu UNICA tarea es transcribir el audio a texto exacto en español. NO agregues explicaciones, respuestas, introducciones ni comentarios. Solo escribe lo que el usuario dice en español tal cual.';

  for (const model of STT_MODELS) {
    try {
      console.log(`🎙️ [STT] Intentando con modelo: ${model}`);
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
                { text: 'Transcribe el audio siguiente:' },
              ],
            }],
            generationConfig: { temperature: 0.1 },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          }),
        }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`❌ [STT] Error ${resp.status} con ${model}:`, errText.substring(0, 200));
        if (resp.status === 429 || resp.status === 503) continue;
        break; // Stop on fatal error
      }

      const data = await resp.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: any) => p.text).join('').trim() || null;
      if (text) {
        console.log(`✅ [STT] Transcripción exitosa con modelo: ${model}`);
        return text;
      }
    } catch (e) {
      console.error(`❌ [STT] Excepción con ${model}:`, e);
    }
  }

  console.error('🚨 [STT] Todos los modelos y llaves de transcripción fallaron.');
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
      .select('id, from_number, to_number, media_url, media_type, wa_message_id, body, tipo')
      .eq('id', messageId)
      .eq('sede_id', DEFAULT_SEDE_ID)
      .single();

    if (msgErr || !msg) {
      return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
    }

    if (msg.media_type !== 'audio') {
      return NextResponse.json({ error: 'El mensaje no es de tipo audio' }, { status: 400 });
    }

    const audioId = msg.media_url; // guardamos el media_id de WA en media_url
    if (!audioId) {
      return NextResponse.json({ error: 'No hay media_id guardado para este audio' }, { status: 400 });
    }

    if (!WHATSAPP_TOKEN) {
      return NextResponse.json({ error: 'WhatsApp token no configurado' }, { status: 500 });
    }

    // 2. Descargar el audio de la API de WhatsApp
    console.log(`🔄 [retranscribe] Re-descargando audio: ${audioId}`);
    const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    if (!mediaUrlResp.ok) {
      const errText = await mediaUrlResp.text();
      console.error('❌ Error obteniendo URL del audio:', errText);
      return NextResponse.json(
        { error: `Error al obtener la URL del audio de WhatsApp: ${mediaUrlResp.status}. El audio puede haber expirado (>30 días).`, detail: errText.substring(0, 200) },
        { status: 502 }
      );
    }

    const mediaData = await mediaUrlResp.json();
    if (!mediaData.url) {
      return NextResponse.json({ error: 'API de WhatsApp no devolvió URL de audio' }, { status: 502 });
    }

    const mediaResp = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    if (!mediaResp.ok) {
      return NextResponse.json({ error: 'Error descargando el binario del audio' }, { status: 502 });
    }

    const arrayBuffer = await mediaResp.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = mediaData.mime_type || 'audio/ogg';

    // 3. Re-transcribir con Gemini
    console.log(`🎙️ [retranscribe] Re-transcribiendo audio de ${msg.from_number}...`);
    const transcript = await transcribeAudio(base64Data, mimeType);

    if (!transcript) {
      return NextResponse.json({ error: 'La transcripción volvió a fallar. Intenta de nuevo.' }, { status: 422 });
    }

    const newBody = `${transcript} (Audio transcrito)`;
    console.log(`✅ [retranscribe] Transcripción: "${transcript.substring(0, 80)}"`);

    // 4. Actualizar el body del mensaje en la DB
    await db.from('mensajes_whatsapp').update({ body: newBody }).eq('id', messageId).eq('sede_id', DEFAULT_SEDE_ID);

    // 5. Ejecutar processCoreLogic para que la IA responda con el contenido real del audio
    const fromNumber = msg.from_number;
    const waMessageId = msg.wa_message_id || null;

    console.log(`🤖 [retranscribe] Procesando respuesta IA para ${fromNumber}...`);
    try {
      await processCoreLogic(db, fromNumber, newBody, waMessageId, undefined);
    } catch (e) {
      console.error('❌ [retranscribe] Error en processCoreLogic:', e);
      return NextResponse.json(
        { error: 'Transcripción OK pero falló la IA al responder', transcript },
        { status: 207 }
      );
    }

    return NextResponse.json({
      success: true,
      transcript,
      message: `Audio transcrito correctamente y respondido por la IA.`,
    });

  } catch (error) {
    console.error('❌ [retranscribe] Error general:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
