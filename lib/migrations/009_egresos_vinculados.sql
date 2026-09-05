-- ============================================================================
--  LYCOS TEAM — Migración 009
--  1) Identificación real del cliente en el reporte de ventas (nombre + placa)
--  2) Clasificación de servicios (categoría → columna de ventas_dia)
--  3) Egresos asociados a Cliente / Vehículo / Servicio → utilidad por vehículo
--  4) Métodos de pago dentro de la orden de servicio
--  Additiva e idempotente. No altera datos existentes.
-- ============================================================================

-- ── 1. VENTAS_DIA — identidad del cliente/vehículo + clasificación ──────────
alter table public.ventas_dia add column if not exists cliente_id    uuid references public.clientes(id)  on delete set null;
alter table public.ventas_dia add column if not exists vehiculo_id   uuid references public.vehiculos(id) on delete set null;
alter table public.ventas_dia add column if not exists servicio_id   uuid references public.servicios(id) on delete set null;
alter table public.ventas_dia add column if not exists placa         text;
alter table public.ventas_dia add column if not exists vehiculo_info text;
-- categoría principal del servicio vendido (silenciador|cauchera|alineacion|
-- electronica|mecanica|frenos|lavado|repuestos|latoneria|otro)
alter table public.ventas_dia add column if not exists categoria     text;

create index if not exists idx_vd_cliente_id  on public.ventas_dia(cliente_id);
create index if not exists idx_vd_vehiculo_id on public.ventas_dia(vehiculo_id);
create index if not exists idx_vd_servicio_id on public.ventas_dia(servicio_id);
create index if not exists idx_vd_placa       on public.ventas_dia(placa);
create index if not exists idx_vd_categoria   on public.ventas_dia(categoria);

-- ── 2. EGRESOS — asociación a cliente / vehículo / servicio ─────────────────
-- OJO: la columna `cliente` existente se usa como "Pagado a (proveedor)".
-- Se preserva; se añaden campos nuevos para la asociación real.
alter table public.egresos add column if not exists cliente_id     uuid references public.clientes(id)  on delete set null;
alter table public.egresos add column if not exists vehiculo_id    uuid references public.vehiculos(id) on delete set null;
alter table public.egresos add column if not exists servicio_id    uuid references public.servicios(id) on delete set null;
alter table public.egresos add column if not exists cliente_nombre text;
alter table public.egresos add column if not exists vehiculo_info  text;
alter table public.egresos add column if not exists placa          text;
alter table public.egresos add column if not exists proveedor      text;
alter table public.egresos add column if not exists hora           text;
alter table public.egresos add column if not exists metodo_pago    text;
alter table public.egresos add column if not exists moneda         text default 'USD';
alter table public.egresos add column if not exists tasa_cambio    numeric(18,6);
-- Origen del registro: panel | bot | servicio
alter table public.egresos add column if not exists origen         text default 'panel';

create index if not exists idx_eg_cliente_id  on public.egresos(cliente_id);
create index if not exists idx_eg_vehiculo_id on public.egresos(vehiculo_id);
create index if not exists idx_eg_servicio_id on public.egresos(servicio_id);
create index if not exists idx_eg_placa       on public.egresos(placa);
create index if not exists idx_eg_fecha       on public.egresos(fecha);

-- ── 3. SERVICIOS — métodos de pago + clasificación dentro de la orden ───────
alter table public.servicios add column if not exists metodos_pago  jsonb default '{}'::jsonb;
alter table public.servicios add column if not exists con_iva       boolean default false;
alter table public.servicios add column if not exists tasa_cambio   numeric(18,6);
alter table public.servicios add column if not exists moneda        text default 'USD';
alter table public.servicios add column if not exists categoria     text;
alter table public.servicios add column if not exists total_pagado  numeric(14,2);

create index if not exists idx_srv_categoria on public.servicios(categoria);

notify pgrst, 'reload schema';
