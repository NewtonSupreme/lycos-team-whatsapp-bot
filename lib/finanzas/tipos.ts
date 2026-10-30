/**
 * Lo que la vista de Finanzas necesita saber, y en qué unidad.
 *
 * Todo lo que viaja por aquí va en DÓLARES. El taller cotiza en dólares
 * —`costo_estimado`, `precio_usd`, las comisiones— y cobra en bolívares al
 * cambio del día. Si cada cifra viajara ya convertida, dos filas cobradas con
 * tasas distintas no se podrían sumar, y el total del mes dependería de cuándo
 * se abriera la pantalla.
 *
 * La conversión a bolívares se hace al pintar, con `tasa`, y cada movimiento se
 * convierte con la tasa de SU día —que es la que viene en la fila— y no con la
 * de hoy. Convertir un cobro de julio a la tasa de septiembre es inventarse un
 * ingreso que nadie recibió.
 */

export type Moneda = 'USD' | 'VES';

export interface Kpi {
  /** En dólares. */
  valor: number;
  /** Variación contra el período anterior, en porcentaje. `null` si no hay con qué comparar. */
  variacion: number | null;
  /** Texto de apoyo cuando la variación no aplica («18 facturas pendientes»). */
  pie?: string;
}

export interface PuntoFlujo {
  /** Etiqueta del tramo: «Semana 1», «05/09», «Septiembre». */
  etiqueta: string;
  ingresos: number;
  gastos: number;
  /** Saldo que se va acumulando tramo a tramo. */
  acumulado: number;
}

export interface Tajada {
  clave: string;
  etiqueta: string;
  monto: number;
  /** Porcentaje del total, ya calculado: la vista no debe repetir la cuenta. */
  pct: number;
  color: string;
}

export interface Transaccion {
  id: string;
  fecha: string;
  tipo: 'ingreso' | 'gasto';
  descripcion: string;
  categoria: string;
  metodo: string;
  /** Clave del bin, para poder pintar el logo del banco. */
  metodoBin: string | null;
  monto: number;
  estado: string;
}

export interface SaldoCuenta {
  id: string;
  nombre: string;
  tipo: 'efectivo' | 'banco' | 'digital' | 'caja_chica';
  moneda: Moneda;
  banco: string | null;
  bin: string | null;
  saldoInicial: number;
  /** Lo que entró por esta cuenta desde `desde`. */
  entradas: number;
  /** Lo que salió. */
  salidas: number;
  /** saldoInicial + entradas − salidas, en la moneda de la cuenta. */
  saldo: number;
  /**
   * BNC y Cashea son el mismo dinero: lo de Cashea se liquida en el BNC. El BNC
   * trae aquí su desglose (Bs por PM/transferencia + lo de Cashea) y la cuenta
   * de Cashea queda marcada como «incluida en» el BNC para no contarla dos veces.
   */
  desglose?: { pmBs: number; casheaUsd: number; casheaBs: number };
  incluidaEn?: string;
}

export interface Cobrar {
  id: string;
  cliente: string;
  documento: string;
  monto: number;
  /** Días desde que se emitió. Es lo que decide el color del aviso. */
  dias: number;
}

export interface Pagar {
  id: string;
  proveedor: string;
  descripcion: string;
  monto: number;
  vencimiento: string | null;
  /** Días para vencer; negativo si ya venció. */
  dias: number | null;
}

export interface Indicador {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Cómo se pinta: dinero, número suelto, porcentaje o días. */
  formato: 'dinero' | 'numero' | 'pct' | 'dias';
  variacion: number | null;
  /**
   * Si subir es bueno. El coste medio por servicio subiendo es una mala
   * noticia, y pintarlo en verde por ser una flecha hacia arriba engaña.
   */
  subirEsBueno: boolean;
  ayuda: string;
}

export interface ResumenFinanzas {
  desde: string;
  hasta: string;
  /** Tasa del BCV de hoy, solo para pintar en bolívares. */
  tasa: number;
  kpis: {
    ingresos: Kpi; gastos: Kpi; utilidad: Kpi; margen: Kpi;
    porCobrar: Kpi; porPagar: Kpi;
  };
  /**
   * De dónde salen la utilidad y el margen: el mismo cálculo que Finanzas › Utilidad
   * (ventas sin IVA − costo de los carros cobrados − gastos del taller).
   */
  utilidadDetalle?: {
    ventas: number; costoCarros: number; gastosTaller: number; iva: number; enProceso: number;
    entroCajaUsd: number; puntaje: number; criticos: number;
  } | null;
  /** Totales de los anillos: lo cobrado por método y todo lo gastado (base de caja, no de utilidad). */
  totalCobrado?: number;
  totalGastado?: number;
  flujo: PuntoFlujo[];
  agrupacionFlujo: 'dia' | 'semana' | 'mes';
  gastosPorCategoria: Tajada[];
  ingresosPorMetodo: Tajada[];
  transacciones: Transaccion[];
  cuentas: SaldoCuenta[];
  porCobrar: Cobrar[];
  porPagar: Pagar[];
  indicadores: Indicador[];
  /** Lo que la pantalla debe advertir: datos que faltan, no errores. */
  avisos: string[];
}

// ── Paleta ──────────────────────────────────────────────────────────────────
// Los mismos colores para la misma cosa en toda la pantalla: si «Repuestos» es
// rojo en el anillo de gastos, es rojo en la tabla. Cambiar de color por
// panel obliga a leer la leyenda cada vez.
export const COLORES_TAJADA = [
  '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#22c55e',
  '#ec4899', '#14b8a6', '#a3a3a3',
] as const;

export const colorPorIndice = (i: number) => COLORES_TAJADA[i % COLORES_TAJADA.length];

/**
 * Las categorías de gasto del taller.
 *
 * Son su propio vocabulario, distinto del de las ventas. Pasarlas por
 * `categoriaLabel` —que es el de ventas— convertía «herramientas» y «alquiler»
 * en «Sin clasificar» y el anillo de gastos perdía la mitad de su información.
 */
export const CATEGORIAS_GASTO: Record<string, string> = {
  repuestos: 'Repuestos',
  nomina: 'Nómina',
  sueldos: 'Nómina',
  comisiones: 'Nómina',
  servicios_basicos: 'Servicios básicos',
  servicios: 'Servicios básicos',
  luz: 'Servicios básicos',
  agua: 'Servicios básicos',
  internet: 'Servicios básicos',
  herramientas: 'Herramientas',
  equipos: 'Herramientas',
  alquiler: 'Alquiler',
  local: 'Alquiler',
  impuestos: 'Impuestos',
  transporte: 'Transporte',
  combustible: 'Transporte',
  publicidad: 'Publicidad',
  mantenimiento: 'Mantenimiento',
  insumos: 'Insumos',
  otro: 'Otros',
  otros: 'Otros',
};

/** La etiqueta de una categoría de gasto, sin perder la original si no está. */
export function etiquetaGasto(clave?: string | null): string {
  const k = String(clave || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (!k) return 'Otros';
  if (CATEGORIAS_GASTO[k]) return CATEGORIAS_GASTO[k];
  // Lo que no está en la lista se enseña tal cual, capitalizado: es mejor ver
  // «Detailer» que un «Sin clasificar» que esconde de qué era el gasto.
  return k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
