'use client';

import { ArrowDown, ArrowUp, FileText, Receipt, UsersRound } from 'lucide-react';
import { Sparkline } from '@/components/ui/sparkline';
import { NominaIcon } from '@/components/erp/ErpShell';
import { formatoMonto, type Moneda } from './tipos';

export interface KpiSeries {
  /** Totales de los últimos períodos liquidados, del más viejo al más nuevo. */
  empleados: readonly number[];
  bruto: readonly number[];
  deducciones: readonly number[];
  neto: readonly number[];
}

interface Props {
  empleados: number;
  bruto: number;
  deducciones: number;
  neto: number;
  pendientes: number;
  /** Variación del bruto contra el período liquidado anterior, en %. */
  variacionBruto: number | null;
  /** Diferencia de personal contra el período anterior. */
  variacionEmpleados: number | null;
  series: KpiSeries;
  moneda: Moneda;
  tasa: number;
}

export default function NominaKpis({
  empleados, bruto, deducciones, neto, pendientes,
  variacionBruto, variacionEmpleados, series, moneda, tasa,
}: Props) {
  const money = (n: number) => formatoMonto(n, moneda, tasa);
  const pctDeducciones = bruto > 0 ? Math.round((deducciones / bruto) * 100) : 0;

  const KPIS = [
    {
      label: 'Empleados activos',
      valor: String(empleados),
      pie: variacionEmpleados === null || variacionEmpleados === 0
        ? `${empleados} en el período`
        : `${variacionEmpleados > 0 ? '+' : ''}${variacionEmpleados} vs. período anterior`,
      delta: variacionEmpleados,
      icono: <UsersRound className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#e7f0fe] text-[#2563eb]',
      color: 'text-[#3b82f6]',
      serie: series.empleados,
    },
    {
      label: 'Total nómina (Bruto)',
      valor: money(bruto),
      pie: variacionBruto === null
        ? 'Sin período anterior'
        : `${variacionBruto > 0 ? '+' : ''}${variacionBruto}% vs. período anterior`,
      delta: variacionBruto,
      icono: <NominaIcon className="h-[21px] w-[21px]" />,
      tinte: 'bg-[#fff1e7] text-[#f97316]',
      color: 'text-[#f97316]',
      serie: series.bruto,
    },
    {
      label: 'Total deducciones',
      valor: money(deducciones),
      pie: `${pctDeducciones}% del total`,
      delta: null,
      icono: <Receipt className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#fdeaea] text-[#dc2626]',
      color: 'text-[#ef4444]',
      serie: series.deducciones,
    },
    {
      label: 'Total a pagar (Neto)',
      valor: money(neto),
      pie: pendientes === 0 ? 'Todo liquidado' : `${pendientes} por procesar`,
      delta: null,
      icono: <FileText className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#e8f7ee] text-[#16a34a]',
      color: 'text-[#22c55e]',
      serie: series.neto,
    },
  ];

  return (
    <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map(k => {
        const sube = typeof k.delta === 'number' && k.delta > 0;
        const baja = typeof k.delta === 'number' && k.delta < 0;
        return (
          <article
            key={k.label}
            className="relative flex h-[112px] items-start gap-3 overflow-hidden rounded-xl border border-[#e8eaed] bg-white p-4"
          >
            <span className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl ${k.tinte}`}>
              {k.icono}
            </span>

            <div className="relative z-10 min-w-0">
              <p className="text-[12px] text-[#8a909c]">{k.label}</p>
              <p className="num mt-0.5 truncate text-[22px] font-extrabold leading-tight tracking-tight text-[#16181d]">
                {k.valor}
              </p>
              <p className={`num mt-1 flex items-center gap-0.5 text-[11.5px] font-medium ${
                sube ? 'text-[#16a34a]' : baja ? 'text-[#dc2626]' : 'text-[#8a909c]'
              }`}>
                {sube && <ArrowUp className="h-3 w-3" aria-hidden />}
                {baja && <ArrowDown className="h-3 w-3" aria-hidden />}
                {k.pie}
              </p>
            </div>

            {/* Tendencia de los últimos períodos liquidados. Si aún no hay
                historial no se dibuja nada: mejor vacío que una curva inventada. */}
            {k.serie.length >= 2 && (
              <Sparkline
                data={k.serie}
                height={44}
                className={`pointer-events-none absolute bottom-0 right-0 w-[46%] ${k.color}`}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}
