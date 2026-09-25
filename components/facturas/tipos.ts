/** Piezas compartidas de la pantalla de Facturación. */

export interface ItemFactura {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

export interface Factura {
  id: string;
  correlativo: string | null;
  tipo: string | null;
  cliente: string | null;
  vehiculo: string | null;
  total: number | null;
  total_bs: number | null;
  /** Bs. reales del cobro, calculados en el servidor. */
  total_bs_real: number;
  moneda: string | null;
  tasa_cambio: number | null;
  estado: string | null;
  con_iva: boolean | null;
  fecha_emision: string | null;
  emitido_por: string | null;
  modulo_origen: string | null;
  metodos_pago: Record<string, number> | null;
  items: ItemFactura[] | null;
  notas: string | null;
  /** La orden o la venta de la que salió la factura. */
  referencia_id?: string | null;
  referencia_tabla?: string | null;
}

export interface KpisFactura {
  emitidasMes: number;
  variacionEmitidas: number | null;
  ingresosMes: number;
  variacionIngresos: number | null;
  pagadas: number;
  pctPagadas: number;
  pendientes: number;
  pctPendientes: number;
  ticket: number;
  variacionTicket: number | null;
}

export interface ResumenFacturas {
  facturas: Factura[];
  kpis: KpisFactura;
  conteos: { todas: number; pagadas: number; pendientes: number; anuladas: number; notasCredito: number };
  metodos: { id: string; monto: number; pct: number }[];
  monedas: { id: string; monto: number; pct: number }[];
  relacionados: { presupuestos: number; servicios: number; notasCredito: number };
}

export const bs = (n: number) =>
  `Bs. ${(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const usd = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** dd/mm/aaaa, que es como se lee una fecha en una factura. */
export const fecha = (iso?: string | null) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '—';

export const normaliza = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El nombre legible de cada método de pago tal como se guarda. */
export const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  efectivo_usd: 'Efectivo ($)',
  efectivo_bs: 'Efectivo (Bs.)',
  divisas: 'Divisas',
  dolares: 'Divisas ($)',
  pago_movil: 'Pago Móvil',
  pago_movil_banesco: 'Pago Móvil Banesco',
  pago_movil_exterior: 'Pago Móvil Exterior',
  transferencia: 'Transferencia',
  punto_banesco: 'Punto Banesco',
  punto_bancamiga: 'Punto Banca Amiga',
  punto_venta: 'Punto de venta',
  tarjeta_debito: 'Tarjeta Débito',
  tarjeta_credito: 'Tarjeta Crédito',
  bnc: 'BNC',
  zelle: 'Zelle',
  binance: 'Binance',
  cashea: 'Cashea',
};

/** Colores del gráfico de métodos, en el orden en que se pintan. */
export const COLORES = [
  '#16a34a', '#2563eb', '#7c3aed', '#f97316', '#eab308', '#0d9488', '#dc2626', '#8a909c',
];

export const TIPO_LABEL: Record<string, string> = {
  venta: 'Factura fiscal',
  servicio: 'Factura de servicio',
  nota_entrega: 'Nota de entrega',
  nota_credito: 'Nota de crédito',
  presupuesto: 'Presupuesto',
};

export const ESTADO_TINTE: Record<string, string> = {
  pagado: 'bg-[#e8f7ee] text-[#15803d]',
  pendiente: 'bg-[#fff4ec] text-[#c2410c]',
  anulado: 'bg-[#fdeaea] text-[#dc2626]',
  anulada: 'bg-[#fdeaea] text-[#dc2626]',
};

export const ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagada',
  pendiente: 'Pendiente',
  anulado: 'Anulada',
  anulada: 'Anulada',
};
