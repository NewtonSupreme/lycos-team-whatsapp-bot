-- Enlace real entre una orden y quien la hizo.
--
-- Hasta ahora el encargado vivía como texto dentro de `notas`
-- ("Encargados: TECNICO ALINEACION. RAFAEL"), sin apuntar a ninguna ficha. Eso
-- dejó 357 órdenes con una persona escrita y solo 21 comisiones generadas: el
-- trabajo estaba hecho y cobrado, y nadie cobró por él.
--
-- Cada elemento es {empleado_id, nombre, texto_original}. `texto_original`
-- conserva lo que se escribió a mano para poder auditar el enlace: si alguna
-- vez se enlazó mal, se ve contra qué se decidió.
alter table servicios
  add column if not exists encargados jsonb not null default '[]'::jsonb;

comment on column servicios.encargados is
  'Quién hizo el trabajo: [{empleado_id, nombre, texto_original}]. La comisión '
  'se genera en job_assignments; esto es solo el enlace con la persona.';

-- Se consulta "las órdenes de esta persona", así que el índice va por contenido.
create index if not exists idx_servicios_encargados
  on servicios using gin (encargados);
