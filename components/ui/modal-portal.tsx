'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Saca un modal fuera de donde se declaró y lo monta en `document.body`.
 *
 * Hace falta porque `position: fixed` deja de referirse a la ventana en cuanto
 * un ancestro tiene `transform`, `filter` o `backdrop-filter` —y los diálogos
 * de Radix llevan `translate(-50%, -50%)`—. Un modal abierto desde dentro de
 * otro modal quedaba entonces confinado a la caja del de afuera: recortado por
 * arriba y por abajo, con su propia barra de scroll y sin encabezado visible.
 *
 * Montar en el body lo devuelve a la ventana completa, sin importar desde
 * dónde se abra.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false);

  // El portal necesita el DOM, que en el servidor no existe.
  useEffect(() => {
    // Guarda de hidratación: no hay otra forma de saber que ya estamos en el
    // navegador, que es donde existe el DOM donde se monta el portal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMontado(true);
    // Mientras hay un modal abierto, la página de atrás no debe desplazarse.
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, []);

  if (!montado || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
