'use client';
/**
 * Selector de métodos de pago (Orden de Servicio / POS).
 *
 * Lo que se captura aquí se guarda en `servicios.metodos_pago` (siempre en USD,
 * la moneda canónica) y al completar el servicio se vuelca a las columnas de
 * `ventas_dia` (lib/categorias.ts → buildPagoColumns), que es lo que lee el
 * Reporte de Ventas.
 *
 * Cada método en bolívares/euros permite escribir el monto en SU moneda o en USD:
 * la conversión es automática con la tasa elegida (BCV $, BCV €, paralela o una
 * tasa personalizada). La tasa BCV es la REAL DEL DÍA del servicio.
 */
import { useEffect, useState } from 'react';
import { METODOS_PAGO, sumaMetodos } from '@/lib/categorias';
import { Check, AlertTriangle, RefreshCw, Loader2, ArrowLeftRight } from 'lucide-react';

export type TipoTasa = 'bcv' | 'eur' | 'paralelo' | 'custom';

export interface TasasPago {
  bcv: number;       // Bs por 1 USD
  paralelo: number;  // Bs por 1 USD
  eur_bs: number;    // Bs por 1 EUR
  fecha?: string;
  aproximada?: boolean;
}

interface Props {
  value: Record<string, number>;          // SIEMPRE en USD
  onChange: (v: Record<string, number>) => void;
  total?: number;                          // total a cobrar (USD)
  /** Fecha del servicio: se usa para traer la tasa EXACTA de ese día. */
  fecha?: string;
  /** Tasa personalizada compartida (Bs por USD). */
  tasaCustom?: number;
  onTasaCustomChange?: (n: number) => void;
}

