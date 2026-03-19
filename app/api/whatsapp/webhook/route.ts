import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const ASESOR_PHONE = '584123343519';
const ASESOR_NAME = 'Lycos Team - Asesor';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────────
const LYCOS_KNOWLEDGE = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team, un taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
NUNCA digas que eres una IA, bot, ChatGPT o robot. Si preguntan, eres el asistente del taller.
Si el cliente pide hablar con una persona o asesor: responde "con gusto te comunico con uno de nuestros asesores" y en el siguiente mensaje se le enviará su contacto (ya lo gestiona el sistema, no lo menciones tú).

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM.
DOMINGOS: CERRADO. Sin excepciones. Si alguien escribe un domingo, indícales que el taller está cerrado y que pueden dejar su consulta para el lunes.

FECHA/DÍA: Usa SIEMPRE la fecha/hora real de Venezuela provista en el contexto. Cuando el cliente diga "mañana", "el lunes", "esta semana", calcula la fecha exacta basándote en el día actual. Si el día calculado cae domingo, avisa que no se trabaja y propón el lunes siguiente.

UBICACIÓN: San Antonio de los Altos, Altos Mirandinos, Miranda.
REDES SOCIALES: Instagram y TikTok: @lycos.team

SERVICIOS (por categoría):
🔧 Mecánica y Frenos: Mecánica ligera, frenos (pastillas, liga, cilindros, freno de mano, rectificación disco/tambores), alineación, balanceo, rotación y monturas de cauchos, limpieza de inyectores.
🚗 Sistemas: Aire acondicionado, frenos, refrigeración, dirección, motor, luces, escape, suspensión, transmisión, autotronica.
🏎️ Silenciadores y Escape (con instalación, en divisas): CL27/CL30 hasta 1.3L $40 | CL40 hasta 1.5L $50 | CLH40 1.6-3.7L $60 | CL60 3.8L+ $90 | CLC60 camión $90 | CLCP60 platanero $90 | Resonador $40 | Flexibles $40. Presupuestos válidos 2 días.
🚿 Estética: Autolavado, pulitura de faros, latonería y pintura, papel ahumado, cámaras 360.
🔌 Electrónica: Elevavidrios manuales/electrónicos. OBD II: escáner según disponibilidad en la cita.
🚛 Otros: Grúa (consultar al asesor), inventario de repuestos, renovación de RCV.

💳 CASHEA: IVA 16% adicional. Pide nivel PRIMERO → Nivel 1: 60% inicial | Nivel 2: 50% | Niveles 3-6: 40%. 3 cuotas c/14 días. Datos de pago → caja en persona.

📅 CITAS: Solicitar nombre completo, vehículo (marca/modelo/año), servicio, día y hora (L-S, 8AM-5PM). Calcula si el día que pide es válido (no domingo, dentro de horario). El sistema registra la disponibilidad.

