'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Trash2, Wallet } from 'lucide-react';
import ModalBase, { BotonPrincipal, BotonSecundario, Campo, CLASE_INPUT } from '@/components/ui/modales/ModalBase';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';
import { uploadComprobante } from '@/lib/comprobante';
import { avisarCambio } from '@/lib/use-refrescar';
import { cn } from '@/lib/utils';
import type { Deuda } from '@/lib/proveedores/pagos';

/**
 * Pagar (o abonar) a un proveedor.
 *
 * Tres maneras, porque así se le paga de verdad a un proveedor:
 *   · General: «le di $300 a Repuestos X» — se reparte solo, lo que vence antes primero.
 *   · A deudas elegidas: las de un carro, un cliente, o las que se marquen (cada una con
 *     su monto o completa).
 *   · Con su saldo a favor: lo que sobró de un pago anterior, sin que salga dinero hoy.
 *
 * La vista previa la calcula el servidor con la MISMA función que aplica el pago, así lo
 * que se ve antes de confirmar es exactamente lo que queda guardado.
 */

export interface GrupoProveedor {
  proveedor: string; proveedor_id: string | null; saldo: number; vencido: number; saldoFavor: number; deudas: Deuda[];
}
export interface PagoConSaldo { id: string; fecha: string; saldo_favor_usd: number }

type Modo = 'general' | 'dirigido' | 'saldo_favor';
interface Fila { cuenta: string; monto: string }
interface Aplic { origen: string; id: string; monto: number; saldoAntes: number; saldoDespues: number; concepto: string; placa: string | null }

