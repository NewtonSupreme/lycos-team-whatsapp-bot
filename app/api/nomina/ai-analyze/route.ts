import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';
import { getPayrollService } from '@/lib/payroll/service';
import { classifyOperations, gatherUnassignedOperations } from '@/lib/payroll/ai-classifier';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Motor de comisiones con IA.
 *  · GET  ?inicio&fin&sede  → PREVIEW: analiza operaciones sin asignar del período
 *    con Gemini y devuelve la clasificación (sin persistir).
 *  · POST { inicio, fin, sede, operaciones[] } → COMMIT: crea job_assignments a
 *    partir de las operaciones (posiblemente editadas por el admin en el panel).
 *
 * Solo admin/supervisor/dueño. La IA clasifica; el motor determinista calcula.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rol = resolveRol(auth.user!.rol);
  if (!['admin', 'supervisor', 'dueño'].includes(rol)) {
    return NextResponse.json({ error: 'No autorizado para analizar comisiones.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const inicio = url.searchParams.get('inicio');
  const fin = url.searchParams.get('fin');
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  if (!inicio || !fin) return NextResponse.json({ error: 'Faltan fechas inicio/fin' }, { status: 400 });

  try {
    const svc = getPayrollService(auth.db);
    const technicians = await svc.getTechnicians(sede);
    const ops = await gatherUnassignedOperations(auth.db, { inicio, fin, sedeId: sede });

    if (ops.length === 0) {
      return NextResponse.json({ periodo: { inicio, fin }, sede, total: 0, operaciones: [], mensaje: 'No hay operaciones sin asignar en este período.' });
    }

    const classified = await classifyOperations(ops, technicians);

    // Estadísticas para el panel
    const stats = {
      total: classified.length,
      con_tecnico: classified.filter(c => c.empleado_id).length,
      taller: classified.filter(c => c.es_taller).length,
      requieren_revision: classified.filter(c => c.requiere_revision).length,
      monto_total: Math.round(classified.reduce((s, c) => s + c.ingreso_total, 0) * 100) / 100,
    };

    return NextResponse.json({ periodo: { inicio, fin }, sede, stats, operaciones: classified });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rol = resolveRol(auth.user!.rol);
  if (!['admin', 'supervisor', 'dueño'].includes(rol)) {
    return NextResponse.json({ error: 'No autorizado para registrar comisiones.' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const operaciones = Array.isArray(body.operaciones) ? body.operaciones : [];
  const sede = auth.effectiveSede(body.sede ?? null);
  if (operaciones.length === 0) return NextResponse.json({ error: 'No hay operaciones para registrar.' }, { status: 400 });

  const svc = getPayrollService(auth.db);
  const creados: any[] = [];
  const errores: any[] = [];

  for (const op of operaciones) {
    // Saltar las que el admin marcó como omitidas
    if (op.omitir) continue;
    try {
      const { executor, overrides } = await svc.createJobAssignment({
        empleado_id: op.empleado_id ?? null,
        es_taller: !!op.es_taller,
        zona: op.zona || 'general',
        tipo_trabajo: op.tipo_trabajo ?? op.zona,
        descripcion: op.descripcion ?? null,
        servicio_key: op.servicio_key ?? null,
        ingreso_total: Number(op.ingreso_total ?? op.monto) || 0,
        mano_obra: op.mano_obra != null ? Number(op.mano_obra) : undefined,
        moneda: op.moneda || 'USD',
        tasa_cambio: op.tasa_cambio ? Number(op.tasa_cambio) : undefined,
        fecha: op.fecha,
        referencia_tabla: op.origen || 'manual',
        referencia_id: op.origen_id ? String(op.origen_id).split('#')[0] : null,
        cliente: op.cliente ?? null,
        vehiculo: op.vehiculo ?? null,
        sede_id: sede,
        created_by: auth.user!.nombre,
      });
      creados.push({ executor: executor.id, overrides: overrides.map(o => o.id) });
    } catch (e: any) {
      errores.push({ descripcion: op.descripcion, error: e.message });
    }
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'nomina',
    accion: 'Comisiones registradas por IA',
    detalles: `${creados.length} trabajo(s) creados · ${errores.length} error(es)`,
    sede_id: sede,
  });

  return NextResponse.json({ success: true, creados: creados.length, errores, detalle: creados });
}
