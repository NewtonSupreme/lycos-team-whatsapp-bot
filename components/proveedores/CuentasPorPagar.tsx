'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, ChevronRight, FileText, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { Chip, Panel, TarjetaKpi, Vacio } from '@/components/panel/Piezas';
import ModalBase, { BotonPrincipal, BotonSecundario } from '@/components/ui/modales/ModalBase';
import ModalPagoProveedor, { type GrupoProveedor, type PagoConSaldo } from '@/components/proveedores/ModalPagoProveedor';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';
import { avisarCambio, useRefrescarAlCambiar } from '@/lib/use-refrescar';
import { cn } from '@/lib/utils';
import type { Deuda } from '@/lib/proveedores/pagos';

/**
 * Cuentas por pagar: lo que se le debe a cada proveedor y cada pago que se le hizo.
 *
 * Arriba, por proveedor, con sus deudas (de la ficha de cada carro y compras sueltas)
 * y las acciones de un toque: abonar general, pagar lo vencido, pagar lo de un carro.
 * Abajo, el historial de pagos: a qué deuda fue cada pedazo, de qué cuenta salió, el
 * comprobante, y «anular» que revierte todo sin borrar nada.
 */

interface Aplicacion { id: string; origen: string; registro_id: string; monto_usd: number; saldo_antes: number; saldo_despues: number; descripcion: string; placa: string | null; revertido: boolean; metodos_pago: Record<string, number> | null }
interface Pago {
  id: string; fecha: string; proveedor: string; proveedor_id: string | null; metodos_pago: Record<string, number> | null; tasa: number | null;
  monto_usd: number; aplicado_usd: number; saldo_favor_usd: number; modo: string; referencia: string | null; comprobante_url: string | null;
  nota: string | null; usuario: string | null; anulado: boolean; anulado_por: string | null; anulado_motivo: string | null; created_at: string;
  aplicaciones: Aplicacion[];
}
interface Respuesta { total: number; vencido: number; proveedores: GrupoProveedor[]; pagos: Pago[] }

const usd = (x: number) => `$${(Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const mismoProveedor = (p: { proveedor: string; proveedor_id: string | null }, g: GrupoProveedor) =>
  (g.proveedor_id && p.proveedor_id === g.proveedor_id) || norm(p.proveedor) === norm(g.proveedor);

function cuentasDe(mp: Record<string, number> | null): string {
  const partes = Object.entries(mp || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => {
    const m = BANK_METHODS.find(x => x.id === k);
    return `${m?.short || k} ${m?.moneda === 'Bs' ? `Bs ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : usd(Number(v))}`;
  });
  return partes.join(' + ') || '—';
}

