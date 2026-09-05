/**
 * Motor de cálculo de comisiones — funciones PURAS (sin acceso a BD).
 * Determinista dado (reglas, trabajo, tasas). El servicio las orquesta con la BD
 * y congela el snapshot en job_assignments; el chatbot las consume vía el servicio.
 */
import type { CommissionRule, FlatRate, MonedaNomina } from '@/types';
import { NominaRates, rateForMoneda, toUsd, round2 } from './currency';

// ── Entrada de un trabajo a evaluar ────────────────────────────────────────
export interface JobInput {
  empleado_id: string | null;
  es_taller: boolean;
  zona: string;
  moneda: MonedaNomina;
  tasa_cambio: number;          // unidades de `moneda` por 1 USD (snapshot del trabajo)
  ingreso_total: number;        // en `moneda`
  mano_obra: number;            // en `moneda`
  servicio_key?: string | null; // para tarifa flat
  cantidad?: number;
  sede_id?: string | null;
  /**
   * Texto del trabajo (servicio_key + tipo + descripción) contra el que se evalúan
   * las reglas condicionadas por tipo de servicio (condiciones.tipos).
   * Ej.: la cauchera paga 30% "reparación", 40% "rotación/revisión" y 100% "adicional".
   */
  texto?: string;
}

/** Normaliza texto para comparar sin acentos ni mayúsculas ("Revisión" → "revision"). */
function normTexto(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Evalúa la condición por tipo de servicio de una regla (condiciones.tipos).
 *  · null  → la regla no condiciona por tipo (aplica de forma genérica)
 *  · true  → el trabajo coincide con alguno de los tipos
 *  · false → la regla exige tipos y el trabajo NO coincide (se descarta)
 */
function tiposMatch(r: CommissionRule, texto?: string): boolean | null {
  const tipos = (r.condiciones as any)?.tipos;
  if (!Array.isArray(tipos) || tipos.length === 0) return null;
  const t = normTexto(texto || '');
  if (!t) return false;
  return tipos.some((k: any) => t.includes(normTexto(String(k))));
}

export interface CommissionResult {
  regla_id: string | null;
  tipo_regla: CommissionRule['tipo_regla'] | null;
  comision: number;             // en comision_moneda
  comision_moneda: MonedaNomina;
  comision_usd: number;         // canónico
  proveedor_monto: number;      // en moneda del trabajo
  proveedor_monto_usd: number;
  proveedor_nombre: string | null;
  base_aplicada: number;        // monto sobre el que se calculó (moneda del trabajo)
  desglose: Record<string, unknown>;
}

export interface OverrideResult {
  empleado_id: string;
  regla_id: string;
  zona: string;
  comision: number;             // en moneda del trabajo
  comision_moneda: MonedaNomina;
  comision_usd: number;
  pct: number;
  base_aplicada: number;
}

const now = () => Date.now();

function ruleVigente(r: CommissionRule): boolean {
  if (!r.activo) return false;
  const desde = r.vigencia_desde ? new Date(r.vigencia_desde).getTime() : 0;
  const hasta = r.vigencia_hasta ? new Date(r.vigencia_hasta).getTime() : Infinity;
  const t = now();
  return t >= desde && t <= hasta;
}

function zonaMatch(ruleZona: string, jobZona: string): boolean {
  return ruleZona === jobZona || ruleZona === 'all';
}

function monedaMatch(r: CommissionRule, moneda: MonedaNomina): boolean {
  if (!r.aplica_monedas || r.aplica_monedas.length === 0) return true;
  return r.aplica_monedas.includes(moneda);
}

function sedeMatch(r: CommissionRule, sedeId?: string | null): boolean {
  return !r.sede_id || r.sede_id === sedeId;
}

/**
 * Selecciona la mejor regla de comisión directa (porcentaje/flat) para el ejecutor.
 * Orden de prioridad: zona específica > 'all', moneda específica > genérica,
 * luego `prioridad` ascendente.
 */
export function pickExecutorRule(
  rules: CommissionRule[],
  job: { empleado_id: string | null; zona: string; moneda: MonedaNomina; sede_id?: string | null; texto?: string }
): CommissionRule | null {
  if (!job.empleado_id) return null;
  const candidates = rules.filter(r => {
    if (r.empleado_id !== job.empleado_id) return false;
    if (r.tipo_regla !== 'porcentaje' && r.tipo_regla !== 'tarifa_flat') return false;
    if (!ruleVigente(r) || !zonaMatch(r.zona, job.zona) || !monedaMatch(r, job.moneda) || !sedeMatch(r, job.sede_id)) return false;
    // Una regla condicionada por tipo de servicio se descarta si el trabajo no coincide.
    if (tiposMatch(r, job.texto) === false) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    // 1º: regla condicionada por tipo que COINCIDE (la más específica de todas)
    const ta = tiposMatch(a, job.texto) === true ? 0 : 1;
    const tb = tiposMatch(b, job.texto) === true ? 0 : 1;
    if (ta !== tb) return ta - tb;
    const za = a.zona === job.zona ? 0 : 1;
    const zb = b.zona === job.zona ? 0 : 1;
    if (za !== zb) return za - zb;
    const ma = (a.aplica_monedas && a.aplica_monedas.length) ? 0 : 1;
    const mb = (b.aplica_monedas && b.aplica_monedas.length) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return (a.prioridad ?? 100) - (b.prioridad ?? 100);
  });
  return candidates[0];
}

/** Comisión directa del ejecutor + reparto a proveedor (puente). */
export function computeExecutorCommission(
  rule: CommissionRule | null,
  job: JobInput,
  flatRates: FlatRate[],
  rates: NominaRates
): CommissionResult {
  const zero: CommissionResult = {
    regla_id: null, tipo_regla: null, comision: 0, comision_moneda: job.moneda, comision_usd: 0,
    proveedor_monto: 0, proveedor_monto_usd: 0, proveedor_nombre: null, base_aplicada: 0, desglose: {},
  };
  if (!rule) {
    // Sin regla porcentual: aún podría haber tarifa flat por servicio (Freddy)
    const flat = resolveFlatCommission(job, flatRates, rates);
    return flat ?? zero;
  }

  if (rule.tipo_regla === 'tarifa_flat') {
    const flat = resolveFlatCommission(job, flatRates, rates);
    return flat ?? { ...zero, regla_id: rule.id, tipo_regla: 'tarifa_flat' };
  }

  // porcentaje
  const base = rule.base === 'mano_obra' ? job.mano_obra : job.ingreso_total;
  const comision = round2(base * (rule.valor / 100));
  const comision_usd = toUsd(comision, job.tasa_cambio);

  let proveedor_monto = 0, proveedor_monto_usd = 0;
  if (rule.proveedor_pct && rule.proveedor_pct > 0) {
    proveedor_monto = round2(job.ingreso_total * (rule.proveedor_pct / 100));
    proveedor_monto_usd = toUsd(proveedor_monto, job.tasa_cambio);
  }

  return {
    regla_id: rule.id,
    tipo_regla: 'porcentaje',
    comision,
    comision_moneda: job.moneda,
    comision_usd,
    proveedor_monto,
    proveedor_monto_usd,
    proveedor_nombre: rule.proveedor_nombre ?? null,
    base_aplicada: base,
    desglose: {
      regla: rule.descripcion || `${rule.valor}% sobre ${rule.base}`,
      pct: rule.valor,
      base: rule.base,
      proveedor_pct: rule.proveedor_pct || 0,
    },
  };
}

/** Suma de tarifas flat aplicables al trabajo (por servicio_key + empleado). */
export function resolveFlatCommission(
  job: JobInput,
  flatRates: FlatRate[],
  rates: NominaRates
): CommissionResult | null {
  if (!job.servicio_key) return null;
  const keys = String(job.servicio_key).split(',').map(s => s.trim()).filter(Boolean);
  if (keys.length === 0) return null;

  let totalComision = 0;
  let totalUsd = 0;
  let comisionMoneda: MonedaNomina = 'USD';
  const items: any[] = [];
  const cantidad = job.cantidad && job.cantidad > 0 ? job.cantidad : 1;

  for (const key of keys) {
    const flat = flatRates.find(f =>
      f.activo && f.servicio_key === key &&
      (f.empleado_id === job.empleado_id || f.empleado_id === null) &&
      (!f.sede_id || f.sede_id === job.sede_id)
    );
    if (!flat) continue;
    const monto = round2(flat.monto * cantidad);
    const tasa = rateForMoneda(flat.moneda, rates);
    comisionMoneda = flat.moneda;
    totalComision += monto;
    totalUsd += toUsd(monto, tasa);
    items.push({ servicio: flat.label, key, monto: flat.monto, cantidad, subtotal: monto, moneda: flat.moneda });
  }
  if (items.length === 0) return null;

  return {
    regla_id: null,
    tipo_regla: 'tarifa_flat',
    comision: round2(totalComision),
    comision_moneda: comisionMoneda,
    comision_usd: round2(totalUsd),
    proveedor_monto: 0,
    proveedor_monto_usd: 0,
    proveedor_nombre: null,
    base_aplicada: 0,
    desglose: { tipo: 'tarifa_flat', items },
  };
}

/**
 * Comisiones en cascada (override) — p.ej. Jim 7% sobre la mano de obra de
 * trabajos de mecánica ejecutados por CUALQUIER otro empleado.
 */
export function computeOverrides(rules: CommissionRule[], job: JobInput, rates: NominaRates): OverrideResult[] {
  const out: OverrideResult[] = [];
  const overrideRules = rules.filter(r =>
    r.tipo_regla === 'override_cascada' &&
    ruleVigente(r) &&
    zonaMatch(r.zona, job.zona) &&
    monedaMatch(r, job.moneda) &&
    sedeMatch(r, job.sede_id) &&
    !!r.empleado_id
  );
  for (const r of overrideRules) {
    // El beneficiario no cobra override sobre su propio trabajo.
    if (job.empleado_id && r.empleado_id === job.empleado_id) continue;
    const base = r.base === 'mano_obra' ? job.mano_obra : job.ingreso_total;
    if (base <= 0) continue;
    const comision = round2(base * (r.valor / 100));
    out.push({
      empleado_id: r.empleado_id as string,
      regla_id: r.id,
      zona: job.zona,
      comision,
      comision_moneda: job.moneda,
      comision_usd: toUsd(comision, job.tasa_cambio),
      pct: r.valor,
      base_aplicada: base,
    });
  }
  return out;
}

/** Lo que le queda a Lycos (USD) tras pagar ejecutor + proveedor + overrides. */
export function computeLycosNeto(ingreso_usd: number, exec: CommissionResult, overridesUsd: number): number {
  return round2(ingreso_usd - exec.comision_usd - exec.proveedor_monto_usd - overridesUsd);
}

// ── Agregación de un período ────────────────────────────────────────────────
export interface AggregateInput {
  jobs: Array<{
    comision_usd: number;
    es_override: boolean;
    tipo_regla: string | null;
    moneda: MonedaNomina;
    comision: number;
  }>;
  fijoRules: CommissionRule[];
  advancesUsd: number;
  periodoInicio: string;   // ISO date
  periodoFin: string;      // ISO date
  rates: NominaRates;
}

export interface AggregateResult {
  sueldo_base: number;
  total_comisiones: number;
  total_flat: number;
  total_overrides: number;
  bruto: number;
  deducciones: number;
  total_pagar: number;
  desglose_monedas: Record<string, number>;
}

export function semanasEnPeriodo(inicio: string, fin: string): number {
  const a = new Date(inicio + 'T00:00:00').getTime();
  const b = new Date(fin + 'T00:00:00').getTime();
  const dias = Math.max(1, Math.round((b - a) / 86400000) + 1);
  return dias / 7;
}

export function aggregateEarnings(input: AggregateInput): AggregateResult {
  const { jobs, fijoRules, advancesUsd, rates } = input;

  let total_comisiones = 0, total_flat = 0, total_overrides = 0;
  const desglose_monedas: Record<string, number> = {};

  for (const j of jobs) {
    if (j.es_override) total_overrides += j.comision_usd;
    else if (j.tipo_regla === 'tarifa_flat') total_flat += j.comision_usd;
    else total_comisiones += j.comision_usd;
    desglose_monedas[j.moneda] = round2((desglose_monedas[j.moneda] || 0) + j.comision);
  }

  const semanas = semanasEnPeriodo(input.periodoInicio, input.periodoFin);
  let sueldo_base = 0;
  for (const r of fijoRules) {
    if (r.tipo_regla !== 'fijo_semanal' || !r.activo) continue;
    const tasa = rateForMoneda(r.moneda, rates);
    sueldo_base += toUsd(r.valor, tasa) * semanas;
  }

  sueldo_base = round2(sueldo_base);
  total_comisiones = round2(total_comisiones);
  total_flat = round2(total_flat);
  total_overrides = round2(total_overrides);
  const bruto = round2(sueldo_base + total_comisiones + total_flat + total_overrides);
  const deducciones = round2(advancesUsd);
  const total_pagar = round2(bruto - deducciones);

  return { sueldo_base, total_comisiones, total_flat, total_overrides, bruto, deducciones, total_pagar, desglose_monedas };
}
