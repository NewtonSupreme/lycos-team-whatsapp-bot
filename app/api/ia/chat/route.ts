import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

function getVzlaDateTime(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

// ─── Load Full DB Context ──────────────────────────────────────────────────────
async function loadDbContext(): Promise<string> {
  const db = getDb();
  if (!db) return '[BASE DE DATOS NO DISPONIBLE]';
  const sections: string[] = [];

  try {
    const { data } = await db
      .from('clientes')
      .select('id, nombre, apellido, telefono, email, cedula, direccion')
      .order('nombre');
    if (data?.length) {
      sections.push(
        `CLIENTES (${data.length}):\n` +
        data.map(c =>
          `  • ID:${c.id} | ${c.nombre} ${c.apellido} | Tel: ${c.telefono} | Email: ${c.email || '-'} | CI: ${c.cedula || '-'} | Dir: ${c.direccion || '-'}`
        ).join('\n')
      );
    } else sections.push('CLIENTES: Sin registros.');
  } catch (e) { sections.push(`CLIENTES: Error - ${e}`); }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await db.from('vehiculos').select('id, marca, modelo, anio, placa, color, kilometraje, estado, clientes(nombre, apellido, telefono)').order('marca') as any;
    if (data?.length) {
      sections.push(
        `VEHÍCULOS (${data.length}):\n` +
        data.map((v: Record<string, any>) =>
          `  • ID:${v.id} | ${v.marca} ${v.modelo} ${v.anio} | Placa:${v.placa} | Estado:${v.estado} | Dueño: ${v.clientes?.nombre || '-'} ${v.clientes?.apellido || ''} Tel:${v.clientes?.telefono || '-'}`
        ).join('\n')
      );
    } else sections.push('VEHÍCULOS: Sin registros.');
  } catch (e) { sections.push(`VEHÍCULOS: Error - ${e}`); }

  try {
    const { data } = await db.from('citas')
      .select('id, fecha, hora, telefono, tipo_servicio, descripcion, estado, clientes(nombre, apellido), vehiculos(marca, modelo)')
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .limit(40) as any;
    if (data?.length) {
      sections.push(
        `CITAS (${data.length}):\n` +
        data.map((c: Record<string, any>) =>
          `  • ID:${c.id} | ${c.fecha} ${c.hora} | ${c.estado.toUpperCase()} | Cliente: ${c.clientes?.nombre || '-'} ${c.clientes?.apellido || ''} | Tel:${c.telefono || '-'} | Servicio: ${c.descripcion || c.tipo_servicio}`
        ).join('\n')
      );
    } else sections.push('CITAS: Sin citas.');
  } catch (e) { sections.push(`CITAS: Error - ${e}`); }

  try {
    const { data } = await db.from('servicios')
      .select('id, tipo, descripcion, estado, costo_estimado, costo_final, fecha_inicio, fecha_fin, vehiculos(marca, modelo, placa, clientes(nombre, apellido))')
      .order('created_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .limit(25) as any;
    if (data?.length) {
      sections.push(
        `SERVICIOS/ÓRDENES (${data.length}):\n` +
        data.map((s: Record<string, any>) =>
          `  • ID:${s.id} | ${s.estado} | ${s.tipo} - ${s.descripcion} | Vehículo: ${s.vehiculos?.marca || '-'} ${s.vehiculos?.modelo || ''} (${s.vehiculos?.placa || ''}) | Cliente: ${s.vehiculos?.clientes?.nombre || '-'} | Costo: $${s.costo_final ?? s.costo_estimado ?? '-'}`
        ).join('\n')
      );
    } else sections.push('SERVICIOS: Sin órdenes.');
  } catch (e) { sections.push(`SERVICIOS: Error - ${e}`); }

  try {
    const { data } = await db.from('inventario')
      .select('id, nombre, codigo, categoria, marca, precio_usd, precio_bs, stock, stock_minimo, unidad, notas')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('activo', true).order('categoria').order('nombre') as any;
    if (data?.length) {
      sections.push(
        `INVENTARIO (${data.length} productos):\n` +
        data.map((i: Record<string, any>) =>
          `  • ID:${i.id} | [${i.categoria}] ${i.nombre}${i.codigo ? ' (' + i.codigo + ')' : ''} | Stock: ${i.stock}${i.stock_minimo ? ' mín:' + i.stock_minimo : ''} | $${i.precio_usd ?? '-'} | ${i.unidad || ''}`
        ).join('\n')
      );
    } else sections.push('INVENTARIO: Sin productos activos.');
  } catch (e) { sections.push(`INVENTARIO: Error - ${e}`); }

  return sections.join('\n\n');
}

// ─── Execute Write Action Tags ─────────────────────────────────────────────────
// AI embeds [ACTION: tipo | k=v | k=v] at end of response for write operations
async function executeActions(text: string): Promise<{ clean: string; results: string[] }> {
  const db = getDb();
  const results: string[] = [];
  let clean = text;

  for (const match of [...text.matchAll(/\[ACTION:\s*([^\]]+)\]/g)]) {
    clean = clean.replace(match[0], '').trim();
    if (!db) continue;
    const parts = match[1].split('|').map(s => s.trim());
    const tipo = parts[0];
    const p: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
      const idx = parts[i].indexOf('=');
      if (idx > 0) p[parts[i].slice(0, idx).trim()] = parts[i].slice(idx + 1).trim();
    }
    try {
      if (tipo === 'crear_cita') {
        await db.from('citas').insert({
          fecha: p.fecha, hora: p.hora || '09:00', telefono: p.telefono || '',
          descripcion: p.descripcion || 'Cita por asistente IA',
          tipo_servicio: p.tipo_servicio || 'otro', estado: 'pendiente', duracion_minutos: 60,
        });
        results.push(`✅ Cita creada: ${p.fecha} ${p.hora || '09:00'}`);
      } else if (tipo === 'actualizar_estado_cita') {
        await db.from('citas').update({ estado: p.estado }).eq('id', p.id);
        results.push(`✅ Cita ${p.id} → estado: ${p.estado}`);
      } else if (tipo === 'actualizar_stock') {
        const { data } = await db.from('inventario')
          .update({ stock: Number(p.stock), updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Stock de "${data?.nombre}" actualizado a ${p.stock}`);
      } else if (tipo === 'desactivar_producto') {
        const { data } = await db.from('inventario')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Producto "${data?.nombre}" eliminado del inventario`);
      } else if (tipo === 'crear_cliente') {
        await db.from('clientes').insert({
          nombre: p.nombre, apellido: p.apellido || '', telefono: p.telefono || '',
          email: p.email || '', cedula: p.cedula || '', updated_at: new Date().toISOString(),
        });
        results.push(`✅ Cliente "${p.nombre} ${p.apellido}" registrado`);
      } else if (tipo === 'actualizar_servicio') {
        await db.from('servicios').update({ estado: p.estado, updated_at: new Date().toISOString() }).eq('id', p.id);
        results.push(`✅ Servicio ${p.id} → estado: ${p.estado}`);
      }
    } catch (e) { results.push(`❌ Error en ${tipo}: ${e}`); }
  }
  return { clean: clean.trim(), results };
}

