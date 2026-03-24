import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const ASESOR_PHONE = '584123343519';
const ASESOR_DISPLAY_NAME = 'Asesor Lycos Team';
const IG_LINK = 'https://www.instagram.com/lycos.team?igsh=MzVwZ3NkbnN2OHk=';
const TT_LINK = 'https://www.tiktok.com/@lycos.team?_r=1&_t=ZS-94prPaQnR5E';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Exchange Rates ────────────────────────────────────────────────────────────
interface ExchangeRates {
  bcv: number;        // VES per USD (BCV official)
  paralelo: number;   // VES per USD (parallel / Binance P2P)
  fetchedAt: string;
}

let ratesCache: ExchangeRates | null = null;
let ratesCacheTime = 0;
const RATES_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  if (ratesCache && Date.now() - ratesCacheTime < RATES_TTL) return ratesCache;
  try {
    const resp = await fetch('https://ve.dolarapi.com/v1/dolares', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return ratesCache;
    const data: { nombre: string; promedio: number }[] = await resp.json();
    const bcvEntry = data.find(d => d.nombre?.toLowerCase().includes('oficial') || d.nombre?.toLowerCase().includes('bcv'));
    const parEntry = data.find(d => d.nombre?.toLowerCase().includes('paralelo') || d.nombre?.toLowerCase().includes('cripto') || d.nombre?.toLowerCase().includes('binance'));
    if (!bcvEntry || !parEntry) return ratesCache;
    ratesCache = {
      bcv: bcvEntry.promedio,
      paralelo: parEntry.promedio,
      fetchedAt: new Date().toISOString(),
    };
    ratesCacheTime = Date.now();
    console.log(`💱 Tasas actualizadas: BCV ${ratesCache.bcv} | Paralelo ${ratesCache.paralelo}`);
    return ratesCache;
  } catch (e) {
    console.error('Error fetching rates:', e);
    return ratesCache;
  }
}

