'use client';

import { supabase } from '@/lib/supabase';

export const COMPROBANTE_BUCKET = 'comprobantes';

/**
 * Devuelve un objeto con SOLO las columnas de comprobante que tienen valor.
 * Así, en ventas/servicios sin comprobante, no se envían las columnas — lo que
 * mantiene el sistema funcionando aunque la migración aún no se haya aplicado.
 */
export function comprobanteFields(
  url?: string | null,
  referencia?: string | null
): { comprobante_url?: string; comprobante_referencia?: string } {
  const out: { comprobante_url?: string; comprobante_referencia?: string } = {};
  if (url) out.comprobante_url = url;
  if (referencia) out.comprobante_referencia = referencia;
  return out;
}

/** Detecta el error de PostgREST cuando la columna de comprobante aún no existe. */
export function isMissingComprobanteColumn(err: any): boolean {
  const msg = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
  return err?.code === 'PGRST204'
    || (msg.includes('comprobante') && (msg.includes('column') || msg.includes('could not find') || msg.includes('schema cache')));
}

/** Quita las columnas de comprobante de un payload (para reintentar sin ellas). */
export function stripComprobante<T extends Record<string, any>>(obj: T): T {
  const c: Record<string, any> = { ...obj };
  delete c.comprobante_url;
  delete c.comprobante_referencia;
  return c as T;
}

/**
 * Sube la imagen de un comprobante de pago al bucket público 'comprobantes'
 * y devuelve la URL pública. Si no hay archivo, devuelve null.
 * No lanza: ante error devuelve null y loguea (la venta no debe romperse por esto).
 */
export async function uploadComprobante(file: File | null | undefined): Promise<string | null> {
  if (!file || !supabase) return null;
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${new Date().getFullYear()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(COMPROBANTE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (error) {
      console.error('Error subiendo comprobante:', error.message);
      return null;
    }
    const { data } = supabase.storage.from(COMPROBANTE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error('uploadComprobante:', e);
    return null;
  }
}
