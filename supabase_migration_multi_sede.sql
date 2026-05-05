-- Migración Multi-Sede (Versión Corregida)
-- 1. Crear tabla de sedes
CREATE TABLE IF NOT EXISTS sedes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  es_principal BOOLEAN DEFAULT false
);

-- 2. Insertar sedes iniciales
INSERT INTO sedes (nombre, es_principal) VALUES 
('San Antonio de los Altos', false),
('Principal (Carrizal)', true),
('El cementerio (Caracas)', false)
ON CONFLICT DO NOTHING;

-- 3. FUNCIÓN PARA AGREGAR SEDE_ID A TODAS LAS TABLAS Y A LOS USUARIOS
DO $$
DECLARE
  default_sede_id UUID;
  t TEXT;
  tables_to_update TEXT[] := ARRAY[
    'usuarios',
    'inventario', 'inventarios', 'productos', 'stock', 
    'clientes', 'vehiculos', 'servicios', 'citas',
    'ventas_silenciadores', 'ventas_dia', 'egresos',
    'conversaciones', 'mensajes_whatsapp', 'activity_log', 'logs_actividad'
  ];
BEGIN
  -- Obtener el ID de la sede por defecto
  SELECT id INTO default_sede_id FROM sedes WHERE nombre = 'San Antonio de los Altos' LIMIT 1;

  FOREACH t IN ARRAY tables_to_update
  LOOP
    -- Verificar si la tabla existe
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      -- Verificar si la columna NO existe
      IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = t AND column_name = 'sede_id'
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN sede_id UUID REFERENCES sedes(id)', t);
        EXECUTE format('UPDATE %I SET sede_id = %L WHERE sede_id IS NULL', t, default_sede_id);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN sede_id SET NOT NULL', t);
      END IF;
    END IF;
  END LOOP;
END $$;
