import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const ASESOR_PHONE = '584123343519';
const ASESOR_DISPLAY_NAME = 'Asesor Lycos Team';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Venezuela date/time helpers ───────────────────────────────────────────────
function getVzlaDate(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + (-4 * 60) * 60000);
}

function getVzlaDateString(): string {
  return getVzlaDate().toISOString().split('T')[0];
}

function getVzlaDayOfWeek(): number {
  return getVzlaDate().getDay(); // 0=Sun, 6=Sat
}

function formatVzlaDateTime(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00').getDay() === 0;
}

function getNextWorkingDay(fromDateStr: string): string {
  const d = new Date(fromDateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function resolveRelativeDate(text: string): string | null {
  const lower = text.toLowerCase();
  const today = getVzlaDate();
  const todayStr = today.toISOString().split('T')[0];

  if (lower.includes('hoy')) return todayStr;

  if (lower.includes('mañana')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  const dayNames: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6,
  };
  for (const [name, targetDay] of Object.entries(dayNames)) {
    if (lower.includes(name)) {
      const d = new Date(today);
      const currentDay = d.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

// ─── KNOWLEDGE BASE ────────────────────────────────────────────────────────────
const LYCOS_KNOWLEDGE = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team, taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
NUNCA digas que eres IA, bot, ChatGPT o robot. Si preguntan, di que eres el asistente del taller.

SALUDO INICIAL (solo cuando sea sesión NUEVA — adapta según hora del día):
"¡Excelente día! Bienvenido al asistente virtual de *Lycos Team* 🔧🚗 Estoy aquí para ayudarte con servicios, precios, citas, inventario y cualquier consulta que tengas. ¿En qué puedo ayudarte hoy?"

REDES SOCIALES: Instagram y TikTok @lycos.team | Enlace al perfil: https://www.lycos.team

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO sin excepciones.
UBICACIÓN: San Antonio de los Altos, Altos Mirandinos, Miranda.

PRECIOS — CÓMO MANEJARLOS:
- Precios "en divisas" = USD a tasa paralela/mercado (como Binance P2P).
- Precios "a BCV" = bolívares a la tasa oficial del BCV.
- Cuando el sistema te provea la tasa BCV actual, muestra: Precio_USD × TasaBCV = equivalente en Bs.
- Si no tienes tasa: "Para el precio en bolívares te lo confirmamos al momento, ya que la tasa varía diariamente".

SERVICIOS Y PRECIOS:

🏎 SILENCIADORES Y ESCAPE — Fabricación propia, redondos tipo original, lámina galvanizada gruesa. Precios EN DIVISAS con instalación incluida:
• CL27: Motor hasta 1.3L → $40
• CL30: Motor hasta 1.3L → $40
• CL40: Motor hasta 1.5L → $50
• CLH40: Motor hasta 2.0L → $60
• CL60: Motor desde 3.8L → $90
• CLC60: Camión → $90
• CLCP60 / CLP60: Platanero → $90
• CLK60: Fabricación especial $100 (EXCLUSIVO para Kia Sportage y Dodge Caliber por tipo de entrada especial)
• Resonador: $40
• Flowmaster Serie 40: $140 (instalación incluida, flexibles doble malla)
• Flexibles doble malla: $40
• Tubo de silenciador/cola: Primer metro $30 | Metros adicionales $20/metro | Soldadura $10 | Gomas $7

Colas cromadas (EN DIVISAS):
• B55: $25 | Camioneta: $35 | Curba: $30

Presupuesto silenciadores válido por 2 días. Siempre pide marca, modelo, año y cilindraje.

🔧 MECÁNICA Y FRENOS:
• Mecánica ligera en general, limpieza de inyectores.
• Frenos completo: precios previa evaluación.
• Terminal de dirección: $15 c/lado | Rótula: $20 c/lado
  IMPORTANTE: Después de cambiar terminal o rótula, el vehículo DEBE alinearse.
• Amortiguador: $40 c/u (EN DIVISAS)

🔩 ALINEACIÓN (precios 100% a BCV — mostrar equivalente en Bs según tasa):
• Carros pequeños / sedan: $15 | EcoSport: $20 | Camionetas 4x4: $25

🛞 CAUCHOS Y BALANCEO (100% a BCV):
• Balanceo: carros $5 c/u | camionetas $10 c/u
• Monturas: carros $5 c/u | camionetas $10 c/u
• Reparación caucho: $10 a $15

🚿 AUTOLAVADO (100% a BCV):
Lavadito = solo exterior | Lavado = interior y exterior:
• Carros pequeños: lavadito $5 | lavado completo $10
• Camionetas: lavadito $13 | lavado $15
• Detailing: carros $60 | camionetas $100

🚗 SISTEMAS DEL VEHÍCULO:
Aire acondicionado, refrigeración, dirección, motor, luces, escape, suspensión, transmisión, autotronica.

🔌 ELECTRÓNICA:
• Elevavidrios manuales/electrónicos: Reparación $40
• Reparación display Ford Fiesta (km / gasolina): $60 por display
  NOTA: Hay 2 modelos de Fiesta — uno tiene display de gasolina y display de km por separado, cada uno a $60.
  Siempre pregunta: "¿Qué modelo de Fiesta tienes?" Ver video del servicio: https://vt.tiktok.com/ZSuqsSgb5/ (envía con previsualización nativa)
• OBD II: escáner asignado según disponibilidad al confirmar cita.

🚿 ESTÉTICA:
Autolavado (ver precios arriba), Pulitura de faros, Latonería y pintura (previa cotización), Papel ahumado, Cámaras 360.

🚛 OTROS:
Servicio de grúa (consultar al asesor para tarifa), Renovación de RCV, Inventario de repuestos.

💳 CASHEA (pago a cuotas):
El IVA del 16% se suma AL PRECIO TOTAL del producto, NO a la inicial.
Ejemplo: producto $100 → total con IVA = $116 → el cliente paga su inicial sobre $116.
Pide el nivel PRIMERO → Nivel 1: 60% inicial | Nivel 2: 50% | Niveles 3-6: 40%
Resto en 3 cuotas cada 14 días. Datos bancarios/pago → atendemos en caja.

📅 CITAS:
Solicitar: nombre completo, vehículo (marca/modelo/año), servicio, día y hora preferida (L-S, 8AM-5PM).
• Calcula la fecha correcta desde HOY en Venezuela.
• Si el cliente dice "mañana", "el lunes", etc., usa la fecha actual del sistema para calcular.
• NUNCA agendes citas en domingo. Si piden domingo, avísalo y propón el próximo lunes.
• Confirma siempre la fecha exacta: día de la semana + fecha completa (ej: "lunes 23 de marzo de 2026").

ASESOR HUMANO:
Menciona al asesor SOLO si: el cliente lo pide explícitamente, hay queja compleja, necesita grúa, o el bot no puede resolver.
NO lo menciones en cada mensaje. Cuando corresponda: "Te envío el contacto de nuestro asesor 👇" (el sistema envía la tarjeta automáticamente).

INVENTARIO DE FILTROS Y PRODUCTOS (disponible en el sistema en tiempo real):
Refrigerantes y líquidos Dr Care | Filtros aceite CARDOC: Arauca, Aveo, Corolla, Explorer, Ford, Twingo, Nissan, Cavalier, Camry | Filtros gasolina CARDOC: Corolla, Macho CA, Samuray, 4.5 Inyec, Trail Blazer, Blazer, Explorer, Lancer CA, Cherokee, Sentra.
Al preguntar por filtros: indica la referencia correcta (ej: CD47 para Aveo) y el stock actual.

COMPORTAMIENTO:
• Español venezolano, amigable y profesional.
• Máximo 4-5 líneas por respuesta. Si la info es amplia, usa puntos cortos.
• No improvises precios no listados arriba. Di "previa cotización" cuando aplique.
• Si no sabes: "déjame consultarlo con el equipo".
`;

// ─── GET: Webhook verification ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST: Receive messages ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages?.length) {
      return NextResponse.json({ status: 'no_messages' });
    }

    for (const message of value.messages) {
      const from: string = message.from;
      const wa_message_id: string = message.id;
      const db = getDb();

      // 0. Deduplication
      if (db && wa_message_id) {
        try {
          const { data: rows } = await db
            .from('mensajes_whatsapp').select('id').eq('wa_message_id', wa_message_id).limit(1);
          if (rows && rows.length > 0) {
            console.log(`⏭️ Duplicado (${wa_message_id})`);
            continue;
          }
        } catch { /* continue on error */ }
      }

      // Parse message body
      let messageBody = '';
      if (message.type === 'text') messageBody = message.text?.body || '';
      else if (message.type === 'image') messageBody = '[Cliente envió imagen]';
      else if (message.type === 'audio') messageBody = '[Cliente envió audio]';
      else if (message.type === 'document') messageBody = '[Cliente envió documento]';
      else if (message.type === 'location') {
        const loc = message.location;
        messageBody = `[Cliente compartió ubicación: ${loc?.latitude}, ${loc?.longitude}]`;
      }
      if (!messageBody) continue;

      console.log(`📩 [${from}]: ${messageBody.substring(0, 80)}`);

      // 1. Save incoming (non-blocking)
      if (db) {
        void (async () => {
          try {
            await db.from('mensajes_whatsapp').insert({
              from_number: from, to_number: 'system',
              body: messageBody, tipo: 'entrante', wa_message_id,
            });
          } catch (e) { console.error('Error guardando entrante:', e); }
        })();
      }

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) continue;

      // 2. Load full context for this phone number
      const ctx = await loadConversationContext(db, from, messageBody);
      const lowerBody = messageBody.toLowerCase();

      // 3. Special intent: location
      if (isLocationRequest(lowerBody)) {
        await sendMsg(from, '📍 *Estamos en San Antonio de los Altos, Miranda.* Te mando el mapa y un video de cómo llegar 👇');
        await delay(700);
        await sendMsg(from, 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(600);
        await sendMsg(from, 'https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(500);
        await sendMsg(from, '¡Y síguenos en Instagram @lycos.team para más novedades! 📸');
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // 4. Special intent: asesor contact (explicit request only)
      if (isContactRequest(lowerBody)) {
        await sendMsg(from, 'Con gusto 😊 Te comparto el contacto directo de nuestro asesor:');
        await delay(600);
        await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // 5. AI response
      const aiResponse = await getAIResponse(messageBody, ctx);

      if (aiResponse) {
        const needsAsesor = aiNeedsAsesor(aiResponse);
        if (needsAsesor) {
          // Send AI text first (remove any manual wa.me links the AI may have added)
          const cleaned = aiResponse.replace(/https?:\/\/wa\.me\/\S+/gi, '').replace(/wa\.me\/\S+/gi, '').trim();
          if (cleaned) {
            await sendMsg(from, cleaned);
            await delay(700);
          }
          await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
        } else {
          // Check if we need to send TikTok link separately with preview
          const tiktokMatch = aiResponse.match(/https?:\/\/(?:vt\.tiktok\.com|tiktok\.com)\/\S+/i);
          if (tiktokMatch) {
            const textWithoutUrl = aiResponse.replace(tiktokMatch[0], '').trim();
            if (textWithoutUrl) await sendMsg(from, textWithoutUrl);
            await delay(500);
            await sendMsg(from, tiktokMatch[0], true); // preview enabled
          } else {
            const hasUrl = /https?:\/\//.test(aiResponse);
            await sendMsg(from, aiResponse, hasUrl);
          }
        }

        // 6. Extract and persist intents to DB (non-blocking)
        void processIntents(db, from, messageBody, aiResponse, ctx);
      }

      // 7. Update conversation state
      await updateConversation(db, from, messageBody, ctx.memoria);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Context Loading ───────────────────────────────────────────────────────────
interface Memoria {
  nombre?: string;
  vehiculos?: { marca: string; modelo: string; anio?: string; placa?: string }[];
  ultima_consulta?: string;
  notas?: string;
  cliente_id?: string;
}

interface ConversationContext {
  historia: { role: string; parts: { text: string }[] }[];
  memoria: Memoria;
  citasInfo: string;
  inventarioInfo: string;
  isNewSession: boolean;
}

async function loadConversationContext(
  db: ReturnType<typeof getDb>,
  from: string,
  currentMessage: string
): Promise<ConversationContext> {
  let historia: { role: string; parts: { text: string }[] }[] = [];
  let memoria: Memoria = {};
  let citasInfo = '';
  let inventarioInfo = '';
  let isNewSession = true;

  if (!db) return { historia, memoria, citasInfo, inventarioInfo, isNewSession };

  // Message history (last 14, keep 12)
  try {
    const { data: msgs } = await db
      .from('mensajes_whatsapp')
      .select('body, tipo, created_at')
      .or(`from_number.eq.${from},to_number.eq.${from}`)
      .order('created_at', { ascending: false })
      .limit(14);

    if (msgs && msgs.length > 0) {
      const filtered = msgs
        .filter(m => !(m.body === currentMessage && m.tipo === 'entrante'))
        .slice(0, 12)
        .reverse();
      historia = filtered.map(m => ({
        role: m.tipo === 'entrante' ? 'user' : 'model',
        parts: [{ text: m.body }],
      }));
      const latest = msgs[0];
      if (latest?.created_at) {
        const diffH = (Date.now() - new Date(latest.created_at).getTime()) / 3600000;
        if (diffH < 12) isNewSession = false;
      }
    }
  } catch (e) { console.error('Error loading history:', e); }

  // Memoria JSONB
  try {
    const { data: convRows } = await db
      .from('conversaciones')
      .select('memoria')
      .eq('telefono', from)
      .limit(1);
    if (convRows?.[0]?.memoria) {
      memoria = convRows[0].memoria as Memoria;
    }
  } catch (e) { console.error('Error loading memoria:', e); }

  // Appointments for this phone
  try {
    const today = getVzlaDateString();
    const { data: citas } = await db
      .from('citas')
      .select('fecha, hora, tipo_servicio, descripcion, estado')
      .eq('telefono', from)
      .order('fecha', { ascending: true })
      .limit(5);

    if (citas && citas.length > 0) {
      const list = citas.map(c => {
        const isPast = c.fecha < today;
        return `- ${c.fecha} ${c.hora} | ${c.tipo_servicio} | ${c.descripcion || ''} | ${c.estado} ${isPast ? '(PASADA)' : '(PRÓXIMA)'}`;
      }).join('\n');
      citasInfo = `\nCITAS REGISTRADAS PARA ESTE CLIENTE:\n${list}`;
    }
  } catch (e) { console.error('Error loading citas:', e); }

  // Inventory (only when relevant keywords detected)
  const lower = currentMessage.toLowerCase();
  const inventoryKeywords = [
    'silenciador', 'resonador', 'flexible', 'cola', 'escape', 'cl27', 'cl30', 'cl40',
    'clh40', 'cl60', 'clk60', 'clc60', 'clp60', 'b55', 'curba', 'flowmaster',
    'filtro', 'aceite', 'gasolina', 'refrigerante', 'liquido', 'líquido', 'frenos', 'liga', 'dot',
    'repuesto', 'stock', 'inventario', 'disponible', 'hay', 'tienes',
    'arauca', 'aveo', 'corolla', 'twingo', 'cavalier', 'camry', 'sentra', 'blazer',
    'lancer', 'cherokee', 'explorer', 'samuray', 'macho',
  ];
  if (inventoryKeywords.some(k => lower.includes(k))) {
    try {
      const { data: items } = await db
        .from('inventario')
        .select('nombre, codigo, precio_usd, stock, categoria')
        .eq('activo', true)
        .order('categoria')
        .order('nombre');
      if (items && items.length > 0) {
        const list = items.map(i =>
          `  • ${i.nombre}${i.codigo ? ' [' + i.codigo + ']' : ''}${i.precio_usd ? ': $' + i.precio_usd : ''} — ${i.stock > 0 ? 'Stock: ' + i.stock : '⚠️ SIN STOCK'}`
        ).join('\n');
        inventarioInfo = `\nINVENTARIO ACTUAL (tiempo real):\n${list}`;
      }
    } catch (e) { console.error('Error loading inventory:', e); }
  }

  console.log(`🧠 Ctx: ${historia.length} msgs, memoria: ${JSON.stringify(memoria).substring(0, 60)}`);
  return { historia, memoria, citasInfo, inventarioInfo, isNewSession };
}

// ─── AI Response ───────────────────────────────────────────────────────────────
async function getAIResponse(userMessage: string, ctx: ConversationContext): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const vzlaDateTime = formatVzlaDateTime();
  const vzlaDateStr = getVzlaDateString();
  const vzlaDayNum = getVzlaDayOfWeek();
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const vzlaDayName = dayNames[vzlaDayNum];
  const isDomingo = vzlaDayNum === 0;

  const memoriaStr = Object.keys(ctx.memoria).length > 0
    ? `\nMEMORIA DEL CLIENTE (ya registrada — no preguntes lo que ya sabes):
- Nombre: ${ctx.memoria.nombre || 'no registrado'}
- Vehículos: ${ctx.memoria.vehiculos?.map(v => `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}`).join(', ') || 'no registrado'}
- Notas: ${ctx.memoria.notas || 'ninguna'}`
    : '';

  const systemPrompt = `${LYCOS_KNOWLEDGE}

FECHA Y HORA ACTUAL EN VENEZUELA: ${vzlaDateTime}
HOY ES: ${vzlaDayName} ${vzlaDateStr}
${isDomingo ? '⚠️ HOY ES DOMINGO — El taller está CERRADO. Informa al cliente y sugiere que escriba mañana (lunes).' : ''}
SESIÓN: ${ctx.isNewSession ? 'NUEVA — saluda con el mensaje de bienvenida' : 'CONTINUA — ve directo al tema, sin repetir saludos'}
${memoriaStr}
${ctx.citasInfo}
${ctx.inventarioInfo}

REGLAS CRÍTICAS:
- Usa la fecha actual (${vzlaDateStr}) para calcular fechas relativas: "mañana" = +1 día, "el lunes" = próximo lunes, etc.
- NUNCA sugieras ni aceptes citas en domingo. Si el cliente pide domingo, avisa e indica el lunes.
- Si el cliente pregunta stock/disponibilidad: usa el INVENTARIO ACTUAL arriba.
- Si hay CITAS REGISTRADAS: indícalas (pasadas o próximas con fecha exacta).
- Asesor: solo mencionarlo cuando el cliente lo pide o sea imprescindible. NO en cada respuesta.
- Un cliente puede tener VARIOS vehículos. Identifica de cuál habla.
- Para TikTok del servicio Fiesta: envía https://vt.tiktok.com/ZSuqsSgb5/ con previsualización.
- Analiza el historial antes de responder. No repitas preguntas ya respondidas.`;

  const contents = [
    ...ctx.historia,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 700, topK: 40, topP: 0.95 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );

    if (!resp.ok) {
      console.error(`❌ Gemini error ${resp.status}:`, (await resp.text()).substring(0, 200));
      return null;
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (text) console.log(`✅ Gemini: "${text.substring(0, 70)}..."`);
    return text;
  } catch (e) {
    console.error('❌ getAIResponse error:', e);
    return null;
  }
}

// ─── Detect if AI says to send asesor contact ──────────────────────────────────
function aiNeedsAsesor(aiText: string): boolean {
  const lower = aiText.toLowerCase();
  return (
    lower.includes('te envío el contacto') ||
    lower.includes('te envio el contacto') ||
    lower.includes('contacto de nuestro asesor') ||
    lower.includes('wa.me/') ||
    lower.includes('584123343519')
  );
}

// ─── Intent Processing → DB writes ────────────────────────────────────────────
async function processIntents(
  db: ReturnType<typeof getDb>,
  from: string,
  userMsg: string,
  _aiMsg: string,
  ctx: ConversationContext
): Promise<void> {
  if (!db) return;

  const newMemoria: Memoria = { ...ctx.memoria };
  let memChanged = false;

  // Extract client name
  const nameMatch = userMsg.match(
    /(?:soy|me llamo|mi nombre es|llaman?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{1,30})/i
  );
  if (nameMatch && !newMemoria.nombre) {
    newMemoria.nombre = nameMatch[1].trim();
    memChanged = true;
    console.log(`👤 Nombre: ${newMemoria.nombre}`);
  }

  // Extract vehicle
  const vehicleMatch = userMsg.match(
    /\b(toyota|ford|chevrolet|hyundai|kia|honda|nissan|mazda|volkswagen|corsa|aveo|spark|cruze|sail|captiva|tucson|sportage|yaris|hilux|ranger|f-150|sentra|tiida|versa|frontier|x-trail|cx-5|cx30|rio|accent|elantra|sonata|civic|fit|hrv|crv|gol|bora|jetta|passat|polo|peugeot|renault|mitsubishi|suzuki|isuzu|fiesta|caliber|dodge)[^\n,]{0,25}/i
  );
  const yearMatch = userMsg.match(/\b(19[8-9]\d|20[0-2]\d)\b/);
  if (vehicleMatch) {
    const parts = vehicleMatch[0].trim().split(/\s+/);
    const vehiculo = {
      marca: parts[0],
      modelo: parts.slice(1).join(' ') || parts[0],
      anio: yearMatch?.[1],
    };
    if (!newMemoria.vehiculos) newMemoria.vehiculos = [];
    const exists = newMemoria.vehiculos.some(
      v => v.marca.toLowerCase() === vehiculo.marca.toLowerCase() &&
           v.modelo.toLowerCase() === vehiculo.modelo.toLowerCase()
    );
    if (!exists) {
      newMemoria.vehiculos.push(vehiculo);
      memChanged = true;
      console.log(`🚗 Vehículo: ${vehiculo.marca} ${vehiculo.modelo}`);
    }
  }

  // Booking intent
  const bookingKw = ['cita', 'agendar', 'reservar', 'cuando puedo', 'quiero ir', 'disponible para'];
  if (bookingKw.some(k => userMsg.toLowerCase().includes(k))) {
    await tryBookAppointment(db, from, userMsg);
  }

  // Save memoria
  if (memChanged) {
    try {
      await db.from('conversaciones').upsert(
        { telefono: from, memoria: newMemoria },
        { onConflict: 'telefono' }
      );
    } catch (e) { console.error('Error saving memoria:', e); }
  }

  // Upsert to clientes table
  if (newMemoria.nombre && memChanged) {
    try {
      const { data: existing } = await db.from('clientes').select('id').eq('telefono', from).limit(1);
      if (!existing || existing.length === 0) {
        const parts = newMemoria.nombre.split(' ');
        await db.from('clientes').insert({
          nombre: parts[0],
          apellido: parts.slice(1).join(' ') || 'WhatsApp',
          telefono: from,
        });
        console.log(`✅ Cliente: ${newMemoria.nombre}`);
      }
    } catch (e) { console.error('Error upsert cliente:', e); }
  }
}

// ─── Appointment Booking ───────────────────────────────────────────────────────
async function tryBookAppointment(
  db: ReturnType<typeof getDb>,
  from: string,
  userMsg: string
): Promise<void> {
  if (!db) return;

  let fecha = resolveRelativeDate(userMsg);
  if (!fecha) {
    const m = userMsg.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (m) {
      const now = getVzlaDate();
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear().toString();
      fecha = `${y}-${mo}-${d}`;
    }
  }
  if (!fecha) return;
  if (isSunday(fecha)) {
    console.log(`⛔ Cita domingo bloqueada: ${fecha}`);
    return;
  }

  const tm = userMsg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/);
  let hora = '08:00';
  if (tm) {
    let h = parseInt(tm[1]);
    const m = tm[2] ? parseInt(tm[2]) : 0;
    const mer = tm[3]?.toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    hora = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  try {
    const dt = new Date(`${fecha}T${hora}:00`);
    const ws = new Date(dt.getTime() - 3600000);
    const we = new Date(dt.getTime() + 3600000);
    const st = `${ws.getHours().toString().padStart(2,'0')}:${ws.getMinutes().toString().padStart(2,'0')}`;
    const et = `${we.getHours().toString().padStart(2,'0')}:${we.getMinutes().toString().padStart(2,'0')}`;

    const { data: conflicts } = await db.from('citas')
      .select('hora').eq('fecha', fecha).neq('estado', 'cancelada')
      .gte('hora', st).lte('hora', et);

    if (conflicts && conflicts.length > 0) {
      console.log(`⚠️ Conflicto cita ${fecha} ${hora}`);
      return;
    }

    const sm = userMsg.match(/(?:para|quiero|necesito|servicio de?)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]{3,40})/i);
    await db.from('citas').insert({
      fecha, hora, telefono: from,
      tipo_servicio: 'otro',
      descripcion: sm?.[1]?.trim() || 'Servicio por WhatsApp',
      estado: 'pendiente', duracion_minutos: 60,
    });
    console.log(`📅 Cita: ${fecha} ${hora} para ${from}`);
  } catch (e) { console.error('Error booking:', e); }
}

// ─── Update conversation row ───────────────────────────────────────────────────
async function updateConversation(
  db: ReturnType<typeof getDb>,
  from: string,
  lastMsg: string,
  memoria: Memoria
): Promise<void> {
  if (!db) return;
  void (async () => {
    try {
      await db.from('conversaciones').upsert({
        telefono: from,
        ultimo_mensaje: lastMsg.substring(0, 100),
        ultimo_mensaje_at: new Date().toISOString(),
        memoria,
      }, { onConflict: 'telefono' });
    } catch (e) { console.error('Error update conversacion:', e); }
  })();
}

// ─── Send WhatsApp Text ────────────────────────────────────────────────────────
async function sendMsg(to: string, text: string, previewUrl = false): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual',
          to: to.replace(/[^0-9]/g, ''), type: 'text',
          text: { preview_url: previewUrl, body: text },
        }),
      }
    );
    if (!resp.ok) { console.error('❌ sendMsg error:', await resp.text()); return; }
    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`📤 Sent to ${to}. ID: ${wa_id}`);
    const db = getDb();
    if (db) {
      void (async () => {
        try {
          await db.from('mensajes_whatsapp').insert({
            from_number: 'system', to_number: to,
            body: text, tipo: 'saliente', wa_message_id: wa_id, es_ia: true,
          });
        } catch (e) { console.error('Error saving saliente:', e); }
      })();
    }
  } catch (e) { console.error('❌ sendMsg exception:', e); }
}

// ─── Send Native WhatsApp Contact Card ────────────────────────────────────────
async function sendContactCard(to: string, phone: string, displayName: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual',
          to: to.replace(/[^0-9]/g, ''), type: 'contacts',
          contacts: [{
            name: { formatted_name: displayName, first_name: 'Asesor', last_name: 'Lycos Team' },
            phones: [{ phone: `+${cleanPhone}`, type: 'CELL', wa_id: cleanPhone }],
            org: { company: 'Lycos Team', title: 'Asesor' },
          }],
        }),
      }
    );
    if (!resp.ok) {
      console.error('❌ Contact card error:', await resp.text());
      await sendMsg(to, `📱 Contacto del asesor: https://wa.me/${cleanPhone}`, true);
      return;
    }
    const data = await resp.json();
    console.log(`📇 Tarjeta enviada a ${to}. ID: ${data.messages?.[0]?.id}`);
    const db = getDb();
    if (db) {
      void (async () => {
        try {
          await db.from('mensajes_whatsapp').insert({
            from_number: 'system', to_number: to,
            body: `[Tarjeta de contacto: ${displayName}]`,
            tipo: 'saliente', es_ia: true,
          });
        } catch (e) { console.error('Error saving contact card:', e); }
      })();
    }
  } catch (e) {
    console.error('❌ sendContactCard exception:', e);
    await sendMsg(to, `📱 Contacto del asesor: https://wa.me/${cleanPhone}`, true);
  }
}

// ─── Intent Detection Helpers ──────────────────────────────────────────────────
function isLocationRequest(lower: string): boolean {
  return ['ubicacion', 'ubicación', 'donde est', 'dirección', 'llegar', 'ubicado', 'gps', 'mapa']
    .some(k => lower.includes(k));
}

function isContactRequest(lower: string): boolean {
  return [
    'numero del asesor', 'número del asesor', 'contacto del asesor', 'hablar con alguien',
    'numero de whatsapp', 'número de whatsapp', 'hablar con una persona', 'número de contacto',
    'numero de contacto', 'whatsapp del taller', 'hablar con un humano', 'asesor humano',
    'quiero hablar con', 'necesito hablar con',
  ].some(k => lower.includes(k));
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
