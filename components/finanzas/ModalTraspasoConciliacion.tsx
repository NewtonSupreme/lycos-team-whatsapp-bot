'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Loader2, X } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import type { MovimientoBanco, BancoConciliable } from '@/lib/conciliacion/leer-estado';

interface CuentaFinanciera {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  banco: string | null;
  bin: string | null;
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  movimiento: MovimientoBanco | null;
  banco: BancoConciliable;
  onCompletado: () => void;
}

export default function ModalTraspasoConciliacion({
  abierto,
  onCerrar,
  movimiento,
  banco,
  onCompletado,
}: Props) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [motivo, setMotivo] = useState('');

  // Cargar cuentas disponibles
  useEffect(() => {
    if (!abierto) return;
    setCargandoCuentas(true);
    fetch('/api/finanzas/traspasos')
      .then(res => res.json())
      .then(data => {
        if (data.cuentas) {
          setCuentas(data.cuentas);
          // Pre-seleccionar cuenta de origen basada en el banco
          if (movimiento) {
            const esEgreso = movimiento.monto < 0;
            const ctaBnc8215 = data.cuentas.find((c: CuentaFinanciera) => c.nombre.includes('8215') || (c.banco === 'BNC' && banco === 'bnc_cuotas'));
            const ctaBnc8201 = data.cuentas.find((c: CuentaFinanciera) => (c.bin === 'bnc' || c.banco === 'BNC') && !c.nombre.includes('8215'));
            const ctaBanesco = data.cuentas.find((c: CuentaFinanciera) => c.bin === 'pago_movil_banesco' || c.banco === 'Banesco');
            const ctaExterior = data.cuentas.find((c: CuentaFinanciera) => c.bin === 'pago_movil_exterior' || c.banco === 'Exterior');

            let defaultCta = ctaBnc8201?.id;
            if (banco === 'bnc_cuotas') defaultCta = ctaBnc8215?.id || ctaBnc8201?.id;
            else if (banco === 'banesco') defaultCta = ctaBanesco?.id;
            else if (banco === 'exterior') defaultCta = ctaExterior?.id;

            if (esEgreso) {
              setOrigenId(defaultCta || data.cuentas[0]?.id || '');
              setDestinoId(ctaBanesco?.id || ctaBnc8201?.id || data.cuentas[1]?.id || '');
            } else {
              setDestinoId(defaultCta || data.cuentas[0]?.id || '');
              setOrigenId(ctaBnc8215?.id || ctaBanesco?.id || data.cuentas[1]?.id || '');
            }
          }
        }
      })
      .catch(() => setError('No se pudieron cargar las cuentas financieras.'))
      .finally(() => setCargandoCuentas(false));
  }, [abierto, banco, movimiento]);

  // Inicializar campos según movimiento
  useEffect(() => {
    if (movimiento) {
      setMonto(Math.abs(movimiento.monto).toFixed(2));
      setFecha(movimiento.fecha);
      setMotivo(`Traspaso ref ${movimiento.referencia || 'S/R'}: ${movimiento.descripcion} ${movimiento.detalle}`.trim());
      setError(null);
    } else {
      setMonto('');
      setFecha(new Date().toISOString().slice(0, 10));
      setMotivo('Traspaso interno entre cuentas');
      setError(null);
    }
  }, [movimiento, abierto]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origenId || !destinoId) {
      setError('Debes elegir cuenta de origen y de destino.');
      return;
    }
    if (origenId === destinoId) {
      setError('Las cuentas de origen y destino deben ser distintas.');
      return;
    }
    const valMonto = Number(monto);
    if (!valMonto || valMonto <= 0) {
      setError('El monto debe ser mayor a cero.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/finanzas/traspasos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origen_id: origenId,
          destino_id: destinoId,
          monto: valMonto,
          monto_destino: valMonto,
          fecha,
          motivo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el traspaso');

      onCompletado();
      onCerrar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Traspaso entre Cuentas"
      subtitulo="Registrar movimiento de fondos entre cuentas del taller"
      icono={<ArrowLeftRight className="h-5 w-5" />}
      tinteIcono="bg-primary/10 text-primary"
      ancho="md"
    >
      <form onSubmit={guardar} className="space-y-4 text-[13px]">
        {movimiento && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-[12px] space-y-1">
            <div className="flex justify-between font-bold text-foreground">
              <span>{movimiento.fecha} · Ref: {movimiento.referencia || 'N/A'}</span>
              <span className="tabular-nums font-mono text-[13px]">{Math.abs(movimiento.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
            </div>
            <p className="text-muted-foreground truncate">{movimiento.descripcion} {movimiento.detalle}</p>
          </div>
        )}

        {cargandoCuentas ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando cuentas...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Cuenta de Origen (Sale el dinero)
                </label>
                <select
                  value={origenId}
                  onChange={e => setOrigenId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none"
                  required
                >
                  <option value="">Selecciona cuenta...</option>
                  {cuentas.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.moneda})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Cuenta de Destino (Entra el dinero)
                </label>
                <select
                  value={destinoId}
                  onChange={e => setDestinoId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none"
                  required
                >
                  <option value="">Selecciona cuenta...</option>
                  {cuentas.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.moneda})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Monto a Transferir
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-semibold tabular-nums focus:border-primary focus:outline-none"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Fecha del Movimiento
                </label>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Motivo / Descripción
              </label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                placeholder="Ej. Traspaso BNC 8215 a BNC 8201 para pago de proveedores"
              />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || cargandoCuentas}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {guardando ? 'Guardando...' : 'Registrar Traspaso'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}
