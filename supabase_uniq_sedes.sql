-- Solo agrega UNIQUE constraint para evitar futuros duplicados
ALTER TABLE sedes ADD CONSTRAINT IF NOT EXISTS sedes_nombre_unique UNIQUE (nombre);
