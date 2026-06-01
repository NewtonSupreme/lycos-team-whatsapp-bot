-- Agregar columnas de abono / estado pendiente a ventas_dia
ALTER TABLE ventas_dia ADD COLUMN IF NOT EXISTS tiene_abono boolean DEFAULT false;
ALTER TABLE ventas_dia ADD COLUMN IF NOT EXISTS abono numeric(12,2) DEFAULT 0;
ALTER TABLE ventas_dia ADD COLUMN IF NOT EXISTS saldo_pendiente numeric(12,2) DEFAULT 0;
ALTER TABLE ventas_dia ADD COLUMN IF NOT EXISTS estado text DEFAULT 'pagado' CHECK (estado IN ('pagado', 'pendiente'));
