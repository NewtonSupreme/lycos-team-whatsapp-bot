-- ═══════════════════════════════════════════════════════════════════════
-- MÓDULO GANANCIAS — Lycos Team
-- Costo de fabricante en inventario + Notas de ganancia manuales
-- Descripción: Permite calcular la ganancia del distribuidor:
--              precio_venta (reventa a Lycos/talleres) − precio_fabricante (costo).
--              Las distribuciones (notas de entrega) generan ganancia automática;
--              las notas_ganancia son registros manuales adicionales.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Costo de fabricante en inventario
--    precio_usd  = precio de reventa (distribuidor → Lycos/talleres) [ya existe]
--    precio_fabricante = costo que se le paga al fabricante [NUEVO]
ALTER TABLE inventario
  ADD COLUMN IF NOT EXISTS precio_fabricante NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN inventario.precio_fabricante IS 'Costo de compra al fabricante en USD. La ganancia = precio_usd - precio_fabricante';

-- 2. Tabla notas_ganancia (registros manuales de ganancia)
CREATE TABLE IF NOT EXISTS notas_ganancia (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_nota     TEXT NOT NULL UNIQUE,          -- NG-YYYY-XXXX
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,

  -- A quién se le revende
  cliente         TEXT NOT NULL,                 -- 'Lycos San Antonio', 'Taller X', etc.

  -- Responsable
  responsable     TEXT NOT NULL,

  -- Items (JSONB array)
  items           JSONB NOT NULL DEFAULT '[]',
  -- Estructura de cada item:
  -- {
  --   "nombre": "Silenciador CL40",
  --   "codigo": "SKU-001",
  --   "cantidad": 5,
  --   "precio_fabricante": 18.00,   -- costo unitario
  --   "precio_venta": 25.00,        -- reventa unitaria
  --   "ganancia_unit": 7.00,
  --   "ganancia_total": 35.00
  -- }

  -- Totales calculados
  total_costo     NUMERIC(10,2) DEFAULT 0,       -- Σ precio_fabricante * cantidad
  total_venta     NUMERIC(10,2) DEFAULT 0,       -- Σ precio_venta * cantidad
  total_ganancia  NUMERIC(10,2) DEFAULT 0,       -- total_venta - total_costo

  observaciones   TEXT,

  -- Control de sede (para filtros withSedeFilter)
  sede_id         UUID,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_notas_ganancia_fecha       ON notas_ganancia(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_notas_ganancia_sede_id     ON notas_ganancia(sede_id);
CREATE INDEX IF NOT EXISTS idx_notas_ganancia_numero_nota ON notas_ganancia(numero_nota);

-- 4. Función para generar número de nota correlativo (NG-YYYY-XXXX)
CREATE OR REPLACE FUNCTION generar_numero_nota_ganancia()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  correlativo INT;
  nuevo_numero TEXT;
BEGIN
  anio := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COUNT(*) + 1
  INTO correlativo
  FROM notas_ganancia
  WHERE EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE);

  nuevo_numero := 'NG-' || anio || '-' || LPAD(correlativo::TEXT, 4, '0');

  WHILE EXISTS (SELECT 1 FROM notas_ganancia WHERE numero_nota = nuevo_numero) LOOP
    correlativo := correlativo + 1;
    nuevo_numero := 'NG-' || anio || '-' || LPAD(correlativo::TEXT, 4, '0');
  END LOOP;

  RETURN nuevo_numero;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION update_notas_ganancia_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notas_ganancia_updated_at ON notas_ganancia;
CREATE TRIGGER trg_notas_ganancia_updated_at
  BEFORE UPDATE ON notas_ganancia
  FOR EACH ROW EXECUTE FUNCTION update_notas_ganancia_updated_at();

-- 6. RLS — igual que el resto del sistema (permisiva)
ALTER TABLE notas_ganancia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notas_ganancia_all" ON notas_ganancia;
CREATE POLICY "notas_ganancia_all"
  ON notas_ganancia
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Comentarios
COMMENT ON TABLE notas_ganancia IS 'Registros manuales de ganancia (costo fabricante vs reventa). Las distribuciones generan ganancia automática aparte.';
COMMENT ON COLUMN notas_ganancia.numero_nota IS 'Número correlativo único en formato NG-YYYY-XXXX';
COMMENT ON COLUMN notas_ganancia.items IS 'Array JSONB con productos, costo, venta y ganancia por item';
