import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol, getRoleMeta } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/** Detalle de una liquidación (recibo). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;

  const { data: ledger, error } = await auth.db.from('payroll_ledger').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ledger) return NextResponse.json({ error: 'Liquidación no encontrada.' }, { status: 404 });

  // Técnico sólo puede ver su propio recibo.
  const rol = resolveRol(auth.user!.rol);
  const esTecnico = getRoleMeta(rol)?.esTecnico && rol !== 'admin';
  if (esTecnico && ledger.empleado_id !== auth.user!.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { data: jobs } = await auth.db.from('job_assignments').select('*').eq('payroll_ledger_id', id).order('fecha');
  return NextResponse.json({ ledger, jobs: jobs || [] });
}

/** Anula una liquidación: revierte trabajos a 'pendiente' y adelantos a 'pendiente'. Sólo admin. */
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (resolveRol(auth.user!.rol) !== 'admin') {
    return NextResponse.json({ error: 'Sólo el Administrador puede anular una liquidación.' }, { status: 403 });
  }
  const { id } = await params;
  const { data: ledger } = await auth.db.from('payroll_ledger').select('*').eq('id', id).maybeSingle();
  if (!ledger) return NextResponse.json({ error: 'Liquidación no encontrada.' }, { status: 404 });
  if (ledger.estado === 'anulado') return NextResponse.json({ error: 'Ya está anulada.' }, { status: 400 });

  await auth.db.from('job_assignments')
    .update({ estado: 'pendiente', payroll_ledger_id: null, updated_at: new Date().toISOString() })
    .eq('payroll_ledger_id', id);
  await auth.db.from('payroll_advances')
    .update({ estado: 'pendiente', payroll_ledger_id: null }).eq('payroll_ledger_id', id);
  await auth.db.from('payroll_ledger')
    .update({ estado: 'anulado', updated_at: new Date().toISOString() }).eq('id', id);

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'nomina', accion: 'Liquidación anulada',
    detalles: `Recibo ${ledger.recibo_numero} · ${ledger.empleado_nombre}`,
    referencia_id: id, referencia_tabla: 'payroll_ledger', sede_id: ledger.sede_id,
  });
  return NextResponse.json({ success: true });
}
