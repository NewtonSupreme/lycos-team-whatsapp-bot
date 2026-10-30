/*
 * ¿De qué venta es esta orden de Cashea?
 *
 * El reporte de cuotas no trae nada que el sistema guarde (la factura es la fiscal
 * en papel y la orden es de Cashea). Así que se cruzan varias pistas, cada una con su
 * peso, y solo se propone una venta cuando le gana con claridad a la siguiente:
 *
 *   FECHA DE LA COMPRA
 *   · la inicial (cuota 0) del reporte: es el día exacto;
 *   · el número de orden: Cashea lo numera con un contador que crece con el tiempo
 *     (228.663.830 = 10/10, 233.761.410 = 20/10), así que con las órdenes ya
 *     enlazadas se interpola el día de cualquier otra;
 *   · la factura fiscal: es correlativa, igual se interpola;
 *   · el ritmo de las cuotas: cada 14 días, o cada 7 en los eventos especiales de
 *     Cashea. Nunca se paga una cuota antes de comprar.
 *
 *   MONTO
 *   · el financiado guardado = 3 × la cuota;
 *   · o el total con IVA × (1 − inicial%) = 3 × la cuota, con las iniciales que
 *     ofrece Cashea (0–60 %): encuentra las ventas guardadas a la antigua o mal;
 *   · o inicial del reporte + 3 × cuota = total.
 *
 *   IDENTIDAD (si se subió un reporte de órdenes de Cashea con cédula o nombre)
 *   · la cédula del cliente de la venta, o su nombre.
 *
 * Todo es cuenta: aquí no se lee ni se escribe la base de datos.
 */

import { PORCENTAJES_CASHEA } from '@/lib/pagos/cashea';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const DIA = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DIA);
export const masDias = (f: string, n: number) => iso(ms(f) + n * DIA);
const corta = (f: string) => f.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const usd = (x: number) => `$${(Number(x) || 0).toFixed(2).replace('.', ',')}`;

/** Lo que se sabe de una orden por un reporte de órdenes de Cashea (cédula, cliente…). */
export interface FichaOrden {
  orden: string; cedula?: string | null; cliente?: string | null; telefono?: string | null;
  fecha?: string | null; total?: number | null; inicial?: number | null; financiado?: number | null; factura?: string | null;
}

export interface Ancla { n: number; fecha: string }

/** Cédula comparable: solo los dígitos, sin ceros delante. «V-014.568.012» → «14568012». */
export const normalizarCedula = (c: unknown) => String(c ?? '').replace(/\D/g, '').replace(/^0+/, '');

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const PALABRAS_VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'SAN', 'CARACAS', 'GUAIRA', 'MACUTO', 'SR', 'SRA']);
const tokens = (t: string | null | undefined) => sinAcentos(String(t || '')).replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(x => x.length >= 3 && !PALABRAS_VACIAS.has(x));
/** Cuántas palabras de nombre comparten (nombres y apellidos). */
export function nombresEnComun(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set(tokens(a)); let n = 0;
  for (const t of new Set(tokens(b))) if (A.has(t)) n++;
  return n;
}

/**
 * El día de una orden por su número, con las anclas conocidas (número → día de compra).
 * Recta por mínimos cuadrados con las tres anclas más cercanas de cada lado: una
 * ancla mal enlazada no tuerce sola la estimación.
 */
export function estimarPorNumero(n: number, anclas: Ancla[]): { fecha: string; margen: number } | null {
  const a = anclas.filter(x => Number.isFinite(x.n) && x.n > 0).sort((x, y) => x.n - y.n);
  if (a.length < 2 || !Number.isFinite(n) || n <= 0) return null;
  const debajo = a.filter(x => x.n <= n).slice(-3); const encima = a.filter(x => x.n > n).slice(0, 3);
  let usar = [...debajo, ...encima];
  if (usar.length < 2) usar = a.slice(-3);
  const xs = usar.map(x => x.n); const ys = usar.map(x => ms(x.fecha) / DIA);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length; const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const pend = sxx > 0 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  // Un contador que va hacia atrás no tiene sentido: las anclas están mal.
  if (pend < 0) return null;
  const y = my + pend * (n - mx);
  // Fuera de las anclas se extrapola, con menos confianza.
  const fuera = n < a[0].n || n > a[a.length - 1].n;
  const residuo = Math.max(...usar.map((_, i) => Math.abs(ys[i] - (my + pend * (xs[i] - mx)))));
  // Entre dos anclas lejanas en el tiempo la recta adivina más: el margen lo dice.
  const ab = a.filter(x => x.n <= n).slice(-1)[0]; const ar = a.find(x => x.n > n);
  const hueco = ab && ar ? Math.abs(diasEntre(ab.fecha, ar.fecha)) / 4 : 4;
  // Fuera de las anclas, cada día que se aleja de la más cercana suma duda.
  const cercana = n < a[0].n ? a[0] : a[a.length - 1];
  const lejos = fuera ? Math.abs(Math.round(y) - ms(cercana.fecha) / DIA) / 3 : 0;
  return { fecha: iso(Math.round(y) * DIA), margen: Math.min(20, Math.ceil(Math.max(residuo + (fuera ? 3 : 1.5) + lejos, hueco))) };
}

