-- ─────────────────────────────────────────────────────────────────────────────
-- 021 · El año del vehículo puede faltar
--
-- `vehiculos.anio` era NOT NULL sin valor por defecto, así que cada sitio que
-- creaba un vehículo tenía que poner ALGO. Y lo que ponían era el año en curso:
--
--   · el bot          → `parseInt(anio || '2025')`
--   · la orden manual → `yearMatch ? parseInt(...) : new Date().getFullYear()`
--
-- El resultado es que un Dodge Forza 2015 quedaba registrado como de este año y
-- nadie lo notaba nunca, porque un dato inventado se ve igual que uno real.
--
-- Permitiendo el nulo, «no se sabe» se puede decir. Un hueco se ve y se
-- rellena; un año falso se queda mal para siempre.
-- ─────────────────────────────────────────────────────────────────────────────

alter table vehiculos alter column anio drop not null;

comment on column vehiculos.anio is
  'Año del vehículo. NULO = no se sabe. Nunca rellenar con el año en curso: '
  'un dato inventado no se distingue de uno real.';
