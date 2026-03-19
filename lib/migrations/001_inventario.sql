-- ============================================================
--  LYCOS TEAM — Migración: Tabla Inventario + Seed
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- TABLA INVENTARIO
-- ──────────────────────────────────────────────────────────────
create table if not exists inventario (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  codigo       text,
  categoria    text not null default 'general'
               check (categoria in (
                 'silenciador','resonador','cola_cromada','flexible',
                 'filtro_aceite','filtro_gasolina','liquido','frenos',
                 'electrico','otro','general'
               )),
  marca        text,
  descripcion  text,
  precio_usd   numeric(10,2),
  precio_bs    numeric(14,2),
  stock        int not null default 0,
  stock_minimo int not null default 1,
  unidad       text not null default 'unidad',
  notas        text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_inventario_categoria on inventario(categoria);
create index if not exists idx_inventario_activo    on inventario(activo);
create index if not exists idx_inventario_codigo    on inventario(codigo);

-- Trigger updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventario_updated_at on inventario;
create trigger trg_inventario_updated_at
  before update on inventario
  for each row execute function set_updated_at();

-- RLS
alter table inventario enable row level security;

-- Politica para usuarios autenticados
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'inventario'
    and policyname = 'Authenticated users - full access'
  ) then
    execute 'create policy "Authenticated users - full access" on inventario
      for all using (auth.role() = ''authenticated'')';
  end if;
end $$;

-- Politica para service_role (acceso total, necesario para el webhook con anon key)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'inventario'
    and policyname = 'Service role - full access'
  ) then
    execute 'create policy "Service role - full access" on inventario
      for all using (true)';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- SEED: LIQUIDOS (Dr Care)
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, marca, stock, unidad) values
  ('Refrigerante Rojo Dr Care - Galon',         'REFR-ROJO-GAL',  'liquido', 'Dr Care', 4, 'galon'),
  ('Refrigerante Verde Dr Care - Galon',        'REFR-VERDE-GAL', 'liquido', 'Dr Care', 4, 'galon'),
  ('Liquido Limpia Parabrisas Dr Care - Galon', 'LIMPIA-PAR-GAL', 'liquido', 'Dr Care', 4, 'galon'),
  ('Liga de Frenos DOT 3 Dr Care - 945ml',      'DOT3-945ML',     'frenos',  'Dr Care', 6, 'unidad')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- SEED: FILTROS DE ACEITE (Cardoc)
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, marca, stock, unidad, notas) values
  ('Filtro de Aceite CD 3614 Arauca',   'CD-3614',  'filtro_aceite', 'Cardoc', 6, 'unidad', 'Arauca'),
  ('Filtro de Aceite CD 47 Aveo',       'CD-47',    'filtro_aceite', 'Cardoc', 6, 'unidad', 'Aveo'),
  ('Filtro de Aceite CD 4967 Corolla',  'CD-4967',  'filtro_aceite', 'Cardoc', 6, 'unidad', 'Corolla'),
  ('Filtro de Aceite CD 2C Explorer',   'CD-2C',    'filtro_aceite', 'Cardoc', 2, 'unidad', 'Explorer'),
  ('Filtro de Aceite CD 8 Ford',        'CD-8',     'filtro_aceite', 'Cardoc', 2, 'unidad', 'Ford'),
  ('Filtro de Aceite CD 5885 Twingo',   'CD-5885',  'filtro_aceite', 'Cardoc', 2, 'unidad', 'Twingo'),
  ('Filtro de Aceite CD 3682 Nissan',   'CD-3682',  'filtro_aceite', 'Cardoc', 2, 'unidad', 'Nissan'),
  ('Filtro de Aceite CD 3506 Cavalier', 'CD-3506',  'filtro_aceite', 'Cardoc', 2, 'unidad', 'Cavalier'),
  ('Filtro de Aceite CD 96796 Camry',   'CD-96796', 'filtro_aceite', 'Cardoc', 2, 'unidad', 'Camry')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- SEED: FILTROS DE GASOLINA (Cardoc)
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, marca, stock, unidad, notas) values
  ('Filtro de Gasolina CF 5450 Corolla',     'CF-5450', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Corolla'),
  ('Filtro de Gasolina CF 6020 Macho CA.',   'CF-6020', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Macho CA.'),
  ('Filtro de Gasolina CF 6030 Samuray',     'CF-6030', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Samuray'),
  ('Filtro de Gasolina CF 6040 4.5 Inyec.',  'CF-6040', 'filtro_gasolina', 'Cardoc', 3, 'unidad', '4.5 Inyeccion'),
  ('Filtro de Gasolina CF 831 Trail Blazer', 'CF-831',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Trail Blazer'),
  ('Filtro de Gasolina CF 580 Blazer',       'CF-580',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Blazer'),
  ('Filtro de Gasolina CF 1036 Explorer',    'CF-1036', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Explorer'),
  ('Filtro de Gasolina CF 3442 Lancer CA.',  'CF-3442', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Lancer CA.'),
  ('Filtro de Gasolina CF 1586 Cherokee',    'CF-1586', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Cherokee'),
  ('Filtro de Gasolina CF 5237 Sentra',      'CF-5237', 'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Sentra')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- SEED: SILENCIADORES (Almacen)
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, precio_usd, stock, unidad) values
  ('Silenciador CL30 (hasta 1.3L)',  'CL30',  'silenciador', 40.00, 6,  'unidad'),
  ('Silenciador CL60 (3.8L+)',       'CL60',  'silenciador', 90.00, 11, 'unidad'),
  ('Silenciador CL40 (hasta 1.5L)',  'CL40',  'silenciador', 50.00, 32, 'unidad'),
  ('Silenciador CL27 (hasta 1.3L)',  'CL27',  'silenciador', 40.00, 5,  'unidad'),
  ('Silenciador CLH40 (1.6-3.7L)',   'CLH40', 'silenciador', 60.00, 5,  'unidad'),
  ('Silenciador CLK60',              'CLK60', 'silenciador', 90.00, 3,  'unidad'),
  ('Silenciador CLP60',              'CLP60', 'silenciador', 90.00, 2,  'unidad'),
  ('Silenciador CLC60 (Camion)',      'CLC60', 'silenciador', 90.00, 3,  'unidad')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- SEED: RESONADORES
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, precio_usd, stock, unidad) values
  ('Resonador', 'RESONADOR', 'resonador', 40.00, 7, 'unidad')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- SEED: COLAS CROMADAS
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, stock, unidad) values
  ('Cola Cromada B55',       'COLA-B55',    'cola_cromada', 5, 'unidad'),
  ('Cola Cromada Curba',     'COLA-CURBA',  'cola_cromada', 2, 'unidad'),
  ('Cola Cromada Camioneta', 'COLA-CAMION', 'cola_cromada', 3, 'unidad')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- SEED: FLEXIBLES
-- ──────────────────────────────────────────────────────────────
insert into inventario (nombre, codigo, categoria, precio_usd, stock, unidad) values
  ('Flexible 2x4',   'FLEX-2X4',    'flexible', 40.00, 2,  'unidad'),
  ('Flexible 2x6',   'FLEX-2X6',    'flexible', 40.00, 19, 'unidad'),
  ('Flexible 2x8',   'FLEX-2X8',    'flexible', 40.00, 3,  'unidad'),
  ('Flexible 1 3/4', 'FLEX-1-3-4',  'flexible', 40.00, 10, 'unidad')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- VERIFICACION: Ver todo el inventario insertado
-- ──────────────────────────────────────────────────────────────
-- select categoria, nombre, codigo, stock, precio_usd
-- from inventario
-- order by categoria, nombre;
