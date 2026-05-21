-- Actualizar la contraseña del usuario "jin" a lycos2026
UPDATE public.usuarios 
SET password_hash = 'lycos2026' 
WHERE username = 'jin' OR nombre ILIKE 'jin';
