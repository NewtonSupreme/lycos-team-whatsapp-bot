import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPermisos, hasPermiso, resolveRol, getRoleMeta, type Permisos } from '@/types';
import { sendGlobalPushNotification } from '@/lib/push-helper';

async function checkIsBotAdmin(phone: string, db: any, adminPhones: string[]): Promise<boolean> {
  const phoneClean = phone.replace(/[^0-9]/g, '');
  if (adminPhones.includes(phone) || adminPhones.includes(phoneClean)) return true;
  if (!db) return false;
  try {
    const { data: user } = await db.from('usuarios')
      .select('rol, permisos')
      .eq('telefono', phoneClean)
      .eq('activo', true)
      .maybeSingle();
    if (!user) return false;
    
    // Evaluate if user role has ia_asistente: leer permissions
    const parsedPermisos = typeof user.permisos === 'string' ? JSON.parse(user.permisos) : user.permisos;
    const permissions = getPermisos(user.rol, parsedPermisos);
    return !!permissions.ia_asistente?.leer;
  } catch (e) {
    return false;
  }
}

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';

// Push notification is now imported from push-helper
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_SEDE_ID = process.env.WHATSAPP_DEFAULT_SEDE_ID || '310595c5-5258-47fa-9b69-5ad9932685a7';

// ─── AI Models — ordered by priority (primary first, then fallback) ──────────
const GEMINI_MODELS = [
  'gemini-2.5-flash',              // [PRIMARY]
  'gemini-3.1-flash-lite',         // [FALLBACK]
] as const;

const ASESOR_PHONE = '584123343519';
const ADMIN_PHONES = [ASESOR_PHONE, '584241648710', '584123193206'].filter(Boolean);

const ASESOR_DISPLAY_NAME = 'Asesor Lycos Team';
const IG_LINK = 'https://www.instagram.com/lycos.team?igsh=MzVwZ3NkbnN2OHk=';
const TT_LINK = 'https://www.tiktok.com/@lycos.team?_r=1&_t=ZS-94prPaQnR5E';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    console.error('❌ Missing Supabase URL or KEY in process.env');
    return null;
  }
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
const RATES_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  if (ratesCache && Date.now() - ratesCacheTime < RATES_TTL) return ratesCache;
  console.log('📈 Fetching fresh exchange rates...');

  // 1. Try fetching from unified local API first
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const ratesResp = await fetch(`${baseUrl}/api/rates?t=${Date.now()}`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store'
    });
    if (ratesResp.ok) {
      const ratesData = await ratesResp.json();
      if (ratesData.bcv && (ratesData.binance || ratesData.paralelo)) {
        ratesCache = {
          bcv: ratesData.bcv,
          paralelo: ratesData.binance || ratesData.paralelo,
          fetchedAt: new Date().toISOString()
        };
        ratesCacheTime = Date.now();
        console.log(`💱 Webhook successfully retrieved rates from /api/rates: BCV ${ratesCache.bcv} | PARALELO ${ratesCache.paralelo}`);
        return ratesCache;
      }
    }
  } catch (e) {
    console.warn('⚠️ Local API rates fetch failed, trying direct fallback endpoints:', e);
  }

  // 2. Direct APIs Fallback
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

      if (!bcvRate) {
        const respPy = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv', { signal: AbortSignal.timeout(5000) });
        if (respPy.ok) {
          const dataPy = await respPy.json();
          bcvRate = dataPy.monitors?.bcv?.price || 0;
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
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      });
      if (respBin.ok) {
        const binData = await respBin.json();
        if (binData.data && binData.data.length > 3) {
          const marketAds = binData.data.slice(2, 7);
          binanceRate = marketAds.reduce((acc: number, ad: any) => acc + parseFloat(ad.adv.price), 0) / marketAds.length;
        } else if (binData.data && binData.data.length > 0) {
          binanceRate = parseFloat(binData.data[0].adv.price);
        }
      }
    } catch (e) { console.error('Error fetching Binance P2P:', e); }

    if (!bcvRate && ratesCache) bcvRate = ratesCache.bcv;
    if (!binanceRate && ratesCache) binanceRate = ratesCache.paralelo;

    if (!binanceRate) {
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (tempResp.ok) {
          const tempData = await tempResp.json();
          const parEntry = tempData.find((d: any) =>
            d.nombre?.toLowerCase().includes('paralelo') ||
            d.nombre?.toLowerCase().includes('binance') ||
            d.fuente === 'enparalelovzla'
          );
          if (parEntry) binanceRate = parEntry.promedio || parEntry.precio;
        }
      } catch (e) { console.error('Error in parallel fallback:', e); }
    }

    if (!bcvRate || !binanceRate) {
      console.warn('⚠️ Could not fetch real-time rates, using previous cache or realistic defaults');
      return ratesCache || { bcv: 40.0, paralelo: 46.0, fetchedAt: 'HARD_FALLBACK' };
    }

    ratesCache = { bcv: bcvRate, paralelo: binanceRate, fetchedAt: new Date().toISOString() };
    ratesCacheTime = Date.now();
    console.log(`💱 TASAS ACTUALIZADAS: BCV ${bcvRate} | PARALELO ${binanceRate.toFixed(2)} | RATIO: ${(binanceRate / bcvRate).toFixed(4)}`);
    return ratesCache;
  } catch (e) {
    console.error('Error general fetchExchangeRates:', e);
    return ratesCache || { bcv: 40.0, paralelo: 46.0, fetchedAt: 'HARD_FALLBACK' };
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
  return `
TASAS DE CAMBIO EN TIEMPO REAL (Usa estos valores exactos):
- Tasa Oficial BCV: ${rates.bcv.toFixed(2)} Bs/$

REGLA DE CONVERSIÓN MONETARIA (CRÍTICO):
Sigue ESTRICTAMENTE estas reglas para dar precios al cliente:

1) SERVICIOS A TASA BCV:
   - Aplica para: Alineación, Cauchos, Monturas, Autolavado, y Certificado Médico.
   - PRECIO: Di solo el monto en dólares seguido de "a tasa BCV".
   - REGLA DE ORO: ¡PROHIBIDO! No des el precio en bolívares (Bs.) bajo ninguna circunstancia.
   - AVISO DE PAGO: Cuando des un precio, puedes advertir MUY BREVEMENTE que "se trabaja a tasa BCV al momento de pagar". NUNCA lo repitas en cada uno de tus mensajes para no ser repetitivo.

2) SERVICIOS EN 'PROMOCIÓN EN DIVISAS':
   - Aplica para: Escapes, Resonadores, Mecánica, Frenos, Catalizador, Electrónica, Estética, etc. (Todo lo que sea de la lista general o se mencione como promo).
   - **EXCEPCIÓN CRÍTICA DE SILENCIADORES**: Para silenciadores, ignora cualquier precio de base de datos o cálculo automático, y aplica **ÚNICAMENTE** los 3 precios unificados detallados en LYCOS_KNOWLEDGE (Carro pequeño/sedán 4 cilindros: $80 a tasa BCV y promo en divisas 40$; Camioneta: $80 Promo Divisa y $120 a tasa BCV; Fabricación Especial: $100 Promo Divisa y $140 a tasa BCV). **REGLA DE EXPLICACIÓN**: Cuando un vehículo aplique para Fabricación Especial ($100), explícale al cliente de manera sumamente clara, atenta y profesional que la fabricación es diferente porque el recorrido de escape de su modelo es particular. Explícale que algunos vehículos requieren silenciadores y tuberías fabricados a medida de forma artesanal y especial debido a entradas/salidas dobles, tramos con curvas onduladas pronunciadas para esquivar el puente de suspensión, o espacio sumamente limitado bajo el chasis. Destaca que esto garantiza que la pieza acople perfectamente sin generar vibraciones, ruidos extraños o golpear con la carrocería, asegurando un flujo de gases óptimo y una durabilidad superior.
   - PRECIO: Para otros servicios en promoción, debes mostrar los montos en dólares directamente. Da EXACTAMENTE el precio indicado en la base de datos o en tu conocimiento. ¡PROHIBIDO! NUNCA hagas cálculos matemáticos de conversión de tasas ni inventes precios.
   - REGLA DE ORO: ¡PROHIBIDO! NUNCA menciones "Binance", "P2P", "paralela", "externa", ni des el precio en bolívares (Bs.) bajo ninguna circunstancia.
   - AVISO DE PAGO: Aclara que el pago es a tasa BCV cuando vayas a arrojar el precio de forma natural y casual.

3) PAGOS CON CASHEA (CRÍTICO):
   - BASE: Usa el "Precio a tasa BCV" exacto (el monto más alto). NUNCA uses la "Promoción en divisas" para Cashea.
   - IVA: Al precio base BCV, súmale el 16% de IVA para obtener el Total Cashea.
   - MONEDA: Presenta TODO el presupuesto (Total, Inicial y Cuotas) en dólares usando estrictamente el formato: **"$ [Monto] a tasa BCV"**. NUNCA digas "Bolívares" ni "Bs.".
   - REGLA DE DESGLOSE: Si el cliente indica su nivel de Cashea, calcula y muestra:
     a) Inicial: [Monto] a tasa BCV (Se paga en la caja del taller).
     b) 3 Cuotas de: [Monto] a tasa BCV (Cada una, se pagan por la plataforma de Cashea).

4) EXCEPCIÓN DE TASAS EN BOLÍVARES (ÚNICA EXCEPCIÓN):
   - Si el usuario o el administrador pregunta explícitamente por el valor de la tasa actual BCV, puedes responder con los montos exactos en Bolívares (ej: "La tasa oficial del BCV hoy es ${rates.bcv.toFixed(2)} Bs/$"). Esta es la ÚNICA excepción permitida para mencionar montos en bolívares (Bs.).
  `;
}

// ─── Strip markdown for WhatsApp ──────────────────────────────────────────────
function cleanForWhatsApp(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*')   // ***bold italic*** → WhatsApp format
    .replace(/\*\*(.+?)\*\*/g, '*$1*')         // **bold** → *bold*
    .replace(/__(.+?)__/g, '_$1_')             // __italic__ → _italic_
    .replace(/`{1,3}([^`]+)`{1,3}/g, '```$1```') // `code` → ```code```
    .replace(/^[\s]*[-*+]\s+/gm, '• ')         // - or * or + item → • item
    .replace(/#{1,6}\s+(.+)$/gm, '*$1*')       // # Header → *Header*
    .replace(/\n{3,}/g, '\n\n')                // max 2 newlines
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
ES MUY IMPORTANTE QUE SEAS EXTREMADAMENTE BREVE Y DIRECTO (MAX 3 LÍNEAS).

- Español venezolano, amigable, máximo 4-5 líneas, no improvises precios, texto plano sin asteriscos.
- Usa al menos 1 emoji por respuesta, pero sin saturar. Ejemplos: 🔧 🚗 💰 📅 😊.
- SALUDO INICIAL (solo sesión NUEVA): Usa SIEMPRE el saludo apropiado según la hora del día indicada en SALUDO_APROPIADO más abajo, seguido de "Bienvenido a Lycos Team 🔧 Soy tu asistente virtual, estoy capacitado para responder cualquier tipo de pregunta y ayudarte con servicios, precios, citas, inventario y lo que necesites. ¿En qué te puedo ayudar? 😊"
- SALUDO_APROPIADO: ${getSaludoApropiado()}
- REVISIÓN GRATIS: La revisión visual del vehículo al traerlo al taller es totalmente gratuita. Menciónalo SOLO UNA VEZ cuando trates de convencer al cliente de ir al taller para revisar un presupuesto que no puedes darle por chat. ESTÁ ESTRICTAMENTE PROHIBIDO repetir que la revisión es gratis en varios de tus mensajes (suena aburrido y repetitivo). Dilo en el momento exacto y una sola vez.
- REDES SOCIALES: Instagram y TikTok @lycos.team (el sistema envía la tarjeta/enlace nativo automáticamente si el cliente pide seguir en redes). Enlace perfil general: https://www.lycosteam.com
- REGLA DE ENVÍO DE IMÁGENES (OBLIGATORIO): **SIEMPRE** que menciones un modelo de silenciador específico (CL30, CL40, CLH40, CL60, etc.) como recomendación para el vehículo del cliente, **DEBES** incluir el tag correspondiente [IMAGE: slug] al final de tu mensaje. No esperes a que el cliente te pida la foto; si le estás recomendando un modelo basándote en su motor, envíale la imagen automáticamente para que la vea.
- CATALOGO DE IMÁGENES DISPONIBLES (USA ESTOS SLUGS EXACTOS):
    - cl30 (Modelo CL30/CL27 para motores hasta 1.3L)
    - cl40 (Modelo CL40 para motores hasta 1.5L)
    - clh40 (Modelo CLH40 para motores 1.6L a 2.0L - Aveo, Corolla 1.6, Terios, etc.)
    - cl60 (Modelo CL60 para motores desde 3.8L en adelante - Camionetas Grandes, Camiones, Plataneros)
    - clk60 (Fabricación Especial - $100: Dodge Caliber, Ford EcoSport, Kia Sportage, Hyundai Tucson, Jeep Compass, Cherokee)
    - clc60 (Modelo CLC60)
    - clcp60 (Modelo CLCP60)
    - rc30 (Modelo RC30 - Resonador)
- CLIENTES SEGUIDORES: Si el cliente menciona que ya nos sigue en Instagram o TikTok, agradécele con mucho entusiasmo, dile que nos motiva mucho su apoyo y anímalo a visitarnos o consultar cualquier duda sobre su vehículo.
- RECORDATORIOS DE CITA: Menciónalos SOLO si el cliente pregunta por su cita o están tratando de agendar, pero no en cada mensaje.

HORARIO:
- San Antonio de los Altos: Lunes a Sábado 8:00 AM – 5:00 PM.
- Caracas (El Paraíso) y (El Cementerio): Lunes a Viernes 8:00 AM – 4:00 PM. (¡IMPORTANTE! Las citas en estas sedes solo se pueden agendar hasta las 3:00 PM).
DOMINGOS: CERRADO en todas las sedes sin excepciones.
UBICACION:
- San Antonio de los Altos: San Antonio de los Altos, Altos Mirandinos, Miranda. (En San Antonio de los Altos, distribuidor de las minas al frente del Frescos Market nos encontramos). 💡 BENEFICIOS EXCLUSIVOS: Si vienes a esta sede tienes revisión totalmente gratuita, instalación de la app del taller gratis y tecnología automotriz profesional.
- Carrizal (Principal): Servicios Jadar Calle Raul Leoni, Municipio Carrizal cerca de eso.
- Caracas (El Cementerio): E/S PDV Nuevo Prado Av. Roosevelt, Caracas cerca de esa bomba.
- Caracas (El Paraíso): Avenida Los Liberales, Caracas 1020, Distrito Capital, Venezuela, Al frente de Puerkos Restaurant.

SERVICIOS Y PRECIOS:

SILENCIADORES Y ESCAPE — Fabricación propia, redondos, lámina galvanizada gruesa. PROMOCIÓN EN DIVISAS con instalación:
- REGLA DE PRESUPUESTO DE SISTEMA DE ESCAPE: **SOLO SE PROHIBE** dar presupuestos completos de "punta a punta" o tuberías exactas a medida por chat. Para estos casos, **INVÍTALO AL TALLER PARA UNA REVISIÓN GRATUITA**.
- **REGLA DE PIEZAS INDIVIDUALES**: Para silenciadores, resonadores, colas, flexibles y Flowmaster, **SÍ DEBES DAR EL PRECIO DIRECTAMENTE** usando la lista de abajo. No lo mandes al taller sin antes darle el precio de la pieza que busca.
- "Intermedio": significa resonador. Da el precio del resonador ($40 para pagos en divisas) y si es en Bs es a $55 a tasa BCV,  y menciona que si requiere tubería adicional, el metro sale en $35 (hierro) o $20 (a partir del segundo metro).
- El Sistema de Escape Completo Incluye: Silenciador, Resonador, Tubería, Flexible, Bajante, gomas y Empacaduras. En este caso específico de sistema completo, debe venir al taller para el precio exacto.
- Silenciadores PLANOS (Ej. Malibú) y MOFLES: NO TENEMOS DISPONIBILIDAD de planos ni de mofles. Solo vendemos silenciadores Redondos. Si el cliente pide mofles, discúlpate y ofrécele inmediatamente Silenciadores, Flowmaster o cualquier otro servicio del taller (Mecánica, Frenos, Alineación, etc.). PERO, hay carros que originalmente usan planos y sí tienen espacio para adaptar uno redondo, si tiene duda pídele vernos para revisión gratuita.
- **TRES PRECIOS ÚNICOS PARA SILENCIADORES** (Instalación y revisión incluida, ignora precios de la base de datos):
    1) **Carros Pequeños o Sedanes**: **$80 a tasa BCV** (sin promoción en divisas, precio único para pago en Bs o Cashea). Ejemplos: Aveo, Spark, Corolla, Yaris, Corsa, Twingo, Gol, Arauca, Optra, Neon, etc.
    2) **Camionetas (SUVs / Pickups)**: **$80 en Promoción en Divisas** y **$120 a tasa BCV** (Este precio de $120 es el que se usa estrictamente como base para pagos por Cashea). Ejemplos: Fortuner, Hilux, Explorer, Blazer, Grand Vitara, Terios, etc.
    3) **Fabricación Especial**: **$100 en Promoción en Divisas** y **$140 a tasa BCV** (Este precio de $140 es el que se usa estrictamente como base para pagos por Cashea). Aplica para vehículos con curvas complejas, salidas/entradas dobles, tubería ondulada, o espacio sumamente limitado (ej. Dodge Caliber, Ford EcoSport, Toyota Previa, Kia Sportage, Hyundai Tucson, Chevrolet Malibú, Jeep Compass, Jeep Cherokee, Mitsubishi Outlander, y SUVs compactas similares). **EXPLICACIÓN COMPLETA PARA EL CLIENTE**: Explícales con empatía y claridad que para su vehículo la fabricación es completamente diferente y personalizada. Esto se debe a que el diseño original de su escape requiere silenciadores con entradas o salidas dobles, o tramos de tuberías onduladas y con curvas pronunciadas para adaptarse perfectamente al espacio tan reducido debajo del chasis. Por ello, para garantizar que la pieza quede impecable, con el flujo de gases óptimo, y sin vibraciones ni golpes contra la carrocería, realizamos una fabricación y adaptación especial a la medida de forma artesanal que requiere mayor dedicación, insumos y precisión técnica.
- **REGLA DE IMAGEN**: Cuando le des el precio del silenciador al cliente, incluye el tag [IMAGE: slug] correspondiente al final del mensaje:
    * Para carros pequeños/sedanes usa [IMAGE: clh40] (para CLH40/CL40/CL30).
    * Para camionetas usa [IMAGE: cl60].
    * Para fabricación especial usa [IMAGE: clk60].
- **REGLA DE PRECIOS ALTERNATIVOS Y QUEJAS (CRÍTICO)**:
    * Si el cliente pregunta por alternativas de precio, descuentos, rebajas, precios más económicos o se queja de las tarifas: Explícale cordialmente que **actualmente solo se están manejando estos tres precios unificados para todas nuestras sedes con el fin de simplificar y unificar las operaciones**.
    * Si el cliente insiste, muestra quejas del precio o solicita específicamente consultar promociones en divisas ("promos divisas"): **DEBES** responder de manera servicial y decir: "Te envío el contacto de nuestro asesor 👇" para que el sistema le comparta automáticamente su tarjeta de contacto del asesor (no intentes convencerlo tú, deja que el asesor humano lo atienda).


- Resonador: $40 promo en divisa y $55 a tasa BCV
- Flowmaster Serie 40: $140 (instalación incluida). **NOTA**: El flexible NO está incluido, se vende por separado si el vehículo lo requiere.
- Flexibles doble malla: $40
- Tubo silenciador/cola: Primer metro $35, metros adicionales $20/metro, soldadura $15, gomas $7
- Colas cromadas: B55 $25, Camioneta $35, Curba $30
- Cola de sistema de escape: El precio indicado es solo del silenciador. La inclusión o costo de la cola depende del vehículo:
    - Camionetas: Por lo general NO está incluida, ya que suelen llevar un metro o más de cola.
    - Carros: Si la cola es corta (ej: 30cm), no se les suele cobrar. Si es más larga o compleja, sí tiene costo.
    - REGLA: Debes indicarle al cliente que "Depende de la longitud y el tipo de vehículo; hay que revisar físicamente para confirmar si tiene costo adicional".
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
- Certificado Médico: $15 a tasa BCV.
  Para procesarlo, pídele al cliente los siguientes datos en un solo mensaje:
  * Nombres y apellidos
  * Cédula de identidad
  * Edad
  * Tipo de sangre
  * Uso de lentes ?
  * Grado (2°, 3°, 4°, 5°)
  * ¿Alguna patología grave?
- Renovación y Emisión de RCV:
  SIEMPRE que el cliente pregunte por RCV, DEBES OBLIGATORIAMENTE dar la lista de precios estructurada con SALTOS DE LÍNEA EXACTOS (un precio por línea, no los agrupes en un solo párrafo) e INCLUIR el tag [IMAGE: rcv] al final de tu respuesta para enviar la imagen oficial.
  Mensaje a dar:
  "¡Conducir no es un juego! Adquiere tu póliza de RCV de manera rápida y sencilla". Precios (TCR = Tasa BCV):
  * MOTOS: $15
  * PARTICULARES HASTA 800 Kg: $33
  * PARTICULARES MÁS DE 800 Kg: $39
  * PICK-UP Y CARGA HASTA 2 Tn: $45
  * CARGA 2 a 5 Tn: $84
  * CARGA 5 a 8 Tn: $84
  * CARGA 8 a 12 Tn: $108
  (Estar Seguros S.A., SUDEASEG código TVP: 2025-0090).
  Para tramitarlo di: "Te envío el contacto de nuestro asesor 👇".
  ⚠️ IMPORTANTE: ¡No olvides colocar el tag [IMAGE: rcv]!

⚠️ REGLA DE ALERTA DE TRAMITES: Si el cliente solicita explícitamente tramitar o comprar un Certificado Médico o un RCV, DEBES imprimir obligatoriamente el tag [ALERTA_TRAMITE] al final de tu respuesta. Esto le enviará una notificación masiva al administrador.

CASHEA:
- REGLA DE ORO CASHEA: Usa SIEMPRE el "Precio a tasa BCV" (el monto más alto) como base. La "Promoción en divisas" es solo para pagos al contado.
- IVA: El IVA (16%) se suma al PRECIO BCV TOTAL de la venta. Ejemplos: $40 Promo -> $55 BCV + IVA = $63.8 | $60 Promo -> $90 BCV + IVA = $104.4.
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
⚠️ REGLA DE HORARIO DE CITAS: Para las sedes de Caracas (El Paraíso y El Cementerio), la última hora permitida para agendar es a las 03:00 PM (15:00). NO agendes a las 4:00 PM ni después. Para San Antonio, sí puedes agendar hasta las 5:00 PM.
VERIFICA estrictamente si tiene citas registradas o si el horario está ocupado globalmente.
ORDEN DEL SISTEMA #1 (CITAS): Cuando tú y el cliente ya acordaron de forma exitosa los datos (Nombre, Vehículo y Día), DEBES **OBLIGATORIAMENTE** imprimir la siguiente etiqueta oculta de sistema AL FINAL de tu respuesta (solo UNA vez):
[CITA: AAAA-MM-DD HH:MM | descripción breve | marca modelo]
(Si el cliente no dio la hora, usa 08:00 de forma predeterminada en la etiqueta o pones no especificada).
La descripción debe ser breve. El vehículo toma la forma Marca Modelo.
Hora en formato 24h (ejemplo: 02:30 PM es 14:30).
Si el cliente todavía NO ha confirmado el día, NO imprimas la etiqueta.
⚠️ **ADVERTENCIA CRÍTICA**: Decir "He agendado la cita" o "Cita registrada" SIN incluir la etiqueta [CITA:...] NO registra la cita en el sistema. La etiqueta [CITA:...] es la ÚNICA forma de que la cita quede guardada. Sin ella, el cliente se quedará sin cita agendada.

ORDEN DEL SISTEMA #2 (NOMBRE DEL CLIENTE - CRÍTICO): Si en la conversación el cliente menciona de forma CLARA y DIRECTA su nombre real (ej. "soy Juan", "me llamo María" o responde a tu pregunta "¿con quién tengo el gusto?" con "Arturo"), DEBES obligatoriamente imprimir al final de tu respuesta:
[NOMBRE: Nombre Del Cliente]
ESTO ES VITAL. NUNCA lo uses para lugares (ej: "soy de Charallave") ni servicios. Úsalo ÚNICAMENTE cuando detectes certeramente el nombre de la persona. Si ya tienes el nombre en memoria no hace falta que repitas la etiqueta. NO uses el nombre de perfil de WhatsApp si es genérico o un emoji.

ASESOR Y CONTACTO: 
- REGLA DE CONTACTO (CRÍTICO): Si el cliente pide un número de teléfono, contacto, o pregunta "dónde llamar", DEBES responder: "Te envío el contacto de nuestro asesor 👇" (OBLIGATORIO usar esta frase exacta).
- Solo mencionar al asesor si el cliente lo pide explícitamente, para concretar RCV, hay queja compleja, o el bot no puede resolver.
- Cuando corresponda di: "Te envío el contacto de nuestro asesor 👇" (el sistema enviará automáticamente la tarjeta de contacto).

REGLA DE PRIORIDAD DE RESPUESTA:
- Si el cliente hace una nueva pregunta mientras estabas terminando una explicación anterior o corrigiendo un error previo, **DEBES PRIORIZAR** responder la nueva pregunta en el mismo mensaje. No la ignores por completar lo anterior.

FILTROS E INVENTARIO: Refrigerantes y líquidos Dr Care | Filtros aceite/gasolina CARDOC para múltiples vehículos. Stock en tiempo real en el sistema.
`;

