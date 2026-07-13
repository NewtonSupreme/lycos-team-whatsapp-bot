/**
 * AI Commission Classifier — usa Gemini (gemini-2.5-flash) para analizar
 * ventas y servicios de un período y detectar automáticamente:
 *   · zona de trabajo (alineacion|mecanica|escape|frenos|autolavado|cauchera|electronica)
 *   · técnico ejecutor sugerido (match difuso contra la lista de técnicos)
 *   · tipo de trabajo / servicio_key (para tarifas flat)
 *   · mano de obra estimada vs repuestos (clave para comisiones base='mano_obra')
 *
 * SOLO SERVIDOR. La clave GEMINI_API_KEY nunca se expone al cliente.
 *
 * El resultado alimenta PayrollCalculationService.createJobAssignment, que
 * aplica las reglas dinámicas y congela el snapshot. La IA NO decide montos de
 * comisión — solo clasifica y estima mano de obra; el motor determinista calcula.
 */
import { SupabaseClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export interface RawOperation {
  origen: 'ventas_dia' | 'servicios';
  origen_id: string;
  fecha: string;
  descripcion: string;
  cliente?: string | null;
  vehiculo?: string | null;
  monto: number;
  moneda: string;
  tasa_cambio?: number | null;
  registrado_por?: string | null;
  encargado_detectado?: string | null;
}

export interface Technician {
  id: string;
  nombre: string;
  rol?: string | null;
}

export interface ClassifiedOperation {
  origen: 'ventas_dia' | 'servicios';
  origen_id: string;
  fecha: string;
  descripcion: string;
  cliente?: string | null;
  vehiculo?: string | null;
  monto: number;
  moneda: string;
  tasa_cambio?: number | null;
  encargado_detectado?: string | null;
  // Resultado de la IA
  zona: string;
  tipo_trabajo: string;
  servicio_key: string | null;
  empleado_id: string | null;
  empleado_nombre: string | null;
  es_taller: boolean;
  mano_obra: number;         // porción de mano de obra (para comisiones)
  ingreso_total: number;     // = monto
  confianza: number;         // 0..1 — qué tan segura está la IA
  razon: string;             // explicación breve
  requiere_revision: boolean; // true si confianza baja o técnico ambiguo
}

const ZONAS = ['alineacion', 'mecanica', 'escape', 'frenos', 'autolavado', 'cauchera', 'electronica', 'general'];

/**
 * Clasifica un lote de operaciones con Gemini. Procesa en chunks para no
 * exceder límites de contexto. Si la IA falla, cae a heurística por keywords.
 */
export async function classifyOperations(
  ops: RawOperation[],
  technicians: Technician[]
): Promise<ClassifiedOperation[]> {
  if (ops.length === 0) return [];

  const results: ClassifiedOperation[] = [];
  const CHUNK = 25;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const chunk = ops.slice(i, i + CHUNK);
    let classified: ClassifiedOperation[];
    try {
      classified = await classifyChunkWithGemini(chunk, technicians);
    } catch (e) {
      // Fallback heurístico si Gemini no responde
      classified = chunk.map(op => heuristicClassify(op, technicians));
    }
    results.push(...classified);
  }
  return results;
}

