'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Building2, CalendarDays, Download, FileText, Landmark, Lightbulb, Loader2,
  Minus, Percent, PiggyBank, Plus, Receipt, RefreshCw, Users, Wallet, X, ArrowLeftRight,
} from 'lucide-react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import LogoBanco from '@/components/pagos/LogoBanco';
import {
  Avisos, Chip, EnlacePanel, Panel, Pestanas, SelectorPanel, TarjetaKpi, Vacio,
} from '@/components/panel/Piezas';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import type { BankBin } from '@/lib/reporte/ventas-mapping';
import type { ResumenFinanzas, Tajada } from '@/lib/finanzas/tipos';
import { cn } from '@/lib/utils';

/**
 * Finanzas: ingresos, gastos, flujo de caja y rentabilidad.
 *
 * Todo lo que se ve sale de una sola llamada a `/api/finanzas/resumen`. Es a
 * propósito: las seis tarjetas de arriba, el flujo de caja, los dos anillos y
 * los indicadores se calculan de las mismas filas, y pedirlos por separado
 * daría cifras que no cuadran entre sí en cuanto entre una venta a mitad de
 * camino.
 *
 * Sobre la moneda: el sistema cuenta en dólares —el taller cotiza en dólares y
 * cobra en bolívares al cambio del día— así que la API devuelve dólares y aquí
 * se convierte para pintar. El interruptor Bs./$ cambia solo la presentación,
 * nunca el dato.
 */

type Pestana = 'resumen' | 'ingresos' | 'gastos' | 'cuentas' | 'conciliacion' | 'reportes';

