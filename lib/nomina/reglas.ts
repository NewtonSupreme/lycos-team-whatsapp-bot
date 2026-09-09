import { ZONAS_TRABAJO, type CommissionRule, type MonedaNomina } from '@/types';

/**
 * Traduce las reglas de comisión a algo que se pueda leer sin saber nada del
 * sistema, y las simula antes de guardarlas.
 *
 * El motor piensa en `tipo_regla`, `base` y `condiciones.tipos`. El dueño del
 * taller piensa en "a Freddy se le paga la mitad de cada silenciador". Este
 * archivo es el puente entre las dos cosas, y lo usan tanto el constructor de
 * reglas como la lista donde se leen.
 */

export type TipoRegla = 'porcentaje' | 'fijo_semanal' | 'override_cascada' | 'tarifa_flat';
export type BaseRegla = 'ingreso_total' | 'mano_obra';

export interface FormaPago {
  id: TipoRegla;
  titulo: string;
  resumen: string;
  ejemplo: string;
  /** Qué campos pide esta forma de pago. */
  pidePorcentaje: boolean;
  pideBase: boolean;
  pideMonto: boolean;
}

export const FORMAS_PAGO: readonly FormaPago[] = [
  {
    id: 'porcentaje',
    titulo: 'Un porcentaje del trabajo',
    resumen: 'Cobra un % de cada trabajo que hace.',
    ejemplo: 'Freddy cobra el 50 % de cada silenciador.',
    pidePorcentaje: true, pideBase: true, pideMonto: false,
  },
  {
    id: 'fijo_semanal',
    titulo: 'Un sueldo fijo semanal',
    resumen: 'Cobra lo mismo cada semana, haga los trabajos que haga.',
    ejemplo: 'Acevedo cobra $40 por semana en el almacén.',
    pidePorcentaje: false, pideBase: false, pideMonto: true,
  },
  {
    id: 'override_cascada',
    titulo: 'Un porcentaje por supervisar',
    resumen: 'Cobra un % de los trabajos que hacen OTROS. Se suma solo.',
    ejemplo: 'Jim cobra el 7 % de la mano de obra de cada mecánico.',
    pidePorcentaje: true, pideBase: true, pideMonto: false,
  },
  {
    id: 'tarifa_flat',
    titulo: 'Una tarifa fija por trabajo',
    resumen: 'Cobra un monto fijo por cada trabajo, sin importar lo que deje.',
    ejemplo: '$2 por cada revisión, se cobre lo que se cobre.',
    pidePorcentaje: false, pideBase: false, pideMonto: false,
  },
];

export const formaPago = (t: string) => FORMAS_PAGO.find(f => f.id === t) || FORMAS_PAGO[0];

export const BASES: readonly { id: BaseRegla; titulo: string; ayuda: string }[] = [
  { id: 'ingreso_total', titulo: 'Todo lo que deja el trabajo', ayuda: 'Repuestos incluidos.' },
  { id: 'mano_obra', titulo: 'Solo la mano de obra', ayuda: 'Sin contar los repuestos.' },
];

export const MONEDAS: readonly { id: MonedaNomina; label: string }[] = [
  { id: 'USD', label: 'Dólares' },
  { id: 'VES', label: 'Bolívares' },
  { id: 'EUR', label: 'Euros' },
];

/** Palabras que suelen distinguir un servicio de otro dentro de una zona. */
export const TIPOS_SUGERIDOS: readonly string[] = [
  'revision', 'reemplazo', 'reparacion', 'rotacion', 'adicional', 'instalacion',
  'soldadura', 'balanceo', 'amortiguador', 'base', 'tren', 'pintura', 'pulitura',
];

export const zonaLabel = (z: string) =>
  z === 'all' ? 'Todas las zonas' : (ZONAS_TRABAJO.find(x => x.key === z)?.label || z);