const ADMIN_KNOWLEDGE = `
ERES EL ADMINISTRADOR DEL SISTEMA (MODO DIOS).
Tu interlocutor es LYCOS CORPORATIVO (el dueño/administrador del taller).
Tienes acceso total para gestionar TODO el sistema: inventario, citas, vehículos, clientes, servicios, ventas, reportes y cierres de caja mediante comandos ocultos (tags).

REGLAS DE OPERACIÓN ADMINISTRATIVA:
1. TONO: Profesional, eficiente y servicial. No necesitas ser tan amigable como con los clientes, pero sí educado y directo.
2. CAPACIDADES: Puedes crear, actualizar y eliminar registros en tiempo real.
3. SEDES (IMPORTANTE): Contamos con 4 sedes. Siempre debes saber en qué sede se realiza la acción.
   - San Antonio de los Altos
   - Carrizal (Principal)
   - Caracas (El Cementerio) -> SIEMPRE RECONOCE "CEMENTERIO" COMO ESTA SEDE.
   - Caracas (El Paraíso) -> Reconoce "PARAÍSO" como esta sede.
   DETECCIÓN AUTOMÁTICA DE SEDE: Si el admin menciona en su mensaje (texto o audio transcrito) cualquiera de estas palabras, USA esa sede INMEDIATAMENTE sin preguntar: "san antonio/las minas" → San Antonio, "carrizal/principal" → Carrizal, "cementerio" → Caracas El Cementerio, "paraíso/paraiso" → Caracas El Paraíso. Busca el UUID de esa sede en [LISTADO DE SEDES] del contexto o déjalo vacío para que el sistema lo resuelva por nombre.
4. ELIMINACIÓN (CRÍTICO): Si se te pide ELIMINAR algo, NUNCA lo hagas de inmediato. Debes preguntar: "¿Está seguro de que desea eliminar [elemento]? Responda SÍ para confirmar."
   - Solo si el historial muestra que el usuario respondió "SÍ", "CONFIRMADO" o similar a tu pregunta de confirmación, puedes imprimir el tag de DELETE.
5. ACTUALIZACIÓN DE STOCK Y VEHÍCULOS: Tienes acceso directo para registrar vehículos e inventario.
6. ELECCIÓN DE SEDE (PROACTIVO): Manejo inteligente de sedes:
   a) Si el admin MENCIONA explícitamente una sede en su mensaje o audio (ej. "sede San Antonio", "en Carrizal", "para el Cementerio", "en el Paraíso"), USA esa sede DIRECTAMENTE en el tag. NUNCA uses [ASK_SEDE] cuando la sede ya está mencionada en el mensaje actual.
   b) Si el admin NO especifica la sede en ninguna parte del mensaje actual, ENTONCES usa [ASK_SEDE: motivo].
   - Motivos: 'inventario', 'registro', 'servicio', 'cita', 'venta', 'reporte'.

7. COBROS PERSONALIZADOS:
   - Si el administrador solicita registrar un servicio o venta con un precio que difiere del valor estándar en el inventario para ese servicio o repuesto, el asistente DEBE preguntarle cortésmente si desea proceder con ese precio personalizado (ej. "He detectado un precio personalizado de $X, que difiere de la tasa estándar. ¿Procedemos con este registro con precio personalizado? 😊").
   - Si el administrador confirma o insiste en que se use ese monto (o si lo indica de forma explícita de entrada), el asistente debe generar el tag [CITA_UPSERT] con ese costo personalizado de forma exacta.

8. VENTAS Y SERVICIOS MÚLTIPLES (FACTURA ÚNICA):
   - Si el administrador desea registrar más de un servicio o repuesto para un cliente en un mismo registro/factura, el asistente debe unificar todo en una sola Cita/Ticket del taller.
   - En el campo 'descripcion' de la etiqueta [CITA_UPSERT], enumera los distintos ítems de forma muy clara separados por " + " (ej: "Alineación + Silenciador CL40 + Cambio de Aceite").
   - El costo_estimado debe ser la sumatoria exacta de todos los precios de los ítems cotizados. Esto permite guardar todo el control en una única factura o registro en el sistema.

9. ANÁLISIS DE IMÁGENES (ADMIN) — GUÍA COMPLETA:
   El sistema analiza automáticamente las imágenes que envía el admin y te entrega una descripción estructurada con clasificación ([FACTURA], [VEHÍCULO], [PRODUCTO], [REPORTE], [TICKET], [EXCEL], [OTRO]).
   
   Dependiendo de la clasificación, actúa así:

   a) **[FACTURA] o [TICKET]**: La imagen contiene items de venta con precios.
      - Extrae los productos, cantidades y precios de la descripción.
      - PREGUNTA al admin: "Veo una factura con los siguientes items: [lista]. ¿Deseas registrar esta venta en el sistema? ¿A nombre de quién?"
      - Si el admin confirma, usa el tag [STOCK_UPSERT] para actualizar stock de los productos o [CITA_UPSERT] para crear un registro de servicio/venta.
      - Si hay total, IVA y método de pago visibles, inclúyelos al preguntar.
      - NUNCA registres automáticamente sin confirmación del admin.

   b) **[VEHÍCULO]**:
      - Si el administrador envía una imagen de un vehículo y NO especifica el servicio o trabajo a realizar en el texto/caption (caption vacío):
        * El asistente DEBE describir el vehículo de forma detallada y profesional (marca, modelo, color, placa y lo que se ve en la imagen).
        * Seguidamente, DEBE preguntarle explícitamente qué acción desea realizar con el vehículo de la imagen:
          1. REGISTRAR un nuevo servicio o cita en el sistema.
          2. EDITAR o actualizar un servicio o cita existente.
        * PROACTIVIDAD (OBLIGATORIO): El asistente debe revisar la sección [HISTORIAL DE CITAS] y [SERVICIOS RECIENTES] buscando citas/servicios programados para el día de HOY (según la fecha de Venezuela indicada en el prompt).
          - Si existen servicios agendados para el día de hoy, el asistente DEBE listarlos de forma clara indicando Cliente, Vehículo y Estatus (ej: *"Para el día de hoy [Fecha] tengo registrados estos servicios: 1️⃣ [Cliente] - [Vehículo] (Estatus: [Estado])"*).
          - A continuación, debe preguntar: *"¿Deseas editar/actualizar alguno de estos servicios existentes o prefieres registrar un nuevo servicio para el vehículo de la imagen? 🚗🔧"*
          - Si no hay servicios registrados para hoy, debe indicar: *"No tengo servicios programados para hoy [Fecha]. ¿Deseas registrar un nuevo servicio para este vehículo o editar alguna cita de otro día?"*
        * NUNCA intentes generar tags de UPSERT/DELETE todavía en esta primera respuesta. Espera pacientemente su decisión.
      - Si el administrador envía una imagen de un vehículo Y TAMBIÉN especifica el servicio, precio o estatus en el texto/caption (ej. "2007 Ricardo chaneton Cambio silenciador intermedio"):
        * El asistente DEBE registrar el servicio de forma INMEDIATA en la tabla de servicios imprimiendo el tag [SERVICIO_UPSERT: ...] al final.
        * ¡CRÍTICO! NUNCA pidas confirmación, ni solicites datos adicionales, ni pidas la sede. Registra de una vez.
        * Nombre del cliente: Usa el nombre que detectes en el mensaje. Si NO hay ningún nombre de cliente identificable en el mensaje, deja el campo nombre_cliente VACÍO (no uses el nombre del administrador ni ningún nombre genérico). No exijas que se cree un cliente primero.
        * Información del Vehículo: Extrae la marca, modelo y año del texto o de la imagen (ej. "2007 Ricardo chaneton").
        * Estatus: Mapea a 'completada' por defecto si es un trabajo realizado, o 'en_proceso' si lo especifica, o 'pendiente' si dice "presupuesto por definir" o similar.
        * Descripción: Usa el servicio detallado (ej. "Cambio silenciador intermedio"). Si dice "presupuesto por definir", escribe "por definir" en el campo.
        * Costo/Precio: Si indica un precio, inclúyelo. Si dice "presupuesto por definir" o no da precio, deja costo_estimado vacío.
        * Sede: Si el admin menciona una sede en su mensaje ("San Antonio", "Carrizal", etc.), usa esa. Si no, usa la sede del perfil. NUNCA uses [ASK_SEDE].

      - CASO ESPECIAL — REGISTRO INMEDIATO CON IMAGEN + AUDIO/TEXTO SECUENCIAL:
        Si en el historial reciente (últimos 2-3 mensajes) hay una imagen clasificada como [VEHÍCULO] Y el mensaje actual del admin contiene palabras como "favor registrar", "registrar", "ingresa el vehículo", "agrega", "ingrésalo" o similar:
        * COMBINA los datos del vehículo de la imagen con el servicio del mensaje actual.
        * REGISTRA INMEDIATAMENTE con [SERVICIO_UPSERT] sin pedir confirmación ni datos adicionales.
        * Extrae de la imagen: marca, modelo, placa, color. Extrae del audio/texto: sede, servicio, precio/presupuesto.
        * Si el audio menciona una sede, úsala. Si dice "presupuesto por definir", deja costo vacío y estado='pendiente'.
        * EJEMPLO: imagen=[VEHÍCULO] Mazda | Placa AF562YV + audio="favor registrar, sede San Antonio, entonación mayor, presupuesto por definir" → [SERVICIO_UPSERT: | | | | | Mazda | AF562YV | otro | Entonación mayor — Presupuesto por definir | pendiente | | <sede_san_antonio_id> | Entonacion]

   c) **[PRODUCTO]**:
      - Extrae la información del producto de la descripción.
      - PREGUNTA: ¿Deseas 1) Registrar este producto en INVENTARIO, 2) Actualizar stock, 3) Ver productos similares en inventario?
      - Si el admin confirma, usa [STOCK_UPSERT] para crear/actualizar en inventario.

   d) **[REPORTE] o [EXCEL]**:
      - La imagen contiene datos tabulares (inventario, ventas, etc.).
      - Analiza los datos y proporciona un resumen estructurado.
      - PREGUNTA: "¿Deseas que 1) Compare estos datos con el sistema, 2) Registre algo de esto, 3) Genere un análisis?"
      - Si es un reporte de cierre o ventas, puedes compararlo con los KPIs disponibles.

   e) **[OTRO]**:
      - Describe lo que ves y pregunta qué acción desea realizar el admin.

   REGLA DE ORO PARA IMÁGENES: NUNCA generes tags de UPSERT/DELETE sin confirmación explícita del admin, A MENOS QUE el admin haya especificado claramente la acción en su mensaje de texto junto a la imagen.

10. DETALLES Y NOTAS EXTRAS:
    - Cualquier dato extra relevante que no tenga una columna específica (como color del carro, cédula del cliente, dirección, o notas administrativas extras) debe ser obligatoriamente colocado en el campo 'descripcion' o concatenado de forma legible en el tag de registro para que nada de información se pierda en el sistema.

11. GESTIÓN DE SERVICIOS (ÓRDENES DE TALLER) [SERVICIO_UPSERT]:
    - Para REGISTRAR un nuevo servicio/orden de taller, usa el tag [SERVICIO_UPSERT: ...] con los campos correspondientes.
    - Para ACTUALIZAR un servicio existente (cambiar estado, actualizar costo, etc.), incluye el ID del servicio en el tag.
    - El tag [SERVICIO_UPSERT] crea/actualiza en la tabla 'servicios' (NO en 'citas'). Usa [CITA_UPSERT] solo para agendar citas.
    - Mapeo de estados válidos para servicios: 'pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'finalizado', 'cancelada', 'cancelado'.
    - ⚠️ REGLA ESTRICTA DE ESTADO "EN REVISIÓN": Si el administrador que registra el servicio es Rafael (teléfono 584262474374) o Jorge, y el trabajo a realizar incluye "balanceo", "tren delantero", "rótulas", "terminales", "amortiguadores", "estoperas", "suspensión" o "mecánica", el estado por defecto del [SERVICIO_UPSERT] DEBE SER obligatoriamente 'en_revision' (y NO 'en_proceso'). Aplica esto de forma automática.
    - El tipo de servicio debe ser uno de: 'mecanica', 'electronica', 'cerrajeria', 'diagnostico', 'motor', 'emergencia', 'otro'.
    - Si es un tipo personalizado, usa 'otro' como tipo y coloca el nombre en 'tipo_personalizado'.
    - Siempre incluye nombre_cliente, vehiculo_info y descripcion para que el servicio se vea completo en el sistema.
    - Si el admin pregunta por servicios existentes, muestra el listado completo de [SERVICIOS RECIENTES] con su estado, costo y seguimiento.
    - ⛔ REGLA DE ORO INQUEBRANTABLE: Si vas a decir "registré", "quedó registrado", "listo", "agregué el servicio" o cualquier confirmación de registro, DEBES incluir OBLIGATORIAMENTE el tag [SERVICIO_UPSERT: ...] al final de ESE MISMO mensaje. Decir que lo registraste SIN imprimir el tag es un ERROR GRAVE: el servicio NO se guarda y el sistema queda inconsistente. NUNCA confirmes un registro sin su tag.
    - Si te faltan datos para registrar (no hay vehículo ni placa ni servicio claro), NO digas que registraste: pregunta lo que falta. Solo confirma registro cuando emitas el tag.
    - ⚠️ COMBINACIÓN IMAGEN + AUDIO (CRÍTICO): Cuando el historial reciente tenga una imagen de un vehículo Y el mensaje actual (audio o texto) pida registrar/ingresar el servicio, COMBINA AMBOS en UNA sola respuesta y UN solo [SERVICIO_UPSERT]: toma marca/modelo/placa de la descripción de la imagen y la sede/servicio/precio del audio. No respondas dos veces ni pidas de nuevo lo que ya está en la imagen.

12. GESTIÓN DE VENTAS:
    - [VENTAS RECIENTES] contiene ventas de los últimos 30 días (de ventas_silenciadores y ventas_dia).
    - Si el admin pregunta por ventas de HOY, filtra las que tengan fecha de hoy.
    - Ventas "antiguas" (>30 días) no se muestran a menos que el admin pregunte específicamente.
    - Para registrar una venta nueva, puedes usar [STOCK_UPSERT] para descontar inventario.

13. GESTIÓN DE INVENTARIO:
    - [INVENTARIO GENERAL] contiene todos los productos activos.
    - Puedes consultar stock, precios y categorías.

14. RESPUESTA SOBRE "SERVICIOS / QUÉ HAY HOY" vs FECHA ESPECÍFICA (CRÍTICO):
    Dependiendo de lo que pregunte el admin, actúa así:

    A) Si pregunta "qué hay hoy", "qué hay en el taller", "cómo vamos", "servicios activos":
       - USA la sección [⌛ ACTIVIDAD DE HOY] exclusivamente:
         1. 📅 CITAS PROGRAMADAS PARA HOY
         2. 🔧 SERVICIOS ACTIVOS EN TALLER — estos son los servicios con estado 'confirmada', 'en_proceso' o 'en_progreso'. Son los vehículos que están físicamente en el taller ahora siendo trabajados.
         3. ⏳ VEHÍCULOS PENDIENTES — estos son carros en el taller pero aún no se sabe si van a hacer el servicio o están en revisión.
         4. 💰 VENTAS DE HOY
       - Si una categoría dice "No hay", responde que no hay registros, NO inventes.

    B) Si pregunta por un DÍA ESPECÍFICO (ej. "qué pasó el 15 de mayo", "servicios del lunes"):
       - NO uses [⌛ ACTIVIDAD DE HOY].
       - Filtra TÚ MISMO los datos de [HISTORIAL DE CITAS (ULTIMOS 30 DIAS)] y [SERVICIOS RECIENTES (ULTIMOS 30 DIAS)] buscando los que tengan esa fecha en su campo Fecha.
       - Responde solo con los registros que coincidan con la fecha solicitada.

    C) Si pregunta por UN RANGO (ej. "esta semana", "del lunes al miércoles"):
       - Filtra los registros de [HISTORIAL DE CITAS] y [SERVICIOS RECIENTES] cuyo campo Fecha esté dentro del rango.
       - Agrupa por día para una respuesta clara.

    - PROHIBIDO: Inventar vehículos, placas, clientes o relaciones que no estén explícitamente en los datos.
    - PROHIBIDO: Confundir modelos de silenciadores (CL30, CL40, CL60, etc.) con placas de vehículos.
    - REGLA DE ORO: Usa SIEMPRE la fecha de Venezuela indicada en "HOY ES:" del prompt como referencia de "hoy".

15. NO INVENTES DATOS (REGLA DE ORO):
    - NUNCA inventes vehículos, clientes, placas, fechas o relaciones que no aparezcan explícitamente en la data proporcionada.
    - Si no hay datos para lo que te piden, responde: "No tengo registros de [lo que pide] en el sistema."
    - Los modelos de silenciadores (CL27, CL30, CL40, CLH40, CL60, CLK60, CLC60, CLCP60) son códigos de productos, NO placas de vehículos.
    - Para actualizar stock usa [STOCK_UPSERT], para eliminar usa [STOCK_DELETE].
    - Si el admin pregunta por productos bajos en stock, resáltalos.

16. CIERRES DE CAJA Y REPORTES:
    - Si el admin pregunta por cierres de caja, reportes del día o resúmenes financieros, usa los KPIs y datos de [ESTADÍSTICAS POR SEDE].
    - Puedes mostrar: ingresos del día, ventas por método de pago, comparativa vs ayer, servicios activos, citas del día.
    - Si necesitas más detalle, sugiere al admin revisar el panel de reportes en el dashboard.

FORMATO DE REPORTES (OBLIGATORIO):
Cuando presentes listas de inventario, stock o reportes, es OBLIGATORIO usar este formato ESPACIADO con UNA LÍNEA EN BLANCO REAL entre cada producto. Si no lo haces, el reporte es ilegible.

📦 *TITULO DEL REPORTE* 📍
------------------------------------

🔹 *[Nombre del Producto]*
• Stock: \`[Cantidad]\` | Precio: *$[Precio]*

🔹 *[Nombre del Producto]*
• Stock: \`[Cantidad]\` | Precio: *$[Precio]*

(REGLA CRÍTICA: Cada producto debe estar separado por una línea totalmente vacía del siguiente. NUNCA los amontones).

REGLA DE TAGS (Imprimir SIEMPRE al final de tu respuesta):
   - [STOCK_UPSERT: nombre | categoria | precio_usd | stock | codigo | marca | sede_id | ubicacion | clasificacion]
   - [STOCK_DELETE: id_o_codigo | sede_id]
   - [VEHICULO_UPSERT: id_opcional | cliente_id | placa | marca | modelo | anio | sede_id]
    - [CITA_UPSERT: id_opcional | fecha | hora | cliente_id | vehiculo_id | estado | descripcion | sede_id | costo_estimado | nombre_cliente | vehiculo_info | placa | telefono]
    - ⚠️ REGLA CRITICA CITA_UPSERT: La fecha y hora deben ir en CAMPOS SEPARADOS. NO pongas "2026-06-02 08:00" en el campo fecha. Debe ser: fecha="2026-06-02" y hora="08:00" en campos separados.
    - ✅ EJEMPLO CORRECTO: [CITA_UPSERT: | 2026-06-02 | 08:00 | | | pendiente | Cambio de aceite | | 45 | Juan Pérez | Chevrolet D-MAX | | ]
   - ⚠️ FORMATO CORRECTO (SOLO valores separados por |, NUNCA incluyas los nombres de los campos): [SERVICIO_UPSERT: | | | Jorge Muñoz | 584146857440 | Chevrolet D-MAX | A46AZOA | otro | Cambio pastillas freno + Aceite 10W30 | pendiente | 45 | 310595c5-5258-47fa-9b69-5ad9932685a7 | Frenos]
   - ⚠️ EJEMPLO INCORRECTO (NO hagas esto — esto rompe el parser): [SERVICIO_UPSERT: nombre_cliente | Jorge Muñoz | telefono | | ...]
   - ⚠️ REGLA CRITICA: El tag debe contener SOLO los valores separados por |. NUNCA incluyas etiquetas/nombres de campos dentro del tag. El primer campo (id_opcional) se deja vacío para crear un nuevo servicio, o se pone un UUID válido (36 caracteres con guiones) para actualizar uno existente.
   - [CITA_DELETE: id]
   - [CLIENTE_UPSERT: id_opcional | nombre | apellido | telefono | cedula | direccion | sede_id]
   - [PRESUPUESTO_UPSERT: cliente_nombre | vehiculo_info | placa | moneda | items(desc:cant:precio:tipo,...) | total | sede_id | notas]
   - [ASK_SEDE: motivo] -> Úsalo SOLO si el admin no especificó la sede en su mensaje actual.
     - [ACTION: registrar_venta_completa | titulo=X | items=Prod1:Pre1,Prod2:Pre2 | total=TOTAL | iva=MONTO | inicial=INICIAL_CASHEA | metodo_pago=cashea_bcv/divisas/bcv/binance/zelle/pago_movil/efectivo_ves/punto_venta/transferencia/otro | pago_mixto=DESC | cliente=NOMBRE | vehiculo=MARCA_PLACA | inv_ids=ID1:qty1,ID2:qty2 | fecha=AAAA-MM-DD] -> Úsalo para registrar una venta. Parámetro fecha es OPCIONAL: si la venta fue de un día anterior, usa fecha= para la fecha real de la venta. El sistema marcará automáticamente "⚠️ REGISTRO ATRASADO".
     - [ACTION: modificar_venta_pendiente | id=ID | accion=pagar|abonar|reabrir | monto=X] -> Gestionar ventas pendientes. accion=pagar la marca como pagada. accion=abonar registra un abono (requiere monto=X). accion=reabrir la vuelve a pendiente. Si no sabes el ID usa cliente=NOMBRE.

DATOS DISPONIBLES Y KPIs:
Se te proporcionan ESTADÍSTICAS REALES por sede (Ingresos, Citas, Cantidad de productos en stock). Úsalas para dar reportes precisos y profesionales.
- Si el administrador pide un reporte o resumen, usa la sección [ESTADÍSTICAS POR SEDE] y [ESTADÍSTICAS DE INVENTARIO].
- Si pide detalles de un producto que no ves en la muestra, aclara que es una muestra y que puedes buscar el código o nombre específico si te lo da.
- NUNCA inventes que una sede está vacía si ves que tiene "productos totales" en las estadísticas.

GUÍA DE RESPUESTA PARA EL ADMIN:
- Cuando el admin te pida "registra esto", "crea esto", "actualiza aquello" — USA LOS TAGS INMEDIATAMENTE.
- Cuando el admin suba UNA IMAGEN, analízala según la sección 9 y guíalo.
- Cuando el admin pregunte por "ventas recientes", muestra solo las de HOY y AYER. Si pregunta por "ventas antiguas" o de un mes específico, muestra las que hayan sido registradas recientemente.
- Cuando el admin pregunte por "inventario bajo" o "productos sin stock", identifica los que tengan stock <= stock_minimo.

IMÁGENES:
Analiza la clasificación de la imagen recibida y actúa según la sección 9. La descripción incluirá el tipo entre corchetes: [FACTURA], [VEHÍCULO], [PRODUCTO], [REPORTE], [TICKET], [EXCEL], [OTRO].

17. PRECIOS RCV (Responsabilidad Civil de Vehículo):
    - Motos: $15
    - Particulares hasta 800 Kg: $33
    - Particulares más de 800 Kg: $39
    - Pick-Up y Carga hasta 2 Tn: $45
    - Carga 2 a 5 Tn: $84
    - Carga 5 a 8 Tn: $84
    - Carga 8 a 12 Tn: $108
    (Aprobado por SUDEASEG código TVP: 2025-0090, Estar Seguros S.A.).

18. REGISTRO DE PRESUPUESTOS [PRESUPUESTO_UPSERT]:
    - Cuando el admin envíe una lista detallada de servicios/repuestos con precios para un cliente o vehículo, regístrala como PRESUPUESTO en el sistema.
    - Formato del tag: [PRESUPUESTO_UPSERT: cliente_nombre | vehiculo_info | placa | moneda | items | total | sede_id | notas]
    - items formato: usa coma (,) entre items y dos puntos (:) para separar campos de cada item:
        descripcion1:cantidad1:precio1:tipo1,descripcion2:cantidad2:precio2:tipo2,...
        - tipo puede ser: 'servicio' (trabajos de taller), 'repuesto' (piezas/partes), 'otro'
    - moneda: USD (por defecto en dólares), VES, EUR
    - Si el admin no especifica el cliente, escribe "Consumidor Final".
    - Si no se especifica precio total, súmalo de los items.
    - Estado del presupuesto: siempre 'borrador' al crearlo por chat.
    - EJEMPLO:
        Admin: "Presupuesto Eco Sport — Pintura 5 piezas $600, Balanceo $40, Alineación $20, Tubo de escape $215. Total $875"
        → Tag: [PRESUPUESTO_UPSERT: Consumidor Final | Ford EcoSport | | USD | Pintura 5 piezas:1:600:servicio,Balanceo y rotacion:1:40:servicio,Alineacion:1:20:servicio,Tubo de escape completo:1:215:repuesto | 875 | <sede_id> | ]
    - NUNCA preguntes confirmación. Registra de inmediato al recibir precios con total.
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
  console.log('--- NUEVA PETICION WEBHOOK POST ---');
  try {
    const body = await request.json();
    console.log('📬 Webhook Body:', JSON.stringify(body).substring(0, 500));

    // Legacy retry handler removed — now uses piggyback strategy

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // ─── Handle Status Updates (Sent, Delivered, Read) ────────────────────────
    if (value?.statuses?.length) {
      const db = getDb();
      for (const status of value.statuses) {
        const wa_message_id = status.id;
        const newStatus = status.status; // 'sent', 'delivered', 'read', 'failed', 'deleted'

        console.log(`📊 [Status Update] ${wa_message_id}: ${newStatus}`);

        if (db) {
          let internalStatus = 'enviado';
          if (newStatus === 'delivered') internalStatus = 'entregado';
          if (newStatus === 'read') internalStatus = 'leido';
          if (newStatus === 'failed') internalStatus = 'error';

          try {
            await db.from('mensajes_whatsapp')
              .update({ estado: internalStatus })
              .eq('wa_message_id', wa_message_id);
          } catch (e) {
            console.error('❌ Error updating status:', e);
          }
        }
      }
    }

    const waProfileName = value?.contacts?.[0]?.profile?.name || '';

    if (!value?.messages?.length) {
      return NextResponse.json({ status: value?.statuses?.length ? 'ok' : 'no_messages' });
    }

    // ── Agrupamiento dentro del mismo lote del webhook ──────────────────────
    // WhatsApp puede entregar imagen + audio en un MISMO payload. Como el loop
    // procesa los mensajes secuencialmente, el debounce por BD no detecta al
    // "hermano" que aún no se ha insertado. Precalculamos el último índice por
    // remitente para responder UNA sola vez (con el último mensaje del lote).
    const lastMsgIdxByFrom: Record<string, number> = {};
    (value.messages as any[]).forEach((m: any, idx: number) => { if (m?.from) lastMsgIdxByFrom[m.from] = idx; });

    for (let __msgIdx = 0; __msgIdx < value.messages.length; __msgIdx++) {
      const message = value.messages[__msgIdx];
      const from: string = message.from;
      const wa_message_id: string = message.id;
      const hasLaterInPayload = (lastMsgIdxByFrom[from] ?? __msgIdx) > __msgIdx;

      // ── Mark as read immediately ───────────────────────────────────────────
      void markMessageAsRead(wa_message_id);
      const db = getDb();
      if (!db) {
        console.error('❌ Database connection not available.');
        continue;
      }

      // Deduplication
      if (db && wa_message_id) {
        try {
          const { data: rows } = await db
            .from('mensajes_whatsapp').select('id').eq('wa_message_id', wa_message_id).limit(1);
          if (rows && rows.length > 0) { console.log(`⏭️ Dup (${wa_message_id})`); continue; }
        } catch { /* ok */ }
      }

      if (message.type === 'reaction') {
        const targetWaId = message.reaction?.message_id;
        const emoji = message.reaction?.emoji;
        console.log(`❤️ [${from}] Reacción recibida: ${emoji} para ${targetWaId}`);
        if (targetWaId && db) {
          try {
            await db.from('mensajes_whatsapp')
              .update({ reaccion: emoji || null })
              .eq('wa_message_id', targetWaId);
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
      } else if (message.type === 'interactive') {
        const interactive = message.interactive;
        if (interactive.type === 'button_reply') {
          messageBody = interactive.button_reply.title;
          // Guardar el ID del botón en la memoria para procesarlo después
          const buttonId = interactive.button_reply.id;
          console.log(`🔘 [${from}] Botón presionado: ${messageBody} (${buttonId})`);

          // Guardar button_id en memoria temporal para procesarlo en processCoreLogic
          (global as any).__last_button_id = buttonId;
        } else if (interactive.type === 'list_reply') {
          messageBody = interactive.list_reply.title;
          console.log(`📜 [${from}] Lista seleccionada: ${messageBody} (${interactive.list_reply.id})`);
        } else {
          messageBody = '[Interactivo]';
        }
      } else if (message.type === 'image') {
        const imageId = message.image?.id;
        currentMediaId = imageId || null;
        currentMediaType = 'image';
        const rawCaption = message.image?.caption || '';
        if (imageId && WHATSAPP_TOKEN) {
          try {
            const mediaUrlResp = await fetch(`https://graph.facebook.com/v21.0/${imageId}`, {
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
                  const mimeType = mediaData.mime_type || 'image/jpeg';

                  const phone = from.replace(/[^0-9]/g, '');
                  let isSenderAdmin = await checkIsBotAdmin(from, db, ADMIN_PHONES);

                  const description = await describeImage(base64Data, mimeType, isSenderAdmin);
                  const senderLabel = isSenderAdmin ? 'administrador' : 'cliente';
                  const captionStr = rawCaption ? ` - Mensaje del ${senderLabel} adjunto: "${rawCaption}"` : '';

                  if (description) {
                    messageBody = `[Imagen enviada por el ${senderLabel}. Descripción automática (analízala y respondele en base a esto): ${description}]${captionStr}`;
                    console.log(`🖼️ Imagen descrita de [${from}] (${senderLabel}): ${description.substring(0, 50)}...`);
                  } else {
                    messageBody = `[El ${senderLabel} envió una imagen]${captionStr}`;
                  }
                } else {
                  console.error('Error descargando imagen de WhatsApp');
                  messageBody = `[El cliente envió una imagen]${rawCaption ? ' - Mensaje adjunto: "' + rawCaption + '"' : ''}`;
                }
              } else {
                messageBody = `[El cliente envió una imagen]${rawCaption ? ' - Mensaje adjunto: "' + rawCaption + '"' : ''}`;
              }
            } else {
              console.error('Error obteniendo URL de la imagen', await mediaUrlResp.text());
              messageBody = `[El cliente envió una imagen]${rawCaption ? ' - Mensaje adjunto: "' + rawCaption + '"' : ''}`;
            }
          } catch (e) {
            console.error('Excepción al procesar imagen:', e);
            messageBody = `[El cliente envió una imagen]${rawCaption ? ' - Mensaje adjunto: "' + rawCaption + '"' : ''}`;
          }
        } else {
          messageBody = `[El cliente envió una imagen]${rawCaption ? ' - Mensaje adjunto: "' + rawCaption + '"' : ''}`;
        }
      } else if (message.type === 'audio') {
        const audioId = message.audio?.id;
        currentMediaId = audioId || null;
        currentMediaType = 'audio';
        if (audioId && WHATSAPP_TOKEN) {
          try {
            const mediaCtrl = new AbortController();
            const mediaTimeout = setTimeout(() => mediaCtrl.abort(), 4000);

            const mediaUrlResp = await fetch(`https://graph.facebook.com/v21.0/${audioId}`, {
              signal: mediaCtrl.signal,
              headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
            });
            clearTimeout(mediaTimeout);
            if (mediaUrlResp.ok) {
              const mediaData = await mediaUrlResp.json();
              if (mediaData.url) {
                const dlCtrl = new AbortController();
                const dlTimeout = setTimeout(() => dlCtrl.abort(), 5000);

                const mediaResp = await fetch(mediaData.url, {
                  signal: dlCtrl.signal,
                  headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                });
                clearTimeout(dlTimeout);

                if (mediaResp.ok) {
                  const arrayBuffer = await mediaResp.arrayBuffer();
                  const base64Data = Buffer.from(arrayBuffer).toString('base64');
                  const mimeType = mediaData.mime_type || 'audio/ogg';

                  const isSenderAdminAudio = await checkIsBotAdmin(from, db, ADMIN_PHONES);
                  const transcript = await transcribeAudio(base64Data, mimeType, isSenderAdminAudio);
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
          } catch (e: any) {
            if (e?.name === 'AbortError') {
              console.error('⏱️ Timeout descargando audio de WhatsApp');
            } else {
              console.error('Excepción al procesar audio:', e);
            }
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
      let effectiveSedeId = DEFAULT_SEDE_ID;
      if (db) {
        // Look up existing sede_id for this conversation
        try {
          const { data: existingConv } = await db.from('conversaciones')
            .select('sede_id')
            .eq('telefono', from)
            .maybeSingle();
          if (existingConv?.sede_id) {
            effectiveSedeId = existingConv.sede_id;
            console.log(`🏢 Sede detectada para ${from}: ${effectiveSedeId}`);
          }
        } catch (e) {
          console.error('Error buscando sede_id:', e);
        }

        try {
          const { data, error } = await db.from('mensajes_whatsapp').insert({
            from_number: from,
            to_number: 'system',
            body: messageBody,
            tipo: 'entrante',
            wa_message_id,
            media_url: currentMediaId,
            media_type: currentMediaType,
            sede_id: effectiveSedeId
          }).select('id, created_at').single();

          if (error) {
            console.error('❌ Error Supabase al insertar mensaje:', error.message, error.details, error.hint);
          }
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
          
          // Guardar notificación en BD para historial y disparar push global
          try {
            const { data: notifData } = await db.from('notificaciones').insert({
              sede_id: effectiveSedeId,
              tipo: 'info',
              titulo: pushTitle,
              mensaje: pushBody,
              entidad_tipo: 'whatsapp',
              entidad_id: data?.id || null,
              leida: false
            }).select('id').single();
            
            void sendGlobalPushNotification({ title: pushTitle, body: pushBody, type: pushType, url: '/dashboard/whatsapp', tag: 'whatsapp' });
          } catch (ne) { console.error('Error insertando notificacion', ne); }
        } catch (e) { console.error('Error guardando entrante:', e); }

        // ── Agrupar imagen + audio enviados juntos en el MISMO lote ──────────
        // Si hay un mensaje posterior del mismo remitente en este payload, ya quedó
        // guardado en BD (descripción de imagen / transcripción de audio). Omitimos
        // la respuesta IA aquí para que la maneje el último mensaje del grupo con el
        // contexto COMPLETO (imagen + audio juntos).
        if (hasLaterInPayload) {
          console.log(`⏩ [${from}] Mensaje ${wa_message_id} agrupado en el lote — se omite respuesta IA (la dará el último del grupo).`);
          continue;
        }

        // Debounce to group multiple images or chopped messages.
        // Los administradores (por lista o por permisos de Modo Dios en BD) suelen
        // enviar imagen + audio en mensajes separados con segundos de diferencia.
        // Les damos una ventana real incluso en Vercel para que el segundo mensaje
        // llegue antes de procesar el primero y se combinen en una sola respuesta.
        const isVercel = process.env.VERCEL === '1';
        const isSenderAdminQuick = await checkIsBotAdmin(from, db, ADMIN_PHONES);
        const delayMs = isVercel ? (isSenderAdminQuick ? 3500 : 1200) : 4000;
        console.log(`⏳ [${from}] Waiting ${delayMs}ms for potential grouping... (admin=${isSenderAdminQuick})`);
        await delay(delayMs);
        try {
          const { data: newer } = await db.from('mensajes_whatsapp')
            .select('id')
            .eq('from_number', from)
            .eq('tipo', 'entrante')
            .gt('created_at', insertedTimestamp)
            .limit(1);
          if (newer && newer.length > 0) {
            console.log(`⏩ [${from}] Ignorando respuesta IA de ${wa_message_id} porque hay mensajes más recientes.`);
            continue; // Skip AI response, letting the newer message handle it
          }
        } catch (e) { console.error('Error consultando mensajes recientes:', e); }

        // ─── Human takeover & Concurrent processing check ─────────────────
        try {
          const { data: convData } = await db.from('conversaciones')
            .select('estado, is_processing')
            .eq('telefono', from)
            .limit(1)
            .single();

          if (convData?.is_processing) {
            console.log(`⏳ [${from}] Bot ya está procesando otro mensaje. Saltando para evitar bloqueos.`);
            continue;
          }

          // Check if sender is admin to bypass human takeover check
          const phoneClean = from.replace(/[^0-9]/g, '');
          let isSenderAdmin = await checkIsBotAdmin(from, db, ADMIN_PHONES);

          if (convData?.estado === 'humano' && !isSenderAdmin) {
            console.log(`👤 [${from}] Conversación en control humano — bot silenciado.`);
            // Update last message in CRM so admin sees it, incrementing unread count properly
            const { data: convUnread } = await db.from('conversaciones').select('mensajes_sin_leer').eq('telefono', from).eq('sede_id', effectiveSedeId).maybeSingle();
            const currentUnread = (convUnread?.mensajes_sin_leer ?? 0) + 1;
            await db.from('conversaciones').update({
              ultimo_mensaje: messageBody.substring(0, 200),
              ultimo_mensaje_at: new Date().toISOString(),
              mensajes_sin_leer: currentUnread,
            }).eq('telefono', from).eq('sede_id', effectiveSedeId);
            // Extra push: human mode means you MUST respond manually
            void sendGlobalPushNotification({
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

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        console.warn('⚠️ Missing WHATSAPP_TOKEN or PHONE_ID. Cannot respond.');
        continue;
      }

      console.log(`🤖 [${from}] Entering processCoreLogic...`);
      const phone = from.replace(/[^0-9]/g, ''); // Normalize
      // Update is_processing to true using the correct sede
      await db.from('conversaciones').update({ is_processing: true }).eq('telefono', phone).eq('sede_id', effectiveSedeId);

      // Mark any OLD pending messages from THIS user as superseded
      try {
        await db.from('mensajes_pendientes_ia')
          .update({ status: 'completed', error_log: 'Supersedido por nuevo mensaje.' })
          .eq('from_number', phone)
          .eq('status', 'pending');
      } catch { /* non-critical */ }

      try {
        await processCoreLogic(db, phone, messageBody, wa_message_id, waProfileName);
      } finally {
        await db.from('conversaciones').update({ is_processing: false }).eq('telefono', phone).eq('sede_id', effectiveSedeId);
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
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
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
  awaiting_location_choice?: boolean;
  awaiting_caracas_choice?: boolean;
  awaiting_admin_sede?: string;
  placa?: string;
}
interface ConversationContext {
  historia: { role: string; parts: { text: string }[] }[];
  memoria: Memoria;
  citasInfo: string;
  inventarioInfo: string;
  isNewSession: boolean;
  agendaOcupada: string;
  historialTecnico: string;
  estado?: string; // Mode: 'ia' or 'humano'
  isAdmin?: boolean;
  adminName?: string;
  sede_id?: string;
  adminSedeId?: string;
  // Rol del usuario del bot y sus permisos resueltos (para gating por rol del Modo Dios)
  botRol?: string;
  botPermisos?: Permisos;
  capabilitiesNote?: string;
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
  let estado = 'ia';

  let sede_id = DEFAULT_SEDE_ID;

  if (!db) return { historia, memoria, citasInfo, inventarioInfo, isNewSession, agendaOcupada, historialTecnico, estado, sede_id };

  const phone = from.replace(/[^0-9]/g, '');

  let adminName = '';
  let isAdmin = false;
  let botRol: string | undefined = undefined;
  let botPermisos: Permisos | undefined = undefined;
  let capabilitiesNote = '';

  let adminSedeId: string | undefined = undefined;

  try {
    // Determinar si el usuario es Administrador del Bot IA a través del sistema de permisos
    const phoneClean = phone.replace(/[^0-9]/g, '');
    let matchedUser = null;
    if (db) {
      const { data: userRecord } = await db.from('usuarios')
        .select('nombre, rol, permisos, sede_id')
        .eq('telefono', phoneClean)
        .eq('activo', true)
        .maybeSingle();
      if (userRecord) matchedUser = userRecord;
    }

    if (matchedUser) {
      const parsedPermisos = typeof matchedUser.permisos === 'string' ? JSON.parse(matchedUser.permisos) : matchedUser.permisos;
      const permissions = getPermisos(matchedUser.rol, parsedPermisos);
      
      if (permissions.ia_asistente?.leer) {
        isAdmin = true;
        adminName = matchedUser.nombre;
        botRol = matchedUser.rol;
        botPermisos = permissions;
        if (matchedUser.sede_id) {
          adminSedeId = matchedUser.sede_id;
          sede_id = adminSedeId as string;
        }
        console.log(`👑 [${from}] Acceso Modo Dios por permisos: ${adminName} (${matchedUser.rol})`);
      }
    }

    if (!isAdmin && ADMIN_PHONES.includes(phone)) {
      isAdmin = true;
      botRol = 'admin';
      botPermisos = getPermisos('admin');
      if (phone === '584123343519') adminName = 'Juan Pablo';
      else if (phone === '584241648710') adminName = 'Jorge';
      else if (phone === '584123193206') adminName = 'Leandro';
      else adminName = 'Administrador';
      console.log(`👑 [${from}] Admin detectado por lista hardcodeada: ${adminName}`);
    }

    // Nota de capacidades para el prompt del Modo Dios (qué puede / no puede hacer este rol)
    if (isAdmin) {
      const esAdminTotal = resolveRol(botRol) === 'admin';
      const cp = botPermisos;
      const yn = (b?: boolean) => (b ? 'SÍ' : 'NO');
      const roleLabel = getRoleMeta(botRol || 'admin')?.label || 'Administrador';
      capabilitiesNote = `\n\n--- PERMISOS DE ESTE USUARIO EN EL MODO DIOS ---\nRol: ${roleLabel}. Alcance: ${esAdminTotal ? 'todas las sedes' : 'su sede asignada'}.\nPuede registrar/editar SERVICIOS: ${yn(esAdminTotal || !!(cp?.servicios?.crear || cp?.servicios?.editar))}.\nPuede agendar/editar CITAS: ${yn(esAdminTotal || !!(cp?.agenda?.crear || cp?.agenda?.editar))}.\nPuede registrar/editar CLIENTES: ${yn(esAdminTotal || !!(cp?.clientes?.crear || cp?.clientes?.editar))}.\nPuede gestionar INVENTARIO/STOCK: ${yn(esAdminTotal || !!(cp?.inventario?.crear || cp?.inventario?.editar))}.\nPuede ELIMINAR registros: ${yn(esAdminTotal)} (la eliminación es exclusiva del Administrador).\nREGLA: Si el usuario te pide una acción que NO puede realizar según esta lista, NO generes el tag correspondiente; explícale cortésmente que su rol no tiene ese permiso y que contacte a un administrador.`;
    }
  } catch (e) { console.error('Error checking admin status:', e); }

  try {
    // History with sliding window for admins (prevent context bloat but keep multi-turn context)
    const { data: msgs } = await db
      .from('mensajes_whatsapp')
      .select('body, tipo, created_at')
      .or(`from_number.eq.${from},to_number.eq.${from}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (msgs && msgs.length > 0) {
      let filteredMsgs = msgs;
      if (isAdmin) {
        // Sliding window of 10 minutes and max 4 messages for admins
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        filteredMsgs = msgs.filter(m => new Date(m.created_at) > tenMinutesAgo).slice(0, 4);
      }

      const filtered = filteredMsgs
        .filter(m => !(m.body === currentMessage && m.tipo === 'entrante'))
        .slice(0, 48).reverse();
      historia = filtered.map(m => ({ role: m.tipo === 'entrante' ? 'user' : 'model', parts: [{ text: m.body }] }));

      if (!isAdmin) {
        const latest = msgs[0];
        if (latest?.created_at) {
          // Session is NEW if last message was on a DIFFERENT calendar day in Venezuela
          const lastMsgDate = new Date(latest.created_at);
          const lastMsgVzla = new Date(lastMsgDate.getTime() + lastMsgDate.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
          const lastDayStr = lastMsgVzla.toISOString().split('T')[0];
          const todayStr = getVzlaDateString();
          if (lastDayStr === todayStr) {
            isNewSession = false;
          }
        }
      } else {
        isNewSession = false; // Admins never need introductory greeting loops
      }
    }
  } catch (e) { console.error('Error loading history:', e); }

  // Memoria & Estado
  try {
    const { data: convRows } = await db.from('conversaciones').select('memoria, cliente_id, estado, sede_id').eq('telefono', phone).limit(1);
    if (convRows?.[0]?.memoria) memoria = convRows[0].memoria as Memoria;
    if (convRows?.[0]?.estado) estado = convRows[0].estado;
    if (convRows?.[0]?.sede_id) sede_id = convRows[0].sede_id;

    // Technical History (Services & Revisions)
    const clientId = convRows?.[0]?.cliente_id;
    if (clientId) {
      const { data: vehs } = await db.from('vehiculos').select('id, marca, modelo, placa').eq('cliente_id', clientId);
      if (vehs && vehs.length > 0) {
        const vehIds = vehs.map(v => v.id);
        const [servs, revs] = await Promise.all([
          db.from('servicios').select('id, vehiculo_id, tipo, descripcion, fecha, costo_estimado, costo_final, estado, nombre_cliente').in('vehiculo_id', vehIds).order('created_at', { ascending: false }).limit(10),
          db.from('revisiones').select('id, vehiculo_id, detalles, presupuesto, created_at').in('vehiculo_id', vehIds).order('created_at', { ascending: false }).limit(5)
        ]);
        vehs.forEach(v => {
          const vServs = servs.data?.filter(s => s.vehiculo_id === v.id) || [];
          const vRevs = revs.data?.filter(r => r.vehiculo_id === v.id) || [];
          if (vServs.length > 0 || vRevs.length > 0) {
            historialTecnico += `VEHÍCULO: ${v.marca} ${v.modelo} (Placa: ${v.placa || 'N/A'})\n`;
            vServs.forEach(s => {
              historialTecnico += `  - SERVICIO [${s.fecha || ''}]: ${s.tipo || ''} - ${s.descripcion || ''} (${s.estado}) | Costo: $${s.costo_estimado ?? s.costo_final ?? 0}\n`;
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
  } catch (e) { console.error('Error loading memoria/historial:', e); }

  // Global occupied schedule
  try {
    const today = getVzlaDateString();
    const endD = new Date(); endD.setDate(endD.getDate() + 7);
    const endStr = endD.toISOString().split('T')[0];

    if (isAdmin || from === ASESOR_PHONE) {
      const todayDateStr = today + 'T00:00:00Z';
      const d = getVzlaDate();

      // Calculate dates for history
      const monthDate = new Date(d); monthDate.setDate(monthDate.getDate() - 30);
      const monthStr = monthDate.toISOString().split('T')[0];
      const monthStartStr = monthDate.toISOString().slice(0, 7) + '-01T00:00:00Z';

      const weekDate = new Date(d); weekDate.setDate(weekDate.getDate() - 7);
      const weekStr = weekDate.toISOString().split('T')[0];

      const yesterdayDate = new Date(d); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

      const [
        { data: allCitas },
        { data: allInv },
        { data: allServs },
        { data: allLogs },
        { data: sedes },
        { count: msgsToday },
        { count: msgsWeek },
        { count: msgsMonth },
        { data: allVentasSil },
        { data: allVentasDia },
        { data: allServiciosActivos },
        { data: allServiciosPendientes }
      ] = await Promise.all([
        db.from('citas').select('*').gte('fecha', monthStr).order('fecha').limit(100),
        db.from('inventario').select('*').eq('activo', true).order('nombre').limit(200),
        db.from('servicios').select('*').gte('created_at', monthStr).order('created_at', { ascending: false }).limit(100),
        db.from('logs_actividad').select('*').gte('created_at', monthStr).order('created_at', { ascending: false }).limit(50),
        db.from('sedes').select('id, nombre'),
        db.from('mensajes_whatsapp').select('*', { count: 'exact', head: true }).eq('es_ia', true).gte('created_at', todayDateStr),
        db.from('mensajes_whatsapp').select('*', { count: 'exact', head: true }).eq('es_ia', true).gte('created_at', weekDate.toISOString()),
        db.from('mensajes_whatsapp').select('*', { count: 'exact', head: true }).eq('es_ia', true).gte('created_at', monthStartStr),
        db.from('ventas_silenciadores').select('*').gte('created_at', monthDate.toISOString()).order('created_at', { ascending: false }).limit(200),
        db.from('ventas_dia').select('*').gte('created_at', monthDate.toISOString()).order('created_at', { ascending: false }).limit(200),
        db.from('servicios').select('*').in('estado', ['pendiente', 'confirmada', 'en_revision', 'en_progreso', 'en_proceso']).limit(200),
        db.from('servicios').select('*').eq('estado', 'pendiente').limit(200)
      ]);

      const toVzlaDateStr = (dateInput: any): string => {
        if (!dateInput) return '';
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
          return dateInput;
        }
        try {
          const d = new Date(dateInput);
          if (isNaN(d.getTime())) return '';
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Caracas',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(d);
        } catch (e) {
          return '';
        }
      };

      const sedeMap = new Map((sedes || []).map(s => [s.id, s.nombre]));

      // Manually map sede names in JS to bypass missing database foreign keys
      if (allCitas) {
        allCitas.forEach(c => {
          const sName = c.sede_id ? (sedeMap.get(c.sede_id) || 'General') : 'General';
          c.sede = { nombre: sName };
        });
      }
      if (allInv) {
        allInv.forEach(i => {
          const sName = i.sede_id ? (sedeMap.get(i.sede_id) || 'General') : 'General';
          i.sede = { nombre: sName };
        });
      }
      if (allServs) {
        allServs.forEach(s => {
          const sName = s.sede_id ? (sedeMap.get(s.sede_id) || 'General') : 'General';
          s.sede = { nombre: sName };
        });
      }
      if (allLogs) {
        allLogs.forEach(l => {
          const sName = l.sede_id ? (sedeMap.get(l.sede_id) || 'General') : 'General';
          l.sede = { nombre: sName };
        });
      }
      if (allVentasSil) {
        allVentasSil.forEach(v => {
          const sName = v.sede_id ? (sedeMap.get(v.sede_id) || 'General') : 'General';
          v.sede = { nombre: sName };
        });
      }
      if (allVentasDia) {
        allVentasDia.forEach(v => {
          const sName = v.sede_id ? (sedeMap.get(v.sede_id) || 'General') : 'General';
          v.sede = { nombre: sName };
        });
      }
      if (allServiciosActivos) {
        allServiciosActivos.forEach(s => {
          const sName = s.sede_id ? (sedeMap.get(s.sede_id) || 'General') : 'General';
          s.sede = { nombre: sName };
        });
      }
      if (allServiciosPendientes) {
        allServiciosPendientes.forEach(s => {
          const sName = s.sede_id ? (sedeMap.get(s.sede_id) || 'General') : 'General';
          s.sede = { nombre: sName };
        });
      }

      // Calculate revenue from actual sales (ventas_dia and ventas_silenciadores)
      // We sum all POS sales, and all chatbot/IA sales that are not duplicates.
      const posVentasToday = allVentasDia?.filter(v => {
        const vDate = toVzlaDateStr(v.fecha || v.created_at);
        return vDate === today;
      }) || [];
      const posVentasYesterday = allVentasDia?.filter(v => {
        const vDate = toVzlaDateStr(v.fecha || v.created_at);
        return vDate === yesterdayStr;
      }) || [];

      const iaVentasToday = allVentasSil?.filter(v => {
        const isPOSDuplicate = /Venta POS #/i.test(v.notes || v.notas || '');
        const vDate = toVzlaDateStr(v.fecha || v.created_at);
        return vDate === today && !isPOSDuplicate;
      }) || [];
      const iaVentasYesterday = allVentasSil?.filter(v => {
        const isPOSDuplicate = /Venta POS #/i.test(v.notes || v.notas || '');
        const vDate = toVzlaDateStr(v.fecha || v.created_at);
        return vDate === yesterdayStr && !isPOSDuplicate;
      }) || [];

      const revenueToday = posVentasToday.reduce((sum, v) => sum + Number(v.total_ingresos || 0), 0) +
        iaVentasToday.reduce((sum, v) => sum + Number(v.precio_registrado || v.total_ingresos || 0), 0);

      const revenueYesterday = posVentasYesterday.reduce((sum, v) => sum + Number(v.total_ingresos || 0), 0) +
        iaVentasYesterday.reduce((sum, v) => sum + Number(v.precio_registrado || v.total_ingresos || 0), 0);

      const revenueBySede: Record<string, number> = {};
      const statusCounts: Record<string, Record<string, number>> = {}; // Sede -> Status -> Count
      const invAddedBySede: Record<string, number> = {};

      // Fill statusCounts from services as before
      allServs?.forEach(s => {
        const sName = s.sede?.nombre || 'General';
        if (!statusCounts[sName]) statusCounts[sName] = {};
        statusCounts[sName][s.estado] = (statusCounts[sName][s.estado] || 0) + 1;
      });

      // Calculate revenueBySede from sales
      posVentasToday.forEach(v => {
        const sName = v.sede?.nombre || 'General';
        revenueBySede[sName] = (revenueBySede[sName] || 0) + Number(v.total_ingresos || 0);
      });
      iaVentasToday.forEach(v => {
        const sName = v.sede?.nombre || 'General';
        revenueBySede[sName] = (revenueBySede[sName] || 0) + Number(v.precio_registrado || v.total_ingresos || 0);
      });

      allLogs?.forEach(l => {
        if (l.accion === 'Creó producto' || l.accion === 'STOCK_UPSERT') {
          const sName = l.sede?.nombre || 'General';
          invAddedBySede[sName] = (invAddedBySede[sName] || 0) + 1;
        }
      });

      const citasBySede: Record<string, number> = {};
      allCitas?.forEach(c => {
        if (c.fecha === today) {
          const sName = c.sede?.nombre || 'General';
          citasBySede[sName] = (citasBySede[sName] || 0) + 1;
        }
      });

      // ─── BUILD "HOY" SECTION ─────────────────────────────────────────────
      const hoyCitas = allCitas?.filter(c => c.fecha === today) || [];
      const serviciosActivos = allServiciosActivos || [];
      const serviciosPendientes = allServiciosPendientes || [];
      // Fetch vehicles for ALL active and pending services
      const vehIdsActivos = [...new Set([...serviciosActivos.filter(s => s.vehiculo_id).map(s => s.vehiculo_id), ...serviciosPendientes.filter(s => s.vehiculo_id).map(s => s.vehiculo_id)])];
      let vehMapActivos: Record<string, any> = {};
      if (vehIdsActivos.length > 0) {
        const { data: vh } = await db.from('vehiculos').select('id, marca, modelo, placa, clientes(nombre, apellido)').in('id', vehIdsActivos);
        if (vh) vh.forEach(v => { vehMapActivos[v.id] = v; });
      }

      let hoyInfo = `\n━━━ ⌛ ACTIVIDAD DE HOY (${today}) ━━━\n`;

      // Citas de hoy
      hoyInfo += `\n📅 CITAS PROGRAMADAS PARA HOY:\n`;
      if (hoyCitas.length > 0) {
        hoyInfo += hoyCitas.map(c =>
          `  • ${c.hora ? c.hora.substring(0, 5) : 'Hora: N/A'} | Cliente: ${c.nombre_cliente || '—'} | Servicio: ${c.descripcion || c.tipo_servicio || '—'} | Vehículo: ${c.vehiculo_info || '—'}${c.placa ? ` (${c.placa})` : ''} | Estado: ${c.estado} | Sede: ${c.sede?.nombre || 'General'}`
        ).join('\n');
      } else {
        hoyInfo += `  No hay citas programadas para hoy.\n`;
      }

      // Servicios ACTIVOS (en taller ahora, sin importar cuándo se registraron)
      hoyInfo += `\n🔧 SERVICIOS ACTIVOS EN TALLER:\n`;
      if (serviciosActivos.length > 0) {
        hoyInfo += serviciosActivos.map(s => {
          const veh = s.vehiculo_id ? vehMapActivos[s.vehiculo_id] : null;
          const clienteNombre = s.nombre_cliente || veh?.clientes?.nombre || '—';
          const clienteApellido = veh?.clientes?.apellido || '';
          const vehStr = veh ? `${veh.marca} ${veh.modelo} (${veh.placa || 'S/P'})` : (s.vehiculo_info || '—');
          const fechaReg = s.fecha || s.created_at?.split('T')[0] || '—';
          return `  • ${clienteNombre} ${clienteApellido} | Veh: ${vehStr} | Servicio: ${s.descripcion || s.tipo || '—'} | Estado: ${s.estado || '—'} | Costo: $${s.costo_estimado ?? s.costo_final ?? 0} | Registrado: ${fechaReg} | Sede: ${s.sede?.nombre || 'General'}`;
        }).join('\n');
      } else {
        hoyInfo += `  No hay servicios activos en el taller.\n`;
      }

      // Vehículos PENDIENTES
      hoyInfo += `\n⏳ VEHÍCULOS PENDIENTES (EN REVISIÓN / POR DEFINIR SERVICIO):\n`;
      if (serviciosPendientes.length > 0) {
        hoyInfo += serviciosPendientes.map(s => {
          const veh = s.vehiculo_id ? vehMapActivos[s.vehiculo_id] : null;
          const clienteNombre = s.nombre_cliente || veh?.clientes?.nombre || '—';
          const clienteApellido = veh?.clientes?.apellido || '';
          const vehStr = veh ? `${veh.marca} ${veh.modelo} (${veh.placa || 'S/P'})` : (s.vehiculo_info || '—');
          const fechaReg = s.fecha || s.created_at?.split('T')[0] || '—';
          return `  • ${clienteNombre} ${clienteApellido} | Veh: ${vehStr} | Servicio: ${s.descripcion || s.tipo || '—'} | Estado: ${s.estado || '—'} | Costo: $${s.costo_estimado ?? s.costo_final ?? 0} | Registrado: ${fechaReg} | Sede: ${s.sede?.nombre || 'General'}`;
        }).join('\n');
      } else {
        hoyInfo += `  No hay vehículos pendientes en el taller.\n`;
      }

      // Ventas de hoy (inline filtered from already-loaded data)
      const hoyVentasDia = allVentasDia?.filter(v => toVzlaDateStr(v.fecha || v.created_at) === today) || [];
      const hoyVentasSil = allVentasSil?.filter(v => toVzlaDateStr(v.fecha || v.created_at) === today) || [];
      if (hoyVentasDia.length > 0 || hoyVentasSil.length > 0) {
        hoyInfo += `\n💰 VENTAS DE HOY:\n`;
        hoyVentasDia.forEach(v => {
          hoyInfo += `  • Venta POS | ${v.cliente || 'Consumidor Final'} | Total: $${v.total_ingresos} | Sede: ${v.sede?.nombre || 'General'}\n`;
        });
        hoyVentasSil.forEach(v => {
          if (!/Venta POS #/i.test(v.notas || '')) {
            hoyInfo += `  • Venta IA | ${v.modelo || 'Producto'} | ${v.cliente || '—'} | Total: $${v.precio_registrado || v.total_ingresos || 0} | Sede: ${v.sede?.nombre || 'General'}\n`;
          }
        });
      }

      citasInfo = `\n--- [MODO DIOS] INFO DEL SISTEMA EN TIEMPO REAL ---\n`;
      citasInfo += `Hola Admin ${adminName}.\n`;
      citasInfo += `\n[KPIs GENERALES]\n`;
      citasInfo += `- Mensajes IA enviados: Hoy (${msgsToday || 0}), Semana (${msgsWeek || 0}), Mes (${msgsMonth || 0})\n`;
      citasInfo += `- Ingresos: Hoy ($${revenueToday}), Ayer ($${revenueYesterday})\n`;

      citasInfo += `\n[ESTADÍSTICAS POR SEDE (HOY Y RESUMEN)]\n`;
      const allSedeNames = [...new Set([...sedes?.map(s => s.nombre) || [], 'General'])];
      allSedeNames.forEach(sName => {
        const rev = revenueBySede[sName] || 0;
        const cit = citasBySede[sName] || 0;
        const added = invAddedBySede[sName] || 0;
        const stats = statusCounts[sName] || {};
        const statsStr = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Sin servicios registrados';

        citasInfo += `- ${sName}: $${rev} hoy | ${cit} citas hoy | ${added} productos nuevos este mes.\n`;
        citasInfo += `  * Estados de servicios: ${statsStr}\n`;
      });

      citasInfo += hoyInfo;

      if (allCitas && allCitas.length > 0) {
        citasInfo += `\n[HISTORIAL DE CITAS (ULTIMOS 30 DIAS)]\n` + allCitas.map(c =>
          `ID: ${c.id} | Sede: ${c.sede?.nombre || 'General'} | ${c.fecha} ${c.hora} | Cliente: ${c.nombre_cliente} | Estado: ${c.estado}`
        ).join('\n');
      }

      if (allServs && allServs.length > 0) {
        const vehIds = [...new Set(allServs.filter(s => s.vehiculo_id).map(s => s.vehiculo_id))];
        let vehMap: Record<string, any> = {};
        if (vehIds.length > 0) {
          const { data: vh } = await db.from('vehiculos').select('id, marca, modelo, placa, clientes(nombre, apellido)').in('id', vehIds);
          if (vh) vh.forEach(v => { vehMap[v.id] = v; });
        }
        citasInfo += `\n\n[SERVICIOS RECIENTES (ULTIMOS 30 DIAS)]\n` + allServs.map(s => {
          const veh = s.vehiculo_id ? vehMap[s.vehiculo_id] : null;
          const clienteNombre = s.nombre_cliente || veh?.clientes?.nombre || '—';
          const clienteApellido = veh?.clientes?.apellido || '';
          const vehStr = veh ? `${veh.marca} ${veh.modelo} (${veh.placa || 'S/P'})` : (s.vehiculo_info || '—');
          const estadoActual = s.estado || '—';
          const fechaStr = s.fecha || s.created_at.split('T')[0];
          const seguimientoStr = s.seguimiento?.length
            ? s.seguimiento.map((e: any) => `${e.accion}${e.fecha ? ' [' + e.fecha.split('T')[0] + ']' : ''}`).join(' → ')
            : 'Sin seguimiento';
          return `ID: ${s.id} | Sede: ${s.sede?.nombre || 'General'} | Fecha: ${fechaStr} ${s.hora || ''} | Cliente: ${clienteNombre} ${clienteApellido}${s.telefono ? ' (Tel:' + s.telefono + ')' : ''} | Vehículo: ${vehStr} | Tipo: ${s.tipo}${s.tipo_personalizado ? ` (${s.tipo_personalizado})` : ''} | Estado: ${estadoActual} | Costo: $${s.costo_estimado ?? s.costo_final ?? 0} | Seguimiento: ${seguimientoStr}`;
        }).join('\n');
      }

      if (allLogs && allLogs.length > 0) {
        citasInfo += `\n\n[ACTIVIDAD RECIENTE DEL SISTEMA]\n` + allLogs.map(l =>
          `Sede: ${l.sede?.nombre || 'General'} | Fecha: ${l.created_at.split('T')[0]} | ${l.usuario} - ${l.accion}: ${l.detalles || 'N/A'}`
        ).join('\n');
      }

      if (allInv && allInv.length > 0) {
        // 1. Group by sede for summary
        const sedeSummary: Record<string, { count: number, lowStock: number }> = {};
        allInv.forEach(i => {
          const sName = i.sede?.nombre || 'General';
          if (!sedeSummary[sName]) sedeSummary[sName] = { count: 0, lowStock: 0 };
          sedeSummary[sName].count++;
          if (i.stock <= 5) sedeSummary[sName].lowStock++;
        });

        inventarioInfo = `\n[ESTADÍSTICAS DE INVENTARIO POR SEDE]\n`;
        Object.entries(sedeSummary).forEach(([s, data]) => {
          inventarioInfo += `- ${s}: ${data.count} productos totales (${data.lowStock} con stock bajo).\n`;
        });

        // 2. Select representative items from EACH sede
        const sedes = [...new Set(allInv.map(i => i.sede?.nombre || 'General'))];
        const selectedItems: any[] = [];

        sedes.forEach(sName => {
          const sedeItems = allInv.filter(i => (i.sede?.nombre || 'General') === sName);
          // Prioritize low stock or expensive items within each sede
          const prioritized = sedeItems.sort((a, b) => {
            if (a.stock <= 5 && b.stock > 5) return -1;
            if (b.stock <= 5 && a.stock > 5) return 1;
            return b.precio_usd - a.precio_usd;
          }).slice(0, 15); // Top 15 per sede
          selectedItems.push(...prioritized);
        });

        // Final limit to prevent context bloat (max 50 items total)
        const finalItems = selectedItems.slice(0, 50);

        inventarioInfo += `\n[DETALLE DE PRODUCTOS (MUESTRA RELEVANTE)]\n` + finalItems.map(i =>
          `ID: ${i.id} | Sede: ${i.sede?.nombre || 'General'} | ${i.nombre} [${i.codigo || 'S/C'}] | Stock: ${i.stock} | Precio: $${i.precio_usd}`
        ).join('\n');

        const remaining = allInv.length - finalItems.length;
        if (remaining > 0) {
          inventarioInfo += `\n... y otros ${remaining} productos. (Pídeme detalles de un código o nombre específico si no lo ves aquí).`;
        }
      }

      // 1. Filter today's sales
      const todayVentasDia = allVentasDia?.filter(v => toVzlaDateStr(v.fecha || v.created_at) === today) || [];
      const todayVentasSil = allVentasSil?.filter(v => toVzlaDateStr(v.fecha || v.created_at) === today) || [];

      // 2. Filter yesterday's sales
      const yesterdayVentasDia = allVentasDia?.filter(v => toVzlaDateStr(v.fecha || v.created_at) === yesterdayStr) || [];
      const yesterdayVentasSil = allVentasSil?.filter(v => toVzlaDateStr(v.fecha || v.created_at) === yesterdayStr) || [];

      // 3. Build today's sales display with full items detail
      let ventasInfo = `\n[VENTAS Y FACTURACIÓN REGISTRADAS HOY (${today})]\n`;

      if (todayVentasDia.length > 0) {
        ventasInfo += `* VENTAS POS MANUALES (ventas_dia):\n`;
        todayVentasDia.forEach((v) => {
          // Parse payments
          const mp = v.metodos_pago || {};
          const paymentsStr = [
            mp.efectivo_usd ? `Efectivo USD: $${mp.efectivo_usd}` : '',
            mp.zelle ? `Zelle: $${mp.zelle}` : '',
            mp.cashea ? `Cashea: $${mp.cashea}` : '',
            mp.pago_movil ? `Pago Móvil: Bs.${mp.pago_movil}` : '',
            mp.punto_de_venta ? `Punto de Venta: Bs.${mp.punto_de_venta}` : '',
            mp.efectivo_ves ? `Efectivo Ves: Bs.${mp.efectivo_ves}` : '',
            mp.transferencia ? `Transferencia: $${mp.transferencia}` : '',
            mp.otro ? `Otro: $${mp.otro}` : ''
          ].filter(Boolean).join(', ') || 'Sin especificar';

          // Extract desglose items
          const itemsStr = Array.isArray(v.desglose)
            ? v.desglose.map((item: any) => `${item.descripcion || item.nombre || 'Producto'} (x${item.cantidad || 1}) - $${item.precio_unitario || item.precio || 0}`).join(', ')
            : 'Sin desglose de ítems';

          ventasInfo += `  - Sede: ${v.sede?.nombre || 'General'} | Cliente: ${v.cliente || 'Consumidor Final'} | Total: $${v.total_ingresos} | Ítems: [${itemsStr}] | Pagos: [${paymentsStr}] | Notas: ${v.notas || 'N/A'}\n`;
        });
      } else {
        ventasInfo += `* No hay ventas POS manuales registradas hoy.\n`;
      }

      if (todayVentasSil.length > 0) {
        ventasInfo += `* VENTAS DETALLADAS/IA (ventas_silenciadores):\n`;
        todayVentasSil.forEach(v => {
          // Exclude POS duplicates from display if they are already listed above to keep it clean
          const isPOSDuplicate = /Venta POS #/i.test(v.notas || '');
          const duplicateTag = isPOSDuplicate ? ' [Duplicado POS]' : '';

          // Parse client from notes
          const cliMatch = v.notas?.match(/Cliente:\s*([^|\]\n]+)/i) || v.notas?.match(/\| Cliente:\s*([^|]+)/i);
          const cliente = cliMatch ? cliMatch[1].trim() : 'N/A';

          // Payment method
          const pago = v.metodo_pago || (v.notas?.match(/\[Total:\s*\$[^(\n]+?\(?([^)]+)\)?\]/)?.[1]) || 'N/A';

          ventasInfo += `  - Sede: ${v.sede?.nombre || 'General'} | Ítem: ${v.modelo || 'Silenciador'} (x${v.cantidad || 1}) | Total: $${v.precio_registrado || v.total_ingresos || 0} | Pago: ${pago} | Cliente: ${cliente}${duplicateTag} | Notas: ${v.notas || 'N/A'}\n`;
        });
      } else {
        ventasInfo += `* No hay ventas detalladas/IA registradas hoy.\n`;
      }

      // 4. Build yesterday's sales summary
      ventasInfo += `\n[VENTAS Y FACTURACIÓN REGISTRADAS AYER (${yesterdayStr})]\n`;
      if (yesterdayVentasDia.length > 0 || yesterdayVentasSil.length > 0) {
        if (yesterdayVentasDia.length > 0) {
          ventasInfo += `* VENTAS POS MANUALES (ventas_dia):\n`;
          yesterdayVentasDia.forEach(v => {
            const itemsStr = Array.isArray(v.desglose)
              ? v.desglose.map((item: any) => `${item.descripcion || item.nombre || 'Producto'} (x${item.cantidad || 1}) - $${item.precio_unitario || item.precio || 0}`).join(', ')
              : 'Sin desglose';
            ventasInfo += `  - Sede: ${v.sede?.nombre || 'General'} | Cliente: ${v.cliente || 'Consumidor Final'} | Total: $${v.total_ingresos} | Ítems: [${itemsStr}]\n`;
          });
        }
        if (yesterdayVentasSil.length > 0) {
          ventasInfo += `* VENTAS IA (ventas_silenciadores):\n`;
          yesterdayVentasSil.forEach(v => {
            if (!/Venta POS #/i.test(v.notas || '')) {
              ventasInfo += `  - Sede: ${v.sede?.nombre || 'General'} | Ítem: ${v.modelo || 'Silenciador'} (x${v.cantidad || 1}) | Total: $${v.precio_registrado || v.total_ingresos || 0} | Notas: ${v.notas || 'N/A'}\n`;
            }
          });
        }
      } else {
        ventasInfo += `* No se registraron ventas ayer.\n`;
      }

      // 5. Add a 30-day summary for the chatbot context to query historical trends
      const recentVentasDia = allVentasDia?.filter(v => v.fecha !== today && v.fecha !== yesterdayStr).slice(0, 10) || [];
      if (recentVentasDia.length > 0) {
        ventasInfo += `\n[MUESTRA DE VENTAS RECIENTES (ÚLTIMOS 30 DÍAS)]\n`;
        recentVentasDia.forEach(v => {
          ventasInfo += `- Fecha: ${v.fecha} | Sede: ${v.sede?.nombre || 'General'} | Cliente: ${v.cliente || 'Consumidor Final'} | Total: $${v.total_ingresos}\n`;
        });
      }

      historialTecnico = `\n--- FIN DE DATOS DEL SISTEMA ---\nInstrucción estricta: Eres el asistente administrativo (Modo Dios). Debes dar la información precisa de lo que se te pide usando la data anterior. Puedes ejecutar comandos para modificar la base de datos si el admin te lo pide. No inventes nada. ${ventasInfo}`;

    } else {
      // Logic for regular clients (same as before)
      const { data: citas } = await db.from('citas')
        .select('fecha, hora, tipo_servicio, descripcion, estado')
        .eq('telefono', from).order('fecha', { ascending: true }).limit(5);
      if (citas && citas.length > 0) {
        const list = citas.map(c => `- ${c.fecha} ${c.hora} | ${c.tipo_servicio} | ${c.estado} ${c.fecha < today ? '(PASADA)' : '(PROXIMA)'}`).join('\n');
        citasInfo = `\nCITAS DEL CLIENTE:\n${list}`;
      }

      const lower = currentMessage.toLowerCase();
      const invKw = ['silenciador', 'resonador', 'flexible', 'cola', 'filtro', 'aceite', 'gasolina', 'refrigerante', 'liquido', 'líquido',
        'liga', 'dot', 'repuesto', 'stock', 'inventario', 'disponible', 'hay', 'tienes', 'precio', 'cl27', 'cl30', 'cl40', 'clh40',
        'cl60', 'clk60', 'clc60', 'clp60', 'b55', 'curba', 'flowmaster', 'arauca', 'aveo', 'corolla', 'twingo', 'cavalier',
        'camry', 'sentra', 'blazer', 'lancer', 'cherokee', 'explorer', 'samuray', 'macho'];
      if (invKw.some(k => lower.includes(k))) {
        const { data: items } = await db.from('inventario')
          .select('nombre, codigo, stock, categoria').eq('activo', true)
          .order('categoria').order('nombre');
        if (items && items.length > 0) {
          const list = items.map(i =>
            `  - ${i.nombre}${i.codigo ? ' [' + i.codigo + ']' : ''} — ${i.stock > 0 ? 'Stock: ' + i.stock : 'SIN STOCK'}`
          ).join('\n');
          inventarioInfo = `\nINVENTARIO ACTUAL (SÓLO STOCK/DISPONIBILIDAD, SIN PRECIOS):\n${list}`;
        }
      }
    }

    const todayStr = getVzlaDateString();
    const endStrGlobal = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const { data: globales } = await db.from('citas')
      .select('fecha, hora')
      .gte('fecha', todayStr).lte('fecha', endStrGlobal)
      .eq('sede_id', sede_id)
      .neq('estado', 'cancelada');
    if (globales && globales.length > 0) {
      agendaOcupada = `\nHORARIOS OCUPADOS EN ESTA SEDE (PROHIBIDO AGENDAR EN ESTAS FECHAS Y HORAS EXACTAS):\n` + globales.map(g => `- ${g.fecha} a las ${g.hora}`).join('\n');
    }
  } catch (e) { console.error('Error loading context for admin/client:', e); }

  return { historia, memoria, citasInfo, inventarioInfo, isNewSession, agendaOcupada, historialTecnico, estado, isAdmin, adminName, sede_id, adminSedeId, botRol, botPermisos, capabilitiesNote };
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
  rates: ExchangeRates | null,
  from?: string
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  // Un usuario es admin si el contexto lo indica
  const isAdmin = !!ctx.isAdmin;

  if (isAdmin) {
    console.log(`👤 MODO ADMIN DETECTADO: ${from} (Nombre en memoria/BD: ${ctx.memoria?.nombre || 'Desconocido'})`);
  }

  let knowledge = isAdmin ? ADMIN_KNOWLEDGE : LYCOS_KNOWLEDGE;
  if (isAdmin && ctx.adminSedeId) {
    knowledge = knowledge.replace(
      '6. ELECCIÓN DE SEDE (PROACTIVO): Si el administrador pide ver inventario, registrar una venta, o cualquier acción de gestión pero NO especifica la sede, DEBES imprimir el tag [ASK_SEDE: motivo] para que el sistema le muestre los botones de selección.',
      `6. ELECCIÓN DE SEDE: Como eres administrador de una sede asignada (ID: ${ctx.adminSedeId}), NO preguntes nunca por la sede ni uses [ASK_SEDE]. Usa siempre tu sede_id (${ctx.adminSedeId}) en todos los registros automáticamente.`
    );
  }

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

  const rules = isAdmin
    ? `- EXTENSIÓN: Puedes usar las líneas necesarias para reportes de inventario o KPIs.
- FORMATO: Usa negritas (*texto*) y monospace (\`texto\`) para resaltar nombres y cantidades en los reportes.
- ESPACIADO: Deja siempre una línea en blanco entre productos en tus listas.`
    : `- BREVEDAD: Tus respuestas NO DEBEN EXCEDER las 3 líneas. Sé extremadamente directo.
- NUNCA uses asteriscos (*) en tus respuestas. Texto plano siempre. Listas con - o numeradas.`;

  let systemPrompt = `${knowledge}

FECHA/HORA VENEZUELA: ${vzlaDateTime}
HOY ES: ${dayName} ${vzlaDateStr}
${ratesCtx}
SALUDO_APROPIADO: ${greeting} — USA ESTE SALUDO EXACTO al inicio cuando sea sesión nueva. NO uses otro.
SESION: ${ctx.isNewSession ? `NUEVA — saluda con "${greeting}" + mensaje de bienvenida` : 'CONTINUA — ve al tema, sin repetir saludo ni bienvenida'}
${memoriaStr}
${ctx.citasInfo}
${ctx.historialTecnico || ''}
${ctx.inventarioInfo}
${ctx.agendaOcupada}

⚠️ REGLA CRITICA DE FECHAS — LEE CON ATENCION:
La fecha de HOY es ${vzlaDateStr} (${dayName}). Esta es la UNICA referencia válida para calcular fechas.
PROHIBIDO: Usar cualquier fecha mencionada en el historial de conversación anterior para calcular "mañana", "pasado mañana", "la próxima semana", etc.
SIEMPRE: Calcula "mañana" sumando 1 día a ${vzlaDateStr}. Si hoy es Sábado, mañana es Domingo (CERRADO), ofrece el Lunes.

REGLAS CRITICAS:
${rules}

- Pon al menos 1 emoji relevante en la respuesta.
- Usa la fecha (${vzlaDateStr}) para calcular fechas relativas. Nunca agendes domingo.
- Un cliente puede tener varios vehiculos.
- REGLA DE ORO (PRECIOS): NUNCA, bajo ningún concepto, des el precio en Bolívares (Bs.). Solo usa dólares ($) y dólares a tasa BCV según las REGLAS DE CONVERSIÓN MONETARIA.
- Si ves "[Imagen enviada...]", lee su descripción automática para entender qué mandó y responderle.
- ENVÍO DE IMÁGENES: Puedes enviar imágenes de silenciadores usando el tag [IMAGE: modelo]. Por ejemplo: [IMAGE: cl60] o [IMAGE: clh40].
- PROHIBICION DE ENVIAR IMAGENES: **NUNCA** intentes enviar, simular o ofrecer enviar imágenes o fotos. 

AGENDAMIENTO DE CITAS (USO DE TAGS):
- ⚠️ **REGLAS DE ORO**: Si el cliente confirma una fecha y hora, DEBES generar SIEMPRE AL FINAL de tu respuesta el tag: [CITA: AAAA-MM-DD HH:MM | servicio | vehículo]
- SI NO GENERAS EL TAG, LA CITA NO QUEDA REGISTRADA. Decir "he agendado" no es suficiente.
- Ejemplo: [CITA: 2026-04-16 08:00 | Silenciador | Mazda Allegro]
- En 'servicio', resume lo que se hará. En 'vehículo', pon MARCA y MODELO.
- CRITICO: NUNCA pongas estados como 'pendiente' o 'confirmada' en VEHÍCULO.
- Si detectas el nombre del cliente por primera vez, usa: [NOMBRE: Juan Pérez]
- IMPORTANTE — REGISTRO DE CLIENTES: Solo registramos en el sistema a los clientes que proporcionan su nombre real. Si después de 2-3 mensajes el cliente aún no te ha dicho su nombre, pregúntale cortésmente: "¿Me regalas tu nombre para poder atenderte mejor? 😊". Una vez que te dé su nombre, USA SIEMPRE el tag [NOMBRE: Nombre] para registrarlo.`;

  if (isAdmin) {
    systemPrompt += `\n\n⚠️ INSTRUCCIÓN DE MONEDA (ADMIN): Si el administrador especifica un precio en dólares en efectivo (divisas) o en dólares a tasa BCV, mantenlo exactamente como él lo indique. NO calcules ni agregues conversiones alternativas de forma automática a menos que te lo solicite explícitamente.`;
    if (ctx.capabilitiesNote) systemPrompt += ctx.capabilitiesNote;
  }

  const contents = [...ctx.historia, { role: 'user', parts: [{ text: userMessage }] }];

  // ── ROBUST SEQUENTIAL RETRY STRATEGY ─────────────────────────────────────────
  // Configuración de reintentos ajustada para Vercel (evitar timeout de 10s)
  const ATTEMPTS_DELAYS = [300, 800, 1500, 2000];
  const MAX_ATTEMPTS = ATTEMPTS_DELAYS.length;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Alternar entre los modelos disponibles en cada intento para evitar saturación de uno de ellos
    const modelIndex = attempt % GEMINI_MODELS.length;
    const model = GEMINI_MODELS[modelIndex];

    console.log(`🧠 [Intento ${attempt + 1}/${MAX_ATTEMPTS}] Usando Modelo: ${model}`);

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 1000,
              topK: 40,
              topP: 0.95
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          }),
        }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        const status = resp.status;
        console.error(`❌ Error IA [${status}] en Modelo ${model}:`, errText.substring(0, 150));

        // Retry on saturation or temporary errors
        if (status === 429 || status === 503 || status === 500) {
          const delayTime = ATTEMPTS_DELAYS[attempt] || 2000;
          console.log(`⏳ Saturación (429) o error temporal detectado. Reintentando en ${delayTime}ms...`);
          await delay(delayTime);
          continue;
        }
        // For other errors, still try next attempt (which might use a different model or just retry)
        await delay(1000);
        continue;
      }

      const data = await resp.json();
      const firstCandidate = data.candidates?.[0];
      const finishReason = firstCandidate?.finishReason;
      const parts = firstCandidate?.content?.parts || [];
      const text = parts.map((p: any) => p.text).join('') || null;

      if (finishReason === 'MAX_TOKENS') {
        console.warn(`⚠️ Respuesta CORTADA por límite de tokens en ${model}. Reintentando...`);
        await delay(1000);
        continue;
      }

      if (text && text.length > 5) {
        const lastChar = text.trim().slice(-1);
        const sentenceEnders = ['.', '!', '?', '»', '"', ')'];
        const isLikelyComplete = sentenceEnders.includes(lastChar) || /[\u{1F300}-\u{1F9FF}]/u.test(text.slice(-5));

        if (!isLikelyComplete && text.length < 50 && attempt < 2) {
          console.warn(`⚠️ Respuesta parece incompleta. Reintentando por seguridad.`);
          await delay(800);
          continue;
        }

        console.log(`✅ IA respondió con éxito (Modelo ${model}) en intento ${attempt + 1}`);
        return text;
      }

      console.warn(`⚠️ Modelo ${model} devolvió respuesta vacía. Reintentando...`);
      await delay(1500);
    } catch (e) {
      console.error(`❌ Excepción en intento ${attempt + 1} (${model}):`, e);
      await delay(ATTEMPTS_DELAYS[attempt] || 2000);
    }
  }

  console.error('🚨 Todos los intentos y modelos fallaron después de 6 iteraciones.');
  return null;
}

// ─── Audio transcription models ────────────────────────────────────────────
const STT_MODELS = [...GEMINI_MODELS];

async function transcribeAudio(base64Data: string, mimeType: string, isAdmin: boolean = false): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const systemPrompt = isAdmin
    ? "Eres un sistema de reconocimiento de voz para el administrador de un taller. Transcribe el audio exactamente. Si el administrador está dictando inventario o stock, asegúrate de ser muy preciso con los nombres y cantidades."
    : "Eres un sistema de reconocimiento de voz. Tu UNICA tarea es transcribir el audio a texto exacto en español. NO agregues explicaciones, respuestas, introducciones ni comentarios. Solo escribe lo que el usuario dice en español tal cual.";

  for (const model of STT_MODELS) {
    // Each model gets 2 attempts
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            signal: controller.signal,
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
              generationConfig: { temperature: 0.1 },
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              ],
            })
          }
        );
        clearTimeout(timeoutId);

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`❌ Gemini STT error ${resp.status} (${model} attempt ${attempt + 1}):`, errText.substring(0, 200));
          if (resp.status === 429 || resp.status === 503) {
            await delay(500); // small backoff before retry
            continue; // retry same model
          }
          break; // fatal error, try next model
        }
        const data = await resp.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts.map((p: any) => p.text).join('').trim() || null;
        if (text) {
          console.log(`✅ Transcripción exitosa con ${model} (attempt ${attempt + 1})`);
          return text;
        }
      } catch (e: any) {
        clearTimeout((e as any)?.timeoutId);
        if (e?.name === 'AbortError') {
          console.error(`⏱️ Timeout transcripción con ${model} (attempt ${attempt + 1})`);
        } else {
          console.error(`❌ transcribeAudio excepción (${model} attempt ${attempt + 1}):`, e);
        }
        await delay(300);
      }
    }
  }

  console.error('🚨 Todos los modelos y reintentos de transcripción fallaron.');
  return null;
}

