'use client';

import { ArrowRight, ArrowUpRight, Receipt, ShoppingBag, Wallet } from 'lucide-react';

interface Venta {
  factura: string;
  fecha: string;
  cliente: string;
  total: string;
  metodo: string;
  tinte: string;
}

const VENTAS: readonly Venta[] = [
  { factura: 'FV-2026-0018', fecha: '05/09/2026', cliente: 'Carlos Méndez', total: 'Bs. 1.937,20', metodo: 'Cashea', tinte: 'bg-[#fdf5e2] text-[#eab308]' },
  { factura: 'FV-2026-0017', fecha: '04/09/2026', cliente: 'Ana Rodríguez', total: '$ 85,00', metodo: 'Tarjeta Crédito', tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  { factura: 'FV-2026-0016', fecha: '04/09/2026', cliente: 'Pedro González', total: 'Bs. 2.430,00', metodo: 'Pago Móvil', tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  { factura: 'FV-2026-0015', fecha: '03/09/2026', cliente: 'María Torres', total: '€ 120,00', metodo: 'Transferencia', tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
];

interface Metodo {
  nombre: string;
  monto: string;
  pct: number;
  barra: string;
  tinte: string;
}

const METODOS: readonly Metodo[] = [
  { nombre: 'Efectivo', monto: 'Bs. 12.450,00', pct: 28, barra: 'bg-[#22c55e]', tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
  { nombre: 'Pago Móvil', monto: 'Bs. 8.320,00', pct: 19, barra: 'bg-[#3b82f6]', tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  { nombre: 'Transferencia', monto: 'Bs. 7.980,00', pct: 18, barra: 'bg-[#8b5cf6]', tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
  { nombre: 'Tarjeta Crédito', monto: 'Bs. 6.540,00', pct: 15, barra: 'bg-[#f97316]', tinte: 'bg-[#fff1e7] text-[#f97316]' },
  { nombre: 'Cashea', monto: 'Bs. 5.680,00', pct: 13, barra: 'bg-[#eab308]', tinte: 'bg-[#fdf5e2] text-[#eab308]' },
  { nombre: 'Otros', monto: 'Bs. 3.120,00', pct: 7, barra: 'bg-[#94a3b8]', tinte: 'bg-[#eef1f5] text-[#5b616e]' },
];

export default function PosFooterPanels() {
  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
      {/* Ventas recientes */}
      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:col-span-5">
        <header className="flex items-center gap-2 px-4 py-3">
          <span className="flex h-5 w-5 items-center justify-center rounded text-[#f97316]">
            <Receipt className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="flex-1 text-[13.5px] font-bold text-[#16181d]">Ventas recientes</h2>
          <button className="flex items-center gap-1 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver todas
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-y border-[#f0f1f4] bg-[#fafbfc]">
                {['# Factura', 'Fecha', 'Cliente', 'Total', 'Método de pago', 'Estado'].map(h => (
                  <th key={h} scope="col" className="px-3 py-2 text-left text-[10.5px] font-semibold text-[#8a909c]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VENTAS.map(v => (
                <tr key={v.factura} className="border-b border-[#f5f6f8] last:border-0">
                  <td className="num px-3 py-2.5 text-[11.5px] font-medium text-[#16181d]">{v.factura}</td>
                  <td className="num px-3 py-2.5 text-[11.5px] text-[#5b616e]">{v.fecha}</td>
                  <td className="px-3 py-2.5 text-[11.5px] text-[#16181d]">{v.cliente}</td>
                  <td className="num px-3 py-2.5 text-[11.5px] font-semibold text-[#16181d]">{v.total}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-[11.5px] text-[#3d4350]">
                      <span className={`flex h-4 w-4 items-center justify-center rounded ${v.tinte}`}>
                        <Wallet className="h-2.5 w-2.5" aria-hidden />
                      </span>
                      {v.metodo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-md bg-[#e8f7ee] px-2 py-0.5 text-[10.5px] font-medium text-[#15803d]">
                      Completada
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Métodos de pago del mes */}
      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:col-span-4">
        <header className="flex items-center gap-2 px-4 py-3">
          <span className="flex h-5 w-5 items-center justify-center rounded text-[#f97316]">
            <ShoppingBag className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="flex-1 text-[13.5px] font-bold text-[#16181d]">Métodos de pago (este mes)</h2>
          <button className="flex items-center gap-1 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver reporte
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        <ul className="px-4 pb-3.5">
          {METODOS.map(m => (
            <li key={m.nombre} className="flex items-center gap-2.5 py-[7px]">
              <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded ${m.tinte}`}>
                <Wallet className="h-2.5 w-2.5" aria-hidden />
              </span>
              <span className="w-[86px] shrink-0 truncate text-[11.5px] text-[#3d4350]">{m.nombre}</span>
              <span className="num w-[82px] shrink-0 text-[11.5px] font-medium text-[#16181d]">{m.monto}</span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#f0f1f4]">
                <span className={`block h-full rounded-full ${m.barra}`} style={{ width: `${m.pct}%` }} />
              </span>
              <span className="num w-[26px] shrink-0 text-right text-[11px] text-[#8a909c]">{m.pct}%</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Indicadores del día */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
        {[
          { label: 'Ventas del día', valor: '12', delta: '+33% vs. ayer', tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
          { label: 'Total del día', valor: 'Bs. 18.430,50', delta: '+27% vs. ayer', tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
        ].map(k => (
          <article key={k.label} className="flex items-center gap-3 rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.tinte}`}>
              <ShoppingBag className="h-[17px] w-[17px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] text-[#8a909c]">{k.label}</p>
              <p className="num text-[18px] font-extrabold leading-tight text-[#16181d]">{k.valor}</p>
              <p className="num flex items-center gap-0.5 text-[10.5px] font-medium text-[#16a34a]">
                <ArrowUpRight className="h-3 w-3" aria-hidden />
                {k.delta}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
