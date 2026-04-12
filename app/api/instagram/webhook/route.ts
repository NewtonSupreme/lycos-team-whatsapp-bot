import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || 'lycos_webhook_token_2026';

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
const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN || '';
const INSTAGRAM_PAGE_ID = process.env.INSTAGRAM_PAGE_ID || '';
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
// Downloads from WhatsApp and re-uploads to our permanent storage bucket.
// Returns the public URL or null on failure.
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
    if (error) { console.error('Storage upload error:', error.message); return null; }
    const { data: publicData } = sb.storage.from('whatsapp-media').getPublicUrl(fileName);
    return publicData?.publicUrl || null;
  } catch (e) { console.error('uploadMediaToStorage exception:', e); return null; }
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
  console.log('📈 Fetching fresh exchange rates...');
  try {
    let bcvRate = 0;
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (respBcv.ok) {
        const bcvEntry: { promedio?: number; precio?: number } = await respBcv.json();
        if (bcvEntry) bcvRate = bcvEntry.promedio || bcvEntry.precio || 0;
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
      // Fallback
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo');
        if (tempResp.ok) {
          const parEntry: { promedio?: number; precio?: number } = await tempResp.json();
          if (parEntry) binanceRate = parEntry.promedio || parEntry.precio || 0;
        }
      } catch (e) { }
    }

    if (!bcvRate || !binanceRate) {
      console.warn('⚠️ Could not fetch some rates, using cache if available');
      return ratesCache;
    }

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

3) PAGOS CON CASHEA (CRÍTICO):
   - BASE: Usa el "Precio a tasa BCV" (el precio estándar redondeado). NUNCA uses la "Promoción en divisas" para Cashea.
   - IVA: Al precio base Estándar, súmale el 16% de IVA para obtener el Total Cashea.
   - MONEDA: Presenta TODO el presupuesto (Total, Inicial y Cuotas) en dólares usando estrictamente el formato: **"$ [Monto] a tasa BCV"**. NUNCA digas "Bolívares" ni "Bs.".
   - REGLA DE DESGLOSE: Si el cliente indica su nivel de Cashea, calcula y muestra:
     a) Inicial: [Monto] a tasa BCV (Se paga en la caja del taller).
     b) 3 Cuotas de: [Monto] a tasa BCV (Cada una, se pagan por la plataforma de Cashea).
   - EJEMPLO CASHEA ($100 base):
     Total con IVA (16%): $116 a tasa BCV
     Si es Nivel 2 (50%): Inicial $58 a tasa BCV y 3 cuotas de $19.33 a tasa BCV.
`;
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

function getSaludoApropiado(): string {
  const hour = getVzlaDate().getHours();
  if (hour < 12) return "¡Buenos días!";
  if (hour < 19) return "¡Buenas tardes!";
  return "¡Buenas noches!";
}

// ─── KNOWLEDGE BASE ────────────────────────────────────────────────────────────
const LYCOS_KNOWLEDGE = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team, taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
NUNCA digas que eres IA, bot, ChatGPT o robot. Si preguntan, di que eres el asistente del taller.

COMPORTAMIENTO Y TONO:
ES MUY IMPORTANTE QUE VARÍES TUS RESPUESTAS PARA SONAR MÁS HUMANO. NO SEAS REPETITIVO.
- Español venezolano, amigable, máximo 4-5 líneas, no improvises precios, texto plano sin asteriscos.
- Usa al menos 1 emoji por respuesta, pero sin saturar. Ejemplos: 🔧 🚗 💰 📅 😊.
- SALUDO INICIAL (solo sesión NUEVA): Usa SIEMPRE el saludo apropiado según la hora del día indicada en SALUDO_APROPIADO más abajo, seguido de "Bienvenido a Lycos Team 🔧 Soy tu asistente virtual, estoy capacitado para responder cualquier tipo de pregunta y ayudarte con servicios, precios, citas, inventario y lo que necesites. ¿En qué te puedo ayudar? 😊"
- SALUDO_APROPIADO: ${getSaludoApropiado()}
- REVISIÓN GRATIS: La revisión visual del vehículo al traerlo al taller es totalmente gratuita. Menciónalo SOLO UNA VEZ cuando trates de convencer al cliente de ir al taller para revisar un presupuesto que no puedes darle por chat. ESTÁ ESTRICTAMENTE PROHIBIDO repetir que la revisión es gratis en varios de tus mensajes (suena aburrido y repetitivo). Dilo en el momento exacto y una sola vez.
- REDES SOCIALES: Instagram y TikTok @lycos.team (el sistema envía la tarjeta/enlace nativo automáticamente si el cliente pide seguir en redes). Enlace perfil general: https://www.lycosteam.com
- CLIENTES SEGUIDORES: Si el cliente menciona que ya nos sigue en Instagram o TikTok, agradécele con mucho entusiasmo, dile que nos motiva mucho su apoyo y anímalo a visitarnos o consultar cualquier duda sobre su vehículo.
- RECORDATORIOS DE CITA: Menciónalos SOLO si el cliente pregunta por su cita o están tratando de agendar, pero no en cada mensaje.

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO sin excepciones.
UBICACION: San Antonio de los Altos, Altos Mirandinos, Miranda.

SERVICIOS Y PRECIOS:

SILENCIADORES Y ESCAPE — Fabricación propia, redondos, lámina galvanizada gruesa. PROMOCIÓN EN DIVISAS con instalación:
- REGLA DE PRESUPUESTO DE SISTEMA DE ESCAPE: **SOLO SE PROHIBE** dar presupuestos completos de "punta a punta" o tuberías exactas a medida por chat. Para estos casos, **INVÍTALO AL TALLER PARA UNA REVISIÓN GRATUITA**.
- **REGLA DE PIEZAS INDIVIDUALES**: Para silenciadores, resonadores, colas, flexibles y Flowmaster, **SÍ DEBES DAR EL PRECIO DIRECTAMENTE** usando la lista de abajo. No lo mandes al taller sin antes darle el precio de la pieza que busca.
- "Intermedio": significa resonador. Da el precio del resonador ($40) y menciona que si requiere tubería adicional, el metro sale en $35 (hierro) o $50 (aluminizado/especial según catálogo).
- El Sistema de Escape Completo Incluye: Silenciador, Resonador, Tubería, Flexible, Bajante, gomas y Empacaduras. En este caso específico de sistema completo, debe venir al taller para el precio exacto.
- Silenciadores PLANOS (Ej. Malibú): NO TENEMOS DISPONIBILIDAD de planos. Solo vendemos silenciadores Redondos. PERO, hay carros planos que sí tienen espacio para adaptar uno redondo, si el cliente tiene duda pídele que nos visite para revisión de espacio y envíale nuestra ubicación.
- **REGLA OBLIGATORIA DE CILINDRAJE**: Si el cliente pregunta por el precio de un silenciador para su carro (ej: Aveo, Corolla, etc.), **DEBES preguntarle OBLIGATORIAMENTE el cilindraje o versión del motor** (ej: 1.6, 2.0, 1.4...) si no lo ha mencionado. Explícale que hay versiones "grande" o "pequeño" y el silenciador cambia según el motor y le das luego los precios para las diferentes versiones.
- **LISTA DE PRECIOS POR MOTOR** (instalación incluida):
  - CL27 / CL30: Motores hasta 1.3L → $40
  - CL40: Motores hasta 1.5L → $50
  - CLH40: Motores 1.6L hasta 2.0L (Caso común: Aveo 1.6) → $60
  - CL60: Motores desde 3.8L → $90
  - CLK60: Fabricación especial $100 — SOLO para Kia Sportage, Hyundai Tucson y Dodge Caliber
- Resonador: $40
- Flowmaster Serie 40: $140 (instalación incluida, flexibles doble malla)
- Flexibles doble malla: $40
- Tubo silenciador/cola: Primer metro $35, metros adicionales $20/metro, soldadura $15, gomas $7
- Colas cromadas: B55 $25, Camioneta $35, Curba $30
- Cola de sistema de escape: depende del vehiculo, responder: "Depende del vehiculo, debes traerlo para darte el precio exacto"
- REGLA DE PRESUPUESTOS Y PRECIOS APROXIMADOS: **PROHIBIDO** dar presupuestos de reparaciones complejas o reconstrucciones totales sin ver el carro. Sin embargo, para la venta e instalación de piezas individuales del catálogo (Silenciadores, Resonadores, Flowmaster, etc.), **DEBES DAR EL PRECIO SIEMPRE**. Evita la evasiva de "debe venir al taller" cuando se trate de estas piezas solas.


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
- REGLA DE ORO CASHEA: Usa SIEMPRE el "Precio a tasa BCV" (el monto más alto) como base. La "Promoción en divisas" es solo para pagos al contado.
- IVA: El IVA (16%) se suma al PRECIO TOTAL de la venta, no solo a la inicial.
- NIVELES: Pide el nivel del cliente SIEMPRE antes de dar el desglose final.
  - Nivel 1: 60% inicial.
  - Nivel 2: 50% inicial.
  - Nivel 3 en adelante: 40% inicial.
- DESGLOSE: Indica claramente el monto de la Inicial ($ a tasa BCV) y el monto de cada una de las 3 cuotas ($ a tasa BCV).
- PAGOS: Aclara que la inicial se paga únicamente en el taller y el resto de las cuotas a través de la plataforma de Cashea cada 14 días.

CITAS — REGLAS ABSOLUTAS:
Pedir OBLIGATORIAMENTE antes de confirmar la cita: nombre completo, placa del vehículo (si la tiene), MARCA Y MODELO del vehículo, servicio y el DÍA exacto (Lunes-Sábados). **La hora es opcional**, si el cliente no la da, asúmela a las 08:00 AM por defecto.
REGLA DE ORO ABSOLUTA DE CITAS: ESTÁ TERMINANTEMENTE PROHIBIDO imprimir la etiqueta [CITA] si el cliente NO te ha dado:
  1. Su NOMBRE COMPLETO
  2. La MARCA Y MODELO del vehículo
  3. El DÍA de la cita
Si no tienes estos datos, DEBES pedírselos primero sin excepción.
Si no da la placa, insiste una vez amablemente, si sigue sin darla procede con nombre y modelo.
Calcula la fecha exacta desde hoy usando FECHA/HORA VENEZUELA. Nunca agendes domingos.
VERIFICA estrictamente si tiene citas registradas o si el horario está ocupado globalmente.
ORDEN DEL SISTEMA (CRÍTICO): Cuando tú y el cliente ya acordaron de forma exitosa los datos (Nombre, Vehículo y Día), DEBES obligatoriamente imprimir la siguiente etiqueta oculta de sistema AL FINAL de tu respuesta (solo UNA vez):
[CITA: AAAA-MM-DD HH:MM | descripción breve | marca modelo]
(Si el cliente no dio la hora, usa 08:00 de forma predeterminada en la etiqueta o pones no especificada).
La descripción debe ser breve. El vehículo toma la forma Marca Modelo.
Hora en formato 24h (ejemplo: 02:30 PM es 14:30).
Si el cliente todavía NO ha confirmado el día, NO imprimas la etiqueta.
ASESOR: Solo mencionarlo si el cliente lo pide explícitamente, para concretar RCV, hay queja compleja, o el bot no puede resolver.
Cuando corresponda di: "Te envío el contacto de nuestro asesor 👇" (sistema envía la tarjeta).

FILTROS E INVENTARIO: Refrigerantes y líquidos Dr Care | Filtros aceite/gasolina CARDOC para múltiples vehículos. Stock en tiempo real en el sistema.
`;

