import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { calcularDesempeno, type ActividadCliente, type DesempenoCliente } from '@/lib/clientes/desempeno';

export const dynamic = 'force-dynamic';

/**
 * La actividad de cada cliente: cuántos servicios, cuánto y cuándo.
 *
 * Se agrupa en el servidor porque la pantalla de Clientes no puede traerse los
 * 522 servicios y sus vehículos para contar en el navegador cada vez que
 * alguien abre la lista.
 *
 * Dos detalles que cambian el resultado:
 *
 *   · Hay servicios sin `cliente_id` —13 de 522, y los del bot— que sí tienen
 *     vehículo. Si se contaran solo por `cliente_id`, esos clientes saldrían
 *     con menos servicios de los que de verdad tuvieron. Así que se cuenta
 *     también a través del vehículo, sin contar dos veces el mismo servicio.
 *
 *   · El dinero no está en un único campo: de 522 órdenes solo 9 tienen
 *     `costo_final` y ninguna `total_pagado`; el importe real está en
 *     `costo_estimado`. Se resuelve entre los tres, igual que en la ficha del
 *     vehículo.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('clientes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));

  // El agrupado se hace aquí, sobre tres consultas planas.
  //
  // Se intentó primero con SQL directo, pero eso obligaba a pegar el `sede_id`
  // dentro del texto de la consulta —una vía de inyección por un parámetro de
  // la URL— y a depender de una función que la base no tiene declarada. Con 522
  // servicios y 1.261 clientes el cálculo en memoria es inmediato.
  const [rServicios, rVehiculos, rClientes] = await Promise.all([
    auth.db.from('servicios')
      .select('id, cliente_id, vehiculo_id, fecha, estado, costo_final, total_pagado, costo_estimado')
      .limit(5000),
    auth.db.from('vehiculos').select('id, cliente_id').limit(5000),
    auth.db.from('clientes').select('id, sede_id').limit(5000),
  ]);

  if (rServicios.error) {
    return NextResponse.json({ error: rServicios.error.message }, { status: 500 });
  }

  type FilaServicio = {
    id: string; cliente_id: string | null; vehiculo_id: string | null;
    fecha: string | null; estado: string | null;
    costo_final: number | null; total_pagado: number | null; costo_estimado: number | null;
  };

  const duenoDe = new Map<string, string>();
  ((rVehiculos.data as { id: string; cliente_id: string | null }[]) || [])
    .forEach(v => { if (v.cliente_id) duenoDe.set(v.id, v.cliente_id); });

  const vehiculosPor = new Map<string, number>();
  ((rVehiculos.data as { id: string; cliente_id: string | null }[]) || [])
    .forEach(v => {
      if (!v.cliente_id) return;
      vehiculosPor.set(v.cliente_id, (vehiculosPor.get(v.cliente_id) || 0) + 1);
    });

  const acc = new Map<string, ActividadCliente>();
  const CANCELADOS = new Set(['cancelada', 'cancelado', 'anulada']);

  for (const s of ((rServicios.data as FilaServicio[]) || [])) {
    if (CANCELADOS.has(String(s.estado || '').toLowerCase())) continue;
    const dueno = s.cliente_id || (s.vehiculo_id ? duenoDe.get(s.vehiculo_id) : null);
    if (!dueno) continue;
    const monto = Math.max(
      Number(s.costo_final) || 0, Number(s.total_pagado) || 0, Number(s.costo_estimado) || 0,
    );
    const fecha = (s.fecha || '').slice(0, 10) || null;

    const actual = acc.get(dueno) || {
      cliente_id: dueno, servicios: 0, total: 0, primero: null, ultimo: null, vehiculos: 0,
    };
    actual.servicios += 1;
    actual.total += monto;
    if (fecha) {
      if (!actual.primero || fecha < actual.primero) actual.primero = fecha;
      if (!actual.ultimo || fecha > actual.ultimo) actual.ultimo = fecha;
    }
    acc.set(dueno, actual);
  }

  // Los clientes sin ningún servicio también salen: son los que hay que
  // trabajar, y si se omitieran no aparecerían en la lista.
  for (const c of ((rClientes.data as { id: string; sede_id: string | null }[]) || [])) {
    if (sede && c.sede_id !== sede) continue;
    if (!acc.has(c.id)) {
      acc.set(c.id, {
        cliente_id: c.id, servicios: 0, total: 0, primero: null, ultimo: null, vehiculos: 0,
      });
    }
  }

  for (const [id, a] of acc) {
    a.vehiculos = vehiculosPor.get(id) || 0;
    a.total = Math.round(a.total * 100) / 100;
  }

  return NextResponse.json({ clientes: mapear([...acc.values()]) });
}

function mapear(filas: readonly ActividadCliente[]): DesempenoCliente[] {
  const hoy = new Date();
  return filas.map(f => calcularDesempeno({
    cliente_id: String(f.cliente_id),
    servicios: Number(f.servicios) || 0,
    total: Number(f.total) || 0,
    primero: f.primero ? String(f.primero).slice(0, 10) : null,
    ultimo: f.ultimo ? String(f.ultimo).slice(0, 10) : null,
    vehiculos: Number(f.vehiculos) || 0,
  }, hoy));
}
