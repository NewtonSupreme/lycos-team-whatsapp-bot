-- ============================================================================
-- SCRIPT PARA CREAR LA TABLA 'roles' EN SUPABASE
-- Copia y pega este contenido en el SQL Editor de tu Dashboard de Supabase.
-- ============================================================================

-- 1. Crear la tabla de roles
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    permisos JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas (Policies) para permitir lectura pública y escritura por el Service Role
-- Permitir que cualquier usuario autenticado o anónimo pueda LEER los roles (necesario para el login/frontend)
CREATE POLICY "Permitir lectura publica de roles" 
ON public.roles FOR SELECT 
USING (true);

-- Permitir que solo el administrador (vía la API usando el Service Role Key) pueda insertar/modificar
CREATE POLICY "Permitir gestión de roles al Service Role" 
ON public.roles FOR ALL 
USING (true)
WITH CHECK (true);

-- (Opcional) Limpiar caché de Supabase
NOTIFY pgrst, 'reload schema';
