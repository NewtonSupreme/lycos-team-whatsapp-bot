import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';

export const dynamic = 'force-dynamic';

/** Anula un adelanto pendiente. Sólo admin/supervisor. No si ya está aplicado. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!['admin', 'supervisor'].includes(resolveRol(auth.user!.rol))) {
    return NextResponse.json({ error: 'Sólo Administración o Supervisor pueden anular adelantos.' }, { status: 403 });
  }
  const { id } = await params;
  const { data: adv } = await auth.db.from('payroll_advances').select('estado').eq('id', id).maybeSingle();
  if (!adv) return NextResponse.json({ error: 'Adelanto no encontrado.' }, { status: 404 });
  if (adv.estado === 'aplicado') {
    return NextResponse.json({ error: 'No se puede anular un adelanto ya aplicado a una liquidación.' }, { status: 400 });
  }
  const { error } = await auth.db.from('payroll_advances').update({ estado: 'anulado' }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
