import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { analizarPeriodo } from '@/lib/utilidad/periodo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/*
 * Utilidad de un período y diagnóstico de lo que la distorsiona.
 *
 *   GET  ?desde=&hasta=&sede=      → { estado, diagnostico }
 *   POST { desde, hasta, sede }    → además, la lectura de la IA sobre esos mismos datos
 *
 * La IA NO calcula nada: recibe las cifras y los hallazgos ya calculados y los explica.
 * Se le prohíbe inventar montos; todo lo que diga tiene que estar en los datos que se le pasan.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

function rango(u: URLSearchParams | Record<string, unknown>) {
  const get = (k: string) => (u instanceof URLSearchParams ? u.get(k) : (u[k] as string | undefined)) || '';
  const hasta = FECHA.test(get('hasta')) ? get('hasta') : hoyCaracas();
  const desde = FECHA.test(get('desde')) ? get('desde') : `${hasta.slice(0, 8)}01`;
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
}

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.can('ventas', 'leer')) return NextResponse.json({ error: 'Sin permiso para ver las finanzas.' }, { status: 403 });
  const u = new URL(req.url).searchParams;
  const { desde, hasta } = rango(u);
  try {
    const r = await analizarPeriodo(auth.db, { desde, hasta, sede: auth.effectiveSede(u.get('sede')) });
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo calcular la utilidad: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.can('ventas', 'leer')) return NextResponse.json({ error: 'Sin permiso para ver las finanzas.' }, { status: 403 });
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return NextResponse.json({ error: 'La IA no está configurada (falta GEMINI_API_KEY).' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const { desde, hasta } = rango(b);

  try {
    const { estado: e, diagnostico: d } = await analizarPeriodo(auth.db, { desde, hasta, sede: auth.effectiveSede((b.sede as string) || null) });
    // Lo justo para que la IA razone con datos exactos, sin pasarle la base entera.
    const datos = {
      periodo: { desde, hasta, dias: e.dias, tasaHoy: e.tasaHoy },
      resultado: {
        ventasBaseUsd: e.ventas.base, ivaUsd: e.ventas.iva, nVentas: e.ventas.n, porDepartamento: e.ventas.porDepartamento,
        costoCarrosUsd: e.costoCarros.total, costoPorCategoria: e.costoCarros.porCategoria,
        gastosTallerUsd: e.gastosTaller.total, gastosPorCategoria: e.gastosTaller.porCategoria,
        utilidadBrutaUsd: e.utilidadBruta, utilidadUsd: e.utilidad, margenPct: e.margen,
        contadoRecibidoUsd: e.ventas.contadoRecibido, casheaInicialUsd: e.ventas.casheaInicial, casheaFinanciadoUsd: e.ventas.casheaFinanciado, creditoUsd: e.ventas.credito,
      },
      caja: e.caja,
      dias: e.porDia.filter(x => x.ventas || x.costo || x.gastos),
      diagnostico: {
        puntaje: d.puntaje, resumen: d.resumen,
        hallazgos: d.hallazgos.map(h => ({ titulo: h.titulo, severidad: h.severidad, efecto: h.efecto, impactoUsd: h.impactoUsd, total: h.total, explicacion: h.explicacion, ejemplos: h.registros.slice(0, 6) })),
        conciliacion: d.conciliacion,
      },
    };
    const prompt = [
      'Eres el auditor financiero de un taller mecánico en Venezuela (Lycos Team). Te paso el resultado de un período YA CALCULADO por el sistema y la lista de inconsistencias detectadas.',
      'Reglas estrictas: usa SOLO los números que aparecen en los datos; no inventes montos, clientes ni fechas; si algo no se puede saber con estos datos, dilo. Los montos están en dólares salvo que diga Bs. Escribe en español, claro y directo, para la dueña y la administradora.',
      'Responde en Markdown con estas secciones exactas:',
      '## Veredicto (2–3 frases: cuánto se ganó de verdad y si la cifra es confiable)',
      '## Qué está distorsionando la utilidad (ordenado por impacto, con montos y qué registros revisar)',
      '## Dinero que debió entrar y no está registrado (Cashea, cobros, conciliación)',
      '## Gastos: qué falta, qué sobra o se repite (alquiler, luz, nómina, repuestos, IVA)',
      '## Las 5 acciones de hoy (concretas, en orden)',
      '',
      'DATOS:',
      JSON.stringify(datos),
    ].join('\n');

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clave}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } }),
    });
    const j = await r.json().catch(() => ({}));
    const texto = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    if (!r.ok || !texto) return NextResponse.json({ error: `La IA no respondió: ${j?.error?.message || r.status}` }, { status: 502 });

    await logActivityServer(auth.db, { usuario: auth.user?.nombre || 'Usuario', modulo: 'Finanzas', accion: 'Analizó la utilidad con IA', detalles: `${desde} a ${hasta} · utilidad $${e.utilidad.toFixed(2)} · ${d.hallazgos.length} hallazgos`, referencia_tabla: 'utilidad', sede_id: auth.user?.sede_id || null });
    return NextResponse.json({ analisis: texto, generado: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo analizar: ${(e as Error).message}` }, { status: 500 });
  }
}
