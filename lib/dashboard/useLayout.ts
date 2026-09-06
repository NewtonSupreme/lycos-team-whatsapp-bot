'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardLayout, WidgetHeight, WidgetInstance, WidgetSpan, WidgetVisual } from './types';

const STORAGE_KEY = 'lycos_panel_layout_v1';

/** Panel de arranque: lo que casi cualquier taller quiere ver primero. */
export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  widgets: [
    { key: 'w-servicios-activos', defId: 'servicios-activos', span: 3, height: 'sm', visual: 'kpi' },
    { key: 'w-facturacion-mes', defId: 'facturacion-mes', span: 3, height: 'sm', visual: 'kpi' },
    { key: 'w-clientes-total', defId: 'clientes-total', span: 3, height: 'sm', visual: 'kpi' },
    { key: 'w-citas-hoy', defId: 'citas-hoy', span: 3, height: 'sm', visual: 'kpi' },
    { key: 'w-ingresos-serie', defId: 'ingresos-serie', span: 8, height: 'md', visual: 'area' },
    { key: 'w-servicios-categoria', defId: 'servicios-categoria', span: 4, height: 'md', visual: 'dona' },
    { key: 'w-ordenes-hoy', defId: 'ordenes-recientes', span: 5, height: 'md', visual: 'lista' },
    { key: 'w-proximas-citas', defId: 'proximas-citas', span: 4, height: 'md', visual: 'lista' },
    { key: 'w-cuota-whatsapp', defId: 'cuota-whatsapp', span: 3, height: 'md', visual: 'medidor' },
  ],
};

function isLayout(value: unknown): value is DashboardLayout {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Partial<DashboardLayout>;
  return l.version === 1 && Array.isArray(l.widgets);
}

/**
 * Diseño del panel del usuario.
 *
 * Vive en localStorage: es una preferencia de presentación, no un dato del
 * negocio, y guardarla en el servidor obligaría a una tabla y una migración
 * para algo que solo le importa a quien mira la pantalla. Si más adelante hace
 * falta que siga al usuario entre dispositivos, este hook es el único punto
 * que hay que cambiar.
 */
export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isLayout(parsed)) setLayout(parsed);
      }
    } catch {
      /* modo privado o JSON corrupto: se arranca con el panel por defecto */
    }
    setLoaded(true);
  }, []);

  const persist = useCallback((next: DashboardLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sin persistencia, pero la sesión actual sigue funcionando */
    }
  }, []);

  const add = useCallback((defId: string, span: WidgetSpan, height: WidgetHeight, visual: WidgetVisual) => {
    setLayout(prev => {
      const next: DashboardLayout = {
        ...prev,
        widgets: [
          ...prev.widgets,
          { key: `w-${defId}-${Date.now().toString(36)}`, defId, span, height, visual },
        ],
      };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignorado */ }
      return next;
    });
  }, []);

  const update = useCallback((key: string, patch: Partial<WidgetInstance>) => {
    setLayout(prev => {
      const next: DashboardLayout = {
        ...prev,
        widgets: prev.widgets.map(w => (w.key === key ? { ...w, ...patch } : w)),
      };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignorado */ }
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => {
    setLayout(prev => {
      const next: DashboardLayout = { ...prev, widgets: prev.widgets.filter(w => w.key !== key) };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignorado */ }
      return next;
    });
  }, []);

  /** Mueve una posición. Con botones y no arrastrando: funciona con teclado. */
  const move = useCallback((key: string, direction: -1 | 1) => {
    setLayout(prev => {
      const i = prev.widgets.findIndex(w => w.key === key);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= prev.widgets.length) return prev;
      const widgets = [...prev.widgets];
      const a = widgets[i]!;
      const b = widgets[j]!;
      widgets[i] = b;
      widgets[j] = a;
      const next: DashboardLayout = { ...prev, widgets };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignorado */ }
      return next;
    });
  }, []);

  const reset = useCallback(() => persist(DEFAULT_LAYOUT), [persist]);

  return { layout, loaded, add, update, remove, move, reset };
}
