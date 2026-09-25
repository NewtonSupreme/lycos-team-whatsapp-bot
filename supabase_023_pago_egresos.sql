-- De qué cuenta salió el dinero de cada gasto.
--
-- Un egreso guardaba el importe y, como mucho, un `metodo_pago` en texto libre
-- («pago_movil_exterior», «efectivo_usd»). No se sabía de qué banco salió ni
-- en qué moneda, así que el reporte no podía decir cuánto salió de Banesco y
-- cuánto de la caja en dólares, y un pago repartido entre dos cuentas no se
-- podía ni escribir.
--
-- `metodos_pago` usa las MISMAS diez cuentas que el cobro de una venta
-- (`pago_movil_banesco`, `bnc`, `dolares`, `zelle`…), cada una en su moneda
-- nativa: bolívares en las cuentas en Bs, dólares en las de divisa. Es la
-- misma forma que `servicios.metodos_pago`, para que un solo panel sirva para
-- cobrar y para pagar. `tasa_cambio` ya existía en egresos y es la que
-- convierte los bolívares de ese pago.

alter table egresos
  add column if not exists metodos_pago jsonb;

-- El renglón de la ficha lleva lo mismo: es donde se registra el pago al
-- proveedor, y de ahí se copia a su egreso.
alter table vehiculo_partidas
  add column if not exists metodos_pago jsonb,
  add column if not exists tasa_pago numeric;
