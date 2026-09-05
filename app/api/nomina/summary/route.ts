import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getPayrollService } from '@/lib/payroll/service';
import { resolveRol, getRoleMeta } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Consolidado de nómina del período.
 *  · Admin / supervisor / dueño / cobranza: ven a todo el personal.
 *  · Mecánico / jefe de taller (técnicos): sólo su propio resumen.
 * Query: ?inicio=YYYY-MM-DD&fin=YYYY-MM-DD&sede=<id>
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const hoy = new Date();
  const inicio = url.searchParams.get('inicio') || isoWeekStart(hoy);
  const fin = url.searchParams.get('fin') || isoWeekEnd(hoy);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  const svc = getPayrollService(auth.db);
  try {
    const rol = resolveRol(auth.user!.rol);
    const esTecnico = getRoleMeta(rol)?.esTecnico && rol !== 'admin';
    // Un técnico sólo se ve a sí mismo (alcance restringido).
    if (esTecnico) {
      const self = await svc.calculateEmployeeWeeklyEarnings(auth.user!.id, { inicio, fin, sedeId: sede });
      return NextResponse.json({ periodo: { inicio, fin }, sede, summary: [self], scope: 'self' });
    }
    const summary = await svc.getPayrollSummary({ inicio, fin, sedeId: sede });
    return NextResponse.json({ periodo: { inicio, fin }, sede, summary, scope: 'all' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function isoWeekStart(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}
function isoWeekEnd(d: Date): string {
  const x = new Date(isoWeekStart(d) + 'T00:00:00');
  x.setDate(x.getDate() + 6);
  return x.toISOString().slice(0, 10);
}
