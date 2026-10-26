'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Clock, Loader2, Tag } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';
import type { AsientoSistema } from '@/lib/conciliacion/motor';
import type { BancoConciliable, MovimientoBanco } from '@/lib/conciliacion/leer-estado';

/**
 * Acciones rápidas para un registro del SISTEMA que el banco no confirma:
 *   · no llegó al banco       → cambiar la cuenta de la venta, justificar o dejar en seguimiento
 *   · inicial sin cuenta      → igual
 *   · gasto que no salió      → justificar o dejar en seguimiento
 *   · cobrado en otra cuenta  → cambiar la cuenta de la venta a la del banco del estado
 * Todo queda en el historial de conciliaciones con quién, cuándo y por qué.
 */

export type CasoSistema = 'no_llego' | 'inicial_sin_cuenta' | 'gasto_no_salio' | 'otra_cuenta';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  sistema: AsientoSistema | null;
  caso: CasoSistema;
  banco: BancoConciliable;
  corridaId?: string | null;
  /** Para «otra cuenta»: el movimiento del banco que sí llegó. */
  movimientoBanco?: MovimientoBanco | null;
  /** Cuenta del banco que se está conciliando (destino sugerido). */
  cuentaDelBanco?: string;
  onCompletado: () => void;
}

const CHIPS: Record<CasoSistema, string[]> = {
  no_llego: [
    'El cliente pagó en efectivo, no por el banco',
    'Pagó a otro banco y se corrige aparte',
    'Pago aún en proceso: llega en el próximo estado',
  ],
  inicial_sin_cuenta: ['La inicial se pagó por otra vía (efectivo o divisas)', 'Cashea la liquida después'],
  gasto_no_salio: ['Se pagó en efectivo, no desde el banco', 'Se pagó desde otra cuenta', 'Gasto aún por pagar al proveedor'],
  otra_cuenta: ['El pago entró por otro banco por error del cliente'],
};

const TITULO: Record<CasoSistema, string> = {
  no_llego: 'Cobro que no llegó al banco',
  inicial_sin_cuenta: 'Inicial de Cashea sin cuenta',
  gasto_no_salio: 'Gasto que no salió del banco',
  otra_cuenta: 'Cobro registrado en otra cuenta',
};

