import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

const CAMPOS = [
  'fecha', 'hora', 'categoria', 'total_egresos', 'desglose', 'notas', 'imagen_url',
  'cliente', 'proveedor', 'metodo_pago', 'moneda', 'tasa_cambio', 'origen',
  'cliente_id', 'vehiculo_id', 'servicio_id', 'cliente_nombre', 'vehiculo_info', 'placa',
];

/**
 * Lista de egresos con filtros.
 * ?vehiculo=<id> · ?cliente=<id> · ?servicio=<id> · ?placa=XXX · ?desde=&hasta=
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const vehiculo = url.searchParams.get('vehiculo');
  const cliente = url.searchParams.get('cliente');
  const servicio = url.searchParams.get('servicio');
  const placa = url.searchParams.get('placa');
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');

  let q = auth.db.from('egresos').select('*').order('fecha', { ascending: false }).limit(500);
  if (sede) q = q.eq('sede_id', sede);
  if (vehiculo) q = q.eq('vehiculo_id', vehiculo);
  if (cliente) q = q.eq('cliente_id', cliente);
  if (servicio) q = q.eq('servicio_id', servicio);
  if (placa) q = q.ilike('placa', placa);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const egresos = data || [];
  const total = egresos.reduce((s: number, e: any) => s + (Number(e.total_egresos) || 0), 0);
  return NextResponse.json({ egresos, total: Number(total.toFixed(2)) });
}

/** Registra un egreso. Puede venir del panel, del modal de gastos del vehículo o del bot. */
export async function POST(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Puede registrar quien gestiona reportes o ventas (caja).
  const canCreate = auth.can('reportes', 'crear') || auth.can('reportes', 'editar') || auth.can('ventas', 'crear');
  if (!canCreate) return NextResponse.json({ error: 'No tienes permiso para registrar egresos.' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (body.total_egresos == null) {
    return NextResponse.json({ error: 'Falta el total del egreso.' }, { status: 400 });
  }

  const payload: any = {};
  for (const k of CAMPOS) if (body[k] !== undefined) payload[k] = body[k];
  payload.sede_id = auth.effectiveSede(body.sede_id ?? null);
  payload.creado_por = auth.user!.nombre;
  if (!payload.fecha) payload.fecha = new Date().toISOString().slice(0, 10);
  if (!payload.hora) payload.hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (!payload.origen) payload.origen = 'panel';

  // Si viene el vehículo pero no el cliente, se completa la asociación automáticamente.
  if (payload.vehiculo_id && !payload.cliente_id) {
    const { data: veh } = await auth.db
      .from('vehiculos').select('cliente_id, marca, modelo, placa, clientes(nombre, apellido)')
      .eq('id', payload.vehiculo_id).maybeSingle();
    if (veh) {
      payload.cliente_id = veh.cliente_id;
      payload.placa = payload.placa || veh.placa;
      payload.vehiculo_info = payload.vehiculo_info || `${veh.marca || ''} ${veh.modelo || ''}`.trim();
      const c: any = veh.clientes;
      if (c && !payload.cliente_nombre) payload.cliente_nombre = `${c.nombre || ''} ${c.apellido || ''}`.trim();
    }
  }

  const { data, error } = await auth.db.from('egresos').insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'egresos', accion: 'Egreso registrado',
    detalles: `$${Number(payload.total_egresos).toFixed(2)} · ${payload.categoria || 'otro'}`
      + (payload.placa ? ` · Vehículo ${payload.placa}` : '')
      + (payload.proveedor || payload.cliente ? ` · Pagado a ${payload.proveedor || payload.cliente}` : ''),
    referencia_id: data.id, referencia_tabla: 'egresos', sede_id: payload.sede_id,
  });

  return NextResponse.json({ egreso: data });
}
