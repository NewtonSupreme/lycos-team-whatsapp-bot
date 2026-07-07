'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Puente global que convierte cualquier `window.alert(...)` del sistema en un
 * toast premium (sonner), clasificándolo automáticamente como éxito / error /
 * advertencia / info según el contenido del mensaje.
 *
 * Esto da cobertura COMPLETA e instantánea a todos los módulos (registro
 * completado / fallido) sin tener que tocar cada llamada. Los flujos clave
 * además usan `notify` directamente para títulos + descripciones más ricos.
 *
 * No se toca `window.confirm` (devuelve boolean y debe seguir siendo nativo).
 */

const ERROR_HINTS = [
  'error', 'falló', 'fallo', 'no se pudo', 'no tienes permiso', 'inválid',
  'invalid', 'requerid', 'obligatori', 'debes', 'no hay', 'no existe',
  'incorrect', 'denegad', 'rechazad', 'cancelad',
];
const WARNING_HINTS = [
  'advertencia', 'atención', 'atencion', 'cuidado', 'ya existe',
  'duplicad', 'pendiente', 'agrega al menos', 'selecciona', 'indica',
];
const SUCCESS_HINTS = [
  'éxito', 'exito', 'exitos', 'completad', 'creado', 'creada', 'registrad',
  'guardad', 'actualizad', 'eliminad', 'enviad', 'agregad', 'listo',
  'correctamente', 'aprobad', 'convertid', '✅', '🎉',
];

function classify(message: string): 'success' | 'error' | 'warning' | 'info' {
  const m = (message || '').toLowerCase();
  if (ERROR_HINTS.some(h => m.includes(h))) return 'error';
  if (SUCCESS_HINTS.some(h => m.includes(h))) return 'success';
  if (WARNING_HINTS.some(h => m.includes(h))) return 'warning';
  return 'info';
}

/** Separa "Título: detalle" o "Título. detalle" para un toast con descripción. */
function splitMessage(raw: string): { title: string; description?: string } {
  const message = (raw ?? '').toString().trim();
  if (message.length <= 64) return { title: message };
  // Cortar por el primer salto de línea, ": " o ". "
  const idx = (() => {
    const nl = message.indexOf('\n');
    if (nl > 0 && nl < 80) return nl;
    const colon = message.indexOf(': ');
    if (colon > 0 && colon < 60) return colon + 1;
    const dot = message.indexOf('. ');
    if (dot > 0 && dot < 60) return dot + 1;
    return -1;
  })();
  if (idx > 0) {
    return {
      title: message.slice(0, idx).replace(/[:.]$/, '').trim(),
      description: message.slice(idx + 1).trim(),
    };
  }
  return { title: message };
}

export function AlertToastBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const original = window.alert;

    window.alert = (msg?: any) => {
      try {
        const raw = msg == null ? '' : String(msg);
        const kind = classify(raw);
        const { title, description } = splitMessage(raw);
        const opts = { description, duration: kind === 'error' ? 6000 : 4000 };
        if (kind === 'error') toast.error(title, opts);
        else if (kind === 'success') toast.success(title, opts);
        else if (kind === 'warning') toast.warning(title, opts);
        else toast.info(title, opts);
      } catch {
        // Fallback al alert nativo si algo falla
        try { original?.call(window, msg); } catch { /* noop */ }
      }
    };

    return () => {
      window.alert = original;
    };
  }, []);

  return null;
}
