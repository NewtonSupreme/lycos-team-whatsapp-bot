'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Car, ChevronRight, Loader2, Search, Wrench } from 'lucide-react';
import { Chip, Panel } from '@/components/panel/Piezas';
import ModalBase from '@/components/ui/modales/ModalBase';
import { cn } from '@/lib/utils';
import type { CategoriaUtilidad, EstadoResultados, TrabajoUtilidad } from '@/lib/utilidad/periodo';

/**
 * La utilidad desarmada: por categoría (qué vende más y qué deja más) y por trabajo (cada venta
 * con lo que costó), y el detalle de un trabajo renglón por renglón.
 * Sale del MISMO cálculo que el total del período: la suma de los trabajos más los costos sin
 * trabajo da exactamente el costo de los carros del período.
 */

const num = (x: number, d = 2) => (Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (x: number) => `${x < 0 ? '-' : ''}$${num(Math.abs(x))}`;
const pct = (x: number) => `${num(x, 1)}%`;
const dmy = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const tonoMargen = (m: number) => (m < 0 ? 'text-red-600 dark:text-red-400' : m < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400');

export function UtilidadPorCategoria({ e, onVerCategoria }: { e: EstadoResultados; onVerCategoria: (clave: string) => void }) {
  const [orden, setOrden] = useState<'utilidad' | 'ventas' | 'n' | 'margen'>('utilidad');
  const cats = useMemo(() => [...(e.porCategoria || [])].sort((a, b) => (b[orden] as number) - (a[orden] as number)), [e, orden]);
  const total = { ventas: cats.reduce((s, c) => s + c.ventas, 0), costo: cats.reduce((s, c) => s + c.costo, 0), n: cats.reduce((s, c) => s + c.n, 0) };
  const graf = cats.map(c => ({ cat: c.etiqueta.split(' ')[0], Utilidad: c.utilidad, Costo: c.costo }));
  const masVendida = [...cats].sort((a, b) => b.n - a.n)[0];
  const masRentable = [...cats].filter(c => c.ventas >= 50).sort((a, b) => b.margen - a.margen)[0];
  const masDeja = [...cats].sort((a, b) => b.utilidad - a.utilidad)[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {masDeja && <Destacado t="La que más deja" c={masDeja} v={usd(masDeja.utilidad)} p={`${pct(masDeja.margen)} de margen · ${masDeja.n} trabajos`} />}
        {masVendida && <Destacado t="La que más se vende" c={masVendida} v={`${masVendida.n} trabajos`} p={`${usd(masVendida.ventas)} vendidos · ticket ${usd(masVendida.ticket)}`} />}
        {masRentable && <Destacado t="La de mejor margen" c={masRentable} v={pct(masRentable.margen)} p={`deja ${usd(masRentable.utilidad)} de ${usd(masRentable.ventas)}`} />}
      </div>

      <Panel titulo="Utilidad por categoría" subtitulo="Lo vendido sin IVA menos lo que costaron sus repuestos e insumos. Toca una para ver sus trabajos."
        accion={(
          <select value={orden} onChange={x => setOrden(x.target.value as typeof orden)} className="h-[26px] rounded-lg border border-border bg-card px-2 text-[11.5px]">
            <option value="utilidad">Ordenar por utilidad</option><option value="ventas">por ventas</option><option value="n">por cantidad</option><option value="margen">por margen</option>
          </select>
        )} sinRelleno>
        <div className="h-[220px] px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={graf} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="cat" tick={{ fontSize: 10.5 }} interval={0} />
              <YAxis tick={{ fontSize: 10.5 }} width={48} />
              <Tooltip formatter={(x) => usd(Number(x))} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="Costo" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Utilidad" stackId="a" radius={[4, 4, 0, 0]}>
                {graf.map((g, i) => <Cell key={i} fill={g.Utilidad < 0 ? '#dc2626' : '#16a34a'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-y border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                <th className="px-3.5 py-2 font-semibold">Categoría</th><th className="px-2 py-2 text-right font-semibold">Trabajos</th>
                <th className="px-2 py-2 text-right font-semibold">Vendido</th><th className="px-2 py-2 text-right font-semibold">% de lo vendido</th>
                <th className="px-2 py-2 text-right font-semibold">Costo</th><th className="px-2 py-2 text-right font-semibold">Utilidad</th>
                <th className="px-2 py-2 text-right font-semibold">Margen</th><th className="px-3.5 py-2 text-right font-semibold">Ticket prom.</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(c => (
                <tr key={c.clave} onClick={() => onVerCategoria(c.clave)} className="cursor-pointer border-b border-border/60 hover:bg-muted/30">
                  <td className="px-3.5 py-2 font-semibold text-foreground">{c.etiqueta}{c.enPerdida > 0 && <span className="ml-1.5"><Chip tono="peligro">{c.enPerdida} en pérdida</Chip></span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.n}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(c.ventas)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{pct(total.ventas ? c.ventas / total.ventas * 100 : 0)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{usd(c.costo)}</td>
                  <td className={cn('px-2 py-2 text-right font-bold tabular-nums', c.utilidad < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>{usd(c.utilidad)}</td>
                  <td className={cn('px-2 py-2 text-right font-semibold tabular-nums', tonoMargen(c.margen))}>{pct(c.margen)}</td>
                  <td className="px-3.5 py-2 text-right tabular-nums">{usd(c.ticket)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-bold">
                <td className="px-3.5 py-2">Total trabajos</td><td className="px-2 py-2 text-right tabular-nums">{total.n}</td>
                <td className="px-2 py-2 text-right tabular-nums">{usd(total.ventas)}</td><td />
                <td className="px-2 py-2 text-right tabular-nums">{usd(total.costo)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{usd(total.ventas - total.costo)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(total.ventas ? (total.ventas - total.costo) / total.ventas * 100 : 0)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-border px-3.5 py-2 text-[11.5px] text-muted-foreground">
          Además, {usd(e.costoSinTrabajo?.total || 0)} de costos del período no son de ninguna venta del período ({e.costoSinTrabajo?.n || 0} gastos: retoques de trabajos de antes o piezas sin venta) y {usd(e.gastosTaller.total)} de gastos del taller.
          Trabajos − esos costos − gastos = utilidad del período ({usd(e.utilidad)}).
        </p>
      </Panel>
    </div>
  );
}

function Destacado({ t, c, v, p }: { t: string; c: CategoriaUtilidad; v: string; p: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</p>
      <p className="mt-0.5 truncate text-[14px] font-bold text-foreground">{c.etiqueta}</p>
      <p className="text-[20px] font-black tabular-nums text-foreground">{v}</p>
      <p className="text-[11px] text-muted-foreground">{p}</p>
    </div>
  );
}

export function UtilidadPorTrabajo({ e, categoria, onCategoria }: { e: EstadoResultados; categoria: string; onCategoria: (c: string) => void }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'perdida' | 'sin_costo' | 'bajo'>('todos');
  const [orden, setOrden] = useState<'fecha' | 'utilidad' | 'venta' | 'margen'>('fecha');
  const [abierto, setAbierto] = useState<TrabajoUtilidad | null>(null);
  const qn = q.trim().toLowerCase();
  const lista = useMemo(() => (e.trabajos || []).filter(t =>
    (!categoria || t.categoria === categoria)
    && (filtro === 'todos' || (filtro === 'perdida' && t.utilidad < -0.009) || (filtro === 'sin_costo' && t.costo <= 0.009) || (filtro === 'bajo' && t.margen < 30))
    && (!qn || `${t.cliente} ${t.placa || ''} ${t.vehiculo || ''} ${t.items.map(i => i.descripcion).join(' ')}`.toLowerCase().includes(qn)),
  ).sort((a, b) => orden === 'fecha' ? b.fecha.localeCompare(a.fecha) : orden === 'utilidad' ? a.utilidad - b.utilidad : orden === 'venta' ? b.venta - a.venta : a.margen - b.margen), [e, categoria, filtro, qn, orden]);
  const tot = { venta: lista.reduce((s, t) => s + t.venta, 0), costo: lista.reduce((s, t) => s + t.costo, 0) };

  return (
    <Panel titulo={`Utilidad por trabajo (${lista.length})`} subtitulo="Cada venta del período con lo que costó. Toca un trabajo para ver cliente, vehículo y cada renglón." sinRelleno>
      <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2.5">
        <label className="flex h-8 min-w-[200px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input value={q} onChange={x => setQ(x.target.value)} placeholder="Cliente, placa, vehículo o trabajo…" className="w-full bg-transparent text-[12.5px] outline-none" />
        </label>
        <select value={categoria} onChange={x => onCategoria(x.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]">
          <option value="">Todas las categorías</option>
          {(e.porCategoria || []).map(c => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
        </select>
        <select value={filtro} onChange={x => setFiltro(x.target.value as typeof filtro)} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]">
          <option value="todos">Todos</option><option value="perdida">En pérdida</option><option value="bajo">Margen bajo (&lt; 30%)</option><option value="sin_costo">Sin costo anotado</option>
        </select>
        <select value={orden} onChange={x => setOrden(x.target.value as typeof orden)} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]">
          <option value="fecha">Más recientes</option><option value="utilidad">Menor utilidad</option><option value="venta">Mayor venta</option><option value="margen">Menor margen</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-[12.5px]">
          <thead>
            <tr className="border-y border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
              <th className="px-3.5 py-2 font-semibold">Fecha</th><th className="px-2 py-2 font-semibold">Cliente / vehículo</th><th className="px-2 py-2 font-semibold">Trabajo</th>
              <th className="px-2 py-2 text-right font-semibold">Vendido</th><th className="px-2 py-2 text-right font-semibold">Costo</th>
              <th className="px-2 py-2 text-right font-semibold">Utilidad</th><th className="px-2 py-2 text-right font-semibold">Margen</th><th className="px-3.5 py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, 400).map(t => (
              <tr key={t.ventaId} onClick={() => setAbierto(t)} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/30', t.utilidad < -0.009 && 'bg-red-500/[0.04]')}>
                <td className="px-3.5 py-2 tabular-nums text-muted-foreground">{dmy(t.fecha)}</td>
                <td className="px-2 py-2">
                  <span className="block font-semibold text-foreground">{t.cliente}</span>
                  <span className="block text-[11px] text-muted-foreground">{[t.placa, t.vehiculo].filter(Boolean).join(' · ') || '—'}</span>
                </td>
                <td className="max-w-[260px] px-2 py-2">
                  <span className="block truncate">{t.items.map(i => i.descripcion).join(', ') || '—'}</span>
                  <span className="text-[10.5px] text-muted-foreground">{t.categoriaEtiqueta}{t.costo <= 0.009 ? ' · sin costo anotado' : ` · ${t.costos.length} costo(s)`}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{usd(t.venta)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{t.costo > 0 ? usd(t.costo) : '—'}</td>
                <td className={cn('px-2 py-2 text-right font-bold tabular-nums', t.utilidad < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>{usd(t.utilidad)}</td>
                <td className={cn('px-2 py-2 text-right font-semibold tabular-nums', tonoMargen(t.margen))}>{pct(t.margen)}</td>
                <td className="px-3.5 py-2 text-right text-muted-foreground"><ChevronRight className="inline h-4 w-4" aria-hidden /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/40 font-bold">
              <td className="px-3.5 py-2" colSpan={3}>{lista.length} trabajo(s){lista.length > 400 ? ' (se muestran 400)' : ''}</td>
              <td className="px-2 py-2 text-right tabular-nums">{usd(tot.venta)}</td><td className="px-2 py-2 text-right tabular-nums">{usd(tot.costo)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{usd(tot.venta - tot.costo)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{pct(tot.venta ? (tot.venta - tot.costo) / tot.venta * 100 : 0)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
      {abierto && <DetalleTrabajo t={abierto} onCerrar={() => setAbierto(null)} />}
    </Panel>
  );
}

interface Detalle {
  venta: { id: string; fecha: string; cliente: string; placa: string | null; vehiculo: string | null; color: string | null; base: number; iva: number; saldoPendiente: number; estado: string; servicioId: string | null; ordenEstado: string | null; ordenDescripcion: string | null };
  renglones: Array<{ descripcion: string; cantidad: number; precio: number; costo: number; utilidad: number; margen: number; tipo: string; costoDe: string; sinCosto: boolean; costos: Array<{ id: string; descripcion: string; usd: number; proveedor: string | null; repetido: boolean }> }>;
  otrosCostos: Array<{ id: string; descripcion: string; usd: number; proveedor: string | null; repetido: boolean; fecha: string }>;
  nomina: Array<{ empleado: string; descripcion: string; manoObra: number; comision: number; estado: string; override: boolean }>;
  cobros: Array<{ fecha: string; monto: number; metodo: string | null; nota: string | null }>;
  totales: { venta: number; costo: number; utilidad: number; margen: number; comisiones: number; despuesDeManoDeObra: number; costoAlmacenSinGasto: number };
  avisos: string[];
}

function DetalleTrabajo({ t, onCerrar }: { t: TrabajoUtilidad; onCerrar: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/reportes/utilidad-trabajo?venta=${t.ventaId}&costos=${t.costos.map(c => c.id).join(',')}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'No se pudo cargar'); if (vivo) setD(j); })
      .catch(x => vivo && setError(x.message));
    return () => { vivo = false; };
  }, [t]);

  return (
    <ModalBase abierto onCerrar={onCerrar} ancho="xl" titulo={`${t.cliente}${t.placa ? ` · ${t.placa}` : ''}`}
      subtitulo={`${t.vehiculo || 'Vehículo'} · ${t.fecha.split('-').reverse().join('/')} · ${t.categoriaEtiqueta}`} icono={<Car className="h-5 w-5" aria-hidden />}>
      {!d && !error && <p className="flex items-center gap-2 py-8 text-[13px] text-[#5b616e]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Armando el detalle…</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      {d && (
        <div className="space-y-4 text-[#16181d]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra t="Vendido (sin IVA)" v={usd(d.totales.venta)} p={d.venta.iva > 0 ? `+ IVA ${usd(d.venta.iva)}` : 'sin IVA'} />
            <Cifra t="Costo (piezas e insumos)" v={usd(d.totales.costo)} p={`${d.renglones.reduce((s, r) => s + r.costos.length, 0) + d.otrosCostos.length} gasto(s)`} tono="text-amber-700" />
            <Cifra t="Utilidad" v={usd(d.totales.utilidad)} p={`${pct(d.totales.margen)} de margen`} tono={d.totales.utilidad < 0 ? 'text-red-600' : 'text-emerald-700'} />
            <Cifra t="Después de mano de obra" v={usd(d.totales.despuesDeManoDeObra)} p={`comisiones ${usd(d.totales.comisiones)}`} tono={d.totales.despuesDeManoDeObra < 0 ? 'text-red-600' : 'text-emerald-700'} />
          </div>

          {d.avisos.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
              {d.avisos.map(a => <li key={a} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{a}</li>)}
            </ul>
          )}

          <div className="overflow-x-auto rounded-xl border border-[#e2e5ea]">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="bg-[#f7f8fa] text-left text-[11px] text-[#5b616e]">
                  <th className="px-3 py-2 font-semibold">Renglón</th><th className="px-2 py-2 text-right font-semibold">Cant.</th>
                  <th className="px-2 py-2 text-right font-semibold">Precio</th><th className="px-2 py-2 text-right font-semibold">Costo</th>
                  <th className="px-2 py-2 text-right font-semibold">Utilidad</th><th className="px-3 py-2 text-right font-semibold">Margen</th>
                </tr>
              </thead>
              <tbody>
                {d.renglones.map((r, i) => (
                  <tr key={i} className="border-t border-[#eef0f3] align-top">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5 font-medium">{r.tipo === 'mano_obra' && <Wrench className="h-3.5 w-3.5 text-[#5b616e]" aria-hidden />}{r.descripcion}</span>
                      {r.costos.map(c => <span key={c.id} className={cn('block text-[10.5px]', c.repetido ? 'font-semibold text-red-600' : 'text-[#5b616e]')}>↳ {c.descripcion} {usd(c.usd)}{c.proveedor ? ` · ${c.proveedor}` : ''}{c.repetido ? ' · ¿repetido?' : ''}</span>)}
                      {r.costoDe.startsWith('costo del almacén') && <span className="block text-[10.5px] text-amber-700">↳ costo del almacén, no está como gasto</span>}
                      {r.sinCosto && <span className="block text-[10.5px] text-amber-700">↳ sin costo anotado</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.cantidad}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{usd(r.precio)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-700">{r.costo > 0 ? usd(r.costo) : '—'}</td>
                    <td className={cn('px-2 py-2 text-right font-bold tabular-nums', r.utilidad < 0 ? 'text-red-600' : 'text-emerald-700')}>{usd(r.utilidad)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', tonoMargen(r.margen))}>{pct(r.margen)}</td>
                  </tr>
                ))}
                {d.otrosCostos.map(c => (
                  <tr key={c.id} className="border-t border-[#eef0f3] bg-[#fffbf2]">
                    <td className="px-3 py-2"><span className={cn('font-medium', c.repetido && 'text-red-600')}>{c.descripcion}{c.repetido ? ' · ¿repetido?' : ''}</span><span className="block text-[10.5px] text-[#5b616e]">costo del trabajo sin renglón en la orden{c.proveedor ? ` · ${c.proveedor}` : ''} · {c.fecha.split('-').reverse().join('/')}</span></td>
                    <td /><td className="px-2 py-2 text-right text-[#9ba1ab]">—</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-700">{usd(c.usd)}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-red-600">{usd(-c.usd)}</td><td />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#e2e5ea] bg-[#f7f8fa] font-bold">
                  <td className="px-3 py-2" colSpan={2}>Total del trabajo</td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(d.totales.venta)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(d.totales.costo)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(d.totales.utilidad)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(d.totales.margen)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#e2e5ea] p-3">
              <p className="mb-1.5 text-[12px] font-bold">Mano de obra (mecánicos)</p>
              {d.nomina.length === 0 ? <p className="text-[12px] text-[#5b616e]">Sin trabajos de nómina registrados para esta orden.</p> : (
                <ul className="space-y-0.5 text-[12px]">{d.nomina.map((j, i) => <li key={i} className="flex justify-between gap-2"><span>{j.empleado}{j.override ? ' (supervisión)' : ''} · <span className="text-[#5b616e]">{j.descripcion || 'trabajo'}</span></span><span className="tabular-nums">{usd(j.comision)} <span className="text-[10.5px] text-[#5b616e]">{j.estado}</span></span></li>)}</ul>
              )}
            </div>
            <div className="rounded-xl border border-[#e2e5ea] p-3">
              <p className="mb-1.5 text-[12px] font-bold">Cobros</p>
              <p className="text-[12px] text-[#5b616e]">{d.venta.saldoPendiente > 0.009 ? `Debe ${usd(d.venta.saldoPendiente)}` : 'Pagado completo'}{d.venta.ordenEstado ? ` · orden ${d.venta.ordenEstado}` : ''}</p>
              {d.cobros.length > 0 && <ul className="mt-1 space-y-0.5 text-[12px]">{d.cobros.map((c, i) => <li key={i} className="flex justify-between"><span>{c.fecha.split('-').reverse().join('/')} · {c.metodo || 'cobro'}</span><span className="tabular-nums">{usd(c.monto)}</span></li>)}</ul>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px]">
            {t.placa && <Link href={`/dashboard/ficha?placa=${encodeURIComponent(t.placa)}`} className="rounded-lg border border-[#e2e5ea] px-3 py-1.5 font-semibold hover:bg-[#f7f8fa]">Abrir la ficha del vehículo</Link>}
            <Link href={`/dashboard/reportes?venta=${t.ventaId}`} className="rounded-lg border border-[#e2e5ea] px-3 py-1.5 font-semibold hover:bg-[#f7f8fa]">Ver la venta</Link>
            {d.venta.servicioId && <Link href={`/dashboard/servicios?orden=${d.venta.servicioId}`} className="rounded-lg border border-[#e2e5ea] px-3 py-1.5 font-semibold hover:bg-[#f7f8fa]">Ver la orden</Link>}
          </div>
        </div>
      )}
    </ModalBase>
  );
}

function Cifra({ t, v, p, tono }: { t: string; v: string; p: string; tono?: string }) {
  return (
    <div className="rounded-xl border border-[#e2e5ea] p-2.5">
      <p className="text-[11px] text-[#5b616e]">{t}</p>
      <p className={cn('text-[18px] font-black tabular-nums', tono)}>{v}</p>
      <p className="text-[10.5px] text-[#5b616e]">{p}</p>
    </div>
  );
}
