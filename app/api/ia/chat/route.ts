import { NextRequest, NextResponse } from 'next/server';
import {
  fetchClientes,
  fetchVehiculos,
  fetchCitas,
  fetchServicios,
  fetchInventario,
} from '@/lib/supabase';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

function getVzlaDateTime(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

// ─── Load Full DB Context using proven lib functions ───────────────────────────
async function loadDbContext(): Promise<string> {
  const sections: string[] = [];

  // Clientes
  try {
    const clientes = await fetchClientes();
    if (clientes && clientes.length > 0) {
      sections.push(
        `=== CLIENTES REGISTRADOS (${clientes.length}) ===\n` +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clientes.map((c: any) =>
          `• ID:${c.id} | ${c.nombre} ${c.apellido} | Teléfono: ${c.telefono} | Email: ${c.email || 'N/A'} | CI: ${c.cedula || 'N/A'} | Dirección: ${c.direccion || 'N/A'} | Vehículos: ${c.vehiculos?.length ?? 0}`
        ).join('\n')
      );
    } else {
      sections.push('=== CLIENTES: Sin registros ===');
    }
  } catch (e) {
    sections.push(`=== CLIENTES: Error al cargar (${e}) ===`);
  }

  // Vehículos
  try {
    const vehiculos = await fetchVehiculos();
    if (vehiculos && vehiculos.length > 0) {
      sections.push(
        `=== VEHÍCULOS REGISTRADOS (${vehiculos.length}) ===\n` +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vehiculos.map((v: any) =>
          `• ID:${v.id} | ${v.marca} ${v.modelo} ${v.anio} | Placa: ${v.placa} | Color: ${v.color || '-'} | KM: ${v.kilometraje || '-'} | Estado: ${v.estado} | Dueño: ${v.clientes?.nombre || '-'} ${v.clientes?.apellido || ''} | Tel dueño: ${v.clientes?.telefono || '-'}`
        ).join('\n')
      );
    } else {
      sections.push('=== VEHÍCULOS: Sin registros ===');
    }
  } catch (e) {
    sections.push(`=== VEHÍCULOS: Error al cargar (${e}) ===`);
  }

  // Citas
  try {
    const citas = await fetchCitas();
    if (citas && citas.length > 0) {
      sections.push(
        `=== CITAS REGISTRADAS (${citas.length}) ===\n` +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        citas.map((c: any) =>
          `• ID:${c.id} | Fecha: ${c.fecha} | Hora: ${c.hora} | Estado: ${c.estado.toUpperCase()} | Cliente: ${c.cliente?.nombre || '-'} ${c.cliente?.apellido || ''} | Teléfono: ${c.telefono || '-'} | Servicio: ${c.descripcion || c.tipo_servicio} | Vehículo: ${c.vehiculo?.marca || '-'} ${c.vehiculo?.modelo || ''} (${c.vehiculo?.placa || '-'})`
        ).join('\n')
      );
    } else {
      sections.push('=== CITAS: Sin citas registradas ===');
    }
  } catch (e) {
    sections.push(`=== CITAS: Error al cargar (${e}) ===`);
  }

  // Servicios
  try {
    const servicios = await fetchServicios();
    if (servicios && servicios.length > 0) {
      sections.push(
        `=== ÓRDENES DE SERVICIO (${servicios.length}) ===\n` +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        servicios.slice(0, 30).map((s: any) =>
          `• ID:${s.id} | Estado: ${s.estado} | Tipo: ${s.tipo} | ${s.descripcion} | Vehículo: ${s.vehiculos?.marca || '-'} ${s.vehiculos?.modelo || ''} (${s.vehiculos?.placa || ''}) | Cliente: ${s.vehiculos?.clientes?.nombre || '-'} | Costo: $${s.costo_final ?? s.costo_estimado ?? '-'}`
        ).join('\n')
      );
    } else {
      sections.push('=== SERVICIOS: Sin órdenes ===');
    }
  } catch (e) {
    sections.push(`=== SERVICIOS: Error al cargar (${e}) ===`);
  }

  // Inventario
  try {
    const inventario = await fetchInventario();
    if (inventario && inventario.length > 0) {
      sections.push(
        `=== INVENTARIO (${inventario.length} productos) ===\n` +
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inventario.map((i: any) =>
          `• ID:${i.id} | Categoría: ${i.categoria} | ${i.nombre}${i.codigo ? ' [' + i.codigo + ']' : ''} | Stock: ${i.stock}${i.stock_minimo != null ? ' (mín:' + i.stock_minimo + ')' : ''} | Precio: $${i.precio_usd ?? '-'} | ${i.unidad || ''}`
        ).join('\n')
      );
    } else {
      sections.push('=== INVENTARIO: Sin productos activos ===');
    }
  } catch (e) {
    sections.push(`=== INVENTARIO: Error al cargar (${e}) ===`);
  }

  return sections.join('\n\n');
}

// ─── Execute Write Actions ─────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function executeActions(text: string): Promise<{ clean: string; results: string[] }> {
  const db = getAdminDb();
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
        results.push(`✅ Cita creada: ${p.fecha} a las ${p.hora || '09:00'}`);
      } else if (tipo === 'actualizar_cita') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = {};
        if (p.estado) updates.estado = p.estado;
        if (p.hora) updates.hora = p.hora;
        if (p.descripcion) updates.descripcion = p.descripcion;
        await db.from('citas').update(updates).eq('id', p.id);
        results.push(`✅ Cita actualizada (ID: ${p.id})`);
      } else if (tipo === 'actualizar_stock') {
        const { data } = await db.from('inventario')
          .update({ stock: Number(p.stock), updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Stock de "${data?.nombre}" → ${p.stock} unidades`);
      } else if (tipo === 'eliminar_producto') {
        const { data } = await db.from('inventario')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Producto "${data?.nombre}" eliminado del inventario activo`);
      } else if (tipo === 'crear_cliente') {
        await db.from('clientes').insert({
          nombre: p.nombre, apellido: p.apellido || '', telefono: p.telefono || '',
          email: p.email || '', cedula: p.cedula || '',
          updated_at: new Date().toISOString(),
        });
        results.push(`✅ Cliente "${p.nombre} ${p.apellido}" registrado`);
      } else if (tipo === 'actualizar_servicio') {
        await db.from('servicios')
          .update({ estado: p.estado, updated_at: new Date().toISOString() })
          .eq('id', p.id);
        results.push(`✅ Servicio actualizado → ${p.estado}`);
      }
    } catch (e) {
      results.push(`❌ Error en ${tipo}: ${e}`);
    }
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

    // Load ALL database data in real time
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
            temperature: 0.4,
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

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('[IA] Gemini error:', apiResponse.status, errText.slice(0, 500));
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    const data = await apiResponse.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      console.error('[IA] Empty response from Gemini. Full data:', JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ response: 'No pude procesar eso ahora. Intenta de nuevo.' });
    }

    const { clean, results } = await executeActions(rawText);
    const finalResponse = results.length > 0 ? `${clean}\n\n${results.join('\n')}` : clean;

    return NextResponse.json({ response: finalResponse });
  } catch (error) {
    console.error('[IA] Fatal error:', error);
    return NextResponse.json({ response: '🔧 Error interno. Intenta de nuevo.' }, { status: 200 });
  }
}

