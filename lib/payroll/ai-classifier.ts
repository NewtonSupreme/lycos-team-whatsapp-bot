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
    `#${idx} | ${o.fecha} | ${o.descripcion} | Cliente: ${o.cliente || '-'} | Vehículo: ${o.vehiculo || '-'} | Monto: ${o.monto} ${o.moneda} | Registrado por: ${o.registrado_por || '-'}`
  ).join('\n');

  const prompt = `Eres un experto en un taller automotriz (Lycos Team) que clasifica trabajos para calcular comisiones de técnicos.

TÉCNICOS DISPONIBLES:
${techList}

ZONAS VÁLIDAS: ${ZONAS.join(', ')}

Para cada operación, determina:
1. "zona": la categoría del trabajo (una de las zonas válidas).
2. "empleado_id": el id del técnico que probablemente ejecutó el trabajo, inferido por el tipo de servicio y su especialidad, o por quién lo registró. Si no puedes inferir un técnico concreto, usa null.
3. "es_taller": true SOLO si el trabajo lo hizo el taller genéricamente sin un técnico identificable.
4. "servicio_key": para escapes/silenciadores usa una de: silenciador, resonador, flexible, gomas, soldadura, extra, revision. Para otras zonas usa null.
5. "tipo_trabajo": descripción corta del tipo (ej. "alineacion", "revision", "reparacion caucho", "soldadura escape").
6. "mano_obra": estima qué porción del monto es MANO DE OBRA (no repuestos). Si el trabajo es puro servicio (alineación, revisión, soldadura), mano_obra = monto completo. Si claramente incluye repuestos caros (ej. "reemplazo base amortiguadores $60"), estima solo la porción de trabajo. Nunca mayor al monto.
7. "confianza": 0.0 a 1.0 según qué tan seguro estás.
8. "razon": explicación en 1 frase corta.

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

  // Intenta emparejar técnico por "registrado_por"
  let empleadoId: string | null = null;
  let empleadoNombre: string | null = null;
  if (op.registrado_por) {
    const reg = op.registrado_por.toLowerCase();
    const match = technicians.find(t => t.nombre && reg.includes(t.nombre.toLowerCase().split(' ')[0]));
    if (match) { empleadoId = match.id; empleadoNombre = match.nombre; }
  }

  return {
    origen: op.origen, origen_id: op.origen_id, fecha: op.fecha,
    descripcion: op.descripcion, cliente: op.cliente, vehiculo: op.vehiculo,
    monto: op.monto, moneda: op.moneda, tasa_cambio: op.tasa_cambio,
    zona, tipo_trabajo: zona, servicio_key: servicioKey,
    empleado_id: empleadoId, empleado_nombre: empleadoNombre,
    es_taller: !empleadoId,
    mano_obra: Number(op.monto) || 0,
    ingreso_total: Number(op.monto) || 0,
    confianza: empleadoId ? 0.4 : 0.2,
    razon: 'Clasificación heurística (IA no disponible)',
    requiere_revision: true,
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
  let sq = db.from('servicios').select('id, fecha, descripcion, tipo, nombre_cliente, vehiculo_info, costo_final, costo_estimado, registrado_por, estado')
    .gte('fecha', periodo.inicio).lte('fecha', periodo.fin);
  if (periodo.sedeId) sq = sq.eq('sede_id', periodo.sedeId);
  const { data: servicios } = await sq;

  for (const s of (servicios || []) as any[]) {
    if (asignadas.has(`servicios:${s.id}`)) continue;
    const monto = Number(s.costo_final ?? s.costo_estimado ?? 0);
    if (monto <= 0) continue;
    ops.push({
      origen: 'servicios', origen_id: s.id, fecha: s.fecha,
      descripcion: s.descripcion || s.tipo || 'Servicio',
      cliente: s.nombre_cliente, vehiculo: s.vehiculo_info,
      monto, moneda: 'USD', tasa_cambio: null, registrado_por: s.registrado_por,
    });
  }

  return ops;
}
