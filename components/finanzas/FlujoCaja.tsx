'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronRight, Download, History, Loader2, Plus, RefreshCw, Scale, ShieldCheck, SlidersHorizontal, Wallet } from 'lucide-react';
import { Chip, Panel } from '@/components/panel/Piezas';
import ModalTraspasoConciliacion from '@/components/finanzas/ModalTraspasoConciliacion';
import { ModalAnular, ModalArqueo, ModalMovimiento, ModalSaldoInicial, type CuentaVista } from '@/components/finanzas/ModalesFlujoCaja';
import { cn } from '@/lib/utils';
import { avisarCambio, useRefrescarAlCambiar } from '@/lib/use-refrescar';
import type { FlujoCuenta, ArqueoCaja, MovimientoFlujo } from '@/lib/caja/flujo';

/**
 * Flujo de caja: cada cuenta (Binance, Zelle, efectivo, bancos) con su saldo inicial y, día por día,
 * lo que entró y lo que salió. El saldo nunca se escribe a mano: se calcula, y se puede verificar
 * contra el saldo real (la app de Binance, el banco, el conteo de la caja).
 */

interface ResumenCuenta extends CuentaVista { tipo: string; bin: string | null; configurada: boolean }
interface Respuesta {
  desde: string; hasta: string;
  cuentas: ResumenCuenta[];
  flujo: FlujoCuenta | null;
  historial: Array<{ id: string; created_at: string; saldo_anterior: number | null; saldo_nuevo: number; desde_anterior: string | null; desde_nuevo: string; motivo: string | null; usuario: string | null }>;
  arqueos: Array<ArqueoCaja & { cuenta_id: string }>;
  estadoBanco: { banco: string; archivo: string | null; desde: string; hasta: string; saldoInicialBanco: number | null; saldoFinalBanco: number; saldoSistema: number; diferencia: number; conciliada: string } | null;
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const mas = (f: string, k: number) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const dmy = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const num = (x: number) => x.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (x: number, m: string) => `${x < 0 ? '-' : ''}${m === 'USD' ? '$' : m === 'EUR' ? '€' : 'Bs '}${num(Math.abs(x))}`;
const GRUPOS: Array<[string, string[]]> = [['Digitales', ['digital']], ['Efectivo', ['efectivo', 'caja_chica']], ['Bancos', ['banco']]];

export default function FlujoCaja({ sede }: { sede?: string | null }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [desde, setDesde] = useState(() => mas(hoy(), -30));
  const [hasta, setHasta] = useState(hoy);
  const [soloMov, setSoloMov] = useState(true);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [verHistorial, setVerHistorial] = useState(false);
  const [modal, setModal] = useState<null | 'saldo' | 'movimiento' | 'arqueo' | 'traspaso'>(null);
  const [anular, setAnular] = useState<{ id: string; concepto: string; monto: number } | null>(null);
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (cuentaId) p.set('cuenta', cuentaId);
      if (sede) p.set('sede', sede);
      const r = await fetch(`/api/finanzas/flujo-caja?${p}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'No se pudo cargar el flujo de caja.');
      setDatos(j as Respuesta);
      if (!cuentaId && j.cuentas?.length) {
        // Se abre por Binance o Zelle: son las que no tienen estado de cuenta que subir.
        const pref = (j.cuentas as ResumenCuenta[]).find(c => c.bin === 'binance') || (j.cuentas as ResumenCuenta[]).find(c => c.bin === 'zelle') || j.cuentas[0];
        setCuentaId(pref.id);
      }
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [desde, hasta, cuentaId, sede]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRefrescarAlCambiar(cargar);

  const cuenta = useMemo(() => datos?.cuentas.find(c => c.id === cuentaId) || null, [datos, cuentaId]);
  const flujo = datos?.flujo && datos.flujo.cuenta.id === cuentaId ? datos.flujo : null;
  const m = cuenta?.moneda || 'USD';
  const dias = useMemo(() => (flujo ? flujo.dias.filter(d => !soloMov || d.movimientos.length || d.arqueo) : []).slice().reverse(), [flujo, soloMov]);
  const listo = () => { avisarCambio(); void cargar(); };

  const descargarPdf = async () => {
    if (!flujo || !datos) return;
    setGenerando(true);
    try {
      const { generarFlujoCajaPDF } = await import('@/lib/flujo-caja-pdf');
      generarFlujoCajaPDF({ flujo, arqueos: datos.arqueos, estadoBanco: datos.estadoBanco, generadoPor: '' });
    } finally { setGenerando(false); }
  };

  const rango = (tipo: '7' | 'mes' | 'todo') => {
    const h = hoy();
    setHasta(h);
    setDesde(tipo === '7' ? mas(h, -6) : tipo === 'mes' ? `${h.slice(0, 8)}01` : (cuenta?.desde || mas(h, -90)));
  };

  if (cargando && !datos) return <p className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando el flujo de caja…</p>;
  if (error && !datos) return <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12.5px] text-red-600">{error}</p>;
  if (!datos) return null;

  const sinConfigurar = datos.cuentas.filter(c => !c.configurada && ['digital', 'efectivo', 'banco'].includes(c.tipo));

  return (
    <div className="space-y-4">
      {/* Cuentas */}
      <Panel titulo="Flujo de caja" subtitulo="El saldo de cada cuenta, día por día: saldo inicial + lo que entra − lo que sale"
        accion={<button type="button" onClick={cargar} disabled={cargando} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-semibold hover:border-primary"><RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} aria-hidden /> Actualizar</button>}>
        <div className="space-y-3">
          {GRUPOS.map(([titulo, tipos]) => {
            const lista = datos.cuentas.filter(c => tipos.includes(c.tipo) && c.bin !== 'cashea');
            if (!lista.length) return null;
            return (
              <div key={titulo}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                  {lista.map(c => (
                    <button key={c.id} type="button" onClick={() => setCuentaId(c.id)} aria-pressed={c.id === cuentaId}
                      className={cn('rounded-xl border p-2.5 text-left transition-colors', c.id === cuentaId ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50')}>
                      <span className="flex items-center gap-1.5 text-[12px] font-bold text-foreground"><Wallet className="h-3.5 w-3.5 text-primary" aria-hidden /> {c.nombre}</span>
                      <span className={cn('mt-1 block text-[15px] font-black tabular-nums', c.saldo < 0 ? 'text-red-600' : 'text-foreground')}>{money(c.saldo, c.moneda)}</span>
                      <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{c.configurada ? `Desde ${dmy(c.desde)}` : 'Sin saldo inicial'}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {sinConfigurar.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-400/15 px-2.5 py-2 text-[11.5px] text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {sinConfigurar.length} cuenta(s) sin saldo inicial ({sinConfigurar.map(c => c.nombre).join(', ')}): su saldo es solo el movimiento registrado, no el dinero real. Elige la cuenta y pulsa «Saldo inicial».
            </p>
          )}
        </div>
      </Panel>

      {cuenta && (
        <>
          {/* Cabecera de la cuenta */}
          <Panel titulo={cuenta.nombre} subtitulo={cuenta.configurada ? `Saldo inicial ${money(cuenta.saldoInicial, m)} desde el ${dmy(cuenta.desde)}` : 'Sin saldo inicial configurado'}
            accion={<Chip tono={m === 'USD' ? 'info' : 'neutro'}>{m === 'USD' ? 'Dólares' : m === 'EUR' ? 'Euros' : 'Bolívares'}</Chip>}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setModal('saldo')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-[12.5px] font-bold hover:border-primary"><SlidersHorizontal className="h-4 w-4" aria-hidden /> Saldo inicial</button>
              <button type="button" onClick={() => setModal('movimiento')} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12.5px] font-bold text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" aria-hidden /> Registrar movimiento</button>
              <button type="button" onClick={() => setModal('traspaso')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-[12.5px] font-bold hover:border-primary"><ArrowLeftRight className="h-4 w-4" aria-hidden /> Traspaso</button>
              <button type="button" onClick={() => setModal('arqueo')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-[12.5px] font-bold hover:border-primary"><Scale className="h-4 w-4" aria-hidden /> Verificar saldo</button>
              <button type="button" onClick={descargarPdf} disabled={!flujo || generando} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-3 text-[12.5px] font-bold text-background hover:opacity-90 disabled:opacity-50">
                {generando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} PDF
              </button>
            </div>

            {!cuenta.configurada && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-400/15 px-2.5 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Pon el saldo con el que arrancó esta cuenta (lo que había el primer día que quieras llevar). Sin él, el saldo de abajo es solo lo que se movió desde el {dmy(cuenta.desde)}.
              </p>
            )}

            {datos.estadoBanco && (
              <div className={cn('mt-3 rounded-xl border p-2.5 text-[12px]', Math.abs(datos.estadoBanco.diferencia) < 0.01 ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-red-500/40 bg-red-500/[0.07]')}>
                <p className="flex items-center gap-1.5 font-bold text-foreground"><ShieldCheck className="h-4 w-4" aria-hidden /> Estado de cuenta ({datos.estadoBanco.banco}, al {dmy(datos.estadoBanco.hasta)})</p>
                <p className="mt-0.5 text-foreground/85">
                  El banco dice <strong>{money(datos.estadoBanco.saldoFinalBanco, m)}</strong> · el sistema <strong>{money(datos.estadoBanco.saldoSistema, m)}</strong> ·{' '}
                  {Math.abs(datos.estadoBanco.diferencia) < 0.01 ? <span className="font-bold text-emerald-700">cuadra</span> : <span className="font-bold text-red-600">diferencia {money(datos.estadoBanco.diferencia, m)}</span>}
                </p>
                {Math.abs(datos.estadoBanco.diferencia) >= 0.01 && !cuenta.configurada && <p className="mt-0.5 text-muted-foreground">Lo más probable: falta el saldo inicial. Úsalo desde «Saldo inicial → usar el del estado de cuenta».</p>}
              </div>
            )}
          </Panel>

          {/* Cifras del período */}
          {flujo && (
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
              {[
                { t: 'Saldo inicial del período', v: money(flujo.saldoInicialRango, m), c: 'text-foreground' },
                { t: 'Entradas', v: `+${money(flujo.entradas, m)}`, c: 'text-emerald-600' },
                { t: 'Salidas', v: `-${money(flujo.salidas, m)}`, c: 'text-red-600' },
                { t: 'Movimiento neto', v: money(flujo.entradas - flujo.salidas, m), c: flujo.entradas - flujo.salidas < 0 ? 'text-red-600' : 'text-foreground' },
                { t: 'Saldo final', v: money(flujo.saldoFinal, m), c: flujo.saldoFinal < 0 ? 'text-red-600' : 'text-primary' },
              ].map(k => (
                <div key={k.t} className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">{k.t}</p>
                  <p className={cn('mt-1 text-[17px] font-black tabular-nums', k.c)}>{k.v}</p>
                </div>
              ))}
            </div>
          )}
          {flujo?.avisos.map(a => <p key={a} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-600">{a}</p>)}

          {/* Día por día */}
          <Panel titulo="Día por día" subtitulo={flujo ? `Del ${dmy(flujo.desde)} al ${dmy(flujo.hasta)}` : ''} sinRelleno>
            <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2">
              <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]" aria-label="Desde" />
              <span className="text-[12px] text-muted-foreground">a</span>
              <input type="date" value={hasta} min={desde} max={hoy()} onChange={e => setHasta(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[12px]" aria-label="Hasta" />
              {([['7', '7 días'], ['mes', 'Este mes'], ['todo', 'Desde el inicio']] as const).map(([k, t]) => (
                <button key={k} type="button" onClick={() => rango(k)} className="h-8 rounded-lg border border-border px-2.5 text-[12px] font-semibold hover:border-primary">{t}</button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground"><input type="checkbox" checked={soloMov} onChange={e => setSoloMov(e.target.checked)} /> Solo días con movimiento</label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead><tr className="border-y border-border bg-muted/40 text-left text-[10.5px] uppercase text-muted-foreground">
                  <th className="w-8 py-2 pl-3.5" /><th className="py-2 pr-3">Fecha</th><th className="pr-3 text-right">Saldo inicial</th><th className="pr-3 text-right">Entradas</th>
                  <th className="pr-3 text-right">Salidas</th><th className="pr-3 text-right">Saldo final</th><th className="pr-3.5">Verificado</th>
                </tr></thead>
                <tbody>
                  {dias.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-[12.5px] text-muted-foreground">{cargando ? 'Calculando…' : 'Sin movimientos en este período.'}</td></tr>}
                  {dias.map(d => {
                    const abierto = !!abiertos[d.fecha];
                    return (
                      <React.Fragment key={d.fecha}>
                        <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => setAbiertos(a => ({ ...a, [d.fecha]: !a[d.fecha] }))}>
                          <td className="py-2 pl-3.5 text-muted-foreground">{d.movimientos.length ? (abierto ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />) : null}</td>
                          <td className="py-2 pr-3 font-semibold">{dmy(d.fecha)} <span className="font-normal text-muted-foreground">{DIA[new Date(`${d.fecha}T12:00:00`).getDay()]}</span></td>
                          <td className="pr-3 text-right tabular-nums text-muted-foreground">{money(d.saldoInicial, m)}</td>
                          <td className="pr-3 text-right font-bold tabular-nums text-emerald-600">{d.entradas ? `+${num(d.entradas)}` : '—'}</td>
                          <td className="pr-3 text-right font-bold tabular-nums text-red-600">{d.salidas ? `-${num(d.salidas)}` : '—'}</td>
                          <td className={cn('pr-3 text-right font-black tabular-nums', d.saldoFinal < 0 && 'text-red-600')}>{money(d.saldoFinal, m)}</td>
                          <td className="pr-3.5">{d.arqueo ? (Math.abs(d.arqueo.diferencia) < 0.01
                            ? <Chip tono="exito">Cuadra · {money(d.arqueo.saldo_real, m)}</Chip>
                            : <Chip tono="peligro">Dif. {money(d.arqueo.diferencia, m)}</Chip>) : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                        {abierto && d.movimientos.map((mv: MovimientoFlujo) => (
                          <tr key={mv.id} className="border-b border-border/40 bg-muted/20 text-[11.5px]">
                            <td />
                            <td colSpan={2} className="py-1.5 pr-3">
                              <span className={cn('font-semibold', mv.anulado && 'line-through opacity-60')}>{mv.concepto}</span>
                              <span className="block text-[10.5px] text-muted-foreground">{{ venta: 'Venta', cobro: 'Cobro', gasto: 'Gasto', traspaso: 'Traspaso', manual: 'Manual' }[mv.origen]}{mv.detalle ? ` · ${mv.detalle}` : ''}{mv.referencia ? ` · ref ${mv.referencia}` : ''}{mv.usuario ? ` · ${mv.usuario}` : ''}</span>
                              {mv.anulado && <span className="block text-[10.5px] font-bold text-red-600">Anulado: {mv.anuladoMotivo}</span>}
                            </td>
                            <td className={cn('pr-3 text-right tabular-nums text-emerald-600', mv.anulado && 'line-through opacity-50')}>{mv.sentido === 'entrada' ? `+${num(mv.monto)}` : ''}</td>
                            <td className={cn('pr-3 text-right tabular-nums text-red-600', mv.anulado && 'line-through opacity-50')}>{mv.sentido === 'salida' ? `-${num(mv.monto)}` : ''}</td>
                            <td colSpan={2} className="pr-3.5 text-right">
                              {mv.anulable && <button type="button" onClick={e => { e.stopPropagation(); setAnular({ id: mv.registroId, concepto: mv.concepto, monto: mv.monto }); }} className="rounded-md border border-red-500/20 px-2 py-0.5 text-[10.5px] font-bold text-red-600 hover:bg-red-500/10">Anular</button>}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Historial: verificaciones y cambios del saldo inicial */}
          <div>
            <button type="button" onClick={() => setVerHistorial(v => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-[12.5px] font-semibold hover:border-primary">
              <History className="h-4 w-4" aria-hidden /> {verHistorial ? 'Ocultar verificaciones y cambios' : `Verificaciones (${datos.arqueos.length}) y cambios del saldo inicial (${datos.historial.length})`}
            </button>
          </div>
          {verHistorial && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel titulo="Verificaciones del saldo real" subtitulo="Lo que había de verdad contra lo que decía el sistema">
                {datos.arqueos.length === 0 ? <p className="py-4 text-center text-[12px] text-muted-foreground">Todavía no hay verificaciones.</p> : (
                  <ul className="space-y-1.5">{datos.arqueos.map(a => (
                    <li key={a.id} className="rounded-lg border border-border p-2 text-[12px]">
                      <span className="flex flex-wrap items-center gap-1.5"><strong>{dmy(a.fecha)}</strong> real {money(a.saldo_real, m)} · sistema {money(a.saldo_sistema, m)}
                        {Math.abs(a.diferencia) < 0.01 ? <Chip tono="exito">Cuadra</Chip> : <Chip tono="peligro">Dif. {money(a.diferencia, m)}</Chip>}</span>
                      <span className="text-[11px] text-muted-foreground">{a.usuario || '—'}{a.nota ? ` · ${a.nota}` : ''}</span>
                    </li>))}</ul>
                )}
              </Panel>
              <Panel titulo="Cambios del saldo inicial" subtitulo="Quién lo cambió, cuándo y qué había antes">
                {datos.historial.length === 0 ? <p className="py-4 text-center text-[12px] text-muted-foreground">El saldo inicial no se ha configurado todavía.</p> : (
                  <ul className="space-y-1.5">{datos.historial.map(h => (
                    <li key={h.id} className="rounded-lg border border-border p-2 text-[12px]">
                      <span><strong>{h.saldo_anterior != null ? money(Number(h.saldo_anterior), m) : '—'}</strong> → <strong>{money(Number(h.saldo_nuevo), m)}</strong> desde el {dmy(h.desde_nuevo)}</span>
                      <span className="block text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {h.usuario || '—'}{h.motivo ? ` · ${h.motivo}` : ''}</span>
                    </li>))}</ul>
                )}
              </Panel>
            </div>
          )}
        </>
      )}

      <ModalSaldoInicial abierto={modal === 'saldo'} onCerrar={() => setModal(null)} cuenta={cuenta} onListo={listo}
        sugerido={datos.estadoBanco && datos.estadoBanco.saldoInicialBanco != null ? { saldo: Number(datos.estadoBanco.saldoInicialBanco), desde: datos.estadoBanco.desde, texto: `Saldo con el que abrió el estado de ${datos.estadoBanco.banco}` } : null} />
      <ModalMovimiento abierto={modal === 'movimiento'} onCerrar={() => setModal(null)} cuenta={cuenta} onListo={listo} />
      <ModalArqueo abierto={modal === 'arqueo'} onCerrar={() => setModal(null)} cuenta={cuenta} onListo={listo} />
      <ModalAnular abierto={!!anular} onCerrar={() => setAnular(null)} movimiento={anular} onListo={listo} />
      <ModalTraspasoConciliacion abierto={modal === 'traspaso'} onCerrar={() => setModal(null)} movimiento={null} banco="bnc" onCompletado={listo} />
    </div>
  );
}
