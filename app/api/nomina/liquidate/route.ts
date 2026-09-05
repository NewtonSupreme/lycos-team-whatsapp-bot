import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getPayrollService } from '@/lib/payroll/service';
import { resolveRol } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/**
 * Liquida (paga) la nómina de un empleado en un período. Acción sensible:
 * sólo admin o supervisor. Crea el ledger + recibo y marca trabajos como pagados.
 * Body: { empleado_id, inicio, fin, sede?, metodo_pago?, nota?, deduccionesExtra? }
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rol = resolveRol(auth.user!.rol);
  if (!['admin', 'supervisor'].includes(rol)) {
    return NextResponse.json({ error: 'Sólo Administración o Supervisor pueden liquidar nómina.' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const { empleado_id, inicio, fin, metodo_pago, nota, deduccionesExtra } = body || {};
  if (!empleado_id || !inicio || !fin) {
    return NextResponse.json({ error: 'Faltan empleado_id, inicio o fin.' }, { status: 400 });
  }
  const sede = auth.effectiveSede(body.sede ?? null);

  const svc = getPayrollService(auth.db);
  try {
    const ledger = await svc.liquidate({
      employeeId: empleado_id,
      periodo: { inicio, fin, sedeId: sede },
      metodo_pago, nota, createdBy: auth.user!.nombre,
      deduccionesExtra: Number(deduccionesExtra) || 0,
    });
    await logActivityServer(auth.db, {
      usuario: auth.user!.nombre, modulo: 'nomina', accion: 'Liquidación de nómina',
      detalles: `Recibo ${ledger.recibo_numero} · ${ledger.empleado_nombre} · $${ledger.total_pagar} (${inicio} → ${fin})`,
      referencia_id: ledger.id, referencia_tabla: 'payroll_ledger', sede_id: sede,
    });
    return NextResponse.json({ ledger });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
