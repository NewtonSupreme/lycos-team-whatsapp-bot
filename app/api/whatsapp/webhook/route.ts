import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lycos_webhook_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LYCOS_ADVISOR_PHONE = '584123343519'; // +58 412-334-3519

function getDB(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateCliente(db: SupabaseClient, telefono: string) {
  // Normalize: remove non-digits
  const tel = telefono.replace(/\D/g, '');
  const { data } = await db.from('clientes').select('*').ilike('telefono', `%${tel}`).limit(1);
  if (data && data.length > 0) return data[0];
  // Create a placeholder client (name will be updated when bot learns it)
  const { data: created } = await db.from('clientes').insert({
    nombre: 'Cliente',
    apellido: 'WhatsApp',
    telefono: `+${tel}`,
  }).select().single();
  return created;
}

async function getClienteVehiculos(db: SupabaseClient, clienteId: string) {
  const { data } = await db.from('vehiculos').select('*').eq('cliente_id', clienteId);
  return data || [];
}

async function getClienteCitas(db: SupabaseClient, clienteId: string) {
  const { data } = await db
    .from('citas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: true });
  return data || [];
}

async function getRecentMessages(db: SupabaseClient, telefono: string, limit = 14) {
  const tel = telefono.replace(/\D/g, '');
  const { data } = await db
    .from('mensajes_whatsapp')
    .select('body, tipo, created_at')
    .or(`from_number.ilike.%${tel},to_number.ilike.%${tel}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

async function checkCitaAvailability(
  db: SupabaseClient,
  fecha: string,
  hora: string,
  duracionMin = 60
): Promise<{ available: boolean; conflicto?: string }> {
  // Convert requested slot to timestamps for conflict window
  const requestedStart = new Date(`${fecha}T${hora}`);
  const requestedEnd = new Date(requestedStart.getTime() + duracionMin * 60000);

  const { data: citas } = await db
    .from('citas')
    .select('fecha, hora, duracion_minutos, descripcion')
    .eq('fecha', fecha)
    .neq('estado', 'cancelada');

  if (!citas || citas.length === 0) return { available: true };

  for (const cita of citas) {
    const existingStart = new Date(`${cita.fecha}T${cita.hora}`);
    const existingDuration = cita.duracion_minutos || 60;
    const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000);

    // Check overlap: new start < existing end AND new end > existing start
    if (requestedStart < existingEnd && requestedEnd > existingStart) {
      return {
        available: false,
        conflicto: `Hay una cita ocupando ese horario desde las ${cita.hora.slice(0, 5)}`
      };
    }
  }

  return { available: true };
}

async function getNextAvailableSlots(db: SupabaseClient, fecha: string): Promise<string[]> {
  const { data: citas } = await db
    .from('citas')
    .select('hora, duracion_minutos')
    .eq('fecha', fecha)
    .neq('estado', 'cancelada')
    .order('hora', { ascending: true });

  const slots: string[] = [];
  const workStart = 8 * 60; // 8:00 AM in minutes
  const workEnd = 17 * 60;   // 5:00 PM

  const busySlots = (citas || []).map(c => {
    const [h, m] = c.hora.split(':').map(Number);
    const start = h * 60 + m;
    const end = start + (c.duracion_minutos || 60);
    return { start, end };
  });

  for (let t = workStart; t < workEnd; t += 60) {
    const end = t + 60;
    const busy = busySlots.some(b => t < b.end && end > b.start);
    if (!busy) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots.slice(0, 4); // Return up to 4 available slots
}

async function createCita(
  db: SupabaseClient,
  clienteId: string,
  vehiculoId: string,
  fecha: string,
  hora: string,
  tipoServicio: string,
  descripcion: string,
  duracionMin = 60
) {
  const { data } = await db.from('citas').insert({
    cliente_id: clienteId,
    vehiculo_id: vehiculoId,
    fecha,
    hora,
    tipo_servicio: tipoServicio,
    descripcion,
    duracion_minutos: duracionMin,
    estado: 'pendiente',
  }).select().single();
  return data;
}

async function getInventarioByCategoria(db: SupabaseClient, categoria?: string) {
  let query = db.from('inventario').select('*').eq('activo', true);
  if (categoria) query = query.eq('categoria', categoria);
  const { data } = await query;
  return data || [];
}

async function getSilenciadorForVehiculo(db: SupabaseClient, cilindraje: number) {
  const { data } = await db
    .from('inventario')
    .select('*')
    .eq('categoria', 'silenciador')
    .lte('cilindraje_min', cilindraje)
    .gte('cilindraje_max', cilindraje)
    .eq('activo', true);
  return data || [];
}

async function updateClienteInfo(db: SupabaseClient, clienteId: string, updates: Record<string, string>) {
  if (!updates || Object.keys(updates).length === 0) return;
  await db.from('clientes').update(updates).eq('id', clienteId);
}

async function createOrUpdateVehiculo(
  db: SupabaseClient,
  clienteId: string,
  vehiculoData: { marca: string; modelo: string; anio: number; placa?: string }
) {
  // Check if this vehicle already exists for client
  const { data: existing } = await db
    .from('vehiculos')
    .select('id')
    .eq('cliente_id', clienteId)
    .ilike('modelo', vehiculoData.modelo)
    .limit(1);

  if (existing && existing.length > 0) return existing[0];

  const placa = vehiculoData.placa || `WA-${Date.now().toString(36).toUpperCase()}`;
  const { data } = await db.from('vehiculos').insert({
    cliente_id: clienteId,
    marca: vehiculoData.marca,
    modelo: vehiculoData.modelo,
    anio: vehiculoData.anio,
    placa: placa,
  }).select().single();
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// LYCOS TEAM KNOWLEDGE BASE
// ─────────────────────────────────────────────────────────────────────────────

const LYCOS_STATIC_KNOWLEDGE = `
IDENTIDAD:
Eres el asistente virtual de Lycos Team. NUNCA digas que eres IA, bot, ChatGPT o robot.
Si preguntan qué eres, di "soy el asistente de Lycos Team".
Si necesitas transferir a un asesor humano, di "voy a comunicarte con uno de nuestros asesores" y da: +58 412-334-3519

HORARIO: Lunes a Sábado, 8:00 AM a 5:00 PM. DOMINGOS: CERRADO. No hay emergencias dominicales.

UBICACIÓN: San Antonio de los Altos, Altos Mirandinos, Miranda, Venezuela.
Al dar ubicación, incluye SIEMPRE la invitación a seguir en Instagram @lycos.team.

REDES SOCIALES: Instagram: @lycos.team | TikTok: @lycos.team

SERVICIOS (por categoría):
🔧 Mecánica y Frenos: mecánica ligera, frenos completos (pastillas, liga, cilindros, freno de mano, rectificación de discos/tambores), alineación, balanceo, rotación, monturas/reparación de cauchos, limpieza de inyectores.
🚗 Sistemas: A/C, frenos, refrigeración, dirección, motor, luces, escape, suspensión, transmisión, autotronica.
🏎️ Escape y Silenciadores: precios en USD con instalación incluida (consulta el stock en tiempo real).
🚿 Estética: autolavado, pulitura de faros, latonería y pintura, papel ahumado, cámaras 360.
🔌 Electrónica: elevavidrios manuales/electrónicos. OBD II: escáner asignado según disponibilidad al confirmar cita.
🚛 Otros: grúa (contactar asesor), inventario de repuestos, renovación RCV.

💳 CASHEA: cobra IVA 16% adicional. PRIMERO pregunta el nivel:
  Nivel 1→60% inicial | Nivel 2→50% | Niveles 3-6→40%. Resto en 3 cuotas cada 14 días.
Para datos de pago: "te atendemos en caja o escríbenos al asesor".

📅 CITAS: solicitar siempre: nombre, vehículo (marca/modelo/año), servicio, fecha y hora (L-S 8AM-5PM).
IMPORTANTE: Antes de confirmar una cita, el sistema verificará disponibilidad automáticamente.

COMPORTAMIENTO:
- Español venezolano, cálido y profesional.
- Máximo 4-5 líneas por respuesta, usa emojis con moderación.
- Presupuestos de silenciadores válidos 2 días. No improvises precios.
- Si no sabes algo, di "déjame consultarlo" y da el número del asesor.
- Un cliente puede tener MÚLTIPLES vehículos. Siempre pregunta "¿para cuál vehículo?"
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET: Webhook verification
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// POST: Receive messages
// ─────────────────────────────────────────────────────────────────────────────

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
      const from = message.from;
      const wa_message_id = message.id;

      const db = getDB();

      // 0. Deduplication
      if (db && wa_message_id) {
        try {
          const { data: rows } = await db
            .from('mensajes_whatsapp').select('id').eq('wa_message_id', wa_message_id).limit(1);
          if (rows && rows.length > 0) {
            console.log(`⏭️ Duplicado (${wa_message_id}), ignorando.`);
            continue;
          }
        } catch { /* continue even if dedup fails */ }
      }

      // 1. Parse message
      let messageBody = '';
      if (message.type === 'text') messageBody = message.text?.body || '';
      else if (message.type === 'image') messageBody = '[El cliente envió una imagen]';
      else if (message.type === 'audio') messageBody = '[El cliente envió un audio]';
      else if (message.type === 'document') messageBody = '[El cliente envió un documento]';
      else if (message.type === 'location') {
        messageBody = `[El cliente compartió su ubicación: lat ${message.location?.latitude}, lng ${message.location?.longitude}]`;
      }

      if (!messageBody) continue;
      console.log(`📩 De ${from}: ${messageBody.substring(0, 80)}`);

      // 2. Save incoming message (non-blocking)
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

      // 3. Load client context from DB
      let clienteId: string | null = null;
      let clienteNombre = '';
      let vehiculosInfo = '';
      let citasInfo = '';
      let inventarioContext = '';

      if (db) {
        try {
          const cliente = await getOrCreateCliente(db, from);
          if (cliente) {
            clienteId = cliente.id;
            clienteNombre = `${cliente.nombre} ${cliente.apellido}`.trim();
            if (clienteNombre === 'Cliente WhatsApp') clienteNombre = '';

            const vehiculos = await getClienteVehiculos(db, cliente.id);
            if (vehiculos.length > 0) {
              vehiculosInfo = `VEHÍCULOS REGISTRADOS DEL CLIENTE:\n${vehiculos.map(
                (v: { marca: string; modelo: string; anio: number; placa: string }, i: number) => `  ${i + 1}. ${v.marca} ${v.modelo} ${v.anio} (Placa: ${v.placa})`
              ).join('\n')}`;
            }

            const citas = await getClienteCitas(db, cliente.id);
            const now = new Date();
            const vzNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));

            if (citas.length > 0) {
              const futureCitas = citas.filter((c: { fecha: string }) => new Date(c.fecha) >= vzNow);
              const pastCitas = citas.filter((c: { fecha: string }) => new Date(c.fecha) < vzNow);
              citasInfo = 'HISTORIAL DE CITAS:';
              if (pastCitas.length > 0) {
                citasInfo += `\n  ANTERIORES: ${pastCitas.slice(-3).map(
                  (c: { fecha: string; hora: string; descripcion: string; estado: string }) => `${c.fecha} ${c.hora} - ${c.descripcion} [${c.estado}]`
                ).join(' | ')}`;
              }
              if (futureCitas.length > 0) {
                citasInfo += `\n  PRÓXIMAS: ${futureCitas.slice(0, 3).map(
                  (c: { fecha: string; hora: string; descripcion: string; estado: string }) => `${c.fecha} ${c.hora} - ${c.descripcion} [${c.estado}]`
                ).join(' | ')}`;
              }
            }
          }

          // Inventory context (always load silenciadores + general)
          const silenciadores = await getInventarioByCategoria(db, 'silenciador');
          if (silenciadores.length > 0) {
            inventarioContext = `INVENTARIO SILENCIADORES EN STOCK:\n${silenciadores.map(
              (s: { nombre: string; precio_usd: number; stock: number; cilindraje_min: number; cilindraje_max: number }) =>
                `  ${s.nombre}: $${s.precio_usd} | Stock: ${s.stock} unidades | Cilindraje: ${s.cilindraje_min}-${s.cilindraje_max}L`
            ).join('\n')}`;
          }
        } catch (e) {
          console.error('Error cargando contexto del cliente:', e);
        }
      }

      // 4. Load recent conversation history
      let conversationHistory: { role: string; parts: { text: string }[] }[] = [];
      if (db) {
        try {
          const msgs = await getRecentMessages(db, from, 14);
          conversationHistory = msgs
            .filter(m => m.body !== messageBody)
            .slice(-12)
            .map(m => ({
              role: m.tipo === 'entrante' ? 'user' : 'model',
              parts: [{ text: m.body }],
            }));
          console.log(`🧠 Historial: ${conversationHistory.length} mensajes`);
        } catch (e) { console.error('Error cargando historial:', e); }
      }

      // 5. Session freshness
      let isNewSession = true;
      if (db) {
        try {
          const { data: convRows } = await db
            .from('conversaciones').select('ultimo_mensaje_at').eq('telefono', from).limit(1);
          if (convRows?.[0]?.ultimo_mensaje_at) {
            const hrs = (Date.now() - new Date(convRows[0].ultimo_mensaje_at).getTime()) / 3600000;
            if (hrs < 12) isNewSession = false;
          }
        } catch { /* ok */ }
      }

      // 6. Location request detection
      const lower = messageBody.toLowerCase();
      const isLocationReq = ['ubicacion', 'ubicación', 'donde', 'dirección', 'llegar', 'gps', 'mapa', 'ubicado'].some(k => lower.includes(k));
      const isContactReq = ['numero', 'número', 'contacto', 'asesor', 'whatsapp', 'llamar', 'teléfono', 'telefono', 'comunicar'].some(k => lower.includes(k));

      if (isLocationReq) {
        await sendText(from, '📍 *Estamos en San Antonio de los Altos, Miranda.*\nTe mando el mapa y cómo llegar 👇');
        await delay(600);
        await sendText(from, 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', true);
        await delay(500);
        await sendText(from, 'https://www.instagram.com/reel/DUnhlwXkWSb/?igsh=MXJlNHducnBhN2piNg==', true);
        await delay(400);
        await sendText(from, '¡Y síguenos en Instagram @lycos.team para tips y novedades! 📸');
      } else if (isContactReq) {
        // Send WhatsApp contact card for advisor
        await sendContactCard(from);
        await delay(500);
        await sendText(from, 'Te envié el contacto de nuestro asesor. También puedes escribir directamente a ese número por WhatsApp 📲');
      } else {
        // 7. Build full AI prompt with all context
        const vzlaTime = new Intl.DateTimeFormat('es-VE', {
          timeZone: 'America/Caracas', dateStyle: 'full', timeStyle: 'short'
        }).format(new Date());

        const clienteContext = [
          clienteNombre ? `NOMBRE CONOCIDO DEL CLIENTE: ${clienteNombre}` : 'CLIENTE: nombre desconocido aún',
          vehiculosInfo || 'VEHÍCULOS: ninguno registrado aún',
          citasInfo || 'CITAS: ninguna registrada',
          inventarioContext,
        ].filter(Boolean).join('\n\n');

        const systemPrompt = `${LYCOS_STATIC_KNOWLEDGE}

=== DATOS EN TIEMPO REAL ===
FECHA/HORA EN VENEZUELA: ${vzlaTime}
SESIÓN: ${isNewSession ? 'NUEVA — puedes saludar brevemente' : 'CONTINUA — no repitas saludos, ve al tema'}
NÚMERO DE TELÉFONO DEL CLIENTE: ${from}

${clienteContext}

=== INSTRUCCIONES CRÍTICAS ===
1. Usa el nombre del cliente si lo conoces, sino pregúntalo naturalmente.
2. Si el cliente menciona un vehículo nuevo, úsalo en la respuesta. El sistema lo registrará.
3. Para AGENDAMIENTO DE CITAS: el sistema verificará disponibilidad. Si piden cita, confirma todos los datos primero.
4. El cliente puede tener más de un vehículo. Siempre pregunta "¿para cuál vehículo?" si no especifica.
5. Para silenciadores: verifica el stock mostrado arriba antes de confirmar disponibilidad.
6. Si el cliente pregunta si su cita ya pasó o está próxima, usa el historial de citas arriba.
7. Las citas del historial marcadas como futuras aún están pendientes. Infórmale con exactitud.
8. Para consultar número de contacto o asesor: el sistema ya le enviará una tarjeta de WhatsApp.
9. Siempre responde en español venezolano. Máximo 5 líneas.`;

        const contents = [
          ...conversationHistory,
          { role: 'user', parts: [{ text: messageBody }] }
        ];

        const aiResponse = await getAIResponse(systemPrompt, contents);

        if (aiResponse) {
          const hasUrl = /https?:\/\//.test(aiResponse);
          await sendText(from, aiResponse, hasUrl);

          // 8. Extract and save client data from conversation
          if (db && clienteId) {
            void (async () => {
              try {
                const extracted = extractStructuredData(messageBody);
                if (extracted.nombre && clienteNombre === '') {
                  await updateClienteInfo(db, clienteId!, { nombre: extracted.nombre.split(' ')[0], apellido: extracted.nombre.split(' ').slice(1).join(' ') || 'WA' });
                }
                if (extracted.vehiculo && clienteId) {
                  await createOrUpdateVehiculo(db, clienteId!, {
                    marca: extracted.vehiculo.marca,
                    modelo: extracted.vehiculo.modelo,
                    anio: extracted.vehiculo.anio || new Date().getFullYear(),
                  });
                }
              } catch (e) { console.error('Error guardando datos extraídos:', e); }
            })();
          }
        }
      }

      // 9. Update conversation state (non-blocking)
      if (db) {
        void (async () => {
          try {
            await db.from('conversaciones').upsert({
              telefono: from,
              cliente_id: clienteId,
              ultimo_mensaje: messageBody.substring(0, 100),
              ultimo_mensaje_at: new Date().toISOString(),
            }, { onConflict: 'telefono' });
          } catch (e) { console.error('Error actualizando conversación:', e); }
        })();
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI RESPONSE
// ─────────────────────────────────────────────────────────────────────────────

async function getAIResponse(
  systemPrompt: string,
  contents: { role: string; parts: { text: string }[] }[]
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.72, maxOutputTokens: 650, topK: 40, topP: 0.95 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );
    if (!res.ok) {
      console.error('❌ Gemini error:', res.status, await res.text().then(t => t.substring(0, 200)));
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error('❌ getAIResponse error:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP SENDERS
// ─────────────────────────────────────────────────────────────────────────────

async function sendText(to: string, text: string, previewUrl = false): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: to.replace(/\D/g, ''), type: 'text',
        text: { preview_url: previewUrl, body: text },
      }),
    });
    if (!res.ok) { console.error('❌ WA send error:', await res.json()); return; }
    const data = await res.json();
    const wa_id = data.messages?.[0]?.id;
    console.log(`✅ Mensaje enviado. ID: ${wa_id}`);

    // Save outgoing (non-blocking)
    const db = getDB();
    if (db) {
      void (async () => {
        try {
          await db.from('mensajes_whatsapp').insert({
            from_number: 'system', to_number: to,
            body: text, tipo: 'saliente', wa_message_id: wa_id, es_ia: true,
          });
        } catch (e) { console.error('Error guardando saliente:', e); }
      })();
    }
  } catch (e) { console.error('❌ sendText error:', e); }
}

