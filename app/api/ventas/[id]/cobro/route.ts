import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { calcularCobro, limpiarCuentas } from '@/lib/pagos/cobro';
import { lineasDePago, resumenCorto } from '@/lib/pagos/desglose';

export const dynamic = 'force-dynamic';

/**
 * Cobrar una venta pendiente: un abono o el pago completo.
 *
 * GET  → los cobros que ya tiene la venta, del más viejo al más nuevo.
 * POST → { metodos_pago, tasa, nota? } registra uno.
 *
 * Antes «Abonar» solo restaba el saldo de la venta: el dinero no quedaba con
 * su día ni con su cuenta, así que una venta del 21 cobrada el 25 decía 21 en
 * todas partes y el reporte del 25 no veía ese dinero. Ahora cada cobro es una
 * fila de `abonos` con su fecha y sus cuentas; la venta conserva su fecha y
 * guarda la del día en que quedó saldada.
 */

const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('ventas', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.db.from('abonos').select('*')
    .eq('venta_id', id).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ abonos: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize('ventas', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { metodos_pago?: Record<string, unknown>; tasa?: number; nota?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { data: venta } = await auth.db.from('ventas_dia').select('*').eq('id', id).maybeSingle();
  if (!venta) return NextResponse.json({ error: 'Esa venta ya no existe.' }, { status: 404 });

  const cuentas = limpiarCuentas(body.metodos_pago);
  const tasa = Number(body.tasa) || Number(venta.tasa_cambio) || 0;
  const r = calcularCobro(venta, cuentas, tasa);
  if ('error' in r) return NextResponse.json({ error: r.detalle }, { status: r.error === 'sin_saldo' ? 409 : 400 });

  const fecha = hoyCaracas();
  const lineas = lineasDePago(cuentas, tasa);
  const soloConDinero = Object.fromEntries(Object.entries(cuentas).filter(([, v]) => v > 0));

  const { data: abono, error: errAbono } = await auth.db.from('abonos').insert({
    venta_id: id,
    fecha,
    monto: r.montoUSD,
    monto_bs: r.montoBs || null,
    tasa_cambio: tasa || null,
    metodo_pago: resumenCorto(lineas),
    metodos_pago: soloConDinero,
    moneda: 'USD',
    saldo_antes: r.saldoAntes,
    saldo_despues: r.saldoDespues,
    nota: body.nota?.trim() || (r.liquida ? 'Pago completo' : 'Abono'),
    registrado_por: auth.user!.nombre,
    sede_id: venta.sede_id,
  }).select().single();
  if (errAbono) return NextResponse.json({ error: errAbono.message }, { status: 400 });

  const { error: errVenta } = await auth.db.from('ventas_dia').update({
    abono: r.abonoTotal,
    tiene_abono: true,
    saldo_pendiente: r.saldoDespues,
    financiado: r.financiado,
    por_cobrar: r.porCobrar,
    estado: r.estado,
    fecha_pago: r.liquida ? fecha : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (errVenta) {
    // El cobro sin la venta al día sería dinero contado dos veces: se deshace.
    await auth.db.from('abonos').delete().eq('id', abono.id);
    return NextResponse.json({ error: errVenta.message }, { status: 400 });
  }

  // La orden de servicio cuenta la historia completa: cuándo y cómo se cobró.
  if (venta.servicio_id) {
    const { data: orden } = await auth.db.from('servicios').select('seguimiento').eq('id', venta.servicio_id).maybeSingle();
    if (orden) {
      const seg = Array.isArray(orden.seguimiento) ? orden.seguimiento : [];
      await auth.db.from('servicios').update({
        seguimiento: [...seg, {
          fecha: new Date().toISOString(),
          accion: r.liquida
            ? `Pagado completo: $${r.montoUSD.toFixed(2)} por ${resumenCorto(lineas)}`
            : `Abono de $${r.montoUSD.toFixed(2)} por ${resumenCorto(lineas)} · quedan $${r.saldoDespues.toFixed(2)}`,
          usuario: auth.user!.nombre,
          tipo: 'pago',
        }],
      }).eq('id', venta.servicio_id);
    }
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'ventas',
    accion: r.liquida ? 'Cobró el saldo completo' : 'Registró un abono',
    detalles: `${venta.cliente || 'Cliente'} · $${r.montoUSD.toFixed(2)} por ${resumenCorto(lineas)} · `
      + `saldo $${r.saldoAntes.toFixed(2)} → $${r.saldoDespues.toFixed(2)} · venta del ${venta.fecha}`,
    referencia_id: id, referencia_tabla: 'ventas_dia', sede_id: venta.sede_id,
  });

  return NextResponse.json({ abono, cobro: r });
}
