'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Que lo que se ve en pantalla nunca se quede atrás de lo que hay en la base.
 *
 * Una pantalla (Reportes, Finanzas) recarga sus datos cuando:
 *   · otra parte del sistema avisa de un cambio (`avisarCambio`): una conciliación,
 *     una corrección de monto, un gasto registrado…
 *   · se vuelve a la pestaña después de un rato (se estuvo trabajando en otra);
 *   · la base cambia en alguna de las tablas que importan (tiempo real).
 * Los avisos seguidos se juntan en una sola recarga.
 */
export const EVENTO_CAMBIO = 'lycos:datos-cambiaron';

/** Avisa a las pantallas abiertas que los datos cambiaron: recargan solas. */
export function avisarCambio(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

const TABLAS = ['ventas_dia', 'egresos', 'abonos', 'servicios', 'traspasos_cuenta', 'conciliacion_corridas', 'conciliacion_acciones'];

export function useRefrescarAlCambiar(recargar: () => void, opciones: { minSegundosAlVolver?: number } = {}): void {
  const { minSegundosAlVolver = 20 } = opciones;
  const fn = useRef(recargar);
  fn.current = recargar;

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let ultima = Date.now();
    const lanzar = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => { ultima = Date.now(); fn.current(); }, 400);
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima > minSegundosAlVolver * 1000) lanzar();
    };
    window.addEventListener(EVENTO_CAMBIO, lanzar);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);

    // Tiempo real: si no está disponible no pasa nada, quedan los otros dos avisos.
    let canal: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    try {
      if (supabase) {
        canal = supabase.channel(`refrescar-${Math.random().toString(36).slice(2, 8)}`);
        for (const tabla of TABLAS) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, lanzar);
        canal.subscribe();
      }
    } catch { /* sin tiempo real */ }

    return () => {
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener(EVENTO_CAMBIO, lanzar);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      if (canal && supabase) supabase.removeChannel(canal);
    };
  }, [minSegundosAlVolver]);
}
