-- Fix: usuarios_rol_check constraint does not include new roles
-- The current constraint likely only allows: 'admin', 'empleado', 'cliente'
-- But the app now uses: admin, empleado, cliente, gerente, mecanico, mecanico_acceso, jefe_taller, jefe_taller_acceso

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'empleado', 'cliente', 'gerente', 'mecanico', 'mecanico_acceso', 'jefe_taller', 'jefe_taller_acceso'));
