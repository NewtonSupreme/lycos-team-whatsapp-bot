-- ════════════════════════════════════════════════════════════════════════════
-- 028 · Flujo de caja por cuenta (Binance, Zelle, efectivo, bancos)
-- ─────────────────────────────────────────────────────────────────────────────
-- El saldo de cada cuenta sigue CALCULÁNDOSE (saldo inicial + entradas − salidas);
-- aquí se guarda lo que no se puede deducir de las ventas y los gastos:
--
--   · movimientos_caja      entradas y salidas que no son una venta ni un gasto
--                           (retiro de Binance, comisión, Zelle sin venta, ajuste).
--                           Nunca se borran: se anulan con motivo.
--   · arqueos_caja          el saldo REAL que alguien verificó un día (la app de
--                           Binance, el estado del banco, el conteo de la caja) y
--                           cuánto difería del sistema en ese momento.
--   · cuentas_saldo_historial  cada vez que se cambia el saldo inicial de una cuenta:
--                           antes, después, quién y por qué.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists movimientos_caja (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  fecha         date not null,
  cuenta_id     uuid not null references cuentas_financieras(id) on delete restrict,
  sentido       text not null check (sentido in ('entrada', 'salida')),
  -- En la moneda de la cuenta.
  monto         numeric(16,2) not null check (monto > 0),
  concepto      text not null,
  categoria     text,
  contraparte   text,
  referencia    text,
  tasa          numeric(14,4),
  notas         text,
  usuario       text,
  sede_id       uuid references sedes(id) on delete set null,
  anulado       boolean not null default false,
  anulado_por   text,
  anulado_motivo text,
  anulado_en    timestamptz
);
create index if not exists movimientos_caja_cuenta_fecha on movimientos_caja (cuenta_id, fecha);

create table if not exists arqueos_caja (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  fecha         date not null,
  cuenta_id     uuid not null references cuentas_financieras(id) on delete restrict,
  saldo_real    numeric(16,2) not null,
  saldo_sistema numeric(16,2) not null,
  diferencia    numeric(16,2) not null,
  origen        text not null default 'manual',
  nota          text,
  usuario       text,
  sede_id       uuid references sedes(id) on delete set null
);
create index if not exists arqueos_caja_cuenta_fecha on arqueos_caja (cuenta_id, fecha desc);

create table if not exists cuentas_saldo_historial (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  cuenta_id      uuid not null references cuentas_financieras(id) on delete cascade,
  saldo_anterior numeric(16,2),
  saldo_nuevo    numeric(16,2) not null,
  desde_anterior date,
  desde_nuevo    date not null,
  motivo         text,
  usuario        text
);
create index if not exists cuentas_saldo_historial_cuenta on cuentas_saldo_historial (cuenta_id, created_at desc);
