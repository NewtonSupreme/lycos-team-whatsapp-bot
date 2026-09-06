'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Trash2, TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { widgetById } from '@/lib/dashboard/registry';
import {
  HEIGHT_CLASS, SPAN_CLASS, VISUAL_LABEL,
  type WidgetHeight, type WidgetInstance, type WidgetSpan, type WidgetVisual,
} from '@/lib/dashboard/types';

const SPANS: WidgetSpan[] = [3, 4, 5, 6, 8, 12];
const HEIGHTS: WidgetHeight[] = ['sm', 'md', 'lg'];

interface WidgetCardProps {
  instance: WidgetInstance;
  sedeId: string | null;
  /** Cambia cuando el usuario pulsa Actualizar en la cabecera. */
  refreshKey: number;
  editing: boolean;
  onUpdate: (key: string, patch: Partial<WidgetInstance>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Marco de un widget.
 *
 * Carga su propio dato y se hace cargo de sus tres estados: mientras carga
 * muestra un esqueleto con la forma que va a tener, si la consulta falla lo
 * dice y ofrece reintentar, y si no hay dato lo dice sin fingir un gráfico
 * vacío. Un panel donde un widget roto se ve igual que uno sin datos es un
 * panel en el que no se puede confiar.
 */
export default function WidgetCard({
  instance, sedeId, refreshKey, editing, onUpdate, onRemove, onMove, isFirst, isLast,
}: WidgetCardProps) {
  const def = widgetById(instance.defId);
  const [data, setData] = useState<unknown>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  const cargar = useCallback(async () => {
    if (!def) return;
    setEstado('cargando');
    try {
      setData(await def.load({ sedeId }));
      setEstado('listo');
    } catch (e) {
      console.error(`Widget ${instance.defId}:`, e);
      setEstado('error');
    }
  }, [def, sedeId, instance.defId, refreshKey]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (!def) {
    // El diseño guardado referencia un widget que ya no existe en el catálogo.
    return (
      <article className={cn('rounded-xl border border-dashed border-border p-4', SPAN_CLASS[instance.span])}>
        <p className="text-sm text-muted-foreground">Widget no disponible</p>
        <button onClick={() => onRemove(instance.key)} className="mt-2 text-xs font-medium text-danger hover:underline">
          Quitar del panel
        </button>
      </article>
    );
  }

  const Icon = def.icon;
  const titulo = instance.title ?? def.title;

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-card shadow-sm transition-colors',
        editing ? 'border-primary/40' : 'border-border',
        SPAN_CLASS[instance.span],
        HEIGHT_CLASS[instance.height],
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h3 className="truncate text-sm font-semibold">{titulo}</h3>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!editing && (
            <button
              onClick={() => void cargar()}
              aria-label={`Actualizar ${titulo}`}
              className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/panel:opacity-100"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', estado === 'cargando' && 'animate-spin')} aria-hidden />
            </button>
          )}

          {editing && (
            <>
              <button
                onClick={() => onMove(instance.key, -1)}
                disabled={isFirst}
                aria-label={`Mover ${titulo} antes`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                onClick={() => onMove(instance.key, 1)}
                disabled={isLast}
                aria-label={`Mover ${titulo} después`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                onClick={() => onRemove(instance.key)}
                aria-label={`Quitar ${titulo} del panel`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-danger-subtle hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </header>

      {editing && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Ancho</span>
            <select
              value={instance.span}
              onChange={e => onUpdate(instance.key, { span: Number(e.target.value) as WidgetSpan })}
              className="rounded-md border border-border bg-card px-1.5 py-1 text-xs"
            >
              {SPANS.map(s => <option key={s} value={s}>{s}/12</option>)}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Alto</span>
            <select
              value={instance.height}
              onChange={e => onUpdate(instance.key, { height: e.target.value as WidgetHeight })}
              className="rounded-md border border-border bg-card px-1.5 py-1 text-xs"
            >
              {HEIGHTS.map(h => (
                <option key={h} value={h}>{h === 'sm' ? 'Bajo' : h === 'md' ? 'Medio' : 'Alto'}</option>
              ))}
            </select>
          </label>

          {def.visuals.length > 1 && (
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Ver como</span>
              <select
                value={instance.visual}
                onChange={e => onUpdate(instance.key, { visual: e.target.value as WidgetVisual })}
                className="rounded-md border border-border bg-card px-1.5 py-1 text-xs"
              >
                {def.visuals.map(v => <option key={v} value={v}>{VISUAL_LABEL[v]}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {/*
        Los graficos van con overflow oculto: con `auto`, recharts mide, dibuja,
        aparece la barra de scroll, vuelve a medir y entra en bucle. Las listas
        si necesitan desplazarse.
      */}
      <div
        className={cn(
          'min-h-0 flex-1 p-4',
          instance.visual === 'lista' ? 'overflow-y-auto' : 'overflow-hidden',
        )}
      >
        {estado === 'cargando' && (
          <div className="flex h-full min-h-[5rem] flex-col justify-center gap-2" aria-busy>
            <div className="h-7 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-12 w-full animate-pulse rounded bg-muted" />
          </div>
        )}

        {estado === 'error' && (
          <div className="flex h-full min-h-[5rem] flex-col items-center justify-center gap-2 text-center">
            <TriangleAlert className="h-5 w-5 text-warning" aria-hidden />
            <p className="text-sm text-muted-foreground">No se pudo cargar</p>
            <button onClick={() => void cargar()} className="text-xs font-medium text-primary hover:underline">
              Reintentar
            </button>
          </div>
        )}

        {estado === 'listo' && def.render(data, instance.visual)}
      </div>
    </article>
  );
}
