-- ============================================================
-- LYCOS TEAM — Migración 004: Migrar Histórico a Facturas
-- Este script toma todas las ventas y servicios antiguos
-- y les genera un número de factura correlativo para que
-- aparezcan en el nuevo buscador.
-- ============================================================

DO $$
DECLARE
  venta RECORD;
  n_correlativo text;
BEGIN
  -- Iterar sobre ventas_dia existentes que no estén ya en la tabla facturas
  -- Ordenadas de más antiguas a más nuevas para asignar los correlativos correctamente
  FOR venta IN 
    SELECT * FROM ventas_dia vd 
    WHERE NOT EXISTS (SELECT 1 FROM facturas f WHERE f.referencia_id = vd.id)
    ORDER BY created_at ASC
  LOOP
    -- Generar un correlativo único y en orden
    n_correlativo := generar_correlativo_factura();

    -- Insertar la factura en el sistema centralizado
    INSERT INTO facturas (
      correlativo, 
      tipo, 
      modulo_origen, 
      referencia_id, 
      referencia_tabla,
      cliente, 
      total, 
      moneda, 
      tasa_cambio, 
      total_bs,
      items, 
      metodos_pago, 
      con_iva, 
      estado, 
      notas,
      sede_id, 
      emitido_por, 
      fecha_emision, 
      created_at, 
      updated_at
    ) VALUES (
      n_correlativo, 
      'venta', 
      'ventas_pos', -- Por defecto lo agruparemos en ventas históricas
      venta.id, 
      'ventas_dia',
      COALESCE(venta.cliente, 'Consumidor Final'), 
      venta.total_ingresos * CASE WHEN venta.con_iva THEN 1.16 ELSE 1 END,
      'USD', 
      venta.tasa_cambio, 
      (venta.total_ingresos * CASE WHEN venta.con_iva THEN 1.16 ELSE 1 END) * COALESCE(venta.tasa_cambio, 1),
      COALESCE(venta.desglose, '[]'::jsonb), 
      COALESCE(venta.metodos_pago, '{}'::jsonb),
      COALESCE(venta.con_iva, false), 
      COALESCE(venta.estado, 'pagado'), 
      venta.notas,
      venta.sede_id, 
      COALESCE(venta.creado_por, 'Admin'), 
      COALESCE(CAST(venta.fecha AS date), CAST(venta.created_at AS date)), 
      venta.created_at, 
      venta.created_at
    );
  END LOOP;
END;
$$;
