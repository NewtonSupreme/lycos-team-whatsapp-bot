import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Venezuela time
const vzlaTime = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'America/Caracas',
  dateStyle: 'full',
  timeStyle: 'short'
}).format(new Date());

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
IDENTIDAD:
Eres el asistente virtual interno de Lycos Team, taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
Tienes acceso TOTAL a la base de datos del taller: clientes, vehículos, citas, servicios e inventario.
NUNCA digas que eres IA, bot, ChatGPT o robot. Si preguntan, di que eres el asistente del taller.

COMPORTAMIENTO Y TONO:
- Español venezolano, amigable, profesional. Varía tus respuestas para no ser repetitivo.
- Usa emojis moderadamente: 🔧 🚗 💰 📅 😊.
- Cuando el usuario pida información, usa tus herramientas para obtener datos REALES de la base de datos.
- Cuando puedas hacer una acción (crear cita, actualizar stock, etc.), hazla directamente con las herramientas.
- Confirma siempre las acciones realizadas con los datos que devolvieron las herramientas.
- Si necesitas más información para ejecutar una acción, pregúntala primero.

HORARIO: Lunes a Sábado 8:00 AM – 5:00 PM. DOMINGOS: CERRADO sin excepciones.
UBICACION: San Antonio de los Altos, Altos Mirandinos, Miranda.
LINK MAPS: https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA
CONTACTO ASESOR: +58 412-334-3519 | lycosteam7@gmail.com

SERVICIOS Y PRECIOS:
SILENCIADORES Y ESCAPE — Fabricación propia, redondos, lámina galvanizada gruesa. PROMOCIÓN EN DIVISAS:
- CL27/CL30: hasta 1.3L → $40 | CL40: 1.5L → $50 | CLH40: 2.0L → $60
- CL60: desde 3.8L → $90 | CLC60/CLCP60/CLP60: camión/platanero → $90
- CLK60: $100 (Kia Sportage, Hyundai Tucson, Dodge Caliber) | Resonador: $40
- Flowmaster Serie 40: $140 | Flexibles doble malla: $40
- Tubo: Primer metro $35, metros adicionales $20, soldadura $15, gomas $7
- Colas cromadas: B55 $25, Camioneta $35, Curba $30
MECANICA: Terminal dirección $15/lado | Rótula $20/lado | Amortiguador $40 (PROMO EN DIVISAS)
CATALIZADOR: Limpieza $30 | Reemplazar: requiere visita física
ALINEACION (BCV): Carros $15 | EcoSport $20 | 4x4 $25
CAUCHOS/BALANCEO (BCV): Balanceo carros $5/u, camionetas $10/u | Monturas carros $5/u, camionetas $10/u
AUTOLAVADO (BCV): Lavadito $5-$13 | Lavado completo $10-$15 | Detailing $60-$100
ELECTRONICA: Elevavidrios $40 | Display Ford Fiesta $60/u | OBD I $20 | OBD II: según cita
CASHEA: IVA 16% sobre total. Nivel 1: 60% ini | Nivel 2: 50% | Niveles 3-6: 40%. Resto en 3 cuotas c/14 días.
Certificado Médico: $15. RCV: requiere asesor humano.