function formatBs(amount: number): string {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function buildRatesContext(rates: ExchangeRates | null): string {
  if (!rates) return '\nTASAS DE CAMBIO: No disponibles en este momento. Di al cliente "te confirmamos el precio en bolívares al momento".';
  return `
TASAS DE CAMBIO ACTUALES (actualizado: ${rates.fetchedAt.substring(0, 16)}):
- Tasa BCV oficial: Bs. ${formatBs(rates.bcv)} por dólar
- Tasa paralela/Binance: Bs. ${formatBs(rates.paralelo)} por dólar

CONVERSIÓN DE PRECIOS EN DIVISAS A BOLÍVARES:
Los precios "en divisas" son a tasa paralela/Binance. Para mostrar el equivalente en bolívares al cliente:
  Bs = Precio_USD × Tasa_BCV
Ejemplo: $60 en divisas → Bs. ${formatBs(60 * rates.bcv)} (a tasa BCV oficial)

Cuando muestres un precio en divisas, añade al final:
"💵 Precio en divisas: $X | 💴 En bolívares (BCV): Bs. [calculado]"

IMPORTANTE: Los precios "100% a BCV" (alineación, cauchos, lavado) ya están en USD-equivalente BCV. Para esos, muestra directamente la equivalencia en bolívares.`;
}

// ─── Strip markdown for WhatsApp ──────────────────────────────────────────────
function cleanForWhatsApp(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')   // ***bold italic*** → plain
    .replace(/\*\*(.+?)\*\*/g, '$1')        // **bold** → plain
    .replace(/\*([^\s*][^*]*[^\s*])\*/g, '$1') // *bold* → plain (careful not to remove list bullets)
    .replace(/^[\s]*\*\s+/gm, '• ')         // * item (list) → • item
    .replace(/#{1,6}\s+/g, '')              // ## Headers → plain
    .replace(/__(.+?)__/g, '$1')            // __text__ → plain
    .replace(/_([^\s_][^_]*[^\s_])_/g, '$1') // _italic_ → plain
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // `code` → plain
    .replace(/\n{3,}/g, '\n\n')             // max 2 newlines
    .trim();
}

// ─── Venezuela date/time helpers ───────────────────────────────────────────────
function getVzlaDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
}
function getVzlaDateString(): string { return getVzlaDate().toISOString().split('T')[0]; }
function getVzlaDayOfWeek(): number { return getVzlaDate().getDay(); }
function formatVzlaDateTime(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
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
    const t = new Date(today); t.setDate(t.getDate() + 1);
    return t.toISOString().split('T')[0];
  }
  const dayMap: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6,
  };
  for (const [name, target] of Object.entries(dayMap)) {
    if (lower.includes(name)) {
      const d = new Date(today);
      let diff = target - d.getDay();
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

SALUDO INICIAL (solo sesión NUEVA — adapta según hora del día):
"Bienvenido a Lycos Team 🔧 Soy tu asistente virtual y estoy aquí para ayudarte con servicios, precios, citas, inventario y lo que necesites. Cuéntame, en que te puedo ayudar? 😊"

REVISION GRATIS: La revisión inicial del vehículo en el taller es TOTALMENTE GRATUITA. Siempre menciona esto cuando sea relevante.

REDES SOCIALES: Instagram y TikTok @lycos.team (el sistema envía la tarjeta/enlace nativo automáticamente si el cliente pide seguir en redes)
Enlace perfil general: https://www.lycos.team

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO sin excepciones.
UBICACION: San Antonio de los Altos, Altos Mirandinos, Miranda.

EMOJIS: Usa al menos 1 emoji por respuesta cuando corresponda. No satures, pero que se sienta humano y cercano. Ejemplos: 🔧 mecánica, 🚗 vehículo, 💰💵 precios, 📅 citas, 🎉 confirmaciones, 😊 amibilidad.

FORMATO: NO uses asteriscos (*) ni markdown en tus respuestas. Usa texto plano. Para listas usa guiones (-) o viñetas (•). Nunca uses **negrita** ni _cursiva_.

PRECIOS — METODO DE CONVERSION:
El sistema te proveerá la tasa BCV y paralela actuales. Cuando muestres precios "en divisas":
Formato: "Precio en divisas: $X | En bolívares (BCV): Bs. [X × tasa_bcv]"
Los precios "a BCV" (alineación, cauchos, lavado) muéstralos directo con su equivalente en Bs.

SERVICIOS Y PRECIOS:

SILENCIADORES Y ESCAPE — Fabricación propia, redondos tipo original, lámina galvanizada gruesa. EN DIVISAS con instalación:
- CL27: hasta 1.3L → $40
- CL30: hasta 1.3L → $40
- CL40: hasta 1.5L → $50
- CLH40: hasta 2.0L → $60
- CL60: desde 3.8L → $90
- CLC60: camión → $90
- CLCP60/CLP60: platanero → $90
- CLK60: fabricación especial $100 — SOLO para Kia Sportage y Dodge Caliber
- Resonador: $40
- Flowmaster Serie 40: $140 (instalación incluida, flexibles doble malla)
- Flexibles doble malla: $40
- Tubo silenciador/cola: Primer metro $30, metros adicionales $20/metro, soldadura $10, gomas $7
- Colas cromadas: B55 $25, Camioneta $35, Curba $30
Presupuesto válido 2 días. Pide marca/modelo/año/cilindraje para recomendar el código.

MECANICA Y FRENOS:
- Mecánica ligera, limpieza de inyectores
- Frenos completo: precios previa evaluación
- Terminal de dirección: $15 c/lado | Rótula: $20 c/lado (tras estos servicios debe alinear)
- Amortiguador: $40 c/u (EN DIVISAS)

ALINEACION (100% a BCV — mostrar equivalente en Bs):
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
- Display Ford Fiesta (km/gasolina): $60 c/u. SIEMPRE pregunta qué modelo tiene (2 modelos). Ver servicio: https://vt.tiktok.com/ZSuqsSgb5/
- OBD II: escáner según disponibilidad en la cita

ESTETICA: Pulitura de faros, Latonería y pintura (previa cotización), Papel ahumado, Cámaras 360.

OTROS: Grúa (consultar asesor), Renovación de RCV, Inventario de repuestos.

CASHEA:
El IVA 16% se suma al PRECIO TOTAL, no a la inicial.
Ejemplo: $100 + 16% IVA = $116 total → el cliente paga su inicial sobre $116.
Pide el nivel PRIMERO → Nivel 1: 60% | Nivel 2: 50% | Niveles 3-6: 40%
Resto en 3 cuotas cada 14 días. Pago en caja.

CITAS:
Pedir: nombre, vehículo (marca/modelo/año), servicio, día y hora (L-S, 8AM-5PM).
Calcula fecha desde hoy en Venezuela. Nunca agendes domingos. Confirma: día + fecha completa.

ASESOR: Solo mencionarlo si el cliente lo pide, hay queja compleja, o el bot no puede resolver.
Cuando corresponda di: "Te envío el contacto de nuestro asesor 👇" (sistema envía la tarjeta).

FILTROS E INVENTARIO: Refrigerantes y líquidos Dr Care | Filtros aceite/gasolina CARDOC para múltiples vehículos. Stock en tiempo real en el sistema.
COMPORTAMIENTO: Español venezolano, amigable, máximo 4-5 líneas, no improvises precios, texto plano sin asteriscos.
`;

// ─── GET: Webhook verification ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
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
    if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' });

    for (const message of value.messages) {
      const from: string = message.from;
      const wa_message_id: string = message.id;
      const db = getDb();

      // Deduplication
      if (db && wa_message_id) {
        try {
          const { data: rows } = await db
            .from('mensajes_whatsapp').select('id').eq('wa_message_id', wa_message_id).limit(1);
          if (rows && rows.length > 0) { console.log(`⏭️ Dup (${wa_message_id})`); continue; }
        } catch { /* ok */ }
      }

      let messageBody = '';
      if (message.type === 'text') {
        messageBody = message.text?.body || '';
      } else if (message.type === 'image') {
        messageBody = '[Cliente envió imagen]';
      } else if (message.type === 'audio') {
        const audioId = message.audio?.id;
        if (audioId && WHATSAPP_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, {
              headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
            });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              if (mediaData.url) {
                const mediaResp = await fetch(mediaData.url, {
                  headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                });
                if (mediaResp.ok) {
                  const arrayBuffer = await mediaResp.arrayBuffer();
                  const base64Data = Buffer.from(arrayBuffer).toString('base64');
                  const mimeType = mediaData.mime_type || 'audio/ogg';
                  
                  const transcript = await transcribeAudio(base64Data, mimeType);
                  if (transcript) {
                    messageBody = `${transcript} (Audio transcrito)`;
                    console.log(`🎙️ Audio transcrito de [${from}]: ${transcript.substring(0, 50)}...`);
                  } else {
                    messageBody = '[Cliente envió audio, pero no se pudo transcribir]';
                  }
                } else {
                  console.error('Error descargando audio de WhatsApp');
                  messageBody = '[Cliente envió audio]';
                }
              } else {
                messageBody = '[Cliente envió audio]';
              }
            } else {
              console.error('Error obteniendo URL del audio', await mediaUrlResp.text());
              messageBody = '[Cliente envió audio]';
            }
          } catch (e) {
            console.error('Excepción al procesar audio:', e);
            messageBody = '[Cliente envió audio]';
          }
        } else {
          messageBody = '[Cliente envió audio]';
        }
      } else if (message.type === 'document') {
        messageBody = '[Cliente envió documento]';
      } else if (message.type === 'location') {
        const loc = message.location;
        messageBody = `[Cliente compartió ubicación: ${loc?.latitude}, ${loc?.longitude}]`;
      }
      if (!messageBody) continue;
      console.log(`📩 [${from}]: ${messageBody.substring(0, 80)}`);

      // Save incoming (non-blocking)
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

      // Load context + exchange rates in parallel
      const [ctx, rates] = await Promise.all([
        loadConversationContext(db, from, messageBody),
        fetchExchangeRates(),
      ]);

      const lowerBody = messageBody.toLowerCase();

      // Location intent
      if (isLocationRequest(lowerBody)) {
        await sendMsg(from, '📍 Estamos en San Antonio de los Altos, Miranda. Te mando el mapa y un video de cómo llegar 👇');
        await delay(700);
        await sendMsg(from, 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(600);
        await sendMsg(from, 'https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(600);
        await sendMsg(from, 'Siguenos en nuestras redes 📱👇');
        await delay(400);
        await sendMsg(from, IG_LINK, true);
        await delay(500);
        await sendMsg(from, TT_LINK, true);
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // Social media intent
      if (isSocialRequest(lowerBody)) {
        await sendMsg(from, 'Aqui te van nuestras redes sociales 📱 Siguenos para tips, novedades y promos 🔧');
        await delay(500);
        await sendMsg(from, IG_LINK, true);
        await delay(500);
        await sendMsg(from, TT_LINK, true);
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // Asesor contact intent (explicit)
      if (isContactRequest(lowerBody)) {
        await sendMsg(from, 'Con gusto 😊 Te comparto el contacto directo de nuestro asesor:');
        await delay(600);
        await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
        await updateConversation(db, from, messageBody, ctx.memoria);
        continue;
      }

      // AI response
      const aiResponse = await getAIResponse(messageBody, ctx, rates);

      if (aiResponse) {
        const cleanedAi = cleanForWhatsApp(aiResponse);
        const needsAsesor = aiNeedsAsesor(cleanedAi);

        if (needsAsesor) {
          const withoutPhone = cleanedAi
            .replace(/https?:\/\/wa\.me\/\S+/gi, '')
            .replace(/wa\.me\/\S+/gi, '')
            .replace(/\+?58\s?412[\s\-]?334[\s\-]?3519/g, '')
            .trim();
          if (withoutPhone) { await sendMsg(from, withoutPhone); await delay(700); }
          await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
        } else {
          // TikTok links — send separately with preview
          const tiktokMatch = cleanedAi.match(/https?:\/\/(?:vt\.tiktok\.com|tiktok\.com)\/\S+/i);
          if (tiktokMatch) {
            const textWithout = cleanedAi.replace(tiktokMatch[0], '').trim();
            if (textWithout) { await sendMsg(from, textWithout); await delay(500); }
            await sendMsg(from, tiktokMatch[0], true);
          } else {
            const hasUrl = /https?:\/\//.test(cleanedAi);
            await sendMsg(from, cleanedAi, hasUrl);
          }
        }

        void processIntents(db, from, messageBody, ctx);
      }

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
  vehiculos?: { marca: string; modelo: string; anio?: string }[];
  notas?: string;
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

  // Message history
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
        .slice(0, 12).reverse();
      historia = filtered.map(m => ({ role: m.tipo === 'entrante' ? 'user' : 'model', parts: [{ text: m.body }] }));
      const latest = msgs[0];
      if (latest?.created_at) {
        const diffH = (Date.now() - new Date(latest.created_at).getTime()) / 3600000;
        if (diffH < 12) isNewSession = false;
      }
    }
  } catch (e) { console.error('Error loading history:', e); }

  // Memoria
  try {
    const { data: convRows } = await db.from('conversaciones').select('memoria').eq('telefono', from).limit(1);
    if (convRows?.[0]?.memoria) memoria = convRows[0].memoria as Memoria;
  } catch (e) { console.error('Error loading memoria:', e); }

  // Appointments
  try {
    const today = getVzlaDateString();
    const { data: citas } = await db.from('citas')
      .select('fecha, hora, tipo_servicio, descripcion, estado')
      .eq('telefono', from).order('fecha', { ascending: true }).limit(5);
    if (citas && citas.length > 0) {
      const list = citas.map(c => `- ${c.fecha} ${c.hora} | ${c.tipo_servicio} | ${c.estado} ${c.fecha < today ? '(PASADA)' : '(PROXIMA)'}`).join('\n');
      citasInfo = `\nCITAS DEL CLIENTE:\n${list}`;
    }
  } catch (e) { console.error('Error loading citas:', e); }

  // Inventory (only when relevant)
  const lower = currentMessage.toLowerCase();
  const invKw = ['silenciador','resonador','flexible','cola','filtro','aceite','gasolina','refrigerante','liquido','líquido',
    'liga','dot','repuesto','stock','inventario','disponible','hay','tienes','precio','cl27','cl30','cl40','clh40',
    'cl60','clk60','clc60','clp60','b55','curba','flowmaster','arauca','aveo','corolla','twingo','cavalier',
    'camry','sentra','blazer','lancer','cherokee','explorer','samuray','macho'];
  if (invKw.some(k => lower.includes(k))) {
    try {
      const { data: items } = await db.from('inventario')
        .select('nombre, codigo, precio_usd, stock, categoria').eq('activo', true)
        .order('categoria').order('nombre');
      if (items && items.length > 0) {
        const list = items.map(i =>
          `  - ${i.nombre}${i.codigo ? ' ['+i.codigo+']' : ''}${i.precio_usd ? ': $'+i.precio_usd : ''} — ${i.stock > 0 ? 'Stock: '+i.stock : 'SIN STOCK'}`
        ).join('\n');
        inventarioInfo = `\nINVENTARIO ACTUAL:\n${list}`;
      }
    } catch (e) { console.error('Error loading inventory:', e); }
  }

  return { historia, memoria, citasInfo, inventarioInfo, isNewSession };
}

// ─── AI Response ───────────────────────────────────────────────────────────────
async function getAIResponse(
  userMessage: string,
  ctx: ConversationContext,
  rates: ExchangeRates | null
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const vzlaDateTime = formatVzlaDateTime();
  const vzlaDateStr = getVzlaDateString();
  const dayNum = getVzlaDayOfWeek();
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dayName = dayNames[dayNum];

  const memoriaStr = Object.keys(ctx.memoria).length > 0
    ? `\nMEMORIA DEL CLIENTE:\n- Nombre: ${ctx.memoria.nombre || 'no registrado'}\n- Vehiculos: ${ctx.memoria.vehiculos?.map(v => `${v.marca} ${v.modelo}${v.anio ? ' '+v.anio : ''}`).join(', ') || 'no registrado'}\n- Notas: ${ctx.memoria.notas || 'ninguna'}`
    : '';

  const ratesCtx = buildRatesContext(rates);

  const systemPrompt = `${LYCOS_KNOWLEDGE}

FECHA/HORA VENEZUELA: ${vzlaDateTime}
HOY ES: ${dayName} ${vzlaDateStr}
${dayNum === 0 ? 'HOY ES DOMINGO — Taller CERRADO. Informa y sugiere mañana (lunes).' : ''}
SESION: ${ctx.isNewSession ? 'NUEVA — usa el saludo de bienvenida' : 'CONTINUA — ve al tema, sin repetir saludo'}
${memoriaStr}
${ctx.citasInfo}
${ctx.inventarioInfo}
${ratesCtx}

REGLAS CRITICAS:
- NUNCA uses asteriscos (*) en tus respuestas. Texto plano siempre. Listas con - o numeradas.
- Pon al menos 1 emoji relevante en la respuesta.
- Usa la fecha (${vzlaDateStr}) para calcular fechas relativas. Nunca agendes domingo.
- Para precios en divisas: muestra el precio USD Y el equivalente en bolivares (BCV).
- Stock/disponibilidad: usa el INVENTARIO ACTUAL.
- Citas registradas: indica si son pasadas o proximas.
- Asesor: solo si el cliente lo pide o sea imprescindible.
- Un cliente puede tener varios vehiculos.
- No repitas preguntas ya respondidas en el historial.`;

  const contents = [...ctx.historia, { role: 'user', parts: [{ text: userMessage }] }];

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
    if (!resp.ok) { console.error(`❌ Gemini ${resp.status}:`, (await resp.text()).substring(0, 200)); return null; }
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (text) console.log(`✅ Gemini: "${text.substring(0, 70)}..."`);
    return text;
  } catch (e) { console.error('❌ getAIResponse:', e); return null; }
}

async function transcribeAudio(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const sttModel = GEMINI_MODEL;
  const systemPrompt = "Eres un sistema de reconocimiento de voz. Tu UNICA tarea es transcribir el audio a texto exacto en español. NO agregues explicaciones, respuestas, introducciones ni comentarios. Solo escribe lo que el usuario dice en español tal cual.";
  
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${sttModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } },
              { text: "Transcribe el audio siguiente:" }
            ]
          }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );
    if (!resp.ok) {
      console.error(`❌ Gemini STT error ${resp.status}:`, (await resp.text()).substring(0, 200));
      return null;
    }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error('❌ transcribeAudio excepcion:', e);
    return null;
  }
}

function aiNeedsAsesor(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('te envío el contacto') || lower.includes('contacto de nuestro asesor') ||
    lower.includes('wa.me/') || lower.includes('584123343519');
}

// ─── Intent Processing → DB writes ────────────────────────────────────────────
async function processIntents(
  db: ReturnType<typeof getDb>,
  from: string,
  userMsg: string,
  ctx: ConversationContext
): Promise<void> {
  if (!db) return;
  const newMemoria: Memoria = { ...ctx.memoria };
  let memChanged = false;

  const nameMatch = userMsg.match(/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{1,30})/i);
  if (nameMatch && !newMemoria.nombre) { newMemoria.nombre = nameMatch[1].trim(); memChanged = true; }

  const vehicleMatch = userMsg.match(/\b(toyota|ford|chevrolet|hyundai|kia|honda|nissan|mazda|volkswagen|corsa|aveo|spark|cruze|sail|captiva|tucson|sportage|yaris|hilux|ranger|sentra|tiida|versa|frontier|civic|fit|crv|gol|bora|jetta|polo|peugeot|renault|mitsubishi|suzuki|isuzu|fiesta|caliber|dodge|lancer|accent|elantra)[^\n,]{0,25}/i);
  const yearMatch = userMsg.match(/\b(19[8-9]\d|20[0-2]\d)\b/);
  if (vehicleMatch) {
    const parts = vehicleMatch[0].trim().split(/\s+/);
    const v = { marca: parts[0], modelo: parts.slice(1).join(' ') || parts[0], anio: yearMatch?.[1] };
    if (!newMemoria.vehiculos) newMemoria.vehiculos = [];
    const exists = newMemoria.vehiculos.some(x => x.marca.toLowerCase() === v.marca.toLowerCase() && x.modelo.toLowerCase() === v.modelo.toLowerCase());
    if (!exists) { newMemoria.vehiculos.push(v); memChanged = true; }
  }

  const bookingKw = ['cita', 'agendar', 'reservar', 'cuando puedo', 'quiero ir'];
  if (bookingKw.some(k => userMsg.toLowerCase().includes(k))) {
    await tryBookAppointment(db, from, userMsg);
  }

  if (memChanged) {
    try {
      await db.from('conversaciones').upsert({ telefono: from, memoria: newMemoria }, { onConflict: 'telefono' });
    } catch (e) { console.error('Error saving memoria:', e); }
    try {
      const { data: existing } = await db.from('clientes').select('id').eq('telefono', from).limit(1);
      if (!existing || existing.length === 0) {
        const parts = (newMemoria.nombre || 'Cliente').split(' ');
        await db.from('clientes').insert({ nombre: parts[0], apellido: parts.slice(1).join(' ') || 'WhatsApp', telefono: from });
      }
    } catch (e) { console.error('Error upsert cliente:', e); }
  }
}

// ─── Appointment Booking ───────────────────────────────────────────────────────
async function tryBookAppointment(db: ReturnType<typeof getDb>, from: string, userMsg: string): Promise<void> {
  if (!db) return;
  let fecha = resolveRelativeDate(userMsg);
  if (!fecha) {
    const m = userMsg.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? '20'+m[3] : m[3]) : getVzlaDate().getFullYear().toString();
      fecha = `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
  }
  if (!fecha) return;
  if (isSunday(fecha)) { console.log(`⛔ Domingo bloqueado: ${fecha} → ${getNextWorkingDay(fecha)}`); return; }

  const tm = userMsg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/);
  let hora = '08:00';
  if (tm) {
    let h = parseInt(tm[1]);
    const m = tm[2] ? parseInt(tm[2]) : 0;
    const mer = tm[3]?.toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    hora = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  }

  try {
    const dt = new Date(`${fecha}T${hora}:00`);
    const ws = new Date(dt.getTime() - 3600000);
    const we = new Date(dt.getTime() + 3600000);
    const st = `${ws.getHours().toString().padStart(2,'0')}:${ws.getMinutes().toString().padStart(2,'0')}`;
    const et = `${we.getHours().toString().padStart(2,'0')}:${we.getMinutes().toString().padStart(2,'0')}`;
    const { data: conflicts } = await db.from('citas').select('hora').eq('fecha', fecha).neq('estado','cancelada').gte('hora',st).lte('hora',et);
    if (conflicts && conflicts.length > 0) { console.log(`⚠️ Conflicto cita ${fecha} ${hora}`); return; }
    const sm = userMsg.match(/(?:para|quiero|necesito)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ\s]{3,40})/i);
    await db.from('citas').insert({ fecha, hora, telefono: from, tipo_servicio: 'otro', descripcion: sm?.[1]?.trim() || 'Servicio por WhatsApp', estado: 'pendiente', duracion_minutos: 60 });
    console.log(`📅 Cita: ${fecha} ${hora} para ${from}`);
  } catch (e) { console.error('Error booking:', e); }
}