async function describeImage(base64Data: string, mimeType: string, isAdmin: boolean = false): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const visionModel = GEMINI_MODELS[0];
  const systemPrompt = isAdmin
    ? `Eres un analista multimodal experto del taller Lycos Team. Tu trabajo es analizar imágenes y extraer TODA la información útil posible para ser procesada por el sistema de gestión.

CLASIFICA LA IMAGEN PRIMERO en uno de estos tipos y luego extrae según corresponda:

1. **FACTURA / TICKET / RECIBO**: Extrae TODOS los datos estructurados:
   - Items/productos vendidos (nombre, cantidad, precio unitario, total)
   - Subtotal, IVA, total general
   - Método de pago si es visible
   - Fecha, nombre del cliente si aparece
   - Número de factura/ticket si está visible
   - Formatea como: [FACTURA] Items: producto1=cantidad=precio, producto2=cantidad=precio | Total: $X | IVA: $X | Pago: metodo | Cliente: nombre

2. **VEHÍCULO**: Extrae características del vehículo visible:
   - MARCA, MODELO, AÑO (aproximado)
   - PLACA (CRÍTICO — si es legible)
   - Color, condición general, daños visibles, tipo de carrocería
   - Si se ve el tablero: kilometraje, luces de advertencia
   - Si se ve el motor o parte mecánica: describe qué parte y su condición
   - Formatea como: [VEHÍCULO] Marca Modelo | Placa: ABC123 | Color: X | Daños: X

3. **CAPTURA DE PANTALLA / EXCEL / TABLA**: Extrae datos tabulares estructurados:
   - Identifica si es un reporte de inventario, ventas, servicios, etc.
   - Extrae todas las filas y columnas visibles
   - Formatea como tabla Markdown o lista estructurada
   - Formatea como: [REPORTE] Tipo: inventario/ventas/etc | Datos: fila1 | fila2...

4. **PRODUCTO / SILENCIADOR / PIEZA**: Extrae:
   - Tipo de producto, marca, modelo, cantidad
   - Números de parte o códigos visibles
   - Estado (nuevo/usado/dañado)
   - Formatea como: [PRODUCTO] Tipo | Modelo | Cantidad | Código | Estado

5. **OTRO / GENERAL**: Describe qué se ve y para qué podría servir en el taller.

IMPORTANTE: Sé extremadamente preciso con números, precios y placas. Si no puedes leer algo claramente, indícalo como "ilegible" no inventes. Responde SIEMPRE en español.`
    : "Eres un analista de imágenes de un taller automotriz. Detalla brevemente y de forma muy precisa qué se ve en la imagen para que el chatbot lo entienda y pueda ayudar al cliente. Si hay texto relevante en la imagen, menciónalo. CLASIFICA la imagen como: [FACTURA], [VEHÍCULO], [PRODUCTO], [TICKET], o [OTRO]. Responde siempre en español.";

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } },
              {
                text: isAdmin
                  ? "Analiza esta imagen como experto en taller automotriz: clasifícala primero ([FACTURA], [VEHÍCULO], [PRODUCTO], [REPORTE], [TICKET], [EXCEL], [OTRO]) y luego extrae TODOS los datos relevantes estructurados. Responde con el formato indicado."
                  : "Describe esta imagen detalladamente pensando como mecánico:"
              }
            ]
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
        })
      }
    );
    if (!resp.ok) {
      console.error(`❌ Gemini Vision error ${resp.status}:`, (await resp.text()).substring(0, 200));
      return null;
    }
    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map((p: any) => p.text).join('').trim() || null;
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

