-- ═══════════════════════════════════════════════════════════════════════════
-- 013_rrhh.sql — Recursos Humanos
--
-- Gestión de Empleados pasa a ser el módulo de RRHH: a la ficha del personal se
-- le agregan los datos laborales que faltaban y se abren las tablas de
-- asistencia, vacaciones, permisos, evaluaciones, capacitación, documentos y
-- reclutamiento.
--
-- Todo es aditivo: no toca ni borra ningún dato existente. El estado del
-- empleado (activo / vacaciones) se deriva de `usuarios.activo` y de si tiene
-- vacaciones aprobadas en curso, así que no se guarda por duplicado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ficha laboral ──────────────────────────────────────────────────────────
alter table public.usuarios add column if not exists fecha_ingreso    date;
alter table public.usuarios add column if not exists fecha_nacimiento date;
alter table public.usuarios add column if not exists cargo            text;
alter table public.usuarios add column if not exists area             text;
alter table public.usuarios add column if not exists tipo_contrato    text;

comment on column public.usuarios.fecha_ingreso  is 'Fecha de entrada a la empresa. Alimenta antigüedad y la columna Ingreso.';
comment on column public.usuarios.cargo          is 'Cargo real del puesto. El rol define permisos; el cargo, el puesto.';
comment on column public.usuarios.area           is 'Área o departamento: Taller, Atención al Cliente, Administración, Almacén, Gerencia.';

-- ── Asistencia ─────────────────────────────────────────────────────────────
create table if not exists public.rrhh_asistencia (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.usuarios(id) on delete cascade,
  fecha        date not null,
  estado       text not null default 'presente'
               check (estado in ('presente','tardanza','ausente','permiso','vacaciones')),
  hora_entrada time,
  hora_salida  time,
  nota         text,
  sede_id      uuid,
  registrado_por text,
  created_at   timestamptz not null default now(),
  -- Un empleado tiene un solo estado por día: volver a marcar corrige, no duplica.
  unique (empleado_id, fecha)
);

-- ── Vacaciones ─────────────────────────────────────────────────────────────
create table if not exists public.rrhh_vacaciones (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.usuarios(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin    date not null,
  dias         integer,
  estado       text not null default 'solicitada'
               check (estado in ('solicitada','aprobada','rechazada','disfrutada')),
  nota         text,
  aprobado_por text,
  sede_id      uuid,
  created_at   timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

-- ── Permisos ───────────────────────────────────────────────────────────────
create table if not exists public.rrhh_permisos (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.usuarios(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin    date not null,
  tipo         text not null default 'personal',
  motivo       text,
  remunerado   boolean not null default true,
  estado       text not null default 'solicitado'
               check (estado in ('solicitado','aprobado','rechazado')),
  aprobado_por text,
  sede_id      uuid,
  created_at   timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

-- ── Evaluaciones de desempeño ──────────────────────────────────────────────
create table if not exists public.rrhh_evaluaciones (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.usuarios(id) on delete cascade,
  fecha       date not null default current_date,
  -- Escala de 1 a 5, como la ficha del empleado.
  puntaje     numeric(3,2) not null check (puntaje >= 0 and puntaje <= 5),
  periodo     text,
  comentario  text,
  evaluador   text,
  sede_id     uuid,
  created_at  timestamptz not null default now()
);

-- ── Capacitación ───────────────────────────────────────────────────────────
create table if not exists public.rrhh_capacitaciones (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.usuarios(id) on delete cascade,
  titulo      text not null,
  fecha       date not null default current_date,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','en_curso','completado')),
  institucion text,
  nota        text,
  sede_id     uuid,
  created_at  timestamptz not null default now()
);

-- ── Documentos del empleado ────────────────────────────────────────────────
create table if not exists public.rrhh_documentos (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.usuarios(id) on delete cascade,
  tipo        text not null default 'otro',
  nombre      text not null,
  url         text,
  vence_el    date,
  sede_id     uuid,
  created_at  timestamptz not null default now()
);

-- ── Reclutamiento ──────────────────────────────────────────────────────────
create table if not exists public.rrhh_reclutamiento (
  id         uuid primary key default gen_random_uuid(),
  candidato  text not null,
  cargo      text,
  telefono   text,
  email      text,
  fuente     text,
  estado     text not null default 'recibido'
             check (estado in ('recibido','entrevista','prueba','contratado','descartado')),
  nota       text,
  sede_id    uuid,
  created_at timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────
create index if not exists idx_rrhh_asistencia_emp     on public.rrhh_asistencia (empleado_id, fecha desc);
create index if not exists idx_rrhh_asistencia_fecha   on public.rrhh_asistencia (fecha desc);
create index if not exists idx_rrhh_asistencia_sede    on public.rrhh_asistencia (sede_id);
create index if not exists idx_rrhh_vacaciones_emp     on public.rrhh_vacaciones (empleado_id, fecha_inicio desc);
create index if not exists idx_rrhh_vacaciones_rango   on public.rrhh_vacaciones (fecha_inicio, fecha_fin);
create index if not exists idx_rrhh_permisos_emp       on public.rrhh_permisos (empleado_id, fecha_inicio desc);
create index if not exists idx_rrhh_evaluaciones_emp   on public.rrhh_evaluaciones (empleado_id, fecha desc);
create index if not exists idx_rrhh_capacitaciones_emp on public.rrhh_capacitaciones (empleado_id, fecha desc);
create index if not exists idx_rrhh_documentos_emp     on public.rrhh_documentos (empleado_id);
create index if not exists idx_rrhh_reclutamiento_est  on public.rrhh_reclutamiento (estado, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Permisiva, igual que el resto del proyecto: la autorización real vive en la
-- capa de aplicación (`lib/auth-server.ts` → authorize('empleados', ...)).
do $$
declare t text;
begin
  foreach t in array array[
    'rrhh_asistencia','rrhh_vacaciones','rrhh_permisos','rrhh_evaluaciones',
    'rrhh_capacitaciones','rrhh_documentos','rrhh_reclutamiento'
  ] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "rrhh_read_%1$s"  on public.%1$s', t);
    execute format('drop policy if exists "rrhh_write_%1$s" on public.%1$s', t);
    execute format('create policy "rrhh_read_%1$s"  on public.%1$s for select using (true)', t);
    execute format('create policy "rrhh_write_%1$s" on public.%1$s for all using (true) with check (true)', t);
  end loop;
end $$;

-- ── Fecha de egreso ────────────────────────────────────────────────────────
-- La rotación necesita saber CUÁNDO salió alguien. Sin esta columna habría que
-- adivinarla desde `updated_at`, que cambia con cualquier edición y daba un
-- porcentaje inventado. La escribe la baja desde RRHH.
alter table public.usuarios add column if not exists fecha_egreso date;
comment on column public.usuarios.fecha_egreso is 'Fecha en que la persona dejó la empresa. Alimenta la rotación anual.';
