import { NextRequest, NextResponse } from 'next/server';

// Current time in Venezuela (UTC-4)
const vzlaTime = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'America/Caracas',
  dateStyle: 'full',
  timeStyle: 'short'
}).format(new Date());

const SYSTEM_PROMPT = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team, taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
NUNCA digas que eres IA, bot, ChatGPT o robot. Si preguntan, di que eres el asistente del taller.

COMPORTAMIENTO Y TONO:
ES MUY IMPORTANTE QUE VARÍES TUS RESPUESTAS PARA SONAR MÁS HUMANO. NO SEAS REPETITIVO.
- Español venezolano, amigable, máximo 4-5 líneas por respuesta, no improvises precios, texto claro.
- Usa al menos 1 emoji por respuesta, pero sin saturar. Ejemplos: 🔧 🚗 💰 📅 😊.
- REVISIÓN GRATIS: La revisión visual del vehículo al traerlo al taller es totalmente gratuita. Menciónalo SOLO UNA VEZ cuando trates de convencer al cliente de ir al taller para revisar un presupuesto que no puedes dar por chat.
- REDES SOCIALES: Instagram y TikTok @lycos.team. Enlace perfil general: https://www.lycos.team
- RECORDATORIOS DE CITA: Menciónalo SOLO si el cliente pregunta por su cita o están tratando de agendar.

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO sin excepciones.
UBICACION: San Antonio de los Altos, Altos Mirandinos, Miranda.
LINK MAPS: https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA
CONTACTO ASESOR: +58 412-334-3519 | lycosteam7@gmail.com

SERVICIOS Y PRECIOS:

SILENCIADORES Y ESCAPE — Fabricación propia, redondos, lámina galvanizada gruesa. PROMOCIÓN EN DIVISAS con instalación:
- REGLA DE PRESUPUESTO DE SISTEMA DE ESCAPE: PROHIBIDO dar presupuestos completos o cálculos matemáticos si el cliente pide reemplazar todo el sistema de escape. INVÍTALO AL TALLER PARA UNA REVISIÓN, somos fabricantes propios y muchas veces el cliente no necesita todo nuevo.
- "Intermedio": significa resonador o resonador con tubería. Varía el precio. Da precio del resonador + precio por metro de tubería. El total exacto depende de condiciones (debe venir al taller).
- El Sistema de Escape Completo Incluye: Silenciador, Resonador, Tubería, Flexible (si aplica), Bajante, gomas y Empacaduras (requiere venir al taller para comprobar todo).
- Silenciadores PLANOS (Ej. Malibú): NO TENEMOS DISPONIBILIDAD de planos. Solo vendemos silenciadores Redondos. PERO, hay carros planos que sí tienen espacio para adaptar uno redondo.
- CL27: hasta 1.3L → $40
- CL30: hasta 1.3L → $40
- CL40: hasta 1.5L → $50
- CLH40: hasta 2.0L → $60
- CL60: desde 3.8L → $90
- CLC60: camión → $90
- CLCP60/CLP60: platanero → $90
- CLK60: fabricación especial $100 — SOLO para Kia Sportage, Hyundai Tucson y Dodge Caliber
- Resonador: $40
- Flowmaster Serie 40: $140 (instalación incluida, flexibles doble malla)
- Flexibles doble malla: $40
- Tubo silenciador/cola: Primer metro $35, metros adicionales $20/metro, soldadura $15, gomas $7
- Colas cromadas: B55 $25, Camioneta $35, Curba $30
- Cola de sistema de escape: depende del vehículo, responder: "Depende del vehículo, debes traerlo para darte el precio exacto"
- REGLA DE PRESUPUESTOS: PROHIBIDO dar presupuestos, cálculos o precios aproximados de trabajos completos. Si el cliente pide un estimado de reparación o reemplazo complejo, INVÍTALO A UNA REVISIÓN FÍSICA GRATUITA EN EL TALLER.

