-- Migración: Agregar columnas faltantes a la tabla servicios
-- para que funcione con el módulo de Servicios del dashboard

-- 1. Agregar columnas denormalizadas (como en citas)
ALTER TABLE public.servicios 
  ADD COLUMN IF NOT EXISTS cliente_id UUID,
  ADD COLUMN IF NOT EXISTS nombre_cliente TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS vehiculo_info TEXT,
  ADD COLUMN IF NOT EXISTS placa TEXT,
  ADD COLUMN IF NOT EXISTS seguimiento JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fecha DATE,
  ADD COLUMN IF NOT EXISTS hora TIME;

-- 2. Cambiar el CHECK de estado para incluir los estados del UI
ALTER TABLE public.servicios 
  DROP CONSTRAINT IF EXISTS servicios_estado_check;

ALTER TABLE public.servicios 
  ADD CONSTRAINT servicios_estado_check 
  CHECK (estado IN ('pendiente', 'confirmada', 'en_proceso', 'completada', 'finalizado', 'cancelada', 'cancelado'));

-- 3. Cambiar el CHECK de tipo (mismos valores que antes)
ALTER TABLE public.servicios 
  DROP CONSTRAINT IF EXISTS servicios_tipo_check;

ALTER TABLE public.servicios 
  ADD CONSTRAINT servicios_tipo_check 
  CHECK (tipo IN ('mecanica', 'electronica', 'cerrajeria', 'diagnostico', 'motor', 'emergencia', 'otro'));

-- 4. Columna para tipos personalizados (dinámicos)
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS tipo_personalizado TEXT;

-- 5. Columna para registrar quién creó/registró el servicio o cita
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS registrado_por TEXT;

ALTER TABLE public.citas
  ADD COLUMN IF NOT EXISTS registrado_por TEXT;
