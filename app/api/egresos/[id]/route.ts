import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const CAMPOS = [
  'fecha', 'hora', 'categoria', 'total_egresos', 'desglose', 'notas', 'imagen_url',
  'cliente', 'proveedor', 'metodo_pago', 'moneda', 'tasa_cambio',
  'cliente_id', 'vehiculo_id', 'servicio_id', 'cliente_nombre', 'vehiculo_info', 'placa',
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('reportes', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const updates: any = { updated_at: new Date().toISOString() };
  for (const k of CAMPOS) if (body[k] !== undefined) updates[k] = body[k];

  const { data, error } = await auth.db.from('egresos').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ egreso: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('reportes', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (resolveRol(auth.user!.rol) !== 'admin') {
    return NextResponse.json({ error: 'Sólo el Administrador puede eliminar egresos.' }, { status: 403 });
  }
  const { id } = await params;
  const { error } = await auth.db.from('egresos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'egresos', accion: 'Egreso eliminado',
    referencia_id: id, referencia_tabla: 'egresos', sede_id: auth.user!.sede_id,
  });
  return NextResponse.json({ success: true });
}