const n2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function MetodosPagoPicker({
  value, onChange, total = 0, fecha, tasaCustom = 0, onTasaCustomChange,
}: Props) {
  const [tasas, setTasas] = useState<TasasPago | null>(null);
  const [cargandoTasas, setCargandoTasas] = useState(true);
  // Tipo de tasa elegido POR MÉTODO (cada pago puede usar una tasa distinta).
  const [tipoTasa, setTipoTasa] = useState<Record<string, TipoTasa>>({});
  // Texto que el usuario escribe en moneda local (Bs/€), por método.
  const [montoLocal, setMontoLocal] = useState<Record<string, string>>({});

  // ── Tasa REAL del día del servicio ────────────────────────────────────────
  const cargarTasas = async () => {
    setCargandoTasas(true);
    try {
      const qs = fecha ? `?fecha=${fecha.slice(0, 10)}` : '';
      const r = await fetch(`/api/tasas${qs}`);
      const d = await r.json();
      if (d?.bcv) setTasas({ bcv: d.bcv, paralelo: d.paralelo, eur_bs: d.eur_bs, fecha: d.fecha, aproximada: d.aproximada });
    } catch { /* noop */ }
    setCargandoTasas(false);
  };

  useEffect(() => { cargarTasas(); /* eslint-disable-next-line */ }, [fecha]);

  /** Tasa efectiva (unidades de moneda local por 1 USD) para un método. */
  const tasaDe = (key: string): { tasa: number; simbolo: string; etiqueta: string } => {
    const def = METODOS_PAGO.find(m => m.key === key);
    const tipo: TipoTasa = tipoTasa[key] || (def?.moneda === 'EUR' ? 'eur' : 'bcv');

    if (tipo === 'custom') return { tasa: tasaCustom || 0, simbolo: 'Bs', etiqueta: 'Personalizada' };
    if (tipo === 'eur') {
      // (Bs por $) ÷ (Bs por €) = € por 1 USD  → el monto local se escribe en euros
      const eurPorUsd = tasas && tasas.eur_bs > 0 && tasas.bcv > 0 ? tasas.bcv / tasas.eur_bs : 0;
      return { tasa: eurPorUsd, simbolo: '€', etiqueta: 'BCV €' };
    }
    if (tipo === 'paralelo') return { tasa: tasas?.paralelo || 0, simbolo: 'Bs', etiqueta: 'Paralela' };
    return { tasa: tasas?.bcv || 0, simbolo: 'Bs', etiqueta: 'BCV $' };
  };

  const esLocal = (key: string) => {
    const def = METODOS_PAGO.find(m => m.key === key);
    return def?.moneda === 'VES' || def?.moneda === 'EUR';
  };

  const toggle = (key: string) => {
    const next = { ...value };
    if (next[key] !== undefined) {
      delete next[key];
      const ml = { ...montoLocal }; delete ml[key]; setMontoLocal(ml);
    } else {
      next[key] = 0;
    }
    onChange(next);
  };

  /** El usuario escribe en USD → se refleja el equivalente local. */
  const setUsd = (key: string, usd: number) => {
    onChange({ ...value, [key]: n2(usd) });
    const { tasa } = tasaDe(key);
    setMontoLocal(m => ({ ...m, [key]: tasa > 0 ? String(n2(usd * tasa)) : '' }));
  };

  /** El usuario escribe en Bs/€ → se convierte a USD (lo que se guarda). */
  const setLocal = (key: string, txt: string) => {
    setMontoLocal(m => ({ ...m, [key]: txt }));
    const local = parseFloat(txt) || 0;
    const { tasa } = tasaDe(key);
    onChange({ ...value, [key]: tasa > 0 ? n2(local / tasa) : 0 });
  };

  /** Cambiar el tipo de tasa recalcula el USD manteniendo el monto local escrito. */
  const cambiarTipoTasa = (key: string, tipo: TipoTasa) => {
    setTipoTasa(t => ({ ...t, [key]: tipo }));
    const local = parseFloat(montoLocal[key] || '') || 0;
    if (local > 0) {
      const def = METODOS_PAGO.find(m => m.key === key);
      let tasa = 0;
      if (tipo === 'custom') tasa = tasaCustom || 0;
      else if (tipo === 'eur') tasa = tasas && tasas.eur_bs > 0 && tasas.bcv > 0 ? tasas.bcv / tasas.eur_bs : 0;
      else if (tipo === 'paralelo') tasa = tasas?.paralelo || 0;
      else tasa = tasas?.bcv || 0;
      onChange({ ...value, [key]: tasa > 0 ? n2(local / tasa) : 0 });
    }
  };

  /** Completa el método con lo que falta para llegar al total. */
  const completar = (key: string) => {
    const otros = Object.entries(value).reduce((s, [k, v]) => (k === key ? s : s + (Number(v) || 0)), 0);
    const falta = n2(Math.max(0, total - otros));
    setUsd(key, falta);
  };

  const pagado = sumaMetodos(value);
  const restante = n2(total - pagado);
  const activos = Object.keys(value);

  return (
    <div className="space-y-3">
      {/* Barra de tasas del día */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
        {cargandoTasas ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando tasas…
          </span>
        ) : tasas ? (
          <>
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Tasas {tasas.fecha ? `del ${tasas.fecha}` : 'de hoy'}
            </span>
            <span className="text-[11px] font-bold text-emerald-500">BCV $ {tasas.bcv.toFixed(2)}</span>
            <span className="text-[11px] font-bold text-blue-500">BCV € {tasas.eur_bs.toFixed(2)}</span>
            <span className="text-[11px] font-bold text-amber-500">Paralela {tasas.paralelo.toFixed(2)}</span>
            {tasas.aproximada && (
              <span className="text-[10px] text-amber-500/80 italic">(aprox.)</span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-amber-500">No se pudieron cargar las tasas</span>
        )}
        <button
          type="button"
          onClick={cargarTasas}
          className="ml-auto text-muted-foreground hover:text-foreground"
          title="Actualizar tasas"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargandoTasas ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tasa personalizada compartida */}
      {onTasaCustomChange && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Tasa personalizada</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">Bs</span>
            <input
              type="number" step="0.01" placeholder="0.00"
              value={tasaCustom || ''}
              onChange={e => onTasaCustomChange(parseFloat(e.target.value) || 0)}
              className="w-28 h-8 rounded-lg border border-border bg-background/60 pl-7 pr-2 text-sm"
            />
          </div>
          <span className="text-[10px] text-muted-foreground">por $1</span>
        </div>
      )}

      {/* Chips de métodos */}
      <div className="flex flex-wrap gap-1.5">
        {METODOS_PAGO.map(m => {
          const activo = value[m.key] !== undefined;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(m.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1 ${
                activo
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-muted/40 border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              {activo && <Check className="w-3 h-3" />}
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Fila por método activo */}
      {activos.length > 0 && (
        <div className="space-y-2">
          {activos.map(key => {
            const def = METODOS_PAGO.find(m => m.key === key);
            const usd = value[key] || 0;
            const local = esLocal(key);
            const { tasa, simbolo, etiqueta } = tasaDe(key);
            const tipoActual: TipoTasa = tipoTasa[key] || (def?.moneda === 'EUR' ? 'eur' : 'bcv');

            return (
              <div key={key} className="rounded-xl border border-border bg-muted/20 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate">{def?.label || key}</span>
                  <button
                    type="button"
                    onClick={() => completar(key)}
                    className="text-[10px] font-bold text-primary hover:underline shrink-0"
                    title="Poner el monto que falta para completar el total"
                  >
                    Completar
                  </button>
                </div>

                {/* Selector de tasa (sólo para métodos en Bs/€) */}
                {local && (
                  <div className="flex flex-wrap items-center gap-1">
                    {([
                      { id: 'bcv', label: 'BCV $' },
                      { id: 'eur', label: 'BCV €' },
                      { id: 'paralelo', label: 'Paralela' },
                      { id: 'custom', label: 'Personal.' },
                    ] as { id: TipoTasa; label: string }[]).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => cambiarTipoTasa(key, t.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                          tipoActual === t.id
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background/50 text-muted-foreground border-border hover:border-primary/40'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {tasa > 0 ? `${simbolo} ${tasa.toFixed(2)} / $` : '⚠ sin tasa'}
                    </span>
                  </div>
                )}

                {/* Entrada dual: moneda local ↔ USD */}
                <div className="flex items-center gap-2">
                  {local && (
                    <>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                          {simbolo}
                        </span>
                        <input
                          type="number" step="0.01" placeholder="0.00"
                          value={montoLocal[key] ?? (tasa > 0 && usd > 0 ? String(n2(usd * tasa)) : '')}
                          onChange={e => setLocal(key, e.target.value)}
                          className="w-full h-9 rounded-lg border border-border bg-background/60 pl-7 pr-2 text-sm font-semibold"
                        />
                      </div>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </>
                  )}
                  <div className={`relative ${local ? 'flex-1' : 'w-full'}`}>
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-emerald-500 font-bold">$</span>
                    <input
                      type="number" step="0.01" placeholder="0.00"
                      value={usd || ''}
                      onChange={e => setUsd(key, parseFloat(e.target.value) || 0)}
                      className="w-full h-9 rounded-lg border border-emerald-500/30 bg-emerald-500/5 pl-6 pr-2 text-sm font-bold text-emerald-600 dark:text-emerald-400"
                    />
                  </div>
                </div>

                {local && (
                  <p className="text-[10px] text-muted-foreground">
                    Escribe en {simbolo} o en $ — el otro campo se calcula solo ({etiqueta}). Se guarda en USD.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resumen */}
      {activos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 border border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            Pagado: <b className="text-foreground">${pagado.toFixed(2)}</b>
            {total > 0 && <> / ${total.toFixed(2)}</>}
            {tasas && pagado > 0 && (
              <span className="ml-2 text-muted-foreground/70">
                ≈ Bs {(pagado * tasas.bcv).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
              </span>
            )}
          </span>
          {total > 0 && Math.abs(restante) > 0.009 ? (
            <span className={`text-[11px] font-bold flex items-center gap-1 ${restante > 0 ? 'text-amber-500' : 'text-red-500'}`}>
              <AlertTriangle className="w-3 h-3" />
              {restante > 0 ? `Falta $${restante.toFixed(2)}` : `Sobra $${Math.abs(restante).toFixed(2)}`}
            </span>
          ) : total > 0 ? (
            <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
              <Check className="w-3 h-3" /> Completo
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
