import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/** Anula un trabajo (y sus overrides en cascada). Sólo admin/supervisor. No si ya está liquidado. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!['admin', 'supervisor'].includes(resolveRol(auth.user!.rol))) {
    return NextResponse.json({ error: 'Sólo Administración o Supervisor pueden anular trabajos.' }, { status: 403 });
  }
  const { id } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { /* opcional */ }

  const { data: job } = await auth.db.from('job_assignments').select('*').eq('id', id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Trabajo no encontrado.' }, { status: 404 });
  if (job.estado === 'liquidado') {
    return NextResponse.json({ error: 'No se puede anular un trabajo ya liquidado.' }, { status: 400 });
  }

  const accion = body.estado === 'pendiente' ? 'pendiente' : 'anulado';
  // Anula el trabajo y sus overrides hijos.
  await auth.db.from('job_assignments').update({ estado: accion, updated_at: new Date().toISOString() }).eq('id', id);
  await auth.db.from('job_assignments').update({ estado: accion, updated_at: new Date().toISOString() }).eq('override_de', id);

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'nomina', accion: accion === 'anulado' ? 'Trabajo anulado' : 'Trabajo reactivado',
    detalles: `${job.empleado_nombre || 'Taller'} · ${job.zona} · $${job.comision_usd}`,
    referencia_id: id, referencia_tabla: 'job_assignments', sede_id: job.sede_id,
  });
  return NextResponse.json({ success: true });
}
