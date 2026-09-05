import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/auth-server';
import { getTasaDia } from '@/lib/tasas';

export const dynamic = 'force-dynamic';

/**
 * Tasas vigentes para una FECHA concreta.
 *   GET /api/tasas               → tasas de hoy (y las cachea)
 *   GET /api/tasas?fecha=2026-07-09 → tasas vigentes ese día
 *
 * Devuelve: { fecha, bcv (Bs/$), paralelo (Bs/$), eur_bs (Bs/€), fuente, aproximada }
 */
export async function GET(req: NextRequest) {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Sin base de datos' }, { status: 500 });

  const fecha = new URL(req.url).searchParams.get('fecha');
  const tasas = await getTasaDia(db, fecha);
  return NextResponse.json(tasas);
}
