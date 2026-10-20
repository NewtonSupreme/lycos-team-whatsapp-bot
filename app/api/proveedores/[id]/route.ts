import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const CAMPOS = [
  'nombre', 'contacto', 'telefono', 'email', 'enlace', 'rif', 'direccion',
  'notas', 'activo', 'categoria', 'condiciones_pago', 'dias_credito',
] as const;

/** Edita un proveedor del catálogo. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('distribuidor', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const fila: Record<string, unknown> = {};
  for (const c of CAMPOS) if (body[c] !== undefined) fila[c] = body[c];

  if (typeof fila.nombre === 'string') {
    fila.nombre = fila.nombre.trim();
    if (!fila.nombre) {
      return NextResponse.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 });
    }
  }
  if (fila.dias_credito !== undefined) {
    fila.dias_credito = Math.max(0, Math.min(365, Math.round(Number(fila.dias_credito) || 0)));
  }
  if (Object.keys(fila).length === 0) {
    return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 });
  }
  fila.updated_at = new Date().toISOString();

  const { data, error } = await auth.db.from('proveedores')
    .update(fila).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Proveedor actualizado',
    detalles: String(data.nombre || id),
    referencia_id: id, referencia_tabla: 'proveedores',
  });

  return NextResponse.json({ proveedor: data });
}

/**
 * Da de baja al proveedor.
 *
 * No se borra: sus compras siguen apuntando a él, y borrarlo dejaría el
 * historial diciendo «Sin proveedor» en cosas que sí se sabe a quién se
 * compraron. Se marca inactivo, que es lo que de verdad se quiere decir.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('distribuidor', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.db.from('proveedores')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Proveedor dado de baja',
    detalles: String(data.nombre || id),
    referencia_id: id, referencia_tabla: 'proveedores',
  });

  return NextResponse.json({ ok: true, proveedor: data });
}
