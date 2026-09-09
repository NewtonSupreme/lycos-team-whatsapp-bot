import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { RECURSOS, diasEntre, esRecurso, limpiar } from '@/lib/rrhh/recursos';

export const dynamic = 'force-dynamic';

/** Edita un registro de RRHH. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ recurso: string; id: string }> }) {
  const { recurso, id } = await params;
  if (!esRecurso(recurso)) return NextResponse.json({ error: 'Recurso desconocido' }, { status: 404 });

  const auth = await authorize('empleados', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const cambios = limpiar(recurso, body);
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }
  if (recurso === 'vacaciones' && cambios.fecha_inicio && cambios.fecha_fin) {
    cambios.dias = diasEntre(String(cambios.fecha_inicio), String(cambios.fecha_fin));
  }

  const { data, error } = await auth.db
    .from(RECURSOS[recurso].tabla)
    .update(cambios)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'empleados', accion: `RRHH · ${recurso}`,
    detalles: `Edición en ${recurso}`, referencia_id: id, referencia_tabla: RECURSOS[recurso].tabla,
    sede_id: (data as { sede_id?: string | null } | null)?.sede_id ?? null,
  });

  return NextResponse.json({ registro: data });
}

/** Borra un registro de RRHH. Solo quien puede eliminar personal. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ recurso: string; id: string }> }) {
  const { recurso, id } = await params;
  if (!esRecurso(recurso)) return NextResponse.json({ error: 'Recurso desconocido' }, { status: 404 });

  const auth = await authorize('empleados', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.db.from(RECURSOS[recurso].tabla).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'empleados', accion: `RRHH · ${recurso}`,
    detalles: `Borrado en ${recurso}`, referencia_id: id, referencia_tabla: RECURSOS[recurso].tabla,
  });

  return NextResponse.json({ ok: true });
}
