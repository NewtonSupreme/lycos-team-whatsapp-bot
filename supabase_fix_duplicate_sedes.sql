-- Fix: Deduplicar sedes y usar UUIDs fijos en lugar de uuid_generate_v4()
-- Problema: Cada vez que se ejecutaban las migraciones, se insertaban nuevas filas
-- en la tabla sedes con nuevos UUIDs, dejando huérfanas las referencias en ventas_dia, etc.

-- 1. Eliminar duplicados: para cada nombre de sede, conservar la fila que MÁS referencias tenga
--    en las tablas FK. Si hay empate, conservar la que tenga el UUID más antiguo.
DO $$
DECLARE
  sede_record RECORD;
  best_id UUID;
  dup_id UUID;
  tables_with_sede TEXT[] := ARRAY[
    'usuarios', 'inventario', 'inventarios', 'productos', 'stock',
    'clientes', 'vehiculos', 'servicios', 'citas',
    'ventas_silenciadores', 'ventas_dia', 'egresos',
    'conversaciones', 'mensajes_whatsapp', 'activity_log', 'logs_actividad',
    'distribuciones', 'ai_conversations', 'inventario_papelera', 'presupuestos'
  ];
  t TEXT;
  ref_count INT;
  best_count INT;
BEGIN
  -- Iterar sobre cada nombre de sede (los que tienen duplicados)
  FOR sede_record IN (
    SELECT nombre FROM sedes GROUP BY nombre HAVING COUNT(*) > 1
  ) LOOP
    RAISE NOTICE 'Procesando duplicados: %', sede_record.nombre;

    -- Encontrar el UUID con más referencias totales entre todas las tablas FK
    best_id := NULL;
    best_count := -1;

    FOR dup_id IN (
      SELECT id FROM sedes WHERE nombre = sede_record.nombre
    ) LOOP
      ref_count := 0;
      FOREACH t IN ARRAY tables_with_sede
      LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
          IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'sede_id') THEN
            EXECUTE format('SELECT COUNT(*) FROM %I WHERE sede_id = %L', t, dup_id) INTO ref_count;
          END IF;
        END IF;
      END LOOP;

      IF ref_count > best_count OR (ref_count = best_count AND (best_id IS NULL OR dup_id < best_id)) THEN
        best_id := dup_id;
        best_count := ref_count;
      END IF;
    END LOOP;

    RAISE NOTICE '  UUID conservado: % (% referencias)', best_id, best_count;

    -- Actualizar todas las referencias FK al UUID conservado
    FOREACH t IN ARRAY tables_with_sede
    LOOP
      IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'sede_id') THEN
          EXECUTE format(
            'UPDATE %I SET sede_id = %L WHERE sede_id IN (SELECT id FROM sedes WHERE nombre = %L AND id != %L)',
            t, best_id, sede_record.nombre, best_id
          );
        END IF;
      END IF;
    END LOOP;

    -- Eliminar los UUIDs duplicados (todos menos el conservado)
    EXECUTE format(
      'DELETE FROM sedes WHERE nombre = %L AND id != %L',
      sede_record.nombre, best_id
    );

    RAISE NOTICE '  Duplicados eliminados. Queda UUID: %', best_id;
  END LOOP;
END $$;

-- 2. Agregar UNIQUE constraint en nombre para evitar futuros duplicados
ALTER TABLE sedes ADD CONSTRAINT sedes_nombre_unique UNIQUE (nombre);

-- 3. Actualizar UUIDs a valores FIJOS para que coincidan con .env.local
--    WHATSAPP_DEFAULT_SEDE_ID=310595c5-5258-47fa-9b69-5ad9932685a7 -> San Antonio
--    Los demás UUIDs son arbitrarios pero consistentes
--    IMPORTANTE: se usa una fila temporal para evitar violación de FK
DO $$
DECLARE
  tables_with_sede TEXT[] := ARRAY[
    'usuarios', 'inventario', 'inventarios', 'productos', 'stock',
    'clientes', 'vehiculos', 'servicios', 'citas',
    'ventas_silenciadores', 'ventas_dia', 'egresos',
    'conversaciones', 'mensajes_whatsapp', 'activity_log', 'logs_actividad',
    'distribuciones', 'ai_conversations', 'inventario_papelera', 'presupuestos'
  ];
  t TEXT;
  old_id UUID;
  sede_info RECORD;
BEGIN
  FOR sede_info IN VALUES
    ('San Antonio de los Altos', '310595c5-5258-47fa-9b69-5ad9932685a7', false),
    ('Principal (Carrizal)',      'b1a2b3c4-d5e6-4789-abc1-234567890def', true),
    ('El cementerio (Caracas)',   'c2b3c4d5-e6f7-4890-bcd2-345678901abc', false),
    ('Caracas El Paraíso',        'd3e4f5a6-b7c8-4901-cde3-456789012bcd', false)
  LOOP
    SELECT id INTO old_id FROM sedes WHERE nombre = sede_info.column1 LIMIT 1;

    -- Saltar si el UUID actual ya es el fijo
    IF old_id IS NULL OR old_id = sede_info.column2::uuid THEN
      CONTINUE;
    END IF;

    -- Saltar si el nuevo UUID ya existe (de una ejecución parcial anterior)
    IF EXISTS (SELECT 1 FROM sedes WHERE id = sede_info.column2::uuid) THEN
      RAISE NOTICE '  UUID % ya existe en sedes (de ejecución previa), saltando...', sede_info.column2;
      CONTINUE;
    END IF;

    RAISE NOTICE 'Migrando sede "%": UUID % -> %', sede_info.column1, old_id, sede_info.column2;

    -- 1) Insertar fila temporal con el nuevo UUID (el nombre se arregla después)
    --    Usamos un nombre temporal único que no choque con UNIQUE(nombre)
    INSERT INTO sedes (id, nombre, es_principal)
    VALUES (sede_info.column2::uuid, '_tmp_' || sede_info.column1, sede_info.column3::boolean);

    -- 2) Actualizar todas las FK al nuevo UUID
    FOREACH t IN ARRAY tables_with_sede
    LOOP
      IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'sede_id') THEN
          EXECUTE format('UPDATE %I SET sede_id = %L WHERE sede_id = %L', t, sede_info.column2, old_id);
        END IF;
      END IF;
    END LOOP;

    -- 3) Eliminar la fila vieja
    DELETE FROM sedes WHERE id = old_id;

    -- 4) Renombrar la fila temporal al nombre real
    UPDATE sedes SET nombre = sede_info.column1 WHERE id = sede_info.column2::uuid;

    RAISE NOTICE '  OK: UUID actualizado, % referencias migradas', array_length(tables_with_sede, 1);
  END LOOP;
END $$;

-- Limpiar cualquier temporal que haya quedado (por si algo falló)
DELETE FROM sedes WHERE nombre LIKE '_tmp_%';

-- Asegurar que la sede por defecto de WhatsApp sea la correcta
-- (WHATSAPP_DEFAULT_SEDE_ID en .env.local = '310595c5-5258-47fa-9b69-5ad9932685a7' para San Antonio)
SELECT id, nombre, es_principal FROM sedes ORDER BY nombre;