export default function ModalSistemaConciliacion({
  abierto, onCerrar, sistema, caso, banco, corridaId = null, movimientoBanco = null, cuentaDelBanco, onCompletado,
}: Props) {
  const [modo, setModo] = useState<'cuenta' | 'justificar' | 'seguimiento'>('justificar');
  const [hacia, setHacia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moneda = sistema ? BANK_METHODS.find(m => m.id === sistema.cuenta)?.moneda : undefined;
  const opcionesCuenta = BANK_METHODS.filter(m => sistema && m.id !== sistema.cuenta && m.moneda === moneda);
  const puedeCambiarCuenta = !!sistema && sistema.tabla === 'ventas_dia' && !sistema.enDolares && caso !== 'gasto_no_salio';

  useEffect(() => {
    if (!abierto || !sistema) return;
    setError(null); setMotivo('');
    const sugerida = cuentaDelBanco && cuentaDelBanco !== sistema.cuenta ? cuentaDelBanco : '';
    setHacia(sugerida);
    setModo(caso === 'otra_cuenta' && puedeCambiarCuenta ? 'cuenta' : 'justificar');
  }, [abierto, sistema, caso, cuentaDelBanco, puedeCambiarCuenta]);

  if (!sistema) return null;

  const fechaAccion = movimientoBanco?.fecha || sistema.fecha;
  const monto = movimientoBanco ? Math.abs(movimientoBanco.monto) : sistema.monto;
  const nombre = (id: string) => BANK_METHODS.find(m => m.id === id)?.label || id.replace(/_/g, ' ');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true); setError(null);
    try {
      const comun = { banco, corridaId, caso, refMovimiento: movimientoBanco?.referencia || null };
      let body: Record<string, unknown>;
      if (modo === 'cuenta') {
        if (!hacia) throw new Error('Elige la cuenta a la que pagó el cliente.');
        body = { ...comun, accion: 'cambiar_cuenta', registroId: sistema.registroId, desde: sistema.cuenta, hacia, fecha: fechaAccion, montoBanco: monto,
          movimientoHash: movimientoBanco ? `${movimientoBanco.fecha}_${movimientoBanco.referencia}_${movimientoBanco.monto}` : `sis:${sistema.id}` };
      } else if (modo === 'seguimiento') {
        if (!motivo.trim()) throw new Error('Anota qué falta para resolverlo.');
        body = { ...comun, accion: 'seguimiento', movimientoHash: `sis:${sistema.id}`, motivo: motivo.trim(), monto, fecha: fechaAccion };
      } else {
        if (!motivo.trim()) throw new Error('Escribe el motivo de la justificación.');
        body = { ...comun, accion: 'justificar', movimientoHash: `sis:${sistema.id}`, tipo: 'sistema', motivo: motivo.trim(), monto, fecha: fechaAccion };
      }
      const res = await fetch('/api/finanzas/conciliacion/accion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      onCompletado();
      onCerrar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const tab = (id: typeof modo, texto: string, icono: React.ReactNode) => (
    <button type="button" onClick={() => { setModo(id); setError(null); }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
      {icono} {texto}
    </button>
  );

  return (
    <ModalBase abierto={abierto} onCerrar={onCerrar} titulo={TITULO[caso]} subtitulo="Aplica una corrección o deja constancia: todo queda en el historial"
      icono={<ArrowLeftRight className="h-5 w-5" />} tinteIcono="bg-primary/10 text-primary" ancho="lg">
      <div className="space-y-4 text-[13px]">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-[12px] space-y-1">
          <div className="flex justify-between font-bold text-foreground">
            <span>{sistema.fecha} · {sistema.concepto}{sistema.placa ? ` · ${sistema.placa}` : ''}</span>
            <span className="font-mono tabular-nums">{sistema.enDolares ? `$${sistema.monto.toFixed(2)}` : `${sistema.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`}</span>
          </div>
          <p className="text-muted-foreground">{nombre(sistema.cuenta)} · {sistema.detalle || 'sin detalle'}</p>
          {movimientoBanco && <p className="text-muted-foreground">Entró al banco: ref {movimientoBanco.referencia} · {Math.abs(movimientoBanco.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</p>}
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border pb-2.5">
          {puedeCambiarCuenta && tab('cuenta', 'Cambiar la cuenta de la venta', <ArrowLeftRight className="h-3.5 w-3.5" />)}
          {tab('justificar', 'Justificar con motivo', <Tag className="h-3.5 w-3.5" />)}
          {tab('seguimiento', 'Dejar en seguimiento', <Clock className="h-3.5 w-3.5" />)}
        </div>

        <form onSubmit={enviar} className="space-y-4">
          {modo === 'cuenta' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Mueve lo cobrado de <strong>{nombre(sistema.cuenta)}</strong> a la cuenta donde de verdad entró el dinero. El monto, el total en dólares y la tasa no cambian.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Cuenta donde pagó el cliente</label>
                <select value={hacia} onChange={e => setHacia(e.target.value)} required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none">
                  <option value="">Elige la cuenta…</option>
                  {opcionesCuenta.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {modo === 'justificar' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Deja constancia de por qué este registro no aparece en el estado. Sale de los pendientes y queda en «Justificados» con tu nombre y el motivo.
              </p>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} required
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                placeholder="Escribe el motivo…" />
              <div className="flex flex-wrap gap-1.5">
                {CHIPS[caso].map(c => (
                  <button key={c} type="button" onClick={() => setMotivo(c)}
                    className="rounded-lg border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground/80 hover:border-primary hover:text-foreground">{c}</button>
                ))}
              </div>
            </div>
          )}

          {modo === 'seguimiento' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">No se resuelve hoy: queda anotado quién lo vio y qué falta, y se ve en el historial de conciliaciones.</p>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} required
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                placeholder="Ej. Confirmar con el cliente a qué banco pagó" />
            </div>
          )}

          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600 dark:text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {guardando ? 'Guardando...' : modo === 'cuenta' ? 'Cambiar la cuenta' : modo === 'seguimiento' ? 'Dejar en seguimiento' : 'Guardar justificación'}
            </button>
          </div>
        </form>
      </div>
    </ModalBase>
  );
}
