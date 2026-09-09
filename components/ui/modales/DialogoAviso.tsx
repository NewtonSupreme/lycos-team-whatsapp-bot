'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import ModalPortal from '@/components/ui/modal-portal';
import { cn } from '@/lib/utils';

export type TipoAviso = 'confirmar' | 'peligro' | 'exito' | 'error' | 'info';

/** El aspecto de cada tipo: icono, colores y qué botón manda. */
const PINTA: Record<TipoAviso, {
  icono: React.ReactNode;
  fondo: string;
  color: string;
  titulo: string;
  botonTono: string;
}> = {
  confirmar: {
    icono: <AlertTriangle className="h-[30px] w-[30px]" aria-hidden />,
    fondo: 'bg-[#fff4ec]', color: 'text-[#f97316]', titulo: 'text-[#16181d]',
    botonTono: 'bg-[#f97316] hover:bg-[#ea580c]',
  },
  peligro: {
    icono: <AlertTriangle className="h-[30px] w-[30px]" aria-hidden />,
    fondo: 'bg-[#fdeaea]', color: 'text-[#dc2626]', titulo: 'text-[#16181d]',
    botonTono: 'bg-[#dc2626] hover:bg-[#b91c1c]',
  },
  exito: {
    icono: <CheckCircle2 className="h-[30px] w-[30px]" aria-hidden />,
    fondo: 'bg-[#e8f7ee]', color: 'text-[#16a34a]', titulo: 'text-[#16a34a]',
    botonTono: 'bg-[#16a34a] hover:bg-[#15803d]',
  },
  error: {
    icono: <XCircle className="h-[30px] w-[30px]" aria-hidden />,
    fondo: 'bg-[#fdeaea]', color: 'text-[#dc2626]', titulo: 'text-[#dc2626]',
    botonTono: 'bg-[#dc2626] hover:bg-[#b91c1c]',
  },
  info: {
    icono: <Info className="h-[30px] w-[30px]" aria-hidden />,
    fondo: 'bg-[#e7f0fe]', color: 'text-[#2563eb]', titulo: 'text-[#2563eb]',
    botonTono: 'bg-[#2563eb] hover:bg-[#1d4ed8]',
  },
};

export interface AvisoConfig {
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  /** Texto del botón que confirma. */
  confirmar?: string;
  /** Texto del botón que cancela. Sin él, el aviso solo tiene aceptar. */
  cancelar?: string;
  /** Detalle secundario: la lista de lo que se va a borrar, el error técnico… */
  detalle?: string;
}

interface Props extends AvisoConfig {
  abierto: boolean;
  ocupado?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Los avisos del sistema: confirmar, éxito, error e información.
 *
 * Sustituyen a `confirm()` y `alert()`, de los que había 163 repartidos por el
 * proyecto. El nativo bloquea el hilo, no se puede diseñar, en móvil aparece
 * como un aviso del navegador —no de la aplicación— y no distingue entre
 * «guardado» y «esto borra 500 registros». Los dos se ven exactamente igual,
 * que en un sistema donde se mueve dinero es un problema de verdad.
 */
export default function DialogoAviso({
  abierto, tipo, titulo, mensaje, detalle, confirmar, cancelar, ocupado,
  onConfirmar, onCancelar,
}: Props) {
  if (!abierto) return null;
  const p = PINTA[tipo];
  const soloAceptar = !cancelar;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/45 p-4"
        onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) onCancelar(); }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={titulo}
          className="w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="px-6 pb-2 pt-7 text-center">
            <span className={cn('mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full', p.fondo, p.color)}>
              {p.icono}
            </span>
            <h2 className={cn('mt-4 text-[18px] font-extrabold tracking-tight', p.titulo)}>{titulo}</h2>
            <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-[#5b616e]">{mensaje}</p>

            {detalle && (
              <p className="mx-auto mt-2.5 max-w-[320px] rounded-lg bg-[#fafbfc] px-3 py-2 text-left text-[11.5px] leading-snug text-[#8a909c]">
                {detalle}
              </p>
            )}
          </div>

          <div className={cn('flex gap-2 p-5', soloAceptar ? '' : 'flex-col-reverse sm:flex-row')}>
            {cancelar && (
              <button
                onClick={onCancelar}
                disabled={ocupado}
                className="h-[42px] flex-1 rounded-lg border border-[#e2e5ea] text-[13px] font-medium text-[#3d4350] transition-colors hover:bg-[#f6f7f9] disabled:opacity-45"
              >
                {cancelar}
              </button>
            )}
            <button
              onClick={onConfirmar}
              disabled={ocupado}
              autoFocus
              className={cn(
                'flex h-[42px] flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-45',
                p.botonTono,
              )}
            >
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {confirmar || 'Aceptar'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
