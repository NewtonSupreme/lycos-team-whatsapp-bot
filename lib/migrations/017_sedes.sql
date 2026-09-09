-- Datos reales de cada sucursal.
--
-- `sedes` solo tenía nombre y si era la principal, así que la pantalla de
-- Sucursales no podía gestionar nada: ni dirección, ni teléfono, ni desactivar
-- una sin borrarla.
--
-- `activo` importa más de lo que parece: en San Antonio cuelgan 518 servicios y
-- 1.210 clientes. Una sucursal que cierra se desactiva; borrarla se llevaría por
-- delante su historia.
alter table sedes
  add column if not exists direccion   text,
  add column if not exists telefono    text,
  add column if not exists email       text,
  add column if not exists rif         text,
  add column if not exists horario     text,
  add column if not exists activo      boolean not null default true,
  add column if not exists notas       text,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();

comment on column sedes.activo is
  'Una sucursal cerrada se desactiva, no se borra: su historial de servicios, '
  'ventas y clientes sigue colgando de ella.';

comment on column sedes.es_principal is
  'La sede por defecto del sistema. Solo puede haber una y no se puede borrar.';

-- Solo una principal. Un índice parcial lo garantiza sin estorbar al resto.
create unique index if not exists idx_sedes_una_principal
  on sedes (es_principal) where es_principal;

-- Los nombres no se repiten: dos "Principal" serían indistinguibles en el
-- selector de la barra superior.
create unique index if not exists idx_sedes_nombre on sedes (lower(nombre));
