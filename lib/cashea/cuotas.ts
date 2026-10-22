import { CUOTAS_CASHEA } from '@/lib/pagos/cashea';

/*
 * El plan de cuotas de una venta financiada con Cashea, como lo lleva Cashea:
 * lo financiado se paga en 3 cuotas iguales, una cada 14 días desde la compra
 * (así salen en el reporte de cuotas cobradas: 3/9, 17/9, 1/10…).
 *
 * Lo pagado se reparte en orden —primero la cuota 1, luego la 2…— porque así
 * lo cobra Cashea: un pago de «2,3» salda las dos. Aquí no hay base de datos:
 * solo la cuenta, para usarla igual en Por cobrar, en el PDF y al descontar.
 */

export const DIAS_ENTRE_CUOTAS = 14;

export type EstadoCuota = 'pagada' | 'parcial' | 'vencida' | 'por_vencer';

export interface CuotaPlan {
  n: number;
  monto: number;
  vence: string;            // AAAA-MM-DD
  pagado: number;
  falta: number;
  estado: EstadoCuota;
  /** Día en que quedó saldada (el del pago que la completó). */
  pagadaEl: string | null;
  /** Días de atraso (vencida) o que faltan para vencer (por vencer). */
  dias: number;
}

export interface PlanCuotas {
  /** Lo financiado al vender: lo que hoy falta más lo ya pagado en cuotas. */
  financiado: number;
  cuota: number;
  cuotas: CuotaPlan[];
  pagado: number;
  falta: number;
  /** La primera cuota sin saldar: la que toca cobrar. */
  proxima: CuotaPlan | null;
  vencidas: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const masDias = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const entre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * @param fecha       día de la venta (la compra en Cashea)
 * @param faltaHoy    lo financiado que todavía se debe (`ventas_dia.financiado`)
 * @param pagos       las cuotas ya cobradas después de la venta (sin la inicial)
 * @param hoy         AAAA-MM-DD, hora de Caracas
 */
export function planDeCuotas(
  { fecha, faltaHoy, pagos }: { fecha: string; faltaHoy: number; pagos: Array<{ fecha: string; monto: number }> },
  hoy: string,
  n = CUOTAS_CASHEA,
): PlanCuotas | null {
  const ordenados = [...pagos].filter(p => p.monto > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pagado = r2(ordenados.reduce((a, p) => a + p.monto, 0));
  const financiado = r2(Math.max(0, faltaHoy) + pagado);
  if (financiado <= 0.009) return null;

  // Tres cuotas iguales; el céntimo que sobra del redondeo va en la última.
  const cuota = r2(financiado / n);
  let cola = [...ordenados.map(p => ({ ...p }))];
  const cuotas: CuotaPlan[] = Array.from({ length: n }, (_, i) => {
    const monto = i === n - 1 ? r2(financiado - cuota * (n - 1)) : cuota;
    const vence = masDias(fecha, DIAS_ENTRE_CUOTAS * (i + 1));
    let pagadoAqui = 0, pagadaEl: string | null = null;
    while (cola.length && pagadoAqui < monto - 0.009) {
      const p = cola[0];
      const toma = Math.min(p.monto, r2(monto - pagadoAqui));
      pagadoAqui = r2(pagadoAqui + toma);
      p.monto = r2(p.monto - toma);
      if (pagadoAqui >= monto - 0.009) pagadaEl = p.fecha;
      if (p.monto <= 0.009) cola = cola.slice(1);
    }
    const falta = r2(Math.max(0, monto - pagadoAqui));
    const estado: EstadoCuota = falta <= 0.009 ? 'pagada' : vence < hoy ? 'vencida' : pagadoAqui > 0 ? 'parcial' : 'por_vencer';
    return {
      n: i + 1, monto, vence, pagado: pagadoAqui, falta, estado, pagadaEl: falta <= 0.009 ? pagadaEl : null,
      dias: Math.abs(entre(hoy, vence)),
    };
  });

  return {
    financiado, cuota, cuotas, pagado,
    falta: r2(cuotas.reduce((a, c) => a + c.falta, 0)),
    proxima: cuotas.find(c => c.falta > 0.009) || null,
    vencidas: cuotas.filter(c => c.estado === 'vencida').length,
  };
}
