import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';

// ─── Fire push notification to all subscribed devices ──────────────────────────
async function firePushNotification(payload: {
  title: string;
  body: string;
  type: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { /* never block webhook processing */ }
}

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

// ─── Upload media to Supabase Storage ──────────────────────────────────────────
async function uploadMediaToStorage(
  arrayBuffer: ArrayBuffer,
  mimeType: string,
  mediaId: string
): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  
  try {
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `${Date.now()}-${mediaId.slice(-8)}.${ext}`;
    const sb = createClient(url, key);
    const { error } = await sb.storage
      .from('whatsapp-media')
      .upload(fileName, arrayBuffer, { contentType: mimeType, upsert: false });
    
    if (error) {
      console.error('Storage upload error:', error.message);
      return null;
    }
    const { data: publicData } = sb.storage.from('whatsapp-media').getPublicUrl(fileName);
    return publicData?.publicUrl || null;
  } catch (e) {
    console.error('uploadMediaToStorage exception:', e);
    return null;
  }
}

// ─── Exchange Rates Logic ──────────────────────────────────────────────────────
interface ExchangeRates {
  bcv: number;        // VES per USD (BCV official)
  paralelo: number;   // VES per USD (parallel / Binance P2P)
  fetchedAt: string;
}

let ratesCache: ExchangeRates | null = null;
let ratesCacheTime = 0;
const RATES_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  if (ratesCache && (Date.now() - ratesCacheTime < RATES_TTL)) {
    return ratesCache;
  }

  try {
    let bcvRate = 0;
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (respBcv.ok) {
        const bcvEntry = await respBcv.json();
        if (bcvEntry) {
          bcvRate = bcvEntry.promedio || bcvEntry.precio || 0;
        }
      }
    } catch (e) { console.error('Error fetching BCV:', e); }

    let binanceRate = 0;
    try {
      const respBin = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          fiat: "VES", page: 1, rows: 10, tradeType: "BUY", asset: "USDT",
          countries: [], proMerchantAds: false, shieldMerchantAds: false,
          publisherType: null, payTypes: ["PagoMovil"], classifies: ["mass", "profession", "user"]
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (respBin.ok) {
        const binData = await respBin.json();
        if (binData.data && binData.data.length > 0) {
          binanceRate = parseFloat(binData.data[0].adv.price);
        }
      }
    } catch (e) { console.error('Error fetching Binance P2P:', e); }

    if (!bcvRate && ratesCache) bcvRate = ratesCache.bcv;
    if (!binanceRate && ratesCache) binanceRate = ratesCache.paralelo;

    if (!binanceRate) {
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo');
        if (tempResp.ok) {
          const parEntry = await tempResp.json();
          if (parEntry) binanceRate = parEntry.promedio || parEntry.precio || 0;
        }
      } catch (e) {}
    }

    if (!bcvRate || !binanceRate) return ratesCache;

    ratesCache = {
      bcv: bcvRate,
      paralelo: binanceRate,
      fetchedAt: new Date().toISOString(),
    };
    ratesCacheTime = Date.now();
    return ratesCache;
  } catch (e) {
    console.error('Error general fetchExchangeRates:', e);
    return ratesCache;
  }
}

function calculateBcvPrice(usdPromo: number, rates: ExchangeRates): number {
  return (usdPromo * rates.paralelo) / rates.bcv;
}

