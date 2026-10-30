'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertOctagon, AlertTriangle, ArrowDownRight, Banknote, ChevronDown, ChevronRight, Download, Info,
  Landmark, Loader2, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import { Chip, Panel } from '@/components/panel/Piezas';
import { cn } from '@/lib/utils';
import { useRefrescarAlCambiar } from '@/lib/use-refrescar';
import type { Diagnostico, EstadoResultados, Hallazgo, Severidad } from '@/lib/utilidad/periodo';

/**
 * Utilidad del período: cuánto se ganó (ventas − costo de los carros − gastos del taller),
 * cuánto entró de verdad a la caja, y qué datos están distorsionando esas cifras.
 * Todo sale de UN cálculo (lib/utilidad/periodo.ts): la pantalla, el PDF y la IA dicen lo mismo.
 */

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const mas = (f: string, k: number) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const dmy = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const num = (x: number, d = 2) => (Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (x: number) => `${x < 0 ? '-' : ''}$${num(Math.abs(x))}`;
const bs = (x: number) => `Bs ${num(x)}`;
const pct = (x: number) => `${num(x, 1)}%`;

type Preset = 'hoy' | 'ayer' | 'semana' | 'semana_pasada' | 'mes' | 'mes_pasado';
function rangoDe(p: Preset): { desde: string; hasta: string } {
  const h = hoy(); const d = new Date(`${h}T12:00:00Z`);
  const lunes = mas(h, -((d.getUTCDay() + 6) % 7));
  if (p === 'hoy') return { desde: h, hasta: h };
  if (p === 'ayer') return { desde: mas(h, -1), hasta: mas(h, -1) };
  if (p === 'semana') return { desde: lunes, hasta: h };
  if (p === 'semana_pasada') return { desde: mas(lunes, -7), hasta: mas(lunes, -1) };
  if (p === 'mes') return { desde: `${h.slice(0, 8)}01`, hasta: h };
  const primero = `${h.slice(0, 8)}01`; const finAnt = mas(primero, -1);
  return { desde: `${finAnt.slice(0, 8)}01`, hasta: finAnt };
}
const PRESETS: Array<[Preset, string]> = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['semana_pasada', 'Semana pasada'], ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado']];

const SEV: Record<Severidad, { t: string; c: string; ic: React.ReactNode }> = {
  critico: { t: 'Crítico', c: 'border-red-500/40 bg-red-500/[0.06]', ic: <AlertOctagon className="h-4 w-4 text-red-600" aria-hidden /> },
  alto: { t: 'Alto', c: 'border-orange-500/40 bg-orange-500/[0.05]', ic: <AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden /> },
  medio: { t: 'Medio', c: 'border-amber-400/40 bg-amber-400/[0.05]', ic: <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> },
  info: { t: 'Info', c: 'border-border bg-muted/30', ic: <Info className="h-4 w-4 text-sky-600" aria-hidden /> },
};
const EFECTO: Record<string, { t: string; tono: 'peligro' | 'aviso' | 'info' | 'neutro' }> = {
  infla: { t: 'La utilidad sale MÁS ALTA de lo real', tono: 'peligro' },
  reduce: { t: 'La utilidad sale MÁS BAJA de lo real', tono: 'aviso' },
  caja: { t: 'Afecta la caja y los bancos', tono: 'info' },
  neutro: { t: 'Dato que no cuadra', tono: 'neutro' },
};

function enlaceDe(r: { tabla: string; id: string; descripcion: string }): string | null {
  const placa = /·\s*([A-Z0-9]{5,8})\b/.exec(r.descripcion)?.[1];
  if (r.tabla === 'ventas_dia') return `/dashboard/reportes?venta=${r.id}`;
  if (r.tabla === 'egresos') return placa ? `/dashboard/ficha?placa=${encodeURIComponent(placa)}` : '/dashboard/reportes?tab=egresos';
  if (r.tabla === 'servicios') return `/dashboard/servicios?orden=${r.id}`;
  if (r.tabla === 'payroll_ledger') return '/dashboard/nomina';
  if (r.tabla === 'placa') return `/dashboard/ficha?placa=${encodeURIComponent(r.id)}`;
  if (r.tabla === 'dia') return '/dashboard/finanzas?pestana=banco';
  return null;
}

export default function UtilidadPeriodo({ sede }: { sede?: string | null }) {
  const [preset, setPreset] = useState<Preset | 'otro'>('mes');
  const [rango, setRango] = useState(() => rangoDe('mes'));
  const [datos, setDatos] = useState<{ estado: EstadoResultados; diagnostico: Diagnostico } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ia, setIa] = useState<{ texto: string; cargando: boolean; error: string | null }>({ texto: '', cargando: false, error: null });
  const [filtro, setFiltro] = useState<'todos' | 'infla' | 'reduce' | 'caja'>('todos');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const p = new URLSearchParams(rango); if (sede) p.set('sede', sede);
      const r = await fetch(`/api/reportes/utilidad-periodo?${p}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'No se pudo calcular la utilidad.');
      setDatos(j);
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [rango, sede]);
  useEffect(() => { void cargar(); setIa({ texto: '', cargando: false, error: null }); }, [cargar]);
  useRefrescarAlCambiar(cargar);

  const analizarIA = async () => {
    setIa({ texto: '', cargando: true, error: null });
    try {
      const r = await fetch('/api/reportes/utilidad-periodo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rango, sede }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'La IA no respondió.');
      setIa({ texto: j.analisis, cargando: false, error: null });
    } catch (e) { setIa({ texto: '', cargando: false, error: (e as Error).message }); }
  };

  const descargarPdf = async () => {
    if (!datos) return;
    setGenerando(true);
    try { const { generarUtilidadPDF } = await import('@/lib/utilidad-pdf'); generarUtilidadPDF({ ...datos, analisisIA: ia.texto || null }); }
    finally { setGenerando(false); }
  };

  const e = datos?.estado; const d = datos?.diagnostico;
  const hallazgos = useMemo(() => (d?.hallazgos || []).filter(h => filtro === 'todos' || h.efecto === filtro), [d, filtro]);
  const graf = useMemo(() => (e?.porDia || []).map(x => ({ dia: x.fecha.slice(8, 10) + '/' + x.fecha.slice(5, 7), Ventas: x.ventas, Costos: r(x.costo + x.gastos), Utilidad: x.utilidad })), [e]);

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(([k, t]) => (
          <button key={k} type="button" onClick={() => { setPreset(k); setRango(rangoDe(k)); }}
            className={cn('h-8 rounded-lg px-3 text-[12px] font-semibold', preset === k ? 'bg-primary text-primary-foreground' : 'border border-border hover:border-primary')}>{t}</button>
        ))}
        <input type="date" value={rango.desde} max={rango.hasta} onChange={x => { setPreset('otro'); setRango(v => ({ ...v, desde: x.target.value })); }} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]" aria-label="Desde" />
        <input type="date" value={rango.hasta} min={rango.desde} max={hoy()} onChange={x => { setPreset('otro'); setRango(v => ({ ...v, hasta: x.target.value })); }} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]" aria-label="Hasta" />
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={cargar} disabled={cargando} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-semibold hover:border-primary"><RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} aria-hidden /> Actualizar</button>
          <button type="button" onClick={analizarIA} disabled={!datos || ia.cargando} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50">
            {ia.cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Analizar con IA
          </button>
          <button type="button" onClick={descargarPdf} disabled={!datos || generando} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-bold text-background hover:opacity-90 disabled:opacity-50">
            {generando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />} PDF
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12.5px] text-red-600">{error}</p>}
      {cargando && !datos && <p className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando la utilidad y revisando todo el período…</p>}

      {e && d && (
        <>
          {/* Veredicto */}
          <section className={cn('relative overflow-hidden rounded-2xl border p-4 sm:p-5', e.utilidad >= 0 ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.08] to-transparent' : 'border-red-500/40 bg-gradient-to-br from-red-500/[0.08] to-transparent')}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">Utilidad del {dmy(e.desde)}{e.desde !== e.hasta ? ` al ${dmy(e.hasta)}` : ''} · {e.dias} día(s)</p>
                <p className={cn('mt-1 text-[38px] font-black leading-none tabular-nums sm:text-[46px]', e.utilidad >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>{usd(e.utilidad)}</p>
                <p className="mt-1.5 text-[13px] text-foreground/80">
                  Margen <strong>{pct(e.margen)}</strong> sobre ${num(e.ventas.base)} vendidos · utilidad bruta {usd(e.utilidadBruta)} ({pct(e.margenBruto)})
                  {e.tasaHoy > 0 && <> · a la tasa de hoy {bs(e.utilidad * e.tasaHoy)}</>}
                </p>
                {e.utilidad < 0 && <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-700 dark:text-red-300">Utilidad negativa: no se ajusta ni se esconde. Abajo está si es real (gastos mayores que lo vendido) o si viene de datos mal cargados.</p>}
              </div>
              <Confiabilidad puntaje={d.puntaje} resumen={d.resumen} />
            </div>
            <Cascada e={e} />
          </section>

          {/* Cifras */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <Kpi ic={<TrendingUp className="h-4 w-4" aria-hidden />} t="Ventas (sin IVA)" v={usd(e.ventas.base)} p={`${e.ventas.n} ventas · IVA aparte ${usd(e.ventas.iva)}`} tono="text-foreground" />
            <Kpi ic={<ArrowDownRight className="h-4 w-4" aria-hidden />} t="Costo de los carros" v={usd(e.costoCarros.total)} p={`${pct(e.ventas.base ? e.costoCarros.total / e.ventas.base * 100 : 0)} de lo vendido · ${e.costoCarros.n} gastos`} tono="text-orange-600" />
            <Kpi ic={<ArrowDownRight className="h-4 w-4" aria-hidden />} t="Gastos del taller" v={usd(e.gastosTaller.total)} p={`${e.gastosTaller.n} gastos (nómina, local, servicios…)`} tono="text-red-600" />
            <Kpi ic={<Wallet className="h-4 w-4" aria-hidden />} t="Entró a caja y bancos" v={usd(e.caja.totalEntradoUsdDelDia)} p={`a la tasa de cada día · hoy ${usd(e.caja.totalEntradoUsdHoy)}`} tono="text-emerald-600" />
            <Kpi ic={<Banknote className="h-4 w-4" aria-hidden />} t="Neto de caja" v={usd(e.caja.netoCajaUsd)} p={`entró − gastos pagados · por pagar ${usd(e.caja.gastosPorPagarUsd)}`} tono={e.caja.netoCajaUsd < 0 ? 'text-red-600' : 'text-foreground'} />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {/* Estado de resultados */}
            <Panel titulo="Estado de resultados" subtitulo="Lo ganado: ventas del período menos sus costos y gastos (fecha de cada registro)">
              <table className="w-full text-[12.5px]">
                <tbody>
                  <FilaER t="Ventas del período (sin IVA)" v={e.ventas.base} fuerte />
                  {e.ventas.porDepartamento.map(x => <FilaER key={x.clave} t={`${x.etiqueta} · ${x.n}`} v={x.usd} sub />)}
                  <FilaER t="− Costo de los carros" v={-e.costoCarros.total} fuerte />
                  {e.costoCarros.porCategoria.map(x => <FilaER key={x.clave} t={`${x.etiqueta} · ${x.n}`} v={-x.usd} sub />)}
                  {e.costoCarros.traidoDeAntes > 0 && <tr><td colSpan={2} className="pl-4 text-[11px] text-muted-foreground">Incluye {usd(e.costoCarros.traidoDeAntes)} de piezas compradas antes del período para carros cobrados en el período.</td></tr>}
                  {e.costoCarros.enProceso.total > 0 && <tr><td className="py-1 pl-4 text-[11.5px] text-sky-700">Trabajo en proceso (carros aún sin cobrar: no resta todavía)</td><td className="py-1 text-right text-[11.5px] tabular-nums text-sky-700">{usd(e.costoCarros.enProceso.total)}</td></tr>}
                  <FilaER t="= Utilidad bruta" v={e.utilidadBruta} total />
                  <FilaER t="− Gastos del taller" v={-e.gastosTaller.total} fuerte />
                  {e.gastosTaller.porCategoria.map(x => <FilaER key={x.clave} t={`${x.etiqueta} · ${x.n}`} v={-x.usd} sub />)}
                  <FilaER t="= UTILIDAD DEL PERÍODO" v={e.utilidad} total grande />
                  <tr><td colSpan={2} className="pt-2 text-[11px] text-muted-foreground">IVA cobrado {usd(e.ventas.iva)}: no es ingreso, se le debe al SENIAT. Lo facturado con IVA: {usd(e.ventas.facturado)}.</td></tr>
                </tbody>
              </table>
            </Panel>

            {/* Caja */}
            <Panel titulo="Caja: lo que entró y salió de verdad" subtitulo="Bolívares exactos; dólares a la tasa del día que entró y a la de hoy">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini t="Entró en Bs" v={bs(e.caja.entradas.bs)} p={`${usd(e.caja.entradas.usdDelDia)} del día · ${usd(e.caja.entradas.usdHoy)} hoy`} />
                <Mini t="Entró en $" v={usd(e.caja.entradas.usdDirecto)} p="divisas, Zelle, Binance, Cashea" />
                <Mini t="Diferencia cambiaria" v={usd(e.caja.diferenciaCambiaria)} p="los Bs valen hoy distinto" tono={e.caja.diferenciaCambiaria < 0 ? 'text-red-600' : 'text-emerald-600'} />
              </div>
              <table className="mt-3 w-full text-[12px]">
                <thead><tr className="border-b border-border text-left text-[10.5px] uppercase text-muted-foreground"><th className="py-1.5">Cuenta</th><th className="text-right">Monto</th><th className="text-right">$ del día</th><th className="text-right">$ hoy</th></tr></thead>
                <tbody>
                  {e.caja.porCuenta.map(c => (
                    <tr key={c.cuenta} className="border-b border-border/50"><td className="py-1.5 font-medium">{c.nombre}</td><td className="text-right tabular-nums">{c.moneda === 'Bs' ? bs(c.monto) : usd(c.monto)}</td><td className="text-right tabular-nums">{usd(c.usdDelDia)}</td><td className="text-right tabular-nums text-muted-foreground">{usd(c.usdHoy)}</td></tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-3 space-y-1 text-[12px]">
                <Li t="De las ventas al contado" v={usd(e.ventas.contadoRecibido)} />
                <Li t="Iniciales de Cashea (entran al BNC)" v={usd(e.ventas.casheaInicial)} />
                <Li t="Cuotas de Cashea cobradas" v={usd(e.caja.entradas.cuotasCashea)} />
                <Li t="Cobros de deudas" v={usd(e.caja.entradas.abonos)} />
                <Li t="Gastos pagados" v={`-${usd(e.caja.gastosPagadosUsd)}`} />
                <Li t="Quedó por cobrar: Cashea financiado / crédito" v={`${usd(e.ventas.casheaFinanciado)} / ${usd(e.ventas.credito)}`} gris />
                <Li t="Quedó por pagar a proveedores" v={usd(e.caja.gastosPorPagarUsd)} gris />
              </ul>
            </Panel>
          </div>

          {/* Día por día */}
          {graf.length > 1 && (
            <Panel titulo="Día por día" subtitulo="Ventas contra costos y gastos, y la utilidad de cada día">
              <div className="h-[260px] w-full">
                <ResponsiveContainer>
                  <ComposedChart data={graf} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={52} />
                    <Tooltip formatter={(v) => usd(Number(v))} />
                    <Bar dataKey="Ventas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Costos" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Line dataKey="Utilidad" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          {/* IA */}
          {(ia.texto || ia.cargando || ia.error) && (
            <Panel titulo="Análisis con IA" subtitulo="La IA lee las cifras y hallazgos ya calculados; no inventa montos">
              {ia.cargando && <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Analizando todo el período…</p>}
              {ia.error && <p className="text-[12.5px] text-red-600">{ia.error}</p>}
              {ia.texto && <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{ia.texto}</ReactMarkdown></div>}
            </Panel>
          )}

          {/* Diagnóstico */}
          <Panel titulo="Diagnóstico: qué está distorsionando la utilidad" subtitulo="Cada hallazgo con sus registros exactos y qué hacer"
            accion={<div className="flex gap-1">{([['todos', 'Todos'], ['infla', 'La inflan'], ['reduce', 'La bajan'], ['caja', 'Caja']] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)} className={cn('h-7 rounded-md px-2 text-[11px] font-bold', filtro === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{t}</button>))}</div>}>
            {hallazgos.length === 0 ? <p className="flex items-center gap-2 py-6 text-[13px] text-emerald-700"><ShieldCheck className="h-5 w-5" aria-hidden /> Sin hallazgos: las cifras del período cuadran.</p> : (
              <ul className="space-y-2">
                {hallazgos.map(h => <TarjetaHallazgo key={h.id} h={h} abierto={!!abiertos[h.id]} onToggle={() => setAbiertos(a => ({ ...a, [h.id]: !a[h.id] }))} />)}
              </ul>
            )}
          </Panel>

          {/* Conciliación */}
          <Panel titulo="Conciliación bancaria del período" subtitulo="Qué estado de cuenta se usó (la versión más reciente), qué días faltan y qué cambió después">
            {d.conciliacion.length === 0 ? <p className="py-4 text-[12.5px] text-muted-foreground">No hubo movimiento por bancos en el período.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[12px]">
                  <thead><tr className="border-b border-border text-left text-[10.5px] uppercase text-muted-foreground">
                    <th className="py-1.5 pr-2">Banco</th><th className="pr-2">Último estado conciliado</th><th className="pr-2 text-right">Conciliado</th><th className="pr-2 text-right">Pendientes</th><th className="pr-2 text-center">Días cubiertos</th><th className="pr-2">Sin conciliar</th><th>Cambios después</th>
                  </tr></thead>
                  <tbody>
                    {d.conciliacion.map(b => (
                      <tr key={b.banco} className="border-b border-border/50 align-top">
                        <td className="py-2 pr-2 font-bold"><Landmark className="mr-1 inline h-3.5 w-3.5" aria-hidden />{b.nombre}</td>
                        <td className="pr-2">{b.ultimaCorrida ? <>
                          <span className="block font-medium">{b.ultimaCorrida.archivo || 'archivo'} · {dmy(b.ultimaCorrida.desde)}–{dmy(b.ultimaCorrida.hasta)}</span>
                          <span className="block text-[10.5px] text-muted-foreground">Cargado {b.ultimaCorrida.cargada}{b.ultimaCorrida.usuario ? ` por ${b.ultimaCorrida.usuario}` : ''}{b.ultimaCorrida.huella ? ` · huella ${b.ultimaCorrida.huella.slice(0, 10)}` : ''}{b.ultimaCorrida.versionesAnteriores ? ` · ${b.ultimaCorrida.versionesAnteriores} versión(es) anterior(es) ignoradas` : ''}</span>
                        </> : <span className="text-red-600">Nunca conciliado en el período</span>}</td>
                        <td className="pr-2 text-right tabular-nums">{b.ultimaCorrida ? pct(b.ultimaCorrida.porcentaje) : '—'}</td>
                        <td className="pr-2 text-right tabular-nums">{b.ultimaCorrida?.pendientes ?? '—'}</td>
                        <td className="pr-2 text-center tabular-nums">{b.diasCubiertos}/{b.diasConMovimiento}</td>
                        <td className="pr-2">{b.diasSinConciliar.length ? <span className="text-[11px] text-amber-700">{b.diasSinConciliar.slice(0, 8).map(f => f.slice(8, 10) + '/' + f.slice(5, 7)).join(', ')}{b.diasSinConciliar.length > 8 ? ` +${b.diasSinConciliar.length - 8}` : ''}</span> : <Chip tono="exito">Todo</Chip>}</td>
                        <td>{b.cambiosDespues ? <Chip tono="aviso">{b.cambiosDespues}</Chip> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          {e.avisos.map(a => <p key={a} className="text-[11.5px] text-amber-700">{a}</p>)}
        </>
      )}
    </div>
  );
}

const r = (x: number) => Math.round(x * 100) / 100;

function Kpi({ ic, t, v, p, tono }: { ic: React.ReactNode; t: string; v: string; p: string; tono: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">{ic}{t}</p>
      <p className={cn('mt-1 text-[19px] font-black tabular-nums', tono)}>{v}</p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{p}</p>
    </div>
  );
}
function Mini({ t, v, p, tono }: { t: string; v: string; p: string; tono?: string }) {
  return <div className="rounded-xl bg-muted/40 p-2"><p className="text-[10.5px] font-semibold text-muted-foreground">{t}</p><p className={cn('text-[14px] font-black tabular-nums', tono)}>{v}</p><p className="text-[10px] text-muted-foreground">{p}</p></div>;
}
function Li({ t, v, gris }: { t: string; v: string; gris?: boolean }) {
  return <li className={cn('flex justify-between gap-2 border-b border-border/40 pb-1', gris && 'text-muted-foreground')}><span>{t}</span><span className="font-semibold tabular-nums">{v}</span></li>;
}
function FilaER({ t, v, sub, fuerte, total, grande }: { t: string; v: number; sub?: boolean; fuerte?: boolean; total?: boolean; grande?: boolean }) {
  return (
    <tr className={cn(total && 'border-t-2 border-foreground/20', sub && 'text-muted-foreground')}>
      <td className={cn('py-1', sub && 'pl-4 text-[11.5px]', (fuerte || total) && 'font-bold', grande && 'text-[14px]')}>{t}</td>
      <td className={cn('py-1 text-right tabular-nums', (fuerte || total) && 'font-bold', grande && 'text-[15px] font-black', total && (v < 0 ? 'text-red-600' : 'text-emerald-700'))}>{usd(v)}</td>
    </tr>
  );
}

function Confiabilidad({ puntaje, resumen }: { puntaje: number; resumen: Diagnostico['resumen'] }) {
  const c = puntaje >= 80 ? '#16a34a' : puntaje >= 55 ? '#d97706' : '#dc2626';
  const t = puntaje >= 80 ? 'Cifras confiables' : puntaje >= 55 ? 'Revisar antes de decidir' : 'Datos con fallas importantes';
  const R = 34; const L = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3">
      <svg width="86" height="86" viewBox="0 0 86 86" role="img" aria-label={`Confiabilidad ${puntaje} de 100`}>
        <circle cx="43" cy="43" r={R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="8" />
        <circle cx="43" cy="43" r={R} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(puntaje / 100) * L} ${L}`} transform="rotate(-90 43 43)" />
        <text x="43" y="48" textAnchor="middle" fontSize="20" fontWeight="900" fill={c}>{puntaje}</text>
      </svg>
      <div className="text-[12px]">
        <p className="font-black" style={{ color: c }}>{t}</p>
        <p className="text-muted-foreground">{resumen.criticos} crítico(s) · {resumen.altos} alto(s) · {resumen.medios} medio(s)</p>
        <p className="text-muted-foreground">{resumen.infla} la inflan · {resumen.reduce} la bajan · {resumen.caja} de caja</p>
      </div>
    </div>
  );
}

