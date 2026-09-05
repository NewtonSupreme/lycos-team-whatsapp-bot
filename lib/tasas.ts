import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolver de TASAS POR FECHA.
 *
 * Ninguna API pública ofrece histórico confiable de la tasa BCV, así que el
 * sistema cachea la tasa de cada día en `tasas_bcv`. Así, un servicio del 9 de
 * julio muestra la tasa del 9 de julio — no una tasa genérica ni un fallback.
 *
 * Resolución (en orden):
 *   1. Caché exacta de esa fecha.
 *   2. Si es hoy → se consulta en vivo y se cachea.
 *   3. Tasa cacheada más cercana ANTERIOR a esa fecha (la vigente ese día).
 *   4. Tasa viva actual.
 *   5. Último recurso: valores por defecto.
 */

export interface TasasDia {
  fecha: string;
  bcv: number;        // Bs por 1 USD (oficial)
  paralelo: number;   // Bs por 1 USD (paralelo)
  eur_bs: number;     // Bs por 1 EUR (oficial)
  fuente: string;
  aproximada?: boolean; // true si se resolvió con la tasa de otro día
}

export const TASAS_FALLBACK = { bcv: 709.69, paralelo: 821.87, eur_bs: 811.45 };

const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Consulta las tasas actuales (BCV + paralelo + euro) en ve.dolarapi.com. */
export async function fetchTasasVivas(): Promise<{ bcv: number; paralelo: number; eur_bs: number }> {
  let bcv = 0, paralelo = 0, eur_bs = 0;

  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares', {
      cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const list = await r.json();
      const of = list.find((d: any) => d.fuente === 'oficial');
      const pa = list.find((d: any) => d.fuente === 'paralelo');
      bcv = Number(of?.promedio || of?.precio) || 0;
      paralelo = Number(pa?.promedio || pa?.precio) || 0;
    }
  } catch { /* noop */ }

  try {
    const r = await fetch('https://ve.dolarapi.com/v1/euros/oficial', {
      cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const d = await r.json();
      eur_bs = Number(d?.promedio || d?.precio) || 0;
    }
  } catch { /* noop */ }

  return {
    bcv: bcv || TASAS_FALLBACK.bcv,
    paralelo: paralelo || bcv || TASAS_FALLBACK.paralelo,
    eur_bs: eur_bs || TASAS_FALLBACK.eur_bs,
  };
}

/** Guarda (o actualiza) la tasa de un día en la caché. */
export async function cacheTasaDia(
  db: SupabaseClient,
  fecha: string,
  t: { bcv: number; paralelo: number; eur_bs: number },
  fuente = 'dolarapi'
): Promise<void> {
  try {
    await db.from('tasas_bcv').upsert(
      { fecha, bcv: t.bcv, paralelo: t.paralelo, eur_bs: t.eur_bs, fuente, updated_at: new Date().toISOString() },
      { onConflict: 'fecha' }
    );
  } catch (e) {
    console.error('cacheTasaDia error:', e);
  }
}

/** Devuelve la tasa vigente para una fecha concreta (YYYY-MM-DD). */
export async function getTasaDia(db: SupabaseClient, fecha?: string | null): Promise<TasasDia> {
  const f = (fecha || hoyISO()).slice(0, 10);
  const esHoy = f === hoyISO();

  // 1) Caché exacta
  try {
    const { data } = await db.from('tasas_bcv').select('*').eq('fecha', f).maybeSingle();
    if (data && Number(data.bcv) > 0) {
      // Si es hoy, se refresca por si la tasa cambió durante el día.
      if (!esHoy) {
        return {
          fecha: f, bcv: Number(data.bcv), paralelo: Number(data.paralelo),
          eur_bs: Number(data.eur_bs), fuente: data.fuente || 'cache',
        };
      }
    }
  } catch { /* noop */ }

  // 2) Es hoy → tasa viva + cachear
  if (esHoy) {
    const vivas = await fetchTasasVivas();
    await cacheTasaDia(db, f, vivas);
    return { fecha: f, ...vivas, fuente: 'dolarapi' };
  }

  // 3) Tasa cacheada más cercana ANTERIOR (la que estaba vigente ese día)
  try {
    const { data } = await db.from('tasas_bcv').select('*')
      .lte('fecha', f).order('fecha', { ascending: false }).limit(1).maybeSingle();
    if (data && Number(data.bcv) > 0) {
      return {
        fecha: f, bcv: Number(data.bcv), paralelo: Number(data.paralelo),
        eur_bs: Number(data.eur_bs), fuente: `cache (${data.fecha})`, aproximada: data.fecha !== f,
      };
    }
  } catch { /* noop */ }

  // 4) Tasa viva como último recurso razonable
  const vivas = await fetchTasasVivas();
  return { fecha: f, ...vivas, fuente: 'actual (sin histórico)', aproximada: true };
}