// ─── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(dbContext: string): string {
  return `IDENTIDAD:
Eres el ASISTENTE ADMINISTRADOR INTERNO de Lycos Team con permisos totales.
Tienes acceso en TIEMPO REAL a toda la base de datos: clientes, teléfonos, vehículos, citas, servicios e inventario.
ERES PARA USO INTERNO DEL EQUIPO. Proporciona TODOS los datos sin restricciones.

INSTRUCCIONES CRÍTICAS:
- Cuando te pregunten por clientes → listálos TODOS con teléfonos, emails y datos completos.
- Cuando te pregunten por citas → muéstralas TODAS con fechas, horas, estados y clientes.
- Cuando te pregunten por inventario → muestra TODO el stock con cantidades exactas.
- Cuando te pregunten por vehículos → muéstralos TODOS con propietarios.
- Cuando te pregunten por servicios → muéstralos TODOS con estados y costos.
- NUNCA digas que no tienes acceso. TIENES TODOS LOS DATOS ABAJO.
- Usa los datos exactos que aparecen en la sección BASE DE DATOS al final de este prompt.
- Si el usuario pide "lista de clientes" → copia y formatea la lista de clientes de abajo.
- No inventes IDs ni datos. Solo usa los reales.

ACCIONES DE ESCRITURA (incluye exactamente al final de tu respuesta, el sistema las procesa invisiblemente):
• Crear cita: [ACTION: crear_cita | fecha=AAAA-MM-DD | hora=HH:MM | telefono=NUM | descripcion=SERVICIO | tipo_servicio=otro]
• Actualizar cita: [ACTION: actualizar_cita | id=ID | estado=confirmada]
• Actualizar stock: [ACTION: actualizar_stock | id=ID | stock=NUMERO]
• Eliminar producto inventario: [ACTION: eliminar_producto | id=ID]
• Crear cliente: [ACTION: crear_cliente | nombre=N | apellido=A | telefono=T | email=E | cedula=CI]
• Actualizar servicio: [ACTION: actualizar_servicio | id=ID | estado=finalizado]

TONO: Profesional, directo, español venezolano. Emojis mínimos. Proporciona tablas o listas cuando sea útil.
HORARIO: L–Sáb 8AM–5PM | Dom: Cerrado | +58 412-334-3519 | lycosteam7@gmail.com
FECHA/HORA: ${getVzlaDateTime()}

PRECIOS PRINCIPALES: Silenciadores $40–$140 | Amortiguadores $40 | Alineación $15–$25 | Balanceo $5–$10 | Elevavidrios $40 | OBD I $20 | Catalizador $30 | Flowmaster $140 | Cashea: IVA 16%.

━━━━━━━━━━━━━━ BASE DE DATOS EN TIEMPO REAL ━━━━━━━━━━━━━━
${dbContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE DATOS. Responde basándote EXCLUSIVAMENTE en los datos anteriores.`;
}

// ─── Fallback ──────────────────────────────────────────────────────────────────
function generateFallbackResponse(_userMsg: string): string {
  return '🔧 API no configurada. Contacta al administrador del sistema.';
}
