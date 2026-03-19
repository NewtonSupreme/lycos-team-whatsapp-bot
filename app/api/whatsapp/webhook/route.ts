import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── LYCOS TEAM KNOWLEDGE BASE ───────────────────────────────────────────────
const LYCOS_KNOWLEDGE = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team, un taller automotriz en San Antonio de los Altos, Miranda, Venezuela.
NUNCA digas que eres una IA, un bot, ChatGPT o robot. Si preguntan, di que eres el asistente del taller.
Si necesitas transferir a un asesor, di "voy a comunicarte con uno de nuestros asesores" y da: +58 412-334-3519

HORARIO: Lunes a Sábado de 8:00 AM a 5:00 PM.
DOMINGOS: Cerrado. No se atienden emergencias los domingos ni fuera del horario.

UBICACIÓN: San Antonio de los Altos, Altos Mirandinos, Miranda.
- Al pedir ubicación: envía el mapa y menciona "Síguenos en Instagram @lycos.team para tips y novedades 📸"
- Google Maps: https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA
- Cómo llegar (video): https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==

REDES SOCIALES:
- Instagram: @lycos.team
- TikTok: @lycos.team

SERVICIOS (presentar en categorías, no como lista larga):

🔧 Mecánica y Frenos:
Mecánica ligera, frenos (pastillas, liga, cilindros, freno de mano, rectificación de disco/tambores), alineación, balanceo, rotación, monturas y reparación de cauchos, limpieza de inyectores.

🚗 Sistemas del Vehículo:
Aire acondicionado, frenos, refrigeración, dirección, motor, luces, escape, suspensión, transmisión y autotronica.

🏎️ Silenciadores y Escape (precio en divisas, instalación incluida):
- CL27 / CL30: hasta 1.3L → $40 c/u
- CL40: hasta 1.5L → $50
- CLH40: 1.6L a 3.7L → $60
- CL60: desde 3.8L → $90
- CLC60 (camión) / CLCP60 (platanero) → $90 c/u
- Resonador → $40 | Flexibles → $40
- Colas cromadas disponibles
NOTA: Los presupuestos son válidos por 2 días. Pide marca, modelo y cilindraje para recomendar el modelo correcto.

🚿 Estética: Autolavado, pulitura de faros, latonería y pintura, papel ahumado, cámaras 360.

🔌 Electrónica: Elevavidrios manuales/electrónicos. OBD II: se asigna escáner según disponibilidad al confirmar cita.

🚛 Otros: Servicio de grúa (preguntar al asesor), inventario de repuestos, renovación de RCV.

💳 CASHEA (pago en cuotas):
- Se cobra IVA adicional del 16% con Cashea.
- PRIMERO pregunta el nivel del cliente, LUEGO informa el porcentaje de inicial:
  * Nivel 1: 60% inicial | Nivel 2: 50% | Niveles 3-6: 40%
- El resto se paga en 3 cuotas cada 14 días.
- Para datos bancarios y formas de pago: "te atendemos en caja o escríbenos al asesor"

📅 AGENDAR CITAS - pedir siempre:
1. Nombre completo
2. Vehículo (marca, modelo, año)
3. Servicio requerido
4. Día y hora preferida (L-S, 8AM-5PM)

