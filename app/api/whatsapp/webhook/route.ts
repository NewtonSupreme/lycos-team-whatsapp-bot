import { NextRequest, NextResponse } from 'next/server';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2024';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';

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
      // const messageId = message.id;      // No utilizado
      // const timestamp = message.timestamp; // No utilizado

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
        
        // Detect location keywords for specific dual-message response
        const lowerBody = messageBody.toLowerCase();
        const isLocationRequest = lowerBody.includes('ubicacion') || 
                                 lowerBody.includes('ubicación') || 
                                 lowerBody.includes('donde') || 
                                 lowerBody.includes('dirección') || 
                                 lowerBody.includes('dirección') || 
                                 lowerBody.includes('llegar') ||
                                 lowerBody.includes('ubicado');

        if (isLocationRequest) {
          console.log('📍 Solicitud de ubicación detectada. Enviando mensajes específicos...');
          await sendWhatsAppMessage(from, "📍 *Nuestra ubicación:* Altos Mirandinos, Miranda, Venezuela. Estamos ubicados estratégicamente para atender a clientes de Los Teques, San Antonio de los Altos y Carrizal.");
          await sendWhatsAppMessage(from, "🚗 *GPS Google Maps:* https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA");
        } else {
          const aiResponse = await getAIResponse(messageBody);
          if (aiResponse) {
            await sendWhatsAppMessage(from, aiResponse);
          } else {
            console.error('❌ No se pudo generar respuesta de IA');
          }
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

async function getAIResponse(userMessage: string): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY no configurada');
      return null;
    }

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
              TU MISIÓN: Brindar atención técnica excepcional, profesional y rápida a través de WhatsApp como si fueras un asesor experto de Lycos Team.

IDENTIDAD Y VALORES:
- Expertos en soluciones automotrices de alta complejidad.
- Atención personalizada con tecnología de vanguardia.
- Transparencia total en diagnósticos y presupuestos.

SERVICIOS ESPECIALIZADOS:
- 🔧 Mecánica General Avanzada: Tren delantero, frenos (ABS/Electrónicos), suspensión, cambios de aceite y fluidos con marcas premium.
- ⚡ Electrónica Automotriz: Reparación de computadoras (ECU), módulos, cableados y sistemas eléctricos complejos.
- 🔑 Cerrajería Automotriz Pro: Programación de llaves con chip, duplicados, reparación de switchs y sistemas de seguridad.
- 💻 Diagnóstico Computarizado: Escaneo completo con equipos de nivel concesionario (lectura y borrado de fallas, programación de módulos).
- ⚙️ Reparación de Motores: Overhaul completo, reconstrucción y optimización de rendimiento.
- 🚨 Asistencia de Emergencia 24/7: Auxilio vial y diagnóstico en sitio en los Altos Mirandinos.

INFORMACIÓN DE CONTACTO:
- 📱 WhatsApp/Teléfono: +58 412-334-3519
- 📧 Email: lycosteam7@gmail.com
- 📍 Ubicación: Altos Mirandinos, Miranda, Venezuela (Cerca de Los Teques, San Antonio y Carrizal).
- 📅 Horario: Lunes a Viernes 8:00 AM - 6:00 PM, Sábados 8:00 AM - 2:00 PM.

INSTRUCCIONES CLAVE:
1. Responde SIEMPRE en español de Venezuela (amigable pero muy profesional).
2. Usa emojis estratégicamente para resaltar puntos clave (🔧, 🚗, ⚡, 📍).
3. Ofrece SIEMPRE una revisión o diagnóstico cuando el cliente presente una falla.
4. Si preguntan por la ubicación, menciónales que estamos en los Altos Mirandinos (el sistema enviará el enlace GPS automáticamente).
5. Mantén las respuestas potentes y directas (máximo 4 líneas por mensaje).
6. Prioriza la seguridad y la confianza del cliente en cada recomendación.`
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
    console.log(`✅ Mensaje enviado exitosamente. ID: ${data.messages?.[0]?.id}`);
  } catch (error) {
    console.error('❌ Error en sendWhatsAppMessage:', error);
  }
}