/** Las cuentas desde las que se le paga a un proveedor (un punto de venta solo recibe; Cashea no paga). */
const CUENTAS = BANK_METHODS.filter(m => m.id !== 'cashea' && m.id !== 'punto_banesco');
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const usd = (x: number) => `$${(Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bs = (x: number) => `Bs ${(Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const fechaCorta = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
/** «1.208.000,50» (con coma decimal) o «1208000.50»: con coma, los puntos son de miles. */
const numero = (t: string) => {
  const x = String(t).replace(/\s/g, '');
  return Number(x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x) || 0;
};
const clave = (d: Deuda) => `${d.origen}:${d.id}`;

export default function ModalPagoProveedor({ grupo, preseleccion, modoInicial, pagosConSaldo, onCerrar, onHecho }: {
  grupo: GrupoProveedor;
  /** Deudas ya marcadas al abrir (p. ej. «pagar las de este carro»). */
  preseleccion?: string[];
  modoInicial?: Modo;
  pagosConSaldo: PagoConSaldo[];
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [modo, setModo] = useState<Modo>(modoInicial || (preseleccion?.length ? 'dirigido' : 'general'));
  const [elegidas, setElegidas] = useState<Record<string, string>>(() => Object.fromEntries((preseleccion || []).map(k => [k, ''])));
  const [fecha, setFecha] = useState(hoy());
  const [tasa, setTasa] = useState('');
  const [tasaInfo, setTasaInfo] = useState('');
  const [filas, setFilas] = useState<Fila[]>([{ cuenta: 'pago_movil_banesco', monto: '' }]);
  const [origenSaldo, setOrigenSaldo] = useState(pagosConSaldo[0]?.id || '');
  const [montoSaldo, setMontoSaldo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [nota, setNota] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<{ montoUsd: number; aplicaciones: Aplic[]; sobrante: number } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<{ monto: number; aplicaciones: Aplic[]; sobrante: number; errores: string[] } | null>(null);
  const [filtroPlaca, setFiltroPlaca] = useState('');

  // La tasa del día del pago (la de ese día, no la de hoy).
  useEffect(() => {
    let vivo = true;
    fetch(`/api/tasas?fecha=${fecha}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (!vivo || !d?.bcv) return;
      setTasa(String(d.bcv)); setTasaInfo(d.aproximada ? `tasa más cercana (${d.fecha})` : `BCV del ${fechaCorta(d.fecha)}`);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [fecha]);

  const t = numero(tasa);
  const placas = useMemo(() => [...new Set(grupo.deudas.map(d => d.placa).filter(Boolean) as string[])].sort(), [grupo.deudas]);
  const visibles = grupo.deudas.filter(d => !filtroPlaca || d.placa === filtroPlaca);
  const deudasElegidas = grupo.deudas.filter(d => clave(d) in elegidas);
  const objetivo = modo === 'general' ? grupo.saldo
    : r2(deudasElegidas.reduce((s, d) => s + (numero(elegidas[clave(d)]) > 0 ? Math.min(numero(elegidas[clave(d)]), d.saldo) : d.saldo), 0));
  const totalUsd = modo === 'saldo_favor' ? r2(numero(montoSaldo) || (pagosConSaldo.find(p => p.id === origenSaldo)?.saldo_favor_usd ?? 0))
    : r2(filas.reduce((s, f) => {
      const m = CUENTAS.find(c => c.id === f.cuenta); const x = numero(f.monto);
      return s + (m?.moneda === 'Bs' ? (t > 0 ? x / t : 0) : x);
    }, 0));
  const hayBs = filas.some(f => numero(f.monto) > 0 && CUENTAS.find(c => c.id === f.cuenta)?.moneda === 'Bs');

  const cuerpo = () => ({
    proveedor: grupo.proveedor, proveedor_id: grupo.proveedor_id, modo,
    objetivos: modo === 'general' ? undefined : Object.fromEntries(Object.entries(elegidas).map(([k, v]) => [k, numero(v) > 0 ? numero(v) : null])),
    metodos_pago: modo === 'saldo_favor' ? {} : Object.fromEntries(filas.filter(f => numero(f.monto) > 0).map(f => [f.cuenta, numero(f.monto)])),
    tasa: t, fecha, origen_pago_id: modo === 'saldo_favor' ? origenSaldo : null, monto_usd: modo === 'saldo_favor' ? totalUsd : undefined,
  });

  // Vista previa: el servidor reparte con la misma regla que aplicará.
  const ultima = useRef(0);
  useEffect(() => {
    if (hecho) return;
    if (!(totalUsd > 0) || (modo !== 'general' && !deudasElegidas.length && modo === 'dirigido')) { setPrevia(null); return; }
    const yo = ++ultima.current; setCalculando(true);
    const h = setTimeout(async () => {
      try {
        const r = await fetch('/api/proveedores/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'previa', ...cuerpo() }) });
        const d = await r.json();
        if (yo === ultima.current) setPrevia(r.ok ? d : null);
      } finally { if (yo === ultima.current) setCalculando(false); }
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cuerpo` se arma con estas mismas piezas
  }, [modo, JSON.stringify(elegidas), JSON.stringify(filas), tasa, origenSaldo, montoSaldo, hecho]);

  /** Llena la primera cuenta con lo que falta para cubrir lo elegido. */
  const pagarTodo = () => {
    const falta = r2(objetivo - totalUsd + (filas[0] ? (CUENTAS.find(c => c.id === filas[0].cuenta)?.moneda === 'Bs' ? (t > 0 ? numero(filas[0].monto) / t : 0) : numero(filas[0].monto)) : 0));
    if (!(falta > 0)) return;
    const m = CUENTAS.find(c => c.id === filas[0]?.cuenta);
    const monto = m?.moneda === 'Bs' ? r2(falta * t) : falta;
    setFilas(fs => fs.map((f, i) => (i === 0 ? { ...f, monto: String(monto) } : f)));
  };

  const confirmar = async () => {
    setError('');
    if (modo !== 'saldo_favor' && hayBs && !(t > 0)) { setError('Falta la tasa del día para la parte en bolívares.'); return; }
    if (!(totalUsd > 0)) { setError('Escribe cuánto se pagó y desde qué cuenta.'); return; }
    if (modo === 'dirigido' && !deudasElegidas.length) { setError('Marca a qué deudas va el pago.'); return; }
    if (modo !== 'saldo_favor' && !referencia.trim() && filas.some(f => numero(f.monto) > 0 && !['dolares', 'efectivo_bs'].includes(f.cuenta))) {
      setError('Escribe la referencia de la transferencia: es lo que la conciliación cruza con el banco.'); return;
    }
    setGuardando(true);
    try {
      const comprobante_url = archivo ? await uploadComprobante(archivo) : null;
      if (archivo && !comprobante_url) throw new Error('No se pudo subir el comprobante. Prueba otra vez o guarda sin él.');
      const r = await fetch('/api/proveedores/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: modo === 'saldo_favor' ? 'usar_saldo' : 'pagar', ...cuerpo(), referencia: referencia.trim() || null, nota: nota.trim() || null, comprobante_url,
          criterio: modo === 'dirigido' ? { placa: filtroPlaca || null, deudas: deudasElegidas.length } : null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo registrar el pago.');
      setHecho({ monto: Number(d.pago?.monto_usd) || totalUsd, aplicaciones: d.aplicaciones || [], sobrante: Number(d.sobrante) || 0, errores: d.errores || [] });
      avisarCambio();
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
    } finally { setGuardando(false); }
  };

  if (hecho) {
    return (
      <ModalBase abierto onCerrar={onCerrar} titulo="Pago registrado" subtitulo={grupo.proveedor} icono={<CheckCircle2 className="h-5 w-5" aria-hidden />} tinteIcono="bg-emerald-50 text-emerald-600" ancho="lg"
        pie={<BotonPrincipal tono="verde" onClick={onCerrar}>Listo</BotonPrincipal>}>
        <div className="space-y-3 text-[13px] text-[#16181d]">
          <p><b>{usd(hecho.monto)}</b> aplicados a <b>{hecho.aplicaciones.length}</b> deuda(s).{hecho.sobrante > 0 && <> Quedan <b>{usd(hecho.sobrante)}</b> como saldo a favor con el proveedor.</>}</p>
          <TablaAplicaciones filas={hecho.aplicaciones} />
          {hecho.errores.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-700">
              No se pudo aplicar a: {hecho.errores.join(' · ')}. El resto quedó guardado; revisa esas deudas.
            </div>
          )}
          <p className="text-[11.5px] text-[#5b616e]">Ya se ve en la ficha de cada carro, en Gastos, en el flujo de caja de la cuenta y en la conciliación del banco del día {fechaCorta(fecha)}.</p>
        </div>
      </ModalBase>
    );
  }

  const modos: { id: Modo; label: string; ayuda: string }[] = [
    { id: 'general', label: 'Abono general', ayuda: 'Se reparte solo: lo que vence antes, primero.' },
    { id: 'dirigido', label: 'A deudas elegidas', ayuda: 'Las de un carro, un cliente o las que marques.' },
    ...(grupo.saldoFavor > 0 ? [{ id: 'saldo_favor' as const, label: `Usar saldo a favor (${usd(grupo.saldoFavor)})`, ayuda: 'Sin sacar dinero hoy: se usa lo que sobró antes.' }] : []),
  ];

  return (
    <ModalBase abierto onCerrar={onCerrar} bloqueado={guardando} ancho="xl" titulo={`Pagar a ${grupo.proveedor}`}
      subtitulo={`Se le debe ${usd(grupo.saldo)}${grupo.vencido > 0 ? ` · vencido ${usd(grupo.vencido)}` : ''}${grupo.saldoFavor > 0 ? ` · saldo a favor ${usd(grupo.saldoFavor)}` : ''}`}
      icono={<Wallet className="h-5 w-5" aria-hidden />}
      pie={(
        <>
          <BotonSecundario onClick={onCerrar} disabled={guardando}>Cancelar</BotonSecundario>
          <BotonPrincipal onClick={confirmar} disabled={guardando || calculando || !(totalUsd > 0)}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Registrando…' : `Registrar pago de ${usd(totalUsd)}`}
          </BotonPrincipal>
        </>
      )}>
      <div className="space-y-4 text-[#16181d]">
        <div className="grid gap-2 sm:grid-cols-3">
          {modos.map(m => (
            <button key={m.id} type="button" onClick={() => setModo(m.id)}
              className={cn('rounded-xl border px-3 py-2 text-left transition-colors', modo === m.id ? 'border-[#f97316] bg-[#fff7f0]' : 'border-[#e2e5ea] hover:bg-[#f7f8fa]')}>
              <span className="block text-[12.5px] font-bold">{m.label}</span>
              <span className="block text-[11px] text-[#5b616e]">{m.ayuda}</span>
            </button>
          ))}
        </div>

        {modo === 'dirigido' && (
          <div className="rounded-xl border border-[#e2e5ea]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e5ea] px-3 py-2 text-[12px]">
              <span className="font-semibold">Deudas</span>
              {placas.length > 0 && (
                <select value={filtroPlaca} onChange={e => setFiltroPlaca(e.target.value)} className="h-7 rounded-md border border-[#e2e5ea] px-2 text-[12px]">
                  <option value="">Todos los carros</option>
                  {placas.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              <button type="button" className="rounded-md border border-[#e2e5ea] px-2 py-0.5 hover:bg-[#f7f8fa]"
                onClick={() => setElegidas(e => ({ ...e, ...Object.fromEntries(visibles.map(d => [clave(d), e[clave(d)] ?? ''])) }))}>Marcar las visibles</button>
              <button type="button" className="rounded-md border border-[#e2e5ea] px-2 py-0.5 hover:bg-[#f7f8fa]"
                onClick={() => setElegidas(Object.fromEntries(grupo.deudas.filter(d => d.vencida).map(d => [clave(d), ''])))}>Solo lo vencido</button>
              <button type="button" className="rounded-md px-2 py-0.5 text-[#5b616e] hover:bg-[#f7f8fa]" onClick={() => setElegidas({})}>Quitar todas</button>
              <span className="ml-auto text-[#5b616e]">Elegido: <b className="text-[#16181d]">{usd(objetivo)}</b></span>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {visibles.map(d => {
                const k = clave(d); const on = k in elegidas;
                return (
                  <label key={k} className={cn('flex items-center gap-2.5 border-b border-[#f0f1f4] px-3 py-1.5 text-[12px] last:border-0', on && 'bg-[#fff7f0]')}>
                    <input type="checkbox" checked={on} onChange={() => setElegidas(e => { const n = { ...e }; if (on) delete n[k]; else n[k] = ''; return n; })} />
                    <span className="w-11 shrink-0 tabular-nums text-[#5b616e]">{fechaCorta(d.fecha)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.concepto}</span>
                      <span className="block truncate text-[10.5px] text-[#5b616e]">
                        {[d.placa, d.cliente, d.origen === 'partida' ? 'ficha del carro' : 'compra suelta'].filter(Boolean).join(' · ')}
                        {d.vencida && <span className="font-semibold text-red-600"> · vencida {fechaCorta(d.vence)}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-bold tabular-nums">{usd(d.saldo)}{d.pagado > 0 && <span className="block text-[10px] font-normal text-[#5b616e]">de {usd(d.total)}</span>}</span>
                    {on && (
                      <input inputMode="decimal" placeholder="completa" value={elegidas[k]} onChange={e => setElegidas(x => ({ ...x, [k]: e.target.value }))}
                        className="h-7 w-[84px] shrink-0 rounded-md border border-[#e2e5ea] px-2 text-right text-[12px] tabular-nums" aria-label="Monto a esta deuda en dólares" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {modo === 'saldo_favor' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="De qué pago sale el saldo">
              <select value={origenSaldo} onChange={e => setOrigenSaldo(e.target.value)} className={CLASE_INPUT}>
                {pagosConSaldo.map(p => <option key={p.id} value={p.id}>Pago del {fechaCorta(p.fecha)} · queda {usd(p.saldo_favor_usd)}</option>)}
              </select>
            </Campo>
            <Campo label="Cuánto usar ($) — vacío = todo">
              <input inputMode="decimal" value={montoSaldo} onChange={e => setMontoSaldo(e.target.value)} className={CLASE_INPUT} placeholder={String(pagosConSaldo.find(p => p.id === origenSaldo)?.saldo_favor_usd ?? '')} />
            </Campo>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Fecha del pago" obligatorio>
                <input type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} className={CLASE_INPUT} />
              </Campo>
              <Campo label={`Tasa (Bs por $)${tasaInfo ? ` · ${tasaInfo}` : ''}`} obligatorio={hayBs}>
                <input inputMode="decimal" value={tasa} onChange={e => setTasa(e.target.value)} className={CLASE_INPUT} />
              </Campo>
              <Campo label="Referencia">
                <input value={referencia} onChange={e => setReferencia(e.target.value)} className={CLASE_INPUT} placeholder="últimos dígitos de la transferencia" />
              </Campo>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11.5px] font-medium text-[#5b616e]">
                <span>De qué cuenta salió (en la moneda de la cuenta)</span>
                <span className="flex gap-2">
                  <button type="button" onClick={pagarTodo} className="rounded-md border border-[#e2e5ea] px-2 py-0.5 text-[#16181d] hover:bg-[#f7f8fa]">Pagar {usd(objetivo)}</button>
                  <button type="button" onClick={() => setFilas(f => [...f, { cuenta: 'zelle', monto: '' }])} className="flex items-center gap-1 rounded-md border border-[#e2e5ea] px-2 py-0.5 text-[#16181d] hover:bg-[#f7f8fa]"><Plus className="h-3 w-3" aria-hidden />Otra cuenta</button>
                </span>
              </div>
              {filas.map((f, i) => {
                const m = CUENTAS.find(c => c.id === f.cuenta); const x = numero(f.monto);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select value={f.cuenta} onChange={e => setFilas(fs => fs.map((y, j) => (j === i ? { ...y, cuenta: e.target.value } : y)))} className={cn(CLASE_INPUT, 'flex-1')}>
                      {CUENTAS.map(c => <option key={c.id} value={c.id}>{c.label} ({c.moneda})</option>)}
                    </select>
                    <input inputMode="decimal" value={f.monto} onChange={e => setFilas(fs => fs.map((y, j) => (j === i ? { ...y, monto: e.target.value } : y)))}
                      className={cn(CLASE_INPUT, 'w-[150px] text-right tabular-nums')} placeholder={m?.moneda === 'Bs' ? 'Bs' : '$'} aria-label={`Monto en ${m?.moneda}`} />
                    <span className="w-[90px] shrink-0 text-right text-[11.5px] tabular-nums text-[#5b616e]">{m?.moneda === 'Bs' ? (t > 0 ? `≈ ${usd(x / t)}` : 'sin tasa') : ''}</span>
                    {filas.length > 1 && (
                      <button type="button" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-[#5b616e] hover:bg-red-50 hover:text-red-600" aria-label="Quitar esta cuenta"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Comprobante (foto o PDF)">
                <input type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] || null)} className="block w-full text-[12px]" />
              </Campo>
              <Campo label="Nota">
                <input value={nota} onChange={e => setNota(e.target.value)} className={CLASE_INPUT} placeholder="opcional" />
              </Campo>
            </div>
          </>
        )}

        <div className="rounded-xl border border-[#e2e5ea] bg-[#f7f8fa] p-3">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="font-bold">Así queda {calculando && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" aria-hidden />}</span>
            <span className="tabular-nums">Pago: <b>{usd(totalUsd)}</b>{hayBs && t > 0 && <span className="text-[#5b616e]"> · {bs(totalUsd * t)} a {t}</span>}</span>
          </div>
          {!previa ? (
            <p className="text-[12px] text-[#5b616e]">Escribe el monto para ver a qué deudas va.</p>
          ) : (
            <>
              <TablaAplicaciones filas={previa.aplicaciones} />
              {previa.sobrante > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">
                  Sobran <b>{usd(previa.sobrante)}</b>: quedan como <b>saldo a favor</b> con {grupo.proveedor} para la próxima compra.
                </p>
              )}
            </>
          )}
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}
      </div>
    </ModalBase>
  );
}

function TablaAplicaciones({ filas }: { filas: Aplic[] }) {
  if (!filas.length) return <p className="text-[12px] text-[#5b616e]">No va a ninguna deuda.</p>;
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10.5px] text-[#5b616e]">
          <th className="py-1 font-semibold">Deuda</th><th className="py-1 text-right font-semibold">Debía</th>
          <th className="py-1 text-right font-semibold">Se paga</th><th className="py-1 text-right font-semibold">Queda</th>
        </tr>
      </thead>
      <tbody>
        {filas.map(a => (
          <tr key={`${a.origen}:${a.id}`} className="border-t border-[#e2e5ea]">
            <td className="py-1 pr-2"><span className="font-medium">{a.concepto}</span>{a.placa && <span className="ml-1.5 rounded bg-[#16181d] px-1 text-[9.5px] font-bold text-white">{a.placa}</span>}</td>
            <td className="py-1 text-right tabular-nums">{usd(a.saldoAntes)}</td>
            <td className="py-1 text-right font-bold tabular-nums text-emerald-700">{usd(a.monto)}</td>
            <td className="py-1 text-right tabular-nums">{a.saldoDespues > 0.009 ? usd(a.saldoDespues) : <span className="font-semibold text-emerald-700">pagada</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
