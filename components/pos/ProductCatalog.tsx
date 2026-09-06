'use client';

import { useState } from 'react';
import { ChevronDown, Plus, ScanBarcode, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Producto {
  nombre: string;
  marca: string;
  bs: string;
  usd: string;
}

const PRODUCTOS: readonly Producto[] = [
  { nombre: 'Aceite 5W-30', marca: 'Mobil 1', bs: 'Bs. 850,00', usd: '$ 8,50' },
  { nombre: 'Filtro de aceite', marca: 'Toyota', bs: 'Bs. 320,00', usd: '$ 3,20' },
  { nombre: 'Pastillas de freno', marca: 'Brembo', bs: 'Bs. 1.250,00', usd: '$ 12,50' },
  { nombre: 'Discos de freno', marca: '(Delanteros)', bs: 'Bs. 2.180,00', usd: '$ 21,80' },
  { nombre: 'Batería 12V', marca: 'LTH 60Ah', bs: 'Bs. 3.980,00', usd: '$ 39,80' },
  { nombre: 'Filtro de aire', marca: 'K&N', bs: 'Bs. 420,00', usd: '$ 4,20' },
  { nombre: 'Líquido de frenos', marca: 'DOT 4', bs: 'Bs. 180,00', usd: '$ 1,80' },
  { nombre: 'Amortiguador', marca: 'Monroe', bs: 'Bs. 1.950,00', usd: '$ 19,50' },
  { nombre: 'Bujía NGK', marca: 'Iridium', bs: 'Bs. 220,00', usd: '$ 2,20' },
];

const CATEGORIAS = ['Todos', 'Aceites', 'Filtros', 'Frenos', 'Suspensión', 'Eléctrico'] as const;

export default function ProductCatalog() {
  const [pestana, setPestana] = useState<'productos' | 'servicios'>('productos');
  const [categoria, setCategoria] = useState<string>('Todos');

  return (
    <section className="flex w-full flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:w-[400px] lg:shrink-0">
      {/* Pestañas */}
      <div className="flex border-b border-[#e8eaed] px-4" role="tablist">
        {(['productos', 'servicios'] as const).map(p => (
          <button
            key={p}
            role="tab"
            aria-selected={pestana === p}
            onClick={() => setPestana(p)}
            className={cn(
              'relative px-3 py-3 text-[13.5px] font-semibold capitalize transition-colors',
              pestana === p ? 'text-[#f97316]' : 'text-[#8a909c] hover:text-[#16181d]',
            )}
          >
            {p}
            {pestana === p && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#f97316]" />
            )}
          </button>
        ))}
      </div>

      {/* Buscador + lector de código */}
      <div className="flex items-center gap-2 px-4 pb-3 pt-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
          <input
            placeholder="Buscar productos por nombre, código o categoría..."
            aria-label="Buscar productos"
            className="h-[38px] w-full rounded-lg border border-[#e2e5ea] bg-white pl-9 pr-3 text-[12.5px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
        </div>
        <button
          aria-label="Escanear código de barras"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
        >
          <ScanBarcode className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      {/* Categorías */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        {CATEGORIAS.map(c => (
          <button
            key={c}
            onClick={() => setCategoria(c)}
            className={cn(
              'h-[28px] rounded-md px-3 text-[12px] font-medium transition-colors',
              categoria === c
                ? 'bg-[#f97316] text-white'
                : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
            )}
          >
            {c}
          </button>
        ))}
        <button className="flex h-[28px] items-center gap-1 rounded-md bg-[#f2f3f5] px-2.5 text-[12px] font-medium text-[#5b616e] hover:bg-[#e8eaed]">
          Más
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {/* Retícula de productos */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {PRODUCTOS.map(p => (
            <li
              key={p.nombre}
              className="flex flex-col rounded-lg border border-[#e8eaed] bg-white p-2.5 transition-shadow hover:shadow-[0_2px_10px_-2px_rgba(22,24,29,0.12)]"
            >
              {/* Sin la foto real queda el hueco reservado, para que la
                  tarjeta no cambie de alto cuando la imagen exista. */}
              <div className="mb-2 flex h-[72px] items-center justify-center rounded-md bg-[#f6f7f9]" />

              <p className="text-[12.5px] font-semibold leading-tight text-[#16181d]">{p.nombre}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-[#9ba1ab]">{p.marca}</p>

              <p className="num mt-1.5 text-[13px] font-bold leading-tight text-[#16181d]">{p.bs}</p>
              <p className="num text-[11px] leading-tight text-[#9ba1ab]">{p.usd}</p>

              <div className="mt-2 flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f7ee] px-1.5 py-[3px] text-[9.5px] font-medium text-[#15803d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden />
                  En stock
                </span>
                <button
                  aria-label={`Agregar ${p.nombre} al carrito`}
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-[#fff1e7] text-[#f97316] transition-colors hover:bg-[#f97316] hover:text-white"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
