import { calcularCobro, limpiarCuentas, type ResultadoCobro } from '@/lib/pagos/cobro';
import { lineasDePago, resumenCorto } from '@/lib/pagos/desglose';

/**
 * Registrar el cobro de una venta pendiente: un solo camino para todos.
 *
 * Lo usan el punto de venta, la pestaña de cuentas por cobrar y el bot de
 * WhatsApp. Antes cada uno restaba el saldo a su manera —el bot, además, sin
 * contar el IVA ni lo financiado por Cashea— y ninguno dejaba el cobro con su
 * día y su cuenta.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

export const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

export interface EntradaCobro {
  cuentas?: Record<string, unknown> | null;
  tasa?: number | null;
  /** Dinero cobrado sin cuenta conocida, en dólares. */
  sinCuentaUSD?: number;
  nota?: string | null;
  usuario: string;
  /**
   * El día en que entró el dinero, si no es hoy: las cuotas de Cashea se
   * descuentan desde su reporte, días después de cobrarse, y cuentan el día
   * en que se pagaron.
   */
  fecha?: string;
}

export type SalidaCobro =
  | { ok: true; abono: Record<string, unknown>; cobro: ResultadoCobro; venta: Record<string, unknown> }
  | { ok: false; estado: number; error: string };

export async function registrarCobro(db: Db, ventaId: string, e: EntradaCobro): Promise<SalidaCobro> {
  const { data: venta } = await db.from('ventas_dia').select('*').eq('id', ventaId).maybeSingle();
  if (!venta) return { ok: false, estado: 404, error: 'Esa venta ya no existe.' };

  const cuentas = limpiarCuentas(e.cuentas);
  const tasa = Number(e.tasa) || Number(venta.tasa_cambio) || 0;
  const sinCuenta = Math.max(0, Number(e.sinCuentaUSD) || 0);
  const r = calcularCobro(venta, cuentas, tasa, sinCuenta);
  if ('error' in r) return { ok: false, estado: r.error === 'sin_saldo' ? 409 : 400, error: r.detalle };

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(e.fecha || '') ? e.fecha! : hoyCaracas();
  const lineas = lineasDePago(cuentas, tasa);
  const soloConDinero = Object.fromEntries(Object.entries(cuentas).filter(([, v]) => v > 0));
  const metodo = lineas.length
    ? resumenCorto(lineas) + (sinCuenta > 0 ? ' + sin cuenta' : '')
    : 'Sin cuenta registrada';

  const { data: abono, error: errAbono } = await db.from('abonos').insert({
    venta_id: ventaId,
    fecha,
    monto: r.montoUSD,
    monto_bs: r.montoBs || null,
    tasa_cambio: tasa || null,
    metodo_pago: metodo,
    metodos_pago: Object.keys(soloConDinero).length ? soloConDinero : null,
    moneda: 'USD',
    saldo_antes: r.saldoAntes,
    saldo_despues: r.saldoDespues,
    nota: e.nota?.trim() || (r.liquida ? 'Pago completo' : 'Abono'),
    registrado_por: e.usuario,
    sede_id: venta.sede_id,
  }).select().single();
  if (errAbono) return { ok: false, estado: 400, error: errAbono.message };

  const { error: errVenta } = await db.from('ventas_dia').update({
    abono: r.abonoTotal,
    tiene_abono: true,
    saldo_pendiente: r.saldoDespues,
    financiado: r.financiado,
    por_cobrar: r.porCobrar,
    estado: r.estado,
    fecha_pago: r.liquida ? fecha : null,
    updated_at: new Date().toISOString(),
  }).eq('id', ventaId);
  if (errVenta) {
    // El cobro sin la venta al día sería dinero contado dos veces: se deshace.
    await db.from('abonos').delete().eq('id', abono.id);
    return { ok: false, estado: 400, error: errVenta.message };
  }

  // La orden de servicio cuenta la historia completa: cuándo y cómo se cobró.
  if (venta.servicio_id) {
    const { data: orden } = await db.from('servicios').select('seguimiento').eq('id', venta.servicio_id).maybeSingle();
    if (orden) {
      const seg = Array.isArray(orden.seguimiento) ? orden.seguimiento : [];
      await db.from('servicios').update({
        seguimiento: [...seg, {
          fecha: new Date().toISOString(),
          accion: r.liquida
            ? `Pagado completo: $${r.montoUSD.toFixed(2)} por ${metodo}`
            : `Abono de $${r.montoUSD.toFixed(2)} por ${metodo} · quedan $${r.saldoDespues.toFixed(2)}`,
          usuario: e.usuario,
          tipo: 'pago',
        }],
      }).eq('id', venta.servicio_id);
    }
  }

  return { ok: true, abono, cobro: r, venta };
}