COMPORTAMIENTO:
- Español venezolano, amigable y profesional.
- Máximo 4-5 líneas por respuesta.
- No improvises precios no listados.
- Si no sabes algo: "déjame consultarlo con el equipo".
- Solo menciona al asesor cuando el cliente lo pida directamente o cuando realmente sea necesario escalar. No lo menciones en cada respuesta.
`;

// ─── GET: Webhook verification ────────────────────────────────────────────────
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

// ─── POST: Receive messages ───────────────────────────────────────────────────
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

      // 3. Detect intent-based special responses first
      const lowerBody = messageBody.toLowerCase();

      // Location request
      if (isLocationRequest(lowerBody)) {
        await sendMsg(from, '📍 *Estamos en San Antonio de los Altos, Miranda.* Te mando el mapa y el video de cómo llegar 👇');
        await delay(700);
        await sendMsg(from, 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(600);
        await sendMsg(from, 'https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(500);
        await sendMsg(from, '¡Síguenos en Instagram @lycos.team! 📸');
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // Contact/asesor request — send native contact card
      if (isContactRequest(lowerBody)) {
        await sendMsg(from, 'Con gusto 😊 Te comparto el contacto directo de nuestro asesor:');
        await delay(600);
        await sendContactCard(from);
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // 4. Get AI response with full context
      const aiResponse = await getAIResponse(messageBody, ctx);

      if (aiResponse) {
        const hasUrl = /https?:\/\//.test(aiResponse);
        await sendMsg(from, aiResponse, hasUrl);

        // 5. Post-response: extract intents and persist to DB
        void processIntents(db, from, messageBody, aiResponse, ctx);
      }

      // 6. Update conversation state
      await updateConversation(db, from, messageBody, ctx.memoria);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Context Loading ──────────────────────────────────────────────────────────
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
  const vzlaTime = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date());

  let historia: { role: string; parts: { text: string }[] }[] = [];
  let memoria: Memoria = {};
  let citasInfo = '';
  let inventarioInfo = '';
  let isNewSession = true;

  if (!db) return { historia, memoria, citasInfo, inventarioInfo, isNewSession };

  // Load conversation history (last 14 messages)
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

      // Session check
      const latest = msgs[0];
      if (latest?.created_at) {
        const diff = (Date.now() - new Date(latest.created_at).getTime()) / 3600000;
        if (diff < 12) isNewSession = false;
      }
    }
  } catch (e) { console.error('Error loading history:', e); }

  // Load conversation memoria JSONB
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

  // Load upcoming and past appointments for this phone
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: citas } = await db
      .from('citas')
      .select('fecha, hora, tipo_servicio, descripcion, estado')
      .eq('telefono', from)
      .order('fecha', { ascending: true })
      .limit(5);

    if (citas && citas.length > 0) {
      const citasList = citas.map(c => {
        const citaDate = new Date(`${c.fecha}T${c.hora}`);
        const isPast = c.fecha < today;
        const status = isPast ? '(PASADA)' : '(PRÓXIMA)';
        return `- ${c.fecha} a las ${c.hora} | ${c.tipo_servicio} | ${c.descripcion || ''} | ${c.estado} ${status}`;
      }).join('\n');
      citasInfo = `\nCITAS REGISTRADAS PARA ESTE CLIENTE:\n${citasList}`;
    }
  } catch (e) { console.error('Error loading citas:', e); }

  // Load inventory if message mentions products
  const lower = currentMessage.toLowerCase();
  if (lower.includes('silenciador') || lower.includes('cl') || lower.includes('resonador') ||
      lower.includes('flexible') || lower.includes('stock') || lower.includes('inventario') ||
      lower.includes('disponible') || lower.includes('hay') || lower.includes('precio')) {
    try {
      const { data: items } = await db
        .from('inventario')
        .select('nombre, codigo, precio_usd, stock, notas')
        .eq('activo', true)
        .order('categoria');
      if (items && items.length > 0) {
        const list = items.map(i =>
          `  • ${i.nombre} (${i.codigo}): $${i.precio_usd} — Stock: ${i.stock > 0 ? i.stock + ' unidades' : '⚠️ SIN STOCK'}`
        ).join('\n');
        inventarioInfo = `\nINVENTARIO ACTUAL (stock en tiempo real):\n${list}`;
      }
    } catch (e) { console.error('Error loading inventory:', e); }
  }

  console.log(`🧠 Contexto cargado: ${historia.length} msgs hist, memoria: ${JSON.stringify(memoria).substring(0, 80)}`);

  return { historia, memoria, citasInfo, inventarioInfo, isNewSession };
}

// ─── AI Response ──────────────────────────────────────────────────────────────
async function getAIResponse(
  userMessage: string,
  ctx: ConversationContext
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const vzlaTime = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date());

  const memoriaStr = Object.keys(ctx.memoria).length > 0
    ? `\nMEMORIA DEL CLIENTE (recuerda esta info, no vuelvas a preguntar):
- Nombre: ${ctx.memoria.nombre || 'no registrado'}
- Vehículos: ${ctx.memoria.vehiculos?.map(v => `${v.marca} ${v.modelo} ${v.anio || ''}`).join(', ') || 'no registrado'}
- Notas: ${ctx.memoria.notas || 'ninguna'}`
    : '';

  const systemPrompt = `${LYCOS_KNOWLEDGE}

FECHA Y HORA EXACTA EN VENEZUELA AHORA MISMO: ${vzlaTime}
DÍA ACTUAL COMPLETO: ${vzlaDate}
FECHA ISO HOY: ${todayDateISO}
${isSunday ? '⚠️ HOY ES DOMINGO: El taller está CERRADO. Informa al cliente y sugiere escribir mañana lunes.' : ''}
SESIÓN: ${ctx.isNewSession ? 'NUEVA - saluda brevemente si el mensaje lo amerita' : 'CONTINUA - ve al tema, sin repetir saludos'}
${memoriaStr}
${ctx.citasInfo}
${ctx.inventarioInfo}