function buildRatesContext(rates: ExchangeRates | null): string {
  if (!rates) return '\nTASAS DE CAMBIO: No disponibles en este momento.';
  
  const multiplier = rates.paralelo / rates.bcv;
  
  return `
REGLA DE CONVERSIÓN MONETARIA (CRÍTICO):
Sigue ESTRICTAMENTE estas reglas para dar precios al cliente:

1) SERVICIOS A TASA BCV:
   - Aplica para: Alineación, Cauchos, Monturas, Autolavado, y Certificado Médico.
   - PRECIO: Di solo el monto en dólares seguido de "a tasa BCV".
   - REGLA DE ORO: ¡PROHIBIDO! No des el precio en bolívares (Bs.) bajo ninguna circunstancia.
   - AVISO DE PAGO: Cuando des un precio, puedes advertir MUY BREVEMENTE que "se trabaja a tasa BCV al momento de pagar". NUNCA lo repitas en cada uno de tus mensajes para no ser repetitivo, hazlo solo en el momento exacto que dictes el precio de un presupuesto y ya.

2) SERVICIOS EN 'PROMOCIÓN EN DIVISAS':
   - Aplica para: Escapes, Silenciadores, Resonadores, Mecánica, Frenos, Catalizador, Electrónica, Estética, etc. (Todo lo que sea de la lista general o se mencione como promo).
   - PRECIO: Debes mostrar DOS montos en dólares:
     a) "Promocion en divisas: $[MontoOriginal]"
     b) "Precio: $[MontoConvertido] a tasa BCV"
   - CONVERSIÓN: El MontoConvertido se calcula como: MontoOriginal * ${multiplier.toFixed(4)}. IMPORTANTE: Redondea siempre el resultado final HACIA ARRIBA al múltiplo de 5 más cercano para que los precios terminen estrictamente en 0 o en 5, a favor del taller. Siempre que de por ejemplo 47,22 debe de dar 50, o 57,03 debe de dar 60 para redondearlo completamente hacia arriba obligatoriamente en todos los casos de promo divisa a dólares BCV. REGLA ESTRICTA: NUNCA le digas al cliente que redondeaste el precio ni le des explicaciones matemáticas. Simplemente asume ese número final como el precio oficial y dáselo con total naturalidad.
   - REGLA DE ORO: ¡PROHIBIDO! NUNCA menciones "Binance", "P2P", "paralela", "externa", ni des el precio en bolívares (Bs.) bajo ninguna circunstancia.
   - AVISO DE PAGO: Al igual que en la regla anterior, solo aclara que el pago es a tasa BCV cuando vayas a arrojar el precio. Está terminantemente prohibido estar repitiendo frases largas de "a tasa del BCV en la caja..." en más de un mensaje; hazlo natural y casual.

EJEMPLO PARA "PROMOCIÓN EN DIVISAS" ($40):
Promocion en divisas: $40
Precio: $60 a tasa BCV
`;
}