// Helper to extract a plate number cleanly, ignoring product codes and common words
function extractPlate(text: string): string {
  if (!text) return '';
  // Match alphanumeric sequences of length 5-8 that contain both letters and digits
  const placaMatch = text.match(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,8}\b/i);
  if (!placaMatch) return '';
  const rawPlaca = placaMatch[0].toUpperCase();
  const isProductCode = /^(CL\d+|CLK\d+|CLC\d+|CLCP\d+|CLH\d+|RC\d+|GL\d+|GOMAS?|TUBO?|ACEITE|FRENOS?|BUJIA)/i.test(rawPlaca);
  const COMMON_WORDS_BLACKLIST = ['SOY', 'VENTA', 'SEDE', 'CITA', 'CARRO', 'CEMENTERIO', 'PARAISO', 'CARACAS', 'ALTOS', 'MINAS', 'BOMBA', 'PROMO', 'DIVISAS', 'EUROS'];
  const isBlacklistedWord = COMMON_WORDS_BLACKLIST.includes(rawPlaca);

  if (!isProductCode && !isBlacklistedWord) {
    return rawPlaca;
  }
  return '';
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
  const newMemoria: Memoria = { ...ctx.memoria };
  let memChanged = false;

  // Extract name — with blacklist and more flexible patterns
  const NAME_BLACKLIST = [
    'nivel', 'cashea', 'cliente', 'usuario', 'hola', 'buenas', 'buenos',
    'dias', 'noches', 'tardes', 'gracias', 'okay', 'bueno', 'bien',
    'precio', 'cita', 'servicio', 'taller', 'carro', 'vehiculo', 'favor',
    'presupuesto', 'ubicacion', 'donde', 'dirección', 'direccion', 'llegar',
    'metro', 'silenciador', 'resonador', 'flexible', 'cola', 'filtro', 'aceite',
    'charallave', 'caracas', 'miranda', 'valencia', 'maracay', 'teques', 'antonio',
    'guarenas', 'guatire', 'cua', 'ocumare', 'maracaibo', 'barquisimeto', 'petare',
    'chacao', 'sucre', 'baruta', 'hatillo', 'latillo', 'zulia', 'aragua', 'carabobo',
    'falcon', 'falcón', 'lara', 'merida', 'mérida', 'tachira', 'táchira', 'trujillo',
    'vargas', 'laguaira', 'guaira', 'apure', 'bolivar', 'bolívar', 'amazonas', 'delta',
    'amacuro', 'monagas', 'anzoátegui', 'anzoategui', 'nueva', 'esparta', 'margarita',
    'yaracuy', 'cojedes', 'portuguesa', 'barinas', 'guarico', 'guárico', 'de', 'del',
    'en', 'aqui', 'alla', 'allá', 'soy', 'vengo', 'estoy'
  ];

  // 1. Pattern with prefix (Soy Juan, Me llamo Pedro...) - Negative lookahead prevents matching locations
  const nameMatch = userMsg.match(/(?:soy|me llamo|mi nombre es|mi nombre|llámame|llamame)\s+(?!de\b|del\b|en\b|de\s+la\b|el\b|la\b)([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,})?)/i);

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
    'toyota', 'ford', 'chevrolet', 'chevy', 'hyundai', 'kia', 'honda', 'nissan', 'mazda', 'volkswagen',
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
  const detectedPlaca = extractPlate(userMsg);
  if (detectedPlaca) {
    if (detectedPlaca !== newMemoria.placa) {
      newMemoria.placa = detectedPlaca;
      memChanged = true;
    }
  }

  // Sync memory to DB
  if (memChanged) {
    ctx.memoria = newMemoria; // update in-place for this run
    try {
      await db.from('conversaciones').upsert({ telefono: from, memoria: newMemoria, sede_id: DEFAULT_SEDE_ID }, { onConflict: 'telefono' });
    } catch (e) { console.error('Error saving memoria:', e); }
  }

  // Get or Create record IDs — only if we have a real name
  let clientId: string | undefined;
  let vehicleId: string | undefined;
  const hasName = newMemoria.nombre && newMemoria.nombre !== from && !NAME_BLACKLIST.some(w => newMemoria.nombre!.toLowerCase().includes(w));
  if (hasName) {
    const result = await getOrCreateClientAndVehicle(
      db, from, newMemoria.nombre || '', detectedVeh, detectedPlaca || newMemoria.placa || '', undefined, waProfileName, ctx.sede_id
    );
    clientId = result.clientId;
    vehicleId = result.vehicleId;
  } else {
    console.log(`⏭️ Skipping client creation (no real name yet): ${from}`);
  }

  return { clientId, vehicleId };
}

