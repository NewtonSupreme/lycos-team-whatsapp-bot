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
const IG_LINK = 'https://www.instagram.com/lycos.team?igsh=MXJlNHducnBhN2piNg==';
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
    console.log(`💱 Tasas actualizadas: BCV ${ratesCache.bcv} | Binance P2P Nativo ${ratesCache.paralelo}`);
    return ratesCache;
  } catch (e) {
    console.error('Error general fetchExchangeRates:', e);
    return ratesCache;
  }
}

function formatBs(amount: number): string {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
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
- REVISIÓN GRATIS: La revisión visual del vehículo al traerlo al taller es totalmente gratuita. Menciónalo SOLO UNA VEZ cuando trates de convencer al cliente de ir al taller para revisar un presupuesto que no puedes darle por chat. ESTÁ ESTRICTAMENTE PROHIBIDO repetir que la revisión es gratis en varios de tus mensajes (suena aburrido y repetitivo). Dilo en el momento exacto y una sola vez.
- REDES SOCIALES: Instagram y TikTok @lycos.team (el sistema envía la tarjeta/enlace nativo automáticamente si el cliente pide seguir en redes). Enlace perfil general: https://www.lycos.team
- RECORDATORIOS DE CITA: Menciónalos SOLO si el cliente pregunta por su cita o están tratando de agendar, pero no en cada mensaje.

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO sin excepciones.
UBICACION: San Antonio de los Altos, Altos Mirandinos, Miranda.

SERVICIOS Y PRECIOS:

SILENCIADORES Y ESCAPE — Fabricación propia, redondos, lámina galvanizada gruesa. PROMOCIÓN EN DIVISAS con instalación:
- REGLA DE PRESUPUESTO DE SISTEMA DE ESCAPE: **PROHIBIDO** dar presupuestos completos o cálculos matemáticos si el cliente pide reemplazar todo el sistema de escape. En lugar de darle el precio total por chat, **INVÍTALO AL TALLER PARA UNA REVISIÓN**, porque somos fabricantes propios y muchas veces el cliente no necesita todo nuevo sino una reparación más sencilla y económica.
- "Intermedio": significa resonador o resonador con tubería. Varia el precio. Da precio del resonador + precio por metro de tubería. El total exacto depende de condiciones (debe venir al taller).
- El Sistema de Escape Completo Incluye: Silenciador, Resonador, Tubería, Flexible (si aplica), Bajante (depende del caso si es reparar o cambiar tubería), gomas y Empacaduras (requiere venir directamente al taller para comprobar todo y dar el precio).
- Silenciadores PLANOS (Ej. Malibú): NO TENEMOS DISPONIBILIDAD de planos. Solo vendemos silenciadores Redondos. PERO, hay carros planos que sí tienen espacio para adaptar uno redondo, si el cliente tiene duda pídele que nos visite para revisión de espacio y envíale nuestra ubicación.
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
- Cola de sistema de escape: depende del vehiculo, responder: "Depende del vehiculo, debes traerlo para darte el precio exacto"
- REGLA DE PRESUPUESTOS Y PRECIOS APROXIMADOS: **PROHIBIDO** dar presupuestos, cálculos o precios aproximados de trabajos completos. Si el cliente pide un estimado de reparación o reemplazo complejo, **INVÍTALO DIRECTAMENTE A UNA REVISIÓN FÍSICA GRATUITA EN EL TALLER**. Evita dar cálculos por chat para promover siempre la visita presencial de forma natural y amable, sin dar explicaciones ni decir que no puedes enviar o recibir cosas por el chat.


MECANICA Y FRENOS:
- Mecánica ligera, limpieza de inyectores
- Frenos completo: precios previa evaluación
- Terminal de dirección: $15 c/lado | Rótula: $20 c/lado (tras estos servicios debe alinear)
- Amortiguador: $40 c/u (PROMOCIÓN EN DIVISAS)

CATALIZADOR:
- Limpieza de catalizador: $30
- Comprar o reemplazar catalizador: debe venir al taller Lycos Team para comprobar el precio y disponibilidad exacta para su carro.

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
- Display Ford Fiesta (km/gasolina): $60 c/u. SIEMPRE pregunta qué modelo tiene (2 modelos). Ver servicio: https://vt.tiktok.com/ZSuqsSgb5/
- OBD I: 20$
- OBD II: escáner según disponibilidad en la cita

ESTETICA: Pulitura de faros, Latonería y pintura (previa cotización), Papel ahumado, Cámaras 360.

OTROS: Grúa (consultar asesor), Inventario de repuestos.
- Certificado Médico: $15 o equivalente directo interbancario BCV.
- Renovación de RCV: Para renovar el RCV y dar precios exactos, el cliente DEBE comunicar con un asesor directamente (transfiérelo).

CASHEA:
El IVA 16% se suma al PRECIO TOTAL, no a la inicial.
Ejemplo: $100 + 16% IVA = $116 total → el cliente paga su inicial sobre $116.
Pide el nivel PRIMERO → Nivel 1: 60% | Nivel 2: 50% | Niveles 3-6: 40%
Resto en 3 cuotas cada 14 días. Pago en caja.

CITAS:
Pedir obligatoriamente antes de confirmar la cita: nombre completo, placa del vehículo (si la tiene), marca/modelo del vehículo, servicio, día y hora exacta (Lunes-Sábados, 8AM-5PM).
REGLA DE ORO DE CITAS: No confirmes la cita ni imprimas la etiqueta [CITA] si el cliente no te ha dado su nombre y al menos el modelo del vehículo. Si no da la placa, insiste una vez amablemente, si sigue sin darla procede solo con nombre y modelo.
Calcula la fecha exacta desde hoy usando FECHA/HORA VENEZUELA. Nunca agendes domingos.
VERIFICA estrictamente si tiene citas registradas o si el horario está ocupado globalmente. NUNCA agendes si choca.
ORDEN DEL SISTEMA (CRÍTICO): Cuando tú y el cliente ya acordaron de forma exitosa los datos (Nombre, Vehículo, Placa, Día y Hora), DEBES obligatoriamente imprimir la siguiente etiqueta oculta de sistema AL FINAL de tu respuesta (solo UNA vez):
[CITA: AAAA-MM-DD HH:MM | descripcion breve del servicio | marca modelo del vehiculo]
Ejemplo: "Perfecto Carlos, tu cita quedó para el martes a las 10:00 AM. ¡Te esperamos! 😊 [CITA: 2026-03-31 10:00 | Cambio de aceite y filtro | Toyota Hilux]"
La descripción debe ser breve (el servicio que quiere el cliente). El vehículo toma la forma Marca Modelo.
Hora en formato 24h (ejemplo: 02:30 PM es 14:30).
Si el cliente todavía NO ha confirmado el día y la hora exacta, NO imprimas la etiqueta.
ASESOR: Solo mencionarlo si el cliente lo pide explícitamente, para concretar RCV, hay queja compleja, o el bot no puede resolver.
Cuando corresponda di: "Te envío el contacto de nuestro asesor 👇" (sistema envía la tarjeta).

FILTROS E INVENTARIO: Refrigerantes y líquidos Dr Care | Filtros aceite/gasolina CARDOC para múltiples vehículos. Stock en tiempo real en el sistema.
`;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- Intents Helpers ---
function isLocationRequest(msg: string): boolean {
  return /ubicacion|donde estan|donde se encuentran|direccion|mapa|como llegar/i.test(msg);
}
function isSocialRequest(msg: string): boolean {
  return /redes|sociales|instagram|tiktok|facebook/i.test(msg);
}
function isContactRequest(msg: string): boolean {
  return /asesor|humano|persona|contacto|numero|hablar con alguien/i.test(msg);
}

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

      try {
        const { data: newer } = await db.from('mensajes_whatsapp')
          .select('id')
          .eq('from_number', 'system')
          .eq('to_number', from)
          .eq('tipo', 'saliente')
          .gt('created_at', new Date(Date.now() - 3 * 60 * 1000).toISOString())
          .limit(1);
        if (newer && newer.length > 0) {
          console.log(`⏩ [CRON] Ignorando retry ${wa_message_id} porque ya se respondio (carrera)`);
          return NextResponse.json({ status: 'already_replied' });
        }
      } catch (e) { }

      try {
        const { data: convData } = await db.from('conversaciones').select('estado').eq('telefono', from).maybeSingle();
        if (convData?.estado === 'humano') {
          return NextResponse.json({ status: 'ignored_human' });
        }
      } catch { }

      await processCoreLogic(db, from, messageBody, wa_message_id);
      return NextResponse.json({ status: 'ok' });
    }

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' });

    for (const message of value.messages) {
      const from = message.from;
      const wa_message_id = message.id;
      const db = getDb();

      // Deduplication
      if (db && wa_message_id) {
        try {
          const { data: rows } = await db.from('mensajes_whatsapp').select('id').eq('wa_message_id', wa_message_id).limit(1);
          if (rows && rows.length > 0) { console.log(`⏭️ Dup (${wa_message_id})`); continue; }
        } catch { }
      }

      // 2. Determinar el contenido del mensaje
      let messageBody = '';
      if (message.type === 'text') {
        messageBody = message.text?.body || '';
      } else if (message.type === 'image') {
        const imageId = message.image?.id;
        const rawCaption = message.image?.caption || '';
        const captionStr = rawCaption ? ` - Mensaje del cliente adjunto: "${rawCaption}"` : '';
        if (imageId && WHATSAPP_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${imageId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              if (mediaData.url) {
                const mediaResp = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
                if (mediaResp.ok) {
                  const arrayBuffer = await mediaResp.arrayBuffer();
                  const base64Data = Buffer.from(arrayBuffer).toString('base64');
                  const mimeType = mediaData.mime_type || 'image/jpeg';
                  await uploadMediaToStorage(arrayBuffer, mimeType, imageId);
                  const description = await describeImage(base64Data, mimeType);
                  if (description) {
                    messageBody = `[Imagen enviada por el cliente. Descripción automática (analízala y respondele en base a esto): ${description}]${captionStr}`;
                    console.log(`🖼️ Imagen descrita de [${from}]: ${description.substring(0, 50)}...`);
                  } else {
                    messageBody = `[Cliente envió imagen]${captionStr}`;
                  }
                }
              }
            }
          } catch (e) { messageBody = `[Cliente envió imagen]${captionStr}`; }
        } else { messageBody = `[Cliente envió imagen]${captionStr}`; }
      } else if (message.type === 'audio') {
        const audioId = message.audio?.id;
        if (audioId && WHATSAPP_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              if (mediaData.url) {
                const mediaResp = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
                if (mediaResp.ok) {
                  const arrayBuffer = await mediaResp.arrayBuffer();
                  const base64Data = Buffer.from(arrayBuffer).toString('base64');
                  const mimeType = mediaData.mime_type || 'audio/ogg';
                  await uploadMediaToStorage(arrayBuffer, mimeType, audioId);
                  const transcript = await transcribeAudio(base64Data, mimeType);
                  if (transcript) {
                    messageBody = `${transcript} (Audio transcrito)`;
                    console.log(`🎙️ Audio transcrito de [${from}]: ${transcript.substring(0, 50)}...`);
                  } else {
                    messageBody = '[Cliente envió audio, pero no se pudo transcribir]';
                  }
                }
              }
            }
          } catch (e) { messageBody = '[Cliente envió audio]'; }
        } else { messageBody = '[Cliente envió audio]'; }
      } else if (message.type === 'document') {
        messageBody = '[Cliente envió documento]';
      } else if (message.type === 'location') {
        const { latitude, longitude } = message.location;
        messageBody = `[Cliente envió ubicación: LAT ${latitude}, LONG ${longitude}]`;
      }

      if (!messageBody) continue;
      console.log(`📩 Recibido de ${from}: ${messageBody.substring(0, 80)}...`);

      // 3. Procesar lógica principal si tenemos DB
      if (db && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        
        // --- Lógica de Agrupación (Debounce) ---
        let insertedTimestamp = new Date().toISOString();
        try {
          const { data: insertedMsg } = await db.from('mensajes_whatsapp').insert({
            from_number: from, to_number: 'system', body: messageBody, tipo: 'entrante', wa_message_id
          }).select('created_at').single();
          if (insertedMsg?.created_at) insertedTimestamp = insertedMsg.created_at;

          // ── Push notification: new WhatsApp message ──────────────────────
          const isImage = message.type === 'image';
          const isVideo = message.type === 'video';
          const isAudio = message.type === 'audio';
          let pushTitle = `📱 Nuevo mensaje de ${from}`;
          let pushBody = messageBody.slice(0, 100);
          let pushType = 'whatsapp-message';
          if (isImage) { pushTitle = `🖼️ ${from} envió una imagen`; pushBody = 'El cliente envió una foto'; pushType = 'whatsapp-image'; }
          else if (isVideo) { pushTitle = `🎥 ${from} envió un video`; pushBody = 'El cliente envió un video'; pushType = 'whatsapp-video'; }
          else if (isAudio) { pushTitle = `🎤 ${from} envió un audio`; pushBody = 'Nota de voz recibida'; pushType = 'whatsapp-audio'; }
          void firePushNotification({ title: pushTitle, body: pushBody, type: pushType, url: '/dashboard/whatsapp', tag: 'whatsapp' });
        } catch (e) { console.error('Error guardando entrante:', e); }

        // Debounce delay to prevent multiple concurrent responses
        await delay(4000); 

        try {
          const { data: newer } = await db.from('mensajes_whatsapp')
            .select('id').eq('from_number', from).eq('tipo', 'entrante')
            .gt('created_at', insertedTimestamp).limit(1);

          if (newer && newer.length > 0) {
            console.log(`⏩ Ignorando respuesta IA de ${wa_message_id} porque hay mensajes más recientes.`);
            continue;
          }
        } catch (e) { }

        // --- Verificación de Modo Humano ---
        try {
          const { data: convData } = await db.from('conversaciones').select('estado').eq('telefono', from).maybeSingle();
          if (convData?.estado === 'humano') {
            console.log(`👤 Sesión en modo HUMANO para ${from}. No responde el bot.`);
            await db.from('conversaciones').update({
              ultimo_mensaje: messageBody.substring(0, 200),
              ultimo_mensaje_at: new Date().toISOString(),
              mensajes_sin_leer: 1
            }).eq('telefono', from);
            
            void firePushNotification({ title: `🆘 Respuesta manual requerida`, body: `${from}: ${messageBody.slice(0, 80)}`, type: 'whatsapp-human', url: '/dashboard/whatsapp', tag: 'whatsapp-human' });
            continue;
          }
        } catch { }

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
  const systemPrompt = "Eres un sistema de reconocimiento de voz. Tu UNICA tarea es transcribir el audio a texto exacto en español. NO agregues explicaciones, respuestas, introducciones ni comentarios. Solo escribe lo que el usuario dice en español tal cual.";
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }, { text: "Transcribe exactamente lo que dice el audio de este cliente de taller mecánico:" }]
        }]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) { return null; }
}

async function describeImage(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const systemPrompt = "Eres un analista de imágenes de un taller automotriz. Detalla brevemente y de forma muy precisa qué se ve en la imagen para que el chatbot lo entienda y pueda ayudar al cliente. Si hay texto relevante en la imagen, menciónalo. Responde siempre en español.";
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }, { text: "Describe esta imagen detalladamente pensando como mecánico:" }]
        }],
        generationConfig: { temperature: 0.4 }
      })
    });
    if (!resp.ok) return null;
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
      return;
    }

    // Social media intent
    if (isSocialRequest(lowerBody)) {
      await sendMsg(from, 'Aqui te van nuestras redes sociales 📱 Siguenos para tips, novedades y promos 🔧');
      await delay(500);
      await sendMsg(from, IG_LINK, true);
      await delay(500);
      await sendMsg(from, TT_LINK, true);
      await updateConversation(db, from, messageBody, ctx.memoria);
      return;
    }

    // Asesor contact intent (explicit)
    if (isContactRequest(lowerBody)) {
      await sendMsg(from, 'Con gusto 😊 Te comparto el contacto directo de nuestro asesor:');
      await delay(600);
      await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
      await updateConversation(db, from, messageBody, ctx.memoria);
      return;
    }

    // 2. Procesar intenciones de datos (nombre, etc)
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
