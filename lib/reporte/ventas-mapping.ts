// ─────────────────────────────────────────────────────────────────────────────
// lib/reporte/ventas-mapping.ts
// Fuente única de la verdad para clasificar CADA pago al banco/cuenta exacto y
// CADA venta a su departamento. Usado por los 3 flujos de captura (POS de ventas,
// POS de silenciadores y el modal de cobro de servicios) y por el reporte diario.
//
// Los "bins" son idénticos a las columnas de la tabla `ventas_dia` y a las filas
// del Reporte Diario en papel → así el dinero cae siempre en el lugar correcto.
// ─────────────────────────────────────────────────────────────────────────────

export type BankBin =
  | 'pago_movil_banesco'   // Banesco Cta Jurídica — pago móvil / transferencia (Bs)
  | 'bnc'                  // BNC Cta Jurídica — pago móvil / transferencia (Bs)
  | 'punto_banesco'        // Punto de venta Banesco (Bs)
  | 'punto_bancamiga'      // Punto de venta / PM Banca Amiga, cta natural (Bs)
  | 'pago_movil_exterior'  // Banco Exterior, cta natural — pago móvil (Bs)
  | 'dolares'              // Divisa efectivo (USD)
  | 'binance'              // Binance (USD)
  | 'zelle'                // Zelle (USD)
  | 'efectivo_bs'          // Efectivo en bolívares (Bs)
  | 'cashea';              // Financiamiento Cashea (USD)

export type DeptKey =
  | 'silenciador' | 'cauchera' | 'alineacion' | 'electronica'
  | 'mecanica' | 'frenos' | 'lavado' | 'repuestos';

export type Moneda = 'Bs' | 'USD';

export interface BankMethodMeta {
  id: BankBin;
  label: string;      // etiqueta larga para UI
  short: string;      // etiqueta corta para el reporte
  moneda: Moneda;     // moneda en la que se ALMACENA el monto del bin
  grupo: 'banco_local' | 'divisa' | 'cripto' | 'cashea';
  banco: 'banesco' | 'bnc' | 'exterior' | 'bancamiga' | null;
  factura: 'fiscal' | 'nota_entrega' | null; // documento asociado a la cuenta
  color: string;      // color de acento para la UI (tailwind text-*)
}

// Orden = orden de aparición en la UI y en el reporte.
export const BANK_METHODS: BankMethodMeta[] = [
  { id: 'pago_movil_banesco', label: 'PM / Transf. Banesco', short: 'PM BANESCO',   moneda: 'Bs',  grupo: 'banco_local', banco: 'banesco',  factura: 'fiscal',       color: 'text-emerald-600' },
  { id: 'punto_banesco',      label: 'Punto Banesco',        short: 'P. BANESCO',    moneda: 'Bs',  grupo: 'banco_local', banco: 'banesco',  factura: 'fiscal',       color: 'text-emerald-500' },
  { id: 'bnc',                label: 'PM / Transf. BNC',     short: 'BNC',           moneda: 'Bs',  grupo: 'banco_local', banco: 'bnc',      factura: 'fiscal',       color: 'text-orange-500' },
  { id: 'punto_bancamiga',    label: 'Punto / PM Banca Amiga', short: 'P. BANCAMIGA', moneda: 'Bs', grupo: 'banco_local', banco: 'bancamiga', factura: 'nota_entrega', color: 'text-sky-500' },
  { id: 'pago_movil_exterior',label: 'PM Banco Exterior',    short: 'PM EXTERIOR',   moneda: 'Bs',  grupo: 'banco_local', banco: 'exterior', factura: 'nota_entrega', color: 'text-indigo-500' },
  { id: 'efectivo_bs',        label: 'Efectivo Bs',          short: 'EFECT. BS',     moneda: 'Bs',  grupo: 'banco_local', banco: null,       factura: null,           color: 'text-slate-500' },
  { id: 'dolares',            label: 'Divisa efectivo $',    short: 'DIVISAS',       moneda: 'USD', grupo: 'divisa',      banco: null,       factura: null,           color: 'text-green-600' },
  { id: 'zelle',              label: 'Zelle',                short: 'ZELLE',         moneda: 'USD', grupo: 'divisa',      banco: null,       factura: null,           color: 'text-violet-500' },
  { id: 'binance',            label: 'Binance',              short: 'BINANCE',       moneda: 'USD', grupo: 'cripto',      banco: null,       factura: null,           color: 'text-yellow-500' },
  { id: 'cashea',             label: 'Cashea',               short: 'CASHEA',        moneda: 'USD', grupo: 'cashea',      banco: null,       factura: 'fiscal',       color: 'text-purple-500' },
];

