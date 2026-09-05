/**
 * Helpers de moneda para el motor de nómina.
 *
 * Convención canónica: el USD es la moneda base. `tasa_cambio` siempre significa
 * "unidades de `moneda` por 1 USD". Así la conversión es uniforme:
 *
 *    montoUSD = monto / tasa            (USD → tasa=1)
 *    monto    = montoUSD * tasa
 *
 *  · VES: tasa = Bs por USD          (ej. 518)
 *  · EUR: tasa = EUR por USD         (ej. 0.92)
 *  · USD: tasa = 1
 */

export type MonedaNomina = 'USD' | 'EUR' | 'VES';

export interface NominaRates {
  /** Bs por 1 USD (tasa oficial BCV) */
  ves_bcv: number;
  /** Bs por 1 USD (paralelo / Binance P2P) */
  ves_paralelo: number;
  /** EUR por 1 USD */
  eur_per_usd: number;
  fetchedAt: string;
}

export const DEFAULT_RATES: NominaRates = {
  ves_bcv: 518,
  ves_paralelo: 600,
  eur_per_usd: 0.92,
  fetchedAt: new Date(0).toISOString(),
};

/** Devuelve la tasa (unidades por USD) para una moneda dada. */
export function rateForMoneda(moneda: MonedaNomina, rates: NominaRates, fuenteVes: 'bcv' | 'paralelo' = 'bcv'): number {
  switch (moneda) {
    case 'USD': return 1;
    case 'EUR': return rates.eur_per_usd || DEFAULT_RATES.eur_per_usd;
    case 'VES': return (fuenteVes === 'paralelo' ? rates.ves_paralelo : rates.ves_bcv) || DEFAULT_RATES.ves_bcv;
    default: return 1;
  }
}

/** Convierte un monto en su moneda a USD usando la tasa (unidades por USD). */
export function toUsd(monto: number, tasa: number): number {
  if (!tasa || tasa <= 0) return monto;
  return round2(monto / tasa);
}

/** Convierte un monto en USD a la moneda destino usando la tasa (unidades por USD). */
export function fromUsd(montoUsd: number, tasa: number): number {
  return round2(montoUsd * (tasa || 1));
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const MONEDA_SYMBOL: Record<MonedaNomina, string> = { USD: '$', EUR: '€', VES: 'Bs' };

export function formatMoneda(monto: number, moneda: MonedaNomina): string {
  const n = (monto ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'VES' ? `Bs ${n}` : `${MONEDA_SYMBOL[moneda]}${n}`;
}

/**
 * Obtiene las tasas actuales (servidor). Combina la API VE (BCV/paralelo) ya usada
 * en el proyecto + Frankfurter (BCE) para el EUR. Tolerante a fallos: cae a defaults.
 */
export async function fetchNominaRates(): Promise<NominaRates> {
  let ves_bcv = 0, ves_paralelo = 0, eur_per_usd = 0;

  // 1) VES — BCV oficial + paralelo (mismo origen que /api/rates)
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares', { cache: 'no-store', signal: AbortSignal.timeout(4500) });
    if (r.ok) {
      const list = await r.json();
      const bcv = list.find((d: any) => d.fuente === 'oficial' || d.nombre?.toLowerCase().includes('oficial'));
      const par = list.find((d: any) => d.fuente === 'paralelo' || d.nombre?.toLowerCase().includes('paralelo'));
      ves_bcv = bcv?.promedio || bcv?.precio || 0;
      ves_paralelo = par?.promedio || par?.precio || 0;
    }
  } catch { /* noop */ }

  // 2) EUR — Frankfurter (BCE, sin API key)
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { cache: 'no-store', signal: AbortSignal.timeout(4500) });
    if (r.ok) {
      const d = await r.json();
      eur_per_usd = d?.rates?.EUR || 0;
    }
  } catch { /* noop */ }

  return {
    ves_bcv: ves_bcv || DEFAULT_RATES.ves_bcv,
    ves_paralelo: ves_paralelo || ves_bcv || DEFAULT_RATES.ves_paralelo,
    eur_per_usd: eur_per_usd || DEFAULT_RATES.eur_per_usd,
    fetchedAt: new Date().toISOString(),
  };
}
