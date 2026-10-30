import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';

export const dynamic = 'force-dynamic';

/*
 * Las cuentas de la empresa: las que reciben cobros de ventas (tienen el método de pago, `bin`)
 * y las internas (caja chica, BNC 8215 de cuotas, ahorro…). Cada una dice con qué estado de
 * cuenta se concilia.
 *
 *   GET            → todas, también las desactivadas
 *   POST  {…}      → crear
 *   PATCH {id, …}  → modificar (desactivar = activo:false; nunca se borra: tiene historia)
 *
 * Reglas que protegen los saldos:
 *   · un método de pago solo puede estar en UNA cuenta activa (si no, cada venta sumaría en dos);
 *   · la moneda de la cuenta es la del método (no se suman bolívares a una cuenta en dólares).
 */

const TIPOS = ['efectivo', 'banco', 'digital', 'caja_chica'];
const MONEDAS = ['VES', 'USD', 'EUR'];
const FORMATOS = ['banesco', 'bnc', 'bnc_cuotas', 'exterior', 'cashea'];
const r2 = (x: unknown) => Math.round((Number(x) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sede = auth.effectiveSede(new URL(req.url).searchParams.get('sede'));
  let q = auth.db.from('cuentas_financieras').select('*').order('activo', { ascending: false }).order('orden');
  if (sede) q = q.or(`sede_id.is.null,sede_id.eq.${sede}`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    cuentas: data || [],
    metodos: BANK_METHODS.map(m => ({ id: m.id, label: m.label, moneda: m.moneda === 'Bs' ? 'VES' : 'USD' })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

function limpiar(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (b.nombre !== undefined) out.nombre = String(b.nombre || '').trim().slice(0, 80);
  if (b.tipo !== undefined) out.tipo = String(b.tipo);
  if (b.moneda !== undefined) out.moneda = String(b.moneda);
  if (b.banco !== undefined) out.banco = String(b.banco || '').trim() || null;
  if (b.referencia !== undefined) out.referencia = String(b.referencia || '').trim() || null;
  if (b.titular !== undefined) out.titular = String(b.titular || '').trim() || null;
  if (b.bin !== undefined) out.bin = String(b.bin || '') || null;
  if (b.conciliacion_banco !== undefined) out.conciliacion_banco = String(b.conciliacion_banco || '') || null;
  if (b.notas !== undefined) out.notas = String(b.notas || '').trim() || null;
  if (b.orden !== undefined) out.orden = Math.round(Number(b.orden) || 0);
  if (b.activo !== undefined) out.activo = Boolean(b.activo);
  return out;
}

async function validar(db: Parameters<typeof logActivityServer>[0], fila: Record<string, unknown>, id: string | null): Promise<string | null> {
  if (!String(fila.nombre || '').trim()) return 'Ponle nombre a la cuenta.';
  if (!TIPOS.includes(String(fila.tipo))) return 'Tipo de cuenta no válido.';
  if (!MONEDAS.includes(String(fila.moneda))) return 'Moneda no válida.';
  if (fila.conciliacion_banco && !FORMATOS.includes(String(fila.conciliacion_banco))) return 'Formato de estado de cuenta no válido.';
  if (fila.bin) {
    const m = BANK_METHODS.find(x => x.id === fila.bin);
    if (!m) return 'Ese método de cobro no existe.';
    const monedaMetodo = m.moneda === 'Bs' ? 'VES' : 'USD';
    if (monedaMetodo !== fila.moneda) return `«${m.label}» se cobra en ${m.moneda}: la cuenta tiene que estar en ${monedaMetodo === 'VES' ? 'bolívares' : 'dólares'}.`;
    if (fila.activo !== false) {
      let q = db.from('cuentas_financieras').select('id, nombre').eq('bin', String(fila.bin)).eq('activo', true);
      if (id) q = q.neq('id', id);
      const { data } = await q.limit(1);
      if (data?.length) return `«${m.label}» ya está en la cuenta «${data[0].nombre}». Un método de cobro va en una sola cuenta; si no, cada venta sumaría dos veces.`;
    }
  }
  const { data: igual } = await (id ? db.from('cuentas_financieras').select('id').ilike('nombre', String(fila.nombre)).neq('id', id) : db.from('cuentas_financieras').select('id').ilike('nombre', String(fila.nombre))).limit(1);
  if (igual?.length) return 'Ya hay una cuenta con ese nombre.';
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await authorize('configuracion', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({}));
  const fila = { tipo: 'banco', moneda: 'VES', activo: true, ...limpiar(b) };
  const err = await validar(auth.db, fila, null);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  const { data, error } = await auth.db.from('cuentas_financieras').insert({
    ...fila, saldo_inicial: r2(b.saldo_inicial), desde: /^\d{4}-\d{2}-\d{2}$/.test(String(b.desde || '')) ? b.desde : hoy, sede_id: auth.user?.sede_id || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivityServer(auth.db, { usuario: auth.user?.nombre || 'Usuario', modulo: 'Finanzas', accion: 'Creó una cuenta', detalles: `${data.nombre} · ${data.moneda}${data.bin ? ` · cobra ${data.bin}` : ' · interna'}`, referencia_tabla: 'cuentas_financieras', referencia_id: data.id, sede_id: auth.user?.sede_id || null });
  return NextResponse.json({ ok: true, cuenta: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize('configuracion', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  const { data: antes } = await auth.db.from('cuentas_financieras').select('*').eq('id', id).maybeSingle();
  if (!antes) return NextResponse.json({ error: 'Esa cuenta no existe.' }, { status: 404 });
  const cambios = limpiar(b);
  const err = await validar(auth.db, { ...antes, ...cambios }, id);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const { data, error } = await auth.db.from('cuentas_financieras').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const dif = Object.keys(cambios).filter(k => String(antes[k] ?? '') !== String(cambios[k] ?? '')).map(k => `${k}: ${antes[k] ?? '—'} → ${cambios[k] ?? '—'}`).join(' · ');
  await logActivityServer(auth.db, { usuario: auth.user?.nombre || 'Usuario', modulo: 'Finanzas', accion: 'Modificó una cuenta', detalles: `${data.nombre} · ${dif || 'sin cambios'}`, referencia_tabla: 'cuentas_financieras', referencia_id: id, sede_id: auth.user?.sede_id || null });
  return NextResponse.json({ ok: true, cuenta: data });
}
