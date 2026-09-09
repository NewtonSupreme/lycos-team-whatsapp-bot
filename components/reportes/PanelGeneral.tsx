'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, CalendarDays, Download, FileSpreadsheet, FileText, Lightbulb, Loader2,
  Package, Receipt, RefreshCw, Send, TrendingUp, Users, Wrench,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Avisos, EnlacePanel, Panel, SelectorPanel, Vacio } from '@/components/panel/Piezas';
import { COLOR_ESTADO, type ReporteGeneral } from '@/lib/reportes/general';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { cn } from '@/lib/utils';

/**
 * La pestaña General de Reportes: el rendimiento del taller de un vistazo.
 *
 * Vive aparte de `app/dashboard/reportes/page.tsx` a propósito. Esa pantalla
 * tiene cuatro mil líneas con el asistente de cierre, el escaneo de tickets,
 * los egresos y las facturas; meter esto dentro habría obligado a tocarla, y
 * cada línea que se toca ahí es una función que puede romperse. Aquí entra como
 * una pestaña más y no se lleva nada por delante.
 *
 * Todo sale de `/api/reportes/general` en una sola llamada: los cuatro
 * indicadores, los gráficos y las listas se calculan de las mismas filas.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DIA = 24 * 60 * 60 * 1000;
const dosDig = (n: number) => String(n).padStart(2, '0');
const fechaCorta = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s
    : `${dosDig(d.getDate())}/${dosDig(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const TOOLTIP = {
  borderRadius: 12, border: '1px solid #e8eaed', fontSize: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,.08)',
} as const;

interface Props {
  /** Para «Generar reporte»: lo hace la pantalla anfitriona, que ya lo tiene. */
  onGenerarPdf?: () => void;
  onExportarExcel?: () => void;
  generando?: boolean;
}

