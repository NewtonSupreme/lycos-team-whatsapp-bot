import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { buildUtilidad } from '@/lib/utilidad';

export const dynamic = 'force-dynamic';

/**
 * Utilidad por Cliente / Vehículo = Ingresos (ventas_dia) − Egresos (egresos).
 * ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sede=<id>
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const hoy = new Date();
  const desde = url.searchParams.get('desde') || new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const hasta = url.searchParams.get('hasta') || hoy.toISOString().slice(0, 10);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  const filas = await buildUtilidad(auth.db, { desde, hasta, sedeId: sede });

  const totales = filas.reduce(
    (a, f) => ({
      ingresos: a.ingresos + f.ingresos,
      egresos: a.egresos + f.egresos,
      utilidad: a.utilidad + f.utilidad,
    }),
    { ingresos: 0, egresos: 0, utilidad: 0 }
  );

  return NextResponse.json({
    periodo: { desde, hasta },
    filas,
    totales: {
      ingresos: Number(totales.ingresos.toFixed(2)),
      egresos: Number(totales.egresos.toFixed(2)),
      utilidad: Number(totales.utilidad.toFixed(2)),
    },
  });
}
