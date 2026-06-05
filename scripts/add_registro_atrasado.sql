-- Agregar columnas de registro atrasado a ventas_dia
ALTER TABLE ventas_dia ADD COLUMN IF NOT EXISTS registro_atrasado boolean DEFAULT false;
ALTER TABLE ventas_dia ADD COLUMN IF NOT EXISTS fecha_registro timestamptz DEFAULT now();

-- Agregar columnas de registro atrasado a ventas_silenciadores
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS registro_atrasado boolean DEFAULT false;
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS fecha_registro timestamptz DEFAULT now();