export default function CuentasPorPagar({ busqueda, puedePagar, sedeId, onCambio }: {
  busqueda: string; puedePagar: boolean; sedeId?: string | null; onCambio: () => void;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [pagando, setPagando] = useState<{ grupo: GrupoProveedor; preseleccion?: string[]; modo?: 'general' | 'dirigido' | 'saldo_favor' } | null>(null);
  const [anulando, setAnulando] = useState<Pago | null>(null);
  const [verPago, setVerPago] = useState<Record<string, boolean>>({});
  const [filtroPagos, setFiltroPagos] = useState<'todos' | 'mes' | 'anulados'>('mes');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await fetch(`/api/proveedores/pagos${sedeId ? `?sede=${sedeId}` : ''}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar lo que se debe.');
      setDatos(d);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); } finally { setCargando(false); }
  }, [sedeId]);
  useEffect(() => { cargar(); }, [cargar]);
  useRefrescarAlCambiar(cargar);

  const q = norm(busqueda);
  const grupos = useMemo(() => (datos?.proveedores || []).filter(g => !q || norm(g.proveedor).includes(q)
    || g.deudas.some(d => norm(`${d.placa || ''} ${d.cliente || ''} ${d.concepto}`).includes(q))), [datos, q]);
  const mes = hoy().slice(0, 7);
  const pagos = useMemo(() => (datos?.pagos || []).filter(p => (filtroPagos === 'anulados' ? p.anulado : filtroPagos === 'mes' ? p.fecha.startsWith(mes) && !p.anulado : true)
    && (!q || norm(p.proveedor).includes(q) || p.aplicaciones.some(a => norm(`${a.placa || ''} ${a.descripcion}`).includes(q)))), [datos, filtroPagos, mes, q]);
  const pagadoMes = (datos?.pagos || []).filter(p => !p.anulado && p.modo !== 'saldo_favor' && p.fecha.startsWith(mes)).reduce((s, p) => s + Number(p.monto_usd), 0);
  const saldoFavor = (datos?.proveedores || []).reduce((s, g) => s + g.saldoFavor, 0);
  const conSaldo = (g: GrupoProveedor): PagoConSaldo[] => (datos?.pagos || []).filter(p => !p.anulado && Number(p.saldo_favor_usd) > 0 && mismoProveedor(p, g))
    .map(p => ({ id: p.id, fecha: p.fecha, saldo_favor_usd: Number(p.saldo_favor_usd) }));

  const despues = () => { cargar(); onCambio(); };

  if (cargando && !datos) return <div className="flex items-center gap-2 p-6 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando lo que se debe…</div>;
  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-700 dark:text-red-400">{error} <button onClick={cargar} className="ml-2 underline">Reintentar</button></div>;
  if (!datos) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKpi icono={<Wallet className="h-4 w-4" aria-hidden />} tinte="bg-red-500/10 text-red-600" etiqueta="Se debe a proveedores" valor={usd(datos.total)} pie={`${datos.proveedores.filter(g => g.saldo > 0).length} proveedor(es)`} />
        <TarjetaKpi icono={<AlertTriangle className="h-4 w-4" aria-hidden />} tinte="bg-amber-400/15 text-amber-700" etiqueta="Vencido" valor={usd(datos.vencido)} pie="ya pasó su fecha de pago" />
        <TarjetaKpi icono={<CheckCircle2 className="h-4 w-4" aria-hidden />} tinte="bg-emerald-500/10 text-emerald-600" etiqueta="Pagado este mes" valor={usd(pagadoMes)} pie="sale del flujo de caja el día del pago" />
        <TarjetaKpi icono={<Wallet className="h-4 w-4" aria-hidden />} tinte="bg-blue-500/10 text-blue-600" etiqueta="Saldo a favor" valor={usd(saldoFavor)} pie="pagado de más; se usa en la próxima" />
      </div>

      <Panel titulo={`Por proveedor (${grupos.length})`} subtitulo="Toca un proveedor para ver sus deudas. Un abono general se reparte solo: lo que vence antes, primero."
        accion={<button onClick={cargar} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted" aria-label="Recargar"><RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} aria-hidden /></button>} sinRelleno>
        {grupos.length === 0 ? (
          <Vacio icono={<CheckCircle2 className="h-8 w-8" aria-hidden />} titulo={q ? 'Nada coincide con la búsqueda' : 'No se le debe nada a ningún proveedor'} />
        ) : (
          <ul className="divide-y divide-border/70 border-t border-border">
            {grupos.map(g => {
              const k = g.proveedor_id || norm(g.proveedor); const abierto = !!abiertos[k];
              const porPlaca = new Map<string, Deuda[]>();
              for (const d of g.deudas) if (d.placa) porPlaca.set(d.placa, [...(porPlaca.get(d.placa) || []), d]);
              const vencidas = g.deudas.filter(d => d.vencida);
              return (
                <li key={k}>
                  <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                    <button onClick={() => setAbiertos(a => ({ ...a, [k]: !abierto }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      {abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-foreground">{g.proveedor}</span>
                        <span className="block text-[11px] text-muted-foreground">{g.deudas.length} deuda(s){porPlaca.size > 0 && ` · ${porPlaca.size} carro(s)`}</span>
                      </span>
                    </button>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {g.vencido > 0 && <Chip tono="peligro">vencido {usd(g.vencido)}</Chip>}
                      {g.saldoFavor > 0 && <Chip tono="info">a favor {usd(g.saldoFavor)}</Chip>}
                    </span>
                    <span className="w-[100px] text-right text-[14px] font-extrabold tabular-nums text-red-600 dark:text-red-400">{g.saldo > 0 ? usd(g.saldo) : '—'}</span>
                    {puedePagar && (
                      <span className="flex gap-1.5">
                        {g.saldo > 0 && <button onClick={() => setPagando({ grupo: g, modo: 'general' })} className="rounded-lg bg-[#f97316] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#ea580c]">Abonar</button>}
                        {vencidas.length > 0 && <button onClick={() => setPagando({ grupo: g, modo: 'dirigido', preseleccion: vencidas.map(d => `${d.origen}:${d.id}`) })} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground hover:bg-muted">Pagar lo vencido</button>}
                        {g.saldoFavor > 0 && g.saldo > 0 && <button onClick={() => setPagando({ grupo: g, modo: 'saldo_favor' })} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground hover:bg-muted">Usar saldo a favor</button>}
                      </span>
                    )}
                  </div>
                  {abierto && (
                    <div className="overflow-x-auto border-t border-border/60 bg-muted/20">
                      <table className="w-full min-w-[760px] text-[12px]">
                        <thead>
                          <tr className="text-left text-[10.5px] text-muted-foreground">
                            <th className="px-3.5 py-1.5 font-semibold">Fecha</th><th className="px-2 py-1.5 font-semibold">Concepto</th><th className="px-2 py-1.5 font-semibold">Carro / cliente</th>
                            <th className="px-2 py-1.5 text-right font-semibold">Total</th><th className="px-2 py-1.5 text-right font-semibold">Abonado</th><th className="px-2 py-1.5 text-right font-semibold">Se debe</th>
                            <th className="px-2 py-1.5 font-semibold">Vence</th><th className="px-3.5 py-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {g.deudas.map(d => (
                            <tr key={`${d.origen}:${d.id}`} className={cn('border-t border-border/50', d.vencida && 'bg-red-500/[0.04]')}>
                              <td className="px-3.5 py-1.5 tabular-nums text-muted-foreground">{fechaCorta(d.fecha)}</td>
                              <td className="px-2 py-1.5"><span className="font-medium text-foreground">{d.concepto}</span><span className="block text-[10.5px] text-muted-foreground">{d.origen === 'partida' ? 'ficha del carro' : 'compra suelta'}</span></td>
                              <td className="px-2 py-1.5">
                                {d.placa ? <a href={`/dashboard/ficha?placa=${encodeURIComponent(d.placa)}`} className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">{d.placa}</a> : <span className="text-muted-foreground/50">—</span>}
                                {d.cliente && <span className="ml-1.5 text-[11px] text-muted-foreground">{d.cliente}</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{usd(d.total)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{d.pagado > 0 ? usd(d.pagado) : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-bold tabular-nums text-red-600 dark:text-red-400">{usd(d.saldo)}</td>
                              <td className={cn('px-2 py-1.5 tabular-nums', d.vencida ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{d.vence ? fechaCorta(d.vence) : 'sin fecha'}</td>
                              <td className="px-3.5 py-1.5 text-right">
                                {puedePagar && (
                                  <span className="flex justify-end gap-1">
                                    <button onClick={() => setPagando({ grupo: g, modo: 'dirigido', preseleccion: [`${d.origen}:${d.id}`] })} className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold hover:bg-muted">Pagar</button>
                                    {d.placa && (porPlaca.get(d.placa)?.length || 0) > 1 && (
                                      <button onClick={() => setPagando({ grupo: g, modo: 'dirigido', preseleccion: (porPlaca.get(d.placa!) || []).map(x => `${x.origen}:${x.id}`) })} className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold hover:bg-muted">Todo {d.placa}</button>
                                    )}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel titulo={`Pagos a proveedores (${pagos.length})`} subtitulo="Cada pago con a qué deudas fue, de qué cuenta salió y su comprobante. Anular revierte todo; no se borra nada."
        accion={(
          <select value={filtroPagos} onChange={e => setFiltroPagos(e.target.value as typeof filtroPagos)} className="h-[26px] rounded-lg border border-border bg-card px-2 text-[11.5px]">
            <option value="mes">Este mes</option><option value="todos">Todos</option><option value="anulados">Anulados</option>
          </select>
        )} sinRelleno>
        {pagos.length === 0 ? (
          <Vacio icono={<Wallet className="h-8 w-8" aria-hidden />} titulo="No hay pagos que mostrar" detalle={filtroPagos === 'mes' ? 'Los pagos de este mes aparecen aquí al registrarlos.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[12px]">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                  <th className="px-3.5 py-2 font-semibold">Fecha</th><th className="px-2 py-2 font-semibold">Proveedor</th><th className="px-2 py-2 font-semibold">Desde</th>
                  <th className="px-2 py-2 text-right font-semibold">Monto</th><th className="px-2 py-2 font-semibold">Aplicado a</th><th className="px-2 py-2 font-semibold">Ref.</th><th className="px-3.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => {
                  const vivas = p.aplicaciones.filter(a => !a.revertido);
                  return (
                    <Fragment key={p.id}>
                      <tr className={cn('border-b border-border/60', p.anulado && 'opacity-60')}>
                        <td className="px-3.5 py-2 tabular-nums text-muted-foreground">{fechaCorta(p.fecha)}</td>
                        <td className="px-2 py-2">
                          <span className="font-semibold text-foreground">{p.proveedor}</span>
                          <span className="block text-[10.5px] text-muted-foreground">{p.modo === 'general' ? 'abono general' : p.modo === 'dirigido' ? 'a deudas elegidas' : 'con saldo a favor'} · {p.usuario || '—'}</span>
                        </td>
                        <td className="px-2 py-2 text-[11.5px]">{p.modo === 'saldo_favor' ? 'saldo a favor' : cuentasDe(p.metodos_pago)}{p.tasa ? <span className="block text-[10px] text-muted-foreground">tasa {p.tasa}</span> : null}</td>
                        <td className="px-2 py-2 text-right font-bold tabular-nums">{usd(p.monto_usd)}{Number(p.saldo_favor_usd) > 0 && !p.anulado && <span className="block text-[10px] font-semibold text-blue-600">a favor {usd(p.saldo_favor_usd)}</span>}</td>
                        <td className="px-2 py-2">
                          <button onClick={() => setVerPago(v => ({ ...v, [p.id]: !v[p.id] }))} className="text-left text-[11.5px] text-primary hover:underline">
                            {p.anulado ? `anulado: ${p.anulado_motivo || ''}` : `${vivas.length} deuda(s) · ${[...new Set(vivas.map(a => a.placa).filter(Boolean))].join(', ') || 'sin carro'}`}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-[11.5px]">
                          {p.referencia || '—'}
                          {p.comprobante_url && <a href={p.comprobante_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-primary" aria-label="Ver comprobante"><FileText className="h-3.5 w-3.5" aria-hidden /></a>}
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          {puedePagar && !p.anulado && (
                            <button onClick={() => setAnulando(p)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-500/5"><Ban className="h-3 w-3" aria-hidden />Anular</button>
                          )}
                        </td>
                      </tr>
                      {verPago[p.id] && (
                        <tr className="border-b border-border/60 bg-muted/20">
                          <td colSpan={7} className="px-3.5 py-2">
                            {p.aplicaciones.length === 0 ? <span className="text-muted-foreground">No se aplicó a ninguna deuda: todo quedó como saldo a favor.</span> : (
                              <ul className="space-y-0.5">
                                {p.aplicaciones.map(a => (
                                  <li key={a.id} className={cn('flex flex-wrap gap-x-3 text-[11.5px]', a.revertido && 'line-through opacity-60')}>
                                    <span className="font-medium text-foreground">{a.descripcion}</span>
                                    {a.placa && <span className="font-semibold">{a.placa}</span>}
                                    <span className="tabular-nums">debía {usd(a.saldo_antes)} → pagó <b>{usd(a.monto_usd)}</b> → {a.saldo_despues > 0.009 ? `queda ${usd(a.saldo_despues)}` : 'pagada'}</span>
                                    {cuentasDe(a.metodos_pago) !== '—' && <span className="text-muted-foreground">{cuentasDe(a.metodos_pago)}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {p.nota && <p className="mt-1 text-[11px] text-muted-foreground">Nota: {p.nota}</p>}
                            {p.anulado && <p className="mt-1 text-[11px] text-red-600">Anulado por {p.anulado_por}: {p.anulado_motivo}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pagando && (
        <ModalPagoProveedor grupo={pagando.grupo} preseleccion={pagando.preseleccion} modoInicial={pagando.modo} pagosConSaldo={conSaldo(pagando.grupo)}
          onCerrar={() => setPagando(null)} onHecho={despues} />
      )}
      {anulando && <ModalAnular pago={anulando} onCerrar={() => setAnulando(null)} onHecho={() => { setAnulando(null); avisarCambio(); despues(); }} />}
    </div>
  );
}

function ModalAnular({ pago, onCerrar, onHecho }: { pago: Pago; onCerrar: () => void; onHecho: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const anular = async () => {
    if (!motivo.trim()) { setError('Escribe por qué se anula.'); return; }
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/proveedores/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'anular', id: pago.id, motivo: motivo.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo anular.');
      onHecho();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo anular.'); } finally { setGuardando(false); }
  };
  return (
    <ModalBase abierto onCerrar={onCerrar} bloqueado={guardando} titulo="Anular el pago" subtitulo={`${pago.proveedor} · ${usd(pago.monto_usd)} del ${fechaCorta(pago.fecha)}`}
      icono={<Ban className="h-5 w-5" aria-hidden />} tinteIcono="bg-red-50 text-red-600"
      pie={(
        <>
          <BotonSecundario onClick={onCerrar} disabled={guardando}>Cancelar</BotonSecundario>
          <BotonPrincipal tono="rojo" onClick={anular} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Anular y revertir</BotonPrincipal>
        </>
      )}>
      <div className="space-y-2 text-[13px] text-[#16181d]">
        <p>Las {pago.aplicaciones.filter(a => !a.revertido).length} deuda(s) vuelven a quedar como estaban y el dinero vuelve a la cuenta en el flujo de caja. El pago queda en el historial marcado como anulado.</p>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Motivo (obligatorio): monto equivocado, era de otro proveedor…" className="w-full rounded-lg border border-[#e2e5ea] p-2 text-[13px] outline-none focus:border-[#f97316]" />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}
      </div>
    </ModalBase>
  );
}
