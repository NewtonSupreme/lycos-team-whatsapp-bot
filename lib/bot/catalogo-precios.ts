import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Los precios que da el bot salen del INVENTARIO de la sede, no de un texto escrito a mano.
 *
 * Regla del dueño (2026-10-31):
 *   · DIVISA  = precio promo  → inventario.precio_usd   (pago en dólares en efectivo/Zelle/Binance)
 *   · BS      = precio contado → inventario.precio_bs    (dólares a tasa BCV, se paga en bolívares)
 *   · CASHEA  = precio Bs + 16 % de IVA
 *   · Inicial de Cashea por nivel: nivel 1 → 60 %, nivel 2 → 50 %, niveles 3 a 6 → 40 %.
 *     El resto en 3 cuotas iguales cada 14 días por la app de Cashea.
 *
 * Las cuentas se hacen aquí y se le dan HECHAS a la IA: no tiene que multiplicar (y no se
 * equivoca en un céntimo).
 */

export const INICIAL_POR_NIVEL: Record<number, number> = { 1: 60, 2: 50, 3: 40, 4: 40, 5: 40, 6: 40 };
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const usd = (n: number) => `$${r2(n).toFixed(2).replace(/\.00$/, '')}`;

export interface PlanCasheaNivel { nivel: string; pct: number; inicial: number; cuota: number }
export function planCasheaPorNiveles(precioBs: number): { total: number; niveles: PlanCasheaNivel[] } {
  const total = r2(precioBs * 1.16);
  const grupos: Array<[string, number]> = [['1', 60], ['2', 50], ['3 al 6', 40]];
  return {
    total,
    niveles: grupos.map(([nivel, pct]) => {
      const inicial = r2(total * pct / 100);
      return { nivel, pct, inicial, cuota: r2((total - inicial) / 3) };
    }),
  };
}

/** Nombre comparable del modelo: «SILENCIADOR CLH 40» → «CLH40». */
function modeloDe(nombre: string): string | null {
  const n = nombre.toUpperCase().replace(/SILENCIADOR(ES)?/g, '').replace(/[^A-Z0-9 ]/g, ' ').trim();
  const m = n.match(/\b(CL[A-Z]{0,3})\s*(\d{2})\b/);
  if (m) return `${m[1]}${m[2]}`;
  if (/PLATANERO|MARACUCH/.test(n)) return 'CLCPC (platanero)';
  if (/RESONADOR/.test(n)) return 'RESONADOR';
  if (/FLOW ?MASTER/.test(n)) return 'FLOWMASTER';
  if (/FLEXIBLE/.test(n)) return 'FLEXIBLE';
  if (/GOMA/.test(n)) return 'GOMAS';
  return null;
}

const PARA_QUE: Record<string, string> = {
  CL27: 'carros con motor muy pequeño (hasta 1.3 L)',
  CL30: 'carros con motor pequeño (hasta 1.3 L)',
  CL40: 'carros de 1.4 a 1.5 L',
  CLH40: 'sedanes y carros de 4 cilindros de 1.6 a 3.7 L (Neon, Aveo, Corolla, Optra, Yaris, Gol…)',
  CL60: 'camionetas y motores de 3.8 L en adelante (Fortuner, Hilux, Explorer, Blazer, Grand Vitara, Terios…)',
  CLK60: 'FABRICACIÓN ESPECIAL: escapes con curvas, entradas/salidas dobles o poco espacio (Caliber, EcoSport, Sportage, Tucson, Compass, Cherokee, Outlander, Malibú…)',
  CLC60: 'camiones',
  CLP60: 'camionetas (plano adaptado)',
  'CLCPC (platanero)': 'silenciador platanero / maracucha',
  RESONADOR: 'resonador o «intermedio»',
  GOMAS: 'gomas de escape (cada una)',
};
const ORDEN = ['CL27', 'CL30', 'CL40', 'CLH40', 'CL60', 'CLK60', 'CLCPC (platanero)', 'CLC60', 'CLP60', 'RESONADOR', 'FLOWMASTER', 'FLEXIBLE', 'GOMAS'];

let cache: { clave: string; texto: string; en: number } | null = null;

