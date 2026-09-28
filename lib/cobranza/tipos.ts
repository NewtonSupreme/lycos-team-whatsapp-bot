/** Cuentas por cobrar: las formas que comparten la API, la pantalla y el PDF. */

export interface VentaPendienteCliente {
  id: string; fecha: string; placa: string | null; vehiculo: string | null; trabajo: string;
  mecanico: string | null; total: number; abonado: number; saldo: number;
  financiado: number; porCobrar: number; cashea: boolean; servicio_id: string | null;
  abonos: Array<{ fecha: string; monto: number; metodo: string | null }>;
  dias: number;
}
export interface ClienteDeudor {
  clave: string; nombre: string; telefono: string | null; cedula: string | null;
  deuda: number; deudaCashea: number; deudaCliente: number;
  ventas: VentaPendienteCliente[];
  ultimoAbono: { fecha: string; monto: number; metodo: string | null } | null;
  masAntigua: number;
}

export interface ResumenCobranza {
  total: number;
  /** Lo que financia Cashea: lo paga Cashea al BNC. */
  cashea: number;
  /** Lo que deben los propios clientes. */
  clientesDeben: number;
  nClientes: number;
  nVentas: number;
  /** Clientes con alguna deuda de más de 30 días. */
  vencidas30: number;
}

export interface Cobranza {
  clientes: ClienteDeudor[];
  resumen: ResumenCobranza;
  generado: string;
}
