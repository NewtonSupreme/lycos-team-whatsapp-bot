'use client';

import React, { useRef } from 'react';
import { Receipt, Image as ImageIcon, X, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComprobanteValue {
  referencia: string;
  file: File | null;
  previewUrl: string | null;
}

interface Props {
  value: ComprobanteValue;
  onChange: (v: ComprobanteValue) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Bloque reutilizable para adjuntar el comprobante / referencia de un pago
 * (pago móvil, transferencia, Zelle, etc.) a una venta o servicio.
 * Maneja la referencia de texto + la imagen con preview. La subida al storage
 * la hace el flujo de guardado con `uploadComprobante`.
 */
export function ComprobanteInput({ value, onChange, className, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const previewUrl = URL.createObjectURL(file);
    onChange({ ...value, file, previewUrl });
  };

  const clearImage = () => {
    if (value.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange({ ...value, file: null, previewUrl: null });
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card/40 p-3 space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          Comprobante de pago <span className="font-normal normal-case opacity-60">(opcional)</span>
        </span>
      </div>

      {/* Referencia / Nro de operación */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Referencia / Nro. de operación
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Ej: 004512789"
          value={value.referencia}
          onChange={(e) => onChange({ ...value, referencia: e.target.value })}
          className="w-full h-9 rounded-lg bg-background/60 border border-border px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Imagen del pago */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] || null)}
      />

      {value.previewUrl ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.previewUrl}
            alt="Comprobante"
            className={cn('w-full rounded-lg border border-border object-contain bg-black/20', compact ? 'max-h-32' : 'max-h-48')}
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors"
            aria-label="Quitar imagen"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 h-16 rounded-lg border-2 border-dashed border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Paperclip className="w-4 h-4" />
          <span className="text-xs font-bold">Adjuntar imagen del pago móvil / transferencia</span>
          <ImageIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export const emptyComprobante = (): ComprobanteValue => ({ referencia: '', file: null, previewUrl: null });
