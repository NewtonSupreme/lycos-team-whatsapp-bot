-- ════════════════════════════════════════════════════════════════════════════
-- Comprobante de pago (referencia + imagen) para ventas y servicios convertidos.
-- La imagen se guarda en Supabase Storage (bucket público 'comprobantes') y aquí
-- solo se almacena la URL pública + la referencia/nro de operación del pago.
-- Idempotente: se puede correr varias veces sin problema.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Ventas del día (POS y silenciadores manuales) ──────────────────────────────
ALTER TABLE ventas_dia        ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE ventas_dia        ADD COLUMN IF NOT EXISTS comprobante_referencia text;

-- ── Ventas registradas por IA / WhatsApp ───────────────────────────────────────
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE ventas_silenciadores ADD COLUMN IF NOT EXISTS comprobante_referencia text;

-- ── Facturas (para que el comprobante viaje con la factura formal) ──────────────
ALTER TABLE facturas          ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE facturas          ADD COLUMN IF NOT EXISTS comprobante_referencia text;

-- ── Servicios (cuando un servicio se convierte en venta con su pago) ────────────
ALTER TABLE servicios         ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE servicios         ADD COLUMN IF NOT EXISTS comprobante_referencia text;

-- ── Bucket de Storage para los comprobantes (público para poder imprimirlos) ────
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas: lectura pública y escritura autenticada/anon (cliente usa anon key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'comprobantes_public_read'
  ) THEN
    CREATE POLICY "comprobantes_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'comprobantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'comprobantes_insert'
  ) THEN
    CREATE POLICY "comprobantes_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'comprobantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'comprobantes_update'
  ) THEN
    CREATE POLICY "comprobantes_update" ON storage.objects
      FOR UPDATE USING (bucket_id = 'comprobantes');
  END IF;
END $$;