// ─── POST Handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    // Load all real-time DB data and inject as context
    const dbContext = await loadDbContext();
    const finalSystemPrompt = systemPrompt || buildSystemPrompt(dbContext);

    const geminiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: finalSystemPrompt }] },
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1500,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      }
    );

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('[IA] Gemini error:', apiResponse.status, errText.slice(0, 400));
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    const data = await apiResponse.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return NextResponse.json({ response: 'No pude procesar eso. Llama al +58 412-334-3519.' });
    }

    const { clean, results } = await executeActions(rawText);
    const finalResponse = results.length > 0 ? `${clean}\n\n${results.join('\n')}` : clean;

    return NextResponse.json({ response: finalResponse });
  } catch (error) {
    console.error('[IA] Error:', error);
    return NextResponse.json({ response: generateFallbackResponse('') }, { status: 200 });
  }
}

// ─── Build System Prompt with Live DB Data ─────────────────────────────────────
function buildSystemPrompt(dbContext: string): string {
  return `IDENTIDAD:
Eres el asistente virtual INTERNO con permisos de administrador de Lycos Team, taller automotriz profesional en San Antonio de los Altos, Miranda, Venezuela.
Tienes acceso TOTAL en tiempo real a TODA la base de datos: clientes, vehículos, citas, servicios e inventario.
NUNCA digas que eres IA, GPT o robot. Eres el asistente del taller con acceso completo.

CAPACIDADES DE ADMINISTRADOR:
1. VER cualquier dato: clientes, teléfonos, vehículos, citas, órdenes, inventario, stock.
2. CREAR: citas, clientes, registros.
3. ACTUALIZAR: estados de citas, servicios, stock de inventario.
4. ELIMINAR: productos del inventario.

ACCIONES DE ESCRITURA — para ejecutar cambios en tiempo real, incluye EXACTAMENTE al final de tu respuesta (el sistema las procesa y no las ve el usuario final):
- Crear cita: [ACTION: crear_cita | fecha=AAAA-MM-DD | hora=HH:MM | telefono=NUMERO | descripcion=SERVICIO | tipo_servicio=mecanica]
- Confirmar/cancelar cita: [ACTION: actualizar_estado_cita | id=ID | estado=confirmada]
- Actualizar stock: [ACTION: actualizar_stock | id=ID_PRODUCTO | stock=NUMERO]
- Eliminar producto: [ACTION: desactivar_producto | id=ID_PRODUCTO]
- Crear cliente: [ACTION: crear_cliente | nombre=NOMBRE | apellido=APELLIDO | telefono=TEL | email=EMAIL | cedula=CI]
- Actualizar servicio: [ACTION: actualizar_servicio | id=ID | estado=finalizado]

COMPORTAMIENTO:
- Responde usando EXCLUSIVAMENTE los datos reales que tienes abajo. No inventes datos.
- Si te piden lista de clientes/citas/inventario, muéstrala usando los datos de abajo.
- Para acciones de escritura, confirma los parámetros con el usuario si falta alguno y luego ejecuta.
- Español venezolano amigable. Emojis moderados: 🔧 🚗 📅 💰 ✅.
- Si el admin modifica algo, confirma con los datos reales del resultado.

HORARIO: L–Sáb 8AM–5PM. Dom: Cerrado. | +58 412-334-3519 | lycosteam7@gmail.com
FECHA/HORA VENEZUELA: ${getVzlaDateTime()}

SERVICIOS/PRECIOS: Silenciadores $40–$140 | Amortiguadores $40 | Alineación $15–$25 | Balanceo $5–$10/u | Elevavidrios $40 | OBD I $20 | Catalizador limpieza $30 | Lavado $5–$100

━━━━━━━━━━ BASE DE DATOS EN TIEMPO REAL ━━━━━━━━━━
${dbContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── Fallback (sin API key) ────────────────────────────────────────────────────
function generateFallbackResponse(userMsg: string): string {
  const lower = userMsg.toLowerCase();
  if (lower.includes('horario')) return '⏰ Lunes a Sábado: 8:00 AM – 5:00 PM. Domingos: Cerrado.';
  if (lower.includes('cita') || lower.includes('agendar')) return '📅 Para agendar llama: +58 412-334-3519.';
  if (lower.includes('ubicacion') || lower.includes('donde')) return '📍 San Antonio de los Altos, Miranda.';
  return '🔧 Soy el asistente de Lycos Team. ¿En qué puedo ayudarte?\n📞 +58 412-334-3519';
}
