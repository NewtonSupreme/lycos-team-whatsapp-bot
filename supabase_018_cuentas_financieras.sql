-- ─────────────────────────────────────────────────────────────────────────────
-- 018 · Cuentas financieras del taller
--
-- La vista de Finanzas necesita enseñar el saldo de cada cuenta —caja en
-- bolívares, Banesco, Bancamiga en dólares, Zelle, caja chica— y no había
-- ninguna tabla de donde sacarlo. Sin esto ese panel sería decorativo.
--
-- El saldo NO se guarda: se calcula. Guardar un número que hay que mantener a
-- mano se desincroniza el primer día y nadie vuelve a fiarse de él. Lo que se
-- guarda es el saldo con el que arrancó la cuenta, y de ahí en adelante:
--
--     saldo = saldo_inicial + lo que entró por esa cuenta - lo que salió
--
-- Lo que entra sale de las columnas de banco de `ventas_dia`, que ya son la
-- fuente única de la clasificación del cobro. Lo que sale, del `metodo_pago`
-- de `egresos`. Por eso `bin` apunta a esas claves: es lo que enlaza la cuenta
-- con los movimientos que ya se registran.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists cuentas_financieras (
  id            uuid primary key default gen_random_uuid(),
  nombre        text        not null,
  -- Qué clase de cuenta es; ordena la lista y decide el icono.
  tipo          text        not null default 'banco'
                check (tipo in ('efectivo', 'banco', 'digital', 'caja_chica')),
  moneda        text        not null default 'VES' check (moneda in ('VES', 'USD', 'EUR')),
  banco         text,
  -- Nº de cuenta o correo (Zelle, PayPal). Solo para identificarla.
  referencia    text,
  /*
   * La clave del bin de `lib/reporte/ventas-mapping.ts`
   * (pago_movil_banesco, bnc, punto_banesco, punto_bancamiga,
   *  pago_movil_exterior, dolares, binance, zelle, efectivo_bs, cashea).
   *
   * Es lo que permite calcular el saldo sin registrar el movimiento dos veces:
   * el cobro ya se clasificó al cerrar el servicio o la venta.
   *
   * Puede ir vacío: una caja chica no recibe cobros, solo traspasos.
   */
  bin           text,
  saldo_inicial numeric(14,2) not null default 0,
  /*
   * Desde cuándo cuenta ese saldo inicial. Sin fecha no se sabe qué movimientos
   * hay que sumarle y cuáles ya estaban dentro.
   *
   * OJO con el valor por omisión: si una cuenta arranca «hoy», su saldo excluye
   * todo el histórico y sale en cero. Al sembrar las cuentas de un taller que
   * ya lleva tiempo operando hay que ponerlo en la fecha del primer movimiento
   * —es lo que se hace al final de esta migración—.
   */
  desde         date        not null default current_date,
  orden         integer     not null default 0,
  activo        boolean     not null default true,
  notas         text,
  sede_id       uuid        references sedes(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Dos cuentas con el mismo nombre en la misma sede es un duplicado, y con
-- saldos distintos nadie sabe cuál es la de verdad.
create unique index if not exists cuentas_financieras_nombre_sede
  on cuentas_financieras (lower(btrim(nombre)), coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Un bin representa UNA cuenta por sede: si dos cuentas dijeran ser «Banesco
-- pago móvil», el mismo cobro sumaría en las dos.
create unique index if not exists cuentas_financieras_bin_sede
  on cuentas_financieras (bin, coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where bin is not null and activo;

create index if not exists cuentas_financieras_sede on cuentas_financieras (sede_id) where activo;

-- ── Traspasos entre cuentas ─────────────────────────────────────────────────
-- Mover plata de Banesco a la caja no es un ingreso ni un gasto: el dinero del
-- taller no cambia. Registrarlo como egreso —que es lo único que había— haría
-- que los gastos del mes salieran inflados por dinero que no se gastó.
create table if not exists traspasos_cuenta (
  id            uuid primary key default gen_random_uuid(),
  fecha         date        not null default current_date,
  origen_id     uuid        not null references cuentas_financieras(id) on delete restrict,
  destino_id    uuid        not null references cuentas_financieras(id) on delete restrict,
  -- Lo que sale de la cuenta origen, en la moneda de esa cuenta.
  monto         numeric(14,2) not null check (monto > 0),
  -- Lo que entra en la de destino. Es distinto cuando se cambia de moneda, y
  -- por eso se guarda aparte en vez de convertirlo al leer: la tasa del día
  -- del traspaso no se puede reconstruir después.
  monto_destino numeric(14,2) not null check (monto_destino > 0),
  tasa          numeric(14,4),
  motivo        text,
  registrado_por text,
  sede_id       uuid        references sedes(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Sacar y meter en la misma cuenta no es un traspaso.
  constraint traspaso_entre_cuentas_distintas check (origen_id <> destino_id)
);

create index if not exists traspasos_cuenta_fecha on traspasos_cuenta (fecha desc);
create index if not exists traspasos_cuenta_origen on traspasos_cuenta (origen_id);
create index if not exists traspasos_cuenta_destino on traspasos_cuenta (destino_id);

-- ── Las cuentas que el taller ya usa ────────────────────────────────────────
-- Se siembran a partir de los métodos de cobro que de verdad se registran, con
-- saldo inicial en cero: el saldo real lo pone administración cuando lo cuadre.
-- Sin esta siembra el panel arrancaría vacío y parecería roto.
insert into cuentas_financieras (nombre, tipo, moneda, banco, bin, orden)
values
  ('Caja (Efectivo Bs.)',      'efectivo',   'VES', null,        'efectivo_bs',         1),
  ('Banesco (Bs.)',            'banco',      'VES', 'Banesco',   'pago_movil_banesco',  2),
  ('Punto Banesco (Bs.)',      'banco',      'VES', 'Banesco',   'punto_banesco',       3),
  ('BNC (Bs.)',                'banco',      'VES', 'BNC',       'bnc',                 4),
  ('Bancamiga (Bs.)',          'banco',      'VES', 'Bancamiga', 'punto_bancamiga',     5),
  ('Banco Exterior (Bs.)',     'banco',      'VES', 'Exterior',  'pago_movil_exterior', 6),
  ('Efectivo (USD)',           'efectivo',   'USD', null,        'dolares',             7),
  ('Zelle (USD)',              'digital',    'USD', null,        'zelle',               8),
  ('Binance (USD)',            'digital',    'USD', null,        'binance',             9),
  ('Cashea (USD)',             'digital',    'USD', null,        'cashea',             10),
  ('Caja Chica',               'caja_chica', 'VES', null,        null,                 11)
on conflict do nothing;

-- El saldo de una cuenta es «arranque + entradas − salidas, contando desde su
-- fecha de arranque». Con esa fecha puesta en el día de la migración, las
-- cuentas de un taller que ya lleva meses operando saldrían TODAS en cero: el
-- histórico entero quedaría fuera. Se retrasan al primer movimiento registrado.
update cuentas_financieras
   set desde = coalesce((select min(fecha) from ventas_dia), current_date)
 where desde >= coalesce((select min(fecha) from ventas_dia), current_date);
