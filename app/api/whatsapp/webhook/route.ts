import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Use anon key server-side (RLS policies are open for webhook tables)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ─── LYCOS TEAM BUSINESS KNOWLEDGE BASE ─────────────────────────────────────
const LYCOS_KNOWLEDGE = `
IDENTIDAD:
- Eres el asistente virtual de Lycos Team, un taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
- Tu nombre es "Asistente de Lycos Team". JAMÁS digas que eres una IA, un bot, o ChatGPT. Si te preguntan, di que eres el asistente del taller.
- Si necesitas transferir a un asesor humano, di "voy a comunicarte con uno de nuestros asesores" y da el número: +58 412-334-3519

HORARIO:
- Lunes a Sábado: 8:00 AM a 5:00 PM
- DOMINGOS: Cerrado. No hay emergencias los domingos bajo ninguna circunstancia.
- No hay servicio de emergencias fuera del horario laboral.

UBICACIÓN:
- San Antonio de los Altos, Miranda, Venezuela (Altos Mirandinos)
- Google Maps: https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA
- Cuando pidan ubicación, SIEMPRE añade: "También puedes seguirnos en Instagram @lycos.team para más información 📸"
- Video de cómo llegar (Instagram Reel): https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==

REDES SOCIALES:
- Instagram: @lycos.team → https://www.instagram.com/lycos.team
- TikTok: @lycos.team
- Menciona las redes en el momento adecuado, especialmente al dar la ubicación.

SERVICIOS POR CATEGORÍA:

🔧 MECÁNICA LIGERA Y FRENOS:
- Mecánica ligera general
- Frenos: cambio de liga y pastilla, reparación de freno de mano, reparación de cilindro, rectificación de disco y tambores
- Balanceo, rotación y monturas de cauchos
- Reparación de cauchos
- Alineación
- Limpieza de inyectores

🚗 SISTEMAS DEL VEHÍCULO:
- Sistema de aire acondicionado
- Sistema de frenos completo
- Sistema de refrigeración
- Sistema de dirección
- Sistemas del motor
- Sistema de luces
- Sistema de escape
- Sistema de suspensión
- Sistema de transmisión
- Autotronica (sistema electrónico automotriz)

🏎️ SILENCIADORES Y ESCAPE (precios en divisas con instalación incluida):
- CL27: hasta 1.3L → $40
- CL30: hasta 1.3L → $40
- CL40: hasta 1.5L → $50
- CLH40: desde 1.6L hasta 3.7L → $60
- CL60: desde 3.8L en adelante → $90
- CLC60: silenciador para camión → $90
- CLCP60: silenciador platanero → $90
- Resonador → $40
- Flexibles → $40
- Colas cromadas para silenciadores (disponibles)
Cuando pregunten por silenciador, pide marca, modelo y año del vehículo para recomendar el modelo correcto.
Los presupuestos de silenciadores son válidos por 2 días.

🚿 ESTÉTICA Y CARROCERÍA:
- Autolavado
- Pulitura de faros
- Latonería y pintura
- Papel ahumado
- Sistema de cámaras 360

🔌 ELECTRÓNICA Y TECNOLOGÍA:
- Reparación y mantenimiento de elevavidrios manuales y electrónicos
- Diagnóstico OBD II (el escáner se asigna según disponibilidad al momento de la cita)

🚛 OTROS SERVICIOS:
- Servicio de grúa: comunicarse al número del taller
- Inventario de repuestos
- Renovación de RCV (seguro)

💳 MÉTODO DE PAGO - CASHEA:
- Lycos Team acepta Cashea (fintech de pago en cuotas)
- Con Cashea pagas un porcentaje inicial y el resto en 3 cuotas cada 14 días
- Niveles y porcentaje de inicial:
  * Nivel 1 → paga el 60% de inicial
  * Nivel 2 → paga el 50% de inicial
  * Niveles 3, 4, 5 y 6 → pagan el 40% de inicial
- IMPORTANTE: Al usar Cashea se cobra el IVA adicional del 16%
- Cuando alguien pregunte por Cashea, PRIMERO pregunta su nivel de Cashea
- Cuando alguien pida datos bancarios o formas de pago, dile: "Para más información sobre métodos de pago y datos, te atendemos directamente en caja"

📅 AGENDAR CITAS:
Para agendar, solicita siempre:
1. Nombre completo del cliente
2. Vehículo (marca, modelo, año, cilindraje si aplica)
3. Servicio que requiere
4. Día y hora preferida (dentro del horario: L-S, 8AM-5PM)
Los datos van a nuestro equipo para confirmar disponibilidad.

REGLAS DE COMPORTAMIENTO:
- Habla siempre en español venezolano, amigable y profesional
- Usa emojis con moderación (🔧🚗💳📍)
- Máximo 4-5 líneas por mensaje, sé conciso
- Nunca improvises precios que no están en este documento
- Si no sabes algo, di "déjame consultar con nuestro equipo" y da el número de contacto
- Nunca trabajes domingos ni emergencias nocturnas
- Los presupuestos son orientativos, la revisión in situ puede variar el precio
`;

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: Receive messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) {
      return NextResponse.json({ status: 'no_messages' });
    }

    for (const message of value.messages) {
      const from = message.from;
      const wa_message_id = message.id;

      // 0. Deduplication check
      if (wa_message_id) {
        try {
          const { data: existing } = await supabase
            .from('mensajes_whatsapp')
            .select('id')
            .eq('wa_message_id', wa_message_id)
            .single();
          if (existing) {
            console.log(`⏭️ Duplicate message (${wa_message_id}), skipping.`);
            continue;
          }
        } catch { /* ignore */ }
      }

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
        messageBody = `[El cliente compartió su ubicación: ${loc?.latitude}, ${loc?.longitude}]`;
      }

      if (!messageBody) continue;

      console.log(`📩 Mensaje de ${from}: ${messageBody.substring(0, 80)}`);

      // 1. Save incoming message
      try {
        await supabase.from('mensajes_whatsapp').insert({
          from_number: from,
          to_number: 'lycos_team',
          body: messageBody,
          tipo: 'entrante',
          wa_message_id: wa_message_id,
        });
      } catch (e) {
        console.error('Error saving incoming message:', e);
      }

      if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        // 2. Fetch last 12 messages for this phone (conversation memory)
        let conversationHistory: { role: string; parts: { text: string }[] }[] = [];
        try {
          const { data: historyData } = await supabase
            .from('mensajes_whatsapp')
            .select('body, tipo, created_at')
            .or(`from_number.eq.${from},to_number.eq.${from}`)
            .order('created_at', { ascending: false })
            .limit(12);

          if (historyData && historyData.length > 0) {
            // Reverse to chronological order, excluding the very last message (current one)
            const reversed = historyData.reverse();
            conversationHistory = reversed.slice(0, reversed.length - 1).map(msg => ({
              role: msg.tipo === 'entrante' ? 'user' : 'model',
              parts: [{ text: msg.body }]
            }));
          }
        } catch (e) {
          console.error('Error fetching conversation history:', e);
        }

        // 3. Fetch stored client data for this phone (name, vehicle, etc.)
        let clienteData = '';
        try {
          const { data: conv } = await supabase
            .from('conversaciones')
            .select('datos_cliente')
            .eq('telefono', from)
            .single();
          if (conv?.datos_cliente && Object.keys(conv.datos_cliente).length > 0) {
            clienteData = `\nDATO DEL CLIENTE YA CONOCIDOS:\n${JSON.stringify(conv.datos_cliente, null, 2)}`;
          }
        } catch { /* ignore */ }

        // 4. Session freshness check
        let isNewSession = true;
        try {
          const { data: conv } = await supabase
            .from('conversaciones')
            .select('ultimo_mensaje_at')
            .eq('telefono', from)
            .single();
          if (conv?.ultimo_mensaje_at) {
            const hoursDiff = (Date.now() - new Date(conv.ultimo_mensaje_at).getTime()) / 3600000;
            if (hoursDiff < 12) isNewSession = false;
          }
        } catch { /* ignore */ }

        // 5. Location keyword detection
        const lowerBody = messageBody.toLowerCase();
        const isLocationRequest =
          lowerBody.includes('ubicacion') || lowerBody.includes('ubicación') ||
          lowerBody.includes('donde') || lowerBody.includes('dirección') ||
          lowerBody.includes('llegar') || lowerBody.includes('ubicado') ||
          lowerBody.includes('gps') || lowerBody.includes('mapa');

        if (isLocationRequest) {
          console.log('📍 Location request detected');
          await sendWhatsAppMessage(from,
            '📍 *Estamos en San Antonio de los Altos, Miranda, Venezuela.*\nTe comparto nuestra ubicación en Google Maps y un video de cómo llegar 👇'
          );
          await new Promise(r => setTimeout(r, 800));
          await sendWhatsAppMessage(from, 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA');
          await new Promise(r => setTimeout(r, 600));
          await sendWhatsAppMessage(from, 'https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==');
          await new Promise(r => setTimeout(r, 400));
          await sendWhatsAppMessage(from, '¡Síguenos también en Instagram @lycos.team para más tips y novedades! 📸');
        } else {
          // 6. Get AI response with full context
          const aiResponse = await getAIResponse(
            messageBody,
            conversationHistory,
            isNewSession,
            clienteData
          );
          if (aiResponse) {
            // Check if AI response includes a URL for link preview
            const hasUrl = /https?:\/\//.test(aiResponse);
            await sendWhatsAppMessage(from, aiResponse, hasUrl);
          }
        }

        // 7. Update conversation state + extract client data from message
        try {
          const currentConv = await supabase
            .from('conversaciones')
            .select('datos_cliente')
            .eq('telefono', from)
            .single();

          const existingData = currentConv.data?.datos_cliente || {};
          const updatedData = extractClientData(messageBody, existingData);

          await supabase.from('conversaciones').upsert({
            telefono: from,
            ultimo_mensaje: messageBody.substring(0, 100),
            ultimo_mensaje_at: new Date().toISOString(),
            datos_cliente: updatedData,
          }, { onConflict: 'telefono' });
        } catch (e) {
          console.error('Error updating conversation:', e);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Extract client data from messages ──────────────────────────────────────
function extractClientData(
  message: string,
  existing: Record<string, string>
): Record<string, string> {
  const data = { ...existing };
  const lower = message.toLowerCase();

  // Detect name patterns: "soy Juan", "me llamo Maria", "mi nombre es Pedro"
  const nameMatch = message.match(/(?:soy|me llamo|mi nombre es|llamo)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{1,30})/i);
  if (nameMatch && !data.nombre) {
    data.nombre = nameMatch[1].trim();
  }

  // Detect vehicle: e.g., "tengo un Corsa", "mi Civic 2019"
  const vehicleMatch = message.match(/(?:tengo(?: un| una)?|mi)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s0-9]{2,25})/i);
  if (vehicleMatch && !data.vehiculo && !lower.includes('problema') && !lower.includes('servicio')) {
    data.vehiculo = vehicleMatch[1].trim();
  }

  // Detect year
  const yearMatch = message.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (yearMatch && !data.anio) {
    data.anio = yearMatch[1];
  }

  return data;
}

