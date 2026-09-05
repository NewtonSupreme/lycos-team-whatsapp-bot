-- Identificación completa del personal para el catálogo de empleados/nómina:
-- cédula (identidad), alias (nombre con el que aparece en las hojas de pago,
-- ej. "NELSON" = Margarito Carvajal) y foto (imagen de la cédula/carnet).
alter table public.usuarios add column if not exists cedula   text;
alter table public.usuarios add column if not exists alias    text;
alter table public.usuarios add column if not exists foto_url text;

create index if not exists idx_usuarios_cedula on public.usuarios(cedula);

notify pgrst, 'reload schema';