export const BANK_BIN_IDS: BankBin[] = BANK_METHODS.map(m => m.id);

export const DEPT_LABELS: Record<DeptKey, string> = {
  silenciador: 'Silenciadores',
  cauchera: 'Cauchera',
  alineacion: 'Alineación',
  electronica: 'Electrónica',
  mecanica: 'Mecánica',
  frenos: 'Frenos',
  lavado: 'Lavado',
  repuestos: 'Repuestos',
};

export type Bins = Record<BankBin, number>;

export function emptyBins(): Bins {
  return {
    pago_movil_banesco: 0, bnc: 0, punto_banesco: 0, punto_bancamiga: 0,
    pago_movil_exterior: 0, dolares: 0, binance: 0, zelle: 0, efectivo_bs: 0, cashea: 0,
  };
}

export function emptyDepartamentos(): Record<DeptKey, number> {
  return { silenciador: 0, cauchera: 0, alineacion: 0, electronica: 0, mecanica: 0, frenos: 0, lavado: 0, repuestos: 0 };
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ── Clasificación de departamento ────────────────────────────────────────────
export function deptFromInventario(categoria?: string | null): DeptKey {
  const c = (categoria || '').toLowerCase().trim();
  if (c.includes('silenciador') || c.includes('resonador') || c.includes('flexible') || c.includes('escape') || c.includes('cola')) return 'silenciador';
  if (c.includes('freno')) return 'frenos';
  if (c.includes('caucho') || c.includes('goma') || c.includes('neumatic')) return 'cauchera';
  if (c.includes('suspension') || c.includes('suspensión')) return 'mecanica';
  return 'repuestos';
}

export function deptFromServicioTipo(tipo?: string | null): DeptKey {
  const t = (tipo || '').toLowerCase().trim();
  if (t.includes('silenciad') || t.includes('escape') || t.includes('sistema') || t.includes('resonador')) return 'silenciador';
  if (t.includes('aline')) return 'alineacion';
  if (t.includes('electr')) return 'electronica';
  if (t.includes('mecan') || t.includes('mecán')) return 'mecanica';
  if (t.includes('freno')) return 'frenos';
  if (t.includes('lavad')) return 'lavado';
  if (t.includes('cauch') || t.includes('goma') || t.includes('neumat')) return 'cauchera';
  return 'repuestos';
}

// ── Utilidades de moneda ──────────────────────────────────────────────────────
export function binToUSD(id: BankBin, monto: number, tasa: number): number {
  const meta = BANK_METHODS.find(m => m.id === id);
  if (!meta) return 0;
  if (meta.moneda === 'Bs') return tasa > 0 ? r2((Number(monto) || 0) / tasa) : 0;
  return r2(Number(monto) || 0);
}

// Total recibido (USD equivalente) sumando TODOS los bins (incluye Cashea).
export function binsTotalUSD(bins: Bins, tasa: number): number {
  return r2(BANK_BIN_IDS.reduce((acc, id) => acc + binToUSD(id, bins[id], tasa), 0));
}

export interface DeptItem { dept: DeptKey; monto: number; }

export function sumDepartamentos(items: DeptItem[]): Record<DeptKey, number> {
  const out = emptyDepartamentos();
  for (const it of items) out[it.dept] = r2(out[it.dept] + (Number(it.monto) || 0));
  return out;
}

// ── Construcción de la fila de ventas_dia ─────────────────────────────────────
export interface BuildVentaDiaInput {
  bins: Bins;                 // montos por banco en su moneda nativa
  subtotal: number;           // USD, sin IVA
  conIva: boolean;
  saldo?: number;             // USD por cobrar / financiado (si aplica)
  tasa: number;               // tasa BCV del día
  deptItems?: DeptItem[];     // atribución por departamento (opcional)
}

export interface VentaDiaMappedFields {
  // Departamentos
  silenciador: number; cauchera: number; alineacion: number; electronica: number;
  mecanica: number; frenos: number; lavado: number; repuestos: number;
  // Bancos (columnas dedicadas, moneda nativa)
  pago_movil_banesco: number; bnc: number; punto_banesco: number; punto_bancamiga: number;
  pago_movil_exterior: number; dolares: number; binance: number; zelle: number;
  efectivo_bs: number; cashea: number;
  // Agregados financieros (USD salvo efectivo_bs/tasa)
  contado: number; por_cobrar: number; iva: number; inicial: number; financiado: number;
  tasa: number;
  // Retrocompatibilidad
  metodos_pago: Record<string, number>;
}

/**
 * Convierte los montos capturados en el POS a la fila de `ventas_dia`, poblando
 * las columnas por banco, por departamento y los agregados financieros.
 * Es no destructivo: el llamador combina el resultado con fecha/cliente/notas/etc.
 */
export function buildVentaDiaFields(input: BuildVentaDiaInput): VentaDiaMappedFields {
  const bins = { ...emptyBins(), ...input.bins };
  const tasa = Number(input.tasa) || 0;
  const subtotal = r2(input.subtotal);
  const iva = input.conIva ? r2(subtotal * 0.16) : 0;

  const departamentos = sumDepartamentos(input.deptItems || []);

  const casheaUSD = r2(bins.cashea);
  const recibidoUSD = binsTotalUSD(bins, tasa);
  const contado = Math.max(0, r2(recibidoUSD - casheaUSD)); // recibido de contado (sin Cashea)
  const saldoUSD = r2(input.saldo || 0);
  const esCashea = casheaUSD > 0;

  let inicial = 0, financiado = 0, por_cobrar = 0;
  if (esCashea) {
    financiado = saldoUSD;   // parte financiada por Cashea
    inicial = contado;       // cuota inicial pagada hoy
  } else if (saldoUSD > 0) {
    por_cobrar = saldoUSD;   // crédito simple
  }

  // metodos_pago con forma LEGADA (compat con CierreWizard / desglosePagos).
  // El dato preciso por banco vive en las columnas dedicadas de arriba.
  const legacy: Record<string, number> = {};
  const put = (k: string, v: number) => { if (v && v > 0) legacy[k] = r2(v); };
  put('efectivo_usd', bins.dolares);
  put('zelle', bins.zelle);
  put('binance', bins.binance);
  put('cashea', bins.cashea);
  put('efectivo_ves', bins.efectivo_bs);
  put('pago_movil', bins.pago_movil_banesco + bins.bnc + bins.pago_movil_exterior);
  put('punto_de_venta', bins.punto_banesco + bins.punto_bancamiga);

  return {
    ...departamentos,
    pago_movil_banesco: r2(bins.pago_movil_banesco),
    bnc: r2(bins.bnc),
    punto_banesco: r2(bins.punto_banesco),
    punto_bancamiga: r2(bins.punto_bancamiga),
    pago_movil_exterior: r2(bins.pago_movil_exterior),
    dolares: r2(bins.dolares),
    binance: r2(bins.binance),
    zelle: r2(bins.zelle),
    efectivo_bs: r2(bins.efectivo_bs),
    cashea: r2(bins.cashea),
    contado,
    por_cobrar,
    iva,
    inicial,
    financiado,
    tasa,
    metodos_pago: legacy,
  };
}

/**
 * Fallback para filas legadas (columnas en cero): reconstruye los bins por banco
 * de forma aproximada desde un `metodos_pago` con llaves genéricas. Los métodos
 * ambiguos se asignan a su banco por defecto (Banesco jurídica) — es lo mejor
 * posible sin la captura precisa, y sólo aplica a datos históricos.
 */
export function binsFromLegacyMetodos(mp: Record<string, unknown> | null | undefined): Bins {
  const bins = emptyBins();
  if (!mp) return bins;
  const num = (v: unknown) => Number(v) || 0;
  for (const [k, v] of Object.entries(mp)) {
    const val = num(v);
    if (!val) continue;
    switch (k) {
      // llaves precisas (por si ya existen)
      case 'pago_movil_banesco': case 'bnc': case 'punto_banesco': case 'punto_bancamiga':
      case 'pago_movil_exterior': case 'dolares': case 'binance': case 'zelle':
      case 'efectivo_bs': case 'cashea':
        bins[k as BankBin] += val; break;
      // llaves genéricas legadas → banco por defecto
      case 'efectivo_usd': bins.dolares += val; break;
      case 'efectivo_ves': bins.efectivo_bs += val; break;
      case 'divisas': bins.dolares += val; break;
      case 'pago_movil': bins.pago_movil_banesco += val; break;
      case 'transferencia': bins.pago_movil_banesco += val; break;
      case 'punto_de_venta': case 'punto_de_venta_ves': bins.punto_banesco += val; break;
      case 'punto_de_venta_usd': bins.dolares += val; break;
      case 'cashea_usd': case 'cashea_ves': bins.cashea += val; break;
      case 'euros': bins.dolares += val; break; // aproximación
      default: break;
    }
  }
  return bins;
}
