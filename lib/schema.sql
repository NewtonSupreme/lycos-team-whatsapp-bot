-- ============================================================
--  LYCOS TEAM — Base de datos completa (Supabase PostgreSQL)
--  Autor: Leandro Márquez
-- ============================================================

-- Extensiones
create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- 1. PERFILES / USUARIOS
-- ──────────────────────────────────────────────────────────────
create table if not exists perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  email        text not null,
  rol          text not null default 'empleado' check (rol in ('admin','empleado','cliente')),
  telefono     text,
  avatar_url   text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- 2. CLIENTES
-- ──────────────────────────────────────────────────────────────
create table if not exists clientes (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  apellido     text not null,
  email        text,
  telefono     text not null,
  cedula       text,
  direccion    text,
  notas        text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_clientes_telefono on clientes(telefono);
create index if not exists idx_clientes_email    on clientes(email);

-- ──────────────────────────────────────────────────────────────
-- 3. VEHÍCULOS
-- ──────────────────────────────────────────────────────────────
create table if not exists vehiculos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  marca        text not null,
  modelo       text not null,
  anio         int  not null check (anio >= 1950 and anio <= 2030),
  placa        text not null,
  color        text,
  kilometraje  int  default 0,
  vin          text,
  estado       text not null default 'activo'
               check (estado in ('activo','en_servicio','listo','inactivo')),
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists idx_vehiculos_placa on vehiculos(placa);
create index        if not exists idx_vehiculos_cliente on vehiculos(cliente_id);

-- ──────────────────────────────────────────────────────────────
-- 4. SERVICIOS
-- ──────────────────────────────────────────────────────────────
create table if not exists servicios (
  id              uuid primary key default gen_random_uuid(),
  vehiculo_id     uuid not null references vehiculos(id) on delete cascade,
  tecnico_id      uuid references perfiles(id),
  tipo            text not null
                  check (tipo in ('mecanica','electronica','cerrajeria','diagnostico','motor','emergencia','otro')),
  descripcion     text not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','en_proceso','finalizado','cancelado')),
  costo_estimado  numeric(10,2),
  costo_final     numeric(10,2),
  fecha_inicio    timestamptz,
  fecha_fin       timestamptz,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_servicios_vehiculo on servicios(vehiculo_id);
create index if not exists idx_servicios_estado   on servicios(estado);
create index if not exists idx_servicios_tipo     on servicios(tipo);

-- ──────────────────────────────────────────────────────────────
-- 5. CITAS / AGENDA
-- ──────────────────────────────────────────────────────────────
create table if not exists citas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  vehiculo_id     uuid not null references vehiculos(id) on delete cascade,
  fecha           date not null,
  hora            time not null,
  tipo_servicio   text not null
                  check (tipo_servicio in ('mecanica','electronica','cerrajeria','diagnostico','motor','emergencia','otro')),
  descripcion     text,
  estado          text not null default 'pendiente'
                  check (estado in ('confirmada','pendiente','cancelada','completada','ocupado','en_proceso')),
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_citas_fecha    on citas(fecha);
create index if not exists idx_citas_cliente  on citas(cliente_id);
create index if not exists idx_citas_estado   on citas(estado);

-- ──────────────────────────────────────────────────────────────
-- 6. MENSAJES WHATSAPP
-- ──────────────────────────────────────────────────────────────
create table if not exists mensajes_whatsapp (
  id              uuid primary key default gen_random_uuid(),
  from_number     text not null,
  to_number       text not null,
  body            text not null,
  tipo            text not null check (tipo in ('entrante','saliente')),
  estado          text not null default 'enviado'
                  check (estado in ('enviado','entregado','leido','error')),
  es_ia           boolean not null default false,
  wa_message_id   text unique,
  media_url       text,
  media_type      text,
  cliente_id      uuid references clientes(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_mensajes_from    on mensajes_whatsapp(from_number);
create index if not exists idx_mensajes_created on mensajes_whatsapp(created_at desc);

-- ──────────────────────────────────────────────────────────────
-- 7. CONVERSACIONES (resumen por contacto)
-- ──────────────────────────────────────────────────────────────
create table if not exists conversaciones (
  id                   uuid primary key default gen_random_uuid(),
  telefono             text not null unique,
  cliente_id           uuid references clientes(id),
  ultimo_mensaje       text,
  ultimo_mensaje_at    timestamptz default now(),
  mensajes_sin_leer    int not null default 0,
  estado               text not null default 'bot'
                       check (estado in ('activa','cerrada','bot','humano')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_conv_updated on conversaciones(updated_at desc);

-- ──────────────────────────────────────────────────────────────
-- 8. LOG DE ACTIVIDAD
-- ──────────────────────────────────────────────────────────────
create table if not exists activity_log (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null,
  accion      text not null,
  modulo      text not null,
  detalles    text,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_log_created on activity_log(created_at desc);
create index if not exists idx_log_modulo  on activity_log(modulo);

-- ──────────────────────────────────────────────────────────────
-- 9. NOTIFICACIONES
-- ──────────────────────────────────────────────────────────────
create table if not exists notificaciones (
  id          uuid primary key default gen_random_uuid(),
  sede_id     uuid references sedes(id) on delete cascade,
  usuario_id  uuid references perfiles(id) on delete cascade,
  tipo        text not null check (tipo in ('info','success','warning','error')),
  titulo      text not null,
  mensaje     text not null,
  entidad_tipo text,
  entidad_id  uuid,
  leida       boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notif_usuario on notificaciones(usuario_id);

-- ──────────────────────────────────────────────────────────────
-- 10. DIAGNÓSTICOS / REPORTES TÉCNICOS
-- ──────────────────────────────────────────────────────────────
create table if not exists diagnosticos (
  id              uuid primary key default gen_random_uuid(),
  servicio_id     uuid not null references servicios(id) on delete cascade,
  vehiculo_id     uuid not null references vehiculos(id),
  tecnico_id      uuid references perfiles(id),
  descripcion     text not null,
  codigo_obd      text,
  recomendaciones text,
  presupuesto     numeric(10,2),
  archivos        text[],  -- URLs de imágenes/documentos
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- TRIGGERS: updated_at automático
-- ──────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare
  t text;
begin
  foreach t in array array['clientes','vehiculos','servicios','citas','conversaciones','perfiles']
  loop
    execute format(
      'drop trigger if exists trg_%s_updated_at on %s;
       create trigger trg_%s_updated_at
       before update on %s
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ──────────────────────────────────────────────────────────────
alter table clientes          enable row level security;
alter table vehiculos         enable row level security;
alter table servicios         enable row level security;
alter table citas             enable row level security;
alter table mensajes_whatsapp enable row level security;
alter table conversaciones    enable row level security;
alter table activity_log      enable row level security;
alter table notificaciones    enable row level security;

-- Políticas: solo usuarios autenticados ven todo (ajusta según roles)
create policy "Authenticated users - full access" on clientes
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users - full access" on vehiculos
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users - full access" on servicios
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users - full access" on citas
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users - full access" on mensajes_whatsapp
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users - full access" on conversaciones
  for all using (auth.role() = 'authenticated');

create policy "Service role - full access" on activity_log
  for all using (true);

create policy "Authenticated users - own notifs" on notificaciones
  for all using (auth.uid() = usuario_id);

-- ──────────────────────────────────────────────────────────────
-- 11. INVENTARIO DE REPUESTOS Y PRODUCTOS
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

-- Trigger updated_at para inventario
drop trigger if exists trg_inventario_updated_at on inventario;
create trigger trg_inventario_updated_at
  before update on inventario
  for each row execute function set_updated_at();

alter table inventario enable row level security;
create policy "Authenticated users - full access" on inventario
  for all using (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────
-- DATOS DE EJEMPLO (seed)
-- ──────────────────────────────────────────────────────────────
insert into clientes (nombre, apellido, email, telefono, cedula, direccion) values
  ('Carlos',  'Rodríguez', 'carlos@gmail.com',     '+584121112233', 'V-12345678', 'Los Teques, Miranda'),
  ('María',   'González',  'maria.g@hotmail.com',  '+584142223344', 'V-18765432', 'Caracas, Miranda'),
  ('José',    'Martínez',  'jose.m@yahoo.com',     '+584163334455', 'V-20123456', 'Carrizal, Miranda'),
  ('Ana',     'López',     'ana.lopez@gmail.com',  '+584244445566', null,          null),
  ('Pedro',   'Herrera',   'pedro.h@gmail.com',    '+584265556677', 'V-15432109', 'San Antonio, Miranda')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- INVENTARIO SEED — Líquidos, Filtros, Silenciadores, etc.
-- ──────────────────────────────────────────────────────────────

-- LÍQUIDOS (Dr Care)
insert into inventario (nombre, codigo, categoria, marca, stock, unidad) values
  ('Refrigerante Rojo Dr Care - Galón',          'REFR-ROJO-GAL',   'liquido',         'Dr Care', 4,  'galón'),
  ('Refrigerante Verde Dr Care - Galón',         'REFR-VERDE-GAL',  'liquido',         'Dr Care', 4,  'galón'),
  ('Líquido Limpia Parabrisas Dr Care - Galón',  'LIMPIA-PAR-GAL',  'liquido',         'Dr Care', 4,  'galón'),
  ('Liga de Frenos DOT 3 Dr Care - 945ml',       'DOT3-945ML',      'frenos',          'Dr Care', 6,  'unidad')
on conflict do nothing;

-- FILTROS DE ACEITE (Cardoc)
insert into inventario (nombre, codigo, categoria, marca, stock, unidad, notas) values
  ('Filtro de Aceite CD 3614 Arauca',    'CD-3614',  'filtro_aceite', 'Cardoc', 6, 'unidad', 'Arauca'),
  ('Filtro de Aceite CD 47 Aveo',        'CD-47',    'filtro_aceite', 'Cardoc', 6, 'unidad', 'Aveo'),
  ('Filtro de Aceite CD 4967 Corolla',   'CD-4967',  'filtro_aceite', 'Cardoc', 6, 'unidad', 'Corolla'),
  ('Filtro de Aceite CD 2C Explorer',    'CD-2C',    'filtro_aceite', 'Cardoc', 2, 'unidad', 'Explorer'),
  ('Filtro de Aceite CD 8 Ford',         'CD-8',     'filtro_aceite', 'Cardoc', 2, 'unidad', 'Ford'),
  ('Filtro de Aceite CD 5885 Twingo',    'CD-5885',  'filtro_aceite', 'Cardoc', 2, 'unidad', 'Twingo'),
  ('Filtro de Aceite CD 3682 Nissan',    'CD-3682',  'filtro_aceite', 'Cardoc', 2, 'unidad', 'Nissan'),
  ('Filtro de Aceite CD 3506 Cavalier',  'CD-3506',  'filtro_aceite', 'Cardoc', 2, 'unidad', 'Cavalier'),
  ('Filtro de Aceite CD 96796 Camry',    'CD-96796', 'filtro_aceite', 'Cardoc', 2, 'unidad', 'Camry')
on conflict do nothing;

-- FILTROS DE GASOLINA (Cardoc)
insert into inventario (nombre, codigo, categoria, marca, stock, unidad, notas) values
  ('Filtro de Gasolina CF 5450 Corolla',          'CF-5450',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Corolla'),
  ('Filtro de Gasolina CF 6020 Macho CA.',        'CF-6020',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Macho CA.'),
  ('Filtro de Gasolina CF 6030 Samuray',          'CF-6030',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Samuray'),
  ('Filtro de Gasolina CF 6040 4.5 Inyec.',       'CF-6040',  'filtro_gasolina', 'Cardoc', 3, 'unidad', '4.5 Inyección'),
  ('Filtro de Gasolina CF 831 Trail Blazer',      'CF-831',   'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Trail Blazer'),
  ('Filtro de Gasolina CF 580 Blazer',            'CF-580',   'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Blazer'),
  ('Filtro de Gasolina CF 1036 Explorer',         'CF-1036',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Explorer'),
  ('Filtro de Gasolina CF 3442 Lancer CA.',       'CF-3442',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Lancer CA.'),
  ('Filtro de Gasolina CF 1586 Cherokee',         'CF-1586',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Cherokee'),
  ('Filtro de Gasolina CF 5237 Sentra',           'CF-5237',  'filtro_gasolina', 'Cardoc', 3, 'unidad', 'Sentra')
on conflict do nothing;

-- SILENCIADORES (Almacén)
insert into inventario (nombre, codigo, categoria, precio_usd, stock, unidad) values
  ('Silenciador CL30 (hasta 1.3L)',   'CL30',   'silenciador', 40.00, 6,  'unidad'),
  ('Silenciador CL60 (3.8L+)',        'CL60',   'silenciador', 90.00, 11, 'unidad'),
  ('Silenciador CL40 (hasta 1.5L)',   'CL40',   'silenciador', 50.00, 32, 'unidad'),
  ('Silenciador CL27 (hasta 1.3L)',   'CL27',   'silenciador', 40.00, 5,  'unidad'),
  ('Silenciador CLH40 (1.6-3.7L)',    'CLH40',  'silenciador', 60.00, 5,  'unidad'),
  ('Silenciador CLK60',               'CLK60',  'silenciador', 90.00, 3,  'unidad'),
  ('Silenciador CLP60',               'CLP60',  'silenciador', 90.00, 2,  'unidad'),
  ('Silenciador CLC60 (Camión)',       'CLC60',  'silenciador', 90.00, 3,  'unidad')
on conflict do nothing;

-- RESONADORES
insert into inventario (nombre, codigo, categoria, precio_usd, stock, unidad) values
  ('Resonador',  'RESONADOR', 'resonador', 40.00, 7, 'unidad')
on conflict do nothing;

-- COLAS CROMADAS
insert into inventario (nombre, codigo, categoria, stock, unidad) values
  ('Cola Cromada B55',       'COLA-B55',      'cola_cromada', 5, 'unidad'),
  ('Cola Cromada Curba',     'COLA-CURBA',    'cola_cromada', 2, 'unidad'),
  ('Cola Cromada Camioneta', 'COLA-CAMION',   'cola_cromada', 3, 'unidad')
on conflict do nothing;

-- FLEXIBLES
insert into inventario (nombre, codigo, categoria, precio_usd, stock, unidad) values
  ('Flexible 2x4',   'FLEX-2X4',   'flexible', 40.00, 2,  'unidad'),
  ('Flexible 2x6',   'FLEX-2X6',   'flexible', 40.00, 19, 'unidad'),
  ('Flexible 2x8',   'FLEX-2X8',   'flexible', 40.00, 3,  'unidad'),
  ('Flexible 1 3/4', 'FLEX-1-3/4', 'flexible', 40.00, 10, 'unidad')
on conflict do nothing;
