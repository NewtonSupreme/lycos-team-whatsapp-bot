'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import ModalPortal from '@/components/ui/modal-portal';
import { cn } from '@/lib/utils';

export type AnchoModal = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const ANCHOS: Record<AnchoModal, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[920px]',
  full: 'max-w-[1200px]',
};

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  /** Icono de la cabecera. Sin él, la cabecera va sin recuadro de color. */
  icono?: ReactNode;
  tinteIcono?: string;
  ancho?: AnchoModal;
  children: ReactNode;
  /** Botones del pie. Sin ellos el pie no se dibuja. */
  pie?: ReactNode;
  /** Impide cerrar con Escape o tocando fuera. Para operaciones en curso. */
  bloqueado?: boolean;
  className?: string;
}

/**
 * El armazón común de todos los modales del sistema.
 *
 * Todo lo que hace falta para que un diálogo se comporte bien está aquí una
 * sola vez: se monta en un portal —si no, `position: fixed` queda confinado por
 * cualquier ancestro con `transform` y el modal sale recortado—, se cierra con
 * Escape, devuelve el foco a donde estaba y su cuerpo desplaza por dentro en
 * vez de estirar la página.
 *
 * Cada uno de esos detalles se había resuelto a mano, distinto, en cada
 * pantalla. Tenerlo en un sitio es lo que hace que veinticuatro modales se
 * comporten igual.
 */
export default function ModalBase({
  abierto, onCerrar, titulo, subtitulo, icono, tinteIcono = 'bg-[#fff1e7] text-[#f97316]',
  ancho = 'md', children, pie, bloqueado, className,
}: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);

  // Escape cierra, salvo que haya algo en curso que no convenga interrumpir.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueado) onCerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto, bloqueado, onCerrar]);

  // El foco entra al modal y vuelve a su sitio al cerrarse: quien navega con
  // teclado no debe acabar perdido al final de la página.
  useEffect(() => {
    if (!abierto) return;
    focoPrevio.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      const primero = caja.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]), select, textarea, button:not([aria-label="Cerrar"])',
      );
      (primero || caja.current)?.focus();
    }, 40);
    return () => {
      clearTimeout(t);
      focoPrevio.current?.focus?.();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6"
        onMouseDown={e => { if (e.target === e.currentTarget && !bloqueado) onCerrar(); }}
      >
        <div
          ref={caja}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          tabIndex={-1}
          className={cn(
            'flex min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none',
            ANCHOS[ancho],
            className,
          )}
          style={{ maxHeight: 'calc(100vh - 48px)' }}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-[#eef0f3] px-5 py-4">
            {icono && (
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tinteIcono)}>
                {icono}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-bold text-[#16181d]">{titulo}</h2>
              {subtitulo && <p className="truncate text-[12px] text-[#8a909c]">{subtitulo}</p>}
            </div>
            <button
              onClick={onCerrar}
              disabled={bloqueado}
              aria-label="Cerrar"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] transition-colors hover:bg-[#f6f7f9] disabled:opacity-40"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {pie && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#eef0f3] px-5 py-3.5">
              {pie}
            </footer>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

/** Botón secundario del pie: cancelar, cerrar, volver. */
export function BotonSecundario({
  children, onClick, disabled,
}: {
  children: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-[40px] rounded-lg border border-[#e2e5ea] px-4 text-[13px] font-medium text-[#3d4350] transition-colors hover:bg-[#f6f7f9] disabled:opacity-45"
    >
      {children}
    </button>
  );
}

/** Botón principal del pie. `tono` marca si la acción destruye algo. */
export function BotonPrincipal({
  children, onClick, disabled, tono = 'naranja', type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tono?: 'naranja' | 'rojo' | 'verde' | 'azul';
  type?: 'button' | 'submit';
}) {
  const TONOS = {
    naranja: 'bg-[#f97316] hover:bg-[#ea580c]',
    rojo: 'bg-[#dc2626] hover:bg-[#b91c1c]',
    verde: 'bg-[#16a34a] hover:bg-[#15803d]',
    azul: 'bg-[#2563eb] hover:bg-[#1d4ed8]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[40px] items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white transition-colors disabled:opacity-45',
        TONOS[tono],
      )}
    >
      {children}
    </button>
  );
}

/** Campo de formulario con su etiqueta, para que todos midan igual. */
export function Campo({
  label, obligatorio, children, ancho,
}: {
  label: string; obligatorio?: boolean; children: ReactNode; ancho?: boolean;
}) {
  return (
    <label className={cn('block', ancho && 'sm:col-span-2')}>
      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
        {label}
        {obligatorio && <span className="text-[#dc2626]"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** Estilo compartido de inputs y selects dentro de los modales. */
export const CLASE_INPUT =
  'h-[40px] w-full rounded-lg border border-[#e2e5ea] px-3 text-[13px] text-[#16181d] '
  + 'outline-none placeholder:text-[#c3c8d0] focus:border-[#f97316] disabled:opacity-60';
