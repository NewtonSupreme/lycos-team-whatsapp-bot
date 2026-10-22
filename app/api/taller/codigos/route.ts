import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getRoleMeta, resolveRol } from '@/types';
import { asignarCodigos, codigosEnClaro } from '@/lib/taller/codigos';
import { cuentaDelTrabajador, fechasDeCuenta } from '@/lib/taller/cuenta';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/*
 * Carnets del taller (solo Usuario Maestro): el personal del piso con su
 * código, y lo que cada uno ha cargado hoy y en la semana.
 *   GET                 → personal, códigos y resumen
 *   GET ?cuenta=<id>    → el detalle de uno (lo mismo que ve él en la TV)
 *   POST { empleados }  → código nuevo para esos (o { faltantes: true })
 */

async function soloMaestro() {
  const auth = await authorize('nomina', 'leer');
  if (auth.ok && resolveRol(auth.user!.rol) !== 'admin') {
    return { ...auth, ok: false, status: 403, error: 'Solo el Usuario Maestro maneja los carnets.' };
  }
  return auth;
}

async function personal(auth: Awaited<ReturnType<typeof authorize>>, sede: string | null) {
  let q = auth.db.from('usuarios').select('id, nombre, alias, foto_url, rol, cargo, especialidad, cedula, fecha_ingreso, sede_id').neq('activo', false).order('nombre');
  if (sede) q = q.eq('sede_id', sede);
  const { data } = await q;
  return (data || []).filter(u => getRoleMeta(u.rol)?.esTecnico && !/taller \(sin/i.test(u.nombre || ''));
}

export async function GET(req: NextRequest) {
  const auth = await soloMaestro();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = req.nextUrl.searchParams.get('cuenta');
  if (id) {
    const cuenta = await cuentaDelTrabajador(auth.db, id);
    return cuenta ? NextResponse.json(cuenta) : NextResponse.json({ error: 'No existe.' }, { status: 404 });
  }

  const sede = auth.effectiveSede(req.nextUrl.searchParams.get('sede'));
  const gente = await personal(auth, sede);
  const codigos = await codigosEnClaro(auth.db);

  // Resumen de hoy y de la semana para todos, en una sola consulta.
  const f = fechasDeCuenta();
  const { data: jobs } = gente.length
    ? await auth.db.from('job_assignments').select('empleado_id, fecha, ingreso_usd, es_override, estado')
      .in('empleado_id', gente.map(g => g.id)).gte('fecha', f.lunes).neq('estado', 'anulado')
    : { data: [] as Array<{ empleado_id: string; fecha: string; ingreso_usd: number; es_override: boolean; estado: string }> };
  const suma = (e: string, desde: string) => {
    const t = (jobs || []).filter(j => j.empleado_id === e && !j.es_override && j.fecha >= desde);
    return { cantidad: t.length, total: Math.round(t.reduce((a, j) => a + (Number(j.ingreso_usd) || 0), 0) * 100) / 100 };
  };

  return NextResponse.json({
    personal: gente.map(u => ({
      id: u.id, nombre: u.nombre, alias: u.alias || null, foto: u.foto_url || null,
      cargo: u.cargo || u.especialidad || getRoleMeta(u.rol)?.label || null,
      rol: u.rol, cedula: u.cedula || null, ingreso: u.fecha_ingreso || null,
      codigo: codigos[u.id]?.codigo || null, emitido: codigos[u.id]?.creado || null,
      hoy: suma(u.id, f.hoy), semana: suma(u.id, f.lunes),
    })),
    fechas: f,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await soloMaestro();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({}));

  const gente = await personal(auth, null);
  const validos = new Set(gente.map(g => g.id));
  let empleados: string[] = Array.isArray(b.empleados) ? b.empleados.map(String).filter((e: string) => validos.has(e)) : [];
  if (b.faltantes) {
    const ya = await codigosEnClaro(auth.db);
    empleados = gente.filter(g => !ya[g.id]).map(g => g.id);
  }
  if (!empleados.length) return NextResponse.json({ ok: true, asignados: {} });

  const asignados = await asignarCodigos(auth.db, empleados);
  await logActivityServer(auth.db, { usuario: auth.user!.nombre, modulo: 'Taller', accion: 'Carnets del taller', detalles: `Código nuevo para ${empleados.length} persona${empleados.length > 1 ? 's' : ''}` });
  return NextResponse.json({ ok: true, asignados });
}
