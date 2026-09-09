'use client';

import { ArrowUp, CalendarCheck, FileText, Gift, Plane, TrendingUp, Users } from 'lucide-react';
import type { ResumenRRHH } from './tipos';

interface Props {
  resumen: ResumenRRHH;
  /** Altas del mes en curso, para la variación del primer indicador. */
  altasMes: number;
  onIrA: (tab: string) => void;
}

export default function RrhhKpis({ resumen, altasMes, onIrA }: Props) {
  const k = resumen.kpis;
  const pct = (n: number) => (k.total > 0 ? Math.round((n / k.total) * 100) : 0);

  const CARDS = [
    {
      label: 'Total de empleados',
      valor: String(k.total),
      pie: altasMes > 0 ? `+${altasMes} este mes` : 'Sin altas este mes',
      sube: altasMes > 0,
      icono: <Users className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#e7f0fe] text-[#2563eb]',
      tab: 'personal',
    },
    {
      label: 'Presentes hoy',
      valor: String(k.presentes),
      pie: `${k.pctPresentes}% del total`,
      sube: false,
      icono: <CalendarCheck className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#e8f7ee] text-[#16a34a]',
      tab: 'asistencia',
    },
    {
      label: 'En vacaciones',
      valor: String(k.enVacaciones),
      pie: `${pct(k.enVacaciones)}% del total`,
      sube: false,
      icono: <Plane className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#fff1e7] text-[#f97316]',
      tab: 'vacaciones',
    },
    {
      label: 'Permisos',
      valor: String(k.permisos),
      pie: `${pct(k.permisos)}% del total`,
      sube: false,
      icono: <FileText className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#fdeaea] text-[#dc2626]',
      tab: 'permisos',
    },
    {
      label: 'Cumpleaños (mes)',
      valor: String(k.cumpleanosMes),
      pie: 'Ver próximas fechas',
      sube: k.cumpleanosMes > 0,
      icono: <Gift className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#f0eafc] text-[#7c3aed]',
      tab: 'personal',
    },
    {
      label: 'Rotación (anual)',
      valor: `${k.rotacion}%`,
      // Umbral habitual: por debajo de 10 % anual se considera sana.
      pie: k.rotacion <= 10 ? 'Excelente' : k.rotacion <= 25 ? 'Aceptable' : 'Alta',
      sube: k.rotacion <= 10,
      icono: <TrendingUp className="h-[21px] w-[21px]" aria-hidden />,
      tinte: 'bg-[#e4f6f6] text-[#0d9488]',
      tab: 'personal',
    },
  ];

  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
      {CARDS.map(c => (
        <button
          key={c.label}
          onClick={() => onIrA(c.tab)}
          className="flex items-start gap-2.5 rounded-xl border border-[#e8eaed] bg-white p-3.5 text-left transition-colors hover:border-[#d5d9e0]"
        >
          <span className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl ${c.tinte}`}>
            {c.icono}
          </span>
          <span className="min-w-0">
            <span className="block text-[11.5px] leading-tight text-[#8a909c]">{c.label}</span>
            <span className="num mt-0.5 block truncate text-[24px] font-extrabold leading-tight tracking-tight text-[#16181d]">
              {c.valor}
            </span>
            <span className={`num mt-0.5 flex items-center gap-0.5 text-[10.5px] font-medium ${c.sube ? 'text-[#16a34a]' : 'text-[#8a909c]'}`}>
              {c.sube && <ArrowUp className="h-3 w-3" aria-hidden />}
              {c.pie}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