export default function PanelGeneral({ onGenerarPdf, onExportarExcel, generando }: Props) {
  const sedeId = useSedeStore(s => s.currentSede?.id);
  const sedeNombre = useSedeStore(s => s.currentSede?.nombre);
  const hoy = useMemo(() => new Date(), []);

  const [desde, setDesde] = useState(() => iso(new Date(hoy.getTime() - 29 * DIA)));
  const [hasta, setHasta] = useState(() => iso(hoy));
  const [moneda, setMoneda] = useState<'Bs' | 'USD'>('Bs');
  const [ventanaBarras, setVentanaBarras] = useState<'7' | '14' | '30'>('7');
  const [tipInvisible, setTipInvisible] = useState(false);

  const [datos, setDatos] = useState<ReporteGeneral | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (sedeId) p.set('sede', sedeId);
      const r = await fetch(`/api/reportes/general?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'No se pudo cargar el reporte.');
      setDatos(d as ReporteGeneral);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, sedeId]);

  useEffect(() => { cargar(); }, [cargar]);

  const tasa = datos?.tasa || 0;
  const factor = moneda === 'Bs' && tasa ? tasa : 1;

  const dinero = useCallback((usd: number, dec = 2) => {
    const n = Number(usd) || 0;
    if (moneda === 'USD' || !tasa) {
      return `$${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
    }
    return `Bs. ${(n * tasa).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  }, [moneda, tasa]);

  const eje = useCallback((usd: number) => {
    const n = (Number(usd) || 0) * factor;
    const pre = moneda === 'Bs' && tasa ? 'Bs. ' : '$';
    if (Math.abs(n) >= 1_000_000) return `${pre}${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${pre}${Math.round(n / 1_000)}K`;
    return `${pre}${Math.round(n)}`;
  }, [factor, moneda, tasa]);

  const preset = (clave: '7d' | '30d' | 'mes' | 'ano') => {
    if (clave === '7d') setDesde(iso(new Date(hoy.getTime() - 6 * DIA)));
    if (clave === '30d') setDesde(iso(new Date(hoy.getTime() - 29 * DIA)));
    if (clave === 'mes') setDesde(iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
    if (clave === 'ano') setDesde(iso(new Date(hoy.getFullYear(), 0, 1)));
    setHasta(iso(hoy));
  };

  if (cargando && !datos) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Calculando el reporte…
      </div>
    );
  }
  if (error && !datos) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400">
        {error}
      </div>
    );
  }
  if (!datos) return null;

  const barras = datos.ingresosVsEgresos
    .slice(-Number(ventanaBarras))
    .map(p => ({ etiqueta: p.etiqueta, Ingresos: p.ingresos * factor, Egresos: p.egresos * factor }));

  const tendencia = datos.tendencia
    .map(p => ({ etiqueta: p.etiqueta, Ingresos: p.ingresos * factor }));

  return (
    <div className="space-y-3">
      {/* ── Rango y moneda ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {fechaCorta(datos.desde)} — {fechaCorta(datos.hasta)}
          {sedeNombre && <span className="ml-1.5">· {sedeNombre}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-border">
            {(['Bs', 'USD'] as const).map(m => (
              <button
                key={m} type="button" onClick={() => setMoneda(m)}
                title={m === 'Bs' ? `A la tasa de hoy (${tasa.toFixed(2)} Bs/$)` : 'Moneda en la que el sistema cuenta'}
                className={cn('h-8 px-2.5 text-[11.5px] font-bold transition-colors',
                  moneda === m ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted/50')}
              >
                {m === 'Bs' ? 'Bs.' : '$'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)}
              aria-label="Desde"
              className="w-[104px] bg-transparent text-[11.5px] font-medium text-foreground outline-none"
            />
            <span className="text-muted-foreground/40">–</span>
            <input
              type="date" value={hasta} min={desde} max={iso(hoy)} onChange={e => setHasta(e.target.value)}
              aria-label="Hasta"
              className="w-[104px] bg-transparent text-[11.5px] font-medium text-foreground outline-none"
            />
          </div>
          <select
            onChange={e => { if (e.target.value) preset(e.target.value as '7d'); e.target.value = ''; }}
            defaultValue="" aria-label="Rango rápido"
            className="h-8 rounded-xl border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/80 outline-none"
          >
            <option value="">Rango…</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="mes">Este mes</option>
            <option value="ano">Este año</option>
          </select>
          <button
            type="button" onClick={cargar} disabled={cargando} title="Volver a calcular"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </div>

      {/* ── Los cuatro indicadores, con su tendencia ─────────────────────── */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTendencia
          icono={<Receipt className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          color="#22c55e" etiqueta="Ingresos totales"
          valor={dinero(datos.kpis.ingresos.valor)} kpi={datos.kpis.ingresos}
        />
        <KpiTendencia
          icono={<Wrench className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          color="#3b82f6" etiqueta="Servicios realizados"
          valor={String(datos.kpis.servicios.valor)} kpi={datos.kpis.servicios}
        />
        <KpiTendencia
          icono={<Users className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-orange-500/15 text-orange-600 dark:text-orange-400"
          color="#f97316" etiqueta="Clientes atendidos"
          valor={String(datos.kpis.clientes.valor)} kpi={datos.kpis.clientes}
        />
        <KpiTendencia
          icono={<TrendingUp className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-violet-500/15 text-violet-600 dark:text-violet-400"
          color="#8b5cf6" etiqueta="Ticket promedio"
          valor={dinero(datos.kpis.ticket.valor)} kpi={datos.kpis.ticket}
        />
      </div>

      {/* ── Fila 1 ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel
          titulo="Ingresos vs. Egresos"
          accion={
            <SelectorPanel
              valor={ventanaBarras} onCambio={setVentanaBarras}
              opciones={[
                { valor: '7', label: 'Últimos 7 días' },
                { valor: '14', label: 'Últimos 14 días' },
                { valor: '30', label: 'Últimos 30 días' },
              ]}
            />
          }
        >
          {barras.length === 0 ? (
            <Vacio titulo="Sin movimientos" detalle="No hay ingresos ni gastos en el período." />
          ) : (
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barras} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#8a909c" strokeOpacity={0.18} vertical={false} />
                  <XAxis dataKey="etiqueta" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: '#8a909c' }} />
                  <YAxis tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: '#8a909c' }}
                    tickFormatter={v => eje(v / factor)} />
                  <Tooltip formatter={v => dinero((Number(v) || 0) / factor)} contentStyle={TOOLTIP} />
                  <Legend verticalAlign="top" align="center" height={22} iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: '#8a909c' }} />
                  <Bar dataKey="Ingresos" fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={18}
                    isAnimationActive={false} />
                  <Bar dataKey="Egresos" fill="#9ca3af" radius={[3, 3, 0, 0]} maxBarSize={18}
                    isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel titulo="Servicios por categoría">
          {datos.serviciosPorCategoria.length === 0 ? (
            <Vacio titulo="Sin servicios" detalle="No hay órdenes en el período." />
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative h-[176px] w-[176px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={datos.serviciosPorCategoria} dataKey="valor" nameKey="etiqueta"
                      innerRadius={54} outerRadius={80} paddingAngle={1.5} strokeWidth={0}
                      isAnimationActive={false}>
                      {datos.serviciosPorCategoria.map(t => <Cell key={t.clave} fill={t.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${Number(v) || 0} servicio(s)`, String(n ?? '')]}
                      contentStyle={TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[20px] font-black leading-none tabular-nums text-foreground">
                    {datos.totalServicios}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">Servicios</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-[3px]">
                {datos.serviciosPorCategoria.slice(0, 7).map(t => (
                  <li key={t.clave} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{t.etiqueta}</span>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-foreground">{t.valor}</span>
                    <span className="w-[42px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                      ({t.pct.toFixed(0)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel titulo="Ingresos por tipo de servicio">
          {datos.ingresosPorTipo.length === 0 ? (
            <Vacio titulo="Sin ingresos" detalle="No hay órdenes con importe en el período." />
          ) : (
            <ul className="space-y-2 pt-0.5">
              {datos.ingresosPorTipo.slice(0, 6).map(b => (
                <li key={b.clave} className="flex items-center gap-2">
                  <span className="w-[86px] shrink-0 truncate text-[11px] text-foreground/80" title={b.etiqueta}>
                    {b.etiqueta}
                  </span>
                  {/* La barra es proporcional al mayor, no al total: así se
                      comparan entre sí, que es para lo que sirve la lista. */}
                  <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(3, (b.monto / datos.ingresosPorTipo[0].monto) * 100)}%`,
                        background: b.color,
                      }}
                    />
                  </span>
                  <span className="w-[88px] shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground">
                    {dinero(b.monto, 0)}
                  </span>
                  <span className="w-[34px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                    {b.pct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Fila 2 ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel titulo="Tendencia de ingresos" subtitulo={`${tendencia.length} día(s) del período`}>
          {tendencia.length === 0 ? (
            <Vacio titulo="Sin datos" detalle="No hay ingresos en el período." />
          ) : (
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tendencia} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="degradadoIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#8a909c" strokeOpacity={0.18} vertical={false} />
                  <XAxis dataKey="etiqueta" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: '#8a909c' }} />
                  <YAxis tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: '#8a909c' }}
                    tickFormatter={v => eje(v / factor)} />
                  <Tooltip formatter={v => dinero((Number(v) || 0) / factor)} contentStyle={TOOLTIP} />
                  <Area type="monotone" dataKey="Ingresos" stroke="#f97316" strokeWidth={2}
                    fill="url(#degradadoIngresos)" isAnimationActive={false}
                    dot={{ r: 2.5, fill: '#f97316' }} activeDot={{ r: 4.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel titulo="Estados de órdenes de servicio">
          {datos.estadosOrdenes.length === 0 ? (
            <Vacio titulo="Sin órdenes" detalle="No hay órdenes en el período." />
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative h-[176px] w-[176px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={datos.estadosOrdenes} dataKey="valor" nameKey="etiqueta"
                      innerRadius={54} outerRadius={80} paddingAngle={1.5} strokeWidth={0}
                      isAnimationActive={false}>
                      {datos.estadosOrdenes.map(t => <Cell key={t.clave} fill={t.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${Number(v) || 0} orden(es)`, String(n ?? '')]}
                      contentStyle={TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[20px] font-black leading-none tabular-nums text-foreground">
                    {datos.totalOrdenes}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">Órdenes</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-[3px]">
                {datos.estadosOrdenes.map(t => (
                  <li key={t.clave} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{t.etiqueta}</span>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-foreground">{t.valor}</span>
                    <span className="w-[42px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                      ({t.pct.toFixed(0)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel titulo="Top 5 clientes" accion={<EnlacePanel>Ver todos</EnlacePanel>} sinRelleno>
          {datos.topClientes.length === 0 ? (
            <Vacio titulo="Sin clientes" detalle="No hay órdenes atribuidas en el período." />
          ) : (
            <ul className="divide-y divide-border/40">
              {datos.topClientes.map((c, i) => (
                <li key={c.id || c.nombre} className="flex items-center gap-2 px-3.5 py-[9px]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{c.nombre}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] font-bold tabular-nums text-foreground">
                      {dinero(c.monto)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground/70">
                      {c.servicios} servicio{c.servicios === 1 ? '' : 's'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Fila 3 ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <Panel titulo="Últimas órdenes de servicio" accion={<EnlacePanel>Ver todas</EnlacePanel>} sinRelleno>
          {datos.ultimasOrdenes.length === 0 ? (
            <Vacio titulo="Sin órdenes" detalle="No hay órdenes en el período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                    <th className="px-3.5 py-1.5 font-black">#</th>
                    <th className="px-2 py-1.5 font-black">Fecha</th>
                    <th className="px-2 py-1.5 font-black">Cliente</th>
                    {/* Vehículo y servicio comparten columna, uno debajo del
                        otro. Con siete columnas la tabla se salía del panel y
                        el total —la cifra que se viene a ver— quedaba cortado. */}
                    <th className="px-2 py-1.5 font-black">Vehículo / Servicio</th>
                    <th className="px-2 py-1.5 font-black">Estado</th>
                    <th className="px-3.5 py-1.5 text-right font-black">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {datos.ultimasOrdenes.map(o => (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap px-3.5 py-[7px] font-mono text-[10.5px] text-muted-foreground">
                        {o.numero}
                      </td>
                      <td className="whitespace-nowrap px-2 py-[7px] tabular-nums text-muted-foreground">
                        {fechaCorta(o.fecha)}
                      </td>
                      <td className="max-w-[130px] truncate px-2 py-[7px] font-medium text-foreground" title={o.cliente}>
                        {o.cliente}
                      </td>
                      <td className="max-w-[150px] px-2 py-[7px] leading-tight">
                        <span className="block truncate text-foreground/80" title={o.vehiculo}>{o.vehiculo}</span>
                        <span className="block truncate text-[10px] text-muted-foreground/70" title={o.servicio}>
                          {o.servicio}
                        </span>
                      </td>
                      <td className="px-2 py-[7px]">
                        <span
                          className="inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold capitalize"
                          style={{
                            background: `${COLOR_ESTADO[o.estado] || '#a3a3a3'}22`,
                            color: COLOR_ESTADO[o.estado] || '#a3a3a3',
                          }}
                        >
                          {o.estado.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3.5 py-[7px] text-right font-bold tabular-nums text-foreground">
                        {dinero(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel titulo="Productos más utilizados" accion={<EnlacePanel>Ver todos</EnlacePanel>} sinRelleno>
          {datos.productosUsados.length === 0 ? (
            <Vacio
              icono={<Package className="h-7 w-7" aria-hidden />}
              titulo="Sin productos identificables"
              detalle="Solo cuentan los renglones tomados del inventario. Los escritos a mano no dicen qué pieza se usó."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                    <th className="px-3.5 py-1.5 font-black">Producto</th>
                    <th className="px-2 py-1.5 text-right font-black">Usos</th>
                    <th className="px-3.5 py-1.5 text-right font-black">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {datos.productosUsados.map(p => (
                    <tr key={p.id || p.nombre}>
                      <td className="px-3.5 py-[7px]">
                        <span className="flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                          <span className="max-w-[150px] truncate font-medium text-foreground">{p.nombre}</span>
                        </span>
                      </td>
                      <td className="px-2 py-[7px] text-right font-bold tabular-nums text-foreground">{p.usos}</td>
                      <td className="px-3.5 py-[7px] text-right tabular-nums text-muted-foreground">
                        {dinero(p.total, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel titulo="Filtros del reporte" subtitulo="Lo que sale en el PDF y en Excel">
          <div className="space-y-2.5">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                Rango de fechas
              </p>
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-2.5 py-2">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-[11.5px] tabular-nums text-foreground">
                  {fechaCorta(datos.desde)} — {fechaCorta(datos.hasta)}
                </span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                Sucursal
              </p>
              {/* La sede se elige en la cabecera del panel, que es la que manda
                  en todas las pantallas; repetir el selector aquí daría dos
                  sitios donde cambiarla y uno de los dos siempre miente. */}
              <div className="rounded-xl border border-border bg-muted/30 px-2.5 py-2 text-[11.5px] text-foreground">
                {sedeNombre || 'Todas las sucursales'}
              </div>
            </div>

            <button
              type="button" onClick={onGenerarPdf} disabled={!onGenerarPdf || generando}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[12.5px] font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {generando
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <Activity className="h-4 w-4" aria-hidden />}
              Generar reporte
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={onGenerarPdf} disabled={!onGenerarPdf || generando}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border text-[11.5px] font-semibold text-foreground/80 hover:bg-muted/50 disabled:opacity-50"
              >
                <FileText className="h-3.5 w-3.5 text-red-500" aria-hidden /> Exportar PDF
              </button>
              <button
                type="button" onClick={onExportarExcel} disabled={!onExportarExcel}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border text-[11.5px] font-semibold text-foreground/80 hover:bg-muted/50 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Exportar Excel
              </button>
            </div>

            {/* Programar envío no existe todavía. Se deja a la vista pero
                deshabilitado y dicho: un botón que no hace nada y no lo avisa
                es peor que no tenerlo. */}
            <button
              type="button" disabled
              title="Todavía no construido: hace falta un servicio de correo configurado."
              className="flex h-9 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[11.5px] font-semibold text-muted-foreground/70"
            >
              <Send className="h-3.5 w-3.5" aria-hidden /> Programar envío (pendiente)
            </button>

            {!tipInvisible && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-2.5 py-2">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                  El reporte diario completo, los cierres y el escaneo de tickets están en las demás
                  pestañas de esta pantalla.
                </p>
                <button type="button" onClick={() => setTipInvisible(true)} aria-label="Cerrar"
                  className="shrink-0 text-amber-700 hover:text-amber-800 dark:text-amber-400">
                  <Download className="hidden" aria-hidden />
                  <span className="text-[13px] leading-none">×</span>
                </button>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Avisos avisos={datos.avisos} />
    </div>
  );
}

// ── Tarjeta con línea de tendencia ──────────────────────────────────────────

function KpiTendencia({
  icono, tinte, color, etiqueta, valor, kpi,
}: {
  icono: React.ReactNode; tinte: string; color: string;
  etiqueta: string; valor: string;
  kpi: { valor: number; variacion: number | null; serie: number[] };
}) {
  const sube = (kpi.variacion ?? 0) > 0;
  // La línea necesita al menos dos puntos; con uno Recharts no dibuja nada y
  // el hueco se lee como un fallo.
  const datos = kpi.serie.length >= 2
    ? kpi.serie.map((v, i) => ({ i, v }))
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tinte)}>
          {icono}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] text-muted-foreground">{etiqueta}</span>
          <span className="mt-0.5 block truncate text-[20px] font-black leading-tight tracking-tight text-foreground tabular-nums">
            {valor}
          </span>
        </span>
        {datos && (
          <span className="h-[38px] w-[86px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.8}
                  dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </span>
        )}
      </div>
      <div className="mt-1.5 min-h-[16px] text-[11px]">
        {kpi.variacion != null ? (
          <span className={cn('inline-flex items-center gap-1 font-semibold',
            sube ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            <TrendingUp className={cn('h-3 w-3', !sube && 'rotate-180')} aria-hidden />
            {sube ? '+' : ''}{kpi.variacion.toFixed(0)}%
            <span className="font-normal text-muted-foreground/70">vs. período anterior</span>
          </span>
        ) : (
          <span className="text-muted-foreground/70">Sin período anterior con el que comparar</span>
        )}
      </div>
    </div>
  );
}