function cleanForWhatsApp(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*([^\s*][^*]*[^\s*])\*/g, '$1')
    .replace(/^[\s]*\*\s+/gm, '• ')
    .replace(/#{1,6}\s+/g, '')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_([^\s_][^_]*[^\s_])_/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getVzlaDate(): Date {
  const now = new Date();
  const vzlaOffset = -4 * 60;
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (vzlaOffset) * 60000);
}
function getVzlaDateString(): string { return getVzlaDate().toISOString().split('T')[0]; }
function getVzlaDayOfWeek(): number { return getVzlaDate().getDay(); }
function formatVzlaDateTime(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

const LYCOS_KNOWLEDGE = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team, taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
NUNCA digas que eres IA, bot, ChatGPT o robot. Si preguntan, di que eres el asistente del taller.

COMPORTAMIENTO Y TONO:
ES MUY IMPORTANTE QUE VARÍES TUS RESPUESTAS PARA SONAR MÁS HUMANO. NO SEAS REPETITIVO.
- Español venezolano, amigable, máximo 4-5 líneas, no improvises precios, texto plano sin asteriscos.
- Usa al menos 1 emoji por respuesta, pero sin saturar. Ejemplos: 🔧 🚗 💰 📅 😊.
- SALUDO INICIAL (solo sesión NUEVA): "Bienvenido a Lycos Team 🔧 Soy tu asistente virtual y estoy aquí para ayudarte con servicios, precios, citas, inventario y lo que necesites. Cuéntame, en que te puedo ayudar? 😊"
- REVISIÓN GRATIS: La revisión visual del vehículo al traerlo al taller es totalmente gratuita. Menciónalo SOLO UNA VEZ cuando trates de convencer al cliente de ir al taller para revisar un presupuesto que no puedes darle por chat.
- REDES SOCIALES: Instagram y TikTok @lycos.team.
- HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO.
- UBICACION: San Antonio de los Altos, Altos Mirandinos, Miranda.

CITAS:
Pedir obligatoriamente: nombre completo, placa (si la tiene), marca/modelo del vehículo, servicio, día y hora exacta.
No confirmes la cita sin nombre y al menos el modelo.
REGLA DE ORO DE CITAS: Cuando acordaste los datos, imprime:
[CITA: AAAA-MM-DD HH:MM | descripcion breve del servicio | marca modelo del vehiculo]
`;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// ─── GET: Webhook verification ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado!');
      return new NextResponse(challenge, { status: 200 });
    }
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST: Receive messages ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Cron retry logic (WATCHDOG) para retomar chats colgados
    if (body.object === 'whatsapp_cron_retry') {
      const { from, messageBody, wa_message_id } = body;
      const db = getDb();
      if (!db || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return NextResponse.json({ status: 'ok' });
      await processCoreLogic(db, from, messageBody, wa_message_id);
      return NextResponse.json({ status: 'ok' });
    }

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value || !value.messages) return NextResponse.json({ status: 'no_messages' });

    for (const message of value.messages) {
      const from = message.from;
      const wa_message_id = message.id;
      const db = getDb();

      // 1. Deduplicación por base de datos
      if (db) {
        try {
          const { data: rows } = await db.from('mensajes_whatsapp').select('id').eq('wa_message_id', wa_message_id).limit(1);
          if (rows && rows.length > 0) { console.log(`⏭️ Ignorando mensaje duplicado (${wa_message_id})`); continue; }
        } catch { }
      }

      // 2. Determinar el contenido del mensaje
      let messageBody = '';
      if (message.type === 'text') {
        messageBody = message.text?.body || '';
      } else if (message.type === 'image') {
        const mediaId = message.image.id;
        if (mediaId && WHATSAPP_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              const mediaResp = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
              if (mediaResp.ok) {
                const arrayBuffer = await mediaResp.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = mediaData.mime_type || 'image/jpeg';
                await uploadMediaToStorage(arrayBuffer, mimeType, mediaId);
                const desc = await describeImage(base64Data, mimeType);
                messageBody = `[Cliente envió imagen: ${message.image.caption || ''}] El sistema analizó la imagen y detectó: ${desc}`;
              }
            }
          } catch (e) { messageBody = `[Cliente envió imagen] ${message.image?.caption || ''}`; }
        } else { messageBody = `[Cliente envió imagen] ${message.image?.caption || ''}`; }
      } else if (message.type === 'audio') {
        const audioId = message.audio.id;
        if (audioId && WHATSAPP_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              const mediaResp = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
              if (mediaResp.ok) {
                const arrayBuffer = await mediaResp.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = mediaData.mime_type || 'audio/ogg';
                await uploadMediaToStorage(arrayBuffer, mimeType, audioId);
                const trans = await transcribeAudio(base64Data, mimeType);
                messageBody = `[Cliente envió audio] Transcripción: ${trans}`;
              }
            }
          } catch (e) { messageBody = '[Cliente envió audio]'; }
        } else { messageBody = '[Cliente envió audio]'; }
      } else if (message.type === 'location') {
        const { latitude, longitude } = message.location;
        messageBody = `[Cliente envió ubicación: LAT ${latitude}, LONG ${longitude}]`;
      }

      if (!messageBody) continue;
      console.log(`📩 Recibido de ${from}: ${messageBody.substring(0, 80)}...`);

      // 3. Procesar lógica principal si tenemos DB
      if (db && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        
        // --- Lógica de Agrupación (Debounce) ---
        // Guardamos este mensaje entrante inmediatamente
        const { data: insertedMsg } = await db.from('mensajes_whatsapp').insert({
          from_number: from, to_number: 'system', body: messageBody, tipo: 'entrante', wa_message_id
        }).select('created_at').single();
        
        const insertedAt = insertedMsg?.created_at || new Date().toISOString();

        // Esperamos un momento para ver si llegan más mensajes del mismo cliente
        await delay(1500);

        // Buscamos si hay UN mensaje más nuevo que el que acabamos de insertar
        const { data: newerMsg } = await db.from('mensajes_whatsapp')
          .select('id').eq('from_number', from).eq('tipo', 'entrante')
          .gt('created_at', insertedAt).limit(1);

        // Si existe un mensaje más nuevo, dejamos que el flujo de ese mensaje maneje la respuesta
        if (newerMsg && newerMsg.length > 0) {
          console.log(`⏩ Saltando respuesta para ${wa_message_id} porque hay un mensaje más reciente.`);
          continue;
        }

        // --- Verificación de Modo Humano ---
        const { data: conv } = await db.from('conversaciones').select('estado').eq('telefono', from).maybeSingle();
        if (conv?.estado === 'humano') {
          console.log(`👤 Sesión en modo HUMANO para ${from}. No responde el bot.`);
          await db.from('conversaciones').update({
            ultimo_mensaje: messageBody.substring(0, 200),
            ultimo_mensaje_at: new Date().toISOString(),
            mensajes_sin_leer: 1
          }).eq('telefono', from);
          
          await firePushNotification({ title: `Mensaje de ${from}`, body: messageBody.substring(0, 100), type: 'whatsapp', tag: from });
          continue;
        }

        // --- Procesar con IA ---
        await processCoreLogic(db, from, messageBody, wa_message_id);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Error en POST webhook:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── Lógica de Procesamiento Central ───────────────────────────────────────────
interface Memoria {
  nombre?: string;
  vehiculos?: { marca: string; modelo: string; anio?: string }[];
  notas?: string;
  placa?: string;
}
interface ConversationContext {
  historia: { role: string; parts: { text: string }[] }[];
  memoria: Memoria;
  citasInfo: string;
  inventarioInfo: string;
  isNewSession: boolean;
  agendaOcupada: string;
}

async function loadConversationContext(db: any, from: string, currentMessage: string): Promise<ConversationContext> {
  let historia: { role: string; parts: { text: string }[] }[] = [];
  let memoria: Memoria = {};
  let citasInfo = '';
  let inventarioInfo = '';
  let agendaOcupada = '';
  let isNewSession = true;

  if (!db) return { historia, memoria, citasInfo, inventarioInfo, isNewSession, agendaOcupada };

  try {
    const { data: msgs } = await db.from('mensajes_whatsapp')
      .select('body, tipo, created_at')
      .or(`from_number.eq.${from},to_number.eq.${from}`)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (msgs && msgs.length > 0) {
      const histMsgs = msgs.filter(m => !(m.body === currentMessage && m.tipo === 'entrante')).slice(0, 48).reverse();
      historia = histMsgs.map(m => ({ role: m.tipo === 'entrante' ? 'user' : 'model', parts: [{ text: m.body }] }));
      
      const lastMsg = msgs[0];
      if (lastMsg && lastMsg.created_at) {
        const lastDate = new Date(lastMsg.created_at);
        const diffHours = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
        if (diffHours < 12) isNewSession = false;
      }
    }
  } catch (e) { }

  try {
    const { data: conv } = await db.from('conversaciones').select('memoria').eq('telefono', from).maybeSingle();
    if (conv && conv.memoria) memoria = conv.memoria as Memoria;
  } catch (e) { }

  try {
    const { data: citas } = await db.from('citas').select('fecha, hora, descripcion, estado').eq('telefono', from).limit(5);
    if (citas && citas.length > 0) {
      citasInfo = `\nCITAS ACTUALES DEL CLIENTE:\n` + citas.map(c => `- ${c.fecha} a las ${c.hora} (${c.descripcion}) - Estado: ${c.estado}`).join('\n');
    }
  } catch (e) { }

  try {
    const { data: inv } = await db.from('inventario').select('nombre, stock, precio_usd').eq('activo', true).gt('stock', 0).limit(20);
    if (inv && inv.length > 0) {
      inventarioInfo = `\nINVENTARIO DISPONIBLE (Precios en USD):\n` + inv.map(i => `- ${i.nombre}: $${i.precio_usd} (Stock: ${i.stock})`).join('\n');
    }
  } catch (e) { }

  return { historia, memoria, citasInfo, inventarioInfo, isNewSession, agendaOcupada };
}

async function getOrCreateClientAndVehicle(db: any, phone: string, name: string, vehicleInfo: string, placa: string) {
  let clientId = null;
  let vehicleId = null;

  try {
    const { data: client } = await db.from('clientes').select('id').eq('telefono', phone).maybeSingle();
    if (client) { clientId = client.id; } else {
      const { data: newClient } = await db.from('clientes').insert({ nombre: name || 'Cliente WhatsApp', telefono: phone }).select('id').single();
      clientId = newClient?.id;
    }

    if (clientId) {
      if (placa) {
        const { data: veh } = await db.from('vehiculos').select('id').eq('placa', placa).maybeSingle();
        if (veh) vehicleId = veh.id; else {
          const { data: newVeh } = await db.from('vehiculos').insert({ cliente_id: clientId, placa, marca: vehicleInfo || 'Desconocida' }).select('id').single();
          vehicleId = newVeh?.id;
        }
      }
      await db.from('conversaciones').update({ cliente_id: clientId }).eq('telefono', phone);
    }
  } catch (e) { console.error('Error in getOrCreateClientAndVehicle:', e); }

  return { clientId, vehicleId };
}

async function processIntents(db: any, from: string, userMsg: string, ctx: ConversationContext) {
  if (!db) return;
  const nameMatch = userMsg.match(/(?:soy|me llamo|mi nombre es|llámame|llamame)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{1,30})/i);
  if (nameMatch) {
    const detectedName = nameMatch[1].trim();
    ctx.memoria.nombre = detectedName;
    await db.from('conversaciones').upsert({ telefono: from, memoria: ctx.memoria }, { onConflict: 'telefono' });
  }
}

async function getAIResponse(userMessage: string, context: ConversationContext, rates: ExchangeRates | null): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const systemPrompt = `
${LYCOS_KNOWLEDGE}

INFORMACIÓN EN TIEMPO REAL:
- FECHA Y HORA ACTUAL: ${formatVzlaDateTime()}
- DÍA DE LA SEMANA: ${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][getVzlaDayOfWeek()]}
${buildRatesContext(rates)}
${context.citasInfo}
${context.inventarioInfo}

