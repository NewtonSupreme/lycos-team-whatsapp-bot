import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const CAMPOS = [
  'nombre', 'contacto', 'telefono', 'email', 'enlace', 'rif', 'direccion',
  'notas', 'activo',
  // Lo que faltaba para responder «¿este nos da credito?» sin llamarlo:
  // que vende, en que condiciones y a cuantos dias.
  'categoria', 'condiciones_pago', 'dias_credito',
] as const;

/** Catálogo de proveedores. */
export async function GET(req: NextRequest) {
  const auth = await authorize('distribuidor', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  let q = auth.db.from('proveedores').select('*').order('nombre');
  // La sede nula es el catálogo compartido: un proveedor sirve a todo el taller.
  if (sede) q = q.or(`sede_id.eq.${sede},sede_id.is.null`);
  if (url.searchParams.get('activos') === '1') q = q.eq('activo', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proveedores: data || [] });
}

/** Alta de proveedor. Si ya existe con ese nombre, devuelve el que hay. */
export async function POST(req: NextRequest) {
  const auth = await authorize('distribuidor', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const nombre = String(body.nombre || '').trim();
  if (!nombre) return NextResponse.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 });

  const fila: Record<string, unknown> = { nombre };
  for (const c of CAMPOS) if (c !== 'nombre' && body[c] !== undefined) fila[c] = body[c];
  fila.sede_id = auth.effectiveSede((body.sede as string) ?? null) ?? auth.user!.sede_id ?? null;

  const { data, error } = await auth.db.from('proveedores').insert(fila).select().single();

  if (error) {
    // Nombre repetido: devolver el existente evita duplicar el catálogo cuando
    // dos personas dan de alta al mismo proveedor casi a la vez.
    if (error.code === '23505') {
      const { data: existente } = await auth.db.from('proveedores')
        .select('*').ilike('nombre', nombre).limit(1).maybeSingle();
      if (existente) return NextResponse.json({ proveedor: existente, yaExistia: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ proveedor: data });
}
