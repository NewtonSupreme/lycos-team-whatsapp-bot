'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, MapPin, Play, RefreshCw, ShieldCheck, TrendingUp, X, Zap } from 'lucide-react';
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
  const [mounted, setMounted] = useState(false);
  const [rates, setRates] = useState<Tasas | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  /** Al cambiar, cada bloque vuelve a consultar. */
  const [refreshKey, setRefreshKey] = useState(0);

  const [showTutorial, setShowTutorial] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoReady = useRef(false);

  useEffect(() => setMounted(true), []);

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

  // El video se sirve por URL firmada; si tarda, se cae a la ruta directa.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const timeout = setTimeout(() => {
      if (!cancelled && !videoReady.current) {
        videoReady.current = true;
        setVideoUrl('/api/tutorial-video');
      }
    }, 2000);

    fetch('/api/tutorial-video?format=json')
      .then(r => r.json())
      .then(data => {
        if (cancelled || videoReady.current || !data.signedUrl) return;
        clearTimeout(timeout);
        videoReady.current = true;
        setVideoUrl(data.signedUrl);
      })
      .catch(() => { /* sin video: el modal muestra su propio estado */ });

    return () => { clearTimeout(timeout); cancelled = true; };
  }, [mounted]);

  // Escape cierra el modal: un diálogo sin salida por teclado atrapa al usuario.
  useEffect(() => {
    if (!showTutorial) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowTutorial(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTutorial]);

  return (
    <div className="space-y-6">
      {showTutorial && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Tutorial de Lycos Team"
          onClick={e => { if (e.target === e.currentTarget) setShowTutorial(false); }}
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle">
                  <Play className="h-4 w-4 text-primary" aria-hidden />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Tutorial de Lycos Team</h2>
                  <p className="text-xs text-muted-foreground">Cómo usar el sistema paso a paso</p>
                </div>
              </div>
              <button
                onClick={() => setShowTutorial(false)}
                aria-label="Cerrar tutorial"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="bg-black">
              {videoUrl ? (
                <video className="aspect-video w-full" controls autoPlay playsInline controlsList="nodownload" preload="auto">
                  <source src={videoUrl} type="video/mp4" />
                  Tu navegador no reproduce este video.
                </video>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    <p className="text-xs text-muted-foreground">Cargando video…</p>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <p className="text-xs text-muted-foreground">Podés volver a verlo desde Información.</p>
              <button onClick={() => setShowTutorial(false)} className="text-sm font-medium text-primary hover:underline">
                Cerrar
              </button>
            </footer>
          </div>
        </div>
      )}

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