export const dynamic = 'force-dynamic';

// ─── GET: Webhook verification ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔍 [Webhook Verification Attempt]');
  console.log('Mode:', mode);
  console.log('Token received:', token);
  console.log('Expected token (from env):', VERIFY_TOKEN);

  if (!mode || !token) {
    console.warn('⚠️ Webhook attempt missing parameters');
    return NextResponse.json({ 
      error: 'Missing parameters', 
      message: 'To test in browser, use: ?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE' 
    }, { status: 400 });
  }

  // Normalize tokens to avoid whitespace issues
  const normalizedToken = token?.trim();
  const normalizedExpected = VERIFY_TOKEN?.trim();

  if (mode === 'subscribe' && normalizedToken === normalizedExpected) {
    console.log('✅ Webhook verified successfully');
    return new Response(challenge, { status: 200 });
  }

  console.error('❌ Webhook verification failed: Token mismatch or invalid mode');
  return NextResponse.json({ 
    error: 'Forbidden', 
    reason: normalizedToken !== normalizedExpected ? 'Token mismatch' : 'Invalid mode' 
  }, { status: 403 });
}

// ─── POST: Receive messages ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📬 Webhook POST received:', JSON.stringify(body).substring(0, 100));

    if (body.object === 'instagram_cron_retry') {
      const { from, messageBody, insertedTimestamp, ig_message_id } = body;
      const db = getDb();
      if (!db || !INSTAGRAM_TOKEN || !INSTAGRAM_PAGE_ID) return NextResponse.json({ status: 'ok' });

      try {
        const { data: newer } = await db.from('mensajes_instagram')
          .select('id')
          .eq('from_id', 'system')
          .eq('to_id', from)
          .eq('tipo', 'saliente')
          .gt('created_at', insertedTimestamp)
          .limit(1);
        if (newer && newer.length > 0) {
          console.log(`⏩ [CRON] Ignorando retry ${ig_message_id} porque ya se respondio (carrera)`);
          return NextResponse.json({ status: 'already_replied' });
        }
      } catch (e) { }

      try {
        const { data: convData } = await db.from('conversaciones_instagram').select('estado').eq('ig_id', from).single();
        if (convData?.estado === 'humano') {
          return NextResponse.json({ status: 'ignored_human' });
        }
      } catch { }

      await processCoreLogic(db, from, messageBody, ig_message_id);
      return NextResponse.json({ status: 'ok' });
    }

    if (body.object !== 'instagram') {
      return NextResponse.json({ status: 'ignored' });
    }
    const messagingEvents = body.entry?.[0]?.messaging;

    if (!messagingEvents?.length) return NextResponse.json({ status: 'no_messages' });

    for (const event of messagingEvents) {
      const message = event.message;
      if (!message && !event.reaction) continue;

      const from: string = event.sender.id;
      const ig_message_id: string = event.reaction ? event.reaction.mid : message?.mid;

      // Extract IG profile name for context 
      let igProfileName = '';
      try {
        if (INSTAGRAM_TOKEN && from) {
          const profileRes = await fetch(`https://graph.facebook.com/v22.0/${from}?fields=name,username&access_token=${INSTAGRAM_TOKEN}`);
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            igProfileName = profileData.name || profileData.username || '';
          }
        }
      } catch (e) {
        console.warn('Error fetching IG profile name:', e);
      }

      // ── Mark as read immediately ───────────────────────────────────────────
      void markMessageAsRead(ig_message_id, from);
      const db = getDb();
      if (!db) {
        console.error('❌ Database connection not available.');
        continue;
      }

      // Deduplication
      if (db && ig_message_id) {
        try {
          const { data: rows } = await db
            .from('mensajes_instagram').select('id').eq('ig_message_id', ig_message_id).limit(1);
          if (rows && rows.length > 0) { console.log(`⏭️ Dup (${ig_message_id})`); continue; }
        } catch { /* ok */ }
      }

      if (message.type === 'reaction') {
        const targetWaId = message.reaction?.message_id;
        const emoji = message.reaction?.emoji;
        console.log(`❤️ [${from}] Reacción recibida: ${emoji} para ${targetWaId}`);
        if (targetWaId && db) {
          try {
            await db.from('mensajes_instagram')
              .update({ reaccion: emoji || null })
              .eq('ig_message_id', targetWaId);
          } catch (e) {
            console.error('Error actualizando reacción entrante:', e);
          }
        }
        continue; // No hay texto que procesar
      }

      let messageBody = '';
      let currentMediaId: string | null = null;
      let currentMediaType: string | null = null;

      if (message.type === 'text') {
        messageBody = message.text.body;
      } else if (message.type === 'sticker') {
        currentMediaId = message.sticker?.id || null;
        currentMediaType = 'sticker';
        console.log(`🖼️ [${from}] Recibido sticker: ${currentMediaId}`);
        messageBody = '[Sticker]';
      } else if (message.type === 'video') {
        currentMediaId = message.video?.id || null;
        currentMediaType = 'video';
        const caption = message.video?.caption || '';
        console.log(`🎥 [${from}] Recibido video: ${currentMediaId}`);
        messageBody = caption || '[Video]';
      } else if (message.type === 'document') {
        currentMediaId = message.document?.id || null;
        currentMediaType = 'document';
        const filename = message.document?.filename || 'Documento';
        console.log(`📄 [${from}] Recibido documento: ${filename}`);
        messageBody = `[Documento: ${filename}]`;
      } else if (message.type === 'image') {
        const imageId = message.image?.id;
        currentMediaId = imageId || null;
        currentMediaType = 'image';
        const rawCaption = message.image?.caption || '';
        const captionStr = rawCaption ? ` - Mensaje del cliente adjunto: "${rawCaption}"` : '';
        if (imageId && INSTAGRAM_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${imageId}`, {
              headers: { Authorization: `Bearer ${INSTAGRAM_TOKEN}` }
            });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              if (mediaData.url) {
                const mediaResp = await fetch(mediaData.url, {
                  headers: { Authorization: `Bearer ${INSTAGRAM_TOKEN}` }
                });
                if (mediaResp.ok) {
                  const arrayBuffer = await mediaResp.arrayBuffer();
                  const base64Data = Buffer.from(arrayBuffer).toString('base64');
                  const mimeType = mediaData.mime_type || 'image/jpeg';

                  const description = await describeImage(base64Data, mimeType);
                  if (description) {
                    messageBody = `[Imagen enviada por el cliente. Descripción automática (analízala y respondele en base a esto): ${description}]${captionStr}`;
                    console.log(`🖼️ Imagen descrita de [${from}]: ${description.substring(0, 50)}...`);
                  } else {
                    messageBody = `[Cliente envió imagen]${captionStr}`;
                  }
                } else {
                  console.error('Error descargando imagen de WhatsApp');
                  messageBody = `[Cliente envió imagen]${captionStr}`;
                }
              } else {
                messageBody = `[Cliente envió imagen]${captionStr}`;
              }
            } else {
              console.error('Error obteniendo URL de la imagen', await mediaUrlResp.text());
              messageBody = `[Cliente envió imagen]${captionStr}`;
            }
          } catch (e) {
            console.error('Excepción al procesar imagen:', e);
            messageBody = `[Cliente envió imagen]${captionStr}`;
          }
        } else {
          messageBody = `[Cliente envió imagen]${captionStr}`;
        }
      } else if (message.type === 'audio') {
        const audioId = message.audio?.id;
        currentMediaId = audioId || null;
        currentMediaType = 'audio';
        if (audioId && INSTAGRAM_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, {
              headers: { Authorization: `Bearer ${INSTAGRAM_TOKEN}` }
            });
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              if (mediaData.url) {
                const mediaResp = await fetch(mediaData.url, {
                  headers: { Authorization: `Bearer ${INSTAGRAM_TOKEN}` }
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
      } else if (message.type === 'location') {
        const loc = message.location;
        messageBody = `[Cliente compartió ubicación: ${loc?.latitude}, ${loc?.longitude}]`;
      }
      if (!messageBody) continue;
      console.log(`📩 [${from}]: ${messageBody.substring(0, 80)}`);

      // Save incoming (blocking to capture exact time)
      let insertedTimestamp = new Date().toISOString();
      if (db) {
        try {
          const { data } = await db.from('mensajes_instagram').insert({
            from_id: from,
            to_id: 'system',
            body: messageBody,
            tipo: 'entrante',
            ig_message_id,
            media_url: currentMediaId,
            media_type: currentMediaType
          }).select('created_at').single();
          if (data?.created_at) insertedTimestamp = data.created_at;

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

        // Debounce to group multiple images or chopped messages
        const isVercel = process.env.VERCEL === '1';
        const delayMs = isVercel ? 0 : 4000;
        console.log(`⏳ [${from}] Waiting ${delayMs}ms for potential grouping...`);
        await delay(delayMs); 
        try {
          const { data: newer } = await db.from('mensajes_instagram')
            .select('id')
            .eq('from_id', from)
            .eq('tipo', 'entrante')
            .gt('created_at', insertedTimestamp)
            .limit(1);
          if (newer && newer.length > 0) {
            console.log(`⏩ [${from}] Ignorando respuesta IA de ${ig_message_id} porque hay mensajes más recientes.`);
            continue; // Skip AI response, letting the newer message handle it
          }
        } catch (e) { console.error('Error consultando mensajes recientes:', e); }

        // ─── Human takeover & Concurrent processing check ─────────────────
        try {
          const { data: convData } = await db.from('conversaciones_instagram')
            .select('estado, is_processing')
            .eq('ig_id', from)
            .limit(1)
            .single();

          if (convData?.is_processing) {
            console.log(`⏳ [${from}] Bot ya está procesando otro mensaje. Saltando para evitar bloqueos.`);
            continue;
          }

          if (convData?.estado === 'humano') {
            console.log(`👤 [${from}] Conversación en control humano — bot silenciado.`);
            // Update last message in CRM so admin sees it, incrementing unread count
            await db.from('conversaciones_instagram').update({
              ultimo_mensaje: messageBody.substring(0, 200),
              ultimo_mensaje_at: new Date().toISOString(),
              mensajes_sin_leer: 1,
            }).eq('ig_id', from);
            // Extra push: human mode means you MUST respond manually
            void firePushNotification({
              title: `🆘 Respuesta manual requerida`,
              body: `${from}: ${messageBody.slice(0, 80)}`,
              type: 'whatsapp-human',
              url: '/dashboard/whatsapp',
              tag: 'whatsapp-human',
            });
            continue; // Skip AI response
          }
        } catch { /* no conversation row yet — proceed with bot */ }
      }

      if (!INSTAGRAM_TOKEN || !INSTAGRAM_PAGE_ID) {
        console.warn('⚠️ Missing INSTAGRAM_TOKEN or PHONE_ID. Cannot respond.');
        continue;
      }

        console.log(`🤖 [${from}] Entering processCoreLogic...`);
        const phone = from.replace(/[^0-9]/g, ''); // Normalize
        // Update is_processing to true
        await db.from('conversaciones_instagram').update({ is_processing: true }).eq('ig_id', phone);

        try {
          await processCoreLogic(db, phone, messageBody, ig_message_id, igProfileName);
        } finally {
          // Always reset processing flag
          await db.from('conversaciones_instagram').update({ is_processing: false }).eq('ig_id', phone);
        }
        console.log(`✅ [${phone}] processCoreLogic finished.`);
      } // end for loop

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── WhatsApp Helpers ──────────────────────────────────────────────────────────
async function markMessageAsRead(messageId: string) {
  if (!INSTAGRAM_TOKEN || !INSTAGRAM_PAGE_ID) return;
  try {
    await fetch(`https://graph.facebook.com/v18.0/${INSTAGRAM_PAGE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INSTAGRAM_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
    console.log(`🔵 [Leído] Mensaje marcado: ${messageId}`);
  } catch (e) {
    console.error('❌ Error en markMessageAsRead:', e);
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
  agendaOcupada: string;
  historialTecnico: string;
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
  let historialTecnico = '';
  let agendaOcupada = '';
  let isNewSession = true;
  if (!db) return { historia, memoria, citasInfo, inventarioInfo, isNewSession, agendaOcupada, historialTecnico };

  const phone = from.replace(/[^0-9]/g, '');

  // Message history
  try {
    const { data: msgs } = await db
      .from('mensajes_instagram')
      .select('body, tipo, created_at')
      .or(`from_id.eq.${from},to_id.eq.${from}`)
      .order('created_at', { ascending: false })
      .limit(50); // Increased memory
    if (msgs && msgs.length > 0) {
      const filtered = msgs
        .filter(m => !(m.body === currentMessage && m.tipo === 'entrante'))
        .slice(0, 48).reverse();
      historia = filtered.map(m => ({ role: m.tipo === 'entrante' ? 'user' : 'model', parts: [{ text: m.body }] }));
      const latest = msgs[0];
      if (latest?.created_at) {
        // Session is NEW if last message was on a DIFFERENT calendar day in Venezuela
        const lastMsgDate = new Date(latest.created_at);
        const lastMsgVzla = new Date(lastMsgDate.getTime() + lastMsgDate.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
        const lastDayStr = lastMsgVzla.toISOString().split('T')[0];
        const todayStr = getVzlaDateString();
        if (lastDayStr === todayStr) {
          // Same calendar day → continue session (no greeting)
          isNewSession = false;
        }
        // Different day → isNewSession stays true → bot will greet
      }
    }
  } catch (e) { console.error('Error loading history:', e); }

  // Memoria
  try {
    const { data: convRows } = await db.from('conversaciones_instagram').select('memoria, cliente_id').eq('ig_id', phone).limit(1);
    if (convRows?.[0]?.memoria) memoria = convRows[0].memoria as Memoria;
    
    // Technical History (Services & Revisions)
    const clientId = convRows?.[0]?.cliente_id;
    if (clientId) {
      const { data: vehs } = await db.from('vehiculos').select('id, marca, modelo, placa').eq('cliente_id', clientId);
      if (vehs && vehs.length > 0) {
        const vehIds = vehs.map(v => v.id);
        const [servs, revs] = await Promise.all([
          db.from('servicios').select('id, vehiculo_id, tipo_servicio, descripcion, fecha, costo, estado').in('vehiculo_id', vehIds).order('fecha', { ascending: false }).limit(10),
          db.from('revisiones').select('id, vehiculo_id, detalles, presupuesto, created_at').in('vehiculo_id', vehIds).order('created_at', { ascending: false }).limit(5)
        ]);

        if ((servs.data && servs.data.length > 0) || (revs.data && revs.data.length > 0)) {
          historialTecnico = '\n--- HISTORIAL TÉCNICO DEL CLIENTE ---\n';
          vehs.forEach(v => {
            const vServs = servs.data?.filter(s => s.vehiculo_id === v.id) || [];
            const vRevs = revs.data?.filter(r => r.vehiculo_id === v.id) || [];
            if (vServs.length > 0 || vRevs.length > 0) {
              historialTecnico += `VEHÍCULO: ${v.marca} ${v.modelo} (Placa: ${v.placa || 'N/A'})\n`;
              vServs.forEach(s => {
                historialTecnico += `  - SERVICIO [${s.fecha}]: ${s.tipo_servicio} - ${s.descripcion} (${s.estado}) | Costo: $${s.costo}\n`;
              });
              vRevs.forEach(r => {
                const date = new Date(r.created_at).toISOString().split('T')[0];
                historialTecnico += `  - REVISIÓN [${date}]: ${r.detalles} | Presupuesto: $${r.presupuesto}\n`;
              });
            }
          });
          historialTecnico += '-------------------------------------\n';
        }
      }
    }
  } catch (e) { console.error('Error loading memoria/historial:', e); }

  // Appointments
  try {
    const today = getVzlaDateString();
    const { data: citas } = await db.from('citas')
      .select('fecha, hora, tipo_servicio, descripcion, estado')
      .eq('ig_id', from).order('fecha', { ascending: true }).limit(5);
    if (citas && citas.length > 0) {
      const list = citas.map(c => `- ${c.fecha} ${c.hora} | ${c.tipo_servicio} | ${c.estado} ${c.fecha < today ? '(PASADA)' : '(PROXIMA)'}`).join('\n');
      citasInfo = `\nCITAS DEL CLIENTE:\n${list}`;
    }
  } catch (e) { console.error('Error loading citas:', e); }

  // Inventory (only when relevant)
  const lower = currentMessage.toLowerCase();
  const invKw = ['silenciador', 'resonador', 'flexible', 'cola', 'filtro', 'aceite', 'gasolina', 'refrigerante', 'liquido', 'líquido',
    'liga', 'dot', 'repuesto', 'stock', 'inventario', 'disponible', 'hay', 'tienes', 'precio', 'cl27', 'cl30', 'cl40', 'clh40',
    'cl60', 'clk60', 'clc60', 'clp60', 'b55', 'curba', 'flowmaster', 'arauca', 'aveo', 'corolla', 'twingo', 'cavalier',
    'camry', 'sentra', 'blazer', 'lancer', 'cherokee', 'explorer', 'samuray', 'macho'];
  if (invKw.some(k => lower.includes(k))) {
    try {
      const { data: items } = await db.from('inventario')
        .select('nombre, codigo, precio_usd, stock, categoria').eq('activo', true)
        .order('categoria').order('nombre');
      if (items && items.length > 0) {
        const list = items.map(i =>
          `  - ${i.nombre}${i.codigo ? ' [' + i.codigo + ']' : ''}${i.precio_usd ? ': $' + i.precio_usd : ''} — ${i.stock > 0 ? 'Stock: ' + i.stock : 'SIN STOCK'}`
        ).join('\n');
        inventarioInfo = `\nINVENTARIO ACTUAL:\n${list}`;
      }
    } catch (e) { console.error('Error loading inventory:', e); }
  }

  // Global occupied schedule
  try {
    const today = getVzlaDateString();
    const endD = new Date(); endD.setDate(endD.getDate() + 3);
    const endStr = endD.toISOString().split('T')[0];
    const { data: globales } = await db.from('citas')
      .select('fecha, hora')
      .gte('fecha', today).lte('fecha', endStr)
      .neq('estado', 'cancelada');
    if (globales && globales.length > 0) {
      agendaOcupada = `\nHORARIOS OCUPADOS GLOBALMENTE (PROHIBIDO AGENDAR EN ESTAS FECHAS Y HORAS EXACTAS):\n` + globales.map(g => `- ${g.fecha} a las ${g.hora}`).join('\n');
    }
  } catch (e) { }

  return { historia, memoria, citasInfo, inventarioInfo, isNewSession, agendaOcupada, historialTecnico };
}

// ─── AI Response ───────────────────────────────────────────────────────────────
// ─── Greeting by Venezuela time ───────────────────────────────────────────────
function getVzlaGreeting(): string {
  const vzla = getVzlaDate();
  const hour = vzla.getHours();
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

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
  const greeting = getVzlaGreeting();

  const memoriaStr = Object.keys(ctx.memoria).length > 0
    ? `\nMEMORIA DEL CLIENTE:\n- Nombre: ${ctx.memoria.nombre || 'no registrado'}\n- Vehiculos: ${ctx.memoria.vehiculos?.map(v => `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}`).join(', ') || 'no registrado'}\n- Notas: ${ctx.memoria.notas || 'ninguna'}`
    : '';

  const ratesCtx = buildRatesContext(rates);

  const systemPrompt = `${LYCOS_KNOWLEDGE}

FECHA/HORA VENEZUELA: ${vzlaDateTime}
HOY ES: ${dayName} ${vzlaDateStr}
${dayNum === 0 ? 'HOY ES DOMINGO — Taller CERRADO. Informa y sugiere mañana (lunes).' : ''}
SALUDO_APROPIADO: ${greeting} — USA ESTE SALUDO EXACTO al inicio cuando sea sesión nueva. NO uses otro.
SESION: ${ctx.isNewSession ? `NUEVA — saluda con "${greeting}" + mensaje de bienvenida` : 'CONTINUA — ve al tema, sin repetir saludo ni bienvenida'}
${memoriaStr}
${ctx.citasInfo}
${(ctx as any).historialTecnico || ''}
${ctx.inventarioInfo}
${ctx.agendaOcupada}
${ratesCtx}

⚠️ REGLA CRITICA DE FECHAS — LEE CON ATENCION:
La fecha de HOY es ${vzlaDateStr} (${dayName}). Esta es la UNICA referencia válida para calcular fechas.
PROHIBIDO: Usar cualquier fecha mencionada en el historial de conversación anterior para calcular "mañana", "pasado mañana", "la próxima semana", etc.
SIEMPRE: Calcula "mañana" sumando 1 día a ${vzlaDateStr}. "La próxima semana" = los 7 días desde hoy.
NUNCA registres una cita en una fecha que ya pasó. Si el cálculo da una fecha anterior a ${vzlaDateStr}, es un error, recalcula.
Ejemplo correcto: Si hoy es ${vzlaDateStr} y el cliente dice "para mañana", la cita es ${new Date(new Date().getTime() + 86400000).toISOString().split('T')[0]}. NUNCA uses la fecha de mensajes viejos del historial.

REGLAS CRITICAS:
- NUNCA uses asteriscos (*) en tus respuestas. Texto plano siempre. Listas con - o numeradas.
- Pon al menos 1 emoji relevante en la respuesta.
- Usa la fecha (${vzlaDateStr}) para calcular fechas relativas. Nunca agendes domingo.
- Un cliente puede tener varios vehiculos.
- REGLA DE ORO (PRECIOS): NUNCA, bajo ningún concepto, des el precio en Bolívares (Bs.). Solo usa dólares ($) y dólares a tasa BCV según las REGLAS DE CONVERSIÓN MONETARIA.
- Si ves "[Imagen enviada...]", lee su descripción automática para entender qué mandó y responderle. Si manda varias fotos o texto repartido en varios envíos seguidos, asume el contexto completo unificado.
- PROHIBICION DE ENVIAR IMAGENES: **NUNCA** intentes enviar, simular o ofrecer enviar imágenes o fotos. Jamás uses formatos como "[Imagen adjunta]" ni "[Imagen enviada]" en tus respuestas. Si preguntan por detalles visuales, invítalos siempre a venir al taller presencialmente.
- No repitas preguntas ya respondidas en el historial.`;

  const contents = [...ctx.historia, { role: 'user', parts: [{ text: userMessage }] }];

  console.log(`🧠 Calling Gemini with model: ${GEMINI_MODEL}`);
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
      const errText = await resp.text();
      console.error(`❌ Gemini Error [${resp.status}]:`, errText.substring(0, 500)); 
      return null; 
    }
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

async function describeImage(base64Data: string, mimeType: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const sttModel = GEMINI_MODEL;
  const systemPrompt = "Eres un analista de imágenes de un taller automotriz. Detalla brevemente y de forma muy precisa qué se ve en la imagen para que el chatbot lo entienda y pueda ayudar al cliente. Si hay texto relevante en la imagen, menciónalo. Responde siempre en español.";

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
              { text: "Describe esta imagen detalladamente pensando como mecánico:" }
            ]
          }],
          generationConfig: { temperature: 0.4 }
        })
      }
    );
    if (!resp.ok) {
      console.error(`❌ Gemini Vision error ${resp.status}:`, (await resp.text()).substring(0, 200));
      return null;
    }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error('❌ describeImage excepcion:', e);
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
  ctx: ConversationContext,
  waProfileName?: string
): Promise<{ clientId?: string; vehicleId?: string }> {
  if (!db) return {};
  const newMemoria: Memoria & { placa?: string } = { ...ctx.memoria };
  let memChanged = false;

  // Extract name — with blacklist and more flexible patterns
  const NAME_BLACKLIST = [
    'nivel', 'cashea', 'cliente', 'usuario', 'hola', 'buenas', 'buenos',
    'dias', 'noches', 'tardes', 'gracias', 'okay', 'bueno', 'bien',
    'precio', 'cita', 'servicio', 'taller', 'carro', 'vehiculo', 'favor',
    'presupuesto', 'ubicacion', 'donde', 'dirección', 'direccion', 'llegar',
    'metro', 'silenciador', 'resonador', 'flexible', 'cola', 'filtro', 'aceite'
  ];
  
  // 1. Pattern with prefix (Soy Juan, Me llamo Pedro...)
  const nameMatch = userMsg.match(/(?:soy|me llamo|mi nombre es|mi nombre|llámame|llamame)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]{1,})?)/i);
  
  // 2. Fallback: if message is very short (1-3 words) and starts with capitalized words, it might be just a name
  // But ONLY if it's not a common command or service
  let extractedName = '';
  if (nameMatch) {
    extractedName = nameMatch[1].trim();
  } else if (userMsg.trim().length <= 30 && userMsg.trim().length > 3) {
    // Check if it's 1-3 capitalized words
    const words = userMsg.trim().split(/\s+/);
    const isAllCapitalized = words.every(w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(w));
    const hasNumbers = /\d/.test(userMsg);
    if (isAllCapitalized && !hasNumbers && words.length <= 3) {
      extractedName = userMsg.trim();
    }
  }

  if (extractedName) {
    const isBlacklisted = NAME_BLACKLIST.some(w => extractedName.toLowerCase().startsWith(w) || extractedName.toLowerCase() === w);
    const isRealName = extractedName.length >= 3 && !isBlacklisted;
    
    // Always overwrite if we get a real name, even if one was stored before
    if (isRealName) {
      const currentIsGeneric = !newMemoria.nombre || 
        newMemoria.nombre === from ||
        NAME_BLACKLIST.some(w => newMemoria.nombre!.toLowerCase().includes(w));
        
      if (currentIsGeneric || newMemoria.nombre !== extractedName) {
        newMemoria.nombre = extractedName;
        memChanged = true;
        console.log(`👤 Nombre detectado y actualizado: "${extractedName}"`);
      }
    }
  }

  // Extract vehicle - much more robust list
  const brandKeywords = [
    'toyota', 'ford', 'chevrolet', 'hyundai', 'kia', 'honda', 'nissan', 'mazda', 'volkswagen',
    'mitsubishi', 'suzuki', 'isuzu', 'peugeot', 'renault', 'fiat', 'jeep', 'dodge', 'chrysler',
    'mercedes', 'bmw', 'audi', 'volvo', 'chery', 'dongfeng', 'saic', 'mg', 'jac', 'great wall',
    'geely', 'byd', 'hafei', 'zotye', 'lifan', 'faw', 'venirauto', 'turpial', 'centauro', 'arauca', 'orinoco',
    'twingo', 'corsa', 'aveo', 'spark', 'optra', 'cruze', 'hilux', 'corolla', 'yaris', 'fortuner',
    'explorer', 'fiesta', 'focus', 'fusion', 'ranger', 'ecoport', 'silverado', 'tahoe', 'blazer',
    'grand vitara', 'lancer', 'montero', 'signo', 'sentra', 'tiida', 'versa', 'march', 'civic',
    'accent', 'elantra', 'tucson', 'sportage', 'getz', 'rio', 'picanto', 'ara'
  ];
  const brandRegex = new RegExp(`\\b(${brandKeywords.join('|')})\\b`, 'i');
  
  const vehicleMatch = userMsg.match(brandRegex);
  const yearMatch = userMsg.match(/\b(19[8-9]\d|20[0-2]\d)\b/);
  let detectedVeh = '';
  if (vehicleMatch) {
    // Attempt to capture 1-2 words after the brand as the model
    const fullMatch = userMsg.match(new RegExp(`\\b${vehicleMatch[0]}\\b\\s*([A-Z0-9]{1,}(?:\\s+[A-Z0-9]{1,})?)`, 'i'));
    const marca = vehicleMatch[1].charAt(0).toUpperCase() + vehicleMatch[1].slice(1).toLowerCase();
    const modelo = fullMatch ? fullMatch[1].trim() : 'Modelo';
    const anio = yearMatch?.[1] || '';
    
    const v = { marca, modelo, anio };
    detectedVeh = `${v.marca} ${v.modelo}`;
    if (!newMemoria.vehiculos) newMemoria.vehiculos = [];
    const exists = newMemoria.vehiculos.some(x => x.marca.toLowerCase() === v.marca.toLowerCase() && x.modelo.toLowerCase() === v.modelo.toLowerCase());
    if (!exists) { newMemoria.vehiculos.push(v); memChanged = true; }
  }

  // Extract plate number
  const placaMatch = userMsg.match(/\b([A-Z]{2,3}[-\s]?\d{2,3}[-\s]?[A-Z0-9]{0,3})\b/i);
  let detectedPlaca = '';
  if (placaMatch) {
    detectedPlaca = placaMatch[1].toUpperCase().replace(/[-\s]/g, '');
    if (detectedPlaca.length >= 4 && detectedPlaca !== newMemoria.placa) {
      newMemoria.placa = detectedPlaca;
      memChanged = true;
    }
  }

  // Sync memory to DB
  if (memChanged) {
    ctx.memoria = newMemoria; // update in-place for this run
    try {
      await db.from('conversaciones_instagram').upsert({ ig_id: from, memoria: newMemoria }, { onConflict: 'ig_id' });
    } catch (e) { console.error('Error saving memoria:', e); }
  }

  // Get or Create record IDs
  const { clientId, vehicleId } = await getOrCreateClientAndVehicle(
    db, from, newMemoria.nombre || '', detectedVeh, detectedPlaca || newMemoria.placa || '', undefined, waProfileName
  );

  return { clientId, vehicleId };
}