REGLAS CRÍTICAS:
- Usa la fecha y día de hoy para calcular fechas relativas ("mañana" = ${todayDateISO} + 1 día, "el lunes" = el próximo lunes calculado exacto, etc.).
- Si el día calculado para una cita cae domingo, avisa que no laboramos y propón el lunes siguiente.
- Si hay CITAS REGISTRADAS, úsalas: di si ya pasaron o están próximas con la fecha exacta.
- Si el cliente pregunta stock/disponibilidad, usa el INVENTARIO ACTUAL arriba.
- Un cliente puede tener VARIOS vehículos. Identifica de cuál habla.
- Solo menciona o sugiere hablar con un asesor cuando el cliente lo pida o sea realmente necesario escalar. No lo uses como respuesta genérica.
- Analiza el historial antes de responder. No repitas preguntas ya contestadas.`;

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
          generationConfig: {
            temperature: 0.75, maxOutputTokens: 700, topK: 40, topP: 0.95,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`❌ Gemini error ${resp.status}:`, err.substring(0, 300));
      return null;
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (text) console.log(`✅ Gemini: "${text.substring(0, 70)}..."`);
    return text;
  } catch (e) {
    console.error('❌ Error getAIResponse:', e);
    return null;
  }
}

// ─── Intent Processing → DB writes ───────────────────────────────────────────
async function processIntents(
  db: ReturnType<typeof getDb>,
  from: string,
  userMsg: string,
  aiMsg: string,
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
    console.log(`👤 Nombre detectado: ${newMemoria.nombre}`);
  }

  // Extract vehicle info (supports multiple vehicles)
  const vehicleMatch = userMsg.match(
    /\b(toyota|ford|chevrolet|hyundai|kia|honda|nissan|mazda|volkswagen|corsa|aveo|spark|cruze|sail|captiva|tucson|sportage|yaris|hilux|ranger|f-150|sentra|tiida|versa|frontier|x-trail|cx-5|cx30|rio|accent|elantra|sonata|civic|fit|hrv|crv|gol|bora|jetta|passat|polo|peugeot|renault|mitsubishi|suzuki|isuzu)[^\n,]{0,25}/i
  );
  const yearMatch = userMsg.match(/\b(19[8-9]\d|20[0-2]\d)\b/);
  if (vehicleMatch) {
    const vehiculo = {
      marca: vehicleMatch[0].split(' ')[0],
      modelo: vehicleMatch[0].split(' ').slice(1).join(' ') || vehicleMatch[0],
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
      console.log(`🚗 Vehículo añadido: ${vehiculo.marca} ${vehiculo.modelo}`);
    }
  }

  // Detect appointment booking intent
  const bookingKeywords = ['cita', 'agendar', 'reservar', 'cuando puedo', 'disponibilidad', 'quiero ir'];
  const hasBookingIntent = bookingKeywords.some(k => userMsg.toLowerCase().includes(k));

  if (hasBookingIntent) {
    await tryBookAppointment(db, from, userMsg, newMemoria);
  }

  // Save updated memoria
  if (memChanged) {
    try {
      await db.from('conversaciones').upsert(
        { telefono: from, memoria: newMemoria },
        { onConflict: 'telefono' }
      );
      console.log('💾 Memoria actualizada');
    } catch (e) { console.error('Error saving memoria:', e); }
  }

  // Upsert client in clientes table if we have name + phone
  if (newMemoria.nombre && memChanged) {
    try {
      const { data: existing } = await db
        .from('clientes')
        .select('id')
        .eq('telefono', from)
        .limit(1);

      if (!existing || existing.length === 0) {
        const nameParts = newMemoria.nombre.split(' ');
        await db.from('clientes').insert({
          nombre: nameParts[0] || newMemoria.nombre,
          apellido: nameParts.slice(1).join(' ') || 'WhatsApp',
          telefono: from,
        });
        console.log(`✅ Cliente creado: ${newMemoria.nombre}`);
      }
    } catch (e) { console.error('Error upserting cliente:', e); }
  }
}

// ─── Appointment Booking with Conflict Detection ──────────────────────────────
async function tryBookAppointment(
  db: ReturnType<typeof getDb>,
  from: string,
  userMsg: string,
  memoria: Memoria
): Promise<void> {
  if (!db) return;

  // Extract date/time patterns
  const dateMatch = userMsg.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  const timeMatch = userMsg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/);

  if (!dateMatch && !timeMatch) return; // Not enough info to book

  const now = new Date();
  let fecha = '';
  let hora = '08:00';

  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3]) : now.getFullYear().toString();
    fecha = `${year}-${month}-${day}`;
  }

  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const meridian = timeMatch[3]?.toLowerCase();
    if (meridian === 'pm' && h < 12) h += 12;
    if (meridian === 'am' && h === 12) h = 0;
    hora = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  if (!fecha) return;

  // Check for conflicts: any appointment within ±60 minutes of requested time
  try {
    const requestedDateTime = new Date(`${fecha}T${hora}:00`);
    const windowStart = new Date(requestedDateTime.getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(requestedDateTime.getTime() + 60 * 60 * 1000);

    const startTime = `${windowStart.getHours().toString().padStart(2,'0')}:${windowStart.getMinutes().toString().padStart(2,'0')}`;
    const endTime = `${windowEnd.getHours().toString().padStart(2,'0')}:${windowEnd.getMinutes().toString().padStart(2,'0')}`;

    const { data: conflicts } = await db
      .from('citas')
      .select('hora, descripcion')
      .eq('fecha', fecha)
      .neq('estado', 'cancelada')
      .gte('hora', startTime)
      .lte('hora', endTime);

    if (conflicts && conflicts.length > 0) {
      console.log(`⚠️ Conflicto de cita detectado para ${fecha} ${hora}`);
      // Don't book automatically — AI has already been informed via citasInfo context
      return;
    }

    // No conflict → create the appointment
    const servicioMatch = userMsg.match(
      /(?:por|para|quiero|necesito|servicio de?)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]{3,40})/i
    );

    await db.from('citas').insert({
      fecha,
      hora,
      telefono: from,
      tipo_servicio: 'otro',
      descripcion: servicioMatch?.[1]?.trim() || 'Servicio solicitado por WhatsApp',
      estado: 'pendiente',
      duracion_minutos: 60,
    });

    console.log(`📅 Cita creada: ${fecha} ${hora} para ${from}`);
  } catch (e) {
    console.error('Error booking appointment:', e);
  }
}

// ─── Update conversation row ──────────────────────────────────────────────────
async function updateConversation(
  db: ReturnType<typeof getDb>,
  from: string,
  lastMessage: string,
  memoria: Memoria
): Promise<void> {
  if (!db) return;
  void (async () => {
    try {
      await db.from('conversaciones').upsert({
        telefono: from,
        ultimo_mensaje: lastMessage.substring(0, 100),
        ultimo_mensaje_at: new Date().toISOString(),
        memoria,
      }, { onConflict: 'telefono' });
    } catch (e) { console.error('Error updating conversacion:', e); }
  })();
}

// ─── Send WhatsApp Message ────────────────────────────────────────────────────
async function sendMsg(to: string, text: string, previewUrl = false): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/[^0-9]/g, ''),
          type: 'text',
          text: { preview_url: previewUrl, body: text },
        }),
      }
    );

    if (!resp.ok) {
      console.error('❌ WhatsApp send error:', await resp.text());
      return;
    }

    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`📤 Enviado a ${to}. ID: ${wa_id}`);

    // Save outgoing (non-blocking)
    const db = getDb();
    if (db) {
      void (async () => {
        try {
          await db.from('mensajes_whatsapp').insert({
            from_number: 'system', to_number: to,
            body: text, tipo: 'saliente',
            wa_message_id: wa_id, es_ia: true,
          });
        } catch (e) { console.error('Error saving saliente:', e); }
      })();
    }
  } catch (e) {
    console.error('❌ sendMsg error:', e);
  }
}

// ─── Intent Detection Helpers ─────────────────────────────────────────────────
function isLocationRequest(lower: string): boolean {
  return ['ubicacion', 'ubicación', 'donde', 'dirección', 'llegar', 'ubicado', 'gps', 'mapa', 'dirección']
    .some(k => lower.includes(k));
}

function isContactRequest(lower: string): boolean {
  return ['numero del asesor', 'número del asesor', 'contacto del asesor', 'hablar con alguien',
    'numero de whatsapp', 'número de whatsapp', 'comunicarme', 'contacto directo', 'hablar con una persona',
    'número de contacto', 'numero de contacto', 'whatsapp del taller']
    .some(k => lower.includes(k));
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
