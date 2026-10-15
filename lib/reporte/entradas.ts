// ─────────────────────────────────────────────────────────────────────────────
// Lo que entró, cuenta por cuenta, en SU moneda.
//
// Los bolívares se muestran como bolívares y los dólares como dólares: nunca se
// pasa un monto en $ a una columna «Bs» ni al revés. El equivalente en la otra
// moneda se calcula con la tasa de cada venta (la de su día), no con la de hoy.
// Lo usan el reporte diario y el cierre de caja, para que digan lo mismo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BANK_METHODS, binsFromLegacyMetodos, emptyBins,
  type BankBin, type Bins, type Moneda,
} from './ventas-mapping';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;

export interface EntradaCuenta {
  id: BankBin;
  label: string;
  moneda: Moneda;
  cantidad: number;   // cuántos pagos cayeron en esta cuenta
  recibido: number;   // en la moneda de la cuenta (Bs o $), tal cual entró
  usd: number;        // equivalente en $
  bs: number;         // equivalente en Bs
}

export interface ResumenEntradas {
  cuentas: EntradaCuenta[];
  /** Bolívares que entraron de verdad (bancos + efectivo Bs). */
  bsExactos: number;
  bsExactosEnUsd: number;
  /** Dólares que entraron de verdad (efectivo $, Zelle, Binance). */
  usdExactos: number;
  usdExactosEnBs: number;
  /** Cashea: crédito que se liquida en el BNC (se lleva en $). */
  casheaUsd: number;
  casheaEnBs: number;
  /** Todo junto, en $ y en Bs. */
  totalUsd: number;
  totalBs: number;
  /** BNC completo: lo que entró por pago móvil/transferencia + lo de Cashea. */
  bnc: { bs: number; casheaUsd: number; totalBs: number; totalUsd: number };
}

/** Las cuentas de una fila de `ventas_dia` o `abonos` (columnas o metodos_pago). */
export function binsDeFila(v: Record<string, unknown>): Bins {
  const cols = emptyBins();
  let suma = 0;
  for (const m of BANK_METHODS) { cols[m.id] = n(v[m.id]); suma += cols[m.id]; }
  if (suma > 0) return cols;
  const mp = v.metodos_pago;
  return binsFromLegacyMetodos(mp && typeof mp === 'object' ? mp as Record<string, unknown> : null);
}

/**
 * Suma lo que entró. Cada fila trae sus cuentas y su tasa; si no trae tasa se
 * usa `tasaRespaldo`.
 */
export function resumirEntradas(filas: Array<{ bins: Bins; tasa?: number | null }>, tasaRespaldo: number): ResumenEntradas {
  const acc = new Map<BankBin, EntradaCuenta>(BANK_METHODS.map(m => [m.id, {
    id: m.id, label: m.label, moneda: m.moneda, cantidad: 0, recibido: 0, usd: 0, bs: 0,
  }]));
  for (const f of filas) {
    const t = n(f.tasa) || tasaRespaldo;
    for (const m of BANK_METHODS) {
      const monto = n(f.bins[m.id]);
      if (monto <= 0) continue;
      const c = acc.get(m.id)!;
      c.cantidad += 1;
      c.recibido += monto;
      if (m.moneda === 'Bs') { c.bs += monto; c.usd += t > 0 ? monto / t : 0; }
      else { c.usd += monto; c.bs += monto * t; }
    }
  }
  const cuentas = [...acc.values()].map(c => ({ ...c, recibido: r2(c.recibido), usd: r2(c.usd), bs: r2(c.bs) }));
  const de = (pred: (c: EntradaCuenta) => boolean, k: 'recibido' | 'usd' | 'bs') =>
    r2(cuentas.filter(pred).reduce((s, c) => s + c[k], 0));
  const esBs = (c: EntradaCuenta) => c.moneda === 'Bs';
  const esUsd = (c: EntradaCuenta) => c.moneda === 'USD' && c.id !== 'cashea';
  const bncBs = cuentas.find(c => c.id === 'bnc')!;
  const cash = cuentas.find(c => c.id === 'cashea')!;
  return {
    cuentas,
    bsExactos: de(esBs, 'recibido'),
    bsExactosEnUsd: de(esBs, 'usd'),
    usdExactos: de(esUsd, 'recibido'),
    usdExactosEnBs: de(esUsd, 'bs'),
    casheaUsd: cash.recibido,
    casheaEnBs: cash.bs,
    totalUsd: de(() => true, 'usd'),
    totalBs: de(() => true, 'bs'),
    bnc: {
      bs: bncBs.recibido,
      casheaUsd: cash.recibido,
      totalBs: r2(bncBs.bs + cash.bs),
      totalUsd: r2(bncBs.usd + cash.usd),
    },
  };
}

/** «Bs 12.345,67» o «$ 45,00» según la moneda de la cuenta. */
export function montoEnSuMoneda(monto: number, moneda: Moneda): string {
  const txt = (Number(monto) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${txt}` : `$ ${txt}`;
}
