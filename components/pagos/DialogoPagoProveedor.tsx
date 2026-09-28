'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Car, CheckCircle2, Loader2, X } from 'lucide-react';
import DesglosePagoBancos from '@/components/pos/DesglosePagoBancos';
import { binsTotalUSD, emptyBins, type Bins } from '@/lib/reporte/ventas-mapping';
import { soloConDinero } from '@/lib/pagos/desglose';

/**
 * Pagarle a un proveedor: cuánto, y de qué cuenta sale.
 *
 * «Ya pagué» marcaba la deuda como saldada sin preguntar de dónde salió el
 * dinero: el gasto quedaba asentado, pero ningún saldo de banco bajaba y
 * Finanzas no cuadraba con el estado de cuenta. Aquí se abre el mismo panel de
 * métodos del punto de venta —efectivo, pago móvil por banco, Zelle, Binance,
 * mixto— y no se confirma hasta que lo pagado cubre la deuda.
 *
 * Lo usan la alerta de pagos vencidos y el botón de pagar de la ficha.
 */

interface Props {
  proveedor: string;
  concepto: string;
  placa?: string | null;
  /** Lo que falta por pagar, en dólares. */
  montoUSD: number;
  /** Lo que ya se abonó antes, para decirlo. */
  abonadoUSD?: number;
  vence?: string | null;
  onCancelar: () => void;
  /** Recibe las cuentas en su moneda y la tasa con la que se convirtieron. */
  onConfirmar: (pago: { metodos_pago: Partial<Bins>; tasa: number }) => Promise<void>;
}

const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

export default function DialogoPagoProveedor({
  proveedor, concepto, placa, montoUSD, abonadoUSD = 0, vence, onCancelar, onConfirmar,
}: Props) {
  const [bins, setBins] = useState<Bins>(emptyBins());
  const [tasaManual, setTasaManual] = useState<number | null>(null);
  const [tasaDia, setTasaDia] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/rates').then(r => r.json()).then(d => setTasaDia(Number(d?.bcv) || 0)).catch(() => {});
  }, []);

  // Esc cierra, como cualquier otro diálogo.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !guardando) onCancelar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [guardando, onCancelar]);

  const tasa = tasaManual || tasaDia || 0;
  const pagado = binsTotalUSD(bins, tasa);
  const margen = Math.max(0.05, montoUSD * 0.01);
  const cubre = Math.abs(pagado - montoUSD) <= margen;

  const confirmar = async () => {
    setError('');
    const reparto = soloConDinero(bins);
    if (!reparto) { setError('Elige de qué cuenta salió el pago.'); return; }
    if (!cubre) {
      setError(pagado < montoUSD
        ? `Faltan ${usd(montoUSD - pagado)} para cubrir la deuda. Si solo abonaste una parte, regístralo como «Abonado a medias» desde la ficha o Egresos.`
        : `Lo pagado (${usd(pagado)}) pasa de la deuda (${usd(montoUSD)}). Revisa el monto.`);
      return;
    }
    setGuardando(true);
    try {
      await onConfirmar({ metodos_pago: reparto, tasa });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="pago-prov-titulo">
      <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id="pago-prov-titulo" className="text-[15px] font-extrabold text-[#16181d]">Pagarle a {proveedor}</h2>
            <p className="truncate text-[12px] text-[#5b616e]">{concepto}</p>
            {placa && (
              <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#2563eb]">
                <Car className="h-3.5 w-3.5" aria-hidden /><span className="num font-semibold">{placa}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onCancelar} disabled={guardando} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <dl className="grid grid-cols-3 gap-2 border-b border-[#eef0f3] bg-[#fafbfc] px-5 py-3 text-[12px]">
            <div>
              <dt className="text-[#8a909c]">A pagar ahora</dt>
              <dd className="num text-[16px] font-extrabold text-[#dc2626]">{usd(montoUSD)}</dd>
            </div>
            <div>
              <dt className="text-[#8a909c]">Ya abonado</dt>
              <dd className="num text-[14px] font-bold text-[#16181d]">{usd(abonadoUSD)}</dd>
            </div>
            <div>
              <dt className="text-[#8a909c]">{vence ? 'Vencía' : 'Tasa'}</dt>
              <dd className="num text-[14px] font-bold text-[#16181d]">
                {vence ? vence.split('-').reverse().join('/') : tasa ? `${tasa.toLocaleString('es-VE')} Bs/$` : '—'}
              </dd>
            </div>
          </dl>

          <DesglosePagoBancos
            bins={bins}
            onBinsChange={setBins}
            totalUSD={montoUSD}
            tasa={tasa}
            tasaAuto={tasaDia}
            onTasaChange={setTasaManual}
            sentido="pago"
            ocultarMetodos={['cashea']}
            sinPreseleccion
          />

          {error && (
            <p role="alert" className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2.5 text-[12.5px] text-[#b91c1c]">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-[#e8eaed] px-5 py-3.5">
          <p className={`num min-w-0 flex-1 text-[12px] font-semibold ${cubre ? 'text-[#15803d]' : 'text-[#8a909c]'}`}>
            {cubre ? 'Cubre la deuda' : `Pagado ${usd(pagado)} de ${usd(montoUSD)}`}
          </p>
          <button type="button" onClick={onCancelar} disabled={guardando} className="h-[40px] rounded-lg border border-[#e2e5ea] px-4 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando}
            className="flex h-[40px] items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white hover:bg-[#15803d] disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            {guardando ? 'Registrando…' : 'Registrar el pago'}
          </button>
        </footer>
      </div>
    </div>
  );
}
