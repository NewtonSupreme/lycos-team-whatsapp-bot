-- Migración: 009_reporte_diario.sql
-- Descripción: Tabla de métricas diarias manuales (KPIs de Redes/App/RCV/Certificado)
--              que alimenta la Sección 8 del Reporte Diario Completo.
--              El resto del reporte se arma desde tablas existentes (ventas_dia, egresos,
--              servicios, clientes, inventario, ventas_silenciadores, job_assignments).

CREATE TABLE IF NOT EXISTS metricas_dia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_id UUID REFERENCES sedes(id) ON DELETE CASCADE,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Sección 8 · Redes sociales / Instagram
    redes_inicial INTEGER DEFAULT 0,
    redes_nuevos  INTEGER DEFAULT 0,

    -- Sección 8 · Registro en la App
    app_inicial INTEGER DEFAULT 0,
    app_nuevos  INTEGER DEFAULT 0,

    -- Sección 8 · RCV
    rcv_inicial INTEGER DEFAULT 0,
    rcv_nuevos  INTEGER DEFAULT 0,

    -- Sección 8 · Certificado médico
    cert_inicial INTEGER DEFAULT 0,
    cert_nuevos  INTEGER DEFAULT 0,

    notas TEXT,
    creado_por TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Una fila por sede por día
CREATE UNIQUE INDEX IF NOT EXISTS uq_metricas_dia_sede_fecha
    ON metricas_dia (COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid), fecha);

CREATE INDEX IF NOT EXISTS idx_metricas_dia_fecha ON metricas_dia(fecha DESC);

-- ──────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (permisiva, igual que el resto del proyecto: auth a nivel de app)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE metricas_dia ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'metricas_dia' AND policyname = 'Authenticated users - full access'
    ) THEN
        EXECUTE 'CREATE POLICY "Authenticated users - full access" ON metricas_dia
            FOR ALL USING (auth.role() = ''authenticated'')';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'metricas_dia' AND policyname = 'Service role - full access'
    ) THEN
        EXECUTE 'CREATE POLICY "Service role - full access" ON metricas_dia
            FOR ALL USING (true)';
    END IF;
END $$;
