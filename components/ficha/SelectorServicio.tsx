'use client';

import { CalendarClock, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServicioFicha } from '@/lib/ficha/vehiculo';

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaCorta = (f: string | null) => {
  if (!f) return 'sin fecha';
  const s = String(f);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
};

interface Props {
  servicios: readonly ServicioFicha[];
  /** `null` = todo el historial del vehículo. */
  elegido: string | null;
  onElegir: (id: string | null) => void;
  /** Renglones de la ficha sin trabajo asignado, si hay. */
  sueltas: number;
}

/**
 * El trabajo sobre el que se está editando la ficha.
 *
 * Es lo que faltaba para que la ficha dejara de ser una libreta por vehículo.
 * Antes todo renglón que se anotaba caía en un montón común sin pertenecer a
 * ningún trabajo: no se sabía a qué servicio cargarle el gasto, ni de qué
 * precio formaba parte, y por eso «se editaba en tiempo real».
 *
 * Eligiendo el trabajo primero, cada renglón que se añada nace enlazado a él y
 * el precio de esa orden se actualiza solo.
 */
export default function SelectorServicio({ servicios, elegido, onElegir, sueltas }: Props) {
  if (servicios.length === 0 && sueltas === 0) return null;

  return (
    <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#16181d]">
          <CalendarClock className="h-4 w-4 text-[#f97316]" aria-hidden />
          ¿Sobre qué trabajo estás anotando?
        </h2>
        <p className="text-[11px] text-[#8a909c]">
          Lo que agregues se enlaza a este servicio y actualiza su precio al cliente.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Servicios del vehículo">
        {servicios.map(s => {
          const activo = elegido === s.id;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={activo}
              onClick={() => onElegir(s.id)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-2 text-left transition-colors',
                activo
                  ? 'border-[#f97316] bg-[#fff4ec] ring-1 ring-[#f97316]'
                  : 'border-[#e2e5ea] bg-white hover:bg-[#fafbfc]',
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  s.abierto ? 'bg-[#16a34a]' : 'bg-[#c3c8d0]',
                )} aria-hidden />
                <span className={cn(
                  'num text-[11.5px] font-bold',
                  activo ? 'text-[#c2410c]' : 'text-[#16181d]',
                )}>
                  {fechaCorta(s.fecha)}
                </span>
                {s.abierto && (
                  <span className="rounded bg-[#e8f7ee] px-1 text-[9.5px] font-semibold text-[#15803d]">
                    abierto
                  </span>
                )}
              </span>
              <span className="mt-0.5 block max-w-[190px] truncate text-[11px] text-[#5b616e]">
                {s.descripcion || s.tipo_personalizado || s.tipo || 'Servicio'}
              </span>
              <span className="num mt-0.5 block text-[11px] font-semibold text-[#16181d]">
                {money(s.totalItems || s.monto)}
                <span className="ml-1 font-normal text-[#9ba1ab]">
                  {s.nPartidas > 0 ? `· ${s.nPartidas} costeado(s)` : '· sin costos'}
                </span>
              </span>
            </button>
          );
        })}

        {/* La vista de siempre, para mirar el carro completo. Deja de ser el
            modo por omisión: anotar aquí no enlaza el renglón a nada. */}
        <button
          role="tab"
          aria-selected={elegido === null}
          onClick={() => onElegir(null)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-semibold transition-colors',
            elegido === null
              ? 'border-[#16181d] bg-[#16181d] text-white'
              : 'border-[#e2e5ea] bg-white text-[#5b616e] hover:bg-[#fafbfc]',
          )}
        >
          <History className="h-4 w-4" aria-hidden />
          Todo el historial
          {sueltas > 0 && (
            <span className={cn(
              'num rounded px-1 text-[10px] font-bold',
              elegido === null ? 'bg-white/20' : 'bg-[#fdf5e2] text-[#a16207]',
            )}>
              {sueltas} sin trabajo
            </span>
          )}
        </button>
      </div>
    </section>
  );
}