/** El bloque de precios para el prompt del bot. Se cachea 5 minutos. */
export async function catalogoPreciosBot(db: SupabaseClient, sedeId: string): Promise<string> {
  if (cache && cache.clave === sedeId && Date.now() - cache.en < 5 * 60000) return cache.texto;
  const { data } = await db.from('inventario').select('nombre, precio_usd, precio_bs, stock, sede_id, activo')
    .eq('activo', true).or('nombre.ilike.%silenc%,nombre.ilike.%resonad%,nombre.ilike.%flow%,nombre.ilike.%flexible%,nombre.ilike.%goma%,nombre.ilike.%CL%')
    .limit(500);
  const filas = (data || []) as Array<{ nombre: string; precio_usd: number | null; precio_bs: number | null; stock: number | null; sede_id: string | null }>;
  // Solo los precios de ESTA sede (otras sedes guardan otros precios, p. ej. de mayor). Si la sede
  // no tiene ninguno cargado, se usan los de todas.
  const deLaSede = filas.filter(f => f.sede_id === sedeId && modeloDe(f.nombre) && ((Number(f.precio_bs) || 0) > 0 || (Number(f.precio_usd) || 0) > 0));
  const usar = deLaSede.length ? deLaSede : filas;
  const porModelo = new Map<string, { divisa: number; bs: number; stock: number; deSede: boolean }>();
  for (const f of usar) {
    const m = modeloDe(f.nombre); if (!m) continue;
    const divisa = Number(f.precio_usd) || 0; const bs = Number(f.precio_bs) || 0;
    if (!(bs > 0) && !(divisa > 0)) continue;
    const deSede = f.sede_id === sedeId;
    const prev = porModelo.get(m);
    const mejor = !prev || (deSede && !prev.deSede) || (deSede === prev.deSede && bs > 0 && !(prev.bs > 0));
    if (mejor) porModelo.set(m, { divisa, bs, stock: Number(f.stock) || 0, deSede });
    else if (prev && deSede === prev.deSede) prev.stock += Number(f.stock) || 0;
  }
  if (!porModelo.size) return '';
  // Lo que el bot vendía y la sede aún no tiene con precio en Inventario: el valor de referencia de
  // siempre, hasta que se cargue (así no queda sin precio una pieza que sí se vende).
  for (const [m, divisa, bs] of [['CL27', 40, 55], ['RESONADOR', 40, 55]] as Array<[string, number, number]>) {
    if (!porModelo.has(m)) porModelo.set(m, { divisa, bs, stock: 0, deSede: false });
  }

  const lineas: string[] = [];
  for (const m of [...porModelo.keys()].sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99))) {
    const p = porModelo.get(m)!;
    const partes = [`- ${m}${PARA_QUE[m] ? ` (${PARA_QUE[m]})` : ''}:`];
    if (p.divisa > 0) partes.push(`DIVISA (promo, en dólares) ${usd(p.divisa)}`);
    if (p.bs > 0) {
      const c = planCasheaPorNiveles(p.bs);
      partes.push(`· CONTADO EN BS ${usd(p.bs)} a tasa BCV`);
      partes.push(`· CASHEA total ${usd(c.total)} (con IVA) → ${c.niveles.map(n => `nivel ${n.nivel}: inicial ${n.pct}% ${usd(n.inicial)} + 3 cuotas de ${usd(n.cuota)}`).join('; ')}`);
    }
    lineas.push(partes.join(' '));
  }
  const texto = `PRECIOS VIGENTES (SALEN DEL INVENTARIO DEL TALLER — SON LOS ÚNICOS VÁLIDOS; instalación y revisión incluidas):
${lineas.join('\n')}
CÓMO DAR EL PRECIO: di primero el de DIVISA (promo) y el de CONTADO EN BS a tasa BCV. Cashea solo si el cliente lo pide o pregunta cómo pagar: pídele su nivel y da EXACTO el desglose de su nivel de la lista (no lo calcules tú). Las cuotas de Cashea son cada 14 días por la app; la inicial se paga en el taller.`;
  cache = { clave: sedeId, texto, en: Date.now() };
  return texto;
}
