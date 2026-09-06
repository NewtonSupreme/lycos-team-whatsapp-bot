'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Coins, MapPin, RefreshCw, ShieldCheck, TrendingUp, Zap } from 'lucide-react';
import ConfigurableDashboard from '@/components/dashboard/ConfigurableDashboard';
import { PageHeader } from '@/components/ui/page-header';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';
import { useSedeStore } from '@/lib/store/useSedeStore';

interface Tasas {
  bcv: number;
  binance: number;
  fetchedAt: string;
}

/**
 * Panel principal.
 *
 * La página solo aporta el marco: quién sos, dónde estás y las tasas del día,
 * que son dato operativo y no una métrica más. Todo lo demás lo arma el
 * usuario desde el catálogo de bloques.
 *
 * Antes esta pantalla traía ocho métricas, tres gráficos y tres listas fijas,
 * decididas al escribir el código. Cada taller mira cosas distintas y cada rol
 * también, así que la decisión pasa a quien mira la pantalla.
 */
export default function DashboardPage() {
  const { currentSede, userRole } = useSedeStore();
  const [rates, setRates] = useState<Tasas | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  /** Al cambiar, cada bloque vuelve a consultar. */
  const [refreshKey, setRefreshKey] = useState(0);

  const loadRates = useCallback(async () => {
    setLoadingRates(true);
    try {
      const resp = await fetch(`/api/rates?t=${Date.now()}`);
      const data = await resp.json();
      if (!data.error) setRates(data);
    } catch (e) {
      console.error('Error cargando tasas:', e);
    } finally {
      setLoadingRates(false);
    }
  }, []);

  useEffect(() => { void loadRates(); }, [loadRates]);

  function refrescarTodo() {
    void loadRates();
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel principal"
        description={`Bienvenido de vuelta · ${new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
        meta={
          <>
            <StatusPill tone="neutral" icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}>
              {currentSede?.nombre || 'Sede no seleccionada'}
            </StatusPill>
            <StatusPill tone="neutral" icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}>
              {userRole}
            </StatusPill>
            <StatusPill tone="success" icon={<Zap className="h-3.5 w-3.5" aria-hidden />}>
              Bot IA activo
            </StatusPill>
          </>
        }
        actions={
          <button
            onClick={refrescarTodo}
            disabled={loadingRates}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loadingRates && 'animate-spin')} aria-hidden />
            {loadingRates ? 'Actualizando…' : 'Actualizar'}
          </button>
        }
      />

      {/* Tasas del día: dato operativo, no una métrica configurable. */}
      {rates && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { label: 'Tasa oficial BCV', value: rates.bcv, icon: TrendingUp },
            { label: 'Binance P2P (USDT)', value: rates.binance, icon: Coins },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              <p className="num mt-2 text-2xl font-bold tracking-tight">
                Bs. {value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Actualizada a las{' '}
                <span className="num">
                  {new Date(rates.fetchedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfigurableDashboard refreshKey={refreshKey} />
    </div>
  );
}
