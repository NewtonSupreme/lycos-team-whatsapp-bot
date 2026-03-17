import { NextRequest, NextResponse } from 'next/server';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2024';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';

import { fetchConversacion, upsertConversacion, checkMensajeDuplicado, saveMensaje } from '@/lib/supabase';

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

  console.error('❌ Webhook verification failed:', { mode, token, expectedToken: VERIFY_TOKEN });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: Receive messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📥 Webhook recibido:', JSON.stringify(body, null, 2));

    if (body.object !== 'whatsapp_business_account') {
      console.log('⚠️ Objeto no es whatsapp_business_account, ignorando');
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

      // 0. Deduplication Check
      if (wa_message_id) {
        try {
          const isDuplicate = await checkMensajeDuplicado(wa_message_id);
          if (isDuplicate) {
            console.log(`⏭️ Mensaje duplicado detectado (${wa_message_id}), ignorando.`);
            continue;
          }
        } catch (e) {
          console.error('Error checking for duplicate message:', e);
        }
      }

      let messageBody = '';
      if (message.type === 'text') {
        messageBody = message.text?.body || '';
      } else if (message.type === 'image') {
        messageBody = '[Imagen recibida]';
      } else if (message.type === 'audio') {
        messageBody = '[Audio recibido]';
      } else if (message.type === 'document') {
        messageBody = '[Documento recibido]';
      }

      console.log(`📩 Mensaje de ${from}: ${messageBody}`);

      // Auto-reply with IA
      if (messageBody && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        console.log('🔄 Procesando respuesta...');
        
        // 1. Save incoming message
        try {
          await saveMensaje({
            from_number: from,
            to_number: 'system',
            body: messageBody,
            tipo: 'entrante',
            wa_message_id: wa_message_id
          });
        } catch (e) {
          console.error('Error saving incoming message:', e);
        }

        // 2. Conversation State Management
        let isNewSession = true;
        try {
          const conv = await fetchConversacion(from);
          if (conv && conv.ultimo_mensaje_at) {
            const lastMsgDate = new Date(conv.ultimo_mensaje_at);
            const now = new Date();
            const hoursDiff = (now.getTime() - lastMsgDate.getTime()) / (1000 * 60 * 60);
            
            // If less than 12 hours, don't greet as if first time
            if (hoursDiff < 12) {
              isNewSession = false;
            }
          }
        } catch (e) {
          console.error('Error fetching conversation state:', e);
        }

        // Detect location keywords for specific dual-message response
        const lowerBody = messageBody.toLowerCase();
        const isLocationRequest = lowerBody.includes('ubicacion') || 
                                 lowerBody.includes('ubicación') || 
                                 lowerBody.includes('donde') || 
                                 lowerBody.includes('dirección') || 
                                 lowerBody.includes('llegar') ||
                                 lowerBody.includes('ubicado');

        if (isLocationRequest) {
          console.log('📍 Solicitud de ubicación detectada. Enviando mensajes específicos...');
          await sendWhatsAppMessage(from, "📍 *Nuestra ubicación:* Altos Mirandinos, Miranda, Venezuela. Estamos ubicados estratégicamente para atender a clientes de Los Teques, San Antonio de los Altos y Carrizal.");
          await sendWhatsAppMessage(from, "https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA");
        } else {
          const aiResponse = await getAIResponse(messageBody, isNewSession);
          if (aiResponse) {
            await sendWhatsAppMessage(from, aiResponse);
          } else {
            console.error('❌ No se pudo generar respuesta de IA');
          }
        }

        // Update conversation state
        try {
          await upsertConversacion({
            telefono: from,
            ultimo_mensaje: messageBody.substring(0, 100),
            ultimo_mensaje_at: new Date().toISOString()
          });
        } catch (e) {
          console.error('Error updating conversation state:', e);
        }
      } else {
        console.error('❌ Configuración incompleta:', {
          hasMessage: !!messageBody,
          hasToken: !!WHATSAPP_TOKEN,
          hasPhoneId: !!WHATSAPP_PHONE_ID
        });
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function getAIResponse(userMessage: string, isNewSession: boolean = true): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY no configurada');
      return null;
    }

    // Current time in Venezuela (UTC-4)
    const vzlaTime = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(new Date());

    console.log(`🤖 Consultando Gemini para: "${userMessage.substring(0, 50)}..."`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: `Eres el asistente virtual oficial de Lycos Team, el taller automotriz líder en los Altos Mirandinos, Venezuela. 
TU MISIÓN: Brindar atención técnica excepcional, profesional y rápida.

CONTEXTO TEMPORAL ACTUAL:
- Fecha y Hora en Venezuela: ${vzlaTime}
- IMPORTANTE: Usa esta fecha para ser preciso con las citas y el día de hoy.

VALORES Y TONO:
- Eres un asesor experto de Lycos Team.
- Sé amigable pero muy profesional.
- Usa emojis estratégicamente (🔧, 🚗, ⚡, 📍).

GREETING LOGIC:
- SESSION STATUS: ${isNewSession ? 'NUEVA INTERACCIÓN' : 'CONVERSACIÓN CONTINUA'}.
- Si es una NUEVA INTERACCIÓN, puedes saludar cordialmente ("¡Hola!", "Saludos").
- Si es una CONVERSACIÓN CONTINUA, ve DIRECTAMENTE al grano, responde la duda sin volver a saludar o decir "hola" de nuevo, a menos que el usuario te salude primero.

SERVICIOS ESPECIALIZADOS:
- 🔧 Mecánica General Avanzada: Frenos, suspensión, cambios de aceite premium.
- ⚡ Electrónica Automotriz: Reparación de ECUs, módulos y sistemas eléctricos.
- 🔑 Cerrajería Automotriz Pro: Programación de llaves chip, duplicados.
- 💻 Diagnóstico Computarizado: Escaneo nivel concesionario.
- ⚙️ Reparación de Motores: Overhaul completo.
- 🚨 Asistencia de Emergencia 24/7 en Altos Mirandinos.

AGENTAMIENTO DE CITAS:
- Si el cliente quiere agendar una cita, DEBES solicitar:
  1. Nombre completo.
  2. Vehículo (Marca, Modelo, Año).
  3. Falla o Servicio que requiere.
  4. Día y hora de preferencia (considerando que cerramos a las 6pm).
- Responde que una vez recibidos los datos, el técnico confirmará la disponibilidad.

INFORMACIÓN DE CONTACTO:
- 📱 WhatsApp: +58 412-334-3519
- 📍 Altos Mirandinos (Cerca de Los Teques, San Antonio y Carrizal).
- 📅 Horario: Lun-Vie 8am-6pm, Sáb 8am-2pm.

REGLAS DE ORO:
1. Responde siempre en español de Venezuela.
2. Si preguntan por la ubicación, menciona los Altos Mirandinos (el sistema enviará el link GPS solo).
3. Máximo 4 líneas por mensaje.
4. Jamás ignores un "Hola", pero no abuses de los saludos si ya estás hablando.`
            }]
          },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
            topK: 40,
            topP: 0.95
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
      console.error('❌ Error de Gemini API:', errorText);
      return null;
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (aiText) {
      console.log(`✅ Respuesta de Gemini generada: "${aiText.substring(0, 50)}..."`);
    } else {
      console.error('❌ Gemini no devolvió texto en la respuesta');
    }

    return aiText;
  } catch (error) {
    console.error('❌ Error en getAIResponse:', error);
    return null;
  }
}

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.error('❌ WhatsApp no configurado: faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID');
    return;
  }

  try {
    console.log(`📤 Enviando mensaje a ${to}...`);
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Error enviando mensaje WhatsApp:', error);
      return;
    }

    const data = await response.json();
    const wa_message_id = data.messages?.[0]?.id;
    console.log(`✅ Mensaje enviado exitosamente. ID: ${wa_message_id}`);

    // Save outgoing message to DB
    try {
      await saveMensaje({
        from_number: 'system',
        to_number: to,
        body: text,
        tipo: 'saliente',
        wa_message_id: wa_message_id,
        es_ia: true
      });
    } catch (e) {
      console.error('Error saving outgoing message:', e);
    }
  } catch (error) {
    console.error('❌ Error en sendWhatsAppMessage:', error);
  }
}