COMPORTAMIENTO:
- Español venezolano, amigable y profesional.
- Usa emojis con moderación 🔧🚗💳.
- Máximo 4-5 líneas por respuesta.
- No improvises precios no listados arriba.
- Si no sabes algo, di "déjame consultarlo con el equipo" y da el número.
`;

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado correctamente');
    return new NextResponse(challenge, { status: 200 });
  }
  console.error('❌ Verificación de webhook fallida:', { mode, token, esperado: VERIFY_TOKEN });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: Receive messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📥 Webhook recibido:', JSON.stringify(body).substring(0, 300));

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) {
      console.log('⚠️ No hay mensajes en el webhook');
      return NextResponse.json({ status: 'no_messages' });
    }

    for (const message of value.messages) {
      const from = message.from;
      const wa_message_id = message.id;

      // 0. Deduplication — safe approach without .single()
      const db = getSupabase();
      if (db && wa_message_id) {
        try {
          const { data: rows } = await db
            .from('mensajes_whatsapp')
            .select('id')
            .eq('wa_message_id', wa_message_id)
            .limit(1);
          if (rows && rows.length > 0) {
            console.log(`⏭️ Mensaje duplicado (${wa_message_id}), ignorando.`);
            continue;
          }
        } catch (e) {
          console.error('Error en deduplicación:', e);
          // Don't skip — continue processing even if dedup check fails
        }
      }

      // Parse message content
      let messageBody = '';
      if (message.type === 'text') {
        messageBody = message.text?.body || '';
      } else if (message.type === 'image') {
        messageBody = '[El cliente envió una imagen]';
      } else if (message.type === 'audio') {
        messageBody = '[El cliente envió un audio]';
      } else if (message.type === 'document') {
        messageBody = '[El cliente envió un documento]';
      } else if (message.type === 'location') {
        const loc = message.location;
        messageBody = `[El cliente compartió su ubicación: lat ${loc?.latitude}, lng ${loc?.longitude}]`;
      }

      if (!messageBody) {
        console.log(`⚠️ Tipo de mensaje no soportado: ${message.type}`);
        continue;
      }

      console.log(`📩 Mensaje de ${from}: ${messageBody.substring(0, 80)}`);

      // 1. Save incoming message (non-blocking)
      if (db) {
        db.from('mensajes_whatsapp').insert({
          from_number: from,
          to_number: 'system',
          body: messageBody,
          tipo: 'entrante',
          wa_message_id: wa_message_id,
        }).then(() => {
          console.log('💾 Mensaje entrante guardado');
        }).catch((e: unknown) => {
          console.error('Error guardando mensaje entrante:', e);
        });
      }

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        console.error('❌ Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID');
        continue;
      }

      // 2. Fetch conversation history for context (last 10 messages)
      let conversationHistory: { role: string; parts: { text: string }[] }[] = [];
      if (db) {
        try {
          const { data: historyData } = await db
            .from('mensajes_whatsapp')
            .select('body, tipo, created_at')
            .or(`from_number.eq.${from},to_number.eq.${from}`)
            .order('created_at', { ascending: false })
            .limit(11); // 11 to account for current message still being inserted

          if (historyData && historyData.length > 0) {
            // Filter out the just-inserted message and reverse to chronological
            const filtered = historyData
              .filter(m => m.body !== messageBody || m.tipo !== 'entrante')
              .slice(0, 10)
              .reverse();
            conversationHistory = filtered.map(msg => ({
              role: msg.tipo === 'entrante' ? 'user' : 'model',
              parts: [{ text: msg.body }],
            }));
            console.log(`🧠 Historial cargado: ${conversationHistory.length} mensajes`);
          }
        } catch (e) {
          console.error('Error cargando historial:', e);
        }
      }

      // 3. Check client stored data
      let clienteData = '';
      if (db) {
        try {
          const { data: convRows } = await db
            .from('conversaciones')
            .select('datos_cliente')
            .eq('telefono', from)
            .limit(1);
          const conv = convRows?.[0];
          if (conv?.datos_cliente && Object.keys(conv.datos_cliente).length > 0) {
            clienteData = `\nDATO DEL CLIENTE YA REGISTRADO: ${JSON.stringify(conv.datos_cliente)}`;
          }
        } catch (e) {
          console.error('Error cargando datos del cliente:', e);
        }
      }

      // 4. Session freshness check (no greeting if < 12h)
      let isNewSession = true;
      if (db) {
        try {
          const { data: convRows } = await db
            .from('conversaciones')
            .select('ultimo_mensaje_at')
            .eq('telefono', from)
            .limit(1);
          const conv = convRows?.[0];
          if (conv?.ultimo_mensaje_at) {
            const hoursDiff = (Date.now() - new Date(conv.ultimo_mensaje_at).getTime()) / 3600000;
            if (hoursDiff < 12) isNewSession = false;
          }
        } catch (e) {
          console.error('Error verificando sesión:', e);
        }
      }

      // 5. Location keyword detection
      const lowerBody = messageBody.toLowerCase();
      const isLocationRequest =
        lowerBody.includes('ubicacion') || lowerBody.includes('ubicación') ||
        lowerBody.includes('donde') || lowerBody.includes('dirección') ||
        lowerBody.includes('llegar') || lowerBody.includes('ubicado') ||
        lowerBody.includes('gps') || lowerBody.includes('mapa');

      if (isLocationRequest) {
        console.log('📍 Solicitud de ubicación detectada');
        await sendWhatsAppMessage(from,
          '📍 *Estamos en San Antonio de los Altos, Miranda.*\nTe mando el mapa y un video de cómo llegar 👇'
        );
        await delay(700);
        await sendWhatsAppMessage(from, 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(600);
        await sendWhatsAppMessage(from, 'https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(500);
        await sendWhatsAppMessage(from, '¡Y síguenos en Instagram @lycos.team para más novedades! 📸');
      } else {
        // 6. Get AI response
        console.log('🤖 Generando respuesta con Gemini...');
        const aiResponse = await getAIResponse(
          messageBody, conversationHistory, isNewSession, clienteData
        );
        if (aiResponse) {
          const hasUrl = /https?:\/\//.test(aiResponse);
          await sendWhatsAppMessage(from, aiResponse, hasUrl);
        } else {
          console.error('❌ No se pudo generar respuesta de IA');
        }
      }

      // 7. Update conversation state (non-blocking)
      if (db) {
        const extractedData = extractClientData(messageBody);
        db.from('conversaciones').upsert({
          telefono: from,
          ultimo_mensaje: messageBody.substring(0, 100),
          ultimo_mensaje_at: new Date().toISOString(),
          ...(Object.keys(extractedData).length > 0 ? { datos_cliente: extractedData } : {}),
        }, { onConflict: 'telefono' }).then(() => {
          console.log('💾 Conversación actualizada');
        }).catch((e: unknown) => {
          console.error('Error actualizando conversación:', e);
        });
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Error en webhook:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractClientData(message: string): Record<string, string> {
  const data: Record<string, string> = {};

  const nameMatch = message.match(/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{1,25})/i);
  if (nameMatch) data.nombre = nameMatch[1].trim();

  const yearMatch = message.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (yearMatch) data.anio = yearMatch[1];

  return data;
}

async function getAIResponse(
  userMessage: string,
  conversationHistory: { role: string; parts: { text: string }[] }[],
  isNewSession: boolean,
  clienteData: string
): Promise<string | null> {
  try {
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY no configurado');
      return null;
    }

    const vzlaTime = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());

    const systemPrompt = `${LYCOS_KNOWLEDGE}