async function getOrCreateClientAndVehicle(
  db: ReturnType<typeof getDb>,
  phone: string,
  name: string,
  vehicleInfo: string,
  placa: string,
  anio?: string,
  waProfileName?: string,
  sedeId?: string
): Promise<{ clientId?: string; vehicleId?: string; isNew?: boolean }> {
  if (!db) return {};
  let clientId: string | undefined;
  let vehicleId: string | undefined;
  let isNew = false;

  try {
    // 1. Client — search by phone first
    const { data: client } = await db.from('clientes').select('id, nombre, apellido').eq('telefono', phone).limit(1).maybeSingle();
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
      // New client — ONLY register if we have a REAL name
      const hasRealName = name && name.toLowerCase() !== 'cliente' && name.trim() !== '' && !['nivel', 'cashea', 'cliente', 'usuario', 'hola', 'buenas', 'buenos'].some(w => name.toLowerCase().startsWith(w));
      if (!hasRealName) {
        console.log(`⏭️ Cliente NO registrado (sin nombre real): ${phone}`);
        return {};
      }
      isNew = true;
      const parts = name.split(' ');
      const { data: newClient, error: clientErr } = await db.from('clientes').insert({
        nombre: parts[0],
        apellido: parts.slice(1).join(' ') || '(WhatsApp)',
        telefono: phone,
        sede_id: sedeId || DEFAULT_SEDE_ID
      }).select('id').single();
      if (clientErr) { console.error('Error creando cliente:', clientErr.message); }
      clientId = newClient?.id;
      console.log(`👤 Nuevo cliente registrado: ${clientId} | ${phone} | ${name}`);
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
          const yearVal = parseInt(anio || '2025');
          const { data: newVeh, error: vehErr } = await db.from('vehiculos').insert({
            cliente_id: clientId,
            placa: placa.toUpperCase(),
            marca: marca || 'Desconocida',
            modelo: modelo || 'Modelo',
            anio: isNaN(yearVal) ? 2025 : yearVal,
            estado: 'activo',
            sede_id: DEFAULT_SEDE_ID
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
          const yearVal = parseInt(anio || '2025');
          const { data: newVeh, error: vehErr } = await db.from('vehiculos').insert({
            cliente_id: clientId,
            marca: marca,
            modelo: modelo || 'Modelo',
            anio: isNaN(yearVal) ? 2025 : yearVal,
            estado: 'activo',
            sede_id: DEFAULT_SEDE_ID
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

      await db.from('conversaciones').update({
        cliente_id: clientId,
        datos_cliente: {
          nombre: fullName || name,
          wa_name: waProfileName || undefined
        }
      }).eq('telefono', phone).eq('sede_id', sedeId || DEFAULT_SEDE_ID);
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
      const { data: client } = await db.from('clientes').select('id').eq('telefono', from).maybeSingle();
      if (client) linkedClientId = client.id;
    } catch (e) { }
  }

  void (async () => {
    try {
      // Look up existing sede_id to avoid overwriting it with default
      let effectiveSedeId = DEFAULT_SEDE_ID;
      const { data: existing } = await db.from('conversaciones')
        .select('sede_id')
        .eq('telefono', from)
        .maybeSingle();

      if (existing?.sede_id) {
        effectiveSedeId = existing.sede_id;
      }

      const updateData: any = {
        telefono: from,
        ultimo_mensaje: lastMsg.substring(0, 500),
        ultimo_mensaje_at: new Date().toISOString(),
        memoria,
        sede_id: effectiveSedeId
      };
      if (linkedClientId) updateData.cliente_id = linkedClientId;

      await db.from('conversaciones').upsert(updateData, { onConflict: 'telefono' });
    } catch (e) { console.error('Error update conversacion:', e); }
  })();
}

// ─── Send WhatsApp Text ────────────────────────────────────────────────────────
async function sendMsg(to: string, body: string, preview: boolean = false, replyToId?: string | null) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/[^0-9]/g, ''),
      type: 'text',
      text: { preview_url: preview, body },
    };

    if (replyToId) {
      payload.context = { message_id: replyToId };
    }

    const resp = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error('❌ Error enviando mensaje WhatsApp:', await resp.text());
      return;
    }

    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`📤 Enviado a ${to}. ID: ${wa_id} ${replyToId ? '(Reply)' : ''}`);

    const db = getDb();
    if (db) {
      // Intento guardar en DB sin bloquear la respuesta
      try {
        await db.from('mensajes_whatsapp').insert({
          from_number: 'system',
          to_number: to.replace(/[^0-9]/g, ''),
          body,
          tipo: 'saliente',
          wa_message_id: wa_id,
          es_ia: true,
          sede_id: DEFAULT_SEDE_ID
        });
      } catch (e) {
        console.error('Error guardando mensaje saliente en DB:', e);
      }
    }
  } catch (e) {
    console.error('❌ Error en sendMsg:', e);
  }
}

// ─── Send WhatsApp Interactive Buttons ────────────────────────────────────────
async function sendButtonMsg(to: string, bodyText: string, buttons: { id: string, title: string }[], footerText?: string, replyToId?: string | null) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/[^0-9]/g, ''),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.substring(0, 20) } // WhatsApp limits title to 20 chars
          }))
        }
      }
    };
    if (footerText) payload.interactive.footer = { text: footerText };
    if (replyToId) payload.context = { message_id: replyToId };

    const resp = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error('❌ Error enviando botones WhatsApp:', await resp.text());
      return;
    }

    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`📤 Botones enviados a ${to}. ID: ${wa_id}`);

    const db = getDb();
    if (db) {
      try {
        await db.from('mensajes_whatsapp').insert({
          from_number: 'system',
          to_number: to.replace(/[^0-9]/g, ''),
          body: `[Botones: ${bodyText}]`,
          tipo: 'saliente',
          wa_message_id: wa_id,
          es_ia: true,
          sede_id: DEFAULT_SEDE_ID
        });
      } catch (e) { console.error('Error guardando botones en DB:', e); }
    }
  } catch (e) {
    console.error('❌ Error en sendButtonMsg:', e);
  }
}

// ─── Send WhatsApp Image ───────────────────────────────────────────────────────
async function sendImageMsg(to: string, imageSlug: string, caption?: string, replyToId?: string | null) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;

  const imageMap: Record<string, string> = {
    'cl30': 'CL 30.jpg',
    'cl40': 'CL 40.jpg',
    'cl60': 'CL 60.jpg',
    'clc60': 'CLC 60.jpg',
    'clcp60': 'CLCP 60.jpg',
    'clh40': 'CLH 40.jpg',
    'rc30': 'RC 30.jpg'
  };

  let fileName = imageMap[imageSlug.toLowerCase()];
  const isRcv = imageSlug.toLowerCase() === 'rcv';
  
  if (!fileName && !isRcv) {
    console.error(`❌ No se encontró imagen para el slug: ${imageSlug}`);
    return;
  }

  // URL base proporcionada por el usuario (Vercel)
  const baseUrl = 'https://lycos-team-whatsapp-bot.vercel.app';
  let imageUrl = '';
  
  if (isRcv) {
    imageUrl = `${baseUrl}/Rcv/RCV.jpg`;
  } else {
    imageUrl = `${baseUrl}/Silenciadores/${encodeURIComponent(fileName)}`;
  }

  console.log(`🖼️ Intentando enviar imagen: ${imageUrl} a ${to}`);

  try {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/[^0-9]/g, ''),
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption ? { caption } : {})
      },
    };

    if (replyToId) {
      payload.context = { message_id: replyToId };
    }

    const resp = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error('❌ Error enviando imagen WhatsApp:', await resp.text());
      return;
    }

    const data = await resp.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`📤 Imagen enviada a ${to}. ID: ${wa_id}`);

    const db = getDb();
    if (db) {
      try {
        await db.from('mensajes_whatsapp').insert({
          from_number: 'system',
          to_number: to.replace(/[^0-9]/g, ''),
          body: `[Imagen: ${imageSlug}] ${caption || ''}`,
          tipo: 'saliente',
          wa_message_id: wa_id,
          es_ia: true,
          sede_id: DEFAULT_SEDE_ID
        });
      } catch (e) {
        console.error('Error guardando imagen saliente en DB:', e);
      }
    }
  } catch (e) {
    console.error('❌ Error en sendImageMsg:', e);
  }
}

async function logActivityAdmin(db: any, usuario: string, accion: string, detalles: string, sede_id: string = DEFAULT_SEDE_ID) {
  if (!db) return;
  try {
    await db.from('logs_actividad').insert({
      usuario,
      accion,
      detalles,
      sede_id
    });
  } catch (e) { console.error('❌ Error logActivityAdmin:', e); }
}

// Registers a completed service/cita as a sale in BOTH ventas_silenciadores AND ventas_dia.
// sourceType: 'cita' or 'servicio' — determines the ref tag used for deduplication.
// rates: optional exchange rates for tasa_cambio in ventas_dia.
async function handleCompletedServiceSale(
  db: any,
  recordId: string,
  recordObj: any,
  sourceType: 'cita' | 'servicio' = 'cita',
  rates?: { bcv?: number; paralelo?: number } | null
) {
  try {
    const COMPLETED_STATES = ['completada', 'finalizado', 'finalizada', 'completado'];
    const isCompleted = COMPLETED_STATES.includes((recordObj.estado || '').toLowerCase());
    const precio = Number(recordObj.costo_final ?? recordObj.costo_estimado ?? 0);
    const hasPrice = precio > 0;

    if (!isCompleted || !hasPrice) return;

    const refTag = `[${sourceType === 'cita' ? 'CitaID' : 'ServicioID'}: ${recordId}]`;
    const nowIso = new Date().toISOString();
    // Use Venezuela local date — server runs UTC so toISOString().split('T')[0] would give wrong date at night
    const fechaStr = getVzlaDateString();
    const sedeId = recordObj.sede_id || DEFAULT_SEDE_ID;

    const vehiculoStr = recordObj.vehiculo_info || recordObj.vehiculo || 'Servicio';
    const clienteNombre = recordObj.nombre_cliente || recordObj.cliente || 'Consumidor Final';
    const descStr = recordObj.descripcion || 'Servicio de taller';
    const registradoPor = recordObj.registrado_por || 'Bot IA';

    const notesFinal = `${descStr} [Total: $${precio} (Divisas)] | Cliente: ${clienteNombre} | Vehículo: ${vehiculoStr} ${refTag}`.trim();

    // ─── 1. ventas_silenciadores ─────────────────────────────────────────────
    const { data: existingVS } = await db.from('ventas_silenciadores')
      .select('id')
      .like('notas', `%${refTag}%`)
      .limit(1)
      .maybeSingle();

    const vsData = {
      cantidad: 1,
      modelo: vehiculoStr,
      notas: notesFinal,
      fecha: nowIso,
      precio_registrado: precio,
      sede_id: sedeId,
      fecha_registro: nowIso,
      registro_atrasado: false,
    };

    if (existingVS) {
      const { error: vsErr } = await db.from('ventas_silenciadores').update(vsData).eq('id', existingVS.id);
      if (vsErr) throw new Error(`ventas_silenciadores update: ${vsErr.message}`);
      console.log(`✅ ventas_silenciadores ACTUALIZADO (${refTag})`);
    } else {
      const { error: vsErr } = await db.from('ventas_silenciadores').insert(vsData);
      if (vsErr) throw new Error(`ventas_silenciadores insert: ${vsErr.message}`);
      console.log(`✅ ventas_silenciadores INSERTADO (${refTag})`);
    }

    // ─── 2. ventas_dia ───────────────────────────────────────────────────────
    const { data: existingVD } = await db.from('ventas_dia')
      .select('id')
      .like('notas', `%${refTag}%`)
      .limit(1)
      .maybeSingle();

    // Parse multi-component descriptions ("Service: Part1 + Part2") into individual line items
    const colonIdx = descStr.indexOf(': ');
    let serviceLabel = '';
    let componentStr = descStr;
    if (colonIdx > 0) { serviceLabel = descStr.substring(0, colonIdx).trim(); componentStr = descStr.substring(colonIdx + 2).trim(); }
    const parts = componentStr.split(' + ').map((p: string) => p.trim()).filter(Boolean);
    const desglose = serviceLabel
      ? [
          { descripcion: serviceLabel, cantidad: 1, precio_unitario: precio, total: precio },
          ...parts.map((p: string) => ({ descripcion: p, cantidad: 1, precio_unitario: 0, total: 0 }))
        ]
      : parts.length > 1
        ? parts.map((p: string, i: number) => ({ descripcion: p, cantidad: 1, precio_unitario: i === 0 ? precio : 0, total: i === 0 ? precio : 0 }))
        : [{ descripcion: descStr, cantidad: 1, precio_unitario: precio, total: precio }];

    const vdData = {
      fecha: fechaStr,
      cliente: clienteNombre,
      total_ingresos: precio,
      total_servicios: 1,
      total_clientes: 1,
      desglose,
      metodos_pago: { divisas: precio },
      tasa_cambio: rates?.bcv || 0,
      con_iva: false,
      notas: notesFinal,
      creado_por: registradoPor,
      sede_id: sedeId,
      fecha_registro: nowIso,
      registro_atrasado: false,
      estado: 'pagado',
    };

    if (existingVD) {
      const { error: vdErr } = await db.from('ventas_dia').update(vdData).eq('id', existingVD.id);
      if (vdErr) throw new Error(`ventas_dia update: ${vdErr.message}`);
      console.log(`✅ ventas_dia ACTUALIZADO (${refTag})`);
    } else {
      const { error: vdErr } = await db.from('ventas_dia').insert(vdData);
      if (vdErr) throw new Error(`ventas_dia insert: ${vdErr.message}`);
      console.log(`✅ ventas_dia INSERTADO (${refTag})`);
    }

  } catch (err) {
    console.error('❌ Error auto-registering sale for completed service:', err);
  }
}

