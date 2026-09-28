-- Cada abono es un cobro con su propia fecha y sus propias cuentas.
--
-- Abonar en «Pendientes por pagar» solo restaba el saldo de la venta: no
-- quedaba el día en que entró el dinero ni por dónde entró. Una venta del 21
-- pagada el 25 seguía diciendo 21 en todas partes, y el reporte del 25 no veía
-- ese dinero en ninguna cuenta.
--
-- `metodos_pago` usa las mismas diez cuentas que una venta, cada una en su
-- moneda. `fecha` es el día del cobro (el de Caracas, no el UTC de created_at).

alter table abonos
  add column if not exists metodos_pago jsonb,
  add column if not exists fecha date;

update abonos
   set fecha = (created_at at time zone 'America/Caracas')::date
 where fecha is null;

create index if not exists abonos_fecha on abonos (fecha);
create index if not exists abonos_venta on abonos (venta_id);

-- La venta recuerda cuándo quedó saldada: la factura lo imprime.
alter table ventas_dia
  add column if not exists fecha_pago date;
