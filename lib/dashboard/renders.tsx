'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/ui/sparkline';
import type { WidgetVisual } from './types';

/**
 * Paleta de series.
 *
 * Ocho tonos separados en matiz y en luminosidad, no solo en matiz: así se
 * distinguen también en escala de grises y para quien no separa rojo de verde.
 * No se toma del acento de marca porque una serie no es una acción.
 */
export const SERIES = [
  '#2563EB', '#F97316', '#0D9488', '#9333EA',
  '#DC2626', '#0891B2', '#65A30D', '#DB2777',
] as const;

export interface Punto {
  etiqueta: string;
  valor: number;
}

/** Vacío honesto: dice que no hay dato, no finge un gráfico en blanco. */
export function SinDatos({ mensaje = 'Sin datos en este período' }: { mensaje?: string }) {
  return (
    <div className="flex h-full min-h-[6rem] flex-col items-center justify-center gap-2 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{mensaje}</p>
    </div>
  );
}

function TooltipCaja({ active, payload, label }: {
  active?: boolean;
  payload?: { value?: number; name?: string; payload?: Punto }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{label ?? p?.payload?.etiqueta}</p>
      <p className="num text-sm font-semibold">{(p?.value ?? 0).toLocaleString('es-VE')}</p>
    </div>
  );
}

const EJE = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

export function GraficoSerie({ datos, visual }: { datos: readonly Punto[]; visual: WidgetVisual }) {
  if (datos.length === 0) return <SinDatos />;

  const comun = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={false} minTickGap={16} />
      <YAxis tick={EJE} tickLine={false} axisLine={false} width={44} />
      <Tooltip content={<TooltipCaja />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
    </>
  );

  if (visual === 'barras') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos as Punto[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {comun}
          <Bar dataKey="valor" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (visual === 'linea') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos as Punto[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {comun}
          <Line type="monotone" dataKey="valor" stroke={SERIES[0]} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={datos as Punto[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        {comun}
        <Area type="monotone" dataKey="valor" stroke={SERIES[0]} strokeWidth={2.5} fill="url(#areaFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GraficoDona({ datos }: { datos: readonly Punto[] }) {
  if (datos.length === 0) return <SinDatos />;
  const total = datos.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="flex h-full items-center gap-3">
      <div className="relative h-full min-h-[8rem] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={datos as Punto[]}
              dataKey="valor"
              nameKey="etiqueta"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
            >
              {datos.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipCaja />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-xl font-bold">{total.toLocaleString('es-VE')}</span>
          <span className="text-xs text-muted-foreground">total</span>
        </div>
      </div>

      {/* Leyenda con el valor al lado: leer la dona sin cifras obliga a estimar. */}
      <ul className="max-h-full min-w-0 flex-1 space-y-1.5 overflow-y-auto text-xs">
        {datos.map((d, i) => (
          <li key={d.etiqueta} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: SERIES[i % SERIES.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{d.etiqueta}</span>
            <span className="num font-medium">{d.valor.toLocaleString('es-VE')}</span>
            <span className="num w-9 text-right text-muted-foreground">
              {total ? Math.round((d.valor / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ItemLista {
  id: string;
  titulo: string;
  detalle?: string;
  valor?: string;
  tono?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

const TONO_LISTA: Record<NonNullable<ItemLista['tono']>, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
};

export function Lista({ items }: { items: readonly ItemLista[] }) {
  if (items.length === 0) return <SinDatos mensaje="Nada por aquí todavía" />;
  return (
    <ul className="divide-y divide-border">
      {items.map(it => (
        <li key={it.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{it.titulo}</p>
            {it.detalle && <p className="truncate text-xs text-muted-foreground">{it.detalle}</p>}
          </div>
          {it.valor && (
            <span
              className={cn(
                'num shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                TONO_LISTA[it.tono ?? 'neutral'],
              )}
            >
              {it.valor}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Kpi({ valor, detalle, serie, tono = 'brand' }: {
  valor: string;
  detalle?: string;
  serie?: readonly number[];
  tono?: 'brand' | 'success' | 'danger' | 'info' | 'muted';
}) {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="num text-3xl font-bold tracking-tight">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
      {serie && serie.length > 1 && (
        <div className="-mx-1 mt-3">
          <Sparkline data={serie} tone={tono} height={34} />
        </div>
      )}
    </div>
  );
}

/**
 * Medidor de consumo.
 *
 * Cambia de tono al acercarse al límite, pero además dice el porcentaje: el
 * color por sí solo no avisa a quien no lo distingue.
 */
export function Medidor({ valor, limite, unidad }: { valor: number; limite: number; unidad?: string }) {
  const pct = limite > 0 ? Math.min(100, Math.round((valor / limite) * 100)) : 0;
  const tono = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-success';
  const texto = pct >= 90 ? 'text-danger' : pct >= 70 ? 'text-warning' : 'text-success';

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline justify-between">
        <span className="num text-2xl font-bold">{valor.toLocaleString('es-VE')}</span>
        <span className="num text-sm text-muted-foreground">
          de {limite.toLocaleString('es-VE')} {unidad}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% consumido`}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', tono)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('num text-xs font-medium', texto)}>{pct}% consumido</p>
    </div>
  );
}

export { Legend };
