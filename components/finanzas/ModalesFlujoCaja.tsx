'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, Scale, SlidersHorizontal, ArrowDownUp, Ban } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';

/** Las cuatro ventanas del flujo de caja: saldo inicial, movimiento, verificar saldo y anular. */

export interface CuentaVista {
  id: string; nombre: string; moneda: 'VES' | 'USD' | 'EUR'; saldoInicial: number; desde: string; saldo: number;
}

const campo = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none';
const etiqueta = 'block text-[11px] font-bold text-muted-foreground uppercase mb-1';
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const dinero = (x: number, m: string) => `${m === 'USD' ? '$' : m === 'EUR' ? '€' : 'Bs '}${x.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function enviar(cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/finanzas/flujo-caja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || 'No se pudo guardar.');
  return j;
}

function Pie({ error, guardando, texto, onCerrar }: { error: string | null; guardando: boolean; texto: string; onCerrar: () => void }) {
  return (
    <>
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground hover:bg-muted">Cancelar</button>
        <button type="submit" disabled={guardando} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {guardando ? 'Guardando...' : texto}
        </button>
      </div>
    </>
  );
}

function useEnvio(onListo: () => void, onCerrar: () => void) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ejecutar = async (fn: () => Promise<unknown>) => {
    setGuardando(true); setError(null);
    try { await fn(); onListo(); onCerrar(); } catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  };
  return { guardando, error, setError, ejecutar };
}

// ── Saldo inicial ────────────────────────────────────────────────────────────
export function ModalSaldoInicial({ abierto, onCerrar, cuenta, sugerido, onListo }: {
  abierto: boolean; onCerrar: () => void; cuenta: CuentaVista | null; onListo: () => void;
  /** Un punto de partida que viene de otro lado (el estado de cuenta del banco). */
  sugerido?: { saldo: number; desde: string; texto: string } | null;
}) {
  const [saldo, setSaldo] = useState(''); const [desde, setDesde] = useState(''); const [motivo, setMotivo] = useState('');
  const { guardando, error, ejecutar } = useEnvio(onListo, onCerrar);
  useEffect(() => {
    if (!abierto || !cuenta) return;
    setSaldo(String(cuenta.saldoInicial || '')); setDesde(cuenta.saldoInicial ? cuenta.desde : hoy()); setMotivo('');
  }, [abierto, cuenta]);
  if (!cuenta) return null;
  const cambia = Number(saldo) !== cuenta.saldoInicial || desde !== cuenta.desde;
  return (
    <ModalBase abierto={abierto} onCerrar={onCerrar} titulo={`Saldo inicial · ${cuenta.nombre}`} subtitulo="El punto de partida: desde ese día se suma lo que entra y se resta lo que sale"
      icono={<SlidersHorizontal className="h-5 w-5" />} tinteIcono="bg-primary/10 text-primary" ancho="md">
      <form className="space-y-4 text-[13px]" onSubmit={e => { e.preventDefault(); void ejecutar(() => enviar({ accion: 'configurar_saldo', cuenta_id: cuenta.id, saldo_inicial: Number(saldo), desde, motivo })); }}>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[12px] text-amber-800 dark:text-amber-300">
          Pon lo que había en la cuenta <strong>al empezar ese día</strong> (en {cuenta.moneda === 'USD' ? 'dólares' : 'bolívares'}). Lo anterior a esa fecha deja de contar. El cambio queda anotado con el valor de antes.
        </p>
        {sugerido && (
          <button type="button" onClick={() => { setSaldo(String(sugerido.saldo)); setDesde(sugerido.desde); }}
            className="w-full rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left text-[12px] font-semibold text-primary hover:bg-primary/10">
            Usar el del estado de cuenta: {dinero(sugerido.saldo, cuenta.moneda)} al {sugerido.desde.split('-').reverse().join('/')} <span className="block font-normal text-muted-foreground">{sugerido.texto}</span>
          </button>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={etiqueta}>Saldo inicial ({cuenta.moneda === 'USD' ? '$' : 'Bs'})</label>
            <input type="number" step="0.01" value={saldo} onChange={e => setSaldo(e.target.value)} className={`${campo} font-bold tabular-nums`} required /></div>
          <div><label className={etiqueta}>Cuenta desde el día</label>
            <input type="date" value={desde} max={hoy()} onChange={e => setDesde(e.target.value)} className={campo} required /></div>
        </div>
        <div><label className={etiqueta}>Motivo (opcional)</label>
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} placeholder="Ej. Saldo al abrir el mes según el estado de cuenta" /></div>
        {cuenta.saldoInicial !== 0 && cambia && <p className="text-[11.5px] text-muted-foreground">Antes: {dinero(cuenta.saldoInicial, cuenta.moneda)} desde el {cuenta.desde.split('-').reverse().join('/')}.</p>}
        <Pie error={error} guardando={guardando} texto="Guardar saldo inicial" onCerrar={onCerrar} />
      </form>
    </ModalBase>
  );
}

// ── Movimiento manual ────────────────────────────────────────────────────────
const CATEGORIAS = ['Retiro / envío', 'Depósito / recarga', 'Comisión', 'Compra de divisas', 'Venta de divisas', 'P2P', 'Ajuste', 'Otro'];

export function ModalMovimiento({ abierto, onCerrar, cuenta, fechaInicial, onListo }: {
  abierto: boolean; onCerrar: () => void; cuenta: CuentaVista | null; fechaInicial?: string; onListo: () => void;
}) {
  const [sentido, setSentido] = useState<'entrada' | 'salida'>('entrada');
  const [fecha, setFecha] = useState(''); const [monto, setMonto] = useState(''); const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS[0]); const [contraparte, setContraparte] = useState('');
  const [referencia, setReferencia] = useState(''); const [notas, setNotas] = useState('');
  const { guardando, error, ejecutar } = useEnvio(onListo, onCerrar);
  useEffect(() => {
    if (!abierto) return;
    setSentido('entrada'); setFecha(fechaInicial || hoy()); setMonto(''); setConcepto(''); setCategoria(CATEGORIAS[0]); setContraparte(''); setReferencia(''); setNotas('');
  }, [abierto, fechaInicial]);
  if (!cuenta) return null;
  return (
    <ModalBase abierto={abierto} onCerrar={onCerrar} titulo={`Registrar movimiento · ${cuenta.nombre}`} subtitulo="Lo que entra o sale de la cuenta y no es una venta ni un gasto del taller"
      icono={<ArrowDownUp className="h-5 w-5" />} tinteIcono="bg-primary/10 text-primary" ancho="lg">
      <form className="space-y-4 text-[13px]" onSubmit={e => { e.preventDefault(); void ejecutar(() => enviar({ accion: 'movimiento', cuenta_id: cuenta.id, sentido, fecha, monto: Number(monto), concepto, categoria, contraparte, referencia, notas })); }}>
        <div className="flex gap-1.5">
          {(['entrada', 'salida'] as const).map(s => (
            <button key={s} type="button" onClick={() => setSentido(s)}
              className={`flex-1 rounded-xl px-3 py-2 font-bold ${sentido === s ? (s === 'entrada' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {s === 'entrada' ? 'Entrada (suma)' : 'Salida (resta)'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={etiqueta}>Monto ({cuenta.moneda === 'USD' ? '$' : 'Bs'})</label>
            <input type="number" step="0.01" min="0.01" value={monto} onChange={e => setMonto(e.target.value)} className={`${campo} font-bold tabular-nums`} required /></div>
          <div><label className={etiqueta}>Fecha</label>
            <input type="date" value={fecha} min={cuenta.desde} max={hoy()} onChange={e => setFecha(e.target.value)} className={campo} required /></div>
          <div><label className={etiqueta}>Tipo</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className={campo}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div><label className={etiqueta}>Concepto</label>
          <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)} className={campo} placeholder="Ej. Retiro de Binance a Banesco · Comisión P2P" required /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={etiqueta}>Persona / entidad (opcional)</label>
            <input type="text" value={contraparte} onChange={e => setContraparte(e.target.value)} className={campo} /></div>
          <div><label className={etiqueta}>Referencia (opcional)</label>
            <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} className={`${campo} font-mono`} /></div>
        </div>
        <div><label className={etiqueta}>Notas (opcional)</label>
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className={campo} /></div>
        <p className="text-[11.5px] text-muted-foreground">Para mover dinero ENTRE tus cuentas usa «Traspaso»: así sale de una y entra a la otra sin contarlo dos veces. Un movimiento no se borra: se anula con motivo.</p>
        <Pie error={error} guardando={guardando} texto="Registrar movimiento" onCerrar={onCerrar} />
      </form>
    </ModalBase>
  );
}

