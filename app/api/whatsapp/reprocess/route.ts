import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processCoreLogic } from '../webhook/route';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_SEDE_ID = process.env.WHATSAPP_DEFAULT_SEDE_ID || '310595c5-5258-47fa-9b69-5ad9932685a7';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function transcribeAudio(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const systemPrompt = 'Eres un sistema de reconocimiento de voz. Tu UNICA tarea es transcribir el audio a texto exacto en español. NO agregues explicaciones, respuestas, introducciones ni comentarios. Solo escribe lo que el usuario dice en español tal cual.';
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            signal: controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }, { text: 'Transcribe el audio siguiente:' }] }],
              generationConfig: { temperature: 0.1 },
              safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }],
            }),
          }
        );
        clearTimeout(timeoutId);
        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[reprocess] STT error ${resp.status} (${model} attempt ${attempt + 1}):`, errText.substring(0, 200));
          if (resp.status === 429 || resp.status === 503) { await delay(500); continue; }
          break;
        }
        const data = await resp.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts.map((p: any) => p.text).join('').trim() || null;
        if (text) return text;
      } catch (e: any) {
        if (e?.name === 'AbortError') console.error(`[reprocess] Timeout STT (${model} attempt ${attempt + 1})`);
        else console.error(`[reprocess] STT error (${model} attempt ${attempt + 1}):`, e);
        await delay(500);
      }
    }
  }
  return null;
}

async function describeMedia(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const systemPrompt = 'Eres un analista de imágenes de un taller automotriz. Detalla brevemente y de forma muy precisa qué se ve en el contenido multimedia para que el chatbot lo entienda y pueda ayudar al cliente. Si hay texto relevante, menciónalo. Responde siempre en español.';
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            signal: controller.signal, method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }, { text: 'Describe este contenido multimedia detalladamente pensando como mecánico:' }] }],
              generationConfig: { temperature: 0.4 },
              safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }],
            }),
          }
        );
        clearTimeout(timeoutId);
        if (resp.ok) {
          const data = await resp.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p: any) => p.text).join('').trim() || null;
          if (text) return text;
        }
        const errText = await resp.text();
        console.error(`[reprocess] Vision error ${resp.status} (${model} attempt ${attempt + 1}):`, errText.substring(0, 200));
        if (resp.status === 429 || resp.status === 503) { await delay(500); continue; }
        break;
      } catch (e: any) {
        if (e?.name === 'AbortError') console.error(`[reprocess] Timeout Vision (${model} attempt ${attempt + 1})`);
        else console.error(`[reprocess] Vision error (${model} attempt ${attempt + 1}):`, e);
        await delay(500);
      }
    }
  }
  return null;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(request: NextRequest) {
  try {
    const { messageId } = await request.json();
    if (!messageId) return NextResponse.json({ error: 'messageId requerido' }, { status: 400 });

    const db = getDb();
    if (!db) return NextResponse.json({ error: 'DB no disponible' }, { status: 500 });

    const { data: msg, error: msgErr } = await db
      .from('mensajes_whatsapp')
      .select('id, from_number, body, media_url, media_type, wa_message_id, tipo')
      .eq('id', messageId)
      .single();

    if (msgErr || !msg) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });

    const fromNumber = msg.from_number;
    const waId = msg.wa_message_id || null;
    let newBody: string | null = null;

    // ── AUDIO: retranscribir ───────────────────────────────────────
    if (msg.media_type === 'audio') {
      if (!msg.media_url) return NextResponse.json({ error: 'No hay media_id para este audio' }, { status: 400 });
      console.log(`[reprocess] Retranscribiendo audio ${msg.id}...`);

      const mediaUrlResp = await fetch(`https://graph.facebook.com/v21.0/${msg.media_url}`, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      });
      if (!mediaUrlResp.ok) return NextResponse.json({ error: 'Error obteniendo URL del audio' }, { status: 502 });

      const mediaData = await mediaUrlResp.json();
      if (!mediaData.url) return NextResponse.json({ error: 'WhatsApp no devolvió URL' }, { status: 502 });

      const mediaResp = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
      if (!mediaResp.ok) return NextResponse.json({ error: 'Error descargando audio' }, { status: 502 });

      const arrayBuffer = await mediaResp.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = mediaData.mime_type || 'audio/ogg';

      const transcript = await transcribeAudio(base64Data, mimeType);
      if (!transcript) return NextResponse.json({ error: 'La transcripción volvió a fallar' }, { status: 422 });

      newBody = `${transcript} (Audio transcrito)`;
      console.log(`[reprocess] Audio transcrito: "${transcript.substring(0, 80)}"`);

    // ── IMAGE / VIDEO: redescribir ─────────────────────────────────
    } else if (msg.media_type === 'image' || msg.media_type === 'video') {
      if (!msg.media_url) return NextResponse.json({ error: `No hay media_id para ${msg.media_type}` }, { status: 400 });
      console.log(`[reprocess] Re-analizando ${msg.media_type} ${msg.id}...`);

      const mediaUrlResp = await fetch(`https://graph.facebook.com/v21.0/${msg.media_url}`, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      });
      if (!mediaUrlResp.ok) return NextResponse.json({ error: `Error obteniendo URL del ${msg.media_type}` }, { status: 502 });

      const mediaData = await mediaUrlResp.json();
      if (!mediaData.url) return NextResponse.json({ error: 'WhatsApp no devolvió URL' }, { status: 502 });

      const mediaResp = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
      if (!mediaResp.ok) return NextResponse.json({ error: `Error descargando ${msg.media_type}` }, { status: 502 });

      const arrayBuffer = await mediaResp.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = mediaData.mime_type || (msg.media_type === 'video' ? 'video/mp4' : 'image/jpeg');

      const description = await describeMedia(base64Data, mimeType);
      if (!description) return NextResponse.json({ error: `El análisis del ${msg.media_type} volvió a fallar` }, { status: 422 });

      newBody = `[${msg.media_type === 'video' ? 'Video' : 'Imagen'} enviada por el cliente. Descripción automática (analízala y respondele en base a esto): ${description}]`;
      console.log(`[reprocess] ${msg.media_type} descrito: "${description.substring(0, 80)}"`);

    // ── TEXTO: solo reprocesar con IA ──────────────────────────────
    } else {
      newBody = msg.body;
    }

    // Update the message body if it changed
    if (newBody && newBody !== msg.body) {
      await db.from('mensajes_whatsapp').update({ body: newBody }).eq('id', messageId);
    }

    // Reprocess with AI (processCoreLogic)
    console.log(`[reprocess] Ejecutando IA para ${fromNumber}...`);
    try {
      await processCoreLogic(db, fromNumber, newBody || msg.body, waId, undefined);
    } catch (e) {
      console.error(`[reprocess] Error en processCoreLogic:`, e);
      return NextResponse.json({ success: true, warning: 'Contenido procesado pero falló la respuesta de IA' }, { status: 207 });
    }

    return NextResponse.json({ success: true, message: 'Mensaje reprocesado correctamente' });
  } catch (error) {
    console.error('[reprocess] Error general:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