DATOS DE LA MEMORIA DEL CLIENTE:
${JSON.stringify(context.memoria)}

INSTRUCCIONES DE SESIÓN:
- TIPO DE SESIÓN: ${context.isNewSession ? 'NUEVA (Saluda amigablemente)' : 'CONTINUA (Ve directo al punto)'}
`;

  const contents = [
    ...context.historia,
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents })
    });
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error('Error AI fetch:', e);
    return null;
  }
}

async function transcribeAudio(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }, { text: "Transcribe exactamente lo que dice el audio de este cliente de taller mecánico:" }]
        }]
      })
    });
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) { return null; }
}

async function describeImage(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }, { text: "Describe detalladamente lo que ves en esta imagen para ayudar al mecánico del taller Lycos Team. Identifica vehículos, piezas rotas, marcas o fallas visibles:" }]
        }]
      })
    });
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) { return null; }
}

function aiNeedsAsesor(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('contacto de nuestro asesor') || lower.includes('wa.me/') || lower.includes('584123343519') || lower.includes('hablar con un humano');
}

async function sendMsg(to: string, text: string, previewUrl = false) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^0-9]/g, ''), type: 'text', text: { preview_url: previewUrl, body: text } })
    });
    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    
    const db = getDb();
    if (db) {
      await db.from('mensajes_whatsapp').insert({ from_number: 'system', to_number: to, body: text, tipo: 'saliente', wa_message_id: wa_id, es_ia: true });
    }
  } catch (e) { console.error('Error sendMsg:', e); }
}

async function sendContactCard(to: string, phone: string, displayName: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/[^0-9]/g, ''),
        type: 'contacts',
        contacts: [{
          name: { formatted_name: displayName, first_name: displayName },
          phones: [{ phone: `+${cleanPhone}`, type: 'WORK' }]
        }]
      })
    });
  } catch (e) {
    await sendMsg(to, `Puedes contactar a nuestro asesor directamente aquí: https://wa.me/${cleanPhone}`, true);
  }
}

