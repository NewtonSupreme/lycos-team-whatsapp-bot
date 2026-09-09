import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { categoriaLabel, inferirCategoria } from '@/lib/categorias';

export const dynamic = 'force-dynamic';

/**
 * Los últimos servicios de un cliente, para la ficha que va junto al chat.
 *
 * Quien atiende necesita saber qué se le hizo la última vez sin salir de la
 * conversación: es la diferencia entre «¿en qué le puedo ayudar?» y «¿cómo va
 * el silenciador que le pusimos en julio?».
 *
 * Se buscan también por VEHÍCULO y no solo por `cliente_id`: hay órdenes sin
 * cliente que sí tienen el carro, y contándolas solo por cliente el historial
 * saldría más corto de lo que fue.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('whatsapp', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const clienteId = (new URL(req.url).searchParams.get('cliente') || '').trim();
  if (!clienteId) {
    return NextResponse.json({ error: 'Falta el cliente.' }, { status: 400 });
  }

  const { data: autos } = await auth.db.from('vehiculos')
    .select('id').eq('cliente_id', clienteId).limit(50);
  const idsAutos = ((autos as { id: string }[]) || []).map(v => v.id);

  const columnas = 'id, fecha, estado, tipo, tipo_personalizado, descripcion, categoria, '
    + 'costo_final, total_pagado, costo_estimado';

  const [porCliente, porAuto] = await Promise.all([
    auth.db.from('servicios').select(columnas)
      .eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(25),
    idsAutos.length > 0
      ? auth.db.from('servicios').select(columnas)
        .in('vehiculo_id', idsAutos).order('fecha', { ascending: false }).limit(25)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (porCliente.error) {
    return NextResponse.json({ error: porCliente.error.message }, { status: 500 });
  }

  type Fila = {
    id: string; fecha: string | null; estado: string | null;
    tipo: string | null; tipo_personalizado: string | null; descripcion: string | null;
    categoria: string | null;
    costo_final: number | null; total_pagado: number | null; costo_estimado: number | null;
  };

  // Un mismo servicio puede venir por las dos vías; el mapa evita repetirlo.
  const unicos = new Map<string, Fila>();
  for (const s of [
    ...((porCliente.data as unknown as Fila[]) || []),
    ...((porAuto.data as unknown as Fila[]) || []),
  ]) {
    if (s?.id) unicos.set(s.id, s);
  }

  const servicios = [...unicos.values()]
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .slice(0, 12)
    .map(s => ({
      id: s.id,
      fecha: s.fecha ? String(s.fecha).slice(0, 10) : null,
      // La descripción a secas suele ser una frase larga del bot; se prefiere
      // el nombre del trabajo, y la categoría como respaldo.
      descripcion: (s.tipo_personalizado || '').trim()
        || (s.descripcion || '').trim().slice(0, 80)
        || categoriaLabel(s.categoria || inferirCategoria(s.tipo))
        || 'Servicio',
      // El importe no está en un único campo: de 522 órdenes solo 9 tienen
      // `costo_final` y ninguna `total_pagado`.
      monto: Math.max(
        Number(s.costo_final) || 0, Number(s.total_pagado) || 0, Number(s.costo_estimado) || 0,
      ),
      estado: s.estado,
    }));

  return NextResponse.json({ servicios });
}