// ─── Update conversation row ───────────────────────────────────────────────────
async function updateConversation(db: ReturnType<typeof getDb>, from: string, lastMsg: string, memoria: Memoria): Promise<void> {
  if (!db) return;
  void (async () => {
    try {
      await db.from('conversaciones').upsert({
        telefono: from, ultimo_mensaje: lastMsg.substring(0,100),
        ultimo_mensaje_at: new Date().toISOString(), memoria,
      }, { onConflict: 'telefono' });
    } catch (e) { console.error('Error update conversacion:', e); }
  })();
}

// ─── Send WhatsApp Text ────────────────────────────────────────────────────────
async function sendMsg(to: string, text: string, previewUrl = false): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: to.replace(/[^0-9]/g, ''), type: 'text',
        text: { preview_url: previewUrl, body: text },
      }),
    });
    if (!resp.ok) { console.error('❌ sendMsg error:', (await resp.text()).substring(0,200)); return; }
    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`📤 Sent to ${to}. ID: ${wa_id}`);
    const db = getDb();
    if (db) {
      void (async () => {
        try {
          await db.from('mensajes_whatsapp').insert({ from_number: 'system', to_number: to, body: text, tipo: 'saliente', wa_message_id: wa_id, es_ia: true });
        } catch (e) { console.error('Error saving saliente:', e); }
      })();
    }
  } catch (e) { console.error('❌ sendMsg exception:', e); }
}