async function sendContactCard(to: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return;
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual',
        to: to.replace(/\D/g, ''), type: 'contacts',
        contacts: [{
          name: { formatted_name: 'Lycos Team - Asesor', first_name: 'Lycos Team', last_name: 'Asesor' },
          org: { company: 'Lycos Team', department: 'Atención al Cliente' },
          phones: [{ phone: '+58 412-334-3519', type: 'WORK', wa_id: LYCOS_ADVISOR_PHONE }],
          urls: [{ url: 'https://www.instagram.com/lycos.team', type: 'WORK' }],
        }],
      }),
    });
    if (!res.ok) { console.error('❌ WA contact error:', await res.json()); }
    else console.log('✅ Tarjeta de contacto enviada');
  } catch (e) { console.error('❌ sendContactCard error:', e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA EXTRACTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function extractStructuredData(message: string) {
  const result: {
    nombre?: string;
    vehiculo?: { marca: string; modelo: string; anio: number };
  } = {};

  const nameMatch = message.match(/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]{1,30})/i);
  if (nameMatch) result.nombre = nameMatch[1].trim();

  // Detect common Venezuelan car brands + model
  const carMatch = message.match(/(?:tengo|mi carro es|mi carro|mi coche|mi vehículo es|mi vehiculo (?:es)?)\s+(?:un|una)?\s*([A-Za-z]+)\s+([A-Za-z0-9]+)/i);
  if (carMatch) {
    const yearMatch = message.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
    result.vehiculo = {
      marca: carMatch[1],
      modelo: carMatch[2],
      anio: yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear(),
    };
  }

  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Export for use by other API routes
export { checkCitaAvailability, getNextAvailableSlots, createCita };