FECHA/HORA VENEZUELA: ${vzlaTime}
SESIÓN: ${isNewSession ? 'NUEVA - puedes saludar brevemente' : 'CONTINUA - ve directo al tema, no repitas saludos'}
${clienteData}

Analiza el historial antes de responder. Recuerda lo que el cliente ya mencionó para no volver a pedirlo.`;

    const contents = [
      ...conversationHistory,
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 600,
            topK: 40,
            topP: 0.95,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error Gemini API:', response.status, errorText.substring(0, 200));
      return null;
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (aiText) {
      console.log(`✅ Respuesta generada: "${aiText.substring(0, 80)}..."`);
    } else {
      console.error('❌ Gemini no devolvió texto:', JSON.stringify(data).substring(0, 300));
    }

    return aiText;
  } catch (error) {
    console.error('❌ Error en getAIResponse:', error);
    return null;
  }
}

async function sendWhatsAppMessage(
  to: string,
  text: string,
  previewUrl = false
): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.error('❌ WhatsApp no configurado: faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID');
    return;
  }

  try {
    console.log(`📤 Enviando mensaje a ${to}: "${text.substring(0, 60)}..."`);
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/[^0-9]/g, ''),
          type: 'text',
          text: { preview_url: previewUrl, body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error enviando mensaje de WhatsApp:', JSON.stringify(errorData));
      return;
    }

    const data = await response.json();
    const wa_message_id = data.messages?.[0]?.id;
    console.log(`✅ Mensaje enviado. ID: ${wa_message_id}`);

    // Save outgoing (non-blocking)
    const db = getSupabase();
    if (db) {
      db.from('mensajes_whatsapp').insert({
        from_number: 'system',
        to_number: to,
        body: text,
        tipo: 'saliente',
        wa_message_id: wa_message_id,
        es_ia: true,
      }).catch((e: unknown) => {
        console.error('Error guardando mensaje saliente:', e);
      });
    }
  } catch (error) {
    console.error('❌ Error en sendWhatsAppMessage:', error);
  }
}
