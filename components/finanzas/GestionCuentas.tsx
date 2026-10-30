'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Landmark, Loader2, Pencil, Plus, Wallet } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import LogoBanco from '@/components/pagos/LogoBanco';
import { Chip, Panel } from '@/components/panel/Piezas';
import { cn } from '@/lib/utils';
import { avisarCambio } from '@/lib/use-refrescar';
import type { BankBin } from '@/lib/reporte/ventas-mapping';

/**
 * Las cuentas de la empresa, en un solo sitio:
 *   · las que RECIBEN COBROS de ventas: cada una enlazada a su método de pago;
 *   · las INTERNAS: caja chica, BNC de cuotas de Cashea, ahorro… (no reciben ventas
 *     directamente; se mueven con traspasos y movimientos del flujo de caja).
 * Cada una dice con qué estado de cuenta se concilia. Nunca se borran: se desactivan.
 */

interface Cuenta {
  id: string; nombre: string; tipo: string; moneda: string; banco: string | null; referencia: string | null; titular: string | null;
  bin: string | null; conciliacion_banco: string | null; notas: string | null; orden: number; activo: boolean; saldo_inicial: number; desde: string;
}
interface Metodo { id: string; label: string; moneda: string }

const TIPOS: Array<[string, string]> = [['banco', 'Banco'], ['digital', 'Digital (Zelle, Binance, Cashea)'], ['efectivo', 'Efectivo'], ['caja_chica', 'Caja chica']];
const FORMATOS: Array<[string, string]> = [['', 'No se concilia con estado de cuenta'], ['banesco', 'Banesco'], ['bnc', 'BNC (iniciales / pago móvil)'], ['bnc_cuotas', 'BNC (cuotas de Cashea)'], ['exterior', 'Banco Exterior'], ['cashea', 'Reporte de Cashea']];
const campo = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none';
const etq = 'mb-1 block text-[11px] font-bold uppercase text-muted-foreground';

