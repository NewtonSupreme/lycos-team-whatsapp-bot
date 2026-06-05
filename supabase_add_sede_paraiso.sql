-- Script para agregar la sede de Caracas El Paraíso (con UUID fijo)
INSERT INTO sedes (id, nombre, es_principal) 
VALUES ('d3e4f5a6-b7c8-4901-cde3-456789012bcd', 'Caracas El Paraíso', false)
ON CONFLICT ON CONSTRAINT sedes_nombre_unique DO NOTHING;

-- Si el UUID ya existe pero con otro nombre, no hace nada
