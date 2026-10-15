'use client';

import { useMemo, useState } from 'react';
import { Check, LayoutGrid, Plus, RotateCcw, Search, Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { useDashboardLayout } from '@/lib/dashboard/useLayout';
import { WIDGETS } from '@/lib/dashboard/registry';
import { normalize } from '@/lib/modules';
import { SPAN_CLASS, VISUAL_LABEL, type WidgetSpan } from '@/lib/dashboard/types';
import WidgetCard from './WidgetCard';

/**
 * Panel configurable.
 *
 * El catálogo define qué se puede mostrar; el usuario decide qué, dónde, de
 * qué tamaño y dibujado de qué forma. Un mismo widget puede repetirse — ver
 * los ingresos como área arriba y como barras al lado es una comparación
 * legítima, no un error que haya que impedir.
 *
 * Se reordena con botones y no arrastrando: arrastrar no funciona con teclado
 * ni con lector de pantalla, y aquí no aporta nada que un par de flechas no
 * resuelva.
 */
export default function ConfigurableDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const { layout, loaded, add, update, remove, move, reset } = useDashboardLayout();

  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');

  const sedeId = currentSede?.id ?? null;

  const disponibles = useMemo(
    () => WIDGETS.filter(w => !w.permKey || can(w.permKey, w.permAccion ?? 'leer')),
    [can],
  );

  const catalogo = useMemo(() => {
    const q = normalize(query);
    const filtrados = q
      ? disponibles.filter(w =>
          normalize(`${w.title} ${w.description} ${w.module}`).includes(q))
      : disponibles;

    const grupos = new Map<string, typeof filtrados>();
    for (const w of filtrados) {
      const actual = grupos.get(w.module) ?? [];
      grupos.set(w.module, [...actual, w]);
    }
    return [...grupos.entries()];
  }, [disponibles, query]);

  const visibles = useMemo(
    () => layout.widgets.filter(w => {
      const def = disponibles.find(d => d.id === w.defId);
      return Boolean(def);
    }),
    [layout.widgets, disponibles],
  );

  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-busy>
        {/* SPAN_CLASS y no una plantilla: Tailwind no genera clases armadas
            en tiempo de ejecucion, y el esqueleto saldria sin ancho. */}
        {([3, 3, 3, 3, 8, 4] as WidgetSpan[]).map((s, i) => (
          <div key={i} className={cn('h-36 animate-pulse rounded-xl bg-muted', SPAN_CLASS[s])} />
        ))}
      </div>
    );
  }

  return (
    <div className="group/panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {editing
            ? 'Acomodá el panel: cambiá tamaños, forma de dibujo y orden.'
            : `${visibles.length} ${visibles.length === 1 ? 'bloque' : 'bloques'} en tu panel`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <>
              <button
                onClick={() => setPicker(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Agregar bloque
              </button>
              <button
                onClick={() => {
                  if (window.confirm('¿Restaurar el panel a su estado inicial? Se pierde tu configuración.')) reset();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restaurar
              </button>
            </>
          )}

          <button
            onClick={() => setEditing(v => !v)}
            aria-pressed={editing}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              editing
                ? 'bg-success text-success-foreground hover:brightness-110'
                : 'border border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {editing ? <Check className="h-4 w-4" aria-hidden /> : <Settings2 className="h-4 w-4" aria-hidden />}
            {editing ? 'Listo' : 'Personalizar'}
          </button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-semibold">Tu panel está vacío</p>
            <p className="mt-1 text-sm text-muted-foreground">Agregá los bloques que querés ver al entrar.</p>
          </div>
          <button
            onClick={() => { setEditing(true); setPicker(true); }}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Agregar el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
          {visibles.map((w, i) => (
            <WidgetCard
              key={w.key}
              instance={w}
              sedeId={sedeId}
              refreshKey={refreshKey}
              editing={editing}
              onUpdate={update}
              onRemove={remove}
              onMove={move}
              isFirst={i === 0}
              isLast={i === visibles.length - 1}
            />
          ))}
        </div>
      )}

      {/* Catálogo */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Agregar bloque al panel"
          onClick={e => { if (e.target === e.currentTarget) setPicker(false); }}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-lg sm:rounded-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Agregar bloque</h2>
                <p className="text-xs text-muted-foreground">Datos de cualquier módulo al que tengas acceso</p>
              </div>
              <button
                onClick={() => setPicker(false)}
                aria-label="Cerrar"
                className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="border-b border-border px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar bloque…"
                  aria-label="Buscar bloque"
                  autoFocus
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {catalogo.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Ningún bloque coincide con «{query}».
                </p>
              ) : (
                <div className="space-y-5">
                  {catalogo.map(([modulo, items]) => (
                    <section key={modulo}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {modulo}
                      </h3>
                      <ul className="space-y-2">
                        {items.map(w => {
                          const Icon = w.icon;
                          const puestos = layout.widgets.filter(x => x.defId === w.id).length;
                          return (
                            <li key={w.id}>
                              <button
                                onClick={() => {
                                  add(w.id, w.defaultSpan, w.defaultHeight, w.visuals[0]!);
                                  setPicker(false);
                                }}
                                className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-accent"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{w.title}</span>
                                    {puestos > 0 && (
                                      <span className="num shrink-0 rounded-full bg-primary-subtle px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary">
                                        {puestos} en el panel
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {w.description}
                                  </span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {w.visuals.map(v => VISUAL_LABEL[v]).join(' · ')}
                                  </span>
                                </span>
                                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