// ── Verificar el saldo real ──────────────────────────────────────────────────
export function ModalArqueo({ abierto, onCerrar, cuenta, onListo }: { abierto: boolean; onCerrar: () => void; cuenta: CuentaVista | null; onListo: () => void }) {
  const [real, setReal] = useState(''); const [fecha, setFecha] = useState(''); const [nota, setNota] = useState('');
  const [resultado, setResultado] = useState<{ saldoSistema: number; diferencia: number } | null>(null);
  const { guardando, error, setError } = useEnvio(onListo, onCerrar);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (!abierto) return; setReal(''); setFecha(hoy()); setNota(''); setResultado(null); }, [abierto]);
  if (!cuenta) return null;
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setError(null);
    try {
      const j = await enviar({ accion: 'arqueo', cuenta_id: cuenta.id, saldo_real: Number(real), fecha, nota });
      setResultado({ saldoSistema: Number(j.saldoSistema), diferencia: Number(j.diferencia) });
      onListo();
    } catch (er) { setError((er as Error).message); } finally { setEnviando(false); }
  };
  return (
    <ModalBase abierto={abierto} onCerrar={onCerrar} titulo={`Verificar saldo · ${cuenta.nombre}`} subtitulo="Compara lo que hay de verdad (la app, el banco, el conteo) con lo que dice el sistema"
      icono={<Scale className="h-5 w-5" />} tinteIcono="bg-primary/10 text-primary" ancho="md">
      {resultado ? (
        <div className="space-y-3 text-[13px]">
          <div className={`rounded-xl border p-3 ${Math.abs(resultado.diferencia) < 0.01 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
            <p className="text-[14px] font-black">{Math.abs(resultado.diferencia) < 0.01 ? 'Cuadra: el saldo del sistema es el real' : `Diferencia de ${dinero(resultado.diferencia, cuenta.moneda)}`}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Real: {dinero(Number(real), cuenta.moneda)} · Sistema: {dinero(resultado.saldoSistema, cuenta.moneda)}</p>
            {Math.abs(resultado.diferencia) >= 0.01 && <p className="mt-1 text-[12px]">{resultado.diferencia > 0 ? 'Hay más dinero del que dice el sistema: falta registrar una entrada.' : 'Hay menos dinero del que dice el sistema: falta registrar una salida.'} Registra el movimiento que falta o ajusta el saldo inicial.</p>}
          </div>
          <div className="flex justify-end"><button type="button" onClick={onCerrar} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">Listo</button></div>
        </div>
      ) : (
        <form className="space-y-4 text-[13px]" onSubmit={guardar}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={etiqueta}>Saldo real ({cuenta.moneda === 'USD' ? '$' : 'Bs'})</label>
              <input type="number" step="0.01" value={real} onChange={e => setReal(e.target.value)} className={`${campo} font-bold tabular-nums`} required /></div>
            <div><label className={etiqueta}>Al final del día</label>
              <input type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} className={campo} required /></div>
          </div>
          <div><label className={etiqueta}>Nota (opcional)</label>
            <input type="text" value={nota} onChange={e => setNota(e.target.value)} className={campo} placeholder="Ej. Visto en la app de Binance a las 6 p. m." /></div>
          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button type="button" onClick={onCerrar} disabled={enviando || guardando} className="rounded-xl border border-border px-4 py-2 font-semibold hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={enviando} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Comparar y guardar
            </button>
          </div>
        </form>
      )}
    </ModalBase>
  );
}

// ── Anular un movimiento ─────────────────────────────────────────────────────
export function ModalAnular({ abierto, onCerrar, movimiento, onListo }: {
  abierto: boolean; onCerrar: () => void; movimiento: { id: string; concepto: string; monto: number } | null; onListo: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const { guardando, error, ejecutar } = useEnvio(onListo, onCerrar);
  useEffect(() => { if (abierto) setMotivo(''); }, [abierto]);
  if (!movimiento) return null;
  return (
    <ModalBase abierto={abierto} onCerrar={onCerrar} titulo="Anular movimiento" subtitulo="No se borra: queda tachado, con quién lo anuló y por qué"
      icono={<Ban className="h-5 w-5" />} tinteIcono="bg-red-500/10 text-red-600" ancho="md">
      <form className="space-y-4 text-[13px]" onSubmit={e => { e.preventDefault(); void ejecutar(() => enviar({ accion: 'anular_movimiento', id: movimiento.id, motivo })); }}>
        <p className="rounded-xl border border-border bg-muted/40 p-2.5 text-[12px]"><strong>{movimiento.concepto}</strong> · {movimiento.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
        <div><label className={etiqueta}>Motivo</label>
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} placeholder="Ej. Se registró dos veces" required /></div>
        <Pie error={error} guardando={guardando} texto="Anular" onCerrar={onCerrar} />
      </form>
    </ModalBase>
  );
}
