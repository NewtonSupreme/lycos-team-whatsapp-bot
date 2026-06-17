-- Migración: 006_mejoras_notificaciones.sql
-- Descripción: Crea la tabla de notificaciones de forma global y persistente.

CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sede_id UUID REFERENCES sedes(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'info',
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    entidad_tipo TEXT,
    entidad_id UUID,
    leida BOOLEAN DEFAULT FALSE
);

-- Si la tabla ya existía pero no tenía estas columnas, intentamos agregarlas
-- (Esto no dará error si ya existen gracias a IF NOT EXISTS)
DO $$
BEGIN
    BEGIN
        ALTER TABLE notificaciones ADD COLUMN sede_id UUID REFERENCES sedes(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE notificaciones ADD COLUMN entidad_tipo TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE notificaciones ADD COLUMN entidad_id UUID;
    EXCEPTION WHEN duplicate_column THEN END;
END $$;

CREATE INDEX IF NOT EXISTS idx_notificaciones_sede ON notificaciones(sede_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created_at ON notificaciones(created_at DESC);