async function classifyChunkWithGemini(
  ops: RawOperation[],
  technicians: Technician[]
): Promise<ClassifiedOperation[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');

  const techList = technicians.map(t => `- ${t.nombre}${t.rol ? ` (${t.rol})` : ''} [id:${t.id}]`).join('\n');
  const opsList = ops.map((o, idx) =>
    `#${idx} | ${o.fecha} | Descripción/Encargo: "${o.descripcion}" | Encargado previo/Asignado: ${o.encargado_detectado || 'Ninguno especificado'} | Cliente: ${o.cliente || '-'} | Vehículo: ${o.vehiculo || '-'} | Monto: ${o.monto} ${o.moneda} | Registrado por: ${o.registrado_por || '-'}`
  ).join('\n');

  const prompt = `Eres un experto en un taller automotriz (Lycos Team) que clasifica trabajos para calcular comisiones de técnicos.

TÉCNICOS DISPONIBLES:
${techList}

ZONAS VÁLIDAS: ${ZONAS.join(', ')}

Para cada operación, determina:
1. "zona": la categoría del trabajo (una de las zonas válidas).
2. "empleado_id": el id del técnico que ejecutó o tiene asignado el trabajo. REGLA DE ORO: Si en "Encargado previo/Asignado" o en "Descripción/Encargo" aparece el nombre o especialidad de alguno de los técnicos disponibles (ej. "Rafael", "Jorge", "Leandro", "Mecánico", "Alineación"), DEBES asignar su id obligatoriamente y poner confianza 0.9 o 1.0. Si hay varios técnicos mencionados, elige al técnico principal de esa especialidad. Si no aparece ningún técnico o mecánico, usa null. Nunca confundas al usuario administrativo o caja con el técnico.
3. "es_taller": true SOLO si el trabajo lo hizo el taller genéricamente sin un técnico identificable y no se menciona ningún mecánico.
4. "servicio_key": para escapes/silenciadores usa una de: silenciador, resonador, flexible, gomas, soldadura, extra, revision. Para otras zonas usa null.
5. "tipo_trabajo": descripción corta del tipo (ej. "alineacion", "revision", "reparacion caucho", "soldadura escape").
6. "mano_obra": estima qué porción del monto es MANO DE OBRA (no repuestos). Si el trabajo es puro servicio (alineación, revisión, soldadura), mano_obra = monto completo. Si claramente incluye repuestos caros (ej. "reemplazo base amortiguadores $60"), estima solo la porción de trabajo. Nunca mayor al monto.
7. "confianza": 0.0 a 1.0 según qué tan seguro estás.
8. "razon": explicación en 1 frase corta indicando por qué asignaste al técnico.

OPERACIONES:
${opsList}

Responde SOLO con un array JSON válido, sin markdown ni texto adicional, con exactamente ${ops.length} objetos en el mismo orden. Formato de cada objeto:
{"idx":0,"zona":"...","empleado_id":"..."|null,"es_taller":false,"servicio_key":null,"tipo_trabajo":"...","mano_obra":0,"confianza":0.0,"razon":"..."}`;

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Intenta extraer el array del texto
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Respuesta de Gemini no parseable');
    parsed = JSON.parse(match[0]);
  }

  const techById = new Map(technicians.map(t => [t.id, t]));

  return ops.map((op, idx) => {
    const r = parsed.find(p => p.idx === idx) || parsed[idx] || {};
    const zona = ZONAS.includes(r.zona) ? r.zona : 'general';
    let empleadoId: string | null = r.empleado_id && techById.has(r.empleado_id) ? r.empleado_id : null;
    const esTaller = !empleadoId && (r.es_taller === true);
    const emp = empleadoId ? techById.get(empleadoId) : null;
    const manoObra = Math.min(Number(op.monto) || 0, Math.max(0, Number(r.mano_obra) || 0)) || (Number(op.monto) || 0);
    const confianza = Math.max(0, Math.min(1, Number(r.confianza) || 0.5));

    return {
      origen: op.origen,
      origen_id: op.origen_id,
      fecha: op.fecha,
      descripcion: op.descripcion,
      cliente: op.cliente,
      vehiculo: op.vehiculo,
      monto: op.monto,
      moneda: op.moneda,
      tasa_cambio: op.tasa_cambio,
      encargado_detectado: op.encargado_detectado,
      zona,
      tipo_trabajo: r.tipo_trabajo || zona,
      servicio_key: r.servicio_key || null,
      empleado_id: empleadoId,
      empleado_nombre: emp?.nombre || (esTaller ? 'Taller (sin técnico)' : null),
      es_taller: esTaller,
      mano_obra: manoObra,
      ingreso_total: Number(op.monto) || 0,
      confianza,
      razon: r.razon || 'Clasificado por IA',
      requiere_revision: confianza < 0.6 || (!empleadoId && !esTaller),
    };
  });
}