// ─── AI Response with conversation history ──────────────────────────────────
async function getAIResponse(
  userMessage: string,
  conversationHistory: { role: string; parts: { text: string }[] }[],
  isNewSession: boolean,
  clienteData: string
): Promise<string | null> {
  try {
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not set');
      return null;
    }

    const vzlaTime = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());

    const systemPrompt = `${LYCOS_KNOWLEDGE}

FECHA Y HORA ACTUAL EN VENEZUELA: ${vzlaTime}
TIPO DE SESIÓN: ${isNewSession ? 'NUEVA (puedes saludar brevemente)' : 'CONTINUA (no repitas saludos, ve al grano)'}
${clienteData}

INSTRUCCIONES ADICIONALES:
- Analiza el historial de la conversación antes de responder.
- Recuerda lo que el cliente ya mencionó (nombre, vehículo, servicio) para no volver a preguntarlo.
- Sé natural, como si fueras un asesor humano real del taller.
- Si el cliente pregunta por silenciadores, primero pide la marca, modelo y cilindraje si no los ha dado.
- Si el cliente quiere pagar con Cashea, pregunta su nivel ANTES de dar el precio con IVA.
- Si el cliente pide datos bancarios, redirigelo a caja: "Para los datos de pago, te atendemos en caja o escríbenos al +58 412-334-3519"`;

    // Build contents array with history + current message
    const contents = [
      ...conversationHistory,
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      console.error('❌ Gemini API error:', errorText);
      return null;
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (aiText) {
      console.log(`✅ Gemini response: "${aiText.substring(0, 60)}..."`);
    }

    return aiText;
  } catch (error) {
    console.error('❌ Error in getAIResponse:', error);
    return null;
  }
}

// ─── Send WhatsApp Message ───────────────────────────────────────────────────
async function sendWhatsAppMessage(
  to: string,
  text: string,
  previewUrl: boolean = false
): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.error('❌ WhatsApp not configured');
    return;
  }

  try {
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
      const error = await response.json();
      console.error('❌ Error sending WhatsApp message:', error);
      return;
    }

    const data = await response.json();
    const wa_message_id = data.messages?.[0]?.id;
    console.log(`✅ Message sent. ID: ${wa_message_id}`);

    // Save outgoing message
    try {
      await supabase.from('mensajes_whatsapp').insert({
        from_number: 'lycos_team',
        to_number: to,
        body: text,
        tipo: 'saliente',
        wa_message_id: wa_message_id,
        es_ia: true,
      });
    } catch (e) {
      console.error('Error saving outgoing message:', e);
    }
  } catch (error) {
    console.error('❌ Error in sendWhatsAppMessage:', error);
  }
}
