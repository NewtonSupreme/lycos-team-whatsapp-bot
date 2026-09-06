'use client';

import { Eraser, FileSpreadsheet, FileText, ShoppingCart } from 'lucide-react';
import PosShell from '@/components/pos/PosShell';
import ProductCatalog from '@/components/pos/ProductCatalog';
import SaleDetail from '@/components/pos/SaleDetail';
import PaymentPanel from '@/components/pos/PaymentPanel';
import PosFooterPanels from '@/components/pos/PosFooterPanels';

/**
 * Nueva venta.
 *
 * Réplica del diseño de referencia. Lleva su propio armazón —barra lateral y
 * superior— en vez del layout general, para que las medidas sean exactamente
 * las del diseño sin alterar las otras pantallas del sistema.
 *
 * Los datos son de muestra: la pantalla existe para fijar el diseño. Donde va
 * una foto de producto o de vehículo queda el hueco reservado con su fondo,
 * así la maqueta no cambia de alto cuando lleguen las imágenes reales.
 */
export default function NuevaVentaPage() {
  return (
    <PosShell>
      {/* Encabezado */}
      <header className="mb-3.5 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
          <ShoppingCart className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[21px] font-extrabold leading-tight tracking-tight text-[#16181d]">
            Nueva Venta
          </h1>
          <p className="text-[12.5px] text-[#8a909c]">
            Registra una nueva venta de productos o servicios de taller.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Cotización
          </button>
          <button className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            <FileText className="h-4 w-4" aria-hidden />
            Nota de entrega
          </button>
          <button className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            <Eraser className="h-4 w-4" aria-hidden />
            Limpiar
          </button>
          <button className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]">
            <ShoppingCart className="h-4 w-4" aria-hidden />
            Finalizar venta
          </button>
        </div>
      </header>

      {/* Tres columnas de trabajo */}
      <div className="mb-3.5 flex flex-col gap-3.5 lg:h-[calc(100dvh-13.5rem)] lg:flex-row">
        <ProductCatalog />
        <SaleDetail />
        <PaymentPanel />
      </div>

      <PosFooterPanels />
    </PosShell>
  );
}