/** Clasificación heurística de respaldo (sin IA) por palabras clave. */
export function heuristicClassify(op: RawOperation, technicians: Technician[]): ClassifiedOperation {
  const d = (op.descripcion || '').toLowerCase();
  let zona = 'general';
  let servicioKey: string | null = null;

  if (/aline|balance/.test(d)) zona = 'alineacion';
  else if (/silenci|escape|resonad|flexible|soldad|empacadura|bajante/.test(d)) { zona = 'escape'; }
  else if (/caucho|goma|rueda|neumat|reparaci[oó]n caucho|rotaci/.test(d)) zona = 'cauchera';
  else if (/freno|pastilla|disco/.test(d)) zona = 'frenos';
  else if (/lavado|pulitura|encerad/.test(d)) zona = 'autolavado';
  else if (/sensor|electr|luz|bater|alternador/.test(d)) zona = 'electronica';
  else if (/motor|amortiguad|suspensi|aceite|correa|mec[aá]nic|base/.test(d)) zona = 'mecanica';

  if (zona === 'escape') {
    if (/silenci/.test(d)) servicioKey = 'silenciador';
    else if (/resonad/.test(d)) servicioKey = 'resonador';
    else if (/flexible/.test(d)) servicioKey = 'flexible';
    else if (/goma/.test(d)) servicioKey = 'gomas';
    else if (/soldad/.test(d)) servicioKey = 'soldadura';
    else if (/revis/.test(d)) servicioKey = 'revision';
    else servicioKey = 'extra';
  }

  // Intenta emparejar técnico por "encargado_detectado" o en la misma descripción (nunca por registrado_por)
  let empleadoId: string | null = null;
  let empleadoNombre: string | null = null;
  const targetText = `${op.encargado_detectado || ''} ${op.descripcion || ''}`.toLowerCase();
  for (const t of technicians) {
    if (!t.nombre) continue;
    const firstWord = t.nombre.toLowerCase().split(' ')[0];
    if (firstWord && firstWord.length > 2 && targetText.includes(firstWord)) {
      empleadoId = t.id;
      empleadoNombre = t.nombre;
      break;
    }
  }

  return {
    origen: op.origen, origen_id: op.origen_id, fecha: op.fecha,
    descripcion: op.descripcion, cliente: op.cliente, vehiculo: op.vehiculo,
    monto: op.monto, moneda: op.moneda, tasa_cambio: op.tasa_cambio,
    encargado_detectado: op.encargado_detectado,
    zona, tipo_trabajo: zona, servicio_key: servicioKey,
    empleado_id: empleadoId, empleado_nombre: empleadoNombre,
    es_taller: !empleadoId,
    mano_obra: Number(op.monto) || 0,
    ingreso_total: Number(op.monto) || 0,
    confianza: empleadoId ? 0.8 : 0.3,
    razon: empleadoId ? `Técnico detectado por mención en orden: ${empleadoNombre}` : 'Clasificación heurística (sin técnico detectado)',
    requiere_revision: !empleadoId,
  };
}

/**
 * Reúne las operaciones sin asignar del período desde ventas_dia y servicios.
 * Excluye las que ya tienen job_assignment (por referencia_id) para no duplicar.
 */