/** Regla nueva con valores razonables para empezar. */
export function reglaNueva(tipo: TipoRegla, empleadoId: string | null): Partial<CommissionRule> {
  return {
    empleado_id: empleadoId,
    tipo_regla: tipo,
    zona: tipo === 'fijo_semanal' ? 'all' : 'general',
    base: tipo === 'override_cascada' ? 'mano_obra' : 'ingreso_total',
    valor: tipo === 'fijo_semanal' ? 40 : 40,
    moneda: 'USD',
    aplica_monedas: null,
    proveedor_pct: 0,
    proveedor_nombre: null,
    // 100 deja sitio de sobra por debajo para las reglas más específicas.
    prioridad: tipo === 'fijo_semanal' ? 1 : 20,
    condiciones: {},
    descripcion: '',
    activo: true,
    vigencia_hasta: null,
  } as Partial<CommissionRule>;
}

const pct = (n: number) => `${Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(2)} %`;
const usd = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * La regla escrita como la diría una persona.
 *
 * Se arma por partes para que la lista y el constructor digan exactamente lo
 * mismo: si la frase miente, alguien va a cobrar de más o de menos.
 */
export function describirRegla(r: Partial<CommissionRule>, quien = 'Esta persona'): string {
  const tipos = (r.condiciones as { tipos?: string[] } | undefined)?.tipos;
  const cuando = tipos && tipos.length
    ? ` cuando el trabajo sea de ${tipos.join(', ')}`
    : '';
  const zona = r.zona && r.zona !== 'all' ? ` en ${zonaLabel(r.zona).toLowerCase()}` : '';
  const monedas = r.aplica_monedas && r.aplica_monedas.length
    ? `, solo si se cobró en ${r.aplica_monedas.map(m => MONEDAS.find(x => x.id === m)?.label.toLowerCase() || m).join(' o ')}`
    : '';

  switch (r.tipo_regla) {
    case 'fijo_semanal':
      return `${quien} cobra ${usd(r.valor || 0)} fijos cada semana${zona ? `, por su trabajo${zona}` : ''}.`;

    case 'override_cascada':
      return `${quien} cobra ${pct(r.valor || 0)} de ${
        r.base === 'mano_obra' ? 'la mano de obra' : 'lo que deja el trabajo'
      }${zona} que hacen OTROS técnicos${cuando}. Se le suma solo, sin registrar nada aparte.`;

    case 'tarifa_flat':
      return `${quien} cobra una tarifa fija por cada trabajo${zona}${cuando}, según el catálogo de tarifas.`;

    default: {
      // El 0 % no es "un porcentaje bajo": la regla coincide igual y deja la
      // comisión en cero, tapando cualquier otra. Se dice tal cual para que
      // nadie lo lea como una configuración normal.
      if (!r.valor) {
        return `${quien} NO cobra comisión${zona}${cuando}: la regla está en 0 %${
          zona ? ', así que esos trabajos le quedan en $0.00' : ''}.`;
      }
      const reparto = r.proveedor_pct && r.proveedor_pct > 0
        ? ` Del total del trabajo, ${pct(r.proveedor_pct)} va para ${r.proveedor_nombre || 'el proveedor'}.`
        : '';
      return `${quien} cobra ${pct(r.valor || 0)} de ${
        r.base === 'mano_obra' ? 'la mano de obra' : 'todo lo que deja el trabajo'
      }${zona}${cuando}${monedas}.${reparto}`;
    }
  }
}

export interface Simulacion {
  comision: number;
  proveedor: number;
  taller: number;
  /** Sobre qué monto se aplicó el porcentaje. */
  baseAplicada: number;
  nota: string | null;
}

/**
 * Qué pasaría con un trabajo concreto bajo esta regla.
 *
 * Replica lo que hace `computeExecutorCommission`: el porcentaje va sobre la
 * base elegida, pero el reparto al proveedor se calcula SIEMPRE sobre el total
 * del trabajo. Esa asimetría es real y es fácil de olvidar, por eso la
 * simulación la muestra.
 */
