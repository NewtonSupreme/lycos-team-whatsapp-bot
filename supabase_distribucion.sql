-- ═══════════════════════════════════════════════════════════════════════
-- MÓDULO DISTRIBUIDOR — Lycos Team
-- Tabla: distribuciones
-- Descripción: Registra distribuciones de inventario desde sede Carrizal
--              hacia otras sedes. Descuenta stock en origen automáticamente.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Crear tabla distribuciones
CREATE TABLE IF NOT EXISTS distribuciones (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_nota     TEXT NOT NULL UNIQUE,          -- ND-YYYY-XXXX
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Sedes
  sede_origen_id    UUID,                         -- Referencia a sedes
  sede_origen_nombre TEXT NOT NULL DEFAULT 'Carrizal',
  sede_destino_id   UUID,                         -- Referencia a sedes
  sede_destino_nombre TEXT NOT NULL,
  
  -- Responsables
  responsable     TEXT NOT NULL,                  -- Quién prepara/entrega
  recibe          TEXT,                           -- Quién recibe en destino
  
  -- Estado del envío
  estado          TEXT NOT NULL DEFAULT 'completado'
                  CHECK (estado IN ('pendiente', 'en_transito', 'completado', 'anulado')),
  
  -- Items distribuidos (JSONB array)
  items           JSONB NOT NULL DEFAULT '[]',
  -- Estructura de cada item:
  -- {
  --   "inventario_id": "uuid",
  --   "nombre": "Silenciador CL40",
  --   "codigo": "SKU-001",
  --   "categoria": "silenciador",
  --   "marca": "Kardoc",
  --   "cantidad": 5,
  --   "stock_antes": 20,
  --   "stock_despues": 15,
  --   "precio_usd": 25.00,
  --   "unidad": "unidad"
  -- }
  
  -- Totales calculados
  total_items     INTEGER DEFAULT 0,             -- Cantidad de productos distintos
  total_unidades  INTEGER DEFAULT 0,             -- Total de unidades enviadas
  valor_total_usd NUMERIC(10,2) DEFAULT 0,       -- Valor en USD
  
  -- Observaciones
  observaciones   TEXT,
  
  -- Control de sede (para filtros withSedeFilter)
  sede_id         UUID,                          -- = sede_origen_id
  
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_distribuciones_fecha        ON distribuciones(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_distribuciones_sede_id      ON distribuciones(sede_id);
CREATE INDEX IF NOT EXISTS idx_distribuciones_sede_destino ON distribuciones(sede_destino_id);
CREATE INDEX IF NOT EXISTS idx_distribuciones_estado       ON distribuciones(estado);
CREATE INDEX IF NOT EXISTS idx_distribuciones_numero_nota  ON distribuciones(numero_nota);

-- 3. Función para generar número de nota correlativo
CREATE OR REPLACE FUNCTION generar_numero_nota_distribucion()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  correlativo INT;
  nuevo_numero TEXT;
BEGIN
  anio := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COUNT(*) + 1
  INTO correlativo
  FROM distribuciones
  WHERE EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  nuevo_numero := 'ND-' || anio || '-' || LPAD(correlativo::TEXT, 4, '0');
  
  -- Verificar que no exista (por concurrencia)
  WHILE EXISTS (SELECT 1 FROM distribuciones WHERE numero_nota = nuevo_numero) LOOP
    correlativo := correlativo + 1;
    nuevo_numero := 'ND-' || anio || '-' || LPAD(correlativo::TEXT, 4, '0');
  END LOOP;
  
  RETURN nuevo_numero;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_distribuciones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_distribuciones_updated_at
  BEFORE UPDATE ON distribuciones
  FOR EACH ROW EXECUTE FUNCTION update_distribuciones_updated_at();

-- 5. RLS (Row Level Security) — Igual que el resto del sistema
ALTER TABLE distribuciones ENABLE ROW LEVEL SECURITY;

-- Eliminar política anterior si existe
DROP POLICY IF EXISTS "distribuciones_all_authenticated" ON distribuciones;
DROP POLICY IF EXISTS "distribuciones_all_anon" ON distribuciones;
DROP POLICY IF EXISTS "distribuciones_select" ON distribuciones;
DROP POLICY IF EXISTS "distribuciones_insert" ON distribuciones;
DROP POLICY IF EXISTS "distribuciones_update" ON distribuciones;
DROP POLICY IF EXISTS "distribuciones_delete" ON distribuciones;

-- Política permisiva para todos los roles (igual que otras tablas del sistema)
CREATE POLICY "distribuciones_all"
  ON distribuciones
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Comentarios de tabla
COMMENT ON TABLE distribuciones IS 'Registra distribuciones de inventario desde sede Carrizal hacia otras sedes';
COMMENT ON COLUMN distribuciones.numero_nota IS 'Número correlativo único en formato ND-YYYY-XXXX';
COMMENT ON COLUMN distribuciones.items IS 'Array JSONB con los productos distribuidos, cantidades y stocks';
COMMENT ON COLUMN distribuciones.sede_id IS 'Igual a sede_origen_id — usado para filtros withSedeFilter';
