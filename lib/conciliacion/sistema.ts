// ─────────────────────────────────────────────────────────────────────────────
// Lo que el sistema dice que entró o salió por cada cuenta, listo para cruzar
// con el estado de cuenta.
//
//   · Ventas del día  → cada columna de banco con monto es un ingreso.
//   · Cobros (abonos) → igual, con el día del cobro. Los de tipo «inicial» ya
//                       están en su venta y se saltan (si no, doble conteo).
//   · Egresos         → el reparto por cuenta (exacto, en la moneda de la
//                       cuenta) o, en los viejos, la cuenta suelta con su total.
//
// Los montos van en la moneda de la cuenta, tal como se capturaron: los
// bolívares del pago móvil se comparan al céntimo con el banco.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { BANK_METHODS, type BankBin } from '@/lib/reporte/ventas-mapping';
import { binsDeFila } from '@/lib/reporte/entradas';
import type { AsientoSistema, DatosSistema, VentaCashea } from './motor';
import type { BancoConciliable } from './leer-estado';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;
const MONEDA = new Map(BANK_METHODS.map(m => [m.id, m.moneda]));

async function todas<T>(construir: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await construir().range(i, i + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

function asiento(base: Omit<AsientoSistema, 'id' | 'enDolares' | 'usd' | 'monto'>, monto: number): AsientoSistema {
  const enDolares = MONEDA.get(base.cuenta) === 'USD';
  return {
    ...base,
    id: `${base.tabla}:${base.registroId}:${base.cuenta}`,
    monto: r2(monto), enDolares,
    usd: r2(enDolares ? monto : (base.tasa > 0 ? monto / base.tasa : 0)),
  };
}

function primerDetalle(desglose: unknown, notas: unknown): string {
  if (Array.isArray(desglose)) {
    const d = desglose.map(x => (x && typeof x === 'object' ? (x as { descripcion?: string }).descripcion : '')).filter(Boolean);
    if (d.length) return d.join(', ').slice(0, 90);
  }
  return String(notas || '').replace(/\[[^\]]*\]/g, '').trim().slice(0, 90);
}

export async function cargarSistema(
  db: SupabaseClient,
  opciones: { desde: string; hasta: string; sede: string | null; cuentas: BankBin[]; banco: BancoConciliable },
): Promise<DatosSistema> {
  const { desde, hasta, sede, cuentas, banco } = opciones;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el constructor de Supabase anidado agota la inferencia de tipos
  const conSede = (q: any) => (sede ? q.eq('sede_id', sede) : q);

  const [ventas, abonos, egresos, usuarios, trabajos] = await Promise.all([
    todas<Record<string, unknown>>(() => conSede(db.from('ventas_dia').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas<Record<string, unknown>>(() => conSede(db.from('abonos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas<Record<string, unknown>>(() => conSede(db.from('egresos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    db.from('usuarios').select('nombre, cedula').then(r => r.data || []),
    db.from('job_assignments').select('empleado_nombre').gte('fecha', desde).then(r => r.data || []),
  ]);

  // Cliente y trabajo de las ventas que tienen cobros.
  const idsVenta = [...new Set(abonos.map(a => String(a.venta_id || '')).filter(Boolean))];
  const ventasDeAbonos = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < idsVenta.length; i += 200) {
    const { data } = await db.from('ventas_dia').select('id, cliente, placa, desglose, notas, servicio_id').in('id', idsVenta.slice(i, i + 200));
    for (const v of data || []) ventasDeAbonos.set(String(v.id), v);
  }

  const conCashea = banco === 'cashea' || banco === 'bnc';
  const todos: AsientoSistema[] = [];
  for (const v of ventas) {
    const bins = binsDeFila(v);
    const tasa = n(v.tasa_cambio) || n(v.tasa);
    // Venta con Cashea guardada a la antigua: todo el monto en la columna, sin
    // inicial ni financiado. Esa cifra no es un pago que llegue al BNC.
    const casheaViejo = n(v.inicial) === 0 && n(v.financiado) === 0 && v.cashea_pct == null;
    for (const m of BANK_METHODS) {
      const monto = n(bins[m.id]);
      if (monto <= 0) continue;
      if (m.id === 'cashea' && conCashea && casheaViejo) continue;
      todos.push(asiento({
        tabla: 'ventas_dia', registroId: String(v.id), fecha: String(v.fecha).slice(0, 10), sentido: 'ingreso',
        cuenta: m.id, tasa, concepto: String(v.cliente || 'Cliente'), detalle: primerDetalle(v.desglose, v.notas),
        placa: (v.placa as string) || null, referencia: (v.comprobante_referencia as string) || null,
        servicioId: (v.servicio_id as string) || null,
      }, monto));
    }
  }
  for (const a of abonos) {
    if (String(a.metodo_pago || '') === 'inicial') continue;
    const mp = a.metodos_pago && typeof a.metodos_pago === 'object' ? a.metodos_pago as Record<string, unknown> : null;
    if (!mp) continue;
    const v = ventasDeAbonos.get(String(a.venta_id)) || {};
    const tasa = n(a.tasa_cambio);
    for (const m of BANK_METHODS) {
      const monto = n(mp[m.id]);
      if (monto <= 0) continue;
      todos.push(asiento({
        tabla: 'abonos', registroId: String(a.id), fecha: String(a.fecha || a.created_at).slice(0, 10), sentido: 'ingreso',
        cuenta: m.id, tasa, concepto: String(v.cliente || 'Cliente'), detalle: `Cobro de deuda · ${primerDetalle(v.desglose, v.notas)}`.slice(0, 90),
        placa: (v.placa as string) || null, referencia: null, servicioId: (v.servicio_id as string) || null,
      }, monto));
    }
  }
  for (const e of egresos) {
    const tasa = n(e.tasa_cambio);
    const reparto = e.metodos_pago && typeof e.metodos_pago === 'object' ? e.metodos_pago as Record<string, unknown> : null;
    const base = {
      tabla: 'egresos' as const, registroId: String(e.id), fecha: String(e.fecha).slice(0, 10), sentido: 'egreso' as const, tasa,
      concepto: String(e.proveedor || e.cliente_nombre || e.cliente || 'Gasto'),
      detalle: primerDetalle(e.desglose, e.notas) || String(e.categoria || ''),
      placa: (e.placa as string) || null, referencia: null, servicioId: (e.servicio_id as string) || null,
    };
    if (reparto && Object.values(reparto).some(x => n(x) > 0)) {
      for (const m of BANK_METHODS) {
        const monto = n(reparto[m.id]);
        if (monto > 0) todos.push(asiento({ ...base, cuenta: m.id }, monto));
      }
      continue;
    }
    const bin = String(e.metodo_pago || '') as BankBin;
    if (!MONEDA.has(bin)) continue;
    const total = n(e.total_egresos);
    const esUsd = String(e.moneda || 'USD').toUpperCase() === 'USD';
    // Egreso viejo en dólares pagado desde una cuenta en bolívares: solo se
    // sabe el monto a la tasa, así que va como dólares (se cruza con tolerancia).
    if (MONEDA.get(bin) === 'Bs' && esUsd) {
      const a = asiento({ ...base, cuenta: bin }, total * (tasa || 0));
      todos.push({ ...a, enDolares: true, usd: r2(total), monto: r2(total) });
    } else {
      todos.push(asiento({ ...base, cuenta: bin }, total));
    }
  }

  const personal = new Map<string, { nombre: string; cedula: string | null }>();
  for (const u of usuarios as Array<{ nombre: string | null; cedula: string | null }>) {
    if (u.nombre && u.nombre.trim().length > 3) personal.set(u.nombre.trim().toUpperCase(), { nombre: u.nombre.trim(), cedula: u.cedula || null });
  }
  for (const t of trabajos as Array<{ empleado_nombre: string | null }>) {
    const nom = (t.empleado_nombre || '').trim();
    if (nom.length > 3 && !/taller/i.test(nom) && !personal.has(nom.toUpperCase())) personal.set(nom.toUpperCase(), { nombre: nom, cedula: null });
  }

  // ── Cashea: las ventas financiadas (hasta 100 días antes, porque la cuota 3
  // llega unas seis semanas después de la venta) y lo cobrado de cada una.
  let ventasCashea: VentaCashea[] = [];
  let ventasRecientes: DatosSistema['ventasRecientes'] = [];
  if (conCashea) {
    const inicio = new Date(Date.parse(desde) - 100 * 86_400_000).toISOString().slice(0, 10);
    const filas = await todas<Record<string, unknown>>(() => conSede(db.from('ventas_dia')
      .select('id, fecha, cliente, placa, total_ingresos, inicial, financiado, cashea, cashea_pct, servicio_id')
      .gte('fecha', inicio).lte('fecha', hasta).or('cashea.gt.0,financiado.gt.0,cashea_pct.not.is.null').order('fecha')));
    const cobrado = new Map<string, number>();
    const ids = filas.map(v => String(v.id));
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('abonos').select('venta_id, metodos_pago, metodo_pago').in('venta_id', ids.slice(i, i + 200));
      for (const a of data || []) {
        if (String(a.metodo_pago || '') === 'inicial') continue;
        const usd = n((a.metodos_pago as Record<string, unknown> | null)?.cashea);
        if (usd > 0) cobrado.set(String(a.venta_id), r2((cobrado.get(String(a.venta_id)) || 0) + usd));
      }
    }
    // Todas las ventas del mismo lapso, para sugerir candidatas a las órdenes
    // de Cashea que no aparecen como Cashea en el sistema.
    const todasV = await todas<Record<string, unknown>>(() => conSede(db.from('ventas_dia')
      .select('id, fecha, cliente, placa, total_ingresos, metodos_pago')
      .gte('fecha', inicio).lte('fecha', hasta).order('fecha')));
    ventasRecientes = todasV.map(v => ({
      id: String(v.id), fecha: String(v.fecha).slice(0, 10), cliente: String(v.cliente || 'Cliente'),
      placa: (v.placa as string) || null, total: n(v.total_ingresos),
      metodo: Object.keys((v.metodos_pago as Record<string, unknown>) || {}).join(' + ') || 'sin método',
    }));
    ventasCashea = filas.map(v => ({
      id: String(v.id), fecha: String(v.fecha).slice(0, 10), cliente: String(v.cliente || 'Cliente'),
      placa: (v.placa as string) || null, total: n(v.total_ingresos), inicial: n(v.inicial),
      financiado: n(v.financiado), casheaCol: n(v.cashea), servicioId: (v.servicio_id as string) || null,
      cuotasRegistradasUSD: cobrado.get(String(v.id)) || 0,
    }));
  }

  const propias = new Set(cuentas);
  // En el BNC (cuenta de Cashea) y en el reporte de Cashea se espera la inicial
  // (columna «cashea» de la venta, «cuota 0» en Cashea) y cada cuota cobrada.
  return {
    propios: todos.filter(a => propias.has(a.cuenta)),
    otros: todos.filter(a => !propias.has(a.cuenta)),
    personal: [...personal.values()],
    ventasCashea,
    ventasRecientes,
  };
}