async function getOrCreateClientAndVehicle(
  db: ReturnType<typeof getDb>,
  phone: string,
  name: string,
  vehicleInfo: string,
  placa: string,
  anio?: string,
  waProfileName?: string
): Promise<{ clientId?: string; vehicleId?: string; isNew?: boolean }> {
  if (!db) return {};
  let clientId: string | undefined;
  let vehicleId: string | undefined;
  let isNew = false;

  try {
    // 1. Client — search by phone first
    const { data: client } = await db.from('clientes').select('id, nombre, apellido').eq('ig_id', phone).limit(1).maybeSingle();
    if (client) {
      clientId = client.id;
      // Update name if we now have a REAL name and the stored one is generic/wrong
      if (name && name.toLowerCase() !== 'cliente' && name.trim() !== '') {
        const storedIsGeneric = !client.nombre || client.nombre === phone ||
          client.apellido === 'WhatsApp' || client.apellido === '(WhatsApp)' ||
          ['nivel', 'cashea', 'cliente', 'usuario'].some(w => client.nombre?.toLowerCase().startsWith(w));
        // Always update if current name is generic/bad, or if we explicitly have a new confirmed name
        if (storedIsGeneric) {
          const parts = name.split(' ');
          await db.from('clientes').update({
            nombre: parts[0],
            apellido: parts.slice(1).join(' ') || '(WhatsApp)',
            updated_at: new Date().toISOString()
          }).eq('id', clientId);
          console.log(`👤 Nombre cliente actualizado: ${name}`);
        }
      }
      console.log(`👤 Cliente existente: ${clientId} | ${phone}`);
    } else {
      // New client — register them
      isNew = true;
      const hasRealName = name && name.toLowerCase() !== 'cliente' && name.trim() !== '';
      const parts = hasRealName ? name.split(' ') : [phone];
      const { data: newClient, error: clientErr } = await db.from('clientes').insert({
        nombre: parts[0],
        apellido: parts.slice(1).join(' ') || '(WhatsApp)',
        ig_id: phone
      }).select('id').single();
      if (clientErr) { console.error('Error creando cliente:', clientErr.message); }
      clientId = newClient?.id;
      console.log(`👤 Nuevo cliente registrado: ${clientId} | ${phone} | ${parts[0]}`);
    }

    // 2. Vehicle — search by plate if available, then by client+marca
    if (clientId && (vehicleInfo || placa)) {
      const vehParts = (vehicleInfo || '').split(' ').filter(Boolean);
      const marca = vehParts[0] || '';
      const modelo = vehParts.slice(1).join(' ') || '';

      if (placa && placa.length >= 4) {
        // Try exact plate match (global — could be shared vehicle)
        const { data: vehByPlaca } = await db.from('vehiculos').select('id, cliente_id').eq('placa', placa).limit(1).maybeSingle();
        if (vehByPlaca) {
          vehicleId = vehByPlaca.id;
          // Link to this client if not already done
          if (vehByPlaca.cliente_id !== clientId) {
            await db.from('vehiculos').update({ cliente_id: clientId }).eq('id', vehicleId);
          }
          // Update marca/modelo if we now have them and they were unknown
          if (marca) {
            await db.from('vehiculos').update({
              marca: marca || undefined,
              modelo: modelo || undefined,
              ...(anio ? { anio: parseInt(anio) } : {})
            }).eq('id', vehicleId).eq('marca', 'Desconocida');
          }
          console.log(`🚗 Vehículo existente (por placa): ${vehicleId}`);
        } else {
          // Create new vehicle with plate
          const { data: newVeh, error: vehErr } = await db.from('vehiculos').insert({
            cliente_id: clientId,
            placa: placa.toUpperCase(),
            marca: marca || 'Desconocida',
            modelo: modelo || 'Modelo',
            ...(anio ? { anio: parseInt(anio) } : {}),
            estado: 'activo'
          }).select('id').single();
          if (vehErr) { console.error('Error creando vehiculo con placa:', vehErr.message); }
          vehicleId = newVeh?.id;
          console.log(`🚗 Nuevo vehículo con placa: ${vehicleId} | ${placa} | ${marca} ${modelo}`);
        }
      } else if (marca) {
        // No plate — search by client + marca
        const { data: vehByMarca } = await db.from('vehiculos')
          .select('id').eq('cliente_id', clientId).ilike('marca', `%${marca}%`).limit(1).maybeSingle();
        if (vehByMarca) {
          vehicleId = vehByMarca.id;
          // Update modelo/anio if missing
          if (modelo || anio) {
            await db.from('vehiculos').update({
              ...(modelo ? { modelo } : {}),
              ...(anio ? { anio: parseInt(anio) } : {})
            }).eq('id', vehicleId);
          }
          console.log(`🚗 Vehículo existente (por marca): ${vehicleId}`);
        } else {
          // Create without plate
          const { data: newVeh, error: vehErr } = await db.from('vehiculos').insert({
            cliente_id: clientId,
            marca: marca,
            modelo: modelo || 'Modelo',
            ...(anio ? { anio: parseInt(anio) } : {}),
            estado: 'activo'
          }).select('id').single();
          if (vehErr) { console.error('Error creando vehiculo sin placa:', vehErr.message); }
          vehicleId = newVeh?.id;
          console.log(`🚗 Nuevo vehículo sin placa: ${vehicleId} | ${marca} ${modelo}`);
        }
      }
    }

    // 3. Link back to conversation
    if (clientId) {
      // Sync names to conversation metadata
      const { data: clientData } = await db.from('clientes').select('nombre, apellido').eq('id', clientId).single();
      const fullName = clientData ? `${clientData.nombre || ''} ${clientData.apellido || ''}`.trim() : name;
      
      await db.from('conversaciones_instagram').update({ 
        cliente_id: clientId,
        datos_cliente: {
          nombre: fullName || name,
          wa_name: waProfileName || undefined
        }
      }).eq('ig_id', phone);
    }

  } catch (e) { console.error('Error in getOrCreateClientAndVehicle:', e); }

  return { clientId, vehicleId, isNew };
}