FECHA/HORA VENEZUELA: ${vzlaTime}
`;

// ─── Tool Definitions (Gemini Function Calling) ────────────────────────────────
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_clientes',
        description: 'Obtiene la lista de todos los clientes registrados en el taller con sus vehículos, teléfonos y datos de contacto.',
        parameters: {
          type: 'OBJECT',
          properties: {
            buscar: {
              type: 'STRING',
              description: 'Opcional. Nombre, apellido o teléfono del cliente a buscar. Si no se proporciona, devuelve todos.',
            },
          },
        },
      },
      {
        name: 'get_citas',
        description: 'Obtiene todas las citas agendadas en el taller.',
        parameters: {
          type: 'OBJECT',
          properties: {
            fecha: {
              type: 'STRING',
              description: 'Opcional. Fecha en formato AAAA-MM-DD para filtrar citas de ese día.',
            },
            estado: {
              type: 'STRING',
              description: 'Opcional. Estado de las citas: pendiente, confirmada, cancelada, completada.',
            },
          },
        },
      },
      {
        name: 'crear_cita',
        description: 'Crea (agenda) una nueva cita en el sistema.',
        parameters: {
          type: 'OBJECT',
          properties: {
            fecha: { type: 'STRING', description: 'Fecha de la cita en formato AAAA-MM-DD.' },
            hora: { type: 'STRING', description: 'Hora de la cita en formato HH:MM (24h).' },
            telefono: { type: 'STRING', description: 'Teléfono del cliente.' },
            descripcion: { type: 'STRING', description: 'Descripción del servicio o motivo de la cita.' },
            tipo_servicio: {
              type: 'STRING',
              description: 'Tipo de servicio: mecanica, electronica, cerrajeria, diagnostico, motor, emergencia, otro.',
            },
          },
          required: ['fecha', 'hora', 'telefono', 'descripcion'],
        },
      },
      {
        name: 'actualizar_cita',
        description: 'Actualiza el estado o datos de una cita existente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'ID de la cita a actualizar.' },
            estado: { type: 'STRING', description: 'Nuevo estado: pendiente, confirmada, cancelada, completada.' },
            hora: { type: 'STRING', description: 'Nueva hora en formato HH:MM.' },
            descripcion: { type: 'STRING', description: 'Nueva descripción.' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_vehiculos',
        description: 'Obtiene todos los vehículos registrados, opcionalmente filtrados por cliente.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cliente_id: { type: 'STRING', description: 'Opcional. ID del cliente para filtrar sus vehículos.' },
          },
        },
      },
      {
        name: 'get_servicios',
        description: 'Obtiene los servicios/órdenes de trabajo registradas en el taller.',
        parameters: {
          type: 'OBJECT',
          properties: {
            estado: {
              type: 'STRING',
              description: 'Opcional. Estado: pendiente, en_proceso, finalizado, cancelado.',
            },
          },
        },
      },
      {
        name: 'get_inventario',
        description: 'Obtiene el inventario de productos del taller con stock actual.',
        parameters: {
          type: 'OBJECT',
          properties: {
            categoria: {
              type: 'STRING',
              description: 'Opcional. Categoría del producto: filtros, liquidos, repuestos, etc.',
            },
          },
        },
      },
      {
        name: 'actualizar_stock',
        description: 'Actualiza el stock de un producto del inventario.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'ID del producto en inventario.' },
            stock: { type: 'NUMBER', description: 'Nuevo valor de stock.' },
          },
          required: ['id', 'stock'],
        },
      },
      {
        name: 'eliminar_producto_inventario',
        description: 'Marca un producto del inventario como inactivo (lo elimina del stock activo).',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'ID del producto a eliminar/desactivar.' },
          },
          required: ['id'],
        },
      },
    ],
  },
];

// ─── Tool Executor ─────────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const db = getDb();
  if (!db) return JSON.stringify({ error: 'Base de datos no disponible' });

  try {
    switch (name) {
      case 'get_clientes': {
        let query = db.from('clientes').select('id, nombre, apellido, telefono, email, cedula, direccion, notas, vehiculos(id, marca, modelo, anio, placa, estado)').order('nombre');
        const buscar = args.buscar as string | undefined;
        if (buscar) {
          query = query.or(`nombre.ilike.%${buscar}%,apellido.ilike.%${buscar}%,telefono.ilike.%${buscar}%`);
        }
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ total: data?.length ?? 0, clientes: data });
      }

      case 'get_citas': {
        let query = db.from('citas')
          .select('id, fecha, hora, telefono, tipo_servicio, descripcion, estado, duracion_minutos, cliente:clientes(nombre, apellido, telefono), vehiculo:vehiculos(marca, modelo, placa)')
          .order('fecha', { ascending: true })
          .order('hora', { ascending: true });
        if (args.fecha) query = query.eq('fecha', args.fecha as string);
        if (args.estado) query = query.eq('estado', args.estado as string);
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ total: data?.length ?? 0, citas: data });
      }

      case 'crear_cita': {
        const { data, error } = await db.from('citas').insert({
          fecha: args.fecha,
          hora: args.hora,
          telefono: args.telefono,
          descripcion: args.descripcion,
          tipo_servicio: args.tipo_servicio || 'otro',
          estado: 'pendiente',
          duracion_minutos: 60,
        }).select().single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, cita: data });
      }

      case 'actualizar_cita': {
        const updates: Record<string, unknown> = {};
        if (args.estado) updates.estado = args.estado;
        if (args.hora) updates.hora = args.hora;
        if (args.descripcion) updates.descripcion = args.descripcion;
        const { data, error } = await db.from('citas').update(updates).eq('id', args.id as string).select().single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, cita: data });
      }

      case 'get_vehiculos': {
        let query = db.from('vehiculos')
          .select('id, marca, modelo, anio, placa, color, kilometraje, estado, clientes(id, nombre, apellido, telefono)')
          .order('marca');
        if (args.cliente_id) query = query.eq('cliente_id', args.cliente_id as string);
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ total: data?.length ?? 0, vehiculos: data });
      }

      case 'get_servicios': {
        let query = db.from('servicios')
          .select('id, tipo, descripcion, estado, costo_estimado, costo_final, fecha_inicio, fecha_fin, notas, vehiculos(marca, modelo, placa, clientes(nombre, apellido, telefono))')
          .order('created_at', { ascending: false });
        if (args.estado) query = query.eq('estado', args.estado as string);
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ total: data?.length ?? 0, servicios: data });
      }

      case 'get_inventario': {
        let query = db.from('inventario').select('id, nombre, codigo, categoria, marca, precio_usd, precio_bs, stock, stock_minimo, unidad, notas, activo').eq('activo', true).order('categoria').order('nombre');
        if (args.categoria) query = query.eq('categoria', args.categoria as string);
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ total: data?.length ?? 0, inventario: data });
      }

      case 'actualizar_stock': {
        const { data, error } = await db.from('inventario')
          .update({ stock: args.stock, updated_at: new Date().toISOString() })
          .eq('id', args.id as string).select().single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, producto: data });
      }

      case 'eliminar_producto_inventario': {
        const { data, error } = await db.from('inventario')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', args.id as string).select('id, nombre').single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, eliminado: data });
      }

      default:
        return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

// ─── POST handler (agentic loop) ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    // Format messages for Gemini
    const geminiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Agentic loop: up to 5 tool-call rounds
    let contents = [...geminiMessages];
    let finalText = '';

    for (let round = 0; round < 5; round++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt || SYSTEM_PROMPT }] },
            contents,
            tools: TOOLS,
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini API error:', errText);
        return NextResponse.json({
          response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
        });
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate) break;

      const parts = candidate.content?.parts ?? [];

      // Check if AI wants to call a function
      const toolCallParts = parts.filter((p: { functionCall?: unknown }) => p.functionCall);
      const textParts = parts.filter((p: { text?: string }) => p.text);

      if (toolCallParts.length > 0) {
        // Add AI's message with tool calls to context
        contents.push({ role: 'model', parts });

        // Execute all requested tool calls
        const toolResultParts = await Promise.all(
          toolCallParts.map(async (p: { functionCall: { name: string; args: Record<string, unknown> } }) => {
            const result = await executeTool(p.functionCall.name, p.functionCall.args || {});
            console.log(`🛠️ Tool: ${p.functionCall.name} →`, result.substring(0, 120));
            return {
              functionResponse: {
                name: p.functionCall.name,
                response: { result },
              },
            };
          })
        );

        // Add tool results back to context for next round
        contents.push({ role: 'user', parts: toolResultParts });
        continue; // next round
      }

      // No tool calls → we have the final text response
      finalText = textParts.map((p: { text?: string }) => p.text || '').join('');
      break;
    }

    if (!finalText) {
      return NextResponse.json({
        response: 'Lo siento, no pude procesar tu consulta. Por favor contacta al taller: +58 412-334-3519.',
      });
    }

    return NextResponse.json({ response: finalText });
  } catch (error) {
    console.error('IA chat error:', error);
    return NextResponse.json({ response: generateFallbackResponse('') }, { status: 200 });
  }
}

// ─── Fallback (no API key) ─────────────────────────────────────────────────────
function generateFallbackResponse(userMsg: string): string {
  const lower = userMsg.toLowerCase();
  if (lower.includes('horario') || lower.includes('hora')) return '⏰ Lunes a Sábado: 8:00 AM – 5:00 PM. Domingos: Cerrado.';
  if (lower.includes('cita') || lower.includes('agendar')) return '📅 Para agendar llama: +58 412-334-3519 o escríbenos por WhatsApp.';
  if (lower.includes('ubicacion') || lower.includes('donde')) return '📍 San Antonio de los Altos, Miranda. https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA';
  return '¡Hola! Soy el asistente de Lycos Team 🔧 ¿En qué puedo ayudarte?\n📞 +58 412-334-3519';
}
