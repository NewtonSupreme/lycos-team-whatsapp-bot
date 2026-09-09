-- ═══════════════════════════════════════════════════════════════════════════
-- 014_ficha_vehiculo.sql — Ficha del vehículo, proveedores y cuentas por pagar
--
-- Nace de lo que pidió administración: poder abrir un vehículo y ver, renglón
-- por renglón, qué se le cobra al cliente y qué costó, para no dejar plata en
-- la mesa. Y por cada repuesto: si lo trajo el cliente o lo compramos, a quién
-- se lo compramos, y si ya se pagó o todavía se le debe al proveedor —que es
-- justo donde se estaban perdiendo.
--
-- Es la versión en base de datos de la hoja que hoy se escribe a mano:
--   MANGUERA PURIFICADOR   60$ ── 70$
--   BUJÍA (JUAN)           30$ ── 45$
-- costo a la izquierda, precio al cliente a la derecha, proveedor entre
-- paréntesis. Aditivo: no toca ventas, egresos ni servicios.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Proveedores ────────────────────────────────────────────────────────────
create table if not exists public.proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  contacto   text,
  telefono   text,
  email      text,
  enlace     text,
  rif        text,
  direccion  text,
  notas      text,
  activo     boolean not null default true,
  sede_id    uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_proveedores_nombre
  on public.proveedores (lower(nombre), coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Partidas del vehículo ──────────────────────────────────────────────────
create table if not exists public.vehiculo_partidas (
  id             uuid primary key default gen_random_uuid(),

  -- A quién pertenece el renglón. La placa se guarda desnormalizada porque es
  -- lo que la gente busca y escribe, aunque el vehículo aún no esté registrado.
  vehiculo_id    uuid references public.vehiculos(id) on delete set null,
  placa          text,
  vehiculo_info  text,
  cliente_id     uuid,
  cliente_nombre text,
  servicio_id    uuid,

  fecha          date not null default current_date,
  descripcion    text not null,
  tipo           text not null default 'repuesto'
                 check (tipo in ('repuesto','mano_obra','servicio','insumo')),
  cantidad       numeric(12,2) not null default 1 check (cantidad > 0),

  -- Precios UNITARIOS. El total del renglón es cantidad × precio.
  precio_venta   numeric(12,2) not null default 0 check (precio_venta >= 0),
  costo          numeric(12,2) not null default 0 check (costo >= 0),
  moneda         text not null default 'USD',

  -- Quién puso la pieza. Si la trajo el cliente no hay costo ni proveedor.
  origen         text not null default 'taller' check (origen in ('taller','cliente')),

  proveedor_id   uuid references public.proveedores(id) on delete set null,
  proveedor      text,
  enlace         text,
  comprobante_url text,

  -- Deuda con el proveedor. 'no_aplica' cuando la pieza la trajo el cliente
  -- o el renglón es mano de obra.
  estado_pago    text not null default 'no_aplica'
                 check (estado_pago in ('no_aplica','pagado','por_pagar','parcial')),
  monto_pagado   numeric(12,2) not null default 0 check (monto_pagado >= 0),
  fecha_pago     date,
  fecha_vencimiento date,

  nota           text,
  registrado_por text,
  sede_id        uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Lo que trae el cliente no nos cuesta ni se le debe a nadie.
  constraint partida_cliente_sin_costo
    check (origen = 'taller' or (costo = 0 and proveedor_id is null and estado_pago = 'no_aplica'))
);

create index if not exists idx_partidas_vehiculo  on public.vehiculo_partidas (vehiculo_id, fecha desc);
create index if not exists idx_partidas_placa     on public.vehiculo_partidas (upper(placa), fecha desc);
create index if not exists idx_partidas_cliente   on public.vehiculo_partidas (cliente_id, fecha desc);
create index if not exists idx_partidas_servicio  on public.vehiculo_partidas (servicio_id);
create index if not exists idx_partidas_deuda     on public.vehiculo_partidas (estado_pago, fecha_vencimiento)
  where estado_pago in ('por_pagar','parcial');
create index if not exists idx_partidas_sede      on public.vehiculo_partidas (sede_id, fecha desc);

-- ── Deuda también en los egresos que ya se registran ───────────────────────
-- El egreso suelto (el que no cuelga de un renglón) también puede quedar a
-- crédito, así que las cuentas por pagar tienen que verlo.
alter table public.egresos add column if not exists proveedor_id      uuid references public.proveedores(id) on delete set null;
alter table public.egresos add column if not exists estado_pago       text not null default 'pagado';
alter table public.egresos add column if not exists monto_pagado      numeric(12,2);
alter table public.egresos add column if not exists fecha_pago        date;
alter table public.egresos add column if not exists fecha_vencimiento date;
alter table public.egresos add column if not exists enlace            text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'egresos_estado_pago_check') then
    alter table public.egresos add constraint egresos_estado_pago_check
      check (estado_pago in ('pagado','por_pagar','parcial'));
  end if;
end $$;

create index if not exists idx_egresos_deuda on public.egresos (estado_pago, fecha_vencimiento)
  where estado_pago in ('por_pagar','parcial');

comment on table  public.vehiculo_partidas is 'Renglones de un trabajo sobre un vehículo: precio al cliente, costo, origen del repuesto y deuda con el proveedor.';
comment on column public.vehiculo_partidas.origen is 'taller = la pieza la compró el taller · cliente = la trajo el cliente.';
comment on column public.egresos.estado_pago is 'Si el egreso ya se pagó al proveedor o sigue a crédito.';

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Permisiva, como el resto del proyecto: la autorización vive en la aplicación.
do $$
declare t text;
begin
  foreach t in array array['proveedores','vehiculo_partidas'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "ficha_read_%1$s"  on public.%1$s', t);
    execute format('drop policy if exists "ficha_write_%1$s" on public.%1$s', t);
    execute format('create policy "ficha_read_%1$s"  on public.%1$s for select using (true)', t);
    execute format('create policy "ficha_write_%1$s" on public.%1$s for all using (true) with check (true)', t);
  end loop;
end $$;
