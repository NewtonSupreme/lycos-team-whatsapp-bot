'use client';

// ─────────────────────────────────────────────────────────────────────────────
// DesglosePagoBancos — captura de pago con clasificación EXACTA por banco/cuenta.
// Componente controlado y reutilizable por: POS de ventas, POS de silenciadores y
// el modal de cobro de servicios. Cada botón/monto cae en su columna de ventas_dia.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '@/lib/utils';
import {
  BANK_METHODS, type Bins, type BankBin,
  binToUSD, binsTotalUSD,
} from '@/lib/reporte/ventas-mapping';

interface Props {
  bins: Bins;
  onBinsChange: (bins: Bins) => void;
  /** Monto objetivo a cobrar en USD (normalmente el total con IVA). */
  totalUSD: number;
  tasa: number;
  className?: string;
  compact?: boolean;
  /** Bins a ocultar de la cuadrícula (siguen contando en los totales). Ej: ['cashea'] cuando el host tiene su propio panel Cashea. */
  hideBins?: BankBin[];
}

const GRUPOS: { key: string; titulo: string; ids: BankBin[] }[] = [
  { key: 'banesco', titulo: 'Banesco (jurídica · fiscal)', ids: ['pago_movil_banesco', 'punto_banesco'] },
  { key: 'otros_bancos', titulo: 'BNC · Banca Amiga · Exterior', ids: ['bnc', 'punto_bancamiga', 'pago_movil_exterior'] },
  { key: 'divisa', titulo: 'Divisas / Cripto', ids: ['dolares', 'zelle', 'binance'] },
  { key: 'otros', titulo: 'Efectivo Bs / Cashea', ids: ['efectivo_bs', 'cashea'] },
];

export default function DesglosePagoBancos({ bins, onBinsChange, totalUSD, tasa, className, compact, hideBins = [] }: Props) {
  const pagadoUSD = binsTotalUSD(bins, tasa);
  const restanteUSD = Math.round((totalUSD - pagadoUSD) * 100) / 100;

  const setBin = (id: BankBin, nativeValue: number) => {
    onBinsChange({ ...bins, [id]: Math.max(0, Math.round((Number(nativeValue) || 0) * 100) / 100) });
  };

  // "Saldar" — asigna a este método el restante pendiente (convertido a su moneda).
  const saldar = (id: BankBin) => {
    const meta = BANK_METHODS.find(m => m.id === id)!;
    if (restanteUSD <= 0) return;
    const addNative = meta.moneda === 'Bs' ? restanteUSD * (tasa || 0) : restanteUSD;
    setBin(id, (bins[id] || 0) + addNative);
  };

  const clearAll = () => {
    const cleared = { ...bins };
    (Object.keys(cleared) as BankBin[]).forEach(k => (cleared[k] = 0));
    onBinsChange(cleared);
  };

  const cuadra = Math.abs(restanteUSD) < 0.01;

  return (
    <div className={cn('rounded-2xl border border-border/50 bg-background/40 p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Cómo pagó el cliente</p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">Toca el banco/cuenta exacto</p>
        </div>
        <button type="button" onClick={clearAll}
          className="text-[9px] font-black uppercase text-muted-foreground hover:text-destructive px-2 py-1 rounded-lg border border-border/40">
          Limpiar
        </button>
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
        {GRUPOS.map(grupo => {
          const ids = grupo.ids.filter(id => !hideBins.includes(id));
          if (ids.length === 0) return null;
          return (
          <div key={grupo.key} className="rounded-xl border border-border/30 bg-card/40 p-2.5 space-y-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/80">{grupo.titulo}</p>
            {ids.map(id => {
              const meta = BANK_METHODS.find(m => m.id === id)!;
              const nativo = bins[id] || 0;
              const usdEq = binToUSD(id, nativo, tasa);
              const activo = nativo > 0;
              return (
                <div key={id} className={cn(
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all',
                  activo ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-background/30'
                )}>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[10px] font-black uppercase tracking-tight truncate', meta.color)}>{meta.short}</p>
                    {meta.moneda === 'Bs' && nativo > 0 && (
                      <p className="text-[8px] text-muted-foreground font-bold">≈ ${usdEq.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 bg-background/60 rounded-lg border border-border/40 px-1.5">
                    <span className="text-[9px] font-bold text-muted-foreground">{meta.moneda === 'Bs' ? 'Bs' : '$'}</span>
                    <input
                      type="number" min={0} step="0.01" inputMode="decimal"
                      value={nativo || ''}
                      onChange={e => setBin(id, parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-16 text-right text-[11px] font-black bg-transparent border-none p-0 py-1 focus:outline-none focus:ring-0 text-foreground"
                    />
                  </div>
                  <button type="button" onClick={() => saldar(id)} title="Saldar el restante con este método"
                    className="text-[8px] font-black uppercase text-primary/80 hover:text-primary px-1.5 py-1 rounded-md hover:bg-primary/10 flex-shrink-0">
                    Saldar
                  </button>
                </div>
              );
            })}
          </div>
          );
        })}
      </div>

      {/* Resumen de cuadre */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="rounded-xl bg-background/50 border border-border/40 p-2 text-center">
          <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">A cobrar</p>
          <p className="text-xs font-black">${Number(totalUSD || 0).toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-2 text-center">
          <p className="text-[8px] font-black text-green-500 uppercase tracking-widest">Pagado</p>
          <p className="text-xs font-black text-green-500">${pagadoUSD.toFixed(2)}</p>
        </div>
        <div className={cn('rounded-xl border p-2 text-center',
          cuadra ? 'bg-green-500/5 border-green-500/20' : restanteUSD > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-sky-500/5 border-sky-500/20')}>
          <p className={cn('text-[8px] font-black uppercase tracking-widest', cuadra ? 'text-green-500' : restanteUSD > 0 ? 'text-amber-500' : 'text-sky-500')}>
            {cuadra ? 'Cuadra' : restanteUSD > 0 ? 'Falta' : 'Vuelto'}
          </p>
          <p className={cn('text-xs font-black', cuadra ? 'text-green-500' : restanteUSD > 0 ? 'text-amber-500' : 'text-sky-500')}>
            ${Math.abs(restanteUSD).toFixed(2)}
          </p>
        </div>
      </div>
      {tasa > 0 && (
        <p className="text-[8px] text-muted-foreground/70 text-center font-bold uppercase tracking-widest">
          Tasa aplicada: {Number(tasa).toFixed(2)} Bs/$
        </p>
      )}
    </div>
  );
}