export interface PistaFecha {
  /** El día más probable de la compra. */
  fecha: string | null;
  /** ± días de confianza. */
  margen: number;
  /** La compra no puede ser después de este día (el primer pago). */
  tope: string;
  /** Días posibles por el ritmo de las cuotas (14 y 7). */
  porRitmo: string[];
  exacta: boolean;
  razones: string[];
}

export function pistaDeFecha(o: {
  orden: string; factura: string | null;
  pagos: Array<{ fecha: string; cuotas: number[] }>;
  anclasOrden: Ancla[]; anclasFactura: Ancla[]; ficha?: FichaOrden | null;
}): PistaFecha {
  const pagos = [...o.pagos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tope = pagos[0]?.fecha || '9999-12-31';
  const razones: string[] = [];
  const porRitmo: string[] = [];
  for (const p of pagos) {
    const n = Math.min(...p.cuotas.filter(c => c > 0), 99);
    if (n === 99) continue;
    porRitmo.push(masDias(p.fecha, -14 * n), masDias(p.fecha, -7 * n));
  }
  const ini = pagos.find(p => p.cuotas.includes(0));
  if (o.ficha?.fecha) { razones.push(`compra del ${corta(o.ficha.fecha)} (dato de Cashea: inicial u orden)`); return { fecha: o.ficha.fecha, margen: 1, tope, porRitmo, exacta: true, razones }; }
  if (ini) { razones.push(`pagó la inicial el ${corta(ini.fecha)}`); return { fecha: ini.fecha, margen: 1, tope, porRitmo, exacta: true, razones }; }
  const porOrden = estimarPorNumero(Number(o.orden), o.anclasOrden);
  const porFactura = o.factura ? estimarPorNumero(Number(String(o.factura).replace(/\D/g, '')), o.anclasFactura) : null;
  // Una estimación con mucha duda (lejos de las órdenes conocidas) no se usa.
  const est = [porOrden, porFactura].filter(e => e && e.margen <= 8) as Array<{ fecha: string; margen: number }>;
  if (porOrden && porOrden.margen <= 8) razones.push(`por su número de orden, compra ≈ ${corta(porOrden.fecha)}`);
  if (porFactura && porFactura.margen <= 8) razones.push(`por la factura ${o.factura}, ≈ ${corta(porFactura.fecha)}`);
  if (est.length) {
    // Si orden y factura coinciden, se promedian; si no, manda la de menor margen.
    const fecha = est.length === 2 && Math.abs(diasEntre(est[0].fecha, est[1].fecha)) <= 4
      ? iso(Math.round((ms(est[0].fecha) + ms(est[1].fecha)) / 2 / DIA) * DIA)
      : est.sort((a, b) => a.margen - b.margen)[0].fecha;
    const f = fecha > tope ? tope : fecha;
    return { fecha: f, margen: Math.min(...est.map(e => e.margen)), tope, porRitmo, exacta: false, razones };
  }
  if (porRitmo.length) {
    // Sin otra pista: el ritmo normal de 14 días desde el primer pago de cuota.
    razones.push(`por el ritmo de las cuotas (cada 14 días), compra ≈ ${corta(porRitmo[0])}`);
    return { fecha: porRitmo[0] > tope ? tope : porRitmo[0], margen: 7, tope, porRitmo, exacta: false, razones };
  }
  return { fecha: null, margen: 99, tope, porRitmo, exacta: false, razones };
}

export interface VentaParaCruce {
  id: string; fecha: string; cliente: string; cliente_id: string | null; cedula: string | null;
  totalConIva: number; financiadoGuardado: number; cuotaGuardada: number | null; usaCashea: boolean;
  /** Lo que la venta guardó como inicial de Cashea (o la columna de Cashea en las viejas). */
  inicialGuardada: number;
  /** El total se tomó sin IVA (venta guardada sin él): Cashea siempre cobra con IVA, pesa menos. */
  sinIva?: boolean;
}

export interface Cruce { puntaje: number; razones: string[]; aviso: string | null; montoCuadra: boolean }

/** Qué tan bien explica esta venta la orden. 0 = no es candidata. */
export function cruzar(v: VentaParaCruce, o: { cuotaUSD: number; inicialUSD: number | null; pista: PistaFecha; ficha?: FichaOrden | null }): Cruce {
  const razones: string[] = []; let aviso: string | null = null;
  const fin = r2(o.cuotaUSD * 3);
  // La compra no puede ser después del primer pago (se tolera un día por registros tardíos).
  if (v.fecha > masDias(o.pista.tope, 1)) return { puntaje: 0, razones: ['es posterior al primer pago'], aviso: null, montoCuadra: false };

  // ── Monto
  let monto = 0;
  if (o.ficha?.total && Math.abs(v.totalConIva - o.ficha.total) <= 0.06) { monto = 55; razones.push(`total ${usd(v.totalConIva)} = el de la orden`); }
  else if (v.cuotaGuardada != null && Math.abs(v.cuotaGuardada - o.cuotaUSD) <= 0.03) { monto = 50; razones.push(`su cuota guardada es ${usd(v.cuotaGuardada)}`); }
  else if (o.inicialUSD != null && Math.abs(v.totalConIva - (o.inicialUSD + fin)) <= 0.06) { monto = 50; razones.push(`total ${usd(v.totalConIva)} = inicial ${usd(o.inicialUSD)} + 3 × ${usd(o.cuotaUSD)}`); }
  else if (v.inicialGuardada > 0.009 && Math.abs(v.totalConIva - v.inicialGuardada - fin) <= 0.06) { monto = 50; razones.push(`su inicial guardada ${usd(v.inicialGuardada)} + 3 × ${usd(o.cuotaUSD)} = total ${usd(v.totalConIva)}`); }
  else {
    // Con otra inicial: pesa menos si la venta ya tiene su propio plan de Cashea que no es este,
    // y casi nada al 0 % (cualquier venta del mismo precio cuadraría).
    const planPropio = v.usaCashea && v.financiadoGuardado > 0.009;
    for (const pct of [...PORCENTAJES_CASHEA].filter(x => x > 0).concat(0)) {
      if (Math.abs(v.totalConIva * (1 - pct / 100) - fin) <= 0.06) {
        // Las iniciales de siempre (40–60 %) pesan más que las raras; una venta con su propio plan
        // de Cashea que no es este, casi nada (lo más probable es que sea de otra orden).
        monto = planPropio ? 15 : pct === 0 ? 15 : pct >= 40 ? 35 : 25;
        razones.push(`total ${usd(v.totalConIva)} con inicial del ${pct}% deja ${usd(fin)} = 3 × ${usd(o.cuotaUSD)}`); break;
      }
    }
  }
  if (monto && v.financiadoGuardado > 0.009 && Math.abs(v.financiadoGuardado - fin) > 0.06) {
    aviso = `En el sistema esta venta tiene financiado ${usd(v.financiadoGuardado)}; Cashea dice ${usd(fin)} (3 × ${usd(o.cuotaUSD)}). Revisa la inicial de la venta.`;
  } else if (monto && !v.usaCashea) {
    aviso = 'Esta venta no está marcada como Cashea en el sistema (¿se registró como pago móvil o efectivo?).';
  } else if (monto && v.financiadoGuardado <= 0.009) {
    aviso = 'La venta no guardó lo financiado: el enlace queda, pero sus cuotas no se pueden descontar porque no hay deuda registrada.';
  }

  // ── Identidad
  let identidad = 0;
  const ced = normalizarCedula(o.ficha?.cedula);
  if (ced && v.cedula && ced === normalizarCedula(v.cedula)) { identidad = 60; razones.push(`misma cédula (${o.ficha?.cedula})`); }
  else if (o.ficha?.cliente) {
    const c = nombresEnComun(o.ficha.cliente, v.cliente);
    if (c >= 2) { identidad = 40; razones.push(`mismo nombre (${o.ficha.cliente})`); }
    else if (c === 1) { identidad = 12; razones.push(`nombre parecido (${o.ficha.cliente})`); }
    else if (ced && v.cedula) identidad = -40; // tiene cédula y no es la misma: no es
  }
  if (!monto && identidad < 40) return { puntaje: 0, razones, aviso: null, montoCuadra: false };

  // ── Fecha
  let fecha = 0;
  const p = o.pista;
  if (p.fecha) {
    const d = Math.abs(diasEntre(p.fecha, v.fecha));
    fecha = p.exacta ? (d === 0 ? 40 : d === 1 ? 30 : d <= 3 ? 12 : 0)
      : (d <= 1 ? 35 : d <= Math.max(3, p.margen) ? 25 : d <= p.margen + 3 ? 10 : d <= 10 ? 3 : 0);
    if (d <= 3) razones.push(d === 0 ? 'del mismo día de la compra' : `a ${d} día(s) de la compra estimada`);
  } else if (p.porRitmo.some(f => Math.abs(diasEntre(f, v.fecha)) <= 3)) {
    fecha = 15; razones.push('cuadra con el ritmo de las cuotas');
  }
  const ritmo = Math.min(99, ...p.porRitmo.map(f => Math.abs(diasEntre(f, v.fecha))));
  if (p.fecha && ritmo <= 3) { fecha += ritmo <= 1 ? 10 : 5; razones.push(ritmo <= 1 ? 'y justo con el ritmo de las cuotas' : 'y con el ritmo de las cuotas'); }

  if (v.sinIva && monto) { monto = Math.max(5, monto - 15); razones.push('(con el total sin IVA)'); }
  const puntaje = Math.max(0, monto + fecha + identidad + (v.usaCashea ? 5 : 0));
  return { puntaje, razones, aviso, montoCuadra: monto > 0 };
}

/** Se propone sola solo si es buena y le gana con claridad a la siguiente. */
export function ganadora<T extends { puntaje: number }>(lista: T[]): T | null {
  const [a, b] = [...lista].sort((x, y) => y.puntaje - x.puntaje);
  if (!a || a.puntaje < 75) return null;
  return !b || a.puntaje - b.puntaje >= 20 ? a : null;
}
