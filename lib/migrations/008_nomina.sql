-- ============================================================================
--  LYCOS TEAM — Motor de Nóminas, Comisiones Dinámicas y Abonos  (v2.0)
--  Migración 008 · Additiva e idempotente. No altera datos existentes.
--
--  Diseño clave:
--   · Reglas dinámicas vinculadas a empleado_id (NUNCA se hardcodean nombres).
--   · job_assignments congela un SNAPSHOT del cálculo al cerrar el trabajo,
--     de modo que cambiar una regla en el futuro no altera el histórico.
--   · Multi-moneda: cada monto guarda su moneda original + tasa + equivalente USD
--     (canónico) para poder sumar/liquidar de forma consistente.
--   · Multi-sede nativo (sede_id en todas las tablas).
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────────────────────────────────────────
-- 1. commission_rules — Reglas de comisión dinámicas por empleado / zona
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.commission_rules (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid references public.usuarios(id) on delete cascade,
  -- zona operativa: coincide con las columnas/categorías de ventas_dia
  zona            text not null default 'all',          -- alineacion|mecanica|escape|frenos|autolavado|cauchera|electronica|all
  tipo_regla      text not null                          -- porcentaje | fijo_semanal | override_cascada | tarifa_flat
                  check (tipo_regla in ('porcentaje','fijo_semanal','override_cascada','tarifa_flat')),
  base            text not null default 'mano_obra'      -- mano_obra | ingreso_total
                  check (base in ('mano_obra','ingreso_total')),
  valor           numeric(12,4) not null default 0,      -- % (25, 40, 7) o monto fijo semanal (40)
  moneda          text not null default 'USD',           -- moneda del valor fijo / de la comisión
  -- Condicional por moneda de la factura (p.ej. el puente de alineación solo aplica en Bs).
  -- NULL = aplica a cualquier moneda.
  aplica_monedas  text[] ,                               -- ej. {'VES'} o {'USD','EUR'}
  -- Reparto a proveedor externo (puente de alineación). Sale del ingreso del trabajo.
  proveedor_pct   numeric(12,4) not null default 0,
  proveedor_nombre text,
  prioridad       int not null default 100,              -- menor = se evalúa primero
  condiciones     jsonb not null default '{}'::jsonb,    -- extensible (futuras condiciones)
  descripcion     text,
  activo          boolean not null default true,
  vigencia_desde  timestamptz not null default now(),
  vigencia_hasta  timestamptz,
  sede_id         uuid references public.sedes(id) on delete cascade,  -- NULL = todas las sedes
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_comm_rules_emp   on public.commission_rules(empleado_id);
create index if not exists idx_comm_rules_zona  on public.commission_rules(zona);
create index if not exists idx_comm_rules_activo on public.commission_rules(activo);
create index if not exists idx_comm_rules_sede  on public.commission_rules(sede_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. flat_rate_catalog — Tarifas a destajo (Freddy / revisión $2, etc.)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.flat_rate_catalog (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid references public.usuarios(id) on delete cascade, -- NULL = cualquier técnico de la zona
  zona          text not null default 'escape',
  servicio_key  text not null,                           -- silenciador|resonador|flexible|gomas|soldadura|extra|revision...
  label         text not null,
  monto         numeric(12,2) not null default 0,
  moneda        text not null default 'USD',
  activo        boolean not null default true,
  sede_id       uuid references public.sedes(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_flat_emp  on public.flat_rate_catalog(empleado_id);
create index if not exists idx_flat_key  on public.flat_rate_catalog(servicio_key);
create index if not exists idx_flat_sede on public.flat_rate_catalog(sede_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. job_assignments — Pivote trabajo ↔ técnico CON SNAPSHOT congelado
--    Fuente única de verdad para comisiones. Una venta puede generar varias
--    filas (varios técnicos / overrides en cascada / "lo hizo el taller").
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.job_assignments (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  -- técnico ejecutor. NULL + es_taller=true => "lo hizo el taller" (sin técnico).
  empleado_id     uuid references public.usuarios(id) on delete set null,
  es_taller       boolean not null default false,
  empleado_nombre text,                                  -- snapshot del nombre (histórico)
  zona            text not null default 'general',
  tipo_trabajo    text,                                  -- alineacion|revision|mecanica|escape|frenos|autolavado...
  servicio_key    text,                                  -- para tarifa flat
  descripcion     text,
  -- Enlace a la operación que lo originó (venta/servicio/factura)
  referencia_tabla text,                                 -- ventas_dia | servicios | facturas | manual
  referencia_id    uuid,
  -- Montos del trabajo (en su moneda original)
  ingreso_total   numeric(14,2) not null default 0,
  mano_obra       numeric(14,2) not null default 0,
  cantidad        numeric(12,2) not null default 1,
  moneda          text not null default 'USD',           -- USD | EUR | VES
  tasa_cambio     numeric(18,6) not null default 1,      -- unidades de `moneda` por 1 USD
  -- Equivalentes USD (canónico para totalizar)
  ingreso_usd     numeric(14,2) not null default 0,
  mano_obra_usd   numeric(14,2) not null default 0,
  -- SNAPSHOT del cálculo (congelado al cerrar)
  regla_id        uuid references public.commission_rules(id) on delete set null,
  tipo_regla      text,
  comision        numeric(14,2) not null default 0,      -- en comision_moneda
  comision_moneda text not null default 'USD',
  comision_usd    numeric(14,2) not null default 0,      -- canónico
  es_override     boolean not null default false,        -- comisión en cascada (Jim 7%)
  override_de     uuid references public.job_assignments(id) on delete cascade,
  proveedor_monto numeric(14,2) not null default 0,      -- al proveedor del puente
  proveedor_monto_usd numeric(14,2) not null default 0,
  proveedor_nombre text,
  lycos_neto      numeric(14,2) not null default 0,      -- lo que le queda a Lycos (USD)
  desglose        jsonb not null default '{}'::jsonb,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','liquidado','anulado')),
  payroll_ledger_id uuid,                                -- set al liquidar
  sede_id         uuid references public.sedes(id) on delete set null,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_job_emp     on public.job_assignments(empleado_id);
create index if not exists idx_job_fecha   on public.job_assignments(fecha);
create index if not exists idx_job_estado  on public.job_assignments(estado);
create index if not exists idx_job_sede    on public.job_assignments(sede_id);
create index if not exists idx_job_ledger  on public.job_assignments(payroll_ledger_id);
create index if not exists idx_job_ref     on public.job_assignments(referencia_tabla, referencia_id);
create index if not exists idx_job_override on public.job_assignments(override_de);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. payroll_ledger — Liquidación de nómina por empleado y período
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.payroll_ledger (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid references public.usuarios(id) on delete set null,
  empleado_nombre text,
  periodo_inicio  date not null,
  periodo_fin     date not null,
  moneda          text not null default 'USD',           -- moneda de liquidación (canónica)
  sueldo_base     numeric(14,2) not null default 0,
  total_comisiones numeric(14,2) not null default 0,
  total_overrides numeric(14,2) not null default 0,
  total_flat      numeric(14,2) not null default 0,
  bruto           numeric(14,2) not null default 0,
  deducciones     numeric(14,2) not null default 0,      -- adelantos aplicados
  total_pagar     numeric(14,2) not null default 0,
  desglose_monedas jsonb not null default '{}'::jsonb,   -- {USD:x, VES:y, EUR:z} informativo
  detalle         jsonb not null default '[]'::jsonb,    -- snapshot de job_assignments incluidos
  recibo_numero   text unique,
  nota            text,
  estado          text not null default 'borrador'
                  check (estado in ('borrador','pagado','anulado')),
  pagado_at       timestamptz,
  pagado_por      text,
  metodo_pago     text,
  sede_id         uuid references public.sedes(id) on delete set null,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_ledger_emp    on public.payroll_ledger(empleado_id);
create index if not exists idx_ledger_periodo on public.payroll_ledger(periodo_inicio, periodo_fin);
create index if not exists idx_ledger_estado on public.payroll_ledger(estado);
create index if not exists idx_ledger_sede   on public.payroll_ledger(sede_id);

-- FK diferida de job_assignments → payroll_ledger (creada después de la tabla)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_job_ledger' and table_name = 'job_assignments'
  ) then
    alter table public.job_assignments
      add constraint fk_job_ledger foreign key (payroll_ledger_id)
      references public.payroll_ledger(id) on delete set null;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. payroll_advances — Adelantos / deducciones
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.payroll_advances (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid references public.usuarios(id) on delete cascade,
  empleado_nombre text,
  fecha           date not null default current_date,
  monto           numeric(14,2) not null default 0,
  moneda          text not null default 'USD',
  tasa_cambio     numeric(18,6) not null default 1,
  monto_usd       numeric(14,2) not null default 0,
  motivo          text,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','aplicado','anulado')),
  payroll_ledger_id uuid references public.payroll_ledger(id) on delete set null,
  sede_id         uuid references public.sedes(id) on delete set null,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_adv_emp    on public.payroll_advances(empleado_id);
create index if not exists idx_adv_estado on public.payroll_advances(estado);
create index if not exists idx_adv_sede   on public.payroll_advances(sede_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RLS — Coherente con el resto del proyecto (seguridad en capa de app).
--    Políticas permisivas; la autorización real la imponen los API routes RBAC.
-- ──────────────────────────────────────────────────────────────────────────
alter table public.commission_rules  enable row level security;
alter table public.flat_rate_catalog enable row level security;
alter table public.job_assignments   enable row level security;
alter table public.payroll_ledger    enable row level security;
alter table public.payroll_advances  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['commission_rules','flat_rate_catalog','job_assignments','payroll_ledger','payroll_advances']
  loop
    execute format('drop policy if exists "nomina_read_%1$s"  on public.%1$s', t);
    execute format('drop policy if exists "nomina_write_%1$s" on public.%1$s', t);
    execute format('create policy "nomina_read_%1$s"  on public.%1$s for select using (true)', t);
    execute format('create policy "nomina_write_%1$s" on public.%1$s for all using (true) with check (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
