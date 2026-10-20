-- ─────────────────────────────────────────────────────────────────────────────
-- 025 · Cerrar la tabla de usuarios a la clave pública (2026-10-20)
--
-- La clave «anon» va dentro del JavaScript del navegador: cualquiera la puede
-- leer. Con ella se podía leer la columna de la contraseña de todos los
-- usuarios y ESCRIBIR en la tabla (por ejemplo, darse el rol de Usuario
-- Maestro o cambiar la clave de otro).
--
-- Desde el 2026-10-20 el sistema ya no escribe en `usuarios` ni en `roles`
-- desde el navegador (el perfil pasa por /api/auth/perfil) y las sesiones
-- solo las toca el servidor, así que se puede cerrar sin romper nada.
--
-- El servidor usa la service role: no le afecta.
-- Correr en Supabase › SQL Editor DESPUÉS de desplegar el código del 2026-10-20.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- usuarios: el navegador solo puede LEER, y nunca la contraseña.
revoke all on table public.usuarios from anon, authenticated;
grant select (
  id, username, nombre, email, rol, activo, created_at, updated_at, avatar_url, telefono, bio,
  sede_id, permisos, especialidad, cedula, alias, foto_url, fecha_ingreso, fecha_nacimiento,
  cargo, area, tipo_contrato, fecha_egreso
) on public.usuarios to anon, authenticated;

-- roles: se leen desde el navegador; solo el servidor los cambia.
revoke insert, update, delete on table public.roles from anon, authenticated;

-- sesiones e intentos de acceso: solo el servidor (traían usuarios, IP y equipo).
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.intentos_acceso from anon, authenticated;

commit;

-- Comprobación (debe dar error de permiso con la clave anon):
--   select password_hash from usuarios limit 1;
