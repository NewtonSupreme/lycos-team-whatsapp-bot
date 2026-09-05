import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const ALLOWED = [
  'empleado_id', 'zona', 'tipo_regla', 'base', 'valor', 'moneda', 'aplica_monedas',
  'proveedor_pct', 'proveedor_nombre', 'prioridad', 'condiciones', 'descripcion', 'activo',
  'vigencia_desde', 'vigencia_hasta', 'sede_id',
];

function pick(body: any) {
  const out: any = {};
  for (const k of ALLOWED) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const empleado = url.searchParams.get('empleado');

  let q = auth.db.from('commission_rules').select('*').order('prioridad');
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let rows = data || [];
  if (sede) rows = rows.filter((r: any) => !r.sede_id || r.sede_id === sede);
  if (empleado) rows = rows.filter((r: any) => r.empleado_id === empleado);
  return NextResponse.json({ rules: rows });
}

export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body.tipo_regla) return NextResponse.json({ error: 'tipo_regla requerido' }, { status: 400 });

  const payload = pick(body);
  if (payload.sede_id === undefined && !auth.user!.multiSede) payload.sede_id = auth.user!.sede_id;

  const { data, error } = await auth.db.from('commission_rules').insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'nomina', accion: 'Regla de comisión creada',
    detalles: `${data.tipo_regla} · zona ${data.zona} · valor ${data.valor}`,
    referencia_id: data.id, referencia_tabla: 'commission_rules', sede_id: payload.sede_id ?? null,
  });
  return NextResponse.json({ rule: data });
}
