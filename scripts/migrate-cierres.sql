-- Run this in the Supabase SQL editor for your project
-- Step 1: Add columns to ventas_silenciadores
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS tasa_cambio numeric(12,4) DEFAULT NULL;
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT NULL;
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS precio_registrado numeric(12,2) DEFAULT NULL;

-- Step 2: Create cierres_caja table
CREATE TABLE IF NOT EXISTS cierres_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id uuid,
  fecha date NOT NULL,
  periodo text NOT NULL DEFAULT 'dia',
  fecha_inicio date,
  fecha_fin date,
  total_ingresos_usd numeric(12,2) DEFAULT 0,
  total_bs numeric(16,2) DEFAULT 0,
  tasa_bcv numeric(12,4) DEFAULT 0,
  total_clientes integer DEFAULT 0,
  total_ventas integer DEFAULT 0,
  desglose_pagos jsonb DEFAULT '{}',
  ventas_dia_ids text[] DEFAULT '{}',
  ventas_sil_ids text[] DEFAULT '{}',
  inventario_snapshot jsonb DEFAULT '[]',
  comparativo jsonb DEFAULT '{}',
  notas text,
  generado_por text,
  admin_only_delete boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_cierres" ON cierres_caja FOR SELECT USING (true);
CREATE POLICY "insert_cierres" ON cierres_caja FOR INSERT WITH CHECK (true);
CREATE POLICY "update_cierres" ON cierres_caja FOR UPDATE USING (true);
-- Delete is intentionally NOT created - only service role can delete
