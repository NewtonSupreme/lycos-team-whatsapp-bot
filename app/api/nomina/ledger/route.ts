import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol, getRoleMeta } from '@/types';

export const dynamic = 'force-dynamic';

/** Historial de liquidaciones (pagos de nómina) con filtros. Técnicos: sólo los suyos. */
export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const empleado = url.searchParams.get('empleado');
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  const estado = url.searchParams.get('estado');

  let q = auth.db.from('payroll_ledger').select('*').order('created_at', { ascending: false }).limit(500);
  if (sede) q = q.eq('sede_id', sede);
  if (estado) q = q.eq('estado', estado);
  if (desde) q = q.gte('periodo_inicio', desde);
  if (hasta) q = q.lte('periodo_fin', hasta);

  const rol = resolveRol(auth.user!.rol);
  const esTecnico = getRoleMeta(rol)?.esTecnico && rol !== 'admin';
  if (esTecnico) q = q.eq('empleado_id', auth.user!.id);
  else if (empleado) q = q.eq('empleado_id', empleado);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ledgers: data || [] });
}
