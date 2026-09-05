import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Utilidad por Cliente / Vehículo.
 *
 * Ingresos  → `ventas_dia`  (lo que el vehículo dejó al taller)
 * Egresos   → `egresos`     (lo que se gastó por ese mismo vehículo)
 * Utilidad  = Ingresos − Egresos
 *
 * La agrupación es por VEHÍCULO cuando hay placa/vehiculo_id (que es lo que
 * realmente se quiere medir); si un registro no tiene vehículo, cae en el
 * grupo del cliente. Lo consumen: /api/reportes/utilidad, el Excel y el bot.
 */

export interface UtilidadRow {
  key: string;
  cliente: string;
  cliente_id: string | null;
  placa: string;
  vehiculo: string;
  vehiculo_id: string | null;
  ingresos: number;
  egresos: number;
  utilidad: number;
  margen: number;          // % sobre ingresos
  n_ventas: number;
  n_egresos: number;
}

export interface UtilidadParams {
  desde: string;
  hasta: string;
  sedeId?: string | null;
}

const n2 = (n: number) => Number((n || 0).toFixed(2));

export async function buildUtilidad(db: SupabaseClient, p: UtilidadParams): Promise<UtilidadRow[]> {
  let vq = db.from('ventas_dia')
    .select('cliente, cliente_id, vehiculo_id, placa, vehiculo_info, total_ingresos, fecha')
    .gte('fecha', p.desde).lte('fecha', p.hasta);
  if (p.sedeId) vq = vq.eq('sede_id', p.sedeId);

  let eq = db.from('egresos')
    .select('cliente_nombre, cliente, cliente_id, vehiculo_id, placa, vehiculo_info, total_egresos, fecha')
    .gte('fecha', p.desde).lte('fecha', p.hasta);
  if (p.sedeId) eq = eq.eq('sede_id', p.sedeId);

  const [{ data: ventas }, { data: egresos }] = await Promise.all([vq, eq]);

  const map = new Map<string, UtilidadRow>();

  // Clave de agrupación: placa (normalizada) → si no hay, cliente_id → si no, nombre.
  const keyOf = (placa?: string | null, clienteId?: string | null, cliente?: string | null) => {
    const pl = (placa || '').trim().toUpperCase();
    if (pl) return `P:${pl}`;
    if (clienteId) return `C:${clienteId}`;
    return `N:${(cliente || 'Consumidor Final').trim().toUpperCase()}`;
  };

  const ensure = (key: string, seed: Partial<UtilidadRow>): UtilidadRow => {
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        cliente: seed.cliente || 'Consumidor Final',
        cliente_id: seed.cliente_id ?? null,
        placa: seed.placa || '—',
        vehiculo: seed.vehiculo || '—',
        vehiculo_id: seed.vehiculo_id ?? null,
        ingresos: 0, egresos: 0, utilidad: 0, margen: 0, n_ventas: 0, n_egresos: 0,
      };
      map.set(key, row);
    }
    // Completa datos faltantes con lo que vaya llegando
    if ((!row.cliente || row.cliente === 'Consumidor Final') && seed.cliente) row.cliente = seed.cliente;
    if (!row.cliente_id && seed.cliente_id) row.cliente_id = seed.cliente_id;
    if ((!row.placa || row.placa === '—') && seed.placa) row.placa = seed.placa;
    if ((!row.vehiculo || row.vehiculo === '—') && seed.vehiculo) row.vehiculo = seed.vehiculo;
    if (!row.vehiculo_id && seed.vehiculo_id) row.vehiculo_id = seed.vehiculo_id;
    return row;
  };

  for (const v of (ventas || []) as any[]) {
    const key = keyOf(v.placa, v.cliente_id, v.cliente);
    const row = ensure(key, {
      cliente: v.cliente, cliente_id: v.cliente_id,
      placa: (v.placa || '').toUpperCase(), vehiculo: v.vehiculo_info, vehiculo_id: v.vehiculo_id,
    });
    row.ingresos += Number(v.total_ingresos) || 0;
    row.n_ventas += 1;
  }

  for (const e of (egresos || []) as any[]) {
    // El egreso sólo se imputa a un vehículo/cliente si está asociado.
    if (!e.placa && !e.vehiculo_id && !e.cliente_id) continue;
    const key = keyOf(e.placa, e.cliente_id, e.cliente_nombre);
    const row = ensure(key, {
      cliente: e.cliente_nombre, cliente_id: e.cliente_id,
      placa: (e.placa || '').toUpperCase(), vehiculo: e.vehiculo_info, vehiculo_id: e.vehiculo_id,
    });
    row.egresos += Number(e.total_egresos) || 0;
    row.n_egresos += 1;
  }

  const filas = [...map.values()].map(r => {
    r.ingresos = n2(r.ingresos);
    r.egresos = n2(r.egresos);
    r.utilidad = n2(r.ingresos - r.egresos);
    r.margen = r.ingresos > 0 ? Number(((r.utilidad / r.ingresos) * 100).toFixed(1)) : 0;
    return r;
  });

  filas.sort((a, b) => b.utilidad - a.utilidad);
  return filas;
}
