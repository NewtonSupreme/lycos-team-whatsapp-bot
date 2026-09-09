-- Configuración del sistema y rastro de accesos.
--
-- El panel de Configuración enseñaba interruptores de seguridad y una política
-- de contraseñas que no se guardaban en ninguna parte: al recargar volvían a su
-- valor por defecto. Y los "intentos fallidos" no existían como dato, así que
-- no había forma de mostrarlos sin inventarlos.

-- ── Ajustes ────────────────────────────────────────────────────────────────
-- Clave/valor con el valor en JSON, para no migrar la tabla cada vez que se
-- añade un ajuste. `sede_id` nulo = ajuste global del taller.
create table if not exists configuracion (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  valor jsonb not null default '{}'::jsonb,
  sede_id uuid references sedes(id) on delete cascade,
  actualizado_por text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint configuracion_clave_sede unique (clave, sede_id)
);

comment on table configuracion is
  'Ajustes del sistema en clave/valor. sede_id nulo = ajuste global.';

create index if not exists idx_configuracion_clave on configuracion (clave);

-- ── Intentos de acceso ─────────────────────────────────────────────────────
-- Se registran los fallidos Y los correctos: el "último acceso" de cada
-- usuario sale de aquí, y sin los correctos habría que deducirlo de la
-- actividad, que no es lo mismo (alguien puede entrar y no hacer nada).
create table if not exists intentos_acceso (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  exito boolean not null,
  motivo text,
  ip text,
  agente text,
  created_at timestamptz not null default now()
);

comment on table intentos_acceso is
  'Cada intento de inicio de sesión, correcto o fallido. Alimenta el último '
  'acceso por usuario y el contador de intentos fallidos del panel.';

create index if not exists idx_intentos_usuario on intentos_acceso (usuario, created_at desc);
create index if not exists idx_intentos_fecha on intentos_acceso (created_at desc);

-- RLS permisiva, igual que el resto del esquema: el acceso se controla en la
-- capa de la aplicación con el rol del operador.
alter table configuracion enable row level security;
alter table intentos_acceso enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'configuracion') then
    create policy configuracion_todo on configuracion for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'intentos_acceso') then
    create policy intentos_acceso_todo on intentos_acceso for all using (true) with check (true);
  end if;
end $$;
