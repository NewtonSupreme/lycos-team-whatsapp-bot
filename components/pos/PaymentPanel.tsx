'use client';

import { useState } from 'react';
import { ArrowLeftRight, Banknote, CreditCard, Smartphone, Store, Wallet, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Metodo {
  id: string;
  label: string;
  icono: React.ReactNode;
  /** Fondo y color del icono. Cada medio de pago mantiene su identidad. */
  tinte: string;
}

const METODOS: readonly Metodo[] = [
  { id: 'efectivo', label: 'Efectivo', icono: <Banknote className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
  { id: 'pago-movil', label: 'Pago Móvil', icono: <Smartphone className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  { id: 'transferencia', label: 'Transferencia', icono: <ArrowLeftRight className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
  { id: 'debito', label: 'Tarjeta Débito', icono: <CreditCard className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  { id: 'credito', label: 'Tarjeta Crédito', icono: <CreditCard className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#fdeaea] text-[#dc2626]' },
  { id: 'zelle', label: 'Zelle', icono: <ZelleGlyph />, tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
  { id: 'binance', label: 'Binance Pay', icono: <BinanceGlyph />, tinte: 'bg-[#fdf5e2] text-[#eab308]' },
  { id: 'cashea', label: 'Cashea', icono: <CasheaGlyph />, tinte: 'bg-[#fdf5e2] text-[#eab308]' },
  { id: 'pdv', label: 'Punto de Venta', icono: <Store className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e4f6f6] text-[#0d9488]' },
];

const PORCENTAJES = ['25%', '30%', '40%', '50%', 'Personalizado'] as const;

export default function PaymentPanel() {
  const [modo, setModo] = useState<'completo' | 'mixto'>('completo');
  const [moneda, setMoneda] = useState<'Bs.' | 'USD' | 'EUR'>('Bs.');
  const [metodo, setMetodo] = useState('cashea');
  const [inicial, setInicial] = useState(25);

  return (
    <section className="flex w-full flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:w-[372px] lg:shrink-0">
      <header className="flex items-center gap-2 border-b border-[#e8eaed] px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fff1e7] text-[#f97316]">
          <Wallet className="h-[15px] w-[15px]" aria-hidden />
        </span>
        <h2 className="text-[14.5px] font-bold text-[#16181d]">Método de pago</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* Completo o mixto */}
        <div className="flex border-b border-[#e8eaed]" role="tablist">
          {([['completo', 'Pago completo'], ['mixto', 'Pago mixto']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={modo === id}
              onClick={() => setModo(id)}
              className={cn(
                'relative flex-1 py-2 text-[12.5px] font-semibold transition-colors',
                modo === id ? 'text-[#f97316]' : 'text-[#8a909c] hover:text-[#16181d]',
              )}
            >
              {label}
              {modo === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#f97316]" />}
            </button>
          ))}
        </div>

        {/* Moneda */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Moneda principal</p>
        <div className="grid grid-cols-3 gap-2">
          {(['Bs.', 'USD', 'EUR'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMoneda(m)}
              aria-pressed={moneda === m}
              className={cn(
                'h-[34px] rounded-lg border text-[12.5px] font-semibold transition-colors',
                moneda === m
                  ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]'
                  : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Medios de pago */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Método de pago</p>
        <div className="grid grid-cols-3 gap-2">
          {METODOS.map(m => {
            const activo = metodo === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMetodo(m.id)}
                aria-pressed={activo}
                className={cn(
                  'relative flex h-[62px] flex-col items-center justify-center gap-1 rounded-lg border transition-colors',
                  activo ? 'border-[#f97316] bg-[#fffaf6]' : 'border-[#e8eaed] hover:bg-[#fafbfc]',
                )}
              >
                {activo && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#f97316] text-white">
                    <X className="h-2.5 w-2.5" aria-hidden />
                  </span>
                )}
                <span className={cn('flex h-[26px] w-[26px] items-center justify-center rounded-md', m.tinte)}>
                  {m.icono}
                </span>
                <span className="px-1 text-center text-[10.5px] font-medium leading-tight text-[#3d4350]">
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cashea */}
        <div className="mt-3 rounded-lg border border-[#e8eaed] p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#fdf5e2] text-[#eab308]">
              <CasheaGlyph />
            </span>
            <h3 className="flex-1 text-[13.5px] font-bold text-[#16181d]">Cashea</h3>
            <button className="text-[11px] font-medium text-[#2563eb] hover:underline">¿Cómo funciona?</button>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[12.5px]">
            <span className="text-[#5b616e]">Monto total</span>
            <span className="num font-bold text-[#16181d]">Bs. 1.937,20</span>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[12.5px]">
            <span className="text-[#5b616e]">
              Inicial (dinámica) <span className="num ml-1 font-semibold text-[#16181d]">{inicial}%</span>
            </span>
            <span className="num font-bold text-[#16181d]">Bs. 484,30</span>
          </div>

          <input
            type="range"
            min={10}
            max={60}
            value={inicial}
            onChange={e => setInicial(Number(e.target.value))}
            aria-label="Porcentaje de la cuota inicial"
            className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#ffe0cb] accent-[#f97316]"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PORCENTAJES.map(p => {
              const activo = p === `${inicial}%`;
              return (
                <button
                  key={p}
                  onClick={() => { if (p !== 'Personalizado') setInicial(Number(p.replace('%', ''))); }}
                  className={cn(
                    'h-[24px] rounded-md px-2.5 text-[11px] font-medium transition-colors',
                    activo ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-end justify-between gap-2 rounded-lg bg-[#fafbfc] p-2.5">
            <div className="min-w-0">
              <p className="text-[11px] text-[#5b616e]">4 cuotas quincenales de</p>
              <p className="num text-[15px] font-extrabold text-[#16181d]">Bs. 363,23</p>
            </div>
            <button className="h-[28px] shrink-0 rounded-md border border-[#e2e5ea] px-2.5 text-[11.5px] font-medium text-[#3d4350] hover:bg-white">
              Simular plan
            </button>
          </div>

          <p className="mt-1.5 text-[10.5px] leading-snug text-[#9ba1ab]">
            La primera cuota se cobra hoy.
            <br />
            Sujeto a aprobación de Cashea.
          </p>

          <button className="mt-2.5 flex h-[36px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#f97316] text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]">
            <CasheaGlyph />
            Generar pago con Cashea
          </button>
        </div>

        {/* Resumen */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Resumen de pago</p>
        <dl className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px]">
            <dt className="text-[#5b616e]">Inicial (Hoy)</dt>
            <dd className="num font-semibold text-[#16181d]">Bs. 484,30</dd>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <dt className="text-[#5b616e]">Cuotas (4 x Bs. 363,23)</dt>
            <dd className="num font-semibold text-[#16181d]">Bs. 1.452,90</dd>
          </div>
          <div className="flex items-center justify-between border-t border-[#e8eaed] pt-1.5 text-[12.5px]">
            <dt className="font-semibold text-[#16181d]">Total</dt>
            <dd className="num font-bold text-[#16181d]">Bs. 1.937,20</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function CasheaGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 8.6 15.06l-3.2-1.9A6.3 6.3 0 1 1 18.3 12h-6.3v3.7h10.2A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function ZelleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
      <path d="M10.6 2h2.8v2.2h3.9v2.6l-6.6 8.4h6.6V18h-3.9v2.2h-2.8V18H6.7v-2.6l6.6-8.4H6.7V4.2h3.9V2Z" />
    </svg>
  );
}

function BinanceGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
      <path d="m12 2 3 3-3 3-3-3 3-3Zm-6 6 3 3-3 3-3-3 3-3Zm12 0 3 3-3 3-3-3 3-3Zm-6 0 3 3-3 3-3-3 3-3Zm0 8 3 3-3 3-3-3 3-3Z" />
    </svg>
  );
}
