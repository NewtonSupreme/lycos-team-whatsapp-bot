'use client';

import { useState } from 'react';
import { AlertTriangle, Check, FileDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateReciboNominaPDF } from '@/lib/recibo-nomina-pdf';
import { formatoMonto, type FilaEmpleado, type Moneda } from './tipos';
import type { PayrollLedger } from '@/types';

type Estado = 'pendiente' | 'procesando' | 'listo' | 'error';

interface Props {
  filas: readonly FilaEmpleado[];
  range: { inicio: string; fin: string };
  sedeId: string | null;
  sedeNombre?: string;
  periodoLabel: string;
  moneda: Moneda;
  tasa: number;
  onCerrar: () => void;
  onTerminado: () => void;
}

const METODOS = ['Efectivo USD', 'Efectivo Bs', 'Pago Móvil', 'Zelle', 'Binance', 'Transferencia'] as const;

/**
 * Cierre de nómina del período, empleado por empleado.
 *
 * Va uno a uno y no en paralelo a propósito: cada liquidación marca trabajos
 * como pagados y numera un recibo, así que si una falla las demás ya hechas
 * quedan firmes y se ve exactamente dónde se detuvo. Un lote "todo o nada"
 * sobre dinero ya pagado sería peor.
 */
export default function ProcesarNominaModal({
  filas, range, sedeId, sedeNombre, periodoLabel, moneda, tasa, onCerrar, onTerminado,
}: Props) {
  const candidatos = filas.filter(f => !f.liquidado && (f.neto !== 0 || f.trabajos > 0));

  const [marcados, setMarcados] = useState<readonly string[]>(candidatos.map(f => f.id));
  const [metodo, setMetodo] = useState<string>(METODOS[0]);
  const [nota, setNota] = useState('');
  const [estados, setEstados] = useState<Record<string, { estado: Estado; error?: string; recibo?: PayrollLedger }>>({});
  const [corriendo, setCorriendo] = useState(false);
  const [terminado, setTerminado] = useState(false);

  const money = (n: number) => formatoMonto(n, moneda, tasa);
  const seleccionados = candidatos.filter(f => marcados.includes(f.id));
  const totalSeleccionado = seleccionados.reduce((t, f) => t + f.neto, 0);

  const alternar = (id: string) =>
    setMarcados(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const procesar = async () => {
    setCorriendo(true);
    for (const f of seleccionados) {
      setEstados(s => ({ ...s, [f.id]: { estado: 'procesando' } }));
      try {
        const r = await fetch('/api/nomina/liquidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empleado_id: f.id, inicio: range.inicio, fin: range.fin,
            sede: sedeId, metodo_pago: metodo, nota,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No se pudo liquidar');
        setEstados(s => ({ ...s, [f.id]: { estado: 'listo', recibo: d.ledger } }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error';
        setEstados(s => ({ ...s, [f.id]: { estado: 'error', error: msg } }));
      }
    }
    setCorriendo(false);
    setTerminado(true);
    onTerminado();
  };

  const descargarRecibo = (f: FilaEmpleado) => {
    const l = estados[f.id]?.recibo;
    if (!l) return;
    generateReciboNominaPDF({
      recibo_numero: l.recibo_numero || '',
      empleado_nombre: f.nombre,
      rol: f.earnings.rol,
      periodo_inicio: range.inicio,
      periodo_fin: range.fin,
      sede_nombre: sedeNombre,
      sueldo_base: l.sueldo_base,
      total_comisiones: l.total_comisiones,
      total_overrides: l.total_overrides,
      total_flat: l.total_flat,
      bruto: l.bruto,
      deducciones: l.deducciones,
      total_pagar: l.total_pagar,
      metodo_pago: metodo,
      pagado_por: l.pagado_por,
      nota,
      jobs: (f.earnings.jobs || []).map(j => ({
        fecha: j.fecha, zona: j.zona, tipo_trabajo: j.tipo_trabajo,
        descripcion: j.descripcion, comision_usd: j.comision_usd, es_override: j.es_override,
      })),
    });
  };

  const okCount = Object.values(estados).filter(e => e.estado === 'listo').length;
  const errCount = Object.values(estados).filter(e => e.estado === 'error').length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-[#16181d]">Procesar nómina</h2>
            <p className="num text-[11.5px] text-[#8a909c]">
              {periodoLabel} · {range.inicio} → {range.fin}
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={corriendo}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7] disabled:opacity-40"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {candidatos.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#8a909c]">
              No queda nadie por liquidar en este período.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11.5px] font-medium text-[#5b616e]">Método de pago</span>
                  <select
                    value={metodo}
                    onChange={e => setMetodo(e.target.value)}
                    disabled={corriendo || terminado}
                    className="mt-1 h-[38px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316] disabled:bg-[#f6f7f9]"
                  >
                    {METODOS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11.5px] font-medium text-[#5b616e]">Nota (opcional)</span>
                  <input
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    disabled={corriendo || terminado}
                    className="mt-1 h-[38px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316] disabled:bg-[#f6f7f9]"
                  />
                </label>
              </div>

              <ul className="mt-4 divide-y divide-[#f2f3f5] rounded-lg border border-[#e8eaed]">
                {candidatos.map(f => {
                  const st = estados[f.id]?.estado || 'pendiente';
                  return (
                    <li key={f.id} className="flex items-center gap-2.5 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={marcados.includes(f.id)}
                        onChange={() => alternar(f.id)}
                        disabled={corriendo || terminado}
                        aria-label={`Incluir a ${f.nombre}`}
                        className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
                      />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{f.nombre}</span>
                        <span className="num block text-[11px] text-[#9ba1ab]">
                          {f.trabajos} trabajo{f.trabajos === 1 ? '' : 's'}
                          {f.deducciones > 0 && ` · - ${money(f.deducciones)} en adelantos`}
                        </span>
                      </span>
                      <span className="num shrink-0 text-[12.5px] font-bold text-[#16181d]">{money(f.neto)}</span>

                      <span className="w-[26px] shrink-0 text-right">
                        {st === 'procesando' && <Loader2 className="ml-auto h-4 w-4 animate-spin text-[#f97316]" aria-hidden />}
                        {st === 'listo' && <Check className="ml-auto h-4 w-4 text-[#16a34a]" aria-label="Liquidado" />}
                        {st === 'error' && <AlertTriangle className="ml-auto h-4 w-4 text-[#dc2626]" aria-label="Falló" />}
                      </span>

                      {st === 'listo' && (
                        <button
                          onClick={() => descargarRecibo(f)}
                          aria-label={`Descargar recibo de ${f.nombre}`}
                          className="shrink-0 rounded-md p-1 text-[#5b616e] hover:bg-[#f4f5f7]"
                        >
                          <FileDown className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {Object.entries(estados).filter(([, v]) => v.estado === 'error').map(([id, v]) => {
                const f = candidatos.find(c => c.id === id);
                return (
                  <p key={id} className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[#dc2626]">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                    {f?.nombre}: {v.error}
                  </p>
                );
              })}
            </>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-[#e8eaed] px-5 py-3.5">
          <p className="num min-w-0 flex-1 text-[12px] text-[#5b616e]">
            {terminado
              ? `${okCount} liquidada${okCount === 1 ? '' : 's'}${errCount ? ` · ${errCount} con error` : ''}`
              : `${seleccionados.length} seleccionado${seleccionados.length === 1 ? '' : 's'} · ${money(totalSeleccionado)}`}
          </p>

          <button
            onClick={onCerrar}
            disabled={corriendo}
            className="h-[38px] rounded-lg border border-[#e2e5ea] px-3.5 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-40"
          >
            {terminado ? 'Cerrar' : 'Cancelar'}
          </button>

          {!terminado && (
            <button
              onClick={procesar}
              disabled={corriendo || seleccionados.length === 0}
              className={cn(
                'flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]',
                'disabled:cursor-not-allowed disabled:opacity-45',
              )}
            >
              {corriendo && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {corriendo ? 'Liquidando…' : `Liquidar ${seleccionados.length}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
