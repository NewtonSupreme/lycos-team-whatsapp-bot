-- ════════════════════════════════════════════════════════════════════════════
-- 030 · Pagos (abonos) a proveedores
-- ─────────────────────────────────────────────────────────────────────────────
-- Antes una deuda con un proveedor solo se podía marcar «pagada» completa, una
-- por una, y no quedaba el registro del pago en sí. Ahora cada pago es un
-- documento: cuánto, de qué cuentas, con qué tasa, referencia y comprobante, y
-- a qué deudas se aplicó (una o varias, total o parcialmente).
--
--   · pagos_proveedor               el pago (o abono). Lo que no se aplicó a ninguna
--                                    deuda queda como SALDO A FAVOR del proveedor.
--   · pagos_proveedor_aplicaciones  cada pedazo del pago aplicado a una deuda
--                                    (renglón de ficha o gasto), con el saldo antes
--                                    y después y las cuentas de ese pedazo.
-- Nada se borra: un pago se ANULA y sus aplicaciones se revierten.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists pagos_proveedor (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  fecha           date not null,
  proveedor       text not null,
  proveedor_id    uuid references proveedores(id) on delete set null,
  -- Cuentas de las que salió, cada una en su moneda (las mismas claves que egresos.metodos_pago).
  metodos_pago    jsonb not null,
  tasa            numeric(14,4),
  monto_usd       numeric(16,2) not null check (monto_usd > 0),
  aplicado_usd    numeric(16,2) not null default 0,
  saldo_favor_usd numeric(16,2) not null default 0,
  modo            text not null default 'general' check (modo in ('general','dirigido','saldo_favor')),
  -- Para los dirigidos: por qué se eligieron esas deudas (placa, cliente, servicio…).
  criterio        jsonb,
  referencia      text,
  comprobante_url text,
  nota            text,
  usuario         text,
  sede_id         uuid references sedes(id) on delete set null,
  -- Si este pago usa el saldo a favor de otro pago anterior.
  origen_pago_id  uuid references pagos_proveedor(id) on delete set null,
  anulado         boolean not null default false,
  anulado_por     text,
  anulado_motivo  text,
  anulado_en      timestamptz
);
create index if not exists pagos_proveedor_prov on pagos_proveedor (proveedor, fecha desc);
create index if not exists pagos_proveedor_fecha on pagos_proveedor (fecha desc);

create table if not exists pagos_proveedor_aplicaciones (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  pago_id       uuid not null references pagos_proveedor(id) on delete cascade,
  origen        text not null check (origen in ('partida','egreso')),
  registro_id   uuid not null,
  monto_usd     numeric(16,2) not null check (monto_usd > 0),
  metodos_pago  jsonb,
  saldo_antes   numeric(16,2) not null,
  saldo_despues numeric(16,2) not null,
  descripcion   text,
  placa         text,
  revertido     boolean not null default false
);
create index if not exists pagos_aplic_pago on pagos_proveedor_aplicaciones (pago_id);
create index if not exists pagos_aplic_registro on pagos_proveedor_aplicaciones (origen, registro_id);