const PESTANAS = [
  { valor: 'resumen' as const, label: 'Resumen' },
  { valor: 'ingresos' as const, label: 'Ingresos' },
  { valor: 'gastos' as const, label: 'Gastos' },
  { valor: 'cuentas' as const, label: 'Cuentas y Bancos' },
  { valor: 'conciliacion' as const, label: 'Conciliación' },
  { valor: 'reportes' as const, label: 'Reportes' },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dosDig = (n: number) => String(n).padStart(2, '0');

const fechaCorta = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return `${dosDig(d.getDate())}/${dosDig(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function FinanzasPage() {
  const { can } = useRolePermissions();
  const sedeId = useSedeStore(s => s.currentSede?.id);

  const hoy = useMemo(() => new Date(), []);
  const [desde, setDesde] = useState(() => iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(() => iso(hoy));
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [agrupacion, setAgrupacion] = useState<'dia' | 'semana' | 'mes' | 'auto'>('auto');
  // Se enseña en bolívares por defecto, que es la moneda en la que se cobra.
  const [moneda, setMoneda] = useState<'Bs' | 'USD'>('Bs');
  const [tipCerrado, setTipCerrado] = useState(false);

  const [datos, setDatos] = useState<ResumenFinanzas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (sedeId) p.set('sede', sedeId);
      if (agrupacion !== 'auto') p.set('agrupacion', agrupacion);
      const r = await fetch(`/api/finanzas/resumen?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'No se pudo cargar Finanzas.');
      setDatos(d as ResumenFinanzas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, sedeId, agrupacion]);

  useEffect(() => { cargar(); }, [cargar]);

  const tasa = datos?.tasa || 0;

  /**
   * Un importe, en la moneda que se esté viendo.
   *
   * Los dólares llegan de la API; los bolívares se calculan con la tasa de hoy
   * y solo para mostrar. Si no hay tasa se enseña en dólares en vez de un cero:
   * un cero es una cifra falsa, y aquí las cifras se usan para decidir.
   */
  const dinero = useCallback((usd: number, decimales = 2) => {
    const n = Number(usd) || 0;
    if (moneda === 'USD' || !tasa) {
      return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
    }
    return `Bs. ${(n * tasa).toLocaleString('de-DE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
  }, [moneda, tasa]);

  /** Compacto, para los ejes del gráfico. */
  const dineroEje = useCallback((usd: number) => {
    const n = (Number(usd) || 0) * (moneda === 'Bs' && tasa ? tasa : 1);
    const pre = moneda === 'Bs' && tasa ? 'Bs. ' : '$';
    if (Math.abs(n) >= 1_000_000) return `${pre}${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${pre}${Math.round(n / 1_000)}K`;
    return `${pre}${Math.round(n)}`;
  }, [moneda, tasa]);

  const rangoPreset = (clave: 'mes' | 'mes_pasado' | 'trimestre' | 'ano') => {
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    if (clave === 'mes') { setDesde(iso(new Date(y, m, 1))); setHasta(iso(hoy)); }
    if (clave === 'mes_pasado') { setDesde(iso(new Date(y, m - 1, 1))); setHasta(iso(new Date(y, m, 0))); }
    if (clave === 'trimestre') { setDesde(iso(new Date(y, m - 2, 1))); setHasta(iso(hoy)); }
    if (clave === 'ano') { setDesde(iso(new Date(y, 0, 1))); setHasta(iso(hoy)); }
  };

  const exportarCsv = () => {
    if (!datos) return;
    const filas: string[][] = [
      ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Método', `Monto (${moneda})`, 'Estado'],
      ...datos.transacciones.map(t => [
        t.fecha, t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', t.descripcion, t.categoria, t.metodo,
        String(moneda === 'Bs' && tasa ? (t.monto * tasa).toFixed(2) : t.monto.toFixed(2)),
        t.estado,
      ]),
    ];
    // `﻿` al principio para que Excel abra los acentos bien; sin eso
    // «Nómina» sale como «NÃ³mina».
    const csv = '﻿' + filas.map(f =>
      f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `finanzas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!can('reportes', 'leer')) {
    return (
      <div className="mx-auto max-w-[1600px] p-4">
        <Vacio
          icono={<Landmark className="h-8 w-8" aria-hidden />}
          titulo="Sin acceso a Finanzas"
          detalle="Este módulo lo ve quien tiene permiso de Reportes. Pídelo a administración."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 pb-10">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-white">
            <BarChart3 className="h-[22px] w-[22px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-[26px] font-black leading-none tracking-tight text-foreground">Finanzas</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Controla los ingresos, egresos, flujo de caja y la rentabilidad de tu taller.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bs. o $ — cambia solo cómo se ve, nunca el dato. */}
          <div className="flex overflow-hidden rounded-xl border border-border">
            {(['Bs', 'USD'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                title={m === 'Bs' ? `Convertido a la tasa de hoy (${tasa.toFixed(2)} Bs/$)` : 'Moneda en la que el sistema lleva las cuentas'}
                className={cn('h-9 px-2.5 text-[12px] font-bold transition-colors',
                  moneda === m ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:bg-muted/50')}
              >
                {m === 'Bs' ? 'Bs.' : '$'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="date" value={desde} max={hasta}
              onChange={e => setDesde(e.target.value)}
              aria-label="Desde"
              className="w-[112px] bg-transparent text-[12px] font-medium text-foreground outline-none"
            />
            <span className="text-muted-foreground/40">–</span>
            <input
              type="date" value={hasta} min={desde} max={iso(hoy)}
              onChange={e => setHasta(e.target.value)}
              aria-label="Hasta"
              className="w-[112px] bg-transparent text-[12px] font-medium text-foreground outline-none"
            />
          </div>

          <select
            onChange={e => { const v = e.target.value; if (v) rangoPreset(v as 'mes'); e.target.value = ''; }}
            defaultValue=""
            aria-label="Rango rápido"
            className="h-9 rounded-xl border border-border bg-card px-2 text-[12px] font-medium text-foreground/80 outline-none"
          >
            <option value="">Rango rápido…</option>
            <option value="mes">Este mes</option>
            <option value="mes_pasado">Mes pasado</option>
            <option value="trimestre">Últimos 3 meses</option>
            <option value="ano">Este año</option>
          </select>

          <button
            type="button" onClick={cargar} disabled={cargando}
            title="Volver a calcular"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} aria-hidden />
          </button>

          <button
            type="button" onClick={exportarCsv} disabled={!datos}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground/80 hover:bg-muted/50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden /> Exportar
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {cargando && !datos ? (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Calculando las cuentas del período…
        </div>
      ) : !datos ? null : (
        <>
          {/* ── Los seis indicadores ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <TarjetaKpi
              icono={<Receipt className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              etiqueta="Ingresos totales" valor={dinero(datos.kpis.ingresos.valor)}
              variacion={datos.kpis.ingresos.variacion} variacionPie="vs. período anterior"
            />
            <TarjetaKpi
              icono={<PiggyBank className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-red-500/15 text-red-600 dark:text-red-400"
              etiqueta="Gastos totales" valor={dinero(datos.kpis.gastos.valor)}
              variacion={datos.kpis.gastos.variacion} variacionPie="vs. período anterior"
              subirEsBueno={false}
            />
            <TarjetaKpi
              icono={<BarChart3 className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-blue-500/15 text-blue-600 dark:text-blue-400"
              etiqueta="Utilidad neta" valor={dinero(datos.kpis.utilidad.valor)}
              variacion={datos.kpis.utilidad.variacion} variacionPie="vs. período anterior"
            />
            <TarjetaKpi
              icono={<Percent className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-violet-500/15 text-violet-600 dark:text-violet-400"
              etiqueta="Margen de ganancia"
              valor={`${datos.kpis.margen.valor.toFixed(1)}%`}
              variacion={datos.kpis.margen.variacion} variacionPie="vs. período anterior"
              enPuntos
            />
            <TarjetaKpi
              icono={<Users className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-[#ffedd5] text-primary"
              etiqueta="Cuentas por cobrar" valor={dinero(datos.kpis.porCobrar.valor)}
              pie={datos.kpis.porCobrar.pie}
            />
            <TarjetaKpi
              icono={<Building2 className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-sky-500/15 text-sky-600 dark:text-sky-400"
              etiqueta="Cuentas por pagar" valor={dinero(datos.kpis.porPagar.valor)}
              pie={datos.kpis.porPagar.pie}
            />
          </div>

          <Pestanas valor={pestana} onCambio={setPestana} opciones={PESTANAS} />

          {pestana === 'resumen' && (
            <ResumenTab
              datos={datos} dinero={dinero} dineroEje={dineroEje} moneda={moneda} tasa={tasa}
              agrupacion={agrupacion} setAgrupacion={setAgrupacion}
              onVerGastos={() => setPestana('gastos')}
              onVerIngresos={() => setPestana('ingresos')}
              onGestionarCuentas={() => setPestana('cuentas')}
            />
          )}

          {pestana === 'ingresos' && (
            <DetalleTransacciones
              titulo="Ingresos del período"
              transacciones={datos.transacciones.filter(t => t.tipo === 'ingreso')}
              dinero={dinero}
              vacio="No hay ingresos registrados en este período."
            />
          )}

          {pestana === 'gastos' && (
            <DetalleTransacciones
              titulo="Gastos del período"
              transacciones={datos.transacciones.filter(t => t.tipo === 'gasto')}
              dinero={dinero}
              vacio="No hay gastos registrados en este período. Regístralos para que la utilidad y el margen sean reales."
            />
          )}

          {pestana === 'cuentas' && <TabCuentas datos={datos} />}

          {pestana === 'conciliacion' && (
            <Panel titulo="Conciliación" subtitulo="Cuadrar lo registrado con lo que dice el banco">
              <Vacio
                icono={<Landmark className="h-8 w-8" aria-hidden />}
                titulo="Todavía no construida"
                detalle={
                  'La conciliación necesita el extracto del banco para cruzarlo con lo registrado. '
                  + 'Aún no hay forma de subirlo, así que este panel no se inventa nada.'
                }
              />
            </Panel>
          )}

          {pestana === 'reportes' && (
            <Panel
              titulo="Reportes financieros"
              subtitulo="Lo del período, para imprimir o pasar a Excel"
              accion={<EnlacePanel onClick={exportarCsv}>Exportar movimientos</EnlacePanel>}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <a
                  href="/dashboard/reportes"
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-primary"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-foreground">Reporte diario y cierres</span>
                    <span className="block text-[11px] text-muted-foreground">Está en Reportes, con su PDF completo.</span>
                  </span>
                </a>
                <button
                  type="button" onClick={exportarCsv}
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary"
                >
                  <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-foreground">Movimientos del período</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Ingresos y gastos en CSV, en {moneda === 'Bs' ? 'bolívares' : 'dólares'}.
                    </span>
                  </span>
                </button>
              </div>
            </Panel>
          )}

          {/* Lo que falta por registrar. Va al final, y nunca en rojo: no es un
              error del sistema, es información que aún no está. */}
          <Avisos avisos={datos.avisos} />

          {!tipCerrado && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
              <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-amber-800 dark:text-amber-300">
                <strong className="font-bold">Consejo:</strong> pon el saldo de arranque de cada cuenta
                en <em>Cuentas y Bancos</em>. Sin eso lo que se ve es el movimiento registrado, no el
                dinero que hay.
              </p>
              <button
                type="button" onClick={() => setTipCerrado(true)} aria-label="Cerrar consejo"
                className="shrink-0 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:text-amber-300"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pestaña Resumen ─────────────────────────────────────────────────────────

interface PropsResumen {
  datos: ResumenFinanzas;
  dinero: (usd: number, dec?: number) => string;
  dineroEje: (usd: number) => string;
  moneda: 'Bs' | 'USD';
  tasa: number;
  agrupacion: 'dia' | 'semana' | 'mes' | 'auto';
  setAgrupacion: (v: 'dia' | 'semana' | 'mes' | 'auto') => void;
  onVerGastos: () => void;
  onVerIngresos: () => void;
  onGestionarCuentas: () => void;
}

function ResumenTab({
  datos, dinero, dineroEje, moneda, tasa, agrupacion, setAgrupacion,
  onVerGastos, onVerIngresos, onGestionarCuentas,
}: PropsResumen) {
  // Recharts pinta lo que se le da: si se le pasan dólares y el eje dice
  // bolívares, la barra miente. Así que se convierte aquí, una vez.
  const factor = moneda === 'Bs' && tasa ? tasa : 1;
  const flujo = datos.flujo.map(p => ({
    etiqueta: p.etiqueta,
    Ingresos: p.ingresos * factor,
    Gastos: p.gastos * factor,
    'Saldo acumulado': p.acumulado * factor,
  }));

  return (
    <div className="space-y-3">
      {/* Fila 1: flujo de caja y los dos anillos */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          titulo="Flujo de caja"
          subtitulo="Ingresos vs. egresos del período"
          accion={
            <SelectorPanel
              valor={agrupacion} onCambio={setAgrupacion}
              opciones={[
                { valor: 'auto', label: 'Automático' },
                { valor: 'dia', label: 'Por día' },
                { valor: 'semana', label: 'Por semana' },
                { valor: 'mes', label: 'Por mes' },
              ]}
            />
          }
        >
          {flujo.length === 0 ? (
            <Vacio titulo="Sin movimientos en el período" detalle="Cambia el rango de fechas para ver otro." />
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={flujo} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#8a909c" strokeOpacity={0.22} vertical={false} />
                  <XAxis
                    dataKey="etiqueta" tickLine={false} axisLine={false}
                    tick={{ fontSize: 11, fill: '#8a909c' }}
                  />
                  <YAxis
                    yAxisId="izq" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: '#8a909c' }}
                    tickFormatter={v => dineroEje(v / factor)}
                  />
                  <YAxis
                    yAxisId="der" orientation="right" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: '#8a909c' }}
                    tickFormatter={v => dineroEje(v / factor)}
                  />
                  <Tooltip
                    // Recharts admite `undefined` en el valor, asi que se
                    // normaliza antes de dividir: `undefined / factor` es NaN.
                    formatter={(v) => dinero((Number(v) || 0) / factor)}
                    contentStyle={{
                      borderRadius: 12, border: '1px solid #e8eaed', fontSize: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,.08)',
                    }}
                  />
                  <Legend
                    verticalAlign="top" align="right" height={26}
                    iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: '#5b616e' }}
                  />
                  {/* Sin animación a propósito. Recharts la hace por
                      JavaScript y arranca desde altura cero cada vez que el
                      contenedor cambia de tamaño; al cambiar de período o de
                      moneda las barras desaparecían medio segundo. En un
                      panel que se relee constantemente eso se lee como un
                      fallo, no como un detalle. */}
                  <Bar yAxisId="izq" dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]}
                    maxBarSize={26} isAnimationActive={false} />
                  <Bar yAxisId="izq" dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]}
                    maxBarSize={26} isAnimationActive={false} />
                  <Line
                    yAxisId="der" type="monotone" dataKey="Saldo acumulado"
                    stroke="#3b82f6" strokeWidth={2} isAnimationActive={false}
                    dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Anillo
          titulo="Distribución de gastos"
          tajadas={datos.gastosPorCategoria}
          total={datos.kpis.gastos.valor}
          dinero={dinero}
          enlace={<EnlacePanel onClick={onVerGastos}>Ver detalle de gastos</EnlacePanel>}
          vacio="No hay gastos registrados en el período."
        />

        <Anillo
          titulo="Ingresos por método de pago"
          tajadas={datos.ingresosPorMetodo}
          total={datos.kpis.ingresos.valor}
          dinero={dinero}
          conLogo
          enlace={<EnlacePanel onClick={onVerIngresos}>Ver detalle de ingresos</EnlacePanel>}
          vacio="No hay ingresos registrados en el período."
        />
      </div>

      {/* Fila 2: transacciones, saldos y por cobrar */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel
          titulo="Transacciones recientes"
          accion={<EnlacePanel onClick={onVerIngresos}>Ver todas</EnlacePanel>}
          sinRelleno
        >
          {datos.transacciones.length === 0 ? (
            <Vacio titulo="Sin movimientos" detalle="No hay ingresos ni gastos en este período." />
          ) : (
            <TablaTransacciones transacciones={datos.transacciones.slice(0, 8)} dinero={dinero} />
          )}
        </Panel>

        <Panel
          titulo="Saldos en cuentas"
          accion={<EnlacePanel onClick={onGestionarCuentas}>Gestionar cuentas</EnlacePanel>}
          sinRelleno
        >
          {datos.cuentas.length === 0 ? (
            <Vacio titulo="Sin cuentas configuradas" detalle="Créalas en Cuentas y Bancos." />
          ) : (
            <ul className="divide-y divide-border/40">
              {datos.cuentas.map(c => (
                <li key={c.id} className="flex items-center gap-2 px-3.5 py-[9px]">
                  {c.bin
                    ? <LogoBanco id={c.bin as BankBin} size={20} />
                    : <span className="flex h-5 w-5 items-center justify-center rounded bg-[#f1f5f9] text-[#64748b]">
                      <Wallet className="h-3 w-3" aria-hidden />
                    </span>}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/80">{c.nombre}</span>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
                    {c.moneda === 'USD'
                      ? `$ ${c.saldo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `Bs. ${c.saldo.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          titulo="Cuentas por cobrar (Clientes)"
          accion={<EnlacePanel>Ver todas</EnlacePanel>}
          sinRelleno
        >
          {datos.porCobrar.length === 0 ? (
            <Vacio titulo="Nada por cobrar" detalle="Todas las facturas están pagadas." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                    <th className="px-3.5 py-1.5 font-black">Cliente</th>
                    <th className="px-2 py-1.5 font-black">Nº Factura</th>
                    <th className="px-2 py-1.5 text-right font-black">Monto</th>
                    <th className="px-3.5 py-1.5 text-right font-black">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {datos.porCobrar.slice(0, 6).map(c => (
                    <tr key={c.id}>
                      <td className="max-w-[140px] truncate px-3.5 py-[7px] font-medium text-foreground">{c.cliente}</td>
                      <td className="px-2 py-[7px] tabular-nums text-muted-foreground">{c.documento}</td>
                      <td className="px-2 py-[7px] text-right font-bold tabular-nums text-foreground">{dinero(c.monto)}</td>
                      <td className="px-3.5 py-[7px] text-right">
                        {/* El color es la antigüedad: cuanto más vieja la deuda,
                            más urgente, y con un número suelto eso no se ve. */}
                        <Chip tono={c.dias > 60 ? 'peligro' : c.dias > 30 ? 'aviso' : 'exito'}>
                          {c.dias}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Fila 3: por pagar, indicadores y acciones */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <Panel
          titulo="Cuentas por pagar (Proveedores)"
          accion={<EnlacePanel>Ver todas</EnlacePanel>}
          sinRelleno
        >
          {datos.porPagar.length === 0 ? (
            <Vacio
              titulo="Sin compromisos pendientes"
              detalle="Los gastos a crédito aparecen aquí con su vencimiento."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                    <th className="px-3.5 py-1.5 font-black">Proveedor</th>
                    <th className="px-2 py-1.5 font-black">Descripción</th>
                    <th className="px-2 py-1.5 text-right font-black">Monto</th>
                    <th className="px-2 py-1.5 font-black">Vencimiento</th>
                    <th className="px-3.5 py-1.5 text-right font-black">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {datos.porPagar.slice(0, 6).map(p => (
                    <tr key={p.id}>
                      <td className="max-w-[130px] truncate px-3.5 py-[7px] font-medium text-foreground">{p.proveedor}</td>
                      <td className="max-w-[130px] truncate px-2 py-[7px] text-muted-foreground">{p.descripcion}</td>
                      <td className="px-2 py-[7px] text-right font-bold tabular-nums text-foreground">{dinero(p.monto)}</td>
                      <td className="px-2 py-[7px] tabular-nums text-muted-foreground">
                        {p.vencimiento ? fechaCorta(p.vencimiento) : '—'}
                      </td>
                      <td className="px-3.5 py-[7px] text-right">
                        {p.dias == null
                          ? <Chip>—</Chip>
                          : <Chip tono={p.dias < 0 ? 'peligro' : p.dias <= 7 ? 'aviso' : 'exito'}>
                            {p.dias < 0 ? `${Math.abs(p.dias)} vencido` : p.dias}
                          </Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel titulo="Indicadores financieros" subtitulo="Del período seleccionado" sinRelleno>
          <ul className="divide-y divide-border/40">
            {datos.indicadores.map(i => (
              <li key={i.clave} className="flex items-center gap-2 px-3.5 py-[9px]" title={i.ayuda}>
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/80">{i.etiqueta}</span>
                <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-foreground">
                  {i.formato === 'dinero' ? dinero(i.valor)
                    : i.formato === 'pct' ? `${i.valor.toFixed(1)}%`
                      : i.formato === 'dias' ? `${i.valor} días`
                        : i.valor.toLocaleString('de-DE')}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-3">
          <Panel titulo="Acciones rápidas">
            <div className="grid grid-cols-2 gap-2">
              <AccionRapida
                icono={<Plus className="h-4 w-4" aria-hidden />}
                tinte="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                label="Registrar ingreso" href="/dashboard/ventas/nueva"
              />
              <AccionRapida
                icono={<Minus className="h-4 w-4" aria-hidden />}
                tinte="bg-red-500/15 text-red-600 dark:text-red-400"
                label="Registrar gasto" href="/dashboard/reportes?tab=egresos"
              />
              <AccionRapida
                icono={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
                tinte="bg-blue-500/15 text-blue-600 dark:text-blue-400"
                label="Transferencia entre cuentas"
                onClick={onGestionarCuentas}
              />
              <AccionRapida
                icono={<FileText className="h-4 w-4" aria-hidden />}
                tinte="bg-violet-500/15 text-violet-600 dark:text-violet-400"
                label="Generar reporte" href="/dashboard/reportes"
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Anillo con leyenda ──────────────────────────────────────────────────────

function Anillo({
  titulo, tajadas, total, dinero, enlace, vacio, conLogo,
}: {
  titulo: string; tajadas: Tajada[]; total: number;
  dinero: (usd: number, dec?: number) => string;
  enlace?: React.ReactNode; vacio: string; conLogo?: boolean;
}) {
  return (
    <Panel titulo={titulo}>
      {tajadas.length === 0 ? (
        <Vacio titulo="Sin datos" detalle={vacio} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative h-[168px] w-[168px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tajadas} dataKey="monto" nameKey="etiqueta"
                    innerRadius={52} outerRadius={78} paddingAngle={1.5}
                    strokeWidth={0} isAnimationActive={false}
                  >
                    {tajadas.map(t => <Cell key={t.clave} fill={t.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [dinero(Number(v) || 0), String(n ?? '')]}
                    contentStyle={{
                      borderRadius: 12, border: '1px solid #e8eaed', fontSize: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,.08)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* El total va en el hueco del anillo: es el número que se busca
                  primero, y fuera obliga a saltar la vista. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[13px] font-black leading-none tabular-nums text-foreground">
                  {dinero(total, 0)}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground/70">Total</span>
              </div>
            </div>

            <ul className="min-w-0 flex-1 space-y-[3px]">
              {tajadas.slice(0, 7).map(t => (
                <li key={t.clave} className="flex items-center gap-1.5">
                  {conLogo && t.clave !== 'sin_clasificar'
                    ? <LogoBanco id={t.clave as BankBin} size={14} />
                    : <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.color }} />}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{t.etiqueta}</span>
                  <span className="shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground">
                    {t.pct.toFixed(0)}%
                  </span>
                  <span className="w-[74px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                    {dinero(t.monto, 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {enlace && <div className="mt-2 border-t border-border/40 pt-2 text-center">{enlace}</div>}
        </>
      )}
    </Panel>
  );
}

// ── Tabla de transacciones ──────────────────────────────────────────────────

function TablaTransacciones({
  transacciones, dinero,
}: { transacciones: ResumenFinanzas['transacciones']; dinero: (u: number, d?: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
            <th className="px-3.5 py-1.5 font-black">Fecha</th>
            <th className="px-2 py-1.5 font-black">Tipo</th>
            <th className="px-2 py-1.5 font-black">Descripción</th>
            <th className="px-2 py-1.5 font-black">Categoría</th>
            <th className="px-2 py-1.5 font-black">Método de pago</th>
            <th className="px-2 py-1.5 text-right font-black">Monto</th>
            <th className="px-3.5 py-1.5 font-black">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {transacciones.map(t => (
            <tr key={t.id}>
              <td className="whitespace-nowrap px-3.5 py-[7px] tabular-nums text-muted-foreground">
                {fechaCorta(t.fecha)}
              </td>
              <td className="px-2 py-[7px]">
                <Chip tono={t.tipo === 'ingreso' ? 'exito' : 'peligro'}>
                  {t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
                </Chip>
              </td>
              <td className="max-w-[190px] truncate px-2 py-[7px] font-medium text-foreground" title={t.descripcion}>
                {t.descripcion}
              </td>
              <td className="max-w-[110px] truncate px-2 py-[7px] text-muted-foreground">{t.categoria}</td>
              <td className="px-2 py-[7px]">
                <span className="flex items-center gap-1.5">
                  {t.metodoBin && <LogoBanco id={t.metodoBin as BankBin} size={16} />}
                  <span className="max-w-[110px] truncate text-muted-foreground">{t.metodo}</span>
                </span>
              </td>
              <td className={cn('px-2 py-[7px] text-right font-bold tabular-nums',
                t.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {t.tipo === 'gasto' ? '−' : ''}{dinero(t.monto)}
              </td>
              <td className="px-3.5 py-[7px]">
                <Chip tono={t.estado === 'Completado' ? 'exito' : 'aviso'}>{t.estado}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetalleTransacciones({
  titulo, transacciones, dinero, vacio,
}: {
  titulo: string; transacciones: ResumenFinanzas['transacciones'];
  dinero: (u: number, d?: number) => string; vacio: string;
}) {
  const total = transacciones.reduce((s, t) => s + t.monto, 0);
  return (
    <Panel
      titulo={titulo}
      subtitulo={`${transacciones.length} movimiento(s) · ${dinero(total)}`}
      sinRelleno
    >
      {transacciones.length === 0
        ? <Vacio titulo="Sin movimientos" detalle={vacio} />
        : <TablaTransacciones transacciones={transacciones} dinero={dinero} />}
    </Panel>
  );
}

// ── Pestaña Cuentas y Bancos ────────────────────────────────────────────────

function TabCuentas({ datos }: { datos: ResumenFinanzas }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel
        titulo="Cuentas y bancos"
        subtitulo="El saldo se calcula: arranque + lo cobrado por esa cuenta − lo pagado desde ella"
        sinRelleno
      >
        {datos.cuentas.length === 0 ? (
          <Vacio titulo="Sin cuentas" detalle="Aún no hay ninguna cuenta configurada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                  <th className="px-3.5 py-1.5 font-black">Cuenta</th>
                  <th className="px-2 py-1.5 font-black">Tipo</th>
                  <th className="px-2 py-1.5 text-right font-black">Arranque</th>
                  <th className="px-2 py-1.5 text-right font-black">Entradas</th>
                  <th className="px-2 py-1.5 text-right font-black">Salidas</th>
                  <th className="px-3.5 py-1.5 text-right font-black">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {datos.cuentas.map(c => {
                  const fmt = (n: number) => c.moneda === 'USD'
                    ? `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `Bs. ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  return (
                    <tr key={c.id}>
                      <td className="px-3.5 py-[7px]">
                        <span className="flex items-center gap-1.5">
                          {c.bin
                            ? <LogoBanco id={c.bin as BankBin} size={18} />
                            : <Wallet className="h-3.5 w-3.5 text-[#64748b]" aria-hidden />}
                          <span className="font-medium text-foreground">{c.nombre}</span>
                        </span>
                      </td>
                      <td className="px-2 py-[7px] capitalize text-muted-foreground">
                        {c.tipo.replace('_', ' ')}
                      </td>
                      <td className="px-2 py-[7px] text-right tabular-nums text-muted-foreground">{fmt(c.saldoInicial)}</td>
                      <td className="px-2 py-[7px] text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(c.entradas)}</td>
                      <td className="px-2 py-[7px] text-right tabular-nums text-red-600 dark:text-red-400">{fmt(c.salidas)}</td>
                      <td className="px-3.5 py-[7px] text-right font-black tabular-nums text-foreground">{fmt(c.saldo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel titulo="Cómo se calcula" subtitulo="Para que el saldo se pueda discutir">
        <div className="space-y-2 text-[11.5px] leading-snug text-foreground/80">
          <p>
            El saldo <strong>no se guarda</strong>: se calcula cada vez. Un número que hay que
            mantener a mano se desincroniza el primer día y deja de servir.
          </p>
          <p className="rounded-lg bg-muted/50 px-2.5 py-2 font-mono text-[11px]">
            saldo = arranque + entradas − salidas
          </p>
          <p>
            Las <strong>entradas</strong> salen de la columna de banco de cada venta —la misma
            clasificación que alimenta el Reporte de Ventas—, así que un cobro no se cuenta dos
            veces. Las <strong>salidas</strong>, del método de pago de cada gasto.
          </p>
          <p>
            El <strong>arranque</strong> es el saldo con el que la cuenta empezó a llevarse aquí.
            Mientras esté en cero, lo que se ve es el movimiento registrado y no el dinero que hay.
          </p>
          <p className="text-muted-foreground">
            Falta la pantalla para editar el arranque y registrar traspasos entre cuentas; la tabla
            ya existe en la base de datos.
          </p>
        </div>
      </Panel>
    </div>
  );
}

// ── Acción rápida ───────────────────────────────────────────────────────────

function AccionRapida({
  icono, tinte, label, href, onClick,
}: {
  icono: React.ReactNode; tinte: string; label: string;
  href?: string; onClick?: () => void;
}) {
  const contenido = (
    <>
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tinte)}>{icono}</span>
      <span className="text-center text-[11px] font-semibold leading-tight text-foreground/80">{label}</span>
    </>
  );
  const clases = 'flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-2.5 transition-colors hover:border-primary hover:bg-primary/5';

  if (href) return <a href={href} className={clases}>{contenido}</a>;
  return <button type="button" onClick={onClick} className={clases}>{contenido}</button>;
}
