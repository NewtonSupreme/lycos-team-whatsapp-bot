import { NextRequest, NextResponse } from 'next/server';

// Current time in Venezuela (UTC-4)
const vzlaTime = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'America/Caracas',
  dateStyle: 'full',
  timeStyle: 'short'
}).format(new Date());

const SYSTEM_PROMPT = `Eres el asistente virtual oficial de Lycos Team, el taller automotriz líder en los Altos Mirandinos, Venezuela. 
TU MISIÓN: Brindar asesoría técnica experta, profesional y eficiente.

CONTEXTO TEMPORAL ACTUAL:
- Fecha y Hora en Venezuela: ${vzlaTime}
- IMPORTANTE: Usa esta fecha para ser preciso con las citas y el día de hoy.

SOBRE LYCOS TEAM:
- Especialidades: Mecánica General Avanzada, Electrónica Automotriz (ECU/Módulos), Cerrajería Automotriz con chip, Diagnóstico Computarizado nivel concesionario, Reparación integral de motores y Asistencia de Emergencia 24/7.
- Identidad: Somos sinónimo de tecnología avanzada, precisión y atención personalizada de alta calidad.
- Ubicación: Altos Mirandinos, Miranda, Venezuela.
- Link GPS: https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA
- Horario: Lunes a Viernes 8:00 AM - 6:00 PM, Sábados 8:00 AM - 2:00 PM.
- Contacto: +58 412-334-3519 | lycosteam7@gmail.com

PERSONALIDAD:
- Asesor experto, profesional, directo y muy confiable.
- Tono experto pero cercano.
- Usa emojis de forma profesional (🔧, ⚡, 🚗).
- Ofrece proactivamente diagnósticos y citas.
- Prioriza la seguridad del vehículo y del cliente.

CITAS:
- Al agendar, solicita: Nombre, Vehículo (Marca/Modelo/Año), Servicio/Falla y Fecha/Hora preferida.

INVENTARIO DE FILTROS Y PRODUCTOS DISPONIBLES:
**LÍQUIDOS Y REFRIGERANTES:**
- REFRIGERANTE ROJO DR CARE - GALON (Cantidad: 4)
- REFRIGERANTE VERDE DR CARE - GALON (Cantidad: 4)
- LÍQUIDO LIMPIA PARABRISAS DR CARE - GALON (Cantidad: 4)
- LIGA DE FRENOS DOT 3 DR CARE - 945ML (Cantidad: 6)

**FILTROS DE ACEITE (CARDOC):**
- CD 3614 ARAUCA (Cantidad: 6)
- CD 47 AVEO (Cantidad: 6)
- CD 4967 COROLLA (Cantidad: 6)
- CD 2C EXPLORER (Cantidad: 2)
- CD 8 FORD (Cantidad: 2)
- CD 5885 TWINGO (Cantidad: 2)
- CD 3682 NISSAN (Cantidad: 2)
- CD 3506 CAVALIER (Cantidad: 2)
- CD 96796 CAMRY (Cantidad: 2)

**FILTROS DE GASOLINA (CARDOC):**
- CF 5450 COROLLA (Cantidad: 3)
- CF 6020 MACHO CA. (Cantidad: 3)
- CF 6030 SAMURAY (Cantidad: 3)
- CF 6040 4.5 INYEC (Cantidad: 3)
- CF 831 TRAIL BLAZER (Cantidad: 3)
- CF 580 BLAZER (Cantidad: 3)
- CF 1036 EXPLORER (Cantidad: 3)
- CF 3442 LANCER CA (Cantidad: 3)
- CF 1586 CHEROKEE (Cantidad: 3)
- CF 5237 SENTRA (Cantidad: 3)

Cuando el cliente pregunte por filtros, indica la referencia exacta y la cantidad disponible.`;

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
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

  if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuánto') || lower.includes('cuanto') || lower.includes('presupuesto')) {
    return '🔧 Para darte un presupuesto exacto e indicarte con precisión qué hay que reparar, cambiar o hacerle mantenimiento, te invitamos a realizar una **Revisión Física de tu vehículo TOTALMENTE GRATUITA** en nuestro taller. A veces el problema real puede ser distinto a lo que parece. ¿Te gustaría agendar una cita para revisión?';
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
    return '📍 **Nuestra ubicación:**\n\nAltos Mirandinos, Miranda, Venezuela.\n\nhttps://maps.app.goo.gl/7H6RGrbpXkxeqG2KA';
  }

  // Filters inventory response
  if (lower.includes('filtro') || lower.includes('aceite') || lower.includes('gasolina')) {
    return '🔧 **Filtros disponibles en Lycos Team:**\n\n**FILTROS DE ACEITE:**\n• CD 47 AVEO\n• CD 4967 COROLLA\n• CD 3614 ARAUCA\n• CD 8 FORD\n• CD 2C EXPLORER\n• CD 5885 TWINGO\n• CD 3682 NISSAN\n• CD 3506 CAVALIER\n• CD 96796 CAMRY\n\n**FILTROS DE GASOLINA:**\n• CF 5450 COROLLA\n• CF 6020 MACHO\n• CF 6030 SAMURAY\n• CF 6040 4.5 INYEC\n• CF 831 TRAIL BLAZER\n• CF 580 BLAZER\n• CF 1036 EXPLORER\n• CF 3442 LANCER\n• CF 1586 CHEROKEE\n• CF 5237 SENTRA\n\n¡Consulta disponibilidad y precios con nosotros! 📞 +58 412-334-3519';
  }

  return '¡Hola! Soy el asistente de **Lycos Team** 🔧\n\nEstoy aquí para ayudarle con:\n• 📋 Información sobre servicios\n• 💰 Precios y presupuestos\n• 📅 Agendar citas\n• ⏰ Horarios de atención\n• 🚨 Asistencia de emergencia\n• 🔧 Filtros y repuestos\n\n¿En qué puedo ayudarle hoy?\n\n📞 También puede llamarnos: **+58 412-334-3519**';
}