export function simular(r: Partial<CommissionRule>, trabajo: { ingreso: number; manoObra: number }): Simulacion {
  const ingreso = Number(trabajo.ingreso) || 0;
  const manoObra = Number(trabajo.manoObra) || 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (r.tipo_regla === 'fijo_semanal') {
    return {
      comision: r2(Number(r.valor) || 0), proveedor: 0, taller: ingreso, baseAplicada: 0,
      nota: 'El sueldo fijo no depende del trabajo: se paga completo cada semana del período.',
    };
  }

  if (r.tipo_regla === 'tarifa_flat') {
    return {
      comision: 0, proveedor: 0, taller: ingreso, baseAplicada: 0,
      nota: 'El monto sale del catálogo de tarifas, según el servicio que se registre.',
    };
  }

  const base = r.base === 'mano_obra' ? manoObra : ingreso;
  const comision = r2(base * ((Number(r.valor) || 0) / 100));
  const proveedor = r.proveedor_pct && r.proveedor_pct > 0
    ? r2(ingreso * (Number(r.proveedor_pct) / 100))
    : 0;

  return {
    comision,
    proveedor,
    taller: r2(ingreso - comision - proveedor),
    baseAplicada: base,
    nota: r.tipo_regla === 'override_cascada'
      ? 'Esto se le paga al supervisor ADEMÁS de lo que cobra el técnico que hizo el trabajo.'
      : (r.base === 'mano_obra' && manoObra === 0
        ? 'Ojo: este trabajo no tiene mano de obra declarada, así que la comisión sale en cero.'
        : null),
  };
}

/** Qué le falta o qué está mal antes de guardar. Null = todo bien. */
export function validarRegla(r: Partial<CommissionRule>): string | null {
  if (!r.tipo_regla) return 'Elige cómo se le paga.';

  if (r.tipo_regla === 'fijo_semanal') {
    if (!r.valor || r.valor <= 0) return 'El sueldo semanal tiene que ser mayor que cero.';
    return null;
  }

  if (r.tipo_regla === 'tarifa_flat') return null;

  const v = Number(r.valor);
  if (!Number.isFinite(v) || v < 0) return 'El porcentaje tiene que ser un número positivo.';
  if (v > 100) return 'Un porcentaje mayor a 100 % le pagaría más de lo que deja el trabajo.';

  const prov = Number(r.proveedor_pct) || 0;
  if (prov < 0 || prov > 100) return 'El porcentaje del proveedor tiene que estar entre 0 y 100.';
  if (v + prov > 100) {
    return `Entre el técnico (${v} %) y el proveedor (${prov} %) se llevan ${v + prov} % del trabajo: al taller no le queda nada.`;
  }
  if (prov > 0 && !r.proveedor_nombre?.trim()) return 'Escribe a quién se le paga ese porcentaje.';

  if (r.vigencia_hasta && r.vigencia_desde && r.vigencia_hasta < r.vigencia_desde) {
    return 'La fecha de fin no puede ser anterior a la de inicio.';
  }
  return null;
}

/** Avisos que no impiden guardar pero conviene leer. */
export function avisosRegla(r: Partial<CommissionRule>, otras: CommissionRule[]): string[] {
  const avisos: string[] = [];
  const v = Number(r.valor) || 0;

  if (r.tipo_regla === 'porcentaje' && v === 0) {
    avisos.push('Con 0 % la persona no cobra nada por estos trabajos. Úsalo solo si el monto se define caso por caso.');
  }
  if (r.tipo_regla === 'porcentaje' && v >= 80) {
    avisos.push(`${v} % es casi todo el trabajo: al taller le quedaría muy poco.`);
  }

  const tipos = (r.condiciones as { tipos?: string[] } | undefined)?.tipos;
  const choques = otras.filter(o =>
    o.id !== (r as CommissionRule).id &&
    o.empleado_id === r.empleado_id &&
    o.activo &&
    o.zona === r.zona &&
    o.tipo_regla === r.tipo_regla &&
    !((o.condiciones as { tipos?: string[] })?.tipos?.length) === !(tipos?.length),
  );
  if (choques.length > 0 && !tipos?.length) {
    avisos.push(`Ya hay ${choques.length} regla(s) parecida(s) para esta persona en la misma zona. Gana la de prioridad más baja.`);
  }
  return avisos;
}
