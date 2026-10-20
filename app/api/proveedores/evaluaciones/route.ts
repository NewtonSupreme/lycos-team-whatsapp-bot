import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const nota = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
};

/**
 * Cómo nos trata cada proveedor.
 *
 * Las tres notas van separadas porque no significan lo mismo: uno puede tener
 * el mejor precio y ser el que siempre llega tarde. Con una sola nota media esa
 * diferencia se pierde, y es justo la que decide a quién llamar cuando corre
 * prisa y a quién cuando lo que importa es el costo.
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('distribuidor', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    proveedor_id?: string; calidad?: number; puntualidad?: number;
    precio?: number; comentario?: string; fecha?: string; sede?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const proveedorId = String(body.proveedor_id || '').trim();
  if (!proveedorId) {
    return NextResponse.json({ error: 'Indica a qué proveedor evalúas.' }, { status: 400 });
  }

  const calidad = nota(body.calidad);
  const puntualidad = nota(body.puntualidad);
  const precio = nota(body.precio);
  if (calidad === null && puntualidad === null && precio === null) {
    return NextResponse.json(
      { error: 'Pon al menos una nota, de 1 a 5.' }, { status: 400 },
    );
  }

  const { data, error } = await auth.db.from('proveedor_evaluaciones').insert({
    proveedor_id: proveedorId,
    fecha: (body.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10),
    calidad, puntualidad, precio,
    comentario: (body.comentario || '').trim() || null,
    evaluado_por: auth.user!.nombre,
    sede_id: auth.effectiveSede(body.sede ?? null) ?? auth.user!.sede_id ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Proveedor evaluado',
    detalles: `calidad ${calidad ?? '—'} · puntualidad ${puntualidad ?? '—'} · precio ${precio ?? '—'}`,
    referencia_id: data.id, referencia_tabla: 'proveedor_evaluaciones',
  });

  return NextResponse.json({ evaluacion: data });
}

/** Borra una evaluación. Query: ?id=<uuid> */
export async function DELETE(req: NextRequest) {
  const auth = await authorize('distribuidor', 'eliminar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Indica la evaluación.' }, { status: 400 });

  const { error } = await auth.db.from('proveedor_evaluaciones').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