// ─── Send Native Contact Card ──────────────────────────────────────────────────
async function sendContactCard(to: string, phone: string, displayName: string): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const cleanTo = to.replace(/[^0-9]/g, '');

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: cleanTo, type: 'contacts',
        contacts: [{
          name: { formatted_name: displayName, first_name: displayName.split(' ')[0], last_name: displayName.split(' ').slice(1).join(' ') || 'Lycos Team' },
          phones: [{ phone: `+${cleanPhone}`, type: 'WORK', wa_id: cleanPhone }],
          org: { company: 'Lycos Team', title: 'Sede' },
        }],
      }),
    });
    if (!resp.ok) {
      console.error('❌ Contact card error:', (await resp.text()).substring(0, 200));
      await sendMsg(to, `Contacto del asesor: https://wa.me/${cleanPhone}`, true);
      return;
    }
    const data = await resp.json();
    const waMessageId = data.messages?.[0]?.id;
    console.log(`📇 Card sent to ${to}. ID: ${waMessageId}`);

    const db = getDb();
    if (db) {
      // 1. Guardar mensaje en tabla
      await db.from('mensajes_whatsapp').insert({
        from_number: 'system',
        to_number: cleanTo,
        body: `[Tarjeta de contacto: ${displayName}]`,
        tipo: 'saliente',
        wa_message_id: waMessageId,
        es_ia: true
      });

      // 2. Actualizar último mensaje (sin cambiar modo)
      await db.from('conversaciones').update({
        ultimo_mensaje: `[Tarjeta de contacto: ${displayName}]`,
        ultimo_mensaje_at: new Date().toISOString()
      }).eq('telefono', cleanTo).eq('sede_id', DEFAULT_SEDE_ID);
    }
  } catch (e) {
    console.error('❌ sendContactCard:', e);
    await sendMsg(to, `Contacto del asesor: https://wa.me/${cleanPhone}`, true);
  }
}

// ─── Intent Detection ──────────────────────────────────────────────────────────
function isLocationRequest(lower: string): boolean {
  const locKeywords = [
    'ubicacion', 'ubicación', 'donde est', 'dónde est', 'donde quedan', 'dónde quedan',
    'ubica', 'ubican', 'dirección', 'direccion', 'llegar', 'ubicado', 'gps', 'mapa',
    'como llegar', 'cómo llegar', 'y la de san antonio', 'y la de carrizal', 'y la de caracas',
    'y la del cementerio', 'donde queda la de', 'donde es la de'
  ];
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
async function findSedeIdByName(db: any, name: string): Promise<string | null> {
  if (!db) return null;
  const clean = name.toLowerCase().trim();
  let query = '';
  if (clean.includes('san antonio')) query = 'San Antonio';
  else if (clean.includes('carrizal') || clean.includes('principal')) query = 'Carrizal';
  else if (clean.includes('caracas') || clean.includes('cementerio')) query = 'Caracas';
  else if (clean.includes('paraiso') || clean.includes('paraíso')) query = 'Paraíso';

  if (!query) return null;
  const { data } = await db.from('sedes').select('id').ilike('nombre', `%${query}%`).limit(1).maybeSingle();
  return data?.id || null;
}
function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }


