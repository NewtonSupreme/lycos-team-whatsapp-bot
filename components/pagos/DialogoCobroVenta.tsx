'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Car, CheckCircle2, History, Loader2, X } from 'lucide-react';
import DesglosePagoBancos from '@/components/pos/DesglosePagoBancos';
import { binsTotalUSD, emptyBins, type Bins } from '@/lib/reporte/ventas-mapping';
import { margenCobro } from '@/lib/pagos/cobro';

/**
 * Cobrarle a un cliente lo que debe: un abono o el pago completo.
 *
 * El diálogo de antes pedía un número y restaba el saldo: no decía por dónde
 * entró el dinero ni quedaba el día del cobro. Aquí se elige el método —con
 * Cashea / BNC puesto de entrada, que es por donde entra casi todo lo que se
 * cobra desde este módulo— y el cobro queda con su día, sus cuentas y su
 * rastro en la orden de servicio.
 */

export interface VentaACobrar {
  id: string;
  cliente?: string | null;
  fecha?: string | null;
  placa?: string | null;
  vehiculo_info?: string | null;
  total_ingresos?: number | string | null;
  abono?: number | string | null;
  saldo_pendiente?: number | string | null;
  tasa_cambio?: number | string | null;
  cashea?: number | string | null;
  cashea_pct?: number | null;
}

interface Abono {
  id: string; fecha: string | null; created_at: string; monto: number;
  metodo_pago: string | null; saldo_despues: number | null;
}

interface Props {
  venta: VentaACobrar;
  onCerrar: () => void;
  onCobrado: (r: { liquida: boolean; saldo: number }) => void;
}

const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const fechaVE = (f?: string | null) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');

export default function DialogoCobroVenta({ venta, onCerrar, onCobrado }: Props) {
  const saldo = Number(venta.saldo_pendiente) || 0;
  // Por defecto, el saldo completo por Cashea / BNC.
  const [bins, setBins] = useState<Bins>(() => ({ ...emptyBins(), cashea: Math.round(saldo * 100) / 100 }));
  const [tasaManual, setTasaManual] = useState<number | null>(null);
  const [tasaDia, setTasaDia] = useState(0);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/rates').then(r => r.json()).then(d => setTasaDia(Number(d?.bcv) || 0)).catch(() => {});
    fetch(`/api/ventas/${venta.id}/cobro`).then(r => r.json()).then(d => setAbonos(d.abonos || [])).catch(() => {});
  }, [venta.id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [guardando, onCerrar]);

  const tasa = tasaManual || tasaDia || Number(venta.tasa_cambio) || 0;
  const cobrado = binsTotalUSD(bins, tasa);
  const liquida = cobrado > 0 && saldo - cobrado <= margenCobro(saldo);
  const pasa = cobrado > saldo + margenCobro(saldo);
  const quedara = Math.max(0, Math.round((saldo - cobrado) * 100) / 100);

  const registrar = async () => {
    setError('');
    if (cobrado <= 0) { setError('Indica cuánto se cobró y por dónde.'); return; }
    if (pasa) { setError(`Se cobran ${usd(cobrado)} y solo debe ${usd(saldo)}.`); return; }
    setGuardando(true);
    try {
      const r = await fetch(`/api/ventas/${venta.id}/cobro`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodos_pago: bins, tasa, nota }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo registrar el cobro');
      onCobrado({ liquida: d.cobro.liquida, saldo: d.cobro.saldoDespues });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="cobro-titulo">
      <div className="flex max-h-[94dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id="cobro-titulo" className="text-[15px] font-extrabold text-[#16181d]">Cobrar a {venta.cliente || 'el cliente'}</h2>
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-[#5b616e]">
              <span>Venta del {fechaVE(venta.fecha)}</span>
              {(venta.placa || venta.vehiculo_info) && (
                <span className="flex items-center gap-1">
                  <Car className="h-3.5 w-3.5" aria-hidden />
                  {venta.placa && <strong className="num text-[#2563eb]">{venta.placa}</strong>}
                  {venta.vehiculo_info && <span className="truncate">{venta.vehiculo_info}</span>}
                </span>
              )}
            </p>
          </div>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <dl className="grid grid-cols-3 gap-2 border-b border-[#eef0f3] bg-[#fafbfc] px-5 py-3 text-[12px]">
            <div><dt className="text-[#8a909c]">Total</dt><dd className="num text-[14px] font-bold text-[#16181d]">{usd(Number(venta.total_ingresos))}</dd></div>
            <div><dt className="text-[#8a909c]">Abonado</dt><dd className="num text-[14px] font-bold text-[#16a34a]">{usd(Number(venta.abono))}</dd></div>
            <div><dt className="text-[#8a909c]">Debe</dt><dd className="num text-[16px] font-extrabold text-[#c2410c]">{usd(saldo)}</dd></div>
          </dl>

          {abonos.length > 0 && (
            <div className="border-b border-[#eef0f3] px-5 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-[#5b616e]">
                <History className="h-3.5 w-3.5" aria-hidden /> Cobros anteriores
              </p>
              <ul className="space-y-0.5">
                {abonos.map(a => (
                  <li key={a.id} className="num flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-[#5b616e]">{fechaVE(a.fecha || a.created_at)} · {a.metodo_pago || 'Sin método'}</span>
                    <span className="font-semibold text-[#16a34a]">{usd(a.monto)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DesglosePagoBancos
            bins={bins}
            onBinsChange={setBins}
            totalUSD={saldo}
            tasa={tasa}
            tasaAuto={tasaDia}
            onTasaChange={setTasaManual}
          />

          <label className="block px-5 pb-3">
            <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Nota (opcional)</span>
            <input
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Referencia del pago, cuota de Cashea…"
              className="h-[38px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316]"
            />
          </label>

          {error && (
            <p role="alert" className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2.5 text-[12.5px] text-[#b91c1c]">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />{error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-[#e8eaed] px-5 py-3.5">
          <p className={`num min-w-0 flex-1 text-[12px] font-semibold ${pasa ? 'text-[#dc2626]' : liquida ? 'text-[#15803d]' : 'text-[#c2410c]'}`}>
            {pasa ? 'Pasa de lo que debe' : liquida ? 'Queda saldada' : cobrado > 0 ? `Abono · quedará debiendo ${usd(quedara)}` : 'Indica cuánto se cobra'}
          </p>
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-[40px] rounded-lg border border-[#e2e5ea] px-4 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={registrar}
            disabled={guardando || cobrado <= 0 || pasa}
            className="flex h-[40px] items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            {guardando ? 'Registrando…' : liquida ? 'Cobrar y saldar' : 'Registrar abono'}
          </button>
        </footer>
      </div>
    </div>
  );
}
