-- ─────────────────────────────────────────────────────────────────────────────
-- 020 · Proveedores: catálogo completo, órdenes de compra y evaluaciones
--
-- El catálogo existía pero era una libreta de teléfonos: nombre, contacto y
-- poco más. No se podía responder a lo que administración pregunta todos los
-- días —«¿a quién le compramos más?», «¿este nos da crédito?», «¿qué pedimos y
-- no ha llegado?»— y por eso las compras se seguían apuntando fuera del sistema.
--
-- Tres piezas:
--
--   1. Los datos que faltaban en el proveedor: qué vende, en qué condiciones nos
--      vende y cuántos días de crédito da. Sin esto no se puede saber si una
--      deuda está vencida de verdad o todavía está dentro de plazo.
--
--   2. Las órdenes de compra. Lo que se le pidió a un proveedor y aún no llega
--      no es un gasto todavía, así que no cabe en `egresos`: es un compromiso.
--      Mezclarlos haría que el mes cerrara con gastos que aún no han ocurrido.
--
--   3. Las evaluaciones. Un proveedor barato que entrega tarde sale caro; el
--      único sitio donde eso constaba era la memoria de quien hizo el pedido.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. El proveedor, completo ───────────────────────────────────────────────
alter table proveedores
  add column if not exists categoria text,
  -- Cómo nos vende: contado, crédito a X días, 50% por adelantado…
  add column if not exists condiciones_pago text,
  -- Los días de crédito, aparte del texto, para poder calcular vencimientos.
  add column if not exists dias_credito smallint default 0;

comment on column proveedores.dias_credito is
  'Días de crédito que concede. 0 = al contado. Se usa para fechar el vencimiento '
  'de una compra a crédito en vez de pedir la fecha a mano.';

create index if not exists proveedores_categoria on proveedores (categoria)
  where categoria is not null;

-- ── 2. Órdenes de compra ────────────────────────────────────────────────────
create table if not exists ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  -- Un número corto y legible para poder nombrarla por teléfono.
  correlativo text,
  proveedor_id uuid references proveedores(id) on delete set null,
  -- El nombre se copia: si el proveedor se borra del catálogo, la orden sigue
  -- diciendo a quién se le compró.
  proveedor text not null,

  fecha date not null default current_date,
  fecha_esperada date,
  fecha_recibida date,

  -- pendiente: pedida y sin llegar · parcial: llegó parte · recibida: completa
  -- cancelada: no se va a recibir
  estado text not null default 'pendiente'
    check (estado in ('borrador', 'pendiente', 'parcial', 'recibida', 'cancelada')),

  total numeric(14,2) not null default 0,
  moneda text not null default 'USD',
  -- La tasa del día del pedido: una orden en bolívares convertida con la tasa
  -- de hoy cuenta una historia distinta de la que pasó.
  tasa numeric(14,4),

  estado_pago text not null default 'por_pagar'
    check (estado_pago in ('pagado', 'por_pagar', 'parcial')),
  monto_pagado numeric(14,2) not null default 0,
  fecha_vencimiento date,

  -- Cuando la compra llega, el gasto que generó. Así una orden recibida y su
  -- egreso no se cuentan dos veces.
  egreso_id uuid references egresos(id) on delete set null,

  notas text,
  enlace text,
  creado_por text,
  sede_id uuid references sedes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oc_proveedor on ordenes_compra (proveedor_id);
create index if not exists oc_estado on ordenes_compra (estado);
create index if not exists oc_fecha on ordenes_compra (fecha desc);
create index if not exists oc_pendientes on ordenes_compra (fecha_vencimiento)
  where estado_pago <> 'pagado';

create table if not exists ordenes_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes_compra(id) on delete cascade,
  -- El producto del almacén, cuando lo que se pide ya está en el catálogo.
  inventario_id uuid references inventario(id) on delete set null,
  descripcion text not null,
  cantidad numeric(12,2) not null default 1,
  -- Lo que nos cuesta a nosotros. No es el precio de venta.
  costo_unitario numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  -- Cuántas unidades han llegado ya: una orden puede llegar en dos tandas.
  recibido numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists oci_orden on ordenes_compra_items (orden_id);

-- ── 3. Evaluaciones ─────────────────────────────────────────────────────────
create table if not exists proveedor_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  fecha date not null default current_date,
  -- De 1 a 5. Se guardan por separado porque no significan lo mismo: uno puede
  -- tener el mejor precio y ser el que siempre llega tarde.
  calidad smallint check (calidad between 1 and 5),
  puntualidad smallint check (puntualidad between 1 and 5),
  precio smallint check (precio between 1 and 5),
  comentario text,
  evaluado_por text,
  sede_id uuid references sedes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pe_proveedor on proveedor_evaluaciones (proveedor_id, fecha desc);

-- ── Los renglones de la ficha, enlazados a su orden de compra ───────────────
-- Un repuesto comprado para un carro concreto suele venir de un pedido mayor.
-- Con el enlace se puede ir de la deuda al pedido y saber qué más traía.
alter table vehiculo_partidas
  add column if not exists orden_compra_id uuid references ordenes_compra(id) on delete set null;

alter table egresos
  add column if not exists orden_compra_id uuid references ordenes_compra(id) on delete set null;
