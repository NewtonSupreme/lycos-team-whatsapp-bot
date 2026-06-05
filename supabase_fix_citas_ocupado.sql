-- 1. Actualizar registros existentes con estado 'en_proceso' a 'pendiente'
UPDATE citas SET estado = 'pendiente' WHERE estado = 'en_proceso';

-- 2. Eliminar constraint anterior
ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_estado_check;

-- 3. Agregar nuevo constraint con 'ocupado' y 'en_proceso'
ALTER TABLE citas ADD CONSTRAINT citas_estado_check 
  CHECK (estado IN ('confirmada','pendiente','cancelada','completada','ocupado','en_proceso'));
