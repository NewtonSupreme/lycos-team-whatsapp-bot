import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const CAMPOS = [
  'vehiculo_id', 'placa', 'vehiculo_info', 'cliente_id', 'cliente_nombre', 'servicio_id',
  'fecha', 'descripcion', 'tipo', 'cantidad', 'precio_venta', 'costo', 'moneda',
  'origen', 'proveedor_id', 'proveedor', 'enlace', 'comprobante_url',
  'estado_pago', 'monto_pagado', 'fecha_pago', 'fecha_vencimiento', 'nota',
] as const;

/**
 * Normaliza el renglón antes de guardarlo.
 *
 * Dos reglas que la base también exige, resueltas aquí para devolver un error
 * entendible en vez de una violación de constraint: lo que trae el cliente no
 * cuesta ni se le debe a nadie, y la mano de obra no tiene proveedor.
 */
export function normalizarPartida(body: Record<string, unknown>): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  for (const c of CAMPOS) if (body[c] !== undefined) fila[c] = body[c];

  if (typeof fila.placa === 'string') fila.placa = fila.placa.trim().toUpperCase() || null;

  const origen = (fila.origen as string) || 'taller';
  const tipo = (fila.tipo as string) || 'repuesto';

  if (origen === 'cliente' || tipo === 'mano_obra' || tipo === 'servicio') {
    if (origen === 'cliente') {
      fila.costo = 0;
      fila.proveedor_id = null;
      fila.proveedor = null;
    }
    if (Number(fila.costo || 0) === 0) fila.estado_pago = 'no_aplica';
  }

  // Un renglón sin costo no puede quedar debiendo.
  if (Number(fila.costo || 0) === 0 && fila.estado_pago !== 'no_aplica') {
    fila.estado_pago = 'no_aplica';
  }
  if (fila.estado_pago === 'pagado' && !fila.fecha_pago) {
    fila.fecha_pago = new Date().toISOString().slice(0, 10);
  }
  if (fila.estado_pago !== 'parcial') fila.monto_pagado = 0;

  return fila;
}

/** Listado de renglones. Query: ?placa | ?vehiculo | ?servicio | ?deuda=1 */
export async function GET(req: NextRequest) {
  const auth = await authorize('vehiculos', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  let q = auth.db.from('vehiculo_partidas').select('*')
    .order('fecha', { ascending: false })
    .limit(Math.min(Number(url.searchParams.get('limite')) || 500, 2000));

  if (sede) q = q.eq('sede_id', sede);
  const placa = url.searchParams.get('placa');
  if (placa) q = q.ilike('placa', placa.trim().toUpperCase());
  const vehiculo = url.searchParams.get('vehiculo');
  if (vehiculo) q = q.eq('vehiculo_id', vehiculo);
  const servicio = url.searchParams.get('servicio');
  if (servicio) q = q.eq('servicio_id', servicio);
  if (url.searchParams.get('deuda') === '1') q = q.in('estado_pago', ['por_pagar', 'parcial']);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partidas: data || [] });
}

/** Alta de un renglón. */
export async function POST(req: NextRequest) {
  const auth = await authorize('vehiculos', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const fila = normalizarPartida(body);
  if (!fila.descripcion || !String(fila.descripcion).trim()) {
    return NextResponse.json({ error: 'Falta la descripción del renglón.' }, { status: 400 });
  }
  if (!fila.placa && !fila.vehiculo_id) {
    return NextResponse.json({ error: 'Indica la placa o el vehículo.' }, { status: 400 });
  }

  fila.sede_id = auth.effectiveSede((body.sede as string) ?? null) ?? auth.user!.sede_id ?? null;
  fila.registrado_por = auth.user!.nombre;

  const { data, error } = await auth.db.from('vehiculo_partidas').insert(fila).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'vehiculos', accion: 'Ficha · renglón',
    detalles: `${fila.descripcion} · placa ${fila.placa || '—'}`,
    referencia_id: data?.id, referencia_tabla: 'vehiculo_partidas',
    sede_id: fila.sede_id as string | null,
  });

  return NextResponse.json({ partida: data });
}
