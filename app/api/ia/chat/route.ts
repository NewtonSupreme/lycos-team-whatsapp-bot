import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `Eres el asistente virtual oficial de Lycos Team, el taller automotriz líder en los Altos Mirandinos, Venezuela. 
TU MISIÓN: Brindar asesoría técnica experta, profesional y eficiente.

SOBRE LYCOS TEAM:
- Especialidades: Mecánica General Avanzada, Electrónica Automotriz (ECU/Módulos), Cerrajería Automotriz con chip, Diagnóstico Computarizado nivel concesionario, Reparación integral de motores y Asistencia de Emergencia 24/7.
- Identidad: Somos sinónimo de tecnología avanzada, precisión y atención personalizada de alta calidad.
- Ubicación: Altos Mirandinos, Miranda, Venezuela. (GPS: https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA)
- Horario: Lunes a Viernes 8:00 AM - 6:00 PM, Sábados 8:00 AM - 2:00 PM.
- Contacto: +58 412-334-3519 | lycosteam7@gmail.com

PERSONALIDAD:
- Asesor experto, profesional, directo y muy confiable.
- Tono experto pero cercano.
- Usa emojis de forma profesional (🔧, ⚡, 🚗).
- Ofrece proactivamente diagnósticos y citas.
- Prioriza la seguridad del vehículo y del cliente.
- Responde siempre en español de forma estructurada y clara.`;

export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Return intelligent fallback without API key
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    // Format messages for Gemini
    const geminiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt || SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json({ response: 'Lo siento, no pude procesar tu consulta. Por favor contacta al taller directamente al +58 412-334-3519.' });
    }

    return NextResponse.json({ response: text });
  } catch (error) {
    console.error('IA chat error:', error);
    return NextResponse.json({ response: generateFallbackResponse('') }, { status: 200 });
  }
}

function generateFallbackResponse(userMsg: string): string {
  const lower = userMsg.toLowerCase();

  if (lower.includes('servicio') || lower.includes('ofrec') || lower.includes('hacen')) {
    return '🔧 En **Lycos Team** ofrecemos:\n\n• **Mecánica General** — Frenos, suspensión, aceite\n• **Electrónica Automotriz** — Diagnóstico de fallas\n• **Cerrajería Automotriz** — Llaves con chip\n• **Diagnóstico Computarizado** — Escaneo OBD2\n• **Reparación de Motores** — Overhaul completo\n• **Asistencia de Emergencia** — 24/7\n\n¿Le gustaría agendar una cita o tiene alguna consulta específica? 😊';
  }

  if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuánto') || lower.includes('cuanto')) {
    return '💰 Nuestros precios orientativos:\n\n• Cambio aceite sintético: $25-40\n• Diagnóstico computarizado: $30-50\n• Revisión de frenos: $35-80\n• Cerrajería (llave chip): $60-120\n• Emergencia: Consultar\n\n Para una cotización exacta, necesitamos inspeccionar su vehículo. ¿Le agendamos una revisión?';
  }

  if (lower.includes('horario') || lower.includes('hora') || lower.includes('abierto') || lower.includes('atiend')) {
    return '⏰ **Horario Lycos Team:**\n\n📅 Lunes a Viernes: 8:00 AM — 6:00 PM\n📅 Sábado: 8:00 AM — 2:00 PM\n❌ Domingo: Cerrado\n\n📞 Emergencias: +58 412-334-3519 (disponible fuera de horario para urgencias)';
  }

  if (lower.includes('cita') || lower.includes('agendar') || lower.includes('reserv') || lower.includes('disponib')) {
    return '📅 ¡Con gusto agendamos su cita!\n\nPara reservar necesitamos:\n1. Su nombre completo\n2. Marca, modelo y año del vehículo\n3. Tipo de servicio requerido\n4. Fecha y hora preferida\n\n📞 Llámenos: **+58 412-334-3519**\n📧 Email: **lycosteam7@gmail.com**\n📍 Altos Mirandinos, Miranda, VE\n\n¡Tenemos disponibilidad esta semana! 🙌';
  }

  if (lower.includes('emergencia') || lower.includes('urgente') || lower.includes('auxilio') || lower.includes('no arranca') || lower.includes('no enciende')) {
    return '🚨 **ASISTENCIA DE EMERGENCIA**\n\nContáctenos AHORA:\n📞 **+58 412-334-3519**\n\nNuestro técnico puede estar con usted en aprox. 30-60 minutos. Por favor indique:\n• Su ubicación exacta\n• El problema que presenta\n• Marca y modelo del vehículo\n\n¡No se preocupe, estamos aquí para ayudarle! 💪';
  }

  if (lower.includes('ubicacion') || lower.includes('ubicación') || lower.includes('donde') || lower.includes('dirección') || lower.includes('llegar')) {
    return '📍 **Nuestra ubicación:**\n\nAltos Mirandinos, Miranda, Venezuela. Estamos ubicados estratégicamente para atender a Los Teques, San Antonio y Carrizal.\n\n🚗 **GPS Google Maps:** https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA\n\n¿Necesita indicaciones adicionales?';
  }

  return '¡Hola! Soy el asistente de **Lycos Team** 🔧\n\nEstoy aquí para ayudarle con:\n• 📋 Información sobre servicios\n• 💰 Precios y presupuestos\n• 📅 Agendar citas\n• ⏰ Horarios de atención\n• 🚨 Asistencia de emergencia\n\n¿En qué puedo ayudarle hoy?\n\n📞 También puede llamarnos: **+58 412-334-3519**';
}
