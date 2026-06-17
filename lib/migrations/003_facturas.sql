-- ============================================================
--  LYCOS TEAM — Migración 003: Sistema Centralizado de Facturas
--  Tabla de registro unificado de facturas con correlativo
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLA: facturas (registro maestro de TODA factura emitida)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlativo     text NOT NULL UNIQUE,
  tipo            text NOT NULL DEFAULT 'venta'
                  CHECK (tipo IN ('venta','servicio','nota_entrega','presupuesto','egreso','cierre')),
  modulo_origen   text NOT NULL DEFAULT 'ventas_pos'
                  CHECK (modulo_origen IN ('ventas_pos','silenciadores','servicios','reportes','presupuestos','distribuidor')),
  referencia_id   uuid,
  referencia_tabla text,
  
  -- Datos del documento
  cliente         text NOT NULL DEFAULT 'Consumidor Final',
  vehiculo        text,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  moneda          text NOT NULL DEFAULT 'USD'
                  CHECK (moneda IN ('USD','VES','EUR')),
  tasa_cambio     numeric(12,2),
  total_bs        numeric(14,2),
  items           jsonb DEFAULT '[]'::jsonb,
  metodos_pago    jsonb,
  con_iva         boolean NOT NULL DEFAULT false,
  estado          text NOT NULL DEFAULT 'pagado'
                  CHECK (estado IN ('pagado','pendiente','anulado')),
  notas           text,
  
  -- Metadata
  sede_id         uuid,
  emitido_por     text NOT NULL DEFAULT 'Admin',
  fecha_emision   date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE facturas IS 'Registro centralizado de todas las facturas emitidas en el sistema Lycos Team';
COMMENT ON COLUMN facturas.correlativo IS 'Número correlativo único en formato FAC-YYYY-XXXX';
COMMENT ON COLUMN facturas.tipo IS 'Tipo de documento: venta, servicio, nota_entrega, presupuesto, egreso, cierre';
COMMENT ON COLUMN facturas.modulo_origen IS 'Módulo desde donde se emitió la factura';
COMMENT ON COLUMN facturas.referencia_id IS 'ID del registro original en la tabla de origen';

-- ──────────────────────────────────────────────────────────────
-- 2. ÍNDICES para búsqueda eficiente
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_facturas_correlativo     ON facturas(correlativo);
CREATE INDEX IF NOT EXISTS idx_facturas_tipo            ON facturas(tipo);
CREATE INDEX IF NOT EXISTS idx_facturas_modulo          ON facturas(modulo_origen);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente         ON facturas(cliente);
CREATE INDEX IF NOT EXISTS idx_facturas_estado          ON facturas(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha           ON facturas(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_sede            ON facturas(sede_id);
CREATE INDEX IF NOT EXISTS idx_facturas_created         ON facturas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_referencia      ON facturas(referencia_id);

-- Full text search index para búsqueda dinámica
CREATE INDEX IF NOT EXISTS idx_facturas_search 
  ON facturas USING gin(to_tsvector('spanish', coalesce(correlativo, '') || ' ' || coalesce(cliente, '') || ' ' || coalesce(notas, '')));

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIÓN: Generar número correlativo secuencial
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generar_correlativo_factura()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  anio text;
  nuevo_numero text;
  correlativo_num int;
BEGIN
  anio := EXTRACT(YEAR FROM now())::text;
  
  -- Obtener el máximo correlativo del año actual
  SELECT COALESCE(
    MAX(
      CAST(
        SPLIT_PART(f.correlativo, '-', 3) AS int
      )
    ), 0
  ) + 1
  INTO correlativo_num
  FROM facturas f
  WHERE f.correlativo LIKE 'FAC-' || anio || '-%';
  
  nuevo_numero := 'FAC-' || anio || '-' || LPAD(correlativo_num::text, 4, '0');
  
  -- Verificar unicidad (en caso de concurrencia)
  WHILE EXISTS (SELECT 1 FROM facturas WHERE correlativo = nuevo_numero) LOOP
    correlativo_num := correlativo_num + 1;
    nuevo_numero := 'FAC-' || anio || '-' || LPAD(correlativo_num::text, 4, '0');
  END LOOP;
  
  RETURN nuevo_numero;
END;
$$;

COMMENT ON FUNCTION generar_correlativo_factura() IS 'Genera el siguiente número correlativo FAC-YYYY-XXXX';

-- ──────────────────────────────────────────────────────────────
-- 4. TRIGGER: updated_at automático
-- ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_facturas_updated_at ON facturas;
CREATE TRIGGER trg_facturas_updated_at
  BEFORE UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users - full access" ON facturas
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Service role - full access" ON facturas
  FOR ALL USING (true);
