import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { anularPago, deudasAbiertas, registrarPago, repartir, usdDelPago, type Deuda } from '@/lib/proveedores/pagos';

export const dynamic = 'force-dynamic';

/*
 * Cuentas por pagar y pagos a proveedores.
 *
 *   GET ?proveedor_id=&proveedor=          → deudas abiertas (agrupadas), pagos y saldos a favor
 *   POST { accion: 'previa' }               → cómo se repartiría un pago, sin tocar nada
 *   POST { accion: 'pagar' }                → registra el pago (general o dirigido) y lo aplica
 *   POST { accion: 'usar_saldo' }           → aplica el saldo a favor de un pago anterior
 *   POST { accion: 'anular', id, motivo }   → anula un pago y revierte lo aplicado
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (x: unknown) => Math.round((Number(x) || 0) * 100) / 100;
const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const norm = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const u = new URL(req.url).searchParams;
  const sede = auth.effectiveSede(u.get('sede'));
  const pid = u.get('proveedor_id'); const pnom = u.get('proveedor');
  try {
    const deudas = await deudasAbiertas(auth.db, { sede, proveedorId: pid, proveedorNombre: pnom });
    let qp = auth.db.from('pagos_proveedor').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(300);
    if (sede) qp = qp.eq('sede_id', sede);
    const { data: pagosTodos } = await qp;
    const pagos = (pagosTodos || []).filter(p => !(pid || pnom) || (pid && p.proveedor_id === pid) || (pnom && norm(p.proveedor) === norm(pnom)));
    const ids = pagos.map(p => p.id);
    const { data: apl } = ids.length ? await auth.db.from('pagos_proveedor_aplicaciones').select('*').in('pago_id', ids) : { data: [] };

    // Agrupado por proveedor: lo que se debe, lo vencido y el saldo a favor de cada uno.
    const grupos = new Map<string, { proveedor: string; proveedor_id: string | null; saldo: number; vencido: number; saldoFavor: number; deudas: Deuda[] }>();
    const clave = (id: string | null, nom: string) => (id ? `id:${id}` : `n:${norm(nom)}`);
    for (const d of deudas) {
      const k = clave(d.proveedor_id, d.proveedor);
      const g = grupos.get(k) || { proveedor: d.proveedor, proveedor_id: d.proveedor_id, saldo: 0, vencido: 0, saldoFavor: 0, deudas: [] };
      g.saldo = r2(g.saldo + d.saldo); if (d.vencida) g.vencido = r2(g.vencido + d.saldo); g.deudas.push(d); grupos.set(k, g);
    }
    for (const p of pagos) {
      if (p.anulado || !(Number(p.saldo_favor_usd) > 0)) continue;
      const k = clave(p.proveedor_id, p.proveedor);
      const g = grupos.get(k) || { proveedor: p.proveedor, proveedor_id: p.proveedor_id, saldo: 0, vencido: 0, saldoFavor: 0, deudas: [] };
      g.saldoFavor = r2(g.saldoFavor + Number(p.saldo_favor_usd)); grupos.set(k, g);
    }
    return NextResponse.json({
      total: r2(deudas.reduce((t, d) => t + d.saldo, 0)), vencido: r2(deudas.filter(d => d.vencida).reduce((t, d) => t + d.saldo, 0)),
      proveedores: [...grupos.values()].sort((a, b) => b.saldo - a.saldo),
      pagos: pagos.map(p => ({ ...p, aplicaciones: (apl || []).filter(a => a.pago_id === p.id) })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const auth = await authorize('reportes', b.accion === 'previa' ? 'leer' : 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const usuario = auth.user?.nombre || 'Usuario';
  const sede = auth.effectiveSede(null);
  const err = (m: string, st = 400) => NextResponse.json({ error: m }, { status: st });

  if (b.accion === 'anular') {
    if (!String(b.motivo || '').trim()) return err('Escribe por qué se anula.');
    const r = await anularPago(auth.db, String(b.id || ''), String(b.motivo).trim(), usuario);
    if (!r.ok) return err(r.error, 409);
    await logActivityServer(auth.db, { usuario, modulo: 'Proveedores', accion: 'Anuló un pago a proveedor', detalles: `${r.revertidas} aplicación(es) revertida(s) · ${b.motivo}`, referencia_tabla: 'pagos_proveedor', referencia_id: String(b.id), sede_id: sede });
    return NextResponse.json(r);
  }

  const proveedor = String(b.proveedor || '').trim();
  if (!proveedor) return err('Elige el proveedor.');
  const metodos: Record<string, number> = {};
  for (const [k, v] of Object.entries((b.metodos_pago || {}) as Record<string, unknown>)) if (Number(v) > 0) metodos[k] = r2(v);
  const tasa = Number(b.tasa) || 0;
  const modo = b.accion === 'usar_saldo' || b.modo === 'saldo_favor' ? 'saldo_favor' : (b.modo === 'dirigido' ? 'dirigido' : 'general');
  const objetivos = b.objetivos && typeof b.objetivos === 'object' ? b.objetivos as Record<string, number | null> : undefined;
  if (modo === 'dirigido' && !Object.keys(objetivos || {}).length) return err('Elige a qué deudas va el pago.');

  // Saldo a favor: cuánto queda de ese pago anterior.
  let montoSaldo = 0;
  if (modo === 'saldo_favor') {
    const { data: o } = await auth.db.from('pagos_proveedor').select('id, saldo_favor_usd, anulado').eq('id', String(b.origen_pago_id || '')).maybeSingle();
    if (!o || o.anulado || !(Number(o.saldo_favor_usd) > 0)) return err('Ese pago no tiene saldo a favor disponible.');
    montoSaldo = r2(Math.min(Number(b.monto_usd) || Number(o.saldo_favor_usd), Number(o.saldo_favor_usd)));
  }

  if (b.accion === 'previa') {
    const montoUsd = modo === 'saldo_favor' ? montoSaldo : usdDelPago(metodos, tasa);
    let deudas = await deudasAbiertas(auth.db, { sede, proveedorId: b.proveedor_id || null, proveedorNombre: proveedor });
    if (modo === 'dirigido' && objetivos) deudas = deudas.filter(d => `${d.origen}:${d.id}` in objetivos);
    const montos: Record<string, number> = {}; for (const [k, v] of Object.entries(objetivos || {})) if (v != null && Number(v) > 0) montos[k] = Number(v);
    return NextResponse.json({ montoUsd, ...repartir(deudas, montoUsd, montos) });
  }

  if (b.accion !== 'pagar' && b.accion !== 'usar_saldo') return err('Acción desconocida.');
  const fecha = FECHA.test(String(b.fecha || '')) ? String(b.fecha) : hoyCaracas();
  if (fecha > hoyCaracas()) return err('La fecha del pago no puede ser futura.');
  const r = await registrarPago(auth.db, {
    fecha, proveedor, proveedor_id: b.proveedor_id || null, metodos_pago: modo === 'saldo_favor' ? {} : metodos, tasa, modo,
    criterio: b.criterio || null, objetivos, referencia: b.referencia || null, comprobante_url: b.comprobante_url || null, nota: b.nota || null,
    usuario, sede, origen_pago_id: modo === 'saldo_favor' ? String(b.origen_pago_id) : null, monto_usd: montoSaldo,
  });
  if (!r.ok) return err(r.error);
  await logActivityServer(auth.db, {
    usuario, modulo: 'Proveedores', accion: modo === 'saldo_favor' ? 'Aplicó saldo a favor de proveedor' : 'Registró pago a proveedor',
    detalles: `${proveedor} · $${Number(r.pago.monto_usd).toFixed(2)} · ${r.aplicaciones.length} deuda(s)${r.sobrante > 0 ? ` · saldo a favor $${r.sobrante.toFixed(2)}` : ''}${b.referencia ? ` · ref ${b.referencia}` : ''}`,
    referencia_tabla: 'pagos_proveedor', referencia_id: String(r.pago.id), sede_id: sede,
  });
  return NextResponse.json(r);
}
