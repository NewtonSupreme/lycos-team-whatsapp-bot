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
                  check (estado in ('confirmada','pendiente','cancelada','completada')),
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
  usuario_id  uuid references perfiles(id) on delete cascade,
  tipo        text not null check (tipo in ('info','success','warning','error')),
  titulo      text not null,
  mensaje     text not null,
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
-- DATOS DE EJEMPLO (seed)
-- ──────────────────────────────────────────────────────────────
insert into clientes (nombre, apellido, email, telefono, cedula, direccion) values
  ('Carlos',  'Rodríguez', 'carlos@gmail.com',     '+584121112233', 'V-12345678', 'Los Teques, Miranda'),
  ('María',   'González',  'maria.g@hotmail.com',  '+584142223344', 'V-18765432', 'Caracas, Miranda'),
  ('José',    'Martínez',  'jose.m@yahoo.com',     '+584163334455', 'V-20123456', 'Carrizal, Miranda'),
  ('Ana',     'López',     'ana.lopez@gmail.com',  '+584244445566', null,          null),
  ('Pedro',   'Herrera',   'pedro.h@gmail.com',    '+584265556677', 'V-15432109', 'San Antonio, Miranda')
on conflict do nothing;
