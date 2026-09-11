/**
 * La vista de Proveedores, en un solo tipo.
 *
 * Todo llega de una sola llamada a propósito: la pantalla cruza compras, deudas
 * y órdenes, y pedir cada bloque por su lado dejaba los totales en desacuerdo
 * mientras cargaban —el KPI decía una cifra y la tabla de abajo otra—.
 */

export interface ProveedorFila {
  id: string;
  nombre: string;
  rif: string | null;
  categoria: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  enlace: string | null;
  condiciones_pago: string | null;
  dias_credito: number;
  activo: boolean;
  notas: string | null;

  /** Lo que se le ha comprado en total, histórico. */
  comprado: number;
  /** Lo que se le ha comprado en el mes en curso. */
  compradoMes: number;
  /** Número de compras registradas. */
  compras: number;
  /** Lo que se le debe ahora mismo. */
  saldo: number;
  /** De ese saldo, lo que ya pasó su fecha límite. */
  vencido: number;
  /** La compra más reciente. */
  ultimaCompra: string | null;
  /** Órdenes de compra abiertas. */
  ordenesAbiertas: number;
  /** Nota media de sus evaluaciones, de 1 a 5. Nulo = sin evaluar. */
  calificacion: number | null;
  nEvaluaciones: number;
}

export interface CompraFila {
  /** De dónde salió: un renglón de la ficha de un carro o un egreso suelto. */
  origen: 'partida' | 'egreso';
  id: string;
  fecha: string;
  proveedor: string;
  proveedor_id: string | null;
  concepto: string;
  placa: string | null;
  cantidad: number;
  total: number;
  pagado: number;
  saldo: number;
  estado_pago: string;
  fecha_vencimiento: string | null;
  vencida: boolean;
  enlace: string | null;
}

export interface OrdenCompraFila {
  id: string;
  correlativo: string | null;
  proveedor: string;
  proveedor_id: string | null;
  fecha: string;
  fecha_esperada: string | null;
  fecha_recibida: string | null;
  estado: string;
  estado_pago: string;
  total: number;
  monto_pagado: number;
  moneda: string;
  fecha_vencimiento: string | null;
  notas: string | null;
  nItems: number;
  /** Si la fecha esperada ya pasó y todavía no ha llegado. */
  atrasada: boolean;
}

export interface EvaluacionFila {
  id: string;
  proveedor_id: string;
  proveedor: string;
  fecha: string;
  calidad: number | null;
  puntualidad: number | null;
  precio: number | null;
  promedio: number | null;
  comentario: string | null;
  evaluado_por: string | null;
}

export interface PanelProveedores {
  proveedores: ProveedorFila[];
  compras: CompraFila[];
  ordenes: OrdenCompraFila[];
  evaluaciones: EvaluacionFila[];
  kpis: {
    total: number;
    activos: number;
    compradoMes: number;
    comprasMes: number;
    ordenesPendientes: number;
    ordenesAtrasadas: number;
    porPagar: number;
    vencido: number;
  };
  /** El que más volumen mueve en el mes. Nulo si no se le compró a nadie. */
  destacado: ProveedorFila | null;
  /** Lo que hay que mirar hoy. Vacío = nada urgente. */
  avisos: string[];
  /** El mes que se está mostrando, en YYYY-MM. */
  mes: string;
}
