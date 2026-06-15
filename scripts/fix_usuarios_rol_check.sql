-- Fix: usuarios_rol_check constraint blocked valid/custom roles
--
-- The app supports admin-created custom roles (public.roles table + POST /api/roles)
-- in addition to the built-in roles: admin, gerente, empleado, mecanico,
-- mecanico_acceso, jefe_taller, jefe_taller_acceso, atencion_cliente.
--
-- A fixed CHECK constraint can never include future custom roles and was missing
-- 'atencion_cliente', causing:
--   ERROR: new row for relation "usuarios" violates check constraint "usuarios_rol_check"
-- when creating/editing employees.
--
-- Role validity is governed by the application layer and the public.roles table,
-- so we drop the constraint entirely instead of re-listing a fixed set.

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
