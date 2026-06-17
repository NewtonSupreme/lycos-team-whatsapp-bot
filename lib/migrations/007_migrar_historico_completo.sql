-- ============================================================
-- LYCOS TEAM — Migración 007: Migrar todo el Histórico a Facturas
-- Migrar de ventas_dia y ventas_silenciadores que faltan
-- ============================================================

DO $$
DECLARE
  venta RECORD;
  n_correlativo text;
BEGIN
  -- 1. ventas_dia
  FOR venta IN 
    SELECT * FROM ventas_dia vd 
    WHERE NOT EXISTS (SELECT 1 FROM facturas f WHERE f.referencia_id = vd.id)
    ORDER BY created_at ASC
  LOOP
    n_correlativo := generar_correlativo_factura();
    INSERT INTO facturas (
      correlativo, tipo, modulo_origen, referencia_id, referencia_tabla,
      cliente, total, moneda, tasa_cambio, total_bs, items, metodos_pago, con_iva, estado, notas,
      sede_id, emitido_por, fecha_emision, created_at, updated_at
    ) VALUES (
      n_correlativo, 'venta', 'ventas_pos', venta.id, 'ventas_dia',
      COALESCE(venta.cliente, 'Consumidor Final'), 
      venta.total_ingresos * CASE WHEN venta.con_iva THEN 1.16 ELSE 1 END,
      'USD', venta.tasa_cambio, 
      (venta.total_ingresos * CASE WHEN venta.con_iva THEN 1.16 ELSE 1 END) * COALESCE(venta.tasa_cambio, 1),
      COALESCE(venta.desglose, '[]'::jsonb), COALESCE(venta.metodos_pago, '{}'::jsonb),
      COALESCE(venta.con_iva, false), COALESCE(venta.estado, 'pagado'), venta.notas,
      venta.sede_id, COALESCE(venta.creado_por, 'Admin'), 
      COALESCE(CAST(venta.fecha AS date), CAST(venta.created_at AS date)), 
      venta.created_at, venta.created_at
    );
  END LOOP;

  -- 2. ventas_silenciadores
  FOR venta IN 
    SELECT * FROM ventas_silenciadores vs
    WHERE NOT EXISTS (SELECT 1 FROM facturas f WHERE f.referencia_id = vs.id)
    ORDER BY created_at ASC
  LOOP
    n_correlativo := generar_correlativo_factura();
    INSERT INTO facturas (
      correlativo, tipo, modulo_origen, referencia_id, referencia_tabla,
      cliente, vehiculo, total, moneda, items, metodos_pago, estado, notas,
      sede_id, emitido_por, fecha_emision, created_at, updated_at
    ) VALUES (
      n_correlativo, 'venta', 'silenciadores', venta.id, 'ventas_silenciadores',
      COALESCE(venta.cliente, 'Consumidor Final'), venta.vehiculo,
      venta.total, 'USD', 
      COALESCE(venta.servicios, '[]'::jsonb), COALESCE(venta.metodos_pago, '{}'::jsonb),
      'pagado', venta.notas,
      venta.sede_id, COALESCE(venta.registrado_por, 'Admin'), 
      COALESCE(CAST(venta.fecha AS date), CAST(venta.created_at AS date)), 
      venta.created_at, venta.created_at
    );
  END LOOP;
END;
$$;
