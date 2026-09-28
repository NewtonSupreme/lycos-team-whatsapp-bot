import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { recalcularTrabajosDeServicio } from '@/lib/nomina/servicio-nomina';

export const dynamic = 'force-dynamic';

/**
 * Al cerrar una orden, sus comisiones pasan al día de la entrega.
 *
 * Los trabajos se registran al crear o editar la orden, con el día en que el
 * carro entró. Pero se pagan cuando el trabajo está hecho: una orden abierta
 * un lunes y entregada el lunes siguiente tiene que caer en la semana de la
 * entrega, no en una que a lo mejor ya se liquidó. De paso se pone al día la
 * mano de obra con los costos de la ficha.
 *
 * Body: { referencia_id }
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('servicios', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { referencia_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body.referencia_id) return NextResponse.json({ error: 'Falta la orden.' }, { status: 400 });
  const cambiados = await recalcularTrabajosDeServicio(auth.db, body.referencia_id, auth.user!.nombre);
  return NextResponse.json({ cambiados });
}