async function updateConversation(db: any, from: string, lastMsg: string, memoria: Memoria) {
  if (!db) return;
  try {
    await db.from('conversaciones').upsert({
      telefono: from,
      ultimo_mensaje: lastMsg.substring(0, 100),
      ultimo_mensaje_at: new Date().toISOString(),
      memoria
    }, { onConflict: 'telefono' });
  } catch (e) { }
}

export async function processCoreLogic(db: any, from: string, messageBody: string, wa_message_id: string | null) {
  try {
    // 1. Cargar contexto y tasas en paralelo
    const [ctx, rates] = await Promise.all([
      loadConversationContext(db, from, messageBody),
      fetchExchangeRates()
    ]);

    // 2. Procesar intenciones (nombre, etc)
    await processIntents(db, from, messageBody, ctx);

    // 3. Obtener respuesta de IA
    const aiResponse = await getAIResponse(messageBody, ctx, rates);

    if (aiResponse) {
      let cleaned = cleanForWhatsApp(aiResponse);

      // 4. Buscar citas en la respuesta para guardarlas
      const citaMatch = cleaned.match(/\[CITA:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\s*\|\s*([^|\]]+?))?(?:\s*\|\s*([^\]]+?))?\s*\]/);
      if (citaMatch) {
        const [_, fecha, hora, servicio, vehiculo] = citaMatch;
        cleaned = cleaned.replace(/\[CITA:[^\]]+\]/g, '').trim();
        
        try {
          const { clientId, vehicleId } = await getOrCreateClientAndVehicle(db, from, ctx.memoria.nombre || '', vehiculo || '', '');
          await db.from('citas').insert({
            fecha: fecha,
            hora: hora,
            telefono: from,
            cliente_id: clientId,
            vehiculo_id: vehicleId,
            descripcion: servicio || 'Cita programada vía WhatsApp',
            estado: 'pendiente',
            nombre_cliente: ctx.memoria.nombre || null,
            vehiculo_info: vehiculo || null
          });
        } catch (e) { console.error('Error insertando cita:', e); }
      }

      // 5. Enviar mensaje y manejar contacto de asesor
      if (aiNeedsAsesor(cleaned)) {
        await sendMsg(from, cleaned);
        await delay(700);
        await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
      } else {
        // Detectar si hay links de tiktok para enviarlos con preview
        const tiktokMatch = cleaned.match(/https?:\/\/(?:vt\.tiktok\.com|tiktok\.com)\/\S+/i);
        if (tiktokMatch) {
          const textWithoutUrl = cleaned.replace(tiktokMatch[0], '').trim();
          if (textWithoutUrl) await sendMsg(from, textWithoutUrl);
          await delay(500);
          await sendMsg(from, tiktokMatch[0], true);
        } else {
          await sendMsg(from, cleaned, cleaned.includes('https://'));
        }
      }
    }

    // 6. Actualizar conversación con la memoria
    await updateConversation(db, from, messageBody, ctx.memoria);

  } catch (err) {
    console.error('❌ Error in processCoreLogic:', err);
    if (db) {
      await db.from('conversaciones').upsert({ telefono: from, ultimo_mensaje: messageBody.substring(0, 100), ultimo_mensaje_at: new Date().toISOString() }, { onConflict: 'telefono' });
    }
  }
}
