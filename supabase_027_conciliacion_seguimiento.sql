-- ════════════════════════════════════════════════════════════════════════════
-- 027 · Seguimiento de la conciliación bancaria
-- ─────────────────────────────────────────────────────────────────────────────
-- · conciliacion_corridas: una fila cada vez que se concilia un estado de cuenta
--   (banco, período, cuánto cuadró, cuánto quedó pendiente). Sirve para ver el
--   avance de un mismo período entre una corrida y la siguiente.
-- · conciliacion_acciones: cada decisión sobre un movimiento (registrar, abonar,
--   corregir monto, cambiar cuenta, justificar, dejar pendiente…) con el valor
--   de antes y de después, quién y por qué, y la tasa EXACTA que se usó (la
--   tasa del día se sobrescribe en tasas_bcv; aquí queda lo que se aplicó).
-- Nada se borra: reabrir un caso agrega una acción nueva.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists conciliacion_corridas (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  banco        text not null,
  desde        date,
  hasta        date,
  archivo      text,
  usuario      text,
  sede_id      uuid references sedes(id) on delete set null,
  cuadra       boolean not null default false,
  porcentaje   numeric(5,1),
  en_juego     numeric(16,2),
  movimientos  integer,
  conciliados  integer,
  pendientes   integer,
  resumen      jsonb not null default '{}'::jsonb
);
create index if not exists conciliacion_corridas_periodo on conciliacion_corridas (banco, desde, hasta, created_at desc);

create table if not exists conciliacion_acciones (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  corrida_id      uuid references conciliacion_corridas(id) on delete set null,
  banco           text,
  fecha           date,
  referencia      text,
  monto           numeric(16,2),
  movimiento_hash text,
  caso            text not null,
  accion          text not null,
  resuelto        boolean not null default true,
  motivo          text,
  usuario         text,
  sede_id         uuid references sedes(id) on delete set null,
  antes           jsonb,
  despues         jsonb,
  tasa            numeric(14,4),
  tasa_fecha      date,
  tasa_fuente     text,
  referencia_tabla text,
  referencia_id   text
);
create index if not exists conciliacion_acciones_fecha on conciliacion_acciones (created_at desc);
create index if not exists conciliacion_acciones_hash on conciliacion_acciones (movimiento_hash);
create index if not exists conciliacion_acciones_banco on conciliacion_acciones (banco, fecha);
