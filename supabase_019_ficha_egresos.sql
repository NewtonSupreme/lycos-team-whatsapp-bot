-- ─────────────────────────────────────────────────────────────────────────────
-- 019 · La ficha del vehículo, enlazada al servicio y al egreso
--
-- Tres problemas que arregla esta migración:
--
-- 1. Los renglones de la ficha no pertenecían a ningún servicio. `servicio_id`
--    existía pero nadie lo rellenaba, así que la ficha era una libreta por
--    vehículo: se editaba «en tiempo real» sin saber a qué trabajo pertenecía
--    cada línea, y no había forma de decir «esto fue el servicio de julio».
--
-- 2. Un repuesto que compra el taller es un GASTO de la empresa, y no aparecía
--    en ninguna parte: se anotaba en la ficha y ahí se quedaba. En los reportes
--    los gastos salían en cero teniendo repuestos comprados.
--
-- 3. No había forma de saber qué egreso venía de qué renglón, así que borrar un
--    renglón dejaba su gasto huérfano, y volver a guardarlo lo duplicaba.
--
-- El enlace `egresos.partida_id` resuelve 2 y 3 de una vez: un renglón tiene a
-- lo sumo un egreso, y al borrar el renglón su egreso se va con él.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── El egreso que nace de un renglón de la ficha ────────────────────────────
alter table egresos
  add column if not exists partida_id uuid
    references vehiculo_partidas(id) on delete cascade;

-- Un renglón, un egreso. Sin esto, guardar dos veces el mismo renglón creaba
-- dos gastos por la misma pieza y el mes salía inflado.
create unique index if not exists egresos_partida_unica
  on egresos (partida_id) where partida_id is not null;

create index if not exists egresos_servicio on egresos (servicio_id) where servicio_id is not null;
create index if not exists egresos_vehiculo on egresos (vehiculo_id) where vehiculo_id is not null;

-- ── Los renglones de la ficha, por servicio ─────────────────────────────────
create index if not exists partidas_servicio on vehiculo_partidas (servicio_id)
  where servicio_id is not null;

/*
 * De qué renglón de la orden salió esta partida.
 *
 * La orden guarda sus renglones en `servicios.items` (un jsonb), que no tiene
 * identificadores. Al pasar un renglón de la orden a la ficha, la única forma
 * de saber que ya estaba era comparar la descripción letra por letra —y bastaba
 * una tilde distinta para ofrecerlo otra vez y cobrarlo dos veces—.
 *
 * Guardando aquí la descripción normalizada con la que se creó, el enlace
 * sobrevive a que alguien corrija el texto de la partida después.
 */
alter table vehiculo_partidas
  add column if not exists clave_item text;

create index if not exists partidas_clave_item
  on vehiculo_partidas (servicio_id, clave_item)
  where servicio_id is not null and clave_item is not null;

-- ── El porcentaje del plan de Cashea ────────────────────────────────────────
-- Con un plan al 0% la inicial es cero, así que «¿se usó Cashea?» no se puede
-- deducir del monto. Guardar el porcentaje es lo que permite reabrir la orden y
-- seguir sabiendo que está financiada.
alter table servicios     add column if not exists cashea_pct smallint;
alter table ventas_dia    add column if not exists cashea_pct smallint;

comment on column servicios.cashea_pct is
  'Porcentaje de la inicial de Cashea (0,10,20,30,40,50,60). Nulo = sin Cashea.';
comment on column egresos.partida_id is
  'Renglón de la ficha del vehículo que generó este gasto. Se borra con él.';
