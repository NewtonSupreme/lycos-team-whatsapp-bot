import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';

export const dynamic = 'force-dynamic';

const ALLOWED = ['empleado_id', 'zona', 'servicio_key', 'label', 'monto', 'moneda', 'activo', 'sede_id'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const updates: any = { updated_at: new Date().toISOString() };
  for (const k of ALLOWED) if (body[k] !== undefined) updates[k] = body[k];
  const { data, error } = await auth.db.from('flat_rate_catalog').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flatRate: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('nomina', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (resolveRol(auth.user!.rol) !== 'admin') {
    return NextResponse.json({ error: 'Sólo el Administrador puede eliminar tarifas.' }, { status: 403 });
  }
  const { id } = await params;
  const { error } = await auth.db.from('flat_rate_catalog').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
