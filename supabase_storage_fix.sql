-- 1. Asegurar que el bucket 'avatars' existe y es público
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Eliminar políticas antiguas para evitar conflictos
DROP POLICY IF EXISTS "Lectura pública de avatars" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida de avatars a anon" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de avatars a anon" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado de avatars a anon" ON storage.objects;

-- 3. Crear nuevas políticas para el rol 'public' (ya que no se usa Supabase Auth con JWT)
-- Nota: Esto permite que cualquier usuario con la URL del bucket pueda subir archivos. 
-- Es necesario para que funcione con tu sistema de login personalizado.

-- Permitir que cualquiera vea las fotos
CREATE POLICY "Lectura pública de avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Permitir subir fotos al bucket 'avatars'
CREATE POLICY "Permitir subida de avatars a anon"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'avatars' );

-- Permitir actualizar fotos en el bucket 'avatars'
CREATE POLICY "Permitir actualización de avatars a anon"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'avatars' );

-- Permitir borrar fotos en el bucket 'avatars'
CREATE POLICY "Permitir borrado de avatars a anon"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'avatars' );

-- 4. Políticas para la tabla de 'usuarios' (para actualizar la URL de la foto)
-- Esto asegura que el frontend pueda guardar la URL después de subir la imagen.

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios: Lectura pública" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios: Actualización pública" ON public.usuarios;

CREATE POLICY "Usuarios: Lectura pública"
ON public.usuarios FOR SELECT
TO public
USING ( true );

CREATE POLICY "Usuarios: Actualización pública"
ON public.usuarios FOR UPDATE
TO public
USING ( true )
WITH CHECK ( true );

-- 5. Agregar columna faltante a 'citas'
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS costo_estimado NUMERIC(10, 2);
