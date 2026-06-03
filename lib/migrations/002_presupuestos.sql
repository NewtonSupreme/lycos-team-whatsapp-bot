-- ============================================================
--  LYCOS TEAM — Migración: Tabla Presupuestos (Budgets/Quotes)
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ⚠️ NOTA: Esta migración referencia clientes y vehiculos.
--    Si tu BD no tiene tablas perfiles o sedes, comenta esas FK.

-- ──────────────────────────────────────────────────────────────
-- TABLA PRESUPUESTOS
-- ──────────────────────────────────────────────────────────────
create table if not exists presupuestos (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null,
  cliente_id        uuid references clientes(id) on delete set null,
  cliente_nombre    text not null,
  cliente_telefono  text,
  cliente_cedula    text,
  cliente_direccion text,
  vehiculo_id       uuid references vehiculos(id) on delete set null,
  vehiculo_info     text,
  moneda            text not null default 'USD' check (moneda in ('USD','VES','EUR')),
  tasa_cambio       numeric(14,4),
  items             jsonb not null default '[]',
  subtotal          numeric(14,2) not null default 0,
  descuento         numeric(14,2) not null default 0,
  descuento_tipo    text not null default 'porcentaje' check (descuento_tipo in ('porcentaje','monto')),
  iva               numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  notas             text,
  condiciones       text,
  estado            text not null default 'borrador' check (estado in ('borrador','enviado','aprobado','rechazado','vencido','convertido')),
  validez_dias      integer not null default 15,
  fecha_expiracion  date,
  creado_por        text not null,
  creado_por_id     text,
  convertido_a      uuid,
  sede_id           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Índices
create index if not exists idx_presupuestos_cliente on presupuestos(cliente_id);
create index if not exists idx_presupuestos_estado on presupuestos(estado);
create index if not exists idx_presupuestos_created on presupuestos(created_at desc);
create index if not exists idx_presupuestos_sede on presupuestos(sede_id);
create index if not exists idx_presupuestos_numero on presupuestos(numero);

-- Trigger updated_at
drop trigger if exists trg_presupuestos_updated_at on presupuestos;
create trigger trg_presupuestos_updated_at
  before update on presupuestos
  for each row execute function set_updated_at();

-- NOTA: La autenticación es por tabla `usuarios` + cookie propia, no por Supabase Auth.
-- Por lo tanto RLS con auth.role() no funciona. Se desactiva RLS en presupuestos.
alter table presupuestos disable row level security;

-- ──────────────────────────────────────────────────────────────
-- FUNCIÓN: Generar número correlativo de presupuesto
-- Formato: PRE-YYYY-XXXX
-- ──────────────────────────────────────────────────────────────
create or replace function generar_numero_presupuesto()
returns text language plpgsql as $$
declare
  anio text := extract(year from now())::text;
  correlativo int;
begin
  select coalesce(max(
    substring(numero from 'PRE-\d+-(\d+)')::int
  ), 0) + 1 into correlativo
  from presupuestos
  where numero like 'PRE-' || anio || '-%';
  
  return 'PRE-' || anio || '-' || lpad(correlativo::text, 4, '0');
end;
$$;