export async function gatherUnassignedOperations(
  db: SupabaseClient,
  periodo: { inicio: string; fin: string; sedeId?: string | null }
): Promise<RawOperation[]> {
  const ops: RawOperation[] = [];

  // Ya asignadas (para excluir)
  const { data: existing } = await db.from('job_assignments')
    .select('referencia_id, referencia_tabla')
    .gte('fecha', periodo.inicio).lte('fecha', periodo.fin);
  const asignadas = new Set((existing || []).map((e: any) => `${e.referencia_tabla}:${e.referencia_id}`));

  // ── ventas_dia con desglose ──
  let vq = db.from('ventas_dia').select('id, fecha, cliente, desglose, notas, moneda, tasa_cambio, total_ingresos, creado_por')
    .gte('fecha', periodo.inicio).lte('fecha', periodo.fin);
  if (periodo.sedeId) vq = vq.eq('sede_id', periodo.sedeId);
  const { data: ventas } = await vq;

  for (const v of (ventas || []) as any[]) {
    if (asignadas.has(`ventas_dia:${v.id}`)) continue;
    const desglose = Array.isArray(v.desglose) ? v.desglose : [];
    if (desglose.length > 0) {
      desglose.forEach((item: any, i: number) => {
        const monto = Number(item.total ?? item.precio ?? 0);
        if (monto <= 0) return;
        ops.push({
          origen: 'ventas_dia', origen_id: `${v.id}#${i}`, fecha: v.fecha,
          descripcion: item.nombre || item.descripcion || v.notas || 'Servicio',
          cliente: v.cliente, vehiculo: null, monto, moneda: v.moneda || 'USD',
          tasa_cambio: v.tasa_cambio, registrado_por: v.creado_por,
        });
      });
    } else if (Number(v.total_ingresos) > 0) {
      ops.push({
        origen: 'ventas_dia', origen_id: v.id, fecha: v.fecha,
        descripcion: v.notas || 'Venta', cliente: v.cliente, vehiculo: null,
        monto: Number(v.total_ingresos), moneda: v.moneda || 'USD',
        tasa_cambio: v.tasa_cambio, registrado_por: v.creado_por,
      });
    }
  }

  // ── servicios ──
  let sq = db.from('servicios').select(`
    id, fecha, descripcion, tipo, tipo_personalizado, nombre_cliente, vehiculo_info, placa, costo_final, costo_estimado, registrado_por, estado, notas, seguimiento, items,
    vehiculos (marca, modelo, placa, clientes (nombre, apellido))
  `).gte('fecha', periodo.inicio).lte('fecha', periodo.fin);
  if (periodo.sedeId) sq = sq.eq('sede_id', periodo.sedeId);
  const { data: servicios } = await sq;

  for (const s of (servicios || []) as any[]) {
    if (asignadas.has(`servicios:${s.id}`)) continue;
    let monto = Number(s.costo_final ?? s.costo_estimado ?? 0);
    if (monto <= 0 && Array.isArray(s.items)) {
      monto = s.items.reduce((acc: number, it: any) => acc + (Number(it.precio || it.costo || 0) * (Number(it.cantidad) || 1)), 0);
    }
    if (monto <= 0) continue;

    const relName = s.vehiculos?.clientes
      ? `${s.vehiculos.clientes.nombre} ${s.vehiculos.clientes.apellido}`.trim()
      : '';
    const cliente = relName || s.nombre_cliente || 'Cliente de taller';
    const relVeh = s.vehiculos ? `${s.vehiculos.marca} ${s.vehiculos.modelo}`.trim() : '';
    const placaStr = s.vehiculos?.placa || s.placa || '';
    const vehiculo = (relVeh || s.vehiculo_info || 'Vehículo de taller') + (placaStr ? ` [Placa: ${placaStr}]` : '');

    // Extraer la descripción real y detallada
    let descReal = s.tipo_personalizado || s.descripcion || '';
    if (!descReal && Array.isArray(s.items) && s.items.length > 0) {
      descReal = s.items.map((it: any) => `${it.nombre || it.descripcion || 'Ítem'}${it.cantidad > 1 ? ` (x${it.cantidad})` : ''}`).join(' + ');
    }
    if (!descReal) descReal = s.tipo || 'Servicio de taller';

    // Extraer exhaustivamente el técnico asignado / encargado desde notas o seguimiento
    const asignados: string[] = [];
    if (s.notas) {
      const m = String(s.notas).match(/Encargados?:\s*(.+?)(?:\n|$)/i);
      if (m && m[1]) {
        asignados.push(m[1].trim());
      } else if (/mec[aá]nico|jefe|t[eé]cnico|alineaci[oó]n|escape/i.test(s.notas)) {
        asignados.push(s.notas.trim());
      }
    }
    if (Array.isArray(s.seguimiento)) {
      s.seguimiento.forEach((seg: any) => {
        if (seg && seg.accion) {
          if (/encargado|asignado|mec[aá]nico|t[eé]cnico/i.test(seg.accion)) {
            const m = seg.accion.match(/encargado\s*asignado:\s*([^\n\r]+)/i);
            if (m && m[1]) asignados.push(m[1].trim());
            else asignados.push(seg.accion.trim());
          }
        }
      });
    }
    const asignadoA = asignados.length > 0 ? Array.from(new Set(asignados)).join(' | ') : null;

    ops.push({
      origen: 'servicios', origen_id: s.id, fecha: s.fecha,
      descripcion: descReal,
      cliente, vehiculo,
      monto, moneda: 'USD', tasa_cambio: null, registrado_por: s.registrado_por,
      encargado_detectado: asignadoA,
    });
  }

  return ops;
}