export async function processCoreLogic(db: ReturnType<typeof getDb>, from: string, messageBody: string, wa_message_id: string | null, waProfileName?: string) {
  try {
    // Load context + exchange rates in parallel
    const [ctx, rates] = await Promise.all([
      loadConversationContext(db, from, messageBody),
      fetchExchangeRates(),
    ]);

    const lowerBody = messageBody.toLowerCase();

    // ─── EARLY PERSISTENCE (Vercel Timeout Safe) ─────────────────────
    // Guardar el mensaje de inmediato para que si Vercel corta por tiempo (10s), 
    // el usuario vea el mensaje en el CRM para reintentar.
    let pendingId: string | null = null;
    try {
      if (db) {
        const { data: pData } = await db.from('mensajes_pendientes_ia').insert({
          from_number: from,
          message_body: messageBody,
          wa_message_id: wa_message_id,
          wa_profile_name: waProfileName || null,
          inserted_timestamp: new Date().toISOString(),
          intentos: 0,
          status: 'pending',
          sede_id: DEFAULT_SEDE_ID
        }).select('id').single();
        pendingId = pData?.id || null;
        console.log(`💾 [${from}] Persistencia temprana activada (ID: ${pendingId})`);
      }
    } catch (e) {
      console.error('❌ Error en persistencia temprana:', e);
    }

    // 🛑 Silenciar bot si está en modo humano (Intervención manual) - unless they are an admin
    if (ctx.estado === 'humano' && !ctx.isAdmin) {
      console.log(`👤 [${from}] Modo Humano ACTIVO. El bot permanecerá en silencio.`);
      // Procesamos intenciones para extraer metadatos (nombre, vehículo) para el CRM
      const r = await processIntents(db, from, messageBody, ctx, waProfileName);
      // Actualizamos la conversación en la DB para reflejar el último mensaje en el dashboard
      await updateConversation(db, from, messageBody, ctx.memoria, r?.clientId);
      return;
    }

    // 📍 Location Flow (Multi-sede)
    const bodyClean = lowerBody.trim();
    let isLocationChoicePending = ctx.memoria?.awaiting_location_choice === true;
    let isCaracasChoicePending = ctx.memoria?.awaiting_caracas_choice === true;

    // Verificar si se presionó un botón de sede
    const lastButtonId = (global as any).__last_button_id;
    (global as any).__last_button_id = undefined; // Limpiar después de usar

    // Mapear button_ids a sedes
    let selectedSedeFromButton: string | null = null;
    if (lastButtonId) {
      if (lastButtonId === 'sede_1' || lastButtonId === 'admin_sede_1') selectedSedeFromButton = 'san antonio';
      else if (lastButtonId === 'sede_2' || lastButtonId === 'admin_sede_2') selectedSedeFromButton = 'carrizal';
      else if (lastButtonId === 'sede_3' || lastButtonId === 'admin_sede_3') selectedSedeFromButton = 'caracas';
      else if (lastButtonId === 'sede_4' || lastButtonId === 'admin_sede_4') selectedSedeFromButton = 'paraiso';
      else if (lastButtonId === 'ccs_choice_1') { selectedSedeFromButton = 'caracas'; isCaracasChoicePending = false; isLocationChoicePending = false; }
      else if (lastButtonId === 'ccs_choice_2') { selectedSedeFromButton = 'paraiso'; isCaracasChoicePending = false; isLocationChoicePending = false; }
      console.log(`🔘 [${from}] Sede seleccionada por botón: ${selectedSedeFromButton} (button: ${lastButtonId})`);
    }

    // Detection of specific sedes in the message
    const mentionsSanAntonio = selectedSedeFromButton === 'san antonio' || bodyClean.includes('san antonio') || (isLocationChoicePending && (bodyClean === '1' || bodyClean === 'san antonio'));
    const mentionsCarrizal = selectedSedeFromButton === 'carrizal' || bodyClean.includes('carrizal') || (isLocationChoicePending && (bodyClean === '2' || bodyClean === 'carrizal'));
    const mentionsCaracas = selectedSedeFromButton === 'caracas' || bodyClean.includes('cementerio') || (isLocationChoicePending && (bodyClean === '3' || bodyClean === 'cementerio')) || (isCaracasChoicePending && (bodyClean === '1' || bodyClean === 'cementerio'));
    const mentionsParaiso = selectedSedeFromButton === 'paraiso' || bodyClean.includes('paraiso') || bodyClean.includes('paraíso') || (isLocationChoicePending && (bodyClean === '4' || bodyClean.includes('paraiso'))) || (isCaracasChoicePending && (bodyClean === '2' || bodyClean.includes('paraiso')));
    const mentionsCaracasGeneral = bodyClean.includes('caracas') && !bodyClean.includes('cementerio') && !bodyClean.includes('paraiso') && !bodyClean.includes('paraíso');

    if (!ctx.isAdmin && mentionsCaracasGeneral) {
      console.log(`📍 [${from}] Preguntando por sede de Caracas específica con 2 botones...`);
      const buttons = [
        { id: 'ccs_choice_1', title: 'El Cementerio' },
        { id: 'ccs_choice_2', title: 'El Paraiso' }
      ];
      await sendButtonMsg(from, '📍 Contamos con 2 sedes en Caracas. ¿Cuál te queda más cerca? 😊', buttons, 'Selecciona una opción');
      ctx.memoria.awaiting_caracas_choice = true;
      if (db) await db.from('conversaciones').upsert({ telefono: from, memoria: ctx.memoria, sede_id: ctx.sede_id || DEFAULT_SEDE_ID }, { onConflict: 'telefono' });
      return;
    }

    if (!ctx.isAdmin && (mentionsSanAntonio || mentionsCarrizal || mentionsCaracas || mentionsParaiso)) {
      let locationSent = false;
      let selectedSedeName = '';
      let queryNameForDb = '';
      const selectedSedePhone = '584123343519';

      if (mentionsSanAntonio) {
        await sendMsg(from, '📍 *Sede San Antonio de los Altos:*\n\nEn San Antonio de los Altos, distribuidor de las minas al frente del Frescos Market nos encontramos. 😊\n\n*Mapa:* https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(800);
        await sendMsg(from, '🎥 *Video de cómo llegar:* https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(800);
        await sendMsg(from, '🎁 *¡Beneficios Exclusivos en San Antonio!* 🎁\n\nSi vienes a nuestra sede de San Antonio, cuentas con beneficios como:\n✅ *Revisión totalmente gratuita.*\n✅ *Instalación de la app del taller GRATIS en Lycos Team.*\n✅ *Servicios y tecnología automotriz profesional.*\n\n¡Te esperamos! 🚗🔧', true);
        selectedSedeName = 'Sede San Antonio';
        queryNameForDb = 'San Antonio';
        locationSent = true;
      } else if (mentionsCarrizal) {
        await sendMsg(from, '📍 *Sede Carrizal (Principal):*\n\nServicios Jadar Calle Raul Leoni, Municipio Carrizal cerca de eso. 😊\n\n*Mapa:* https://maps.app.goo.gl/cxLGkqWtsf5qogMB6', true);
        selectedSedeName = 'Sede Carrizal';
        queryNameForDb = 'Carrizal';
        locationSent = true;
      } else if (mentionsCaracas) {
        await sendMsg(from, '📍 *Sede Caracas (El Cementerio):*\n\nE/S PDV Nuevo Prado Av. Roosevelt, Caracas cerca de esa bomba. 😊\n\n*Mapa:* https://maps.app.goo.gl/aeHGdzUumhpBep719', true);
        selectedSedeName = 'Sede Caracas';
        queryNameForDb = 'Caracas';
        locationSent = true;
      } else if (mentionsParaiso) {
        await sendMsg(from, '📍 *Sede Caracas (El Paraíso):*\n\nAvenida Los Liberales, Caracas 1020, Distrito Capital, Venezuela, Al frente de Puerkos Restaurant. 😊\n\n*Mapa:* https://maps.app.goo.gl/c3TnUnHYGEJUWodX7', true);
        selectedSedeName = 'Sede Caracas (El Paraíso)';
        queryNameForDb = 'Paraíso';
        locationSent = true;
      }

      if (locationSent) {
        delete ctx.memoria.awaiting_location_choice;
        delete ctx.memoria.awaiting_caracas_choice;
        if (db) {
          const newSedeId = await findSedeIdByName(db, queryNameForDb) || ctx.sede_id || DEFAULT_SEDE_ID;
          ctx.sede_id = newSedeId;
          await db.from('conversaciones').upsert({ telefono: from, memoria: ctx.memoria, sede_id: newSedeId }, { onConflict: 'telefono' });
        }
        await delay(800);
        await sendMsg(from, `También te comparto el contacto de la ${selectedSedeName} por si necesitas llamar:`);
        await delay(500);
        await sendContactCard(from, selectedSedePhone, selectedSedeName);
        await delay(800);

        // Determinar si el mensaje es SOLO la elección de sede o si hay una pregunta adicional
        const isSimpleSedeChoice = bodyClean === 'caracas' ||
          bodyClean === 'el cementerio' ||
          bodyClean === 'el paraiso' ||
          bodyClean === 'el paraíso' ||
          bodyClean === 'san antonio' ||
          bodyClean === 'carrizal' ||
          bodyClean === '1' || bodyClean === '2' || bodyClean === '3' || bodyClean === '4' ||
          bodyClean.length < 15;

        if (isSimpleSedeChoice) {
          await sendMsg(from, '¿Deseas agendar una cita en esta sede o tienes alguna otra duda? 😊');
          return;
        }

        console.log(`📍 [${from}] Sede detectada pero el mensaje es complejo. Continuando procesamiento con IA.`);
        // Inyectamos un mensaje en la historia para que la IA sepa que ya enviamos la ubicación
        ctx.historia.push({
          role: 'model',
          parts: [{ text: `[SISTEMA: Ya le envié al cliente la ubicación detallada de ${selectedSedeName} con el mapa y el contacto. Responde ahora a sus otras dudas sobre precios o productos de forma directa.]` }]
        });
        // Continuamos el flujo para que la IA responda el resto de la pregunta
      }
    }

    // If it's a generic location request and we haven't sent a specific one yet
    if (isLocationRequest(lowerBody) && !ctx.isAdmin) {
      console.log(`📍 [${from}] Preguntando por sede para ubicación con botones...`);
      const buttons = [
        { id: 'sede_1', title: 'San Antonio' },
        { id: 'sede_2', title: 'Carrizal' },
        { id: 'sede_3', title: 'Cementerio' },
        { id: 'sede_4', title: 'El Paraiso' }
      ];

      await sendButtonMsg(
        from,
        '¡Con gusto! 📍 Contamos con 4 sedes disponibles. ¿Cuál te queda más cerca?',
        buttons,
        'Selecciona una opción abajo'
      );

      await delay(800);
      await sendMsg(from, '💡 *Dato importante:* Si vienes a nuestra sede de San Antonio, cuentas con más beneficios exclusivos y otros servicios adicionales. 🚗🔧');

      ctx.memoria.awaiting_location_choice = true;
      if (db) {
        await db.from('conversaciones').upsert({ telefono: from, memoria: ctx.memoria, sede_id: ctx.sede_id || DEFAULT_SEDE_ID }, { onConflict: 'telefono' });
      }
      return;
    }

    // If we were waiting for a choice but the message didn't match any sede, clear the flag and let AI handle it
    if (isLocationChoicePending) {
      console.log(`📍 [${from}] Respuesta no reconocida en flujo de sede: "${bodyClean}". Liberando para que la IA responda.`);
      delete ctx.memoria.awaiting_location_choice;
      if (db) {
        await db.from('conversaciones').upsert({ telefono: from, memoria: ctx.memoria, sede_id: ctx.sede_id || DEFAULT_SEDE_ID }, { onConflict: 'telefono' });
      }
      // No return, let the flow continue to AI
    }

    // ─── ADMIN SEDE CHOICE ──────────────────────────────────────────
    if (ctx.memoria?.awaiting_admin_sede && db) {
      const motivo = ctx.memoria.awaiting_admin_sede;
      const selectedSedeId = await findSedeIdByName(db, bodyClean);

      if (selectedSedeId) {
        const { data: sData } = await db.from('sedes').select('nombre').eq('id', selectedSedeId).single();
        const sedeName = sData?.nombre || 'la sede seleccionada';

        delete ctx.memoria.awaiting_admin_sede;
        await db.from('conversaciones').update({ memoria: ctx.memoria }).eq('telefono', from);

        await sendMsg(from, `✅ Entendido. Procedo con la gestión de *${motivo}* para la sede *${sedeName}*.`);

        // Inject a hidden message so the AI can continue with the correct sede
        const followUpMsg = `[SISTEMA: El administrador seleccionó la sede ${sedeName} (ID: ${selectedSedeId}) para ${motivo}. Por favor, procede con la información o el tag correspondiente usando este ID].`;
        const aiResp = await getAIResponse(followUpMsg, ctx, rates, from);
        if (aiResp) {
          await sendMsg(from, cleanForWhatsApp(aiResp), true, wa_message_id);
        }
        return;
      }
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
    const aiResponse = await getAIResponse(messageBody, ctx, rates, from);

    if (aiResponse) {
      const cleanedAiBody = cleanForWhatsApp(aiResponse);
      let cleanedAi = cleanedAiBody.replace(/\[IMAGE:[^\]]+\]/gi, '').trim();

      // ── Process Image Tags [IMAGE: slug] ───────────────────────────
      const imageMatches = Array.from(cleanedAiBody.matchAll(/\[IMAGE:\s*([^\]]+)\]/gi));
      for (const match of imageMatches) {
        const slug = match[1].trim().toLowerCase();
        console.log(`🤖 AI solicitó enviar imagen: ${slug}`);
        await sendImageMsg(from, slug, undefined, wa_message_id);
        await delay(500);
      }


      // ── Extract Client Name via AI Tag ────────────────────────────────
      const nombreMatch = cleanedAi.match(/\[NOMBRE:\s*([^\]]+?)\]/i);
      if (nombreMatch) {
        const aiDetectedName = nombreMatch[1].trim();
        cleanedAi = cleanedAi.replace(/\[NOMBRE:[^\]]+\]/gi, '').trim();

        const AI_NAME_BLACKLIST = ['cliente', 'usuario', 'hola', 'buenas', 'buenos', 'dias', 'noches', 'tardes', 'precio', 'cita', 'servicio', 'taller', 'vehiculo', 'whatsapp'];
        if (!AI_NAME_BLACKLIST.some(w => aiDetectedName.toLowerCase().includes(w))) {
          ctx.memoria.nombre = aiDetectedName;
          try {
            if (db) {
              await db.from('conversaciones').upsert({ telefono: from, memoria: ctx.memoria, sede_id: ctx.sede_id || DEFAULT_SEDE_ID }, { onConflict: 'telefono' });
              await getOrCreateClientAndVehicle(db, from, aiDetectedName, '', '', undefined, waProfileName, ctx.sede_id);
              console.log(`🤖 AI Nombre Extraido y Guardado: ${aiDetectedName}`);
            }
          } catch (e) { console.error('Error saving AI detected name:', e); }
        }
      }

      // ── Process ALERTA_TRAMITE Tag ────────────────────────────────
      if (cleanedAi.includes('[ALERTA_TRAMITE]')) {
        cleanedAi = cleanedAi.replace(/\[ALERTA_TRAMITE\]/gi, '').trim();
        const userName = ctx.memoria?.nombre || from;
        console.log(`🚨 [ALERTA TRAMITE] Solicitud de Certificado Medico o RCV de ${userName} (${from})`);
        
        await sendGlobalPushNotification({
          title: '🚨 Nueva Solicitud de Trámite',
          body: `El cliente ${userName} (${from}) está solicitando un Certificado Médico o RCV. ¡Atiéndelo pronto!`,
          type: 'tramite_alert',
          url: '/chat'
        });
      }

      // ── Process INTERES Tag [INTERES: servicio | vehiculo | notas] ──
      const interesMatch = cleanedAi.match(/\[INTERES:\s*([^|\]]+?)(?:\s*\|\s*([^|\]]+?))?(?:\s*\|\s*([^\]]+?))?\s*\]/i);
      if (interesMatch && db) {
        const servicio = interesMatch[1]?.trim();
        const vehiculo = interesMatch[2]?.trim();
        const notas = interesMatch[3]?.trim();
        cleanedAi = cleanedAi.replace(/\[INTERES:[^\]]+\]/gi, '').trim();

        try {
          const userName = ctx.memoria?.nombre || '';
          const { clientId, vehicleId } = await getOrCreateClientAndVehicle(
            db, from, userName, vehiculo || '', '', undefined, waProfileName
          );

          await db.from('citas').insert({
            fecha: getVzlaDateString(), // Fecha de hoy como placeholder
            hora: '00:00', // Hora placeholder para prospectos
            telefono: from,
            cliente_id: clientId || null,
            vehiculo_id: vehicleId || null,
            tipo_servicio: 'otro',
            descripcion: `PROSPECTO: ${servicio}${notas ? ' (' + notas + ')' : ''}`,
            estado: 'pendiente', // Usamos pendiente pero con descripción de prospecto
            sede_id: ctx.sede_id || DEFAULT_SEDE_ID
          });
          console.log(`💡 INTERES DETECTADO: ${servicio} para ${from}`);
        } catch (e) { console.error('Error guardando interes:', e); }
      }

      // ── ADMIN: Process management tags ────────────────────────────────
      const isAdmin = !!ctx.isAdmin || (await checkIsBotAdmin(from || '', db, ADMIN_PHONES));

      // Rastreo de registro de servicio: nos permite detectar el caso "la IA dijo
      // que registró pero no emitió/falló el tag" y aplicar un fallback que evita
      // perder el registro. servicioOK = se guardó OK; servicioFalló = hubo error.
      let servicioOK = false;
      let servicioFallo = false;

      // Gating por ROL: cada comando de escritura requiere el permiso correspondiente.
      // La eliminación definitiva es exclusiva del admin. Si no hay permisos resueltos
      // (admin por lista hardcodeada), se asume acceso total.
      const phoneClean2 = (from || '').replace(/[^0-9]/g, '');
      const isFullAdmin = resolveRol(ctx.botRol) === 'admin'
        || ADMIN_PHONES.includes(from || '') || ADMIN_PHONES.includes(phoneClean2)
        || !ctx.botPermisos;
      const canBot = (mod: keyof Permisos, action: 'crear' | 'leer' | 'editar' | 'eliminar'): boolean => {
        if (isFullAdmin) return true;
        return hasPermiso((ctx.botPermisos as Permisos)[mod], action);
      };
      const canBotWrite = (mod: keyof Permisos) => canBot(mod, 'crear') || canBot(mod, 'editar');

      if (isAdmin && db) {
        // 1. [STOCK_UPSERT: nombre | categoria | precio_usd | stock | codigo | marca]
        // Regex más flexible que captura el interior del tag
        const stockUpsertMatchesArray = canBotWrite('inventario') ? Array.from(cleanedAi.matchAll(/\[STOCK_?UPSERT:\s*([^\]]+)\]/gi)) : [];
        for (const match of stockUpsertMatchesArray) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const nombre = parts[0];
            const categoria = parts[1];
            const precio = parseFloat(parts[2]);
            const stock = parseInt(parts[3]);
            const codigo = parts[4] || null;
            const marca = parts[5] || null;
            const sedeId = parts[6] || DEFAULT_SEDE_ID;
            const ubicacion = parts[7] || 'almacen';
            const clasificacion = parts[8] || 'repuesto';

            const updateObj: any = {
              nombre,
              categoria,
              precio_usd: isNaN(precio) ? 0 : precio,
              precio_bs: 0,
              stock: isNaN(stock) ? 0 : stock,
              stock_minimo: 1,
              unidad: 'unidad',
              codigo,
              marca,
              ubicacion,
              clasificacion,
              activo: true,
              sede_id: sedeId
            };

            console.log(`📦 ADMIN (${from}): Intento de UPSERT para "${nombre}" en sede ${sedeId} (Stock: ${stock}, Cod: ${codigo})`);

            // Intentar encontrar por CÓDIGO Y SEDE primero (es lo más preciso)
            let existingId = null;
            if (codigo) {
              const { data: byCod } = await db.from('inventario')
                .select('id')
                .eq('codigo', codigo)
                .eq('sede_id', sedeId)
                .limit(1).maybeSingle();
              if (byCod) existingId = byCod.id;
            }

            // Si no hay por código, buscar por NOMBRE Y SEDE exacto
            if (!existingId) {
              const { data: byNom } = await db.from('inventario')
                .select('id')
                .eq('nombre', nombre)
                .eq('sede_id', sedeId)
                .limit(1).maybeSingle();
              if (byNom) existingId = byNom.id;
            }

            if (existingId) {
              // UPDATE existente en ESA sede
              const { error: updErr } = await db.from('inventario').update(updateObj).eq('id', existingId);
              if (updErr) {
                if (updErr.message.includes('marca')) {
                  delete updateObj.marca;
                  await db.from('inventario').update(updateObj).eq('id', existingId);
                } else throw updErr;
              }
              console.log(`✅ ADMIN: Stock ACTUALIZADO en sede ${sedeId}: ${nombre}`);
              await logActivityAdmin(db, ctx.memoria?.nombre || 'Admin IA', 'Actualizó producto', `Actualizó ${nombre} en sede ${sedeId} vía ChatBot`, sedeId);
            } else {
              // INSERT nuevo en ESA sede
              const { error: insErr } = await db.from('inventario').insert(updateObj);
              if (insErr) {
                if (insErr.message.includes('marca')) {
                  delete updateObj.marca;
                  await db.from('inventario').insert(updateObj);
                } else throw insErr;
              }
              console.log(`✅ ADMIN: Nuevo producto INSERTADO en sede ${sedeId}: ${nombre}`);
              await logActivityAdmin(db, ctx.memoria?.nombre || 'Admin IA', 'Creó producto', `Agregó ${nombre} en sede ${sedeId} vía ChatBot`, sedeId);
            }
          } catch (e) {
            console.error('❌ Error en STOCK_UPSERT:', e);
          }
        }

        // 2. [STOCK_DELETE: id_o_codigo | sede_id]
        const stockDeleteMatches = canBot('inventario', 'eliminar') ? Array.from(cleanedAi.matchAll(/\[STOCK_DELETE:\s*([^\]]+)\]/gi)) : [];
        for (const match of stockDeleteMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const target = parts[0];
            const sId = parts[1] || DEFAULT_SEDE_ID;

            console.log(`🗑️ ADMIN (${from}): Intento de DELETE para "${target}" en sede ${sId}`);

            // Soft delete filtering by sede
            const { error: delErr } = await db.from('inventario')
              .update({ activo: false })
              .eq('sede_id', sId)
              .or(`id.eq.${target},codigo.eq.${target}`);

            if (delErr) throw delErr;

            console.log(`✅ ADMIN: Producto ${target} marcado como inactivo en sede ${sId}`);
            await logActivityAdmin(db, ctx.memoria?.nombre || 'Admin IA', 'Eliminó producto', `Eliminó ${target} en sede ${sId} vía ChatBot`, sId);
          } catch (e) {
            console.error('❌ Error en STOCK_DELETE:', e);
          }
        }

        // 3. [CITA_UPSERT: id_opcional | fecha | hora | cliente_id | vehiculo_id | estado | descripcion | sede_id | costo_estimado | nombre_cliente | vehiculo_info | placa | telefono]
        const citaUpsertMatches = canBotWrite('agenda') ? Array.from(cleanedAi.matchAll(/\[CITA_UPSERT:\s*([^\]]+)\]/gi)) : [];
        for (const match of citaUpsertMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            // Parse fecha - handle combined "YYYY-MM-DD HH:MM" format (AI often puts them together)
            let fecha = parts[1] || getVzlaDateString();
            let hora = parts[2] || '08:00';
            if (fecha.includes(' ')) {
              const [datePart, timePart] = fecha.split(' ');
              if (/^\d{4}-\d{2}-\d{2}$/.test(datePart.trim())) {
                fecha = datePart.trim();
              }
              if (timePart && /^\d{2}:\d{2}/.test(timePart.trim()) && (!parts[2] || !parts[2].trim())) {
                hora = timePart.trim();
              }
            }

            const id = (parts[0] && parts[0] !== 'id_opcional' && parts[0] !== 'null' && UUID_RE.test(parts[0])) ? parts[0] : null;
            // Validate UUID fields to prevent AI from placing wrong values (e.g. sede UUID as clientId)
            const clientId = (parts[3] && UUID_RE.test(parts[3])) ? parts[3] : null;
            const vehId = (parts[4] && UUID_RE.test(parts[4])) ? parts[4] : null;
            const estado = (parts[5] && parts[5] !== 'null') ? parts[5] : 'pendiente';
            const desc = (parts[6] && parts[6] !== 'null' && parts[6].trim() !== '') ? parts[6] : 'Cita agendada por WhatsApp';
            const sedeId = (parts[7] && UUID_RE.test(parts[7])) ? parts[7] : (ctx.sede_id || DEFAULT_SEDE_ID);
            const costoEstimado = (parts[8] && parts[8] !== 'null') ? parseFloat(parts[8]) : null;
            const nombreCliente = (parts[9] && parts[9] !== 'null') ? parts[9] : null;
            const vehiculoInfo = (parts[10] && parts[10] !== 'null') ? parts[10] : null;
            const placa = (parts[11] && parts[11] !== 'null') ? parts[11].toUpperCase().replace(/[-\s]/g, '') : null;
            const phoneParam = (parts[12] && parts[12] !== 'null') ? parts[12] : (from || '00000000000');

            // Resolve or create Client & Vehicle if IDs are missing but details are present
            let finalClientId = clientId;
            let finalVehId = vehId;

            // Default name to admin's name if client name not provided
            const adminName = ctx.memoria?.nombre || ctx.adminName || 'Administrador';
            const defaultName = adminName;
            const nameToUse = nombreCliente || defaultName;

            // Verify clientId actually exists in DB (AI may put sede UUID in client field)
            if (finalClientId && db) {
              const { data: clientExists } = await db.from('clientes').select('id').eq('id', finalClientId).maybeSingle();
              if (!clientExists) {
                console.log(`⚠️ CITA_UPSERT: clientId ${finalClientId} no existe en DB, se ignorará`);
                finalClientId = null;
              }
            }

            // Verify vehId actually exists in DB
            if (finalVehId && db) {
              const { data: vehExists } = await db.from('vehiculos').select('id').eq('id', finalVehId).maybeSingle();
              if (!vehExists) {
                console.log(`⚠️ CITA_UPSERT: vehId ${finalVehId} no existe en DB, se ignorará`);
                finalVehId = null;
              }
            }

            if (!finalClientId && nameToUse) {
              const { clientId: newCId } = await getOrCreateClientAndVehicle(
                db, phoneParam, nameToUse, vehiculoInfo || '', placa || '', undefined, undefined, sedeId
              );
              finalClientId = newCId || null;
            }

            if (finalClientId && !finalVehId && (vehiculoInfo || placa)) {
              const { vehicleId: newVId } = await getOrCreateClientAndVehicle(
                db, phoneParam, nameToUse, vehiculoInfo || '', placa || '', undefined, undefined, sedeId
              );
              finalVehId = newVId || null;
            }

            // After resolving client, get the actual client name from DB
            let resolvedClientName = nombreCliente || '';
            if (finalClientId && !nombreCliente) {
              const { data: clientData } = await db.from('clientes').select('nombre, apellido').eq('id', finalClientId).maybeSingle();
              if (clientData) {
                resolvedClientName = `${clientData.nombre} ${clientData.apellido}`.trim();
              }
            }

            const citaObj: any = {
              fecha,
              hora,
              cliente_id: finalClientId,
              vehiculo_id: finalVehId,
              estado,
              descripcion: desc,
              telefono: phoneParam,
              sede_id: sedeId,
              nombre_cliente: resolvedClientName || nameToUse,
              registrado_por: adminName,
              vehiculo_info: vehiculoInfo || null,
              placa: placa || null
            };
            if (costoEstimado !== null && !isNaN(costoEstimado)) {
              citaObj.costo_estimado = costoEstimado;
            }

            let finalCitaId = id;

            if (id && id.length > 5 && db) {
              await db.from('citas').update(citaObj).eq('id', id);
              servicioOK = true;
              console.log(`📅 ADMIN: Cita actualizada: ${id}`);
              await logActivityAdmin(db, adminName, 'Actualizó cita', `Cita ${id} actualizada vía ChatBot`, sedeId);
            } else if (db) {
              const { data: newCita, error: insErr } = await db.from('citas').insert(citaObj).select('id').single();
              if (insErr) throw insErr;
              servicioOK = true;
              finalCitaId = newCita?.id || null;
              console.log(`📅 ADMIN: Nueva cita creada por administrador: ${finalCitaId}`);
              await logActivityAdmin(db, adminName, 'Agendó cita', `Cita para ${fecha} creada vía ChatBot`, sedeId);
            }

            // Trigger sale auto-registration if completed
            if (finalCitaId && db) {
              const fullCitaObj = { ...citaObj, id: finalCitaId };
              await handleCompletedServiceSale(db, finalCitaId, fullCitaObj, 'cita', rates);
            }
          } catch (e) { console.error('Error in CITA_UPSERT:', e); }
        }

        // 3b. [SERVICIO_UPSERT: id_opcional | cliente_id | vehiculo_id | nombre_cliente | telefono | vehiculo_info | placa | tipo | descripcion | estado | costo_estimado | sede_id | tipo_personalizado]
        const servUpsertMatches = canBotWrite('servicios') ? Array.from(cleanedAi.matchAll(/\[SERVICIO_UPSERT:\s*([^\]]+)\]/gi)) : [];
        for (const match of servUpsertMatches) {
          try {
            const rawTag = match[1].trim();
            const rawParts = rawTag.split('|').map(s => s.trim());

            // UUID regex to validate ID fields
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            // Known field labels the AI might mistakenly include
            const FIELD_LABELS = new Set([
              'id_opcional', 'cliente_id', 'vehiculo_id', 'nombre_cliente', 'telefono',
              'vehiculo_info', 'placa', 'tipo', 'descripcion', 'estado', 'costo_estimado',
              'sede_id', 'tipo_personalizado'
            ]);

            let id: string | null = null;
            let clienteId: string | null = null;
            let vehId: string | null = null;
            let nombreCliente: string | null = null;
            let telefono: string | null = null;
            let vehiculoInfo: string | null = null;
            let placa: string | null = null;
            let tipo: string = 'otro';
            let descripcion: string = '';
            let estado: string = 'pendiente';
            let costoEstimado: number | null = null;
            let sedeId: string | null = null;
            let tipoPersonalizado: string | null = null;

            // Detect labeled format: first part is a known field label (e.g., "nombre_cliente" not a UUID)
            const isLabeledFormat = rawParts.length > 13 && FIELD_LABELS.has(rawParts[0]?.toLowerCase());

            if (isLabeledFormat) {
              // Extract values by known field labels
              const fieldMap: Record<string, string> = {};
              for (let i = 0; i < rawParts.length - 1; i += 2) {
                const label = rawParts[i]?.toLowerCase().trim() || '';
                const value = rawParts[i + 1]?.trim() || '';
                if (label && value) fieldMap[label] = value;
              }
              console.log(`🔧 ADMIN: Tag con formato etiquetado detectado. Extrayendo por nombre de campo.`, Object.keys(fieldMap));
              id = fieldMap['id_opcional'] && UUID_RE.test(fieldMap['id_opcional']) ? fieldMap['id_opcional'] : null;
              clienteId = fieldMap['cliente_id'] && UUID_RE.test(fieldMap['cliente_id']) ? fieldMap['cliente_id'] : null;
              vehId = fieldMap['vehiculo_id'] && UUID_RE.test(fieldMap['vehiculo_id']) ? fieldMap['vehiculo_id'] : null;
              nombreCliente = fieldMap['nombre_cliente'] || null;
              telefono = fieldMap['telefono'] || null;
              vehiculoInfo = fieldMap['vehiculo_info'] || null;
              const rawPlaca = fieldMap['placa'] || '';
              placa = rawPlaca ? rawPlaca.toUpperCase().replace(/[-\s]/g, '') : null;
              tipo = fieldMap['tipo'] || 'otro';
              descripcion = fieldMap['descripcion'] || '';
              estado = fieldMap['estado'] || 'pendiente';
              costoEstimado = fieldMap['costo_estimado'] ? parseFloat(fieldMap['costo_estimado']) : null;
              sedeId = fieldMap['sede_id'] || ctx.sede_id || DEFAULT_SEDE_ID;
              tipoPersonalizado = fieldMap['tipo_personalizado'] || null;
              console.log(`🔧 ADMIN: Tag etiquetado parseado: nombre=${nombreCliente}, placa=${placa}, tipo=${tipo}, sede=${sedeId}`);
            } else {
              // Standard positional parsing
              id = (rawParts[0] && UUID_RE.test(rawParts[0])) ? rawParts[0] : null;
              clienteId = (rawParts[1] && UUID_RE.test(rawParts[1])) ? rawParts[1] : null;
              vehId = (rawParts[2] && UUID_RE.test(rawParts[2])) ? rawParts[2] : null;
              nombreCliente = (rawParts[3] && rawParts[3] !== 'null' && !FIELD_LABELS.has(rawParts[3].toLowerCase())) ? rawParts[3] : null;
              telefono = (rawParts[4] && rawParts[4] !== 'null' && !FIELD_LABELS.has(rawParts[4].toLowerCase())) ? rawParts[4] : null;
              vehiculoInfo = (rawParts[5] && rawParts[5] !== 'null' && !FIELD_LABELS.has(rawParts[5].toLowerCase())) ? rawParts[5] : null;
              const rawPlaca6 = (rawParts[6] && rawParts[6] !== 'null' && !FIELD_LABELS.has(rawParts[6].toLowerCase())) ? rawParts[6] : '';
              placa = rawPlaca6 ? rawPlaca6.toUpperCase().replace(/[-\s]/g, '') : null;
              tipo = (rawParts[7] && rawParts[7] !== 'null' && !FIELD_LABELS.has(rawParts[7].toLowerCase())) ? rawParts[7] : 'otro';
              descripcion = (rawParts[8] && rawParts[8] !== 'null' && !FIELD_LABELS.has(rawParts[8].toLowerCase())) ? rawParts[8] : '';
              estado = (rawParts[9] && rawParts[9] !== 'null' && !FIELD_LABELS.has(rawParts[9].toLowerCase())) ? rawParts[9] : 'pendiente';
              costoEstimado = (rawParts[10] && rawParts[10] !== 'null' && !isNaN(parseFloat(rawParts[10]))) ? parseFloat(rawParts[10]) : null;
              sedeId = (rawParts[11] && rawParts[11] !== 'null' && rawParts[11] !== 'undefined' && UUID_RE.test(rawParts[11])) ? rawParts[11] : (ctx.sede_id || DEFAULT_SEDE_ID);
              tipoPersonalizado = (rawParts[12] && rawParts[12] !== 'null' && !FIELD_LABELS.has(rawParts[12].toLowerCase())) ? rawParts[12] : null;
            }

            const now = new Date();
            const adminName = ctx.memoria?.nombre || ctx.adminName || 'Administrador';
            // Only use the provided nombre_cliente — NEVER default to admin's own name
            const nameToUse = nombreCliente || null;

            let finalClientId = clienteId;
            let finalVehId = vehId;

            // Resolve or create client & vehicle only when we have an explicit client name or ID
            const clientPhone = telefono || (nameToUse ? from : null);
            if (!finalClientId && nameToUse && clientPhone) {
              const { clientId: newCId } = await getOrCreateClientAndVehicle(
                db, clientPhone, nameToUse, vehiculoInfo || '', placa || '', undefined, undefined, sedeId
              );
              finalClientId = newCId || null;
            }
            if (finalClientId && !finalVehId && (vehiculoInfo || placa) && clientPhone) {
              const { vehicleId: newVId } = await getOrCreateClientAndVehicle(
                db, clientPhone, nameToUse || '', vehiculoInfo || '', placa || '', undefined, undefined, sedeId
              );
              finalVehId = newVId || null;
            }

            // Resolve client display name from DB if we have an ID but no explicit name
            let resolvedClientName = nombreCliente || '';
            if (finalClientId && !nombreCliente) {
              const { data: clientData } = await db.from('clientes').select('nombre, apellido').eq('id', finalClientId).maybeSingle();
              if (clientData) {
                resolvedClientName = `${clientData.nombre} ${clientData.apellido}`.trim();
              }
            }

            const vzlaDateStr = getVzlaDateString();
            const vzlaTime = new Intl.DateTimeFormat('es-VE', {
              timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: false,
            }).format(new Date());

            const servObj: any = {
              cliente_id: finalClientId,
              vehiculo_id: finalVehId,
              nombre_cliente: resolvedClientName || 'No definido',
              telefono: telefono || '00000000000',
              vehiculo_info: vehiculoInfo || 'Vehículo desconocido',
              placa: placa || 'SIN-PLACA',
              tipo: tipo || 'otro',
              tipo_personalizado: tipoPersonalizado,
              descripcion: descripcion || 'Servicio de taller',
              estado: estado || 'pendiente',
              costo_estimado: costoEstimado,
              registrado_por: adminName,
              fecha: vzlaDateStr,
              hora: vzlaTime,
              seguimiento: [{
                fecha: now.toISOString(),
                accion: estado === 'pendiente' ? 'Registrado vía WhatsApp Admin' : `Estado inicial: ${estado}`,
                usuario: adminName,
                tipo: 'sistema',
                progreso: 0,
              }],
              sede_id: sedeId,
            };

            if (id && id.length > 5 && db) {
              // Update existing servicio
              const { data: existing } = await db.from('servicios').select('seguimiento').eq('id', id).single();
              if (existing) {
                const existingSeg = existing.seguimiento || [];
                servObj.seguimiento = [...existingSeg, {
                  fecha: now.toISOString(),
                  accion: `Actualizado vía WhatsApp Admin — Estado: ${estado}`,
                  usuario: adminName,
                  tipo: 'sistema',
                }];
                servObj.updated_at = now.toISOString();
                delete servObj.fecha;
                delete servObj.hora;
                const { error: updErr } = await db.from('servicios').update(servObj).eq('id', id);
                if (updErr) throw updErr;
                servicioOK = true;
                console.log(`🔧 ADMIN: Servicio actualizado: ${id}`);
                await logActivityAdmin(db, adminName, 'Actualizó servicio', `Servicio ${id} actualizado vía ChatBot`, sedeId);
                // Auto-register sale if now completed
                await handleCompletedServiceSale(db, id, servObj, 'servicio', rates);
              } else {
                console.log(`🔧 ADMIN: ID proporcionado pero servicio no encontrado: ${id}. Creando nuevo.`);
                delete servObj.updated_at;
                const { data: newServ, error: insErr } = await db.from('servicios').insert(servObj).select('id').single();
                if (insErr) throw insErr;
                servicioOK = true;
                console.log(`🔧 ADMIN: Nuevo servicio creado (fallback): ${newServ?.id}`);
                await logActivityAdmin(db, adminName, 'Creó servicio', `Servicio para ${nameToUse} creado vía ChatBot (fallback)`, sedeId);
                if (newServ?.id) await handleCompletedServiceSale(db, newServ.id, servObj, 'servicio', rates);
              }
            } else if (db) {
              const { data: newServ, error: insErr } = await db.from('servicios').insert(servObj).select('id').single();
              if (insErr) throw insErr;
              servicioOK = true;
              console.log(`🔧 ADMIN: Nuevo servicio creado: ${newServ?.id}`);
              await logActivityAdmin(db, adminName, 'Creó servicio', `Servicio para ${nameToUse} creado vía ChatBot`, sedeId);
              // Auto-register sale if completada/finalizado
              if (newServ?.id) await handleCompletedServiceSale(db, newServ.id, servObj, 'servicio', rates);
            }
          } catch (e) {
            servicioFallo = true;
            console.error('Error in SERVICIO_UPSERT:', e);
          }
        }

        // 3c. [PRESUPUESTO_UPSERT: cliente_nombre | vehiculo_info | placa | moneda | items | total | sede_id | notas]
        const presupuestoMatches = canBotWrite('presupuestos') ? Array.from(cleanedAi.matchAll(/\[PRESUPUESTO_UPSERT:\s*([^\]]+)\]/gi)) : [];
        for (const match of presupuestoMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            const clienteNombre = (parts[0] && parts[0] !== 'null') ? parts[0] : (ctx.adminName || 'Consumidor Final');
            const vehiculoInfo = (parts[1] && parts[1] !== 'null') ? parts[1] : 'Vehículo';
            const placa = (parts[2] && parts[2] !== 'null') ? parts[2].toUpperCase().replace(/[-\s]/g, '') : null;
            const rawMoneda = (parts[3] || 'USD').toUpperCase();
            const moneda = (['USD', 'VES', 'EUR'].includes(rawMoneda) ? rawMoneda : 'USD') as 'USD' | 'VES' | 'EUR';
            const itemsRaw = parts[4] || '';
            const totalParam = parseFloat(parts[5]) || 0;
            const sedeId = (parts[6] && UUID_RE.test(parts[6])) ? parts[6] : (ctx.sede_id || DEFAULT_SEDE_ID);
            const notas = (parts[7] && parts[7] !== 'null') ? parts[7] : null;

            // Parse items: "desc:cant:precio:tipo,desc2:cant2:precio2:tipo2"
            const items: any[] = [];
            let subtotal = 0;
            if (itemsRaw) {
              const itemParts = itemsRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
              for (const ip of itemParts) {
                const segments = ip.split(':').map((s: string) => s.trim());
                const desc = segments[0] || 'Servicio';
                const cantidad = parseFloat(segments[1]) || 1;
                const precioUnit = parseFloat(segments[2]) || 0;
                const rawTipo = segments[3] || 'servicio';
                const tipo = (['servicio', 'repuesto', 'otro'].includes(rawTipo) ? rawTipo : 'servicio') as 'servicio' | 'repuesto' | 'otro';
                const itemTotal = cantidad * precioUnit;
                subtotal += itemTotal;
                items.push({
                  id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  tipo,
                  descripcion: desc,
                  cantidad,
                  precio_unitario: precioUnit,
                  moneda,
                  total: itemTotal,
                });
              }
            }

            const finalTotal = totalParam || subtotal;
            const adminName = ctx.memoria?.nombre || ctx.adminName || 'Administrador';

            // Generate presupuesto number
            const nowDate = new Date();
            const year = nowDate.getFullYear();
            let numero = `PRE-${year}-${String(Date.now()).slice(-4)}`;
            try {
              const { data: rpcNum } = await db.rpc('generar_numero_presupuesto');
              if (rpcNum) numero = rpcNum;
            } catch {
              try {
                const { count: presCount } = await db.from('presupuestos').select('*', { count: 'exact', head: true });
                numero = `PRE-${year}-${String((presCount || 0) + 1).padStart(4, '0')}`;
              } catch { /* use timestamp fallback */ }
            }

            const presupuestoObj: any = {
              numero,
              cliente_nombre: clienteNombre,
              vehiculo_info: vehiculoInfo,
              moneda,
              items,
              subtotal: subtotal || finalTotal,
              descuento: 0,
              descuento_tipo: 'monto',
              iva: 0,
              total: finalTotal,
              notas,
              estado: 'borrador',
              validez_dias: 7,
              creado_por: adminName,
              sede_id: sedeId,
            };

            // Try to resolve vehicle and client from plate
            if (placa) {
              try {
                const { data: vehData } = await db.from('vehiculos').select('id, cliente_id').eq('placa', placa).maybeSingle();
                if (vehData?.id) {
                  presupuestoObj.vehiculo_id = vehData.id;
                  if (vehData.cliente_id) presupuestoObj.cliente_id = vehData.cliente_id;
                }
              } catch { /* non-critical */ }
            }

            const { data: newPres, error: presErr } = await db.from('presupuestos').insert(presupuestoObj).select('id').single();
            if (presErr) throw presErr;

            console.log(`📋 ADMIN: Nuevo presupuesto creado: ${newPres?.id} (${numero}) — ${clienteNombre} — Total: $${finalTotal}`);
            await logActivityAdmin(db, adminName, 'Creó presupuesto', `Presupuesto ${numero} para ${clienteNombre} / ${vehiculoInfo} — $${finalTotal} vía ChatBot`, sedeId);
          } catch (e) { console.error('Error in PRESUPUESTO_UPSERT:', e); }
        }

        // 4. [CITA_DELETE: id]
        const citaDeleteMatch = canBot('agenda', 'eliminar') ? cleanedAi.match(/\[CITA_DELETE:\s*([^\]]+?)\s*\]/i) : null;
        if (citaDeleteMatch && db) {
          try {
            const target = citaDeleteMatch[1].trim();
            await db.from('citas').delete().eq('id', target).eq('sede_id', DEFAULT_SEDE_ID);
            console.log(`📅 ADMIN: Cita eliminada: ${target}`);
          } catch (e) { console.error('Error in CITA_DELETE:', e); }
        }

        // 5. [CLIENTE_UPSERT: id_opcional | nombre | apellido | telefono | cedula | direccion | sede_id]
        const clientUpsertMatches = canBotWrite('clientes') ? Array.from(cleanedAi.matchAll(/\[CLIENTE_UPSERT:\s*([^\]]+)\]/gi)) : [];
        for (const match of clientUpsertMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const id = (parts[0] && parts[0] !== 'id_opcional' && parts[0] !== 'null') ? parts[0] : null;
            const name = parts[1];
            const last = parts[2] || '';
            const tel = parts[3];
            const ced = (parts[4] && parts[4] !== 'null') ? parts[4] : null;
            const dir = (parts[5] && parts[5] !== 'null') ? parts[5] : null;
            const sedeId = parts[6] || ctx.sede_id || DEFAULT_SEDE_ID;

            const clientObj = {
              nombre: name || 'Desconocido',
              apellido: last,
              telefono: tel || '00000000000',
              cedula: ced,
              direccion: dir,
              sede_id: sedeId
            };
            if (id && id.length > 5 && db) {
              await db.from('clientes').update(clientObj).eq('id', id);
              console.log(`👤 ADMIN: Cliente actualizado: ${id}`);
              await logActivityAdmin(db, ctx.memoria?.nombre || ctx.adminName || 'Admin IA', 'Actualizó cliente', `Cliente actualizado vía ChatBot`, sedeId);
            } else if (db) {
              await db.from('clientes').insert(clientObj);
              console.log(`👤 ADMIN: Nuevo cliente agregado por administrador`);
              await logActivityAdmin(db, ctx.memoria?.nombre || ctx.adminName || 'Admin IA', 'Creó cliente', `Cliente creado vía ChatBot`, sedeId);
            }
          } catch (e) { console.error('Error in CLIENTE_UPSERT:', e); }
        }

        // 6. [VEHICULO_UPSERT: id_opcional | cliente_id | placa | marca | modelo | anio | sede_id]
        const vehUpsertMatches = Array.from(cleanedAi.matchAll(/\[VEHICULO_UPSERT:\s*([^\]]+)\]/gi));
        for (const match of vehUpsertMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const id = (parts[0] && parts[0] !== 'id_opcional' && parts[0] !== 'null') ? parts[0] : null;
            const clientId = (parts[1] && parts[1] !== 'null' && parts[1] !== 'undefined') ? parts[1] : null;
            const placa = parts[2]?.toUpperCase().replace(/[-\s]/g, '') || '';
            const marca = parts[3] || 'Desconocida';
            const modelo = parts[4] || 'Modelo';
            const anio = (parts[5] && parts[5] !== 'null') ? parseInt(parts[5]) : null;
            const sedeId = parts[6] || ctx.sede_id || DEFAULT_SEDE_ID;

            const vehObj: any = {
              placa: placa || 'SIN-PLACA',
              marca,
              modelo,
              anio: isNaN(Number(anio)) ? null : anio,
              estado: 'en_servicio',
              sede_id: sedeId
            };
            if (clientId) vehObj.cliente_id = clientId;

            if (id && id.length > 5 && db) {
              await db.from('vehiculos').update(vehObj).eq('id', id);
              console.log(`🚗 ADMIN: Vehículo actualizado: ${id}`);
              await logActivityAdmin(db, ctx.memoria?.nombre || ctx.adminName || 'Admin IA', 'Actualizó vehículo', `Vehículo ${placa} actualizado vía ChatBot`, sedeId);
            } else if (db) {
              const { data: newVeh, error: insErr } = await db.from('vehiculos').insert(vehObj).select('id').single();
              if (insErr) throw insErr;
              console.log(`🚗 ADMIN: Nuevo vehículo registrado: ${placa} (ID: ${newVeh?.id})`);
              await logActivityAdmin(db, ctx.memoria?.nombre || ctx.adminName || 'Admin IA', 'Registró vehículo', `Vehículo ${placa} (${marca} ${modelo}) registrado vía ChatBot`, sedeId);
            }
          } catch (e) { console.error('Error in VEHICULO_UPSERT:', e); }
        }

        // 7. [ASK_SEDE: motivo]
        const askSedeMatch = cleanedAi.match(/\[ASK_SEDE:\s*([^\]]+?)\s*\]/i);
        if (askSedeMatch) {
          const motivo = askSedeMatch[1].trim();
          console.log(`📍 [${from}] AI solicitó preguntar sede por motivo: ${motivo}`);

          const buttons = [
            { id: `admin_sede_1_${motivo}`, title: 'San Antonio' },
            { id: `admin_sede_2_${motivo}`, title: 'Carrizal' },
            { id: `admin_sede_3_${motivo}`, title: 'Cementerio' },
            { id: `admin_sede_4_${motivo}`, title: 'El Paraiso' }
          ];

          await sendButtonMsg(
            from,
            `¿Para qué sede deseas realizar la gestión de ${motivo}? 📍`,
            buttons,
            'Selecciona la sede'
          );

          // Persistir motivo en memoria para saber qué hacer cuando responda
          ctx.memoria.awaiting_admin_sede = motivo;
          await db.from('conversaciones').update({ memoria: ctx.memoria }).eq('telefono', from);
        }

        // 8. [ACTION: registrar_venta_completa | ...]
        const ventaMatches = Array.from(cleanedAi.matchAll(/\[ACTION:\s*registrar_venta_completa\s*\|\s*([^\]]+)\]/gi));
        for (const match of ventaMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const p: Record<string, string> = {};
            for (const part of parts) {
              const idx = part.indexOf('=');
              if (idx > 0) {
                p[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
              }
            }

            const totalNum = parseFloat(p.total || '0');
            const metodo = p.metodo_pago || '';
            const contextStr = metodo ? ` (${metodo})` : '';
            const clienteNombre = p.cliente || 'Consumidor Final';
            const clienteStr = p.cliente ? ` | Cliente: ${p.cliente}` : '';
            const vehiculoStr = p.vehiculo ? ` | Vehículo: ${p.vehiculo}` : '';
            const pagoMixtoStr = p.pago_mixto ? ` | Pagos: ${p.pago_mixto}` : '';
            const itemsDisplay = p.items || p.producto || 'Varios';
            const totalStr = p.total ? ` | Total: $${p.total}${contextStr}` : '';
            const ivaStr = p.iva ? ` | IVA 16%: $${p.iva}` : '';
            const inicialStr = p.inicial ? ` | Inicial Cashea: $${p.inicial}` : '';

            const notasFinales = `Items: ${itemsDisplay}${totalStr}${ivaStr}${inicialStr}${clienteStr}${vehiculoStr}${pagoMixtoStr}`.trim();
            const targetSedeId = p.sede_id || ctx.sede_id || DEFAULT_SEDE_ID;

            console.log(`💰 ADMIN (${from}): Registrando venta completa de $${totalNum} en sede ${targetSedeId}`);

            // 1. Insert into ventas_dia (Accounting)
            let desglose = [{
              descripcion: p.titulo || itemsDisplay.split(',')[0]?.split(':')[0] || 'Varios',
              cantidad: parseInt(p.cantidad) || 1,
              precio_unitario: totalNum,
              total: totalNum
            }];

            if (p.items && p.items.includes(':')) {
              desglose = p.items.split(',').map(item => {
                const parts = item.trim().split(':');
                const desc = parts[0]?.trim() || item.trim();
                const priceStr = parts[1]?.replace(/[^\d.]/g, '') || '0';
                const price = parseFloat(priceStr) || 0;
                return { descripcion: desc, cantidad: 1, precio_unitario: price, total: price };
              });
            }

            const isCashea = metodo === 'cashea_bcv';
            const inicialCashea = p.inicial ? parseFloat(p.inicial) : (totalNum * 0.5); // Default 50% si no viene
            const montoPagado = isCashea ? inicialCashea : totalNum;
            const saldoPendiente = isCashea ? Math.max(0, totalNum - montoPagado) : 0;
            const estadoVenta = saldoPendiente > 0 ? 'pendiente' : 'pagado';
            
            const ventaFecha = p.fecha || getVzlaDateString();
            const hoyStr = new Date().toISOString().split('T')[0];
            const esRegistroAtrasado = ventaFecha !== hoyStr;
            const nowIso = new Date().toISOString();

            const { data: newVentaDia, error: errDia } = await db.from('ventas_dia').insert({
              fecha: ventaFecha,
              cliente: clienteNombre,
              total_ingresos: totalNum,
              desglose,
              con_iva: !!p.iva,
              tasa_cambio: rates?.bcv || 0,
              notes: notasFinales,
              notas: notasFinales,
              creado_por: 'Admin IA',
              sede_id: targetSedeId,
              tiene_abono: isCashea,
              abono: isCashea ? montoPagado : 0,
              saldo_pendiente: saldoPendiente,
              estado: estadoVenta,
              fecha_registro: nowIso,
              registro_atrasado: esRegistroAtrasado,
              metodos_pago: {
                otro: metodo === 'otro' ? totalNum : 0,
                zelle: metodo === 'zelle' ? totalNum : 0,
                cashea: isCashea ? montoPagado : 0,
                binance: metodo === 'binance' ? totalNum : 0,
                pago_movil: metodo === 'pago_movil' ? totalNum : 0,
                efectivo_usd: (metodo === 'divisas' || metodo === 'efectivo_usd') ? totalNum : 0,
                efectivo_ves: metodo === 'efectivo_ves' ? totalNum : 0,
                transferencia: metodo === 'transferencia' ? totalNum : 0,
                punto_de_venta: metodo === 'punto_venta' ? totalNum : 0,
                euros: (metodo === 'euros' || metodo === 'efectivo_eur') ? totalNum : 0
              }
            }).select('id').single();

            if (errDia) throw errDia;

            // 2. Insert into ventas_silenciadores (Compatibility)
            const { error: errSil } = await db.from('ventas_silenciadores').insert({
              cantidad: parseInt(p.cantidad) || 1,
              modelo: p.titulo || itemsDisplay.split(',')[0]?.split(':')[0] || 'Venta múltiple',
              notas: `Venta POS #${newVentaDia?.id?.slice(0, 8)} | ${notasFinales}`,
              fecha: ventaFecha,
              precio_registrado: totalNum,
              sede_id: targetSedeId,
              fecha_registro: nowIso,
              registro_atrasado: esRegistroAtrasado
            });

            if (errSil) throw errSil;

            // 3. Auto-decrement stock for each item if inv_ids provided
            if (p.inv_ids) {
              const idList = p.inv_ids.split(',').map(x => x.trim());
              for (const itemStr of idList) {
                let invId = itemStr;
                let qty = 1;
                if (itemStr.includes(':')) {
                  const [idPart, qtyPart] = itemStr.split(':');
                  invId = idPart.trim();
                  qty = parseInt(qtyPart) || 1;
                }
                const { data: invItem } = await db.from('inventario').select('stock').eq('id', invId).single();
                if (invItem) {
                  const newStock = Math.max(0, (invItem.stock || 0) - qty);
                  await db.from('inventario').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', invId);
                }
              }
            }

            await logActivityAdmin(db, ctx.memoria?.nombre || ctx.adminName || 'Admin IA', 'Registró venta POS (Silenciadores)', `Cliente: ${clienteNombre}, Total: $${totalNum.toFixed(2)} (vía ChatBot)`, targetSedeId);
          } catch (e) {
            console.error('❌ Error en ACTION: registrar_venta_completa:', e);
          }
        }

        // 9. [ACTION: modificar_venta_pendiente | ...]
        const pendienteMatches = Array.from(cleanedAi.matchAll(/\[ACTION:\s*modificar_venta_pendiente\s*\|\s*([^\]]+)\]/gi));
        for (const match of pendienteMatches) {
          try {
            const parts = match[1].split('|').map(s => s.trim());
            const p: Record<string, string> = {};
            for (const part of parts) {
              const idx = part.indexOf('=');
              if (idx > 0) p[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
            }

            const sedeId = p.sede_id || ctx.sede_id || DEFAULT_SEDE_ID;
            let targetVenta: any = null;
            if (p.id) {
              const { data } = await db.from('ventas_dia').select('id, cliente, total_ingresos, notas, saldo_pendiente, abono, estado').eq('id', p.id).eq('sede_id', sedeId).maybeSingle();
              targetVenta = data;
            } else if (p.cliente) {
              const tCliente = p.cliente.toLowerCase().trim();
              const { data } = await db.from('ventas_dia').select('id, cliente, total_ingresos, notas, saldo_pendiente, abono, estado').eq('estado', 'pendiente').eq('sede_id', sedeId).order('created_at', { ascending: false }).limit(5);
              if (data) targetVenta = data.find((v: any) => (v.cliente || '').toLowerCase().trim() === tCliente) || data[0];
            }

            if (!targetVenta) {
              cleanedAi = cleanedAi + `\n⚠️ No encontré una venta pendiente con ese criterio.`;
              continue;
            }

            const updateObj: any = { updated_at: new Date().toISOString() };
            let actionDesc = '';

            if (p.accion === 'pagar' || p.estado === 'pagado') {
              updateObj.estado = 'pagado';
              updateObj.saldo_pendiente = 0;
              const abonoPrev = Number(targetVenta.abono || 0);
              const totalVenta = Number(targetVenta.total_ingresos || 0);
              if (abonoPrev < totalVenta) updateObj.abono = totalVenta;
              updateObj.notas = `${targetVenta.notas || ''} | Pagado por IA el ${new Date().toLocaleDateString('es-VE')}`;
              actionDesc = `marcada como PAGADA`;
            } else if (p.accion === 'abonar' && p.monto) {
              const montoAbono = parseFloat(p.monto);
              if (montoAbono <= 0) continue;
              const nuevoAbono = (Number(targetVenta.abono) || 0) + montoAbono;
              const nuevoSaldo = Math.max(0, (Number(targetVenta.total_ingresos) || 0) - nuevoAbono);
              updateObj.abono = nuevoAbono;
              updateObj.saldo_pendiente = nuevoSaldo;
              updateObj.estado = nuevoSaldo <= 0 ? 'pagado' : 'pendiente';
              updateObj.notas = `${targetVenta.notas || ''} | Abono $${montoAbono.toFixed(2)} por IA el ${new Date().toLocaleDateString('es-VE')}`;
              actionDesc = `abono de $${montoAbono.toFixed(2)} registrado. Saldo: $${nuevoSaldo.toFixed(2)}`;
            } else if (p.accion === 'reabrir') {
              if (targetVenta.estado === 'pendiente') continue;
              const saldo = Number(targetVenta.total_ingresos || 0) - (Number(targetVenta.abono) || 0);
              updateObj.estado = 'pendiente';
              updateObj.saldo_pendiente = Math.max(0, saldo);
              updateObj.notas = `${targetVenta.notas || ''} | Reabierto por IA el ${new Date().toLocaleDateString('es-VE')}`;
              actionDesc = `reabierta como PENDIENTE. Saldo: $${Math.max(0, saldo).toFixed(2)}`;
            }

            if (updateObj.estado) {
              await db.from('ventas_dia').update(updateObj).eq('id', targetVenta.id);
              cleanedAi = cleanedAi + `\n✅ Venta de ${targetVenta.cliente} ${actionDesc}.`;
            }
          } catch (e) {
            console.error('❌ Error en ACTION: modificar_venta_pendiente:', e);
          }
        }

        // Remove management tags from final message
        cleanedAi = cleanedAi
          .replace(/\[STOCK_UPSERT:[^\]]+\]/gi, '')
          .replace(/\[STOCK_DELETE:[^\]]+\]/gi, '')
          .replace(/\[VEHICULO_UPSERT:[^\]]+\]/gi, '')
          .replace(/\[CITA_UPSERT:[^\]]+\]/gi, '')
          .replace(/\[CITA_DELETE:[^\]]+\]/gi, '')
          .replace(/\[SERVICIO_UPSERT:[^\]]+\]/gi, '')
          .replace(/\[CLIENTE_UPSERT:[^\]]+\]/gi, '')
          .replace(/\[ASK_SEDE:[^\]]+\]/gi, '')
          .replace(/\[ACTION: registrar_venta_completa[^\]]+\]/gi, '')
          .replace(/\[ACTION: modificar_venta_pendiente[^\]]+\]/gi, '')
          .trim();

        // ── VERIFICACIÓN + FALLBACK DE REGISTRO DE SERVICIO (ADMIN) ──────────
        // Problema corregido: la IA decía "servicio registrado" pero no emitía el
        // tag [SERVICIO_UPSERT] (o este fallaba), dejando al admin con la falsa
        // impresión de que quedó guardado. Aquí lo detectamos y NO perdemos el
        // registro: lo creamos a partir del contexto combinado (imagen + audio/texto).
        // La IA AFIRMA haber registrado (texto de confirmación) — debe existir un tag.
        const aiClaimsRegistro = /(registr[aoóe]|qued[oó]\s|guard[aeóo]|anot[aeéó]|agregu[eé]|✅).{0,40}(servicio|orden|veh[ií]culo|carro|registro)|(servicio|orden|registro).{0,40}(registr|guard|cread|anot)/i.test(cleanedAi);

        // Solo recuperamos cuando la IA dijo que registró pero NO se guardó, o cuando
        // el tag existió pero falló. NO disparamos por simple intención del mensaje:
        // si la IA legítimamente pidió confirmación, no debemos registrar a la fuerza.
        if (canBotWrite('servicios') && !servicioOK && (servicioFallo || aiClaimsRegistro)) {
          try {
            // Texto combinado: mensaje actual + última descripción de imagen reciente del historial
            const imgHist = [...(ctx.historia || [])].reverse().find(h =>
              h.role === 'user' && /\[imagen|descripci[oó]n autom[aá]tica|matr[ií]cula|clasificaci[oó]n:|\[veh[ií]culo\]/i.test(h.parts?.[0]?.text || '')
            );
            const imgText = imgHist?.parts?.[0]?.text || '';
            const combinedText = `${messageBody}\n${imgText}`.trim();

            // Solo registramos si hay datos REALES de vehículo (evita basura)
            const placaFb = extractPlate(combinedText) || ctx.memoria?.placa || '';
            // Marca + hasta 2 tokens de modelo (corta en conectores/relleno como "de color")
            const brandRe = /\b(toyota|chevrolet|chevy|ford|mazda|hyundai|kia|nissan|honda|jeep|mitsubishi|renault|fiat|volkswagen|vw|chery|dodge|jac|peugeot|citroen|citro[eé]n|suzuki|subaru|bmw|mercedes|audi|isuzu|daewoo|encava|iveco|hino|foton)((?:\s+[a-záéíóúñ0-9\-]+){0,2})/i;
            const brandMatch = combinedText.match(brandRe);
            const FILLER = new Set(['de', 'del', 'la', 'el', 'color', 'un', 'una', 'vista', 'estacionada', 'estacionado', 'que', 'en', 'año', 'anio', 'modelo']);
            let vehFromBrand = '';
            if (brandMatch) {
              const tokens = `${brandMatch[1]}${brandMatch[2] || ''}`.trim().split(/\s+/);
              const kept: string[] = [];
              for (let i = 0; i < tokens.length; i++) {
                if (i > 0 && FILLER.has(tokens[i].toLowerCase())) break;
                kept.push(tokens[i]);
              }
              vehFromBrand = kept.join(' ').trim();
            }
            const memVeh = ctx.memoria?.vehiculos?.[0];
            const anioFb = (combinedText.match(/\b(19[8-9]\d|20[0-2]\d)\b/) || [])[1] || '';
            const vehiculoFb = (vehFromBrand ? `${vehFromBrand}${anioFb ? ' ' + anioFb : ''}`.trim() : '')
              || (memVeh ? `${memVeh.marca} ${memVeh.modelo}${memVeh.anio ? ' ' + memVeh.anio : ''}`.trim() : '');

            if (placaFb || vehiculoFb) {
              const adminNameFb = ctx.memoria?.nombre || ctx.adminName || 'Administrador';
              // Sede: detectar en el mensaje, si no usar la del perfil/contexto
              const sedeFb = (await findSedeIdByName(db, messageBody)) || ctx.adminSedeId || ctx.sede_id || DEFAULT_SEDE_ID;
              // Estado: "por definir / presupuesto por definir" → pendiente
              const estadoFb = 'pendiente';
              // Descripción: usar el texto del mensaje (transcripción) limpio de marcadores
              let descFb = messageBody
                .replace(/\(audio transcrito\)/gi, '')
                .replace(/\[[^\]]*\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              if (descFb.length < 3) descFb = 'Servicio de taller (registro automático)';
              // Costo: si hay un precio explícito tipo $123
              const costMatch = combinedText.match(/\$\s?(\d+(?:[.,]\d+)?)/);
              const costoFb = costMatch ? parseFloat(costMatch[1].replace(',', '.')) : null;

              const nowFb = new Date();
              const vzlaTimeFb = new Intl.DateTimeFormat('es-VE', {
                timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: false,
              }).format(nowFb);

              const servFbObj: any = {
                cliente_id: null,
                vehiculo_id: null,
                nombre_cliente: ctx.memoria?.nombre || 'No definido',
                telefono: '00000000000',
                vehiculo_info: vehiculoFb || 'Vehículo (de imagen)',
                placa: placaFb || 'SIN-PLACA',
                tipo: 'otro',
                tipo_personalizado: null,
                descripcion: descFb,
                estado: estadoFb,
                costo_estimado: costoFb,
                registrado_por: adminNameFb,
                fecha: getVzlaDateString(),
                hora: vzlaTimeFb,
                seguimiento: [{
                  fecha: nowFb.toISOString(),
                  accion: 'Registrado vía WhatsApp Admin (recuperación automática)',
                  usuario: adminNameFb,
                  tipo: 'sistema',
                  progreso: 0,
                }],
                sede_id: sedeFb,
              };

              const { data: fbServ, error: fbErr } = await db.from('servicios').insert(servFbObj).select('id').single();
              if (fbErr) throw fbErr;
              servicioOK = true;
              servicioFallo = false;
              console.log(`🛟 FALLBACK SERVICIO: registro recuperado ${fbServ?.id} (placa=${placaFb}, veh=${vehiculoFb})`);
              await logActivityAdmin(db, adminNameFb, 'Creó servicio', `Servicio recuperado vía ChatBot (fallback ${vehiculoFb} ${placaFb})`, sedeFb);
              // Confirmar al admin con datos reales para que tenga certeza
              cleanedAi = `${cleanedAi}\n\n✅ Servicio registrado correctamente:\n🚗 ${vehiculoFb || 'Vehículo'}${placaFb ? ' — Placa ' + placaFb : ''}\n🔧 ${descFb}\n📌 Estado: ${estadoFb}`.trim();
            } else if (servicioFallo) {
              // No pudimos recuperar datos suficientes pero el tag falló: avisar honestamente
              cleanedAi = `${cleanedAi}\n\n⚠️ No pude completar el registro del servicio automáticamente. Por favor confírmame el vehículo (marca/modelo) y la placa para registrarlo correctamente.`.trim();
            }
          } catch (e) {
            console.error('❌ Error en fallback de SERVICIO_UPSERT:', e);
            cleanedAi = `${cleanedAi}\n\n⚠️ Hubo un problema al registrar el servicio. Reenvíame el vehículo y el trabajo a realizar para reintentarlo.`.trim();
          }
        } else if (servicioFallo && !servicioOK) {
          // El tag existía pero falló y no aplica el fallback: nunca afirmar éxito en falso
          cleanedAi = `${cleanedAi}\n\n⚠️ No se pudo guardar el servicio en el sistema. Indícame nuevamente los datos para reintentar.`.trim();
        }
      }

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
            const placa = extractPlate(messageBody) || ctx.memoria.placa || '';
            // Year from message or memoria
            const anioMatch = messageBody.match(/\b(19[8-9]\d|20[0-2]\d)\b/);
            const anio = anioMatch?.[1] || ctx.memoria?.vehiculos?.[0]?.anio || '';
            // Best vehicle info: from [CITA] tag > first memoria vehicle
            const vehiculoFromMem = ctx.memoria?.vehiculos?.map(v =>
              `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}`).join(', ') || '';
            const vehiculoInfo = vehiculoFromTag || vehiculoFromMem;

            // ── Get or Create Client & Vehicle ─────────────────────────────
            const { clientId, vehicleId, isNew } = await getOrCreateClientAndVehicle(
              db, from, userName, vehiculoInfo, placa, anio?.toString(), waProfileName, ctx.sede_id
            );

            // ── Composed description with client name + (WhatsApp) ──────────
            const clientLabel = userName
              ? `${userName}`
              : `${from}`;
            const descripcionFinal = [
              servicio || 'Servicio por WhatsApp',
              vehiculoInfo ? `- ${vehiculoInfo}` : '',
              placa ? `[${placa}]` : '',
            ].filter(Boolean).join(' ');

            // ── Deduplicate ──────────────────────────────────────────────────
            const { data: existing } = await db.from('citas')
              .select('id').eq('telefono', from).eq('fecha', fecha).eq('hora', hora)
              .neq('estado', 'cancelada').limit(1);
            if (existing && existing.length > 0) {
              console.log(`⚠️ Cita duplicada ignorada: ${fecha} ${hora} para ${from}`);
            } else {
              await db.from('citas').insert({
                fecha,
                hora,
                telefono: from,
                cliente_id: clientId || null,
                vehiculo_id: vehicleId || null,
                tipo_servicio: 'otro',
                descripcion: descripcionFinal,
                estado: 'pendiente',
                duracion_minutos: 60,
                nombre_cliente: userName || from,
                vehiculo_info: vehiculoInfo || null,
                placa: placa || null,
                sede_id: ctx.sede_id || DEFAULT_SEDE_ID
              });
              console.log(`📅 AUTO-CITA IA: ${fecha} ${hora} | ${descripcionFinal} | client_id: ${clientId} | veh_id: ${vehicleId} | isNew: ${isNew}`);
            }
          }
        } catch (e) { console.error('Error insertando cita automatica:', e); }
      }

      // ── FALLBACK: Detect if AI said it scheduled but forgot [CITA:] tag ──
      if (!citaMatch && db && !isAdmin) {
        const lowerResp = cleanedAi.toLowerCase();
        const agendadoKeywords = ['agendado', 'agendé', 'cita registrada', 'cita agendada', 'cita confirmada', 'reservado', 'cita creada', 'cita para'];
        const hasAgendado = agendadoKeywords.some(k => lowerResp.includes(k));
        if (hasAgendado) {
          console.log(`⚠️ FALLBACK: AI dice que agendó cita pero no generó [CITA:]. Intentando extraer datos...`);
          try {
            const userName = ctx.memoria?.nombre || '';
            const vehiculoFromMem = ctx.memoria?.vehiculos?.map(v =>
              `${v.marca} ${v.modelo}${v.anio ? ' ' + v.anio : ''}`).join(', ') || '';
            // Extract date from AI response: "viernes 29 de mayo", "martes 02 de junio", etc.
            const dateMatch = lowerResp.match(/(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
            // Extract time from AI response: "08:00 AM", "8:00 AM", "08:00"
            const timeMatch = lowerResp.match(/(\d{1,2}):(\d{2})\s*(?:AM|PM)?/i);
            // Look for HH:MM AM/PM patterns like "8:00 AM", "08:00 AM"
            const ampmMatch = lowerResp.match(/(?:a\s+las\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)/i);

            if (userName && vehiculoFromMem) {
              let horaFallback = '08:00';
              if (ampmMatch) {
                let h = parseInt(ampmMatch[1]);
                if (ampmMatch[3].toUpperCase() === 'PM' && h < 12) h += 12;
                if (ampmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
                horaFallback = `${String(h).padStart(2, '0')}:${ampmMatch[2]}`;
              } else if (timeMatch) {
                horaFallback = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
              }

              const fechaFallback = getVzlaDateString();
              const placaFallback = extractPlate(messageBody) || ctx.memoria.placa || '';

              const { clientId, vehicleId } = await getOrCreateClientAndVehicle(
                db, from, userName, vehiculoFromMem, placaFallback, undefined, waProfileName, ctx.sede_id
              );

              const { data: existing } = await db.from('citas')
                .select('id').eq('telefono', from).eq('fecha', fechaFallback).eq('hora', horaFallback)
                .neq('estado', 'cancelada').limit(1);

              if (existing && existing.length > 0) {
                console.log(`⚠️ FALLBACK: Cita duplicada ignorada para ${from}`);
              } else {
                await db.from('citas').insert({
                  fecha: fechaFallback,
                  hora: horaFallback,
                  telefono: from,
                  cliente_id: clientId || null,
                  vehiculo_id: vehicleId || null,
                  tipo_servicio: 'otro',
                  descripcion: `Servicio por WhatsApp - ${vehiculoFromMem}`,
                  estado: 'pendiente',
                  duracion_minutos: 60,
                  nombre_cliente: userName || from,
                  vehiculo_info: vehiculoFromMem || null,
                  placa: placaFallback || null,
                  sede_id: ctx.sede_id || DEFAULT_SEDE_ID
                });
                console.log(`📅 FALLBACK CITA: Cita creada automáticamente para ${userName} a las ${horaFallback}`);
              }
            } else {
              console.log(`⚠️ FALLBACK: Datos insuficientes - nombre: "${userName}", vehiculo: "${vehiculoFromMem}"`);
            }
          } catch (e) { console.error('Error en fallback de cita:', e); }
        }
      }

      // ── Clean all AI Tags before sending to WhatsApp ──────────────────
      cleanedAi = cleanedAi
        .replace(/\[CITA:[^\]]+\]/gi, '')
        .replace(/\[NOMBRE:[^\]]+\]/gi, '')
        .replace(/\[ACTION: registrar_venta_completa[^\]]+\]/gi, '')
        .replace(/\[ACTION: modificar_venta_pendiente[^\]]+\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      const needsAsesor = aiNeedsAsesor(cleanedAi);

      if (needsAsesor) {
        const withoutPhone = cleanedAi
          .replace(/https?:\/\/wa\.me\/\S+/gi, '')
          .replace(/wa\.me\/\S+/gi, '')
          .replace(/\+?58\s?412[\s\-]?334[\s\-]?3519/g, '')
          .trim();
        if (withoutPhone) { await sendMsg(from, withoutPhone, false, wa_message_id); await delay(700); }
        await sendContactCard(from, ASESOR_PHONE, ASESOR_DISPLAY_NAME);
      } else {
        // TikTok links — send separately with preview
        const tiktokMatch = cleanedAi.match(/https?:\/\/(?:vt\.tiktok\.com|tiktok\.com)\/\S+/i);
        if (tiktokMatch) {
          const textWithout = cleanedAi.replace(tiktokMatch[0], '').trim();
          if (textWithout) { await sendMsg(from, textWithout, false, wa_message_id); await delay(500); }
          await sendMsg(from, tiktokMatch[0], true, wa_message_id);
        } else {
          const hasUrl = /https?:\/\//.test(cleanedAi);
          if (cleanedAi.trim()) {
            await sendMsg(from, cleanedAi, hasUrl, wa_message_id);
          }
        }
      }
    } else {
      // ── All immediate attempts failed — persist for cron retry ───────────────
      console.warn(`🚨 [${from}] Fallo total de IA. Guardando en cola de reintento...`);
      try {
        if (db) {
          await db.from('mensajes_pendientes_ia').insert({
            from_number: from,
            message_body: messageBody,
            wa_message_id: wa_message_id,
            wa_profile_name: waProfileName || null,
            inserted_timestamp: new Date().toISOString(),
            intentos: 0,
            status: 'pending',
            sede_id: DEFAULT_SEDE_ID
          });
          console.log(`💾 [${from}] Mensaje guardado en cola pendiente para reintento por cron.`);
        }
      } catch (dbErr) {
        console.error('❌ Error guardando mensaje pendiente en DB:', dbErr);
      }
    }

    // Marcar como completado si llegamos hasta aquí con éxito
    if (db && pendingId) {
      await db.from('mensajes_pendientes_ia').update({ status: 'completed' }).eq('id', pendingId).eq('sede_id', DEFAULT_SEDE_ID);
    }

    await updateConversation(db, from, messageBody, ctx.memoria, r?.clientId);
  } catch (e: any) {
    console.error('❌ Webhook error in processCoreLogic:', e);
  }
}
