'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Wrench } from 'lucide-react';
import {
  buscarProductos, precioBcvDe, precioEfectivoDe, type ProductoInventario,
} from '@/components/inventario/SelectorRepuesto';

/**
 * El campo de descripción de un renglón, con el almacén detrás.
 *
 * Mientras se escribe va ofreciendo los artículos que casan, con su precio y
 * sus existencias. Elegir uno enlaza el renglón: el precio se rellena y el
 * stock se descontará al guardar.
 *
 * La idea es que enlazar sea más cómodo que escribir a mano, porque es la única
 * manera de que se haga siempre. Un aviso al final sirve para atajar el
 * despiste; esto sirve para que el despiste no ocurra.
 *
 * Se puede seguir escribiendo cualquier cosa: la mano de obra no está en el
 * catálogo y tiene que poder escribirse igual de rápido. Por eso las
 * sugerencias no bloquean nada y se cierran con Escape.
 */

interface Props {
  valor: string;
  onValor: (v: string) => void;
  productos: readonly ProductoInventario[];
  /** Solo sugiere si el renglón aún no está enlazado. */
  enlazado?: boolean;
  onElegir: (p: ProductoInventario) => void;
  tasa?: number;
  placeholder?: string;
  className?: string;
}

export default function CampoRenglon({
  valor, onValor, productos, enlazado, onElegir, tasa = 0,
  placeholder = 'Trabajo / repuesto', className,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  const sugerencias = useMemo(() => {
    if (enlazado) return [];
    const q = (valor || '').trim();
    // Con menos de dos letras la lista sería el catálogo entero y estorbaría.
    if (q.length < 2) return [];
    return buscarProductos(productos, q, 6);
  }, [productos, valor, enlazado]);

  // Al pinchar fuera se cierra: si no, la lista tapa los campos de al lado.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const visible = abierto && sugerencias.length > 0;

  const elegir = (p: ProductoInventario) => {
    onElegir(p);
    setAbierto(false);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setResaltado(i => (i + 1) % sugerencias.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setResaltado(i => (i - 1 + sugerencias.length) % sugerencias.length); }
    else if (e.key === 'Enter') {
      // Enter solo enlaza si el usuario se movió por la lista. Si no, estaría
      // secuestrando la tecla a quien está escribiendo mano de obra.
      if (resaltado > 0 || sugerencias.length === 1) { e.preventDefault(); elegir(sugerencias[resaltado]); }
    } else if (e.key === 'Escape') { setAbierto(false); }
  };

  return (
    <div ref={caja} className="relative min-w-0 flex-1">
      <input
        value={valor}
        onChange={e => { onValor(e.target.value); setAbierto(true); setResaltado(0); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />

      {visible && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          <p className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5 text-[9.5px] font-black uppercase tracking-wider text-muted-foreground">
            <Package className="h-3 w-3" aria-hidden />
            En el almacén — elige para que se descuente
          </p>
          <ul className="max-h-52 overflow-y-auto">
            {sugerencias.map((p, i) => {
              const efec = precioEfectivoDe(p);
              const bcv = precioBcvDe(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setResaltado(i)}
                    onClick={() => elegir(p)}
                    className={`flex w-full items-center gap-2 border-b border-border/25 px-2.5 py-1.5 text-left last:border-0 ${
                      i === resaltado ? 'bg-primary/10' : 'hover:bg-primary/5'
                    }`}
                  >
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[12px] font-semibold text-foreground">{p.nombre}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {[p.marca, p.codigo].filter(Boolean).join(' · ') || 'Sin código'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      <span className="block text-[11.5px] font-black tabular-nums text-primary">
                        ${efec.toFixed(2)}
                        {Math.abs(efec - bcv) > 0.009 && (
                          <span className="ml-1 text-[10px] font-bold text-teal-600">/ ${bcv.toFixed(2)}</span>
                        )}
                      </span>
                      {tasa > 0 && (
                        <span className="block text-[9.5px] tabular-nums text-muted-foreground">
                          Bs. {(bcv * tasa).toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                        Number(p.stock) > 0
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-red-500/10 text-red-500'
                      }`}
                    >
                      {Number(p.stock) || 0}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="flex items-center gap-1.5 border-t border-border/50 bg-muted/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
            <Wrench className="h-3 w-3 shrink-0" aria-hidden />
            ¿Es mano de obra? Sigue escribiendo y no elijas nada.
          </p>
        </div>
      )}
    </div>
  );
}
