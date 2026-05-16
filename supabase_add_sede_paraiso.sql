-- Script para agregar la sede de Caracas El Paraíso
INSERT INTO sedes (nombre, es_principal) 
VALUES ('Caracas El Paraíso', false)
ON CONFLICT DO NOTHING;

-- Nota: El ID será generado automáticamente por uuid_generate_v4()