function Cascada({ e }: { e: EstadoResultados }) {
  const max = Math.max(1, e.ventas.base);
  const w = (x: number) => `${Math.max(0, Math.min(100, (Math.abs(x) / max) * 100))}%`;
  const filas = [
    { t: 'Ventas', v: e.ventas.base, c: 'bg-emerald-500' },
    { t: 'Costo de los carros', v: -e.costoCarros.total, c: 'bg-orange-500' },
    { t: 'Gastos del taller', v: -e.gastosTaller.total, c: 'bg-red-500' },
    { t: 'Utilidad', v: e.utilidad, c: e.utilidad >= 0 ? 'bg-blue-600' : 'bg-red-700' },
  ];
  return (
    <div className="mt-4 space-y-1.5">
      {filas.map(f => (
        <div key={f.t} className="grid grid-cols-[150px_1fr_110px] items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">{f.t}</span>
          <span className="h-3 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', f.c)} style={{ width: w(f.v) }} /></span>
          <span className={cn('text-right font-bold tabular-nums', f.v < 0 && 'text-red-600')}>{usd(f.v)}</span>
        </div>
      ))}
    </div>
  );
}

function TarjetaHallazgo({ h, abierto, onToggle }: { h: Hallazgo; abierto: boolean; onToggle: () => void }) {
  const s = SEV[h.severidad]; const ef = EFECTO[h.efecto];
  return (
    <li className={cn('rounded-xl border p-3', s.c)}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-left" aria-expanded={abierto}>
        <span className="mt-0.5">{s.ic}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <strong className="text-[13px] text-foreground">{h.titulo}</strong>
            <Chip tono={ef.tono}>{ef.t}</Chip>
            {h.total > 0 && <Chip>{h.total} registro(s)</Chip>}
            {h.impactoUsd !== 0 && <span className={cn('text-[12px] font-black tabular-nums', h.impactoUsd < 0 ? 'text-red-600' : 'text-emerald-700')}>{h.efecto === 'caja' ? 'En juego ' : 'Impacto '}{usd(h.impactoUsd)}</span>}
          </span>
          <span className="mt-1 block text-[12px] text-foreground/80">{h.explicacion}</span>
          <span className="mt-1 block text-[11.5px] font-semibold text-primary">Qué hacer: {h.accion}</span>
        </span>
        {h.registros.length > 0 && (abierto ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />)}
      </button>
      {abierto && h.registros.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[11.5px]">
            <thead><tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground"><th className="py-1">Fecha</th><th>Registro</th><th>Detalle</th><th className="text-right">Monto</th><th /></tr></thead>
            <tbody>
              {h.registros.slice(0, 200).map((x, i) => {
                const href = enlaceDe(x);
                return (
                  <tr key={`${x.id}-${i}`} className="border-b border-border/40">
                    <td className="py-1 tabular-nums">{dmy(x.fecha)}</td>
                    <td className="font-medium">{x.descripcion}</td>
                    <td className="text-muted-foreground">{x.detalle || ''}</td>
                    <td className="text-right font-bold tabular-nums">{x.usd ? usd(x.usd) : ''}</td>
                    <td className="pl-2 text-right">{href && <Link href={href} className="font-bold text-primary hover:underline">Abrir</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {h.registros.length > 200 && <p className="mt-1 text-[11px] text-muted-foreground">Se muestran 200 de {h.registros.length}; el PDF los trae todos.</p>}
        </div>
      )}
    </li>
  );
}

