import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { getRoleMeta } from '@/types';
import { ESTADOS_PANTALLA } from '@/lib/taller/pantalla';

export const dynamic = 'force-dynamic';

/**
 * Desde la pantalla del taller el mecánico puede decir dos cosas:
 *   · «Empecé»: la orden pasa a En taller (en_proceso).
 *   · «Terminé»: queda en la bitácora que el carro está listo. NO la cierra:
 *     cerrar es cobrar, y eso lo hace Cobranza o el Jefe de Taller.
 *   Body: { servicio_id, empleado_id, accion: 'empezar' | 'terminado', nota? }
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('taller', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  const servicioId = String(b.servicio_id || '');
  const accion = String(b.accion || '');
  if (!servicioId || !['empezar', 'terminado'].includes(accion)) return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });

  const sede = auth.effectiveSede(null);
  const [{ data: orden }, { data: persona }] = await Promise.all([
    auth.db.from('servicios').select('id, estado, seguimiento, placa, sede_id, fecha_inicio').eq('id', servicioId).maybeSingle(),
    b.empleado_id ? auth.db.from('usuarios').select('id, nombre, rol, activo').eq('id', String(b.empleado_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!orden) return NextResponse.json({ error: 'La orden no existe.' }, { status: 404 });
  if (sede && orden.sede_id && orden.sede_id !== sede) return NextResponse.json({ error: 'La orden es de otra sede.' }, { status: 403 });
  if (!(ESTADOS_PANTALLA as readonly string[]).includes(orden.estado)) return NextResponse.json({ error: 'Esa orden ya no está en el taller.' }, { status: 409 });
  if (persona && (persona.activo === false || !getRoleMeta(persona.rol)?.esTecnico)) return NextResponse.json({ error: 'Esa persona no está en el personal del taller.' }, { status: 400 });

  const quien = persona?.nombre || 'Taller';
  const ahora = new Date().toISOString();
  const nota = String(b.nota || '').trim().slice(0, 200);
  const cambios: Record<string, unknown> = { updated_at: ahora };
  let texto: string;
  if (accion === 'empezar') {
    cambios.estado = 'en_proceso';
    if (!orden.fecha_inicio) cambios.fecha_inicio = ahora;
    texto = `${quien} empezó el trabajo (pasó a En taller)`;
  } else {
    texto = `${quien} terminó: listo para entregar y cobrar${nota ? ` — ${nota}` : ''}`;
  }
  cambios.seguimiento = [...(Array.isArray(orden.seguimiento) ? orden.seguimiento : []), { fecha: ahora, tipo: 'taller', usuario: `${quien} · pantalla del taller`, accion: texto }];
  const { error } = await auth.db.from('servicios').update(cambios).eq('id', servicioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivityServer(auth.db, {
    usuario: `${quien} (pantalla del taller)`, modulo: 'Taller', accion: accion === 'empezar' ? 'Empezó trabajo' : 'Terminó trabajo',
    detalles: `${orden.placa || ''} · ${texto}`, referencia_tabla: 'servicios', referencia_id: servicioId, sede_id: orden.sede_id || sede,
  });
  return NextResponse.json({ ok: true });
}
