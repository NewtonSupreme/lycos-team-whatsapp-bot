import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getPayrollService } from '@/lib/payroll/service';

export const dynamic = 'force-dynamic';

/**
 * Calcula EN VIVO la comisión de cada técnico según sus reglas, SIN guardar nada.
 * Lo consume el formulario de la orden de servicio para mostrar cuánto le toca a
 * cada empleado (y el override en cascada del jefe de taller) antes de guardar.
 *
 * Body: { sede?, jobs: [{ empleado_id, es_taller, zona, ingreso_total, mano_obra, servicio_key?, cantidad?, moneda? }] }
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const items: any[] = Array.isArray(body.jobs) ? body.jobs : [];
  if (items.length === 0) return NextResponse.json({ preview: [] });

  const sede = auth.effectiveSede(body.sede ?? null);
  const svc = getPayrollService(auth.db);

  try {
    const preview = await svc.previewJobs(
      items.map(it => ({
        empleado_id: it.empleado_id ?? null,
        es_taller: !!it.es_taller,
        zona: it.zona || 'general',
        ingreso_total: Number(it.ingreso_total) || 0,
        mano_obra: it.mano_obra != null ? Number(it.mano_obra) : undefined,
        servicio_key: it.servicio_key ?? null,
        cantidad: it.cantidad ?? 1,
        moneda: it.moneda || 'USD',
        sede_id: sede,
      }))
    );
    return NextResponse.json({ preview });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
