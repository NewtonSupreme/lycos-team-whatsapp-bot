import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const ALLOWED = ['empleado_id', 'zona', 'servicio_key', 'label', 'monto', 'moneda', 'activo', 'sede_id'];

export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const { data, error } = await auth.db.from('flat_rate_catalog').select('*').order('label');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let rows = data || [];
  if (sede) rows = rows.filter((r: any) => !r.sede_id || r.sede_id === sede);
  return NextResponse.json({ flatRates: rows });
}

export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body.servicio_key || !body.label) return NextResponse.json({ error: 'servicio_key y label requeridos' }, { status: 400 });
  const payload: any = {};
  for (const k of ALLOWED) if (body[k] !== undefined) payload[k] = body[k];
  if (payload.sede_id === undefined && !auth.user!.multiSede) payload.sede_id = auth.user!.sede_id;
  const { data, error } = await auth.db.from('flat_rate_catalog').insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flatRate: data });
}
