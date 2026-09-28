import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { registrarCobro } from '@/lib/pagos/registrar-cobro';

export const dynamic = 'force-dynamic';

/**
 * Cobrar una venta pendiente: un abono o el pago completo.
 *
 * GET  → los cobros que ya tiene la venta, del más viejo al más nuevo.
 * POST → { metodos_pago, tasa, nota? } registra uno.
 *
 * Antes «Abonar» solo restaba el saldo de la venta: el dinero no quedaba con
 * su día ni con su cuenta, así que una venta del 21 cobrada el 25 decía 21 en
 * todas partes y el reporte del 25 no veía ese dinero. El registro vive en
 * `lib/pagos/registrar-cobro.ts`, el mismo que usa el bot.
 */

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

  const r = await registrarCobro(auth.db, id, {
    cuentas: body.metodos_pago, tasa: body.tasa, nota: body.nota, usuario: auth.user!.nombre,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });

  const v = r.venta;
  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'ventas',
    accion: r.cobro.liquida ? 'Cobró el saldo completo' : 'Registró un abono',
    detalles: `${v.cliente || 'Cliente'} · $${r.cobro.montoUSD.toFixed(2)} por ${r.abono.metodo_pago} · `
      + `saldo $${r.cobro.saldoAntes.toFixed(2)} → $${r.cobro.saldoDespues.toFixed(2)} · venta del ${v.fecha}`,
    referencia_id: id, referencia_tabla: 'ventas_dia', sede_id: v.sede_id as string,
  });

  return NextResponse.json({ abono: r.abono, cobro: r.cobro });
}
