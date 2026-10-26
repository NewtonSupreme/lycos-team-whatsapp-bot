-- ════════════════════════════════════════════════════════════════════════════
-- 026 · Correcciones para la Conciliación Bancaria
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Agrega comprobante_referencia y comprobante_url a la tabla egresos,
--    de forma consistente con lo que ya tienen ventas_dia, facturas y servicios.
-- 2. Amplía el CHECK de ventas_dia.estado para aceptar el valor 'conciliado',
--    que se asigna cuando la venta se registra directamente desde la conciliación
--    bancaria (garantiza trazabilidad del origen).
-- Idempotente: se puede correr varias veces sin error.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Comprobante en egresos ─────────────────────────────────────────────────
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS comprobante_referencia text;
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS comprobante_url        text;

-- ── 2. Estado «conciliado» en ventas_dia ─────────────────────────────────────
-- La restricción original fue creada por scripts/add_abono_ventas.sql con solo
-- ('pagado', 'pendiente'). La ampliamos para incluir 'conciliado' (origen
-- conciliación bancaria) de forma retrocompatible.
DO $$
BEGIN
  ALTER TABLE ventas_dia DROP CONSTRAINT IF EXISTS ventas_dia_estado_check;
  ALTER TABLE ventas_dia
    ADD CONSTRAINT ventas_dia_estado_check
      CHECK (estado IN ('pagado', 'pendiente', 'conciliado'));
EXCEPTION WHEN undefined_column THEN
  -- La columna estado aún no existe; add_abono_ventas.sql la creará después.
  NULL;
END $$;

-- ── 3. Índice para buscar ventas conciliadas por estado (útil en reportes) ───
CREATE INDEX IF NOT EXISTS ventas_dia_estado_idx ON ventas_dia (estado) WHERE estado IS NOT NULL;
