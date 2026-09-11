/**
 * La forma de un pago a proveedor que ya toca pagar.
 *
 * Vive aquí y no en la ruta porque lo comparten el servidor y el aviso a
 * pantalla completa: importar un tipo desde un `route.ts` arrastra el módulo
 * de servidor al bundle del cliente.
 */
export interface PagoVencido {
  /** De dónde sale la deuda: un renglón de la ficha o un egreso suelto. */
  origen: 'partida' | 'egreso';
  id: string;
  concepto: string;
  /** Qué es exactamente lo que hay que pagar, en palabras. */
  descripcion: string;
  placa: string | null;
  vehiculo_info: string | null;
  cliente_nombre: string | null;
  saldo: number;
  total: number;
  pagado: number;
  fecha: string;
  fecha_vencimiento: string;
  /** Días de retraso. 0 = vence hoy. */
  diasVencido: number;
  proveedor: string;
  proveedor_id: string | null;
  telefono: string | null;
  contacto: string | null;
  email: string | null;
  enlace: string | null;
}

export interface RespuestaAlertasPago {
  pagos: PagoVencido[];
  total: number;
  vencidos: number;
  /** Bs por dólar el día de hoy, para saber cuánto hay que transferir. */
  tasa: number;
  tasaFuente: string;
  fecha: string;
}
