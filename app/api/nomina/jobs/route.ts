import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getPayrollService } from '@/lib/payroll/service';
import { resolveRol, getRoleMeta } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/** Lista de trabajos (job_assignments). Técnicos: sólo los suyos. */
export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const inicio = url.searchParams.get('inicio');
  const fin = url.searchParams.get('fin');
  const empleadoParam = url.searchParams.get('empleado');
  const estado = url.searchParams.get('estado');
  const ref = url.searchParams.get('ref');           // referencia_id (para POS / detalle de venta)
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  let q = auth.db.from('job_assignments').select('*').order('fecha', { ascending: false }).limit(500);
  if (inicio) q = q.gte('fecha', inicio);
  if (fin) q = q.lte('fecha', fin);
  if (estado) q = q.eq('estado', estado);
  if (ref) q = q.eq('referencia_id', ref);
  if (sede) q = q.eq('sede_id', sede);

  // Técnico (no admin) sólo ve lo suyo.
  const rol = resolveRol(auth.user!.rol);
  const esTecnico = getRoleMeta(rol)?.esTecnico && rol !== 'admin';
  if (esTecnico) q = q.eq('empleado_id', auth.user!.id);
  else if (empleadoParam) q = q.eq('empleado_id', empleadoParam);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const svc = getPayrollService(auth.db);
  const enriched = await svc.enrichJobsWithClientInfo((data as any[]) || []);
  return NextResponse.json({ jobs: enriched });
}

/**
 * Registra un trabajo y su comisión (ejecutor + overrides en cascada).
 * Lo consume el POS (servicios/ventas) y la captura manual de Nómina.
 * Regla: SIEMPRE debe haber técnico encargado o marcar es_taller (lo hizo el taller).
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Puede crear quien gestiona nómina, servicios o ventas (POS).
  const canCreate = auth.can('nomina', 'crear') || auth.can('servicios', 'crear') || auth.can('ventas', 'crear');
  if (!canCreate) return NextResponse.json({ error: 'No tienes permiso para registrar trabajos.' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  // Soporta un solo trabajo o un arreglo (varios técnicos en una venta combinada).
  const items: any[] = Array.isArray(body.jobs) ? body.jobs : [body];
  const sede = auth.effectiveSede(body.sede ?? (items[0]?.sede_id ?? null));

  for (const it of items) {
    if (!it.empleado_id && !it.es_taller) {
      return NextResponse.json(
        { error: 'Cada trabajo requiere un técnico encargado o marcar "lo hizo el taller".' },
        { status: 400 }
      );
    }
    if (it.ingreso_total == null) {
      return NextResponse.json({ error: 'Falta el ingreso_total del trabajo.' }, { status: 400 });
    }
  }

  const svc = getPayrollService(auth.db);
  const created: any[] = [];
  try {
    // Re-sincronización: al EDITAR una orden se reemplazan sus asignaciones pendientes.
    // Los trabajos ya liquidados nunca se tocan (el histórico es intocable).
    const refId = body.referencia_id ?? items[0]?.referencia_id ?? null;
    if (body.replace === true && refId) {
      await auth.db.from('job_assignments')
        .delete()
        .eq('referencia_id', refId)
        .eq('estado', 'pendiente');
    }

    for (const it of items) {
      const res = await svc.createJobAssignment({
        empleado_id: it.empleado_id ?? null,
        es_taller: !!it.es_taller,
        zona: it.zona || 'general',
        tipo_trabajo: it.tipo_trabajo ?? null,
        descripcion: it.descripcion ?? null,
        servicio_key: it.servicio_key ?? null,
        cantidad: it.cantidad ?? 1,
        ingreso_total: Number(it.ingreso_total) || 0,
        mano_obra: it.mano_obra != null ? Number(it.mano_obra) : undefined,
        moneda: it.moneda || 'USD',
        tasa_cambio: it.tasa_cambio != null ? Number(it.tasa_cambio) : undefined,
        fecha: it.fecha,
        referencia_tabla: it.referencia_tabla ?? 'manual',
        referencia_id: it.referencia_id ?? null,
        cliente: it.cliente ?? null,
        vehiculo: it.vehiculo ?? null,
        placa: it.placa ?? null,
        sede_id: sede,
        created_by: auth.user!.nombre,
      });
      created.push(res);
    }
    const totComision = created.reduce((s, r) => s + (r.executor?.comision_usd || 0), 0);
    await logActivityServer(auth.db, {
      usuario: auth.user!.nombre, modulo: 'nomina', accion: 'Trabajo(s) registrado(s)',
      detalles: `${created.length} trabajo(s) · comisión total $${totComision.toFixed(2)}`,
      referencia_id: items[0]?.referencia_id ?? null, referencia_tabla: items[0]?.referencia_tabla ?? 'manual',
      sede_id: sede,
    });
    return NextResponse.json({ created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
