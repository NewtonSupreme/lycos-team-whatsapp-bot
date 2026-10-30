'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleHelp, IdCard, Link2, Loader2, Sparkles, Upload, Wallet, X } from 'lucide-react';
import { Chip, Panel, Pestanas } from '@/components/panel/Piezas';
import { cn } from '@/lib/utils';
import type { EstadoGrupo, GrupoCashea, PreviaCashea, ResultadoDescuento, VentaCandidata } from '@/lib/cashea/descontar';

/**
 * Descontar las cuotas de Cashea a cada cliente, desde el mismo reporte que se
 * subió para conciliar.
 *
 * Cada orden del reporte tiene que saber de qué venta es. Las que ya se sabe
 * (por la factura anotada o porque se enlazaron antes) se descuentan solas;
 * las que cuadran con una sola venta llegan marcadas para confirmar; las demás
 * se eligen a mano. Nada se descuenta hasta pulsar el botón, y una cuota ya
 * descontada no se vuelve a descontar aunque se suba el reporte otra vez.
 */

const num = (x: number) => (Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (x: number) => `$${num(x)}`;
const fecha = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const corta = (iso: string) => fecha(iso).slice(0, 5);

const ESTADO: Record<EstadoGrupo, { texto: string; tono: 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro' }> = {
  enlazada: { texto: 'Enlazada', tono: 'exito' },
  sugerida: { texto: 'Cuadra con una venta', tono: 'info' },
  ambigua: { texto: 'Varias posibles', tono: 'aviso' },
  sin_venta: { texto: 'Sin venta que cuadre', tono: 'peligro' },
  solo_inicial: { texto: 'Inicial', tono: 'neutro' },
};

type Vista = 'resolver' | 'listas' | 'todas';

export default function DescontarCuotasCashea({ archivo, sede }: { archivo: File; sede?: string | null }) {
  const [previa, setPrevia] = useState<PreviaCashea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [elecciones, setElecciones] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoDescuento | null>(null);
  const [vista, setVista] = useState<Vista>('resolver');
  const [subiendoOrdenes, setSubiendoOrdenes] = useState(false);
  const [avisoOrdenes, setAvisoOrdenes] = useState<string | null>(null);

  const pedir = useCallback(async (accion: 'previa' | 'aplicar', eleg?: Record<string, string>) => {
    const fd = new FormData();
    fd.set('accion', accion);
    fd.set('archivo', archivo);
    if (sede) fd.set('sede', sede);
    if (eleg) fd.set('elecciones', JSON.stringify(eleg));
    const r = await fetch('/api/finanzas/cashea-cuotas', { method: 'POST', body: fd });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || 'No se pudo leer el reporte.');
    return j;
  }, [archivo, sede]);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const p = await pedir('previa') as PreviaCashea;
      setPrevia(p);
      // Las que cuadran con una sola venta llegan marcadas; se pueden desmarcar.
      setElecciones(Object.fromEntries(p.grupos.filter(g => g.estado === 'sugerida' && g.venta).map(g => [g.clave, g.venta!.id])));
      setVista(p.resumen.porResolver ? 'resolver' : 'listas');
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [pedir]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Lo que se va a descontar con las elecciones de ahora.
  const plan = useMemo(() => {
    const grupos = (previa?.grupos || []).filter(g => g.estado !== 'solo_inicial' && g.nuevos > 0
      && (g.estado === 'enlazada' || !!elecciones[g.clave]));
    return { grupos, cuotas: grupos.reduce((a, g) => a + g.nuevos, 0), usd: grupos.reduce((a, g) => a + g.nuevosUSD, 0) };
  }, [previa, elecciones]);

  // Otro reporte de Cashea (órdenes con cédula, cliente, teléfono…): enseña de quién es cada orden.
  const subirOrdenes = async (f: File | null) => {
    if (!f) return;
    setSubiendoOrdenes(true); setAvisoOrdenes(null); setError(null);
    try {
      const fd = new FormData(); fd.set('accion', 'ordenes'); fd.set('archivo', f); if (sede) fd.set('sede', sede);
      const r = await fetch('/api/finanzas/cashea-cuotas', { method: 'POST', body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'No se pudo leer ese reporte.');
      const o = j.ordenes;
      setAvisoOrdenes(`Leí ${o.leidas} orden(es) (${o.nuevas} nuevas, ${o.actualizadas} completadas) con: ${(o.columnas as string[]).filter(c => c !== 'orden').join(', ')}. Ya se usan para reconocer las órdenes.`);
      await cargar();
    } catch (e) { setError((e as Error).message); } finally { setSubiendoOrdenes(false); }
  };

  const aplicar = async () => {
    if (!plan.cuotas) return;
    if (!confirm(`Se van a descontar ${plan.cuotas} cuota(s), ${usd(plan.usd)}, a ${plan.grupos.length} venta(s). Cada una queda como cobro por Cashea / BNC el día en que se pagó. ¿Seguir?`)) return;
    setAplicando(true); setError(null);
    try {
      setResultado(await pedir('aplicar', elecciones) as ResultadoDescuento);
      await cargar();
    } catch (e) { setError((e as Error).message); } finally { setAplicando(false); }
  };

  if (cargando && !previa) {
    return (
      <Panel titulo="Descontar las cuotas a cada cliente">
        <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando de qué venta es cada orden…</p>
      </Panel>
    );
  }
  if (!previa) return error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12.5px] text-red-700 dark:text-red-300">{error}</p> : null;

  const r = previa.resumen;
  const deCuota = previa.grupos.filter(g => g.estado !== 'solo_inicial');
  const iniciales = previa.grupos.filter(g => g.estado === 'solo_inicial');
  const porResolver = deCuota.filter(g => g.estado === 'ambigua' || g.estado === 'sin_venta');
  const listas = deCuota.filter(g => g.estado === 'enlazada' || g.estado === 'sugerida');
  const filas = vista === 'resolver' ? porResolver : vista === 'listas' ? listas : deCuota;

  return (
    <Panel
      titulo="Descontar las cuotas a cada cliente"
      subtitulo={`Reporte del ${fecha(previa.desde)} al ${fecha(previa.hasta)} · ${r.pagos} pagos · ${r.yaAplicados} ya descontados antes`}
      sinRelleno
    >
      <div className="space-y-3 px-3.5 pb-3.5">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Cada cuota que pagó un cliente baja lo que debe por Cashea, con el día en que la pagó. Para que no se equivoque, cada orden de Cashea tiene que saber
          de qué venta es: las que tienen la <b className="text-foreground">factura anotada</b> o ya se enlazaron, van solas; las demás se confirman aquí una vez y quedan enlazadas.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dato icono={<Wallet className="h-4 w-4" aria-hidden />} etiqueta="Por descontar ahora" valor={usd(plan.usd)} pie={`${plan.cuotas} cuota(s) en ${plan.grupos.length} venta(s)`} tinte="bg-violet-500/12 text-violet-600 dark:text-violet-400" />
          <Dato icono={<Link2 className="h-4 w-4" aria-hidden />} etiqueta="Órdenes enlazadas" valor={String(r.enlazadas)} pie="Se descuentan solas" tinte="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" />
          <Dato icono={<Sparkles className="h-4 w-4" aria-hidden />} etiqueta="Cuadran con una venta" valor={String(r.sugeridas)} pie="Revisa y confirma" tinte="bg-sky-500/12 text-sky-600 dark:text-sky-400" />
          <Dato icono={<CircleHelp className="h-4 w-4" aria-hidden />} etiqueta="Por resolver" valor={String(r.porResolver)} pie="Elige la venta a mano" tinte="bg-amber-500/12 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-[11.5px] text-muted-foreground">
          <IdCard className="h-4 w-4 text-violet-600" aria-hidden />
          <span className="min-w-0 flex-1">
            Para que reconozca a cada cliente sin dudas, sube también cualquier reporte de Cashea que traiga <b className="text-foreground">cédula, nombre o teléfono</b> por orden.
            {previa.fichas ? <> Ya conoce <b className="text-foreground">{previa.fichas}</b> orden(es).</> : null}
          </span>
          <label className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 font-semibold text-foreground hover:bg-muted', subiendoOrdenes && 'opacity-60')}>
            {subiendoOrdenes ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
            Subir reporte de órdenes
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={subiendoOrdenes} onChange={e => { void subirOrdenes(e.target.files?.[0] || null); e.target.value = ''; }} />
          </label>
        </div>
        {avisoOrdenes && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-300">{avisoOrdenes}</p>}

        {resultado && <Resultado r={resultado} onCerrar={() => setResultado(null)} />}
        {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">{error}</p>}

        <Pestanas<Vista> valor={vista} onCambio={setVista} opciones={[
          { valor: 'resolver', label: `Por resolver · ${porResolver.length}` },
          { valor: 'listas', label: `Listas · ${listas.length}` },
          { valor: 'todas', label: `Todas · ${deCuota.length}` },
        ]} />
      </div>

      {filas.length === 0 ? (
        <p className="px-4 pb-6 pt-2 text-center text-[12.5px] text-muted-foreground">
          {vista === 'resolver' ? 'Nada por resolver: todas las órdenes saben de qué venta son.' : 'No hay órdenes aquí.'}
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[860px] text-[12px]">
            <thead>
              <tr className="bg-muted/40 text-left text-[11px] text-muted-foreground">
                <th className="px-3.5 py-2 font-medium">Orden de Cashea</th>
                <th className="px-2 py-2 font-medium">Pagos del reporte</th>
                <th className="px-2 py-2 font-medium">Venta del sistema</th>
                <th className="px-3.5 py-2 text-right font-medium">Se descuenta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(g => (
                <Fila key={g.clave} g={g} eleccion={elecciones[g.clave] || ''}
                  onElegir={id => setElecciones(e => { const n = { ...e }; if (id) n[g.clave] = id; else delete n[g.clave]; return n; })} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {iniciales.length > 0 && (
        <p className="border-t border-border px-3.5 py-2 text-[11.5px] text-muted-foreground">
          {iniciales.length} pago(s) de <b>inicial</b> ({iniciales.map(g => `orden ${g.orden}`).join(', ')}): no se descuentan, porque la inicial entró el día de la venta.
        </p>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-border bg-card px-3.5 py-3">
        <span className="text-[12px] text-muted-foreground">
          {plan.cuotas
            ? <>Se descuentan <b className="text-foreground">{plan.cuotas} cuota(s)</b>, <b className="num text-foreground">{usd(plan.usd)}</b>, a {plan.grupos.length} venta(s).</>
            : r.nuevos ? 'Elige de qué venta es cada orden para poder descontar.' : 'Todas las cuotas de este reporte ya están descontadas.'}
        </span>
        <button type="button" onClick={aplicar} disabled={!plan.cuotas || aplicando}
          className="ml-auto flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-[13px] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
          {aplicando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Descontar {plan.cuotas ? usd(plan.usd) : ''}
        </button>
      </div>
    </Panel>
  );
}

function Dato({ icono, etiqueta, valor, pie, tinte }: { icono: React.ReactNode; etiqueta: string; valor: string; pie: string; tinte: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', tinte)}>{icono}</span>
        <span className="text-[11px] text-muted-foreground">{etiqueta}</span>
      </div>
      <p className="num mt-1 text-[18px] font-black leading-tight text-foreground">{valor}</p>
      <p className="text-[10.5px] text-muted-foreground">{pie}</p>
    </div>
  );
}

function textoVenta(v: VentaCandidata) {
  const deuda = v.plan ? (v.falta > 0.009 ? `debe ${usd(v.falta)}` : 'sin deuda') : 'no es Cashea';
  return `${v.puntaje ? `[${v.puntaje}] ` : ''}${v.cliente} · ${fecha(v.fecha)}${v.placa ? ` · ${v.placa}` : ''} · total ${usd(v.total)} · ${deuda}`;
}

/** Por qué se propone esa venta, y lo que hay que revisar en ella. */
function PorQue({ v }: { v: VentaCandidata }) {
  return (
    <div className="mt-1 space-y-0.5">
      {v.razones.length > 0 && <p className="text-[11px] text-muted-foreground"><Sparkles className="mr-1 inline h-3 w-3 text-sky-600" aria-hidden />{v.razones.join(' · ')}</p>}
      {v.aviso && <p className="flex items-start gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{v.aviso}</p>}
    </div>
  );
}

function Fila({ g, eleccion, onElegir }: { g: GrupoCashea; eleccion: string; onElegir: (id: string) => void }) {
  const e = ESTADO[g.estado];
  const fijo = g.estado === 'enlazada';
  const opciones = [...(g.venta && !fijo ? [g.venta] : []), ...g.candidatas.filter(c => c.id !== g.venta?.id)];
  const elegida = fijo ? g.venta : [...opciones, ...g.otras].find(v => v.id === eleccion) || null;
  // Lo que pagó ya, contra lo que la venta todavía debe por Cashea.
  const pasa = elegida && g.nuevosUSD > elegida.falta + 0.05;

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3.5 py-2.5">
        <p className="num font-semibold text-foreground">{g.orden}</p>
        <p className="num text-[11px] text-muted-foreground">Factura {g.factura || '—'} · cuota {usd(g.cuotaUSD)}</p>
        {g.estimado?.fecha && (
          <p className="num text-[10.5px] text-muted-foreground" title={g.estimado.razones.join(' · ')}>
            Compra ≈ {fecha(g.estimado.fecha)}{g.estimado.margen > 1 ? ` ±${g.estimado.margen} d` : ''}
          </p>
        )}
        <span className="mt-1 inline-block"><Chip tono={e.tono}>{e.texto}</Chip></span>
      </td>
      <td className="px-2 py-2.5">
        <ul className="flex flex-wrap gap-1">
          {g.pagos.map(p => (
            <li key={p.ref} title={`Ref ${p.ref} · Bs ${num(p.ves)}`}
              className={cn('num rounded-md border px-1.5 py-0.5 text-[11px]',
                p.aplicado ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-border bg-muted/40')}>
              {p.cuotas.length > 1 ? `C${p.cuotas.join('+')}` : p.cuotas[0] === 0 ? 'Ini' : `C${p.cuotas[0]}`} · {corta(p.fecha)} · {usd(p.usd)}{p.aplicado ? ' ✓' : ''}
            </li>
          ))}
        </ul>
      </td>
      <td className="px-2 py-2.5">
        {fijo && g.venta ? (
          <p className="text-[12px]"><b className="text-foreground">{g.venta.cliente}</b> <span className="text-muted-foreground">· {fecha(g.venta.fecha)}{g.venta.placa ? ` · ${g.venta.placa}` : ''} · debe {usd(g.venta.falta)}</span></p>
        ) : (
          <select value={eleccion} onChange={ev => onElegir(ev.target.value)}
            className={cn('h-8 w-full max-w-[420px] rounded-lg border bg-background px-2 text-[12px]',
              eleccion ? 'border-violet-500/50' : g.estado === 'sugerida' ? 'border-border' : 'border-amber-500/50')}>
            <option value="">{g.estado === 'sugerida' ? 'No descontar (no es esta)' : '— ¿De qué venta es? —'}</option>
            {opciones.length > 0 && (
              <optgroup label="Cuadran (de mejor a peor)">
                {opciones.map(v => <option key={v.id} value={v.id}>{textoVenta(v)}</option>)}
              </optgroup>
            )}
            {g.otras.length > 0 && (
              <optgroup label="Otras ventas de esas fechas (cualquier forma de pago)">
                {g.otras.map(v => <option key={v.id} value={v.id}>{textoVenta(v)}</option>)}
              </optgroup>
            )}
          </select>
        )}
        {fijo && g.venta && <PorQue v={g.venta} />}
        {!fijo && elegida && <PorQue v={elegida} />}
        {g.estado === 'ambigua' && !eleccion && opciones.length > 1 && (
          <p className="mt-1 text-[11px] text-muted-foreground">Varias cuadran casi igual ({opciones.slice(0, 3).map(o => `${o.cliente.split(' ')[0]} ${corta(o.fecha)}`).join(', ')}). La cédula de un reporte de órdenes de Cashea lo resuelve sola.</p>
        )}
        {g.estado === 'sin_venta' && !eleccion && (
          <p className="mt-1 text-[11px] text-muted-foreground">Ninguna venta cuadra por monto{g.estimado?.fecha ? ` cerca del ${fecha(g.estimado.fecha)}` : ''}: puede que no se registrara o que se registrara con otro total. Las de esas fechas están en la lista.</p>
        )}
        {pasa && (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Paga {usd(g.nuevosUSD)} y esa venta debe {usd(elegida!.falta)}: lo que pase no se descuenta.
          </p>
        )}
      </td>
      <td className="num px-3.5 py-2.5 text-right">
        {g.nuevos ? (
          <>
            <p className={cn('text-[13px] font-extrabold', (fijo || eleccion) ? 'text-violet-700 dark:text-violet-400' : 'text-muted-foreground')}>{usd(g.nuevosUSD)}</p>
            <p className="text-[10.5px] text-muted-foreground">{g.nuevos} cuota(s) nueva(s)</p>
          </>
        ) : <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Ya descontado</p>}
      </td>
    </tr>
  );
}

function Resultado({ r, onCerrar }: { r: ResultadoDescuento; onCerrar: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-foreground">
            {r.aplicados.length} cuota(s) descontada(s), {usd(r.totalUSD)}{r.enlazadas ? ` · ${r.enlazadas} orden(es) quedaron enlazadas` : ''}
          </p>
          {r.aplicados.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-muted-foreground">
              {r.aplicados.slice(0, 12).map(a => (
                <li key={a.ref} className="num">{a.cliente}: {a.cuotas} del {corta(a.fecha)}, {usd(a.usd)} → {a.quedaDebiendo > 0.009 ? `queda debiendo ${usd(a.quedaDebiendo)}` : 'quedó saldada'}</li>
              ))}
              {r.aplicados.length > 12 && <li>… y {r.aplicados.length - 12} más.</li>}
            </ul>
          )}
          {r.rechazados.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11.5px] text-amber-700 dark:text-amber-400">
              {r.rechazados.map(x => <li key={x.ref} className="num">No se descontó {usd(x.usd)} de {x.cliente} (ref {x.ref}): {x.motivo}</li>)}
            </ul>
          )}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden /></button>
      </div>
    </div>
  );
}
