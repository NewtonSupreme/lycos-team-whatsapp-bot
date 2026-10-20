import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getRoleMeta } from '@/types';
import {
  ESTADOS_ENTRADA, ESTADOS_PANTALLA, nombreCorto,
  type OrdenPantalla, type PersonaPantalla, type TableroTaller,
} from '@/lib/taller/pantalla';

export const dynamic = 'force-dynamic';

const n = (x: unknown) => Number(x) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Lo que muestra la pantalla del taller: vehículos en curso, el personal que
 * puede cargar trabajos y los trabajos que más se cargan (con su precio usual).
 * Sin teléfonos ni datos de cobro: solo lo que hace falta en el piso.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('taller', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sede = auth.effectiveSede(req.nextUrl.searchParams.get('sede'));

  let q = auth.db.from('servicios')
    .select('id, placa, vehiculo_info, nombre_cliente, descripcion, tipo, tipo_personalizado, estado, created_at, updated_at, items, encargados, costo_estimado, seguimiento, puesto')
    .in('estado', ESTADOS_PANTALLA as unknown as string[])
    .order('updated_at', { ascending: false })
    .limit(150);
  if (sede) q = q.eq('sede_id', sede);

  let qp = auth.db.from('usuarios').select('id, nombre, alias, foto_url, rol, activo, sede_id').neq('activo', false).order('nombre');
  if (sede) qp = qp.eq('sede_id', sede);

  // Para las sugerencias: los renglones de las últimas órdenes.
  let qh = auth.db.from('servicios').select('items').order('created_at', { ascending: false }).limit(400);
  if (sede) qh = qh.eq('sede_id', sede);

  const [{ data: filas, error }, { data: gente }, { data: historial }] = await Promise.all([q, qp, qh]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ordenes: OrdenPantalla[] = (filas || []).map(s => {
    const items = Array.isArray(s.items) ? s.items as Array<Record<string, unknown>> : [];
    const seg = Array.isArray(s.seguimiento) ? s.seguimiento as Array<{ accion?: string }> : [];
    const enc = Array.isArray(s.encargados) ? s.encargados as Array<{ empleado_id?: string; nombre?: string }> : [];
    return {
      id: s.id,
      placa: String(s.placa || '').toUpperCase() || 'SIN PLACA',
      vehiculo: String(s.vehiculo_info || '').replace(new RegExp(String(s.placa || '@@'), 'i'), '').trim() || 'Vehículo',
      cliente: nombreCorto(String(s.nombre_cliente || '')),
      trabajo: String(s.tipo_personalizado || s.descripcion || s.tipo || 'Servicio'),
      estado: s.estado,
      columna: ESTADOS_ENTRADA.includes(s.estado) ? 'entrada' : 'taller',
      desde: s.created_at,
      movida: s.updated_at,
      renglones: items.map(i => ({
        descripcion: String(i.descripcion || ''),
        cantidad: n(i.cantidad) || 1,
        total: r2(n(i.total) || n(i.precio_unitario) * (n(i.cantidad) || 1)),
        esManoObra: !!i.es_mano_obra || /mano de obra|m\.?o\.?\b/i.test(String(i.descripcion || '')),
      })).filter(i => i.descripcion),
      total: r2(n(s.costo_estimado)),
      encargados: enc.filter(e => e?.nombre).map(e => ({ id: e.empleado_id || null, nombre: String(e.nombre) })),
      ultimo: seg.length ? String(seg[seg.length - 1]?.accion || '') || null : null,
      puesto: (s.puesto as string) || null,
    };
  });

  const personal: PersonaPantalla[] = (gente || [])
    .filter(u => getRoleMeta(u.rol)?.esTecnico && !/taller \(sin/i.test(u.nombre || ''))
    .map(u => ({ id: u.id, nombre: u.nombre, corto: (u.alias as string) || nombreCorto(u.nombre).replace(/\.$/, ''), foto: (u.foto_url as string) || null }));

  // Lo que más se carga como mano de obra, con el precio más común.
  const cuenta = new Map<string, { descripcion: string; precios: number[] }>();
  for (const h of historial || []) {
    for (const i of (Array.isArray(h.items) ? h.items as Array<Record<string, unknown>> : [])) {
      const d = String(i.descripcion || '').trim();
      const esMO = !!i.es_mano_obra || /mano de obra|instalaci|soldadura|alineaci|balanceo|cambio de|reparaci/i.test(d);
      if (!d || !esMO || d.length > 60) continue;
      const k = d.toLowerCase();
      const e = cuenta.get(k) || { descripcion: d, precios: [] };
      const p = n(i.precio_unitario) || n(i.total);
      if (p > 0) e.precios.push(p);
      cuenta.set(k, e);
    }
  }
  const moda = (xs: number[]) => {
    const m = new Map<number, number>(); xs.forEach(x => m.set(x, (m.get(x) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  };
  const sugerencias = [...cuenta.values()]
    .map(e => ({ descripcion: e.descripcion, precio: moda(e.precios), veces: e.precios.length }))
    .filter(e => e.veces >= 2)
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 16);

  const tablero: TableroTaller = { ordenes, personal, sugerencias, generado: new Date().toISOString() };
  return NextResponse.json(tablero);
}
