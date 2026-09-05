import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { fetchNominaRates, rateForMoneda, toUsd } from '@/lib/payroll/currency';
import { resolveRol, getRoleMeta } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const empleado = url.searchParams.get('empleado');
  const estado = url.searchParams.get('estado');

  let q = auth.db.from('payroll_advances').select('*').order('fecha', { ascending: false }).limit(500);
  if (sede) q = q.eq('sede_id', sede);
  if (estado) q = q.eq('estado', estado);

  const rol = resolveRol(auth.user!.rol);
  const esTecnico = getRoleMeta(rol)?.esTecnico && rol !== 'admin';
  if (esTecnico) q = q.eq('empleado_id', auth.user!.id);
  else if (empleado) q = q.eq('empleado_id', empleado);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ advances: data || [] });
}

/** Registra un adelanto/deducción. Sólo admin/supervisor. */
export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!['admin', 'supervisor'].includes(resolveRol(auth.user!.rol))) {
    return NextResponse.json({ error: 'Sólo Administración o Supervisor pueden registrar adelantos.' }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body.empleado_id || body.monto == null) {
    return NextResponse.json({ error: 'empleado_id y monto requeridos.' }, { status: 400 });
  }
  const moneda = body.moneda || 'USD';
  let tasa = Number(body.tasa_cambio) || 0;
  if (!tasa || tasa <= 0) {
    const rates = await fetchNominaRates();
    tasa = rateForMoneda(moneda, rates);
  }
  const monto = Number(body.monto) || 0;
  const sede = auth.effectiveSede(body.sede ?? null);

  const { data: emp } = await auth.db.from('usuarios').select('nombre').eq('id', body.empleado_id).maybeSingle();

  const { data, error } = await auth.db.from('payroll_advances').insert({
    empleado_id: body.empleado_id, empleado_nombre: emp?.nombre ?? null,
    fecha: body.fecha || new Date().toISOString().slice(0, 10),
    monto, moneda, tasa_cambio: tasa, monto_usd: toUsd(monto, tasa),
    motivo: body.motivo ?? null, estado: 'pendiente',
    sede_id: sede, created_by: auth.user!.nombre,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'nomina', accion: 'Adelanto registrado',
    detalles: `${emp?.nombre || ''} · ${moneda} ${monto} · ${body.motivo || ''}`,
    referencia_id: data.id, referencia_tabla: 'payroll_advances', sede_id: sede,
  });
  return NextResponse.json({ advance: data });
}
