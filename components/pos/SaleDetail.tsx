'use client';

import { MoreVertical, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';

interface Linea {
  n: number;
  descripcion: string;
  sub?: string;
  precio: string;
  cant: number;
  desc: string;
  total: string;
}

const LINEAS: readonly Linea[] = [
  { n: 1, descripcion: 'Aceite 5W-30 Mobil 1', sub: '(1 Litro)', precio: 'Bs. 850,00', cant: 1, desc: '0%', total: 'Bs. 850,00' },
  { n: 2, descripcion: 'Filtro de aceite Toyota', precio: 'Bs. 320,00', cant: 1, desc: '0%', total: 'Bs. 320,00' },
  { n: 3, descripcion: 'Cambio de aceite', sub: '(Mano de obra)', precio: 'Bs. 500,00', cant: 1, desc: '0%', total: 'Bs. 500,00' },
];

export default function SaleDetail() {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex items-center gap-2 border-b border-[#e8eaed] px-4 py-3">
        <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Detalle de la venta</h2>
        <button className="flex h-[30px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-2.5 text-[12px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nuevo cliente
        </button>
        <button aria-label="Buscar cliente" className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]">
          <Search className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button aria-label="Más opciones" className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]">
          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* Cliente */}
        <p className="mb-1.5 text-[11.5px] font-medium text-[#5b616e]">Cliente</p>
        <div className="flex items-center gap-2.5 rounded-lg border border-[#e2e5ea] px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[12px] font-bold text-[#5b616e]">
            CM
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-[#16181d]">Carlos Méndez</p>
            <p className="num truncate text-[11.5px] text-[#9ba1ab]">C.I. V-25.123.456 | +58 412 123 4567</p>
          </div>
          <button aria-label="Quitar cliente" className="text-[#9ba1ab] hover:text-[#16181d]">
            <X className="h-4 w-4" aria-hidden />
          </button>
          <button aria-label="Cambiar cliente" className="text-[#9ba1ab] hover:text-[#16181d]">
            <SwapIcon />
          </button>
        </div>

        {/* Vehículo */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Vehículo (opcional)</p>
        <div className="flex items-center gap-2.5 rounded-lg border border-[#e2e5ea] px-3 py-2.5">
          <span className="h-9 w-[52px] shrink-0 rounded-md bg-[#f6f7f9]" aria-hidden />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-[#16181d]">Toyota Corolla 2020</p>
            <p className="num truncate text-[11.5px] text-[#9ba1ab]">Placa: AB123CD | VIN: 9BRB33BE7L1234567</p>
          </div>
          <button aria-label="Quitar vehículo" className="text-[#9ba1ab] hover:text-[#16181d]">
            <X className="h-4 w-4" aria-hidden />
          </button>
          <button aria-label="Buscar vehículo" className="text-[#9ba1ab] hover:text-[#16181d]">
            <Search className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Agregar ítems */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Agrega productos o servicios</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
            <input
              placeholder="Buscar y agregar al carrito..."
              aria-label="Buscar y agregar al carrito"
              className="h-[38px] w-full rounded-lg border border-[#e2e5ea] pl-9 pr-3 text-[12.5px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
            />
          </div>
          <button aria-label="Escanear código" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]">
            <ScanBarcode className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        {/* Líneas */}
        <div className="mt-3 overflow-x-auto rounded-lg border border-[#e8eaed]">
          <table className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr className="border-b border-[#e8eaed] bg-[#fafbfc]">
                {['#', 'Descripción', 'Precio Unit.', 'Cant.', 'Desc.', 'Total', ''].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={`px-2.5 py-2 text-[11px] font-semibold text-[#5b616e] ${i === 0 || i > 2 ? 'text-center' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINEAS.map(l => (
                <tr key={l.n} className="border-b border-[#f0f1f4] last:border-0">
                  <td className="num px-2.5 py-2.5 text-center text-[12px] text-[#9ba1ab]">{l.n}</td>
                  <td className="px-2.5 py-2.5 text-[12.5px] leading-tight text-[#16181d]">
                    {l.descripcion}
                    {l.sub && <span className="block text-[11px] text-[#9ba1ab]">{l.sub}</span>}
                  </td>
                  <td className="num px-2.5 py-2.5 text-[12.5px] text-[#16181d]">{l.precio}</td>
                  <td className="px-2.5 py-2.5 text-center">
                    <input
                      defaultValue={l.cant}
                      aria-label={`Cantidad de ${l.descripcion}`}
                      className="num h-[26px] w-[42px] rounded-md border border-[#e2e5ea] text-center text-[12.5px] outline-none focus:border-[#f97316]"
                    />
                  </td>
                  <td className="num px-2.5 py-2.5 text-center text-[12.5px] text-[#5b616e]">{l.desc}</td>
                  <td className="num px-2.5 py-2.5 text-right text-[12.5px] font-semibold text-[#16181d]">{l.total}</td>
                  <td className="px-2 py-2.5 text-center">
                    <button aria-label={`Quitar ${l.descripcion}`} className="text-[#e05252] hover:text-[#c02f2f]">
                      <Trash2 className="h-[15px] w-[15px]" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="mt-2.5 flex h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#d5d9e0] text-[12.5px] font-medium text-[#5b616e] hover:border-[#f97316] hover:text-[#f97316]">
          <Plus className="h-4 w-4" aria-hidden />
          Agregar más ítems
        </button>

        {/* Notas */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Notas de la venta</p>
        <textarea
          rows={2}
          placeholder="Ej. Observaciones, recomendaciones, etc."
          aria-label="Notas de la venta"
          className="w-full resize-none rounded-lg border border-[#e2e5ea] px-3 py-2 text-[12.5px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
        />

        {/* Totales */}
        <dl className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-[12.5px]">
            <dt className="text-[#5b616e]">Subtotal</dt>
            <dd className="num font-semibold text-[#16181d]">Bs. 1.670,00</dd>
          </div>

          <div className="flex items-center justify-between gap-2 text-[12.5px]">
            <dt className="text-[#5b616e]">Descuento</dt>
            <dd className="flex items-center gap-2">
              <span className="flex items-center rounded-md border border-[#e2e5ea]">
                <input
                  defaultValue={0}
                  aria-label="Descuento en porcentaje"
                  className="num h-[26px] w-[54px] rounded-l-md px-2 text-right text-[12.5px] outline-none focus:border-[#f97316]"
                />
                <span className="px-2 text-[11.5px] text-[#9ba1ab]">%</span>
              </span>
              <span className="num w-[76px] text-right font-semibold text-[#16181d]">Bs. 0,00</span>
            </dd>
          </div>

          <div className="flex items-center justify-between text-[12.5px]">
            <dt className="text-[#5b616e]">IVA (16%)</dt>
            <dd className="num font-semibold text-[#16181d]">Bs. 267,20</dd>
          </div>
        </dl>

        <div className="mt-2.5 rounded-lg bg-[#fff4ec] px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-bold text-[#16181d]">Total a pagar</span>
            <span className="num text-[19px] font-extrabold text-[#16181d]">Bs. 1.937,20</span>
          </div>
          <p className="num mt-0.5 text-right text-[11px] text-[#9ba1ab]">
            ≈ $ 19,37 USD <span className="mx-1 opacity-50">|</span> ≈ 17,60 EUR
          </p>
        </div>
      </div>
    </section>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m7 16 -3-3 3-3" />
      <path d="M4 13h11" />
      <path d="m17 8 3 3-3 3" />
      <path d="M20 11H9" />
    </svg>
  );
}
