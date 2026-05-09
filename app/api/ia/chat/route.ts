import { NextRequest, NextResponse } from 'next/server';
import {
  fetchClientes,
  fetchVehiculos,
  fetchCitas,
  fetchServicios,
  fetchInventario,
  fetchVentasSilenciadores
} from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite'
] as const;

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
          `• ID:${i.id} | Categoría: ${i.categoria} | ${i.nombre}${i.codigo ? ' [' + i.codigo + ']' : ''} | Stock: ${i.stock}${i.stock_minimo != null ? ' (mín:' + i.stock_minimo + ')' : ''} | Precio: $${i.precio_usd ?? '-'} | ${i.unidad || ''}${i.notas ? ' | Notas: ' + i.notas : ''}`
        ).join('\n')
      );
    } else {
      sections.push('=== INVENTARIO: Sin productos activos ===');
    }
  } catch (e) {
    sections.push(`=== INVENTARIO: Error al cargar (${e}) ===`);
  }

  // Ventas de Silenciadores (Últimos 30 días)
  try {
    const ventasSilenciadores = await fetchVentasSilenciadores();
    if (ventasSilenciadores && ventasSilenciadores.length > 0) {
      sections.push(
        `=== VENTAS DE SILENCIADORES (Últimos 30 días) ===\n` +
        ventasSilenciadores.map((v: any) =>
          `• Fecha: ${new Date(v.fecha).toLocaleDateString('es-VE')} | Cantidad: ${v.cantidad} | Modelo: ${v.modelo || 'N/A'}`
        ).join('\n')
      );
    } else {
      sections.push('=== VENTAS DE SILENCIADORES: Sin ventas registradas ===');
    }
  } catch (e) {
    sections.push(`=== VENTAS DE SILENCIADORES: Error al cargar (${e}) ===`);
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
      } else if (tipo === 'registrar_venta_silenciador') {
        await db.from('ventas_silenciadores').insert({
          cantidad: parseInt(p.cantidad) || 1,
          modelo: p.modelo || null,
          notas: p.notas || null,
        });
        results.push(`✅ Registrada la venta de ${p.cantidad} silenciador(es)${p.modelo ? ` modelo ${p.modelo}` : ''}.`);
      } else if (tipo === 'registrar_servicio') {
        const insertData: any = {
           descripcion: p.descripcion || 'Servicio registrado por IA',
           tipo: p.tipo || 'general',
           estado: p.estado || 'en_proceso',
        };
        if (p.costo_estimado) insertData.costo_estimado = parseFloat(p.costo_estimado);
        await db.from('servicios').insert(insertData);
        results.push(`✅ Registro de trabajo en taller creado: ${insertData.descripcion} (${insertData.estado})`);
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

    let rawText = '';

    // ── Multi-MODEL strategy (Single API Key) ──────────────────────────────────────
    for (const model of GEMINI_MODELS) {
      console.log(`🧠 [IA Chat] Intentando con Modelo: ${model}`);
      try {
        const apiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
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
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
              ],
            }),
          }
        );

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawText = parts.map((p: any) => p.text).join('') || '';
          if (rawText) break;
        } else {
          const errText = await apiResponse.text();
          console.error(`[IA Chat] Error ${apiResponse.status} Modelo ${model}:`, errText.slice(0, 200));
          if (apiResponse.status === 429 || apiResponse.status === 503) continue;
          break; // Try next loop or stop
        }
      } catch (e) {
        console.error('[IA Chat] Exception:', e);
      }
    }

    if (!rawText) {
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
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

FORMATO DE RESPUESTA (ESTILO PREMIUM):
- USA "PREMIUM BOX LAYOUT": Para tablas, usa caracteres Unicode de dibujo de cajas (┌ ─ ┐ │ ├ ┼ ┤ └ ┘) dentro de bloques de código (\`\`\`) para asegurar alineación perfecta.
- DISEÑO TIPO FACTURA: Las listas de inventario o servicios deben parecer comprobantes profesionales, con encabezados claros, separadores elegantes y alineación de columnas.
- NUNCA muestres IDs técnicos (UUIDs). Úsalos solo internamente para las [ACTION].
- USA NEGRITAS fuera de los cuadros para resaltar totales o datos clave.
- USA EMOJIS DE ALTA CALIDAD: (🏷️ Producto, 💰 Precio, 📦 Stock, 🏢 Sede).
- Cada respuesta debe ser un "documento visual" impecable.

INSTRUCCIONES DE DISEÑO:
- Inventario → Tabla en bloque de código con bordes Unicode (┌─┐). Columnas: PRODUCTO | CATEGORÍA | STOCK | PRECIO.
- Clientes → Formato de ficha técnica elegante o tabla detallada.
- Citas → Cronograma ordenado con separadores visuales o tabla por fechas.

INSTRUCCIONES CRÍTICAS:
- Cuando te pregunten por clientes → lístalos TODOS con datos completos en un formato impecable.
- Cuando te pregunten por citas → muéstralas TODAS agrupadas por fecha y hora.
- Cuando te pregunten por inventario → Genera una tabla ESPECTACULAR con bordes Unicode.
- Cuando te pregunten por vehículos → muéstralos por marca, modelo y placa.
- Cuando te pregunten por servicios → muéstralos con su estado y costo.
- NUNCA digas que no tienes acceso. TIENES TODOS LOS DATOS ABAJO.
- Usa los datos exactos que aparecen en la sección BASE DE DATOS al final de este prompt.
- No inventes datos. Solo usa los reales de la base de datos.

ACCIONES DE ESCRITURA (incluye exactamente al final de tu respuesta, el sistema las procesa invisiblemente):
• Crear cita: [ACTION: crear_cita | fecha=AAAA-MM-DD | hora=HH:MM | telefono=NUM | descripcion=SERVICIO | tipo_servicio=otro]
• Actualizar cita: [ACTION: actualizar_cita | id=ID | estado=confirmada]
• Actualizar stock: [ACTION: actualizar_stock | id=ID | stock=NUMERO]
• Eliminar producto inventario: [ACTION: eliminar_producto | id=ID]
• Crear cliente: [ACTION: crear_cliente | nombre=N | apellido=A | telefono=T | email=E | cedula=CI]
• Actualizar estado servicio: [ACTION: actualizar_servicio | id=ID | estado=finalizado]
• Registrar Nuevo Trabajo de Taller: [ACTION: registrar_servicio | descripcion=Texto | tipo=mecanica | estado=en_proceso | costo_estimado=Numero]
• Registrar Venta de Silenciador: [ACTION: registrar_venta_silenciador | cantidad=Numero | modelo=ModeloOpcional | notas=NotasOpcionales]

TONO: Profesional, ejecutivo y eficiente. Español venezolano amable. Presentación IMPECABLE y ORDENADA.
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