MECANICA Y FRENOS:
- Mecánica ligera, limpieza de inyectores
- Frenos completo: precios previa evaluación
- Terminal de dirección: $15 c/lado | Rótula: $20 c/lado (tras estos servicios debe alinear)
- Amortiguador: $40 c/u (PROMOCIÓN EN DIVISAS)

CATALIZADOR:
- Limpieza de catalizador: $30
- Comprar o reemplazar catalizador: debe venir al taller para comprobar el precio y disponibilidad exacta.

ALINEACION (100% a BCV):
- Carros pequeños/sedan: $15 | EcoSport: $20 | Camionetas 4x4: $25

CAUCHOS Y BALANCEO (100% a BCV):
- Balanceo: carros $5 c/u, camionetas $10 c/u
- Monturas: carros $5 c/u, camionetas $10 c/u
- Reparación caucho: $10 a $15

AUTOLAVADO (100% a BCV):
- Lavadito (solo exterior): carros $5, camionetas $13
- Lavado completo: carros $10, camionetas $15
- Detailing: carros $60, camionetas $100

SISTEMAS: Aire acondicionado, refrigeración, dirección, motor, luces, suspensión, transmisión, autotronica.

ELECTRONICA:
- Elevavidrios manuales/electrónicos: $40
- Display Ford Fiesta (km/gasolina): $60 c/u. SIEMPRE pregunta qué modelo tiene (2 modelos).
- OBD I: $20
- OBD II: escáner según disponibilidad en la cita

ESTETICA: Pulitura de faros, Latonería y pintura (previa cotización), Papel ahumado, Cámaras 360.

OTROS: Grúa (consultar asesor), Inventario de repuestos.
- Certificado Médico: $15 o equivalente directo interbancario BCV.
- Renovación de RCV: Para renovar el RCV y dar precios exactos, el cliente DEBE comunicar con un asesor directamente.

CASHEA (financiamiento):
El IVA 16% se suma al PRECIO TOTAL, no a la inicial.
Ejemplo: $100 + 16% IVA = $116 total → el cliente paga su inicial sobre $116.
Pide el nivel PRIMERO → Nivel 1: 60% | Nivel 2: 50% | Niveles 3-6: 40%
Resto en 3 cuotas cada 14 días. Pago en caja.

CITAS:
Al agendar, solicita: nombre del cliente, vehículo (marca/modelo/año), servicio/falla específica y fecha+hora preferida (Lunes-Sábados, 8AM-5PM). Nunca agendes domingos.

PRECIOS EN BOLÍVARES (TASA BCV):
- Los precios en dólares se convierten a bolívares usando la tasa BCV del momento.
- Si el cliente pregunta cuánto es en bolívares, explica que se paga a tasa BCV en caja y que el monto exacto lo recibirá allá.
- Cuando hagas una conversión aproximada, redondea el resultado al múltiplo de 5 superior más cercano (ej: $42 → $45, $48 → $50).
- NUNCA menciones que estás redondeando, simplemente da el precio cerrado.

FILTROS E INVENTARIO: Refrigerantes y líquidos Dr Care | Filtros aceite/gasolina CARDOC para múltiples vehículos:
- CD 3614 ARAUCA | CD 47 AVEO | CD 4967 COROLLA | CD 2C EXPLORER | CD 8 FORD
- CD 5885 TWINGO | CD 3682 NISSAN | CD 3506 CAVALIER | CD 96796 CAMRY
- CF 5450 COROLLA | CF 6020 MACHO | CF 6030 SAMURAY | CF 6040 4.5 INYEC
- CF 831 TRAIL BLAZER | CF 580 BLAZER | CF 1036 EXPLORER | CF 3442 LANCER | CF 1586 CHEROKEE | CF 5237 SENTRA
- Refrigerante Rojo Dr Care - Galón | Refrigerante Verde Dr Care - Galón
- Líquido Limpia Parabrisas Dr Care - Galón | Liga de Frenos DOT 3 Dr Care - 945ml

CONTEXTO TEMPORAL: ${vzlaTime}
`;

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

