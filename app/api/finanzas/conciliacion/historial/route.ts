import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/*
 * Seguimiento de las conciliaciones: cada vez que se concilió un estado de cuenta
 * (con su avance frente a la corrida anterior del mismo período) y cada decisión
 * tomada sobre un movimiento, con quién, cuándo, el valor de antes y de después y
 * la tasa exacta usada.
 *
 *   GET ?banco=exterior&limite=60
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.can('ventas', 'leer')) return NextResponse.json({ error: 'Sin permiso para ver las finanzas.' }, { status: 403 });

  const url = new URL(req.url);
  const banco = url.searchParams.get('banco');
  const limite = Math.min(200, Math.max(1, Number(url.searchParams.get('limite')) || 60));
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  let qc = auth.db.from('conciliacion_corridas').select('*').order('created_at', { ascending: false }).limit(limite);
  let qa = auth.db.from('conciliacion_acciones').select('*').order('created_at', { ascending: false }).limit(limite * 3);
  if (banco) { qc = qc.eq('banco', banco); qa = qa.eq('banco', banco); }
  if (sede) { qc = qc.eq('sede_id', sede); qa = qa.eq('sede_id', sede); }

  const [c, a] = await Promise.all([qc, qa]);
  if (c.error || a.error) {
    return NextResponse.json({ error: c.error?.message || a.error?.message || 'No se pudo leer el historial.' }, { status: 500 });
  }
  return NextResponse.json({ corridas: c.data || [], acciones: a.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
