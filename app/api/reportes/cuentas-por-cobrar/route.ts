import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { mecanicoDeOrden, servicioDeNotas } from '@/lib/facturas/mecanico';
import type { ClienteDeudor, VentaPendienteCliente } from '@/lib/cobranza/tipos';

export const dynamic = 'force-dynamic';

/**
 * Cuentas por cobrar, agrupadas por cliente.
 *
 * GET ?sede=
 *
 * Cada cliente con lo que debe, venta por venta: qué se le hizo, a qué carro,
 * cuándo, cuánto costó, cuánto abonó y cuándo, y cuánto le queda. Distingue lo
 * que financia Cashea —lo paga Cashea al BNC— de lo que debe el propio
 * cliente, porque se cobran distinto.
 */

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const dias = (desde: string) => Math.max(0, Math.round(
  (new Date(`${hoy()}T12:00:00`).getTime() - new Date(`${String(desde).slice(0, 10)}T12:00:00`).getTime()) / 86400000,
));
const clave = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\(whatsapp\)|admin ia|\d{6,}/gi, '').replace(/\s+/g, ' ').trim();

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sede = auth.effectiveSede(new URL(req.url).searchParams.get('sede'));
  const db = auth.db;

  let q = db.from('ventas_dia').select('*').gt('saldo_pendiente', 0.009).order('fecha', { ascending: true }).limit(2000);
  if (sede) q = q.eq('sede_id', sede);
  const { data: ventas, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lista = (ventas || []) as Array<Record<string, any>>;

  const ids = lista.map(v => v.id);
  const cliIds = [...new Set(lista.map(v => v.cliente_id).filter(Boolean))];
  const servIds = [...new Set(lista.map(v => v.servicio_id || servicioDeNotas(v.notas)).filter(Boolean))] as string[];
  const [abs, clis, servs, jobs] = await Promise.all([
    ids.length ? db.from('abonos').select('venta_id, fecha, created_at, monto, metodo_pago').in('venta_id', ids).order('created_at') : { data: [] },
    cliIds.length ? db.from('clientes').select('id, nombre, apellido, telefono, cedula').in('id', cliIds) : { data: [] },
    servIds.length ? db.from('servicios').select('id, notas, seguimiento, fecha').in('id', servIds) : { data: [] },
    servIds.length ? db.from('job_assignments').select('referencia_id, empleado_nombre, es_taller').in('referencia_id', servIds).eq('es_override', false) : { data: [] },
  ]);
  const abonosDe = new Map<string, Array<Record<string, any>>>();
  for (const a of (abs.data || []) as Array<Record<string, any>>) {
    const l = abonosDe.get(a.venta_id) || []; l.push(a); abonosDe.set(a.venta_id, l);
  }
  const cliente = new Map(((clis.data || []) as Array<Record<string, any>>).map(c => [c.id, c]));
  const orden = new Map(((servs.data || []) as Array<Record<string, any>>).map(s => [s.id, s]));
  const trabajos = new Map<string, Array<Record<string, any>>>();
  for (const j of (jobs.data || []) as Array<Record<string, any>>) {
    const l = trabajos.get(j.referencia_id) || []; l.push(j); trabajos.set(j.referencia_id, l);
  }

  const porCliente = new Map<string, ClienteDeudor>();
  for (const v of lista) {
    const c = v.cliente_id ? cliente.get(v.cliente_id) : null;
    const nombre = c ? `${c.nombre || ''} ${c.apellido || ''}`.trim() : String(v.cliente || 'Consumidor final').trim();
    const k = v.cliente_id || `n:${clave(nombre)}`;
    const sid = v.servicio_id || servicioDeNotas(v.notas);
    const o = sid ? orden.get(sid) : null;
    const desglose = Array.isArray(v.desglose) ? v.desglose : [];
    const trabajo = desglose.map((d: any) => d?.descripcion).filter(Boolean).join(' · ')
      || String(v.notas || '').replace(/\[ServicioID:[^\]]*\]/g, '').replace(/\|\s*Cliente:.*$/i, '').trim() || '—';
    const saldo = r2(v.saldo_pendiente);
    const financiado = Math.min(saldo, r2(v.financiado));
    const cashea = r2(v.cashea) > 0 || v.cashea_pct != null;
    const abonos = (abonosDe.get(v.id) || []).map(a => ({
      fecha: a.fecha || String(a.created_at).slice(0, 10), monto: r2(a.monto), metodo: a.metodo_pago as string | null,
    }));
    const total = r2(r2(v.total_ingresos) * (v.con_iva ? 1.16 : 1));
    const venta: VentaPendienteCliente = {
      id: v.id, fecha: v.fecha, placa: v.placa || null, vehiculo: v.vehiculo_info || null, trabajo,
      mecanico: o ? mecanicoDeOrden({ trabajos: trabajos.get(sid) || [], notas: o.notas, seguimiento: o.seguimiento }) : null,
      total, abonado: r2(total - saldo), saldo,
      financiado: cashea ? financiado : 0, porCobrar: cashea ? r2(saldo - financiado) : saldo,
      cashea, servicio_id: sid || null, abonos, dias: dias(v.fecha),
    };
    let cd = porCliente.get(k);
    if (!cd) {
      cd = {
        clave: k, nombre, telefono: c?.telefono || null, cedula: c?.cedula || null,
        deuda: 0, deudaCashea: 0, deudaCliente: 0, ventas: [], ultimoAbono: null, masAntigua: 0,
      };
      porCliente.set(k, cd);
    }
    cd.ventas.push(venta);
    cd.deuda = r2(cd.deuda + saldo);
    cd.deudaCashea = r2(cd.deudaCashea + venta.financiado);
    cd.deudaCliente = r2(cd.deudaCliente + venta.porCobrar);
    cd.masAntigua = Math.max(cd.masAntigua, venta.dias);
    for (const a of abonos) if (!cd.ultimoAbono || a.fecha >= cd.ultimoAbono.fecha) cd.ultimoAbono = a;
  }

  const clientes = [...porCliente.values()].sort((a, b) => b.deuda - a.deuda);
  return NextResponse.json({
    clientes,
    resumen: {
      total: r2(clientes.reduce((s, c) => s + c.deuda, 0)),
      cashea: r2(clientes.reduce((s, c) => s + c.deudaCashea, 0)),
      clientesDeben: r2(clientes.reduce((s, c) => s + c.deudaCliente, 0)),
      nClientes: clientes.length,
      nVentas: lista.length,
      vencidas30: clientes.filter(c => c.masAntigua > 30).length,
    },
    generado: hoy(),
  });
}
