'use client';
import React from 'react';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Las piezas sueltas con las que se arman Finanzas, Reportes y WhatsApp.
 *
 * Están juntas porque las tres pantallas del rediseño usan la misma tarjeta,
 * el mismo panel y la misma barra de pestañas. Cuando cada pantalla se dibuja
 * las suyas, a la tercera ya no coinciden ni los bordes ni los grises, y el
 * conjunto deja de parecer un mismo programa.
 */

// ── Tarjeta de indicador ────────────────────────────────────────────────────

interface PropsKpi {
  icono: React.ReactNode;
  /** Color del recuadro del icono, en clases de Tailwind. */
  tinte: string;
  etiqueta: string;
  valor: string;
  /** Variación contra el período anterior. `null` la oculta. */
  variacion?: number | null;
  /** Sufijo de la variación: «vs. mes anterior». */
  variacionPie?: string;
  /** Cuando bajar es lo bueno —los gastos—, se invierte el color. */
  subirEsBueno?: boolean;
  /** Texto de apoyo cuando no hay variación que enseñar. */
  pie?: string;
  /** La variación viene en puntos, no en porcentaje (márgenes). */
  enPuntos?: boolean;
}

export function TarjetaKpi({
  icono, tinte, etiqueta, valor, variacion, variacionPie = 'vs. mes anterior',
  subirEsBueno = true, pie, enPuntos,
}: PropsKpi) {
  const sube = (variacion ?? 0) > 0;
  // Verde no significa «subió», significa «va bien». Un gasto que sube no es
  // una buena noticia y pintarlo de verde por la flecha engaña.
  const bien = sube === subirEsBueno;

  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tinte)}>
          {icono}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] text-muted-foreground">{etiqueta}</span>
          <span className="mt-0.5 block truncate text-[19px] font-black leading-tight tracking-tight text-foreground tabular-nums">
            {valor}
          </span>
        </span>
      </div>
      <div className="mt-1.5 min-h-[16px] text-[11px]">
        {variacion != null ? (
          <span className={cn('inline-flex items-center gap-1 font-semibold',
            bien ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {sube ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
            {sube ? '+' : ''}{variacion.toFixed(enPuntos ? 1 : 0)}{enPuntos ? ' pts' : '%'}
            <span className="font-normal text-muted-foreground/70">{variacionPie}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/70">{pie || 'Sin comparación'}</span>
        )}
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

interface PropsPanel {
  titulo: string;
  subtitulo?: string;
  /** Lo que va a la derecha del título: un selector, un enlace. */
  accion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sin relleno: para paneles que llevan una tabla a sangre. */
  sinRelleno?: boolean;
}

export function Panel({ titulo, subtitulo, accion, children, className, sinRelleno }: PropsPanel) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-2xl border border-border bg-card', className)}>
      <header className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13.5px] font-bold text-foreground">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitulo}</p>}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </header>
      <div className={cn('min-h-0 flex-1', sinRelleno ? '' : 'px-3.5 pb-3.5')}>{children}</div>
    </section>
  );
}

/** El «Ver todas →» de la cabecera de un panel. */
export function EnlacePanel({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-[11.5px] font-semibold text-primary transition-colors hover:text-primary/70"
    >
      {children} <ArrowRight className="h-3 w-3" aria-hidden />
    </button>
  );
}

/** Selector compacto para la esquina de un panel. */
export function SelectorPanel<T extends string>({
  valor, onCambio, opciones,
}: { valor: T; onCambio: (v: T) => void; opciones: readonly { valor: T; label: string }[] }) {
  return (
    <select
      value={valor}
      onChange={e => onCambio(e.target.value as T)}
      className="h-[26px] rounded-lg border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/80 outline-none focus:border-primary"
    >
      {opciones.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
    </select>
  );
}

// ── Pestañas ────────────────────────────────────────────────────────────────

export function Pestanas<T extends string>({
  valor, onCambio, opciones,
}: { valor: T; onCambio: (v: T) => void; opciones: readonly { valor: T; label: string }[] }) {
  return (
    <div className="-mx-1 flex gap-0.5 overflow-x-auto border-b border-border px-1" role="tablist">
      {opciones.map(o => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onCambio(o.valor)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors',
              activa
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Estados vacíos ──────────────────────────────────────────────────────────

/**
 * Lo que se enseña cuando no hay datos.
 *
 * Un panel vacío sin explicación parece una pantalla rota. Aquí se dice qué
 * falta y, cuando se puede, qué hacer para que deje de faltar.
 */
export function Vacio({
  icono, titulo, detalle, accion,
}: { icono?: React.ReactNode; titulo: string; detalle?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      {icono && <span className="text-muted-foreground/40">{icono}</span>}
      <p className="text-[12.5px] font-semibold text-muted-foreground">{titulo}</p>
      {detalle && <p className="max-w-[36ch] text-[11.5px] leading-snug text-muted-foreground/70">{detalle}</p>}
      {accion}
    </div>
  );
}

/** Chip de estado: completado, pendiente, vencido. */
export function Chip({
  children, tono = 'neutro',
}: { children: React.ReactNode; tono?: 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro' }) {
  const tonos = {
    exito: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-400',
    aviso: 'bg-amber-400/15 text-amber-800 border-amber-400/30 dark:text-amber-300',
    peligro: 'bg-red-500/10 text-red-700 border-red-500/25 dark:text-red-400',
    info: 'bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-400',
    neutro: 'bg-muted text-muted-foreground border-border',
  } as const;
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold', tonos[tono])}>
      {children}
    </span>
  );
}

/** Aviso al pie de la pantalla: lo que falta por registrar, no un error. */
export function Avisos({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
      <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
        Sobre estos números
      </p>
      <ul className="mt-1 space-y-0.5">
        {avisos.map((a, i) => (
          <li key={i} className="text-[11.5px] leading-snug text-amber-800 dark:text-amber-300">· {a}</li>
        ))}
      </ul>
    </div>
  );
}
