'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LayoutGrid, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import AppLauncher from './AppLauncher';

/**
 * Botón flotante que abre el lanzador sobre la pantalla actual.
 *
 * Es una capa y no una navegación a propósito: mirar el catálogo, arrepentirse
 * y volver a lo que estabas haciendo no debería costarte perder la pantalla ni
 * el scroll donde estabas.
 *
 * Devuelve el foco al botón al cerrar y bloquea el scroll del fondo mientras
 * está abierto — sin eso, cerrar la capa deja al teclado perdido al principio
 * de la página y la rueda del ratón mueve lo que hay detrás.
 */
export default function LauncherFab() {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const cerrar = useCallback(() => {
    setOpen(false);
    fabRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar();
      }
    };
    window.addEventListener('keydown', onKey);

    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // El foco entra al panel para que el teclado siga dentro de la capa.
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input, a, button')?.focus();
    }, 60);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
      window.clearTimeout(t);
    };
  }, [open, cerrar]);

  return (
    <>
      <button
        ref={fabRef}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Cerrar el listado de módulos' : 'Ver todos los módulos'}
        title={open ? 'Cerrar' : 'Todos los módulos'}
        className={cn(
          'fixed right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg',
          'transition-[transform,filter] duration-200 hover:scale-105 hover:brightness-110',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          // En móvil sube por encima de la barra inferior; en escritorio no existe.
          'bottom-24 lg:bottom-6',
        )}
      >
        <span className={cn('transition-transform duration-200', open && 'rotate-90')}>
          {open ? <X className="h-6 w-6" aria-hidden /> : <LayoutGrid className="h-6 w-6" aria-hidden />}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) cerrar(); }}
        >
          {/* Entra desde el borde derecho, que es de donde nace el botón. */}
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Todos los módulos"
            className={cn(
              'absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden',
              'border-l border-border bg-surface-sunken shadow-lg',
              'sm:max-w-2xl lg:max-w-3xl',
              'motion-safe:animate-sheet-right',
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />
                <h2 className="text-sm font-semibold">Todos los módulos</h2>
              </div>
              <button
                onClick={cerrar}
                aria-label="Cerrar"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <AppLauncher variant="capa" onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
