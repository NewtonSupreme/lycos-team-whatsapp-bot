import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/**
 * Las sucursales del taller.
 *
 * Lo delicado aquí es el borrado. De San Antonio cuelgan 518 servicios, 508
 * ventas, 1.210 clientes y 843 vehículos: borrar esa fila se llevaría por
 * delante toda su historia o dejaría cientos de registros apuntando a una sede
 * que ya no existe. Por eso el DELETE cuenta primero lo que depende de ella y
 * se niega si hay algo, ofreciendo desactivarla —que es lo que de verdad pasa
 * cuando una sucursal cierra—.
 */

/** Tablas que cuelgan de una sede. El orden es el que se muestra al usuario. */
const DEPENDENCIAS = [
  { tabla: 'usuarios', label: 'usuarios' },
  { tabla: 'servicios', label: 'órdenes de servicio' },
  { tabla: 'ventas_dia', label: 'ventas' },
  { tabla: 'clientes', label: 'clientes' },
  { tabla: 'vehiculos', label: 'vehículos' },
  { tabla: 'inventario', label: 'productos' },
] as const;

const CAMPOS = ['nombre', 'direccion', 'telefono', 'email', 'rif', 'horario', 'activo', 'notas'] as const;

function limpiar(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const c of CAMPOS) {
    if (body[c] === undefined) continue;
    out[c] = c === 'activo' ? !!body[c] : (String(body[c] ?? '').trim() || null);
  }
  return out;
}

/** Cuenta lo que cuelga de una sede, tabla por tabla. */
async function contarDependencias(db: Awaited<ReturnType<typeof authorize>>['db'], sedeId: string) {
  const detalle: { label: string; total: number }[] = [];
  for (const d of DEPENDENCIAS) {
    const { count } = await db.from(d.tabla).select('*', { count: 'exact', head: true }).eq('sede_id', sedeId);
    if (count && count > 0) detalle.push({ label: d.label, total: count });
  }
  return { detalle, total: detalle.reduce((s, x) => s + x.total, 0) };
}

export async function GET() {
  const auth = await authorize('configuracion', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.db.from('sedes')
    .select('*')
    .order('es_principal', { ascending: false })
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cada sede viene con lo que cuelga de ella: es lo que decide si se puede
  // borrar, y verlo antes evita la sorpresa al intentarlo.
  const sedes = [];
  for (const s of data || []) {
    const dep = await contarDependencias(auth.db, s.id as string);
    sedes.push({ ...s, dependencias: dep.detalle, totalDependencias: dep.total });
  }

  return NextResponse.json({ sedes });
}

export async function POST(req: NextRequest) {
  const auth = await authorize('configuracion', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const datos = limpiar(body);
  if (!datos.nombre) return NextResponse.json({ error: 'La sucursal necesita un nombre.' }, { status: 400 });

  const { data, error } = await auth.db.from('sedes').insert({ ...datos, es_principal: false }).select().single();
  if (error) {
    // El índice único por nombre da un mensaje ilegible; se traduce.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una sucursal con ese nombre.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'configuracion',
    accion: 'Sucursal creada', detalles: String(datos.nombre),
    referencia_id: data.id, referencia_tabla: 'sedes',
  });

  return NextResponse.json({ sede: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize('configuracion', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'Falta la sucursal.' }, { status: 400 });

  const { data: actual } = await auth.db.from('sedes').select('*').eq('id', id).maybeSingle();
  if (!actual) return NextResponse.json({ error: 'Esa sucursal no existe.' }, { status: 404 });

  // ── Cambiar cuál es la principal ─────────────────────────────────────────
  if (body.hacerPrincipal === true) {
    // El índice único solo admite una `true`: hay que quitar la anterior antes.
    await auth.db.from('sedes').update({ es_principal: false, updated_at: new Date().toISOString() }).eq('es_principal', true);
    const { error } = await auth.db.from('sedes')
      .update({ es_principal: true, activo: true, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivityServer(auth.db, {
      usuario: auth.user!.nombre, modulo: 'configuracion',
      accion: 'Sucursal principal cambiada', detalles: String(actual.nombre),
      referencia_id: id, referencia_tabla: 'sedes',
    });
    return NextResponse.json({ ok: true });
  }

  const datos = limpiar(body);
  if (Object.keys(datos).length === 0) {
    return NextResponse.json({ error: 'No se envió ningún cambio.' }, { status: 400 });
  }

  // La principal no se puede desactivar: es la sede por defecto del sistema.
  if (datos.activo === false && actual.es_principal) {
    return NextResponse.json({
      error: 'La sucursal principal no se puede desactivar. Marca otra como principal primero.',
    }, { status: 409 });
  }

  const { error } = await auth.db.from('sedes')
    .update({ ...datos, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una sucursal con ese nombre.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'configuracion',
    accion: datos.activo === false ? 'Sucursal desactivada' : 'Sucursal actualizada',
    detalles: String(datos.nombre || actual.nombre),
    referencia_id: id, referencia_tabla: 'sedes',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize('configuracion', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'Falta la sucursal.' }, { status: 400 });

  const { data: sede } = await auth.db.from('sedes').select('*').eq('id', id).maybeSingle();
  if (!sede) return NextResponse.json({ error: 'Esa sucursal no existe.' }, { status: 404 });

  if (sede.es_principal) {
    return NextResponse.json({
      error: 'La sucursal principal no se puede eliminar. Marca otra como principal primero.',
    }, { status: 409 });
  }

  // ── Nada se borra con historia detrás ────────────────────────────────────
  const dep = await contarDependencias(auth.db, id);
  if (dep.total > 0) {
    const lista = dep.detalle.map(d => `${d.total} ${d.label}`).join(', ');
    return NextResponse.json({
      error: `No se puede eliminar «${sede.nombre}»: tiene ${lista}. `
        + 'Desactívala en su lugar; así deja de aparecer para trabajar pero conserva su historial.',
      dependencias: dep.detalle,
      puedeDesactivar: sede.activo !== false,
    }, { status: 409 });
  }

  const { error } = await auth.db.from('sedes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'configuracion',
    accion: 'Sucursal eliminada', detalles: `${sede.nombre} (estaba vacía)`,
    referencia_tabla: 'sedes',
  });

  return NextResponse.json({ ok: true });
}
