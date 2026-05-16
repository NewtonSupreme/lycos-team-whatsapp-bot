-- ============================================================
--  LYCOS TEAM — Migración: Tabla Inventario Papelera
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- TABLA INVENTARIO_PAPELERA
-- ──────────────────────────────────────────────────────────────
create table if not exists inventario_papelera (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  codigo          text,
  categoria       text not null default 'general',
  marca           text,
  descripcion     text,
  precio_usd      numeric(10,2),
  precio_bs       numeric(14,2),
  stock           int not null default 0,
  stock_minimo    int not null default 1,
  unidad          text not null default 'unidad',
  notas           text,
  ubicacion       text,
  clasificacion   text,
  orden           int,
  eliminado_por   text,
  motivo_eliminacion text,
  fecha_eliminacion timestamptz not null default now(),
  sede_id         uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_inventario_papelera_fecha on inventario_papelera(fecha_eliminacion);
create index if not exists idx_inventario_papelera_categoria on inventario_papelera(categoria);
create index if not exists idx_inventario_papelera_sede on inventario_papelera(sede_id);

-- Trigger updated_at
drop trigger if exists trg_inventario_papelera_updated_at on inventario_papelera;
create trigger trg_inventario_papelera_updated_at
  before update on inventario_papelera
  for each row execute function set_updated_at();

-- RLS
alter table inventario_papelera enable row level security;

-- Politica para usuarios autenticados
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'inventario_papelera'
    and policyname = 'Authenticated users - full access'
  ) then
    execute 'create policy "Authenticated users - full access" on inventario_papelera
      for all using (auth.role() = ''authenticated'')';
  end if;
end $$;

-- Politica para service_role
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'inventario_papelera'
    and policyname = 'Service role - full access'
  ) then
    execute 'create policy "Service role - full access" on inventario_papelera
      for all using (true)';
  end if;
end $$;