export default function GestionCuentas({ puedeEditar = true }: { puedeEditar?: boolean }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [metodos, setMetodos] = useState<Metodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editar, setEditar] = useState<Partial<Cuenta> | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch('/api/finanzas/cuentas', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudieron leer las cuentas.');
      setCuentas(j.cuentas); setMetodos(j.metodos);
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const nombreMetodo = (id: string | null) => metodos.find(m => m.id === id)?.label || id || '';
  const usados = new Set(cuentas.filter(c => c.activo && c.bin).map(c => c.bin));
  const sinCuenta = metodos.filter(m => !usados.has(m.id));
  const grupos: Array<[string, string, Cuenta[]]> = [
    ['Reciben cobros de ventas', 'Cada una enlazada a un método de pago: lo que se cobra por ese método suma aquí.', cuentas.filter(c => c.activo && c.bin)],
    ['Internas de la empresa', 'No reciben ventas directamente: se mueven con traspasos y movimientos del flujo de caja.', cuentas.filter(c => c.activo && !c.bin)],
    ['Desactivadas', 'Conservan su historia; no suman en los saldos.', cuentas.filter(c => !c.activo)],
  ];

  return (
    <Panel titulo="Cuentas de la empresa" subtitulo="Bancos, cajas y cuentas digitales: de cobro de ventas e internas"
      accion={puedeEditar ? <button type="button" onClick={() => setEditar({ tipo: 'banco', moneda: 'VES', activo: true, orden: cuentas.length + 1 })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-bold text-primary-foreground hover:opacity-90"><Plus className="h-3.5 w-3.5" aria-hidden /> Nueva cuenta</button> : undefined}>
      {cargando && <p className="flex items-center gap-2 py-4 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…</p>}
      {error && <p className="rounded-lg bg-red-500/10 p-2.5 text-[12px] text-red-600">{error}</p>}
      {sinCuenta.length > 0 && !cargando && (
        <p className="mb-3 rounded-lg bg-amber-400/15 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
          Métodos de cobro sin cuenta: <strong>{sinCuenta.map(m => m.label).join(', ')}</strong>. Lo que se cobre por ellos no aparece en ningún saldo.
        </p>
      )}
      <div className="space-y-4">
        {grupos.map(([titulo, ayuda, lista]) => lista.length > 0 && (
          <div key={titulo}>
            <p className="text-[12px] font-bold text-foreground">{titulo} <span className="font-normal text-muted-foreground">· {ayuda}</span></p>
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead><tr className="border-b border-border text-left text-[10.5px] uppercase text-muted-foreground">
                  <th className="py-1.5">Cuenta</th><th>Tipo</th><th>Moneda</th><th>Cobra</th><th>Estado de cuenta</th><th>Nº / correo · titular</th><th /></tr></thead>
                <tbody>
                  {lista.map(c => (
                    <tr key={c.id} className={cn('border-b border-border/50', !c.activo && 'opacity-60')}>
                      <td className="py-2 font-semibold"><span className="flex items-center gap-1.5">{c.bin ? <LogoBanco id={c.bin as BankBin} size={18} /> : <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />}{c.nombre}</span></td>
                      <td>{TIPOS.find(t => t[0] === c.tipo)?.[1].split(' (')[0] || c.tipo}</td>
                      <td>{c.moneda === 'VES' ? 'Bs' : c.moneda}</td>
                      <td>{c.bin ? <Chip tono="info">{nombreMetodo(c.bin)}</Chip> : <span className="text-muted-foreground">Interna</span>}</td>
                      <td>{c.conciliacion_banco ? FORMATOS.find(f => f[0] === c.conciliacion_banco)?.[1] : <span className="text-muted-foreground">—</span>}</td>
                      <td className="text-muted-foreground">{[c.referencia, c.titular].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="text-right">{puedeEditar && <button type="button" onClick={() => setEditar(c)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-bold hover:border-primary"><Pencil className="h-3 w-3" aria-hidden /> Editar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">El saldo inicial de cada cuenta y su movimiento día por día se llevan en Conciliación bancaria › Flujo de caja.</p>
      <ModalCuenta cuenta={editar} metodos={metodos} cuentas={cuentas} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); avisarCambio(); void cargar(); }} />
    </Panel>
  );
}

function ModalCuenta({ cuenta, metodos, cuentas, onCerrar, onListo }: { cuenta: Partial<Cuenta> | null; metodos: Metodo[]; cuentas: Cuenta[]; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState<Partial<Cuenta>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (cuenta) { setF(cuenta); setError(null); } }, [cuenta]);
  if (!cuenta) return null;
  const set = (k: keyof Cuenta, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const ocupado = (bin: string) => cuentas.some(c => c.activo && c.bin === bin && c.id !== f.id);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setGuardando(true); setError(null);
    try {
      const r = await fetch('/api/finanzas/cuentas', { method: f.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar.');
      onListo();
    } catch (er) { setError((er as Error).message); } finally { setGuardando(false); }
  };
  return (
    <ModalBase abierto={!!cuenta} onCerrar={onCerrar} titulo={f.id ? `Editar · ${cuenta.nombre}` : 'Nueva cuenta'} subtitulo="Una cuenta de cobro lleva su método de pago; una interna no"
      icono={<Landmark className="h-5 w-5" />} tinteIcono="bg-primary/10 text-primary" ancho="lg">
      <form onSubmit={guardar} className="space-y-3 text-[13px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={etq}>Nombre</label><input className={campo} value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} placeholder="Ej. BNC 8215 (cuotas Cashea)" required /></div>
          <div><label className={etq}>Tipo</label><select className={campo} value={f.tipo || 'banco'} onChange={e => set('tipo', e.target.value)}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={etq}>Moneda</label><select className={campo} value={f.moneda || 'VES'} onChange={e => set('moneda', e.target.value)}><option value="VES">Bolívares</option><option value="USD">Dólares</option><option value="EUR">Euros</option></select></div>
          <div className="sm:col-span-2"><label className={etq}>Recibe cobros de ventas por</label>
            <select className={campo} value={f.bin || ''} onChange={e => { const b = e.target.value; set('bin', b || null); const m = metodos.find(x => x.id === b); if (m) set('moneda', m.moneda); }}>
              <option value="">Ninguno: es una cuenta interna</option>
              {metodos.map(m => <option key={m.id} value={m.id} disabled={ocupado(m.id)}>{m.label}{ocupado(m.id) ? ' (ya está en otra cuenta)' : ''}</option>)}
            </select></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={etq}>Banco</label><input className={campo} value={f.banco || ''} onChange={e => set('banco', e.target.value)} placeholder="Banesco, BNC…" /></div>
          <div><label className={etq}>Nº de cuenta / correo</label><input className={`${campo} font-mono`} value={f.referencia || ''} onChange={e => set('referencia', e.target.value)} /></div>
          <div><label className={etq}>Titular</label><input className={campo} value={f.titular || ''} onChange={e => set('titular', e.target.value)} placeholder="Inversiones Lycos 7000, C.A." /></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><label className={etq}>Se concilia con</label><select className={campo} value={f.conciliacion_banco || ''} onChange={e => set('conciliacion_banco', e.target.value || null)}>{FORMATOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
          <div><label className={etq}>Orden</label><input type="number" className={campo} value={f.orden ?? 0} onChange={e => set('orden', Number(e.target.value))} /></div>
        </div>
        <div><label className={etq}>Notas</label><input className={campo} value={f.notas || ''} onChange={e => set('notas', e.target.value)} /></div>
        {f.id && (
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.activo !== false} onChange={e => set('activo', e.target.checked)} /> Cuenta activa (si la desactivas conserva su historia pero deja de sumar)</label>
        )}
        {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onCerrar} className="rounded-xl border border-border px-4 py-2 font-semibold hover:bg-muted">Cancelar</button>
          <button type="submit" disabled={guardando} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar</button>
        </div>
      </form>
    </ModalBase>
  );
}
