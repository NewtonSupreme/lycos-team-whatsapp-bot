import { NextRequest, NextResponse } from 'next/server';
import {
  fetchInventario,
  fetchVentasSilenciadores,
  supabase as client
} from '@/lib/supabase';
import { withSedeFilterServer, withSedeInsertServer } from '@/lib/db-filters';

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
async function loadDbContext(sedeId: string | null): Promise<string> {
  const sections: string[] = [];

  if (!client) return "Error: Supabase no configurado";

  // Helper for server-side queries
  const db = (table: string) => withSedeFilterServer(client!.from(table), sedeId);

  // Clientes
  try {
    const { data: clientes } = await db('clientes').select('*, vehiculos(*)').order('created_at', { ascending: false });
    if (clientes && clientes.length > 0) {
      sections.push(
        `=== CLIENTES REGISTRADOS (${clientes.length}) ===\n` +
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
    const { data: vehiculos } = await db('vehiculos').select('*, clientes(nombre, apellido, telefono)').order('created_at', { ascending: false });
    if (vehiculos && vehiculos.length > 0) {
      sections.push(
        `=== VEHÍCULOS REGISTRADOS (${vehiculos.length}) ===\n` +
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
    const { data: citas } = await db('citas').select('*, cliente:clientes(nombre, apellido), vehiculo:vehiculos(marca, modelo, placa)').order('fecha', { ascending: true });
    if (citas && citas.length > 0) {
      sections.push(
        `=== CITAS REGISTRADAS (${citas.length}) ===\n` +
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
    const { data: servicios } = await db('servicios').select('*, vehiculos(marca, modelo, placa, clientes(nombre, apellido))').order('created_at', { ascending: false });
    if (servicios && servicios.length > 0) {
      sections.push(
        `=== ÓRDENES DE SERVICIO (${servicios.length}) ===\n` +
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
    const { data: inventario } = await db('inventario').select('*').eq('activo', true).order('orden', { ascending: true });
    if (inventario && inventario.length > 0) {
      // Fetch live BCV rate for display
      let bcvRate = 0;
      try {
        const ratesRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/rates`);
        const ratesJson = await ratesRes.json();
        bcvRate = ratesJson.bcv || 0;
      } catch { /* ignore */ }

      sections.push(
        `=== INVENTARIO (${inventario.length} productos) — Tasa BCV actual: ${bcvRate > 0 ? `Bs.${bcvRate.toFixed(2)}/$` : 'N/D'} ===\n` +
        inventario.map((i: any) =>
          `• INV_ID:${i.id} | ${i.nombre} | Stock: ${i.stock} | Precio Divisas: $${i.precio_usd ?? '-'} | Precio BCV: Bs.${i.precio_bs ?? '-'}${bcvRate > 0 && i.precio_bs ? ` (~$${(i.precio_bs / bcvRate).toFixed(2)})` : ''} | ${i.unidad || 'unidad'}${i.notas ? ' | ' + i.notas : ''}`
        ).join('\n')
      );
    } else {
      sections.push('=== INVENTARIO: Sin productos activos ===');
    }
  } catch (e) {
    sections.push(`=== INVENTARIO: Error al cargar (${e}) ===`);
  }

  // Ventas de Silenciadores (Últimos 30 días) — DETALLE COMPLETO
  try {
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const { data: ventas } = await db('ventas_silenciadores').select('*').gte('fecha', last30.toISOString()).order('fecha', { ascending: false });
    if (ventas && ventas.length > 0) {
      sections.push(
        `=== VENTAS REGISTRADAS (Últimos 30 días, ${ventas.length} total) ===\n` +
        ventas.map((v: any) => {
          const notas = v.notas || '';
          return `• ${new Date(v.fecha).toLocaleDateString('es-VE')} | ${v.modelo || 'Sin modelo'} x${v.cantidad} | ${notas || 'Sin notas'}`;
        }).join('\n')
      );
    }
  } catch (e) {
    console.error('Error loading sales:', e);
  }

  // Tracking de Vehículos en Taller (servicios activos)
  try {
    const { data: enTaller } = await db('servicios')
      .select('*, vehiculos(marca, modelo, placa, clientes(nombre, apellido, telefono))')
      .in('estado', ['en_proceso', 'pendiente', 'en_revision'])
      .order('created_at', { ascending: false });
    if (enTaller && enTaller.length > 0) {
      sections.push(
        `=== VEHÍCULOS ACTUALMENTE EN TALLER (${enTaller.length}) ===\n` +
        enTaller.map((s: any) =>
          `• ${s.vehiculos?.marca || 'S/M'} ${s.vehiculos?.modelo || ''} (${s.vehiculos?.placa || 'S/P'}) — Cliente: ${s.vehiculos?.clientes?.nombre || 'Consumidor Final'} ${s.vehiculos?.clientes?.apellido || ''} | Servicio: ${s.descripcion} | Estado: ${s.estado} | Costo: $${s.costo_final ?? s.costo_estimado ?? '-'}`
        ).join('\n')
      );
    } else {
      sections.push('=== VEHÍCULOS EN TALLER: Ninguno actualmente ===');
    }
  } catch (e) {
    console.error('Error loading taller tracking:', e);
  }

  // Empleados / Usuarios de la sede
  try {
    const { data: emps } = await db('usuarios').select('username, nombre, rol');
    if (emps && emps.length > 0) {
      sections.push(
        `=== EQUIPO / EMPLEADOS DE LA SEDE ===\n` +
        emps.map((e: any) => `• ${e.nombre || e.username} (${e.rol})`).join('\n')
      );
    }
  } catch (e) {
    console.error('Error loading employees:', e);
  }

  // Actividad de WhatsApp (Hoy)
  try {
    const today = new Date().toISOString().split('T')[0];
    const { count: msgsHoy } = await db('mensajes_whatsapp').select('*', { count: 'exact', head: true }).gte('created_at', today);
    const { count: convsActivas } = await db('conversaciones').select('*', { count: 'exact', head: true }).eq('estado', 'activa');
    
    sections.push(
      `=== ACTIVIDAD BOT WHATSAPP HOY ===\n` +
      `• Mensajes procesados hoy: ${msgsHoy || 0}\n` +
      `• Conversaciones activas en este momento: ${convsActivas || 0}`
    );
  } catch (e) {
    console.error('Error loading wa activity:', e);
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

async function executeActions(text: string, sedeId: string | null): Promise<{ clean: string; results: string[] }> {
  const db = getAdminDb();
  const results: string[] = [];
  let clean = text;

  // Track newly created IDs so subsequent actions can reference them
  const createdIds: Record<string, string> = {};

  const table = (name: string) => withSedeFilterServer(db!.from(name), sedeId);
  const insert = async (name: string, data: any) => db!.from(name).insert(withSedeInsertServer(data, sedeId)).select();

  for (const match of [...text.matchAll(/\[ACTION:\s*([^\]]+)\]/g)]) {
    clean = clean.replace(match[0], '').trim();
    if (!db) continue;
    const parts = match[1].split('|').map((s: string) => s.trim());
    const tipo = parts[0];
    const p: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
      const idx = parts[i].indexOf('=');
      if (idx > 0) p[parts[i].slice(0, idx).trim()] = parts[i].slice(idx + 1).trim();
    }
    try {
      // ── Appointments ────────────────────────────────────────────────────────
      if (tipo === 'crear_cita') {
        await insert('citas', {
          fecha: p.fecha, hora: p.hora || '09:00', telefono: p.telefono || '',
          descripcion: p.descripcion || 'Cita por asistente IA',
          tipo_servicio: p.tipo_servicio || 'otro', estado: 'pendiente', duracion_minutos: 60,
        });
        results.push(`✅ Cita creada: ${p.fecha} a las ${p.hora || '09:00'}`);

      } else if (tipo === 'actualizar_cita') {
        const updates: Record<string, any> = {};
        if (p.estado) updates.estado = p.estado;
        if (p.hora) updates.hora = p.hora;
        if (p.descripcion) updates.descripcion = p.descripcion;
        await table('citas').update(updates).eq('id', p.id);
        results.push(`✅ Cita actualizada (ID: ${p.id})`);

      // ── Inventory ───────────────────────────────────────────────────────────
      } else if (tipo === 'actualizar_stock') {
        const { data: inv } = await table('inventario')
          .update({ stock: Number(p.stock), updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Stock de "${inv?.nombre}" → ${p.stock} unidades`);

      } else if (tipo === 'descontar_stock') {
        // Safely decrement stock by cantidad, never below 0
        const { data: invItem } = await table('inventario').select('stock, nombre').eq('id', p.id).single();
        if (invItem) {
          const qty = parseInt(p.cantidad) || 1;
          const newStock = Math.max(0, (invItem.stock || 0) - qty);
          await table('inventario').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', p.id);
          results.push(`✅ Stock de "${invItem.nombre}" descontado: ${invItem.stock} → ${newStock}`);
        } else {
          results.push(`⚠️ Producto ID ${p.id} no encontrado para descontar stock`);
        }

      } else if (tipo === 'eliminar_producto') {
        const { data: inv } = await table('inventario')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Producto "${inv?.nombre}" eliminado del inventario activo`);

      // ── Clients ─────────────────────────────────────────────────────────────
      } else if (tipo === 'crear_cliente') {
        // Check if client already exists to avoid duplicates
        const { data: existing } = await table('clientes')
          .select('id, nombre, apellido')
          .ilike('nombre', p.nombre || '')
          .ilike('apellido', p.apellido || '')
          .maybeSingle();
        
        if (existing) {
          createdIds['last_cliente_id'] = existing.id;
          results.push(`ℹ️ Cliente "${existing.nombre} ${existing.apellido}" ya existía (ID: ${existing.id})`);
        } else {
          const { data: newCliente } = await insert('clientes', {
            nombre: p.nombre, apellido: p.apellido || '', telefono: p.telefono || '',
            email: p.email || '', cedula: p.cedula || '',
            updated_at: new Date().toISOString(),
          });
          if (newCliente?.[0]) {
            createdIds['last_cliente_id'] = newCliente[0].id;
            results.push(`✅ Cliente "${p.nombre} ${p.apellido || ''}" registrado (ID: ${newCliente[0].id})`);
          }
        }

      // ── Vehicles ────────────────────────────────────────────────────────────
      } else if (tipo === 'crear_vehiculo') {
        const clienteId = p.cliente_id || createdIds['last_cliente_id'] || null;
        if (!clienteId) {
          results.push(`⚠️ crear_vehiculo: cliente_id requerido. Usa crear_cliente primero.`);
        } else {
          // Check if vehicle already exists by placa
          let existingVeh = null;
          if (p.placa) {
            const { data: ev } = await table('vehiculos').select('id').ilike('placa', p.placa).maybeSingle();
            existingVeh = ev;
          }
          if (existingVeh) {
            createdIds['last_vehiculo_id'] = existingVeh.id;
            results.push(`ℹ️ Vehículo placa ${p.placa} ya existe (ID: ${existingVeh.id})`);
          } else {
            const { data: newVeh } = await insert('vehiculos', {
              cliente_id: clienteId,
              marca: p.marca || 'No especificado',
              modelo: p.modelo_vehiculo || p.modelo || 'No especificado',
              placa: p.placa || null,
              anio: parseInt(p.anio) || 2000,
              color: p.color || null,
              estado: 'activo',
            });
            if (newVeh?.[0]) {
              createdIds['last_vehiculo_id'] = newVeh[0].id;
              results.push(`✅ Vehículo ${p.marca || ''} placa ${p.placa || 'S/P'} registrado para el cliente`);
            }
          }
        }

      // ── Services ────────────────────────────────────────────────────────────
      } else if (tipo === 'actualizar_servicio') {
        await table('servicios')
          .update({ estado: p.estado, updated_at: new Date().toISOString() })
          .eq('id', p.id);
        results.push(`✅ Servicio actualizado → ${p.estado}`);

      } else if (tipo === 'registrar_servicio') {
        const insertData: any = {
           descripcion: p.descripcion || 'Servicio registrado por IA',
           tipo: p.tipo || 'general',
           estado: p.estado || 'en_proceso',
        };
        if (p.costo_estimado) insertData.costo_estimado = parseFloat(p.costo_estimado);
        await insert('servicios', insertData);
        results.push(`✅ Trabajo en taller creado: ${insertData.descripcion}`);

      // ── Sales ───────────────────────────────────────────────────────────────
      } else if (tipo === 'registrar_venta_item') {
        // Register one item. Also decrements stock automatically if inv_id is provided.
        const metodo = p.metodo_pago || p.context || '';
        const contextStr = metodo ? ` (${metodo})` : '';
        const clienteNombre = p.cliente || null;
        const vehiculoInfo = p.vehiculo ? ` | Vehículo: ${p.vehiculo}` : '';
        const clienteStr = clienteNombre ? ` | Cliente: ${clienteNombre}` : '';
        const notasFinales = (
          `${p.notas || ''} [Total: $${p.precio || '0'}${contextStr}]${clienteStr}${vehiculoInfo}`.trim()
        );

        const precioNum = parseFloat(p.precio || '0');

        await insert('ventas_silenciadores', {
          cantidad: parseInt(p.cantidad) || 1,
          modelo: p.producto || p.modelo || null,
          notas: notasFinales,
          fecha: new Date().toISOString(),
          precio_registrado: precioNum,
        });

        // Auto-decrement stock if inventory ID provided
        if (p.inv_id) {
          const { data: invItem } = await table('inventario').select('stock, nombre').eq('id', p.inv_id).single();
          if (invItem) {
            const qty = parseInt(p.cantidad) || 1;
            const newStock = Math.max(0, (invItem.stock || 0) - qty);
            await table('inventario').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', p.inv_id);
            results.push(`✅ Venta: ${qty}x ${p.producto || p.modelo} → $${p.precio || '0'}${contextStr}${clienteStr}. Stock "${invItem.nombre}": ${invItem.stock} → ${newStock}`);
          } else {
            results.push(`✅ Venta: ${p.producto || p.modelo} → $${p.precio || '0'}${contextStr}${clienteStr} (stock no actualizado — ID no encontrado)`);
          }
        } else {
          results.push(`✅ Venta registrada: ${p.cantidad || 1}x ${p.producto || p.modelo} → $${p.precio || '0'}${contextStr}${clienteStr}`);
        }

      } else if (tipo === 'registrar_venta_completa') {
        // NEW: Register ALL items of a sale in ONE consolidated record
        // items format: "Producto1:precio1,Producto2:precio2"
        const metodo = p.metodo_pago || '';
        const contextStr = metodo ? ` (${metodo})` : '';
        const clienteStr = p.cliente ? ` | Cliente: ${p.cliente}` : '';
        const vehiculoStr = p.vehiculo ? ` | Vehículo: ${p.vehiculo}` : '';
        const pagoMixtoStr = p.pago_mixto ? ` | Pagos: ${p.pago_mixto}` : '';

        // Build items string from p.items ("CL40:50,Tubería:20")
        let itemsDisplay = p.items || p.producto || 'Varios';
        const totalStr = p.total ? ` | Total: $${p.total}${contextStr}` : '';
        const ivaStr = p.iva ? ` | IVA 16%: $${p.iva}` : '';
        const inicialStr = p.inicial ? ` | Inicial Cashea: $${p.inicial}` : '';

        const notasFinales = `Items: ${itemsDisplay}${totalStr}${ivaStr}${inicialStr}${clienteStr}${vehiculoStr}${pagoMixtoStr}`.trim();

        const totalNum = parseFloat(p.total || '0');

        await insert('ventas_silenciadores', {
          cantidad: parseInt(p.cantidad) || 1,
          modelo: p.titulo || itemsDisplay.split(',')[0]?.split(':')[0] || 'Venta múltiple',
          notas: notasFinales,
          fecha: new Date().toISOString(),
          precio_registrado: totalNum,
        });

        // Auto-decrement stock for each item if inv_ids provided (comma-separated)
        if (p.inv_ids) {
          const idList = p.inv_ids.split(',').map((x: string) => x.trim());
          for (const invId of idList) {
            const { data: invItem } = await table('inventario').select('stock, nombre').eq('id', invId).single();
            if (invItem && invItem.stock > 0) {
              await table('inventario').update({ stock: invItem.stock - 1, updated_at: new Date().toISOString() }).eq('id', invId);
            }
          }
        }

        results.push(`✅ Venta registrada: ${itemsDisplay}${totalStr}${clienteStr}`);

      } else if (tipo === 'registrar_venta_silenciador') {
        // LEGACY: keep for backwards compat
        const metodo = p.metodo_pago || p.context || '';
        const contextStr = metodo ? ` (${metodo})` : '';
        const clienteStr = p.cliente ? ` | Cliente: ${p.cliente}` : '';
        const notasFinales = p.precio ? `${p.notas || ''} [Total: $${p.precio}${contextStr}]${clienteStr}`.trim() : `${p.notas || ''}${clienteStr}`.trim();
        
        await insert('ventas_silenciadores', {
          cantidad: parseInt(p.cantidad) || 1,
          modelo: p.modelo || null,
          notas: notasFinales,
          fecha: new Date().toISOString()
        });
        results.push(`✅ Venta registrada: ${p.cantidad || 1}x ${p.modelo || 'Producto'}${p.precio ? ` → $${p.precio}${contextStr}` : ''}${p.cliente ? ` (${p.cliente})` : ''}.`);
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
    const { messages, systemPrompt, sede_id, sede_nombre, user } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    // Load database context filtered by sede
    const dbContext = await loadDbContext(sede_id);
    const finalSystemPrompt = systemPrompt || buildSystemPrompt(dbContext, sede_nombre, user);

    const geminiMessages = messages.map((m: { role: string; content: string; image?: { mimeType: string; data: string } }) => {
      const parts: any[] = [];
      
      if (m.image && m.image.data) {
        parts.push({
          inlineData: {
            mimeType: m.image.mimeType || 'image/jpeg',
            data: m.image.data
          }
        });
      }
      
      parts.push({ text: m.content || '' });
      
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

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

    const { clean, results } = await executeActions(rawText, sede_id);
    // Strip any raw UUIDs from results before showing to user
    const cleanResults = results.map(r => r.replace(/\s*\(ID: [0-9a-f-]{36}\)/gi, '').replace(/ID: [0-9a-f-]{36}/gi, ''));
    const finalResponse = cleanResults.length > 0 ? `${clean}\n\n---\n${cleanResults.join('\n')}` : clean;

    return NextResponse.json({ response: finalResponse });
  } catch (error) {
    console.error('[IA] Fatal error:', error);
    return NextResponse.json({ response: '🔧 Error interno. Intenta de nuevo.' }, { status: 200 });
  }
}

// ─── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(dbContext: string, sedeNombre?: string, user?: any): string {
  return `IDENTIDAD:
Eres el ASISTENTE ADMINISTRADOR INTELIGENTE de Lycos Team con control total sobre la sede: "${sedeNombre || 'General'}".
Hola ${user?.nombre || 'Newton Supreme'}, estoy a tu servicio. Mi objetivo es ayudarte a gestionar esta sede de manera impecable.

ACCESO A DATOS:
Tienes acceso en TIEMPO REAL a la base de datos FILTRADA por esta sede.
Lo que ves abajo es EXCLUSIVO de la sede "${sedeNombre || 'General'}". No menciones datos de otras sedes a menos que se te pregunte explícitamente y los tengas disponibles.

FORMATO DE RESPUESTA (ESTILO DASHBOARD PREMIUM):
- USA TABLAS MARKDOWN ESTÁNDAR: Usa el formato | Header | Header |. Es vital para el renderizado profesional.
- NUNCA uses bordes de caracteres Unicode (como ┌ ─ ┐) ya que se ven mal en móviles.
- NUNCA uses negritas (**) dentro de las celdas de una tabla, ensucian la vista.
- DISEÑO LIMPIO: Usa negritas solo para títulos o totales fuera de las tablas.
- EMOJIS: Úsalos para identificar secciones (📦 Inventario, 💰 Ventas, 🔧 Servicios).
- RESPUESTA EJECUTIVA: Sé breve, directo y ofrece soluciones.

INSTRUCCIONES DE DISEÑO:
- Inventario → Tabla Markdown limpia. Columnas: PRODUCTO | CATEGORÍA | STOCK | PRECIO.
- Servicios → Tabla Markdown. Columnas: VEHÍCULO | TRABAJO | ESTADO | COSTO.
- Si no hay datos, responde con elegancia: "No se encontraron registros para esta sede actualmente."

CAPACIDAD DE GRÁFICOS (INTERACTIVOS):
Puedes generar gráficos profesionales insertando un bloque de código con el lenguaje "chart" y un JSON con este formato:
\`\`\`chart
{
  "type": "bar", // O "pie" o "line"
  "title": "Ventas de la Semana",
  "data": [
    {"name": "Lun", "value": 150},
    {"name": "Mar", "value": 230}
  ]
}
\`\`\`
Úsalos cuando el usuario pida análisis, comparativas o reportes visuales de ventas, stock o actividad.

INSTRUCCIONES CRÍTICAS:
- Cuando te pregunten por clientes → lístalos TODOS con datos completos en un formato impecable.
- Cuando te pregunten por citas → muéstralas TODAS agrupadas por fecha y hora.
- Cuando te pregunten por inventario → Genera una tabla ESPECTACULAR con formato Markdown estándar.
- Cuando te pregunten por vehículos → muéstralos por marca, modelo y placa.
- Cuando te pregunten por servicios → muéstralos con su estado y costo.
- NUNCA digas que no tienes acceso. TIENES TODOS LOS DATOS ABAJO.
- Usa los datos exactos que aparecen en la sección BASE DE DATOS al final de este prompt.
- No inventes datos. Solo usa los reales de la base de datos.

ACCIONES DE ESCRITURA (REGLAS CRÍTICAS):

⚠️ REGLA DE ORO — AL REGISTRAR UNA VENTA CON MÚLTIPLES PRODUCTOS:
1. Si el cliente NO existe → usa [ACTION: crear_cliente] PRIMERO.
2. Si se menciona un vehículo → usa [ACTION: crear_vehiculo] DESPUÉS del cliente.
    - Todos los productos de la MISMA venta → registra TODO en UNA SOLA acción [ACTION: registrar_venta_completa] con todos los ítems listados en el campo 'items'.
    - El campo 'items' usa formato ESTRICTO: "Producto1:Precio1, Producto2:Precio2" (SÓLO números, sin símbolos de moneda).

REGLA CASHEA (MUY IMPORTANTE):
- Cashea SIEMPRE usa el Precio BCV como base (campo precio_bs del inventario), NO el precio en dólares divisas.
- El total Cashea = Precio_BCV ÷ Tasa_BCV_actual × 1.16 (incluye 16% IVA obligatorio).
- En el campo 'metodo_pago' usa: cashea_bcv. En 'total' muestra el monto en dólares al cambio BCV.
- La tasa BCV actual aparece en la sección INVENTARIO del contexto de datos.

PAGOS MIXTOS:
- Si una venta se pagó parte en divisas y parte en Bs/BCV, usá el campo 'pago_mixto' en registrar_venta_completa.
- Formato: pago_mixto=$20 Divisas + $30 BCV

ID DE INVENTARIO (INV_ID):
- Para descontar stock, usa el campo INV_ID exacto que aparece en la sección INVENTARIO (formato: INV_ID:xxxx).
- NUNCA muestres IDs UUID crudos en tu respuesta al usuario. Si necesitas referenciar un producto, usa su NOMBRE.

TRACKING DE TALLER:
- Cuando te pregunten cuántos vehículos o clientes fueron al taller, reporta:
  1. Vehículos con servicio activo (sección VEHÍCULOS EN TALLER).
  2. Ventas del día como referencia de quienes pasaron a comprar.
  3. Menciona si hay citas pendientes también.

• Crear cita: [ACTION: crear_cita | fecha=AAAA-MM-DD | hora=HH:MM | telefono=NUM | descripcion=SERVICIO | tipo_servicio=otro]
• Actualizar cita: [ACTION: actualizar_cita | id=ID | estado=confirmada]
• Actualizar stock manual: [ACTION: actualizar_stock | id=INV_ID | stock=NUMERO]
• Descontar stock: [ACTION: descontar_stock | id=INV_ID | cantidad=N]
• Eliminar producto: [ACTION: eliminar_producto | id=INV_ID]
• Crear cliente: [ACTION: crear_cliente | nombre=N | apellido=A | telefono=T | email=E | cedula=CI]
• Crear vehículo: [ACTION: crear_vehiculo | marca=MARCA | modelo_vehiculo=MODELO | placa=PLACA | anio=ANO | color=COLOR]
• Actualizar servicio: [ACTION: actualizar_servicio | id=ID | estado=finalizado]
• Registrar trabajo taller: [ACTION: registrar_servicio | descripcion=Texto | tipo=mecanica | estado=en_proceso | costo_estimado=Numero]
• Registrar venta COMPLETA (TODO EN UNO): [ACTION: registrar_venta_completa | titulo=TITULO_PRINCIPAL | items=Producto1:$precio1,Producto2:$precio2 | total=TOTAL | iva=MONTO_IVA | inicial=INICIAL_CASHEA | metodo_pago=cashea_bcv/divisas/bcv/binance | pago_mixto=DESCRIPCION | cliente=NOMBRE | vehiculo=MARCA_PLACA | inv_ids=ID1,ID2]

EJEMPLO (William, Cashea, 2 productos):
[ACTION: crear_cliente | nombre=Juan | apellido=Perez | cedula=12345678 | telefono=0414123456]
[ACTION: crear_vehiculo | marca=Toyota | modelo_vehiculo=Corolla | placa=ABC123 | anio=2015]
[ACTION: registrar_venta_completa]
- total: (Suma de los items en dólares USD)
- items: "Nombre:Precio, Nombre:Precio" (Ej: "Muffler:50, Tuberia:20")
- cantidad: (Suma de cantidades)
- metodo_pago: (efectivo_usd, zelle, cashea_bcv, binance)
- cliente: (Nombre del cliente)
- vehiculo: (Opcional)
- inv_ids: (IDs de inventario separados por comas)
- pago_mixto: (Opcional)

TONO: Profesional, ejecutivo y eficiente. Español venezolano amable. Presentación IMPECABLE y ORDENADA.
HORARIO: L–Sáb 8AM–5PM | Dom: Cerrado | +58 412-334-3519 | lycosteam7@gmail.com
FECHA/HORA: ${getVzlaDateTime()}

PRECIOS PRINCIPALES: Silenciadores $40–$140 | Amortiguadores $40 | Alineación $15–$25 | Balanceo $5–$10 | Elevavidrios $40 | OBD I $20 | Catalizador $30 | Flowmaster $140.

CASHEA — REGLA DE PRECIOS:
- Cashea usa el PRECIO BCV (precio_bs del inventario) como base, NO el precio divisas.
- Total Cashea = (precio_bs / tasa_bcv_actual) × 1.16 (16% IVA obligatorio).
- Ejemplo: Si CL40 = Bs.70 y tasa = 50 Bs/$, base en USD = $1.40. Total con IVA = $1.62.
- Menciona siempre el inicial (cuota 1) y el resto en cuotas (normalmente 3 cuotas iguales del resto).
- La tasa BCV actual está en la sección INVENTARIO del contexto abajo.

CATEGORIZACIÓN DE SILENCIADORES:
- CL27/CL30 ($40): Motores hasta 1.3L.
- CL40 ($50): Motores hasta 1.5L.
- CLH40 ($60): Motores 1.6L a 2.0L (Aveo, Gol, Corolla 1.6).
- CL60 ($90): Motores grandes, Camionetas, Camiones, Plataneros.
- CLK60 ($100 - Fabricación Especial): Dodge Caliber, EcoSport, Previa, Tucson, Sportage, Malibu, Cherokee, Compass.
- TUBERÍA: El precio varía según los metros instalados. Al registrar una venta de tubería, usa el precio cobrado real (ej: $25, $30 o $35 por metro) basándote en lo discutido con el cliente. Esto NO afecta el precio base del inventario.

REGLA DE CITAS: HOY es ${getVzlaDateTime()}. Si agendan para mañana siendo sábado, recuerda que el domingo cerramos y ofrece el lunes.

━━━━━━━━━━━━━━ BASE DE DATOS EN TIEMPO REAL ━━━━━━━━━━━━━━
${dbContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE DATOS. Responde basándote EXCLUSIVAMENTE en los datos anteriores.`;
}

// ─── Fallback ──────────────────────────────────────────────────────────────────
function generateFallbackResponse(_userMsg: string): string {
  return '🔧 API no configurada. Contacta al administrador del sistema.';
}
