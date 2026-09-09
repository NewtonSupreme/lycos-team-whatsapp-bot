import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { RECURSOS, diasEntre, esRecurso, limpiar } from '@/lib/rrhh/recursos';

export const dynamic = 'force-dynamic';

/**
 * Listado de un recurso de RRHH.
 * Query: ?empleado=<id>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&estado=&sede=&limite=
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;
  if (!esRecurso(recurso)) return NextResponse.json({ error: 'Recurso desconocido' }, { status: 404 });

  const auth = await authorize('empleados', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const meta = RECURSOS[recurso];
  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const empleado = url.searchParams.get('empleado');
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  const estado = url.searchParams.get('estado');
  const limite = Math.min(Number(url.searchParams.get('limite')) || 500, 2000);

  let q = auth.db.from(meta.tabla).select('*')
    .order(meta.orden.campo, { ascending: meta.orden.asc })
    .limit(limite);

  if (sede) q = q.eq('sede_id', sede);
  if (empleado && meta.porEmpleado) q = q.eq('empleado_id', empleado);
  if (estado) q = q.eq('estado', estado);

  // Asistencia y evaluaciones tienen una sola fecha; el resto, un rango.
  const campos: readonly string[] = meta.campos;
  const porFechaUnica = campos.includes('fecha');
  const campoDesde = porFechaUnica ? 'fecha' : 'fecha_fin';
  const campoHasta = porFechaUnica ? 'fecha' : 'fecha_inicio';
  if (desde) q = q.gte(campoDesde, desde);
  if (hasta) q = q.lte(campoHasta, hasta);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ [recurso]: data || [] });
}

/** Alta de un registro. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;
  if (!esRecurso(recurso)) return NextResponse.json({ error: 'Recurso desconocido' }, { status: 404 });

  const auth = await authorize('empleados', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const meta = RECURSOS[recurso];
  const fila = limpiar(recurso, body);

  if (meta.porEmpleado && !fila.empleado_id) {
    return NextResponse.json({ error: 'Falta el empleado.' }, { status: 400 });
  }
  // Los días de vacaciones se calculan del rango: si el navegador manda otro
  // número, el saldo de vacaciones dejaría de cuadrar con las fechas.
  if (recurso === 'vacaciones' && fila.fecha_inicio && fila.fecha_fin) {
    fila.dias = diasEntre(String(fila.fecha_inicio), String(fila.fecha_fin));
  }
  const sedePedida = typeof body?.sede === 'string' ? body.sede : null;
  fila.sede_id = auth.effectiveSede(sedePedida) ?? auth.user!.sede_id ?? null;

  // Volver a marcar la asistencia del día corrige el registro, no lo duplica.
  const query = recurso === 'asistencia'
    ? auth.db.from(meta.tabla).upsert(fila, { onConflict: 'empleado_id,fecha' }).select().single()
    : auth.db.from(meta.tabla).insert(fila).select().single();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'empleados', accion: `RRHH · ${recurso}`,
    detalles: `Alta en ${recurso}`, referencia_id: data?.id, referencia_tabla: meta.tabla,
    sede_id: fila.sede_id as string | null,
  });

  return NextResponse.json({ registro: data });
}