// ─── Appointment Booking ───────────────────────────────────────────────────────
// (Deprecated: `tryBookAppointment` parsing was removed in favor of `[CITA:]` tag generated by AI)

// ─── Update conversation row ───────────────────────────────────────────────────
async function updateConversation(db: ReturnType<typeof getDb>, from: string, lastMsg: string, memoria: Memoria, clientId?: string): Promise<void> {
  if (!db) return;
  
  // Link by phone if clientId is missing
  let linkedClientId = clientId;
  if (!linkedClientId) {
    try {
      const { data: client } = await db.from('clientes').select('id').eq('ig_id', from).maybeSingle();
      if (client) linkedClientId = client.id;
    } catch (e) {}
  }

  void (async () => {
    try {
      const updateData: any = {
        ig_id: from, 
        ultimo_mensaje: lastMsg.substring(0, 100),
        ultimo_mensaje_at: new Date().toISOString(), 
        memoria,
        updated_at: new Date().toISOString()
      };
      if (linkedClientId) updateData.cliente_id = linkedClientId;

      await db.from('conversaciones_instagram').upsert(updateData, { onConflict: 'ig_id' });
    } catch (e) { console.error('Error update conversacion:', e); }
  })();
}

// ─── Send Instagram Text ────────────────────────────────────────────────────────
async function sendMsg(to: string, body: string, preview: boolean = false, replyToId?: string | null) {
  if (!INSTAGRAM_TOKEN) return;
  try {
    const payload: any = {
      recipient: { id: to },
      message: { text: body }
    };

    const resp = await fetch(`https://graph.facebook.com/v22.0/me/messages?access_token=${INSTAGRAM_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error('❌ Error enviando mensaje Instagram:', await resp.text());
      return;
    }

    const data = await resp.json();
    const wa_id = data.message_id || 'ig_msg';
    console.log(`📤 IG Enviado a ${to}. ID: ${wa_id}`);

    const db = getDb();
    if (db) {
      try {
        await db.from('mensajes_instagram').insert({
          from_id: 'system',
          to_id: to,
          body,
          tipo: 'saliente',
          ig_message_id: wa_id,
          es_ia: true
        });
      } catch (e) {
        console.error('Error guardando mensaje saliente en DB:', e);
      }
    }
  } catch (e) {
    console.error('❌ Error en sendMsg:', e);
  }
}

// ─── Send WhatsApp Image ───────────────────────────────────────────────────────


// ─── Send Native Contact Card ──────────────────────────────────────────────────
async function sendContactCard(to: string, phone: string, displayName: string): Promise<void> {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  await sendMsg(to, `Contacto del asesor ${displayName}: https://wa.me/${cleanPhone}`, true);
}

// ─── Intent Detection ──────────────────────────────────────────────────────────
function isLocationRequest(lower: string): boolean {
  const locKeywords = ['ubicacion', 'ubicación', 'donde est', 'dónde est', 'donde quedan', 'dónde quedan', 'ubica', 'ubican', 'dirección', 'direccion', 'llegar', 'ubicado', 'gps', 'mapa', 'como llegar', 'cómo llegar'];
  return locKeywords.some(k => lower.includes(k));
}
function isCertRequest(lower: string): boolean {
  const certKeywords = ['certificado medico', 'certificado médico', 'cert medico', 'cert médico', 'certificado med'];
  return certKeywords.some(k => lower.includes(k));
}
function isSocialRequest(lower: string): boolean {
  if (['ya los sigo', 'ya lo sigo', 'ya te sigo', 'los sigo', 'lo sigo'].some(k => lower.includes(k))) return false;
  return ['instagram', 'tiktok', 'redes sociales', 'redes', 'sigueme', 'seguir', 'perfil redes', '@lycos'].some(k => lower.includes(k));
}
function isContactRequest(lower: string): boolean {
  return ['numero del asesor', 'número del asesor', 'contacto del asesor', 'hablar con alguien',
    'numero de whatsapp', 'número de whatsapp', 'hablar con una persona', 'número de contacto',
    'numero de contacto', 'whatsapp del taller', 'hablar con un humano', 'asesor humano',
    'quiero hablar con', 'necesito hablar con'].some(k => lower.includes(k));
}
function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }


export async function processCoreLogic(db: ReturnType<typeof getDb>, from: string, messageBody: string, ig_message_id: string | null, waProfileName?: string) {
      // Load context + exchange rates in parallel
      const [ctx, rates] = await Promise.all([
        loadConversationContext(db, from, messageBody),
        fetchExchangeRates(),
      ]);

      const lowerBody = messageBody.toLowerCase();

      // Location intent (GPS + Video)
      if (isLocationRequest(lowerBody)) {
        console.log(`📍 [${from}] Intento de ubicación detectado. Enviando secuencia...`);
        await sendMsg(from, '¡Con gusto! 📍 Aquí tienes nuestra ubicación exacta en San Antonio de los Altos y un video de cómo llegar desde la Panamericana 👇');
        await delay(800);
        // Map Link
        await sendMsg(from, '📍 *Google Maps:* https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(1000);
        // Video Link
        await sendMsg(from, '🎥 *Video de cómo llegar:* https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(800);
        await sendMsg(from, '¿Tienes alguna otra duda o quieres agendar una cita? 😊');
        
        await updateConversation(db, from, messageBody, ctx.memoria);
        
        // Append system note to avoid AI redundancy
        messageBody += '\n[SISTEMA: Ya se le envió la ubicación y el video de cómo llegar al cliente automáticamente. NO los repitas en tu respuesta.]';
      }

      // Medical certificate intent (Handled by AI, but we prevent location trigger)
      if (isCertRequest(lowerBody)) {
        // Just let it pass to AI, which has the prices and information.
        // The separate detection ensures it doesn't enter the location block above.
      }

      // Social media intent
      if (isSocialRequest(lowerBody)) {
        await sendMsg(from, 'Aqui te van nuestras redes sociales 📱 Siguenos para tips, novedades y promos 🔧');
        await delay(500);
        await sendMsg(from, IG_LINK, true);
        await delay(500);
        await sendMsg(from, TT_LINK, true);
        await updateConversation(db, from, messageBody, ctx.memoria);
        // Continue to AI response/intents
      }

      // Asesor contact intent (explicit)
      if (isContactRequest(lowerBody)) {
        await sendMsg(from, 'Con gusto 😊 Te comparto el contacto directo de nuestro asesor:');
        await delay(600);
        await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
        await updateConversation(db, from, messageBody, ctx.memoria);
        return;
      }

      // ─── Intent Detection & Data Processing ──────────────────────────
      // We process intents FIRST so that the AI response can Use the new data (like a newly detected name)
      const r = await processIntents(db, from, messageBody, ctx, waProfileName);
      
      // Update ctx.memoria if a name was found so the AI sees it in this same turn
      if (ctx.memoria.nombre) {
        // Already updated inside processIntents, but ensuring context for AI is fresh
      }

      // AI response
      const aiResponse = await getAIResponse(messageBody, ctx, rates);

      if (aiResponse) {
        let cleanedAi = cleanForWhatsApp(aiResponse);

        // Format: [CITA: AAAA-MM-DD HH:MM | descripcion | marca modelo]
        // Now time is optional: [CITA: AAAA-MM-DD | descripcion | marca modelo]
        const citaMatch = cleanedAi.match(/\[CITA:\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?(?:\s*\|\s*([^|\]]+?))?(?:\s*\|\s*([^\]]+?))?\s*\]/);
        if (citaMatch) {
          const fecha = citaMatch[1];
          const hora = citaMatch[2] || '08:00'; // Default to 8 AM if not provided
          const servicio = citaMatch[3]?.trim() || '';
          const vehiculo = citaMatch[4]?.trim() || '';
          cleanedAi = cleanedAi.replace(/\[CITA:[^\]]+\]/g, '').trim();

          try {
            if (db) {
              // ── Extract all available data ──────────────────────────────────
              const userName = ctx.memoria?.nombre || '';
              const vehiculoFromTag = vehiculo || '';
              // Plate: from current message > memoria
              const placaMatch = messageBody.match(/\b([A-Z]{2,3}[-\s]?\d{2,3}[-\s]?[A-Z0-9]{0,3})\b/i);
              const placa = placaMatch ? placaMatch[1].toUpperCase().replace(/[-\s]/g, '') : (ctx.memoria as { placa?: string })?.placa || '';
              // Year from message or memoria
              const anioMatch = messageBody.match(/\b(19[8-9]\d|20[0-2]\d)\b/);
              const anio = anioMatch?.[1] || ctx.memoria?.vehiculos?.[0]?.anio || '';
              // Best vehicle info: from [CITA] tag > first memoria vehicle
              const vehiculoFromMem = ctx.memoria?.vehiculos?.map(v =>
                `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}`).join(', ') || '';
              const vehiculoInfo = vehiculoFromTag || vehiculoFromMem;

              // ── Get or Create Client & Vehicle ─────────────────────────────
              const { clientId, vehicleId, isNew } = await getOrCreateClientAndVehicle(
                db, from, userName, vehiculoInfo, placa, anio?.toString(), waProfileName
              );

              // ── Composed description with client name + (WhatsApp) ──────────
              const clientLabel = userName
                ? `${userName} (WhatsApp)`
                : `${from} (WhatsApp)`;
              const descripcionFinal = [
                servicio || 'Servicio por WhatsApp',
                vehiculoInfo ? `| ${vehiculoInfo}` : '',
                `| ${clientLabel}`,
              ].filter(Boolean).join(' ');

              // ── Deduplicate ──────────────────────────────────────────────────
              const { data: existing } = await db.from('citas')
                .select('id').eq('ig_id', from).eq('fecha', fecha).eq('hora', hora)
                .neq('estado', 'cancelada').limit(1);
              if (existing && existing.length > 0) {
                console.log(`⚠️ Cita duplicada ignorada: ${fecha} ${hora} para ${from}`);
              } else {
                await db.from('citas').insert({
                  fecha,
                  hora,
                  ig_id: from,
                  cliente_id: clientId || null,
                  vehiculo_id: vehicleId || null,
                  tipo_servicio: 'otro',
                  descripcion: descripcionFinal,
                  estado: 'pendiente',
                  duracion_minutos: 60,
                  nombre_cliente: userName || from,
                  vehiculo_info: vehiculoInfo || null,
                  placa: placa || null,
                });
                console.log(`📅 AUTO-CITA IA: ${fecha} ${hora} | ${descripcionFinal} | client_id: ${clientId} | veh_id: ${vehicleId} | isNew: ${isNew}`);
              }
            }
          } catch (e) { console.error('Error insertando cita automatica:', e); }
        }

        // (Logic for images was removed)

        const needsAsesor = aiNeedsAsesor(cleanedAi);

        if (needsAsesor) {
          const withoutPhone = cleanedAi
            .replace(/https?:\/\/wa\.me\/\S+/gi, '')
            .replace(/wa\.me\/\S+/gi, '')
            .replace(/\+?58\s?412[\s\-]?334[\s\-]?3519/g, '')
            .trim();
          if (withoutPhone) { await sendMsg(from, withoutPhone, false, ig_message_id); await delay(700); }
          await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
        } else {
          // TikTok links — send separately with preview
          const tiktokMatch = cleanedAi.match(/https?:\/\/(?:vt\.tiktok\.com|tiktok\.com)\/\S+/i);
          if (tiktokMatch) {
            const textWithout = cleanedAi.replace(tiktokMatch[0], '').trim();
            if (textWithout) { await sendMsg(from, textWithout, false, ig_message_id); await delay(500); }
            await sendMsg(from, tiktokMatch[0], true, ig_message_id);
          } else {
            const hasUrl = /https?:\/\//.test(cleanedAi);
            await sendMsg(from, cleanedAi, hasUrl, ig_message_id);
          }
        }
      }

      await updateConversation(db, from, messageBody, ctx.memoria, r?.clientId);
}
