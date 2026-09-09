'use client';

import MetodoPagoPanel from '@/components/pos/MetodoPagoPanel';
import { emptyBins, type Bins, type BankBin } from '@/lib/reporte/ventas-mapping';

/**
 * Captura del cobro para la orden de servicio y el modal de cobro.
 *
 * Es literalmente el panel del punto de venta: los mismos nueve métodos, los
 * mismos montos por banco y el mismo resumen. Antes esta pantalla tenía su
 * propia versión —una rejilla estrecha con los nombres recortados a "PM…" y
 * "P.B…"— y no había forma de saber en cuál de las seis cuentas caía el dinero.
 * Dos diseños para registrar lo mismo es también dos sitios donde equivocarse.
 *
 * Lo único que no trae es el simulador de cuotas de Cashea, que vive en el POS
 * porque es allí donde se calculan la inicial y las cuotas. Cashea sigue estando
 * como método: se elige y se escribe su monto igual que cualquier otro.
 */

interface Props {
  bins: Bins;
  onBinsChange: (bins: Bins) => void;
  /** Monto objetivo a cobrar en USD (normalmente el total con IVA). */
  totalUSD: number;
  tasa: number;
  /**
   * Deja elegir con qué tasa se convierte lo cobrado en bolívares (BCV,
   * Binance P2P o una escrita a mano). Sin esto el panel da por hecho el BCV,
   * que es justo lo que descuadraba el reporte cuando se cobró al paralelo.
   */
  onTasaChange?: (v: number | null) => void;
  tasaAuto?: number;
  className?: string;
  /** El anfitrión ya pone su propio encabezado. */
  conCabecera?: boolean;
  /** Bins a ocultar (siguen contando en los totales). */
  hideBins?: BankBin[];
}

export default function DesglosePagoBancos({
  bins, onBinsChange, totalUSD, tasa, onTasaChange, tasaAuto,
  className, conCabecera = false, hideBins = [],
}: Props) {
  // Un bin oculto no debe quedar con dinero dentro: sería plata registrada que
  // nadie puede ver ni corregir desde esta pantalla.
  const limpios = hideBins.length === 0
    ? bins
    : (Object.keys(bins) as BankBin[]).reduce(
      (acc, k) => ({ ...acc, [k]: hideBins.includes(k) ? 0 : bins[k] }),
      emptyBins(),
    );

  return (
    <MetodoPagoPanel
      bins={limpios}
      onBinsChange={onBinsChange}
      totalUSD={totalUSD}
      subtotalUSD={totalUSD}
      tasa={tasa}
      tasaAuto={tasaAuto}
      customRate={onTasaChange ? (tasa || null) : null}
      onCustomRate={onTasaChange}
      conCabecera={conCabecera}
      // El anfitrión ya dibuja la tarjeta y su encabezado; el panel no repite
      // el marco ni abre un scroll propio dentro del modal.
      desplazable={false}
      className={className ?? 'border-none'}
    />
  );
}
