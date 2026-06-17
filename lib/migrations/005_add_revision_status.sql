-- Migration to add 'en_revision' status to servicios table

DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the constraint name for the 'estado' column on the 'servicios' table
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'servicios'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%estado%';

    -- If a constraint was found, drop it
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE servicios DROP CONSTRAINT ' || constraint_name;
    END IF;

    -- Add the new constraint with all used states included
    ALTER TABLE servicios ADD CONSTRAINT servicios_estado_check 
        CHECK (estado IN ('pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'finalizado', 'cancelada', 'cancelado'));
END $$;