// ─── Send Native Contact Card ──────────────────────────────────────────────────
async function sendContactCard(to: string, phone: string, displayName: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
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
    });
    if (!resp.ok) {
      console.error('❌ Contact card error:', (await resp.text()).substring(0,200));
      await sendMsg(to, `Contacto del asesor: https://wa.me/${cleanPhone}`, true);
      return;
    }
    const data = await resp.json();
    console.log(`📇 Card sent to ${to}. ID: ${data.messages?.[0]?.id}`);
    const db = getDb();
    if (db) {
      void (async () => {
        try {
          await db.from('mensajes_whatsapp').insert({ from_number: 'system', to_number: to, body: `[Tarjeta contacto: ${displayName}]`, tipo: 'saliente', es_ia: true });
        } catch (e) { console.error('Error saving card:', e); }
      })();
    }
  } catch (e) {
    console.error('❌ sendContactCard:', e);
    await sendMsg(to, `Contacto del asesor: https://wa.me/${cleanPhone}`, true);
  }
}

// ─── Intent Detection ──────────────────────────────────────────────────────────
function isLocationRequest(lower: string): boolean {
  return ['ubicacion','ubicación','donde est','dirección','direccion','llegar','ubicado','gps','mapa'].some(k => lower.includes(k));
}
function isSocialRequest(lower: string): boolean {
  return ['instagram','tiktok','redes sociales','redes','sigueme','seguir','perfil redes','@lycos'].some(k => lower.includes(k));
}
function isContactRequest(lower: string): boolean {
  return ['numero del asesor','número del asesor','contacto del asesor','hablar con alguien',
    'numero de whatsapp','número de whatsapp','hablar con una persona','número de contacto',
    'numero de contacto','whatsapp del taller','hablar con un humano','asesor humano',
    'quiero hablar con','necesito hablar con'].some(k => lower.includes(k));
}
function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
