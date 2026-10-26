'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, RefreshCw } from 'lucide-react';
import { Chip, Panel } from '@/components/panel/Piezas';
import { cn } from '@/lib/utils';

interface Corrida {
  id: string; created_at: string; banco: string; desde: string | null; hasta: string | null; archivo: string | null; usuario: string | null;
  cuadra: boolean; porcentaje: number | null; en_juego: number | null; movimientos: number | null; conciliados: number | null; pendientes: number | null;
  resumen: Record<string, number> | null;
}
interface Accion {
  id: string; created_at: string; corrida_id: string | null; banco: string | null; fecha: string | null; referencia: string | null; monto: number | null;
  caso: string; accion: string; resuelto: boolean; motivo: string | null; usuario: string | null;
  antes: Record<string, unknown> | null; despues: Record<string, unknown> | null;
  tasa: number | null; tasa_fecha: string | null; tasa_fuente: string | null;
}

const BANCO: Record<string, string> = { banesco: 'Banesco', bnc: 'BNC', bnc_cuotas: 'BNC', exterior: 'Exterior', cashea: 'Cashea' };
const CASO: Record<string, string> = {
  sin_registrar: 'Cobro sin registrar', no_llego: 'No llegó al banco', inicial_sin_cuenta: 'Inicial sin cuenta', gasto_no_salio: 'Gasto que no salió',
  otra_cuenta: 'En otra cuenta', monto_distinto: 'Monto distinto', pago_sin_gasto: 'Pago sin gasto', otro: 'Otro',
};
const ACCION: Record<string, string> = {
  justificar: 'Justificó', registrar_servicio: 'Registró la venta', registrar_abono: 'Aplicó como abono', registrar_egreso: 'Registró el gasto',
  corregir_monto: 'Corrigió el monto', cambiar_cuenta: 'Cambió la cuenta', seguimiento: 'Dejó en seguimiento', reabrir: 'Reabrió',
};
const dt = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dia = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const bs = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function HistorialConciliacion({ banco, sede }: { banco?: string | null; sede?: string | null }) {
  const [datos, setDatos] = useState<{ corridas: Corrida[]; acciones: Accion[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<'corridas' | 'acciones'>('corridas');
  const [soloPendientes, setSoloPendientes] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const q = new URLSearchParams();
      if (banco) q.set('banco', banco);
      if (sede) q.set('sede', sede);
      const r = await fetch(`/api/finanzas/conciliacion/historial?${q}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'No se pudo leer el historial.');
      setDatos(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [banco, sede]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Para cada corrida, la anterior del mismo banco y período: así se ve si el período avanza.
  const conTendencia = useMemo(() => {
    const cs = datos?.corridas || [];
    return cs.map((c, i) => {
      const previa = cs.slice(i + 1).find(x => x.banco === c.banco && x.desde === c.desde && x.hasta === c.hasta);
      return { c, previa };
    });
  }, [datos]);

  const acciones = (datos?.acciones || []).filter(a => !soloPendientes || !a.resuelto);

  return (
    <Panel titulo="Historial y seguimiento" subtitulo="Cada conciliación y cada decisión tomada, con quién, cuándo y por qué"
      accion={<button type="button" onClick={cargar} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-semibold hover:border-primary"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar</button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['corridas', 'acciones'] as const).map(v => (
          <button key={v} type="button" onClick={() => setVista(v)}
            className={cn('rounded-lg px-3 py-1.5 text-[12px] font-bold', vista === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
            {v === 'corridas' ? `Conciliaciones (${datos?.corridas.length ?? 0})` : `Decisiones (${datos?.acciones.length ?? 0})`}
          </button>
        ))}
        {vista === 'acciones' && (
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} /> Solo lo que sigue pendiente
          </label>
        )}
      </div>

      {cargando && <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…</p>}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600">{error}</p>}
      {!cargando && !error && datos && vista === 'corridas' && (
        conTendencia.length === 0 ? <p className="py-6 text-center text-[12.5px] text-muted-foreground">Todavía no hay conciliaciones guardadas. Se guardan solas al conciliar un estado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead><tr className="border-b border-border text-left text-[10.5px] uppercase text-muted-foreground">
                <th className="py-2 pr-3">Cuándo</th><th className="pr-3">Banco · período</th><th className="pr-3">Resultado</th><th className="pr-3 text-right">Conciliado</th>
                <th className="pr-3 text-right">Pendientes</th><th className="pr-3 text-right">Por aclarar</th><th>Por</th>
              </tr></thead>
              <tbody>
                {conTendencia.map(({ c, previa }) => {
                  const delta = previa && c.pendientes != null && previa.pendientes != null ? c.pendientes - previa.pendientes : null;
                  return (
                    <tr key={c.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{dt(c.created_at)}</td>
                      <td className="pr-3"><strong>{BANCO[c.banco] || c.banco}</strong><span className="block text-[11px] text-muted-foreground">{dia(c.desde)} – {dia(c.hasta)}{c.archivo ? ` · ${c.archivo}` : ''}</span></td>
                      <td className="pr-3"><Chip tono={c.cuadra ? 'exito' : 'peligro'}>{c.cuadra ? 'Cuadra' : 'No cuadra'}</Chip></td>
                      <td className="pr-3 text-right tabular-nums">{c.porcentaje ?? '—'}%</td>
                      <td className="pr-3 text-right tabular-nums">
                        {c.pendientes ?? '—'}
                        {delta != null && delta !== 0 && <span className={cn('ml-1 text-[11px] font-bold', delta < 0 ? 'text-emerald-600' : 'text-red-600')}>{delta < 0 ? '↓' : '↑'}{Math.abs(delta)}</span>}
                      </td>
                      <td className="pr-3 text-right tabular-nums">{bs(c.en_juego)}</td>
                      <td>{c.usuario || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {!cargando && !error && datos && vista === 'acciones' && (
        acciones.length === 0 ? <p className="py-6 text-center text-[12.5px] text-muted-foreground">Todavía no hay decisiones registradas.</p> : (
          <ul className="space-y-2">
            {acciones.map(a => (
              <li key={a.id} className="rounded-xl border border-border p-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tono={a.resuelto ? 'exito' : 'aviso'}>{a.resuelto ? 'Resuelto' : 'Pendiente'}</Chip>
                  <strong>{ACCION[a.accion] || a.accion}</strong>
                  <span className="text-muted-foreground">· {CASO[a.caso] || a.caso}{a.banco ? ` · ${BANCO[a.banco] || a.banco}` : ''}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{dt(a.created_at)} · {a.usuario || '—'}</span>
                </div>
                <p className="mt-1 text-foreground/85">
                  {a.fecha ? `${dia(a.fecha)} · ` : ''}{a.referencia ? `ref ${a.referencia} · ` : ''}{a.monto != null ? `Bs ${bs(a.monto)}` : ''}
                </p>
                {a.motivo && <p className="mt-0.5 text-muted-foreground">{a.motivo}</p>}
                {a.tasa != null && <p className="mt-0.5 text-[11px] text-muted-foreground">Tasa usada: {a.tasa.toLocaleString('es-VE', { minimumFractionDigits: 4 })} · {a.tasa_fuente || ''}{a.tasa_fecha ? ` (${dia(a.tasa_fecha)})` : ''}</p>}
              </li>
            ))}
          </ul>
        )
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><History className="h-3.5 w-3.5" aria-hidden /> Nada se borra: reabrir un caso agrega una decisión nueva.</p>
    </Panel>
  );
}
