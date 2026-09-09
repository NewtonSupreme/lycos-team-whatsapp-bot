'use client';

import { ArrowRight, Cake, CalendarDays } from 'lucide-react';
import { Anillo } from './graficos';
import { fechaLarga, type ResumenRRHH } from './tipos';
import Avatar from './Avatar';

interface Props {
  resumen: ResumenRRHH;
  onIrA: (tab: string) => void;
}

/** Asistencia del día, cumpleaños y vacaciones que vienen. */
export default function ColumnaDia({ resumen, onIrA }: Props) {
  const { presentes, tardanzas, ausentes } = resumen.asistenciaHoy;
  const registrados = presentes + tardanzas + ausentes;

  const LEYENDA = [
    { label: 'Presentes', valor: presentes, color: '#16a34a' },
    { label: 'Tardanzas', valor: tardanzas, color: '#f59e0b' },
    { label: 'Ausentes', valor: ausentes, color: '#ef4444' },
  ];

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 xl:w-[300px]">
      {/* Asistencia de hoy */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Asistencia de hoy</h2>
          <button onClick={() => onIrA('asistencia')} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver todos
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>
        <p className="mt-0.5 text-[11.5px] text-[#8a909c]">{fechaLarga(resumen.fecha)}</p>

        {registrados === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CalendarDays className="h-8 w-8 text-[#d5d9e0]" aria-hidden />
            <p className="text-[12px] leading-snug text-[#8a909c]">
              Nadie ha marcado asistencia hoy.
              <br />
              Regístrala desde Acciones rápidas.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <Anillo
              porciones={LEYENDA.map(l => ({ label: l.label, valor: l.valor, color: l.color }))}
              total={registrados}
              titulo={`${resumen.kpis.pctPresentes}%`}
              subtitulo="Presentes"
            />
            <ul className="min-w-0 flex-1 space-y-2">
              {LEYENDA.map(l => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: l.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#3d4350]">{l.label}</span>
                  <span className="num text-[12.5px] font-bold text-[#16181d]">{l.valor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Cumpleaños */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Próximos cumpleaños</h2>
          <button onClick={() => onIrA('personal')} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver todos
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        {resumen.cumpleanos.length === 0 ? (
          <p className="py-3 text-[11.5px] leading-snug text-[#9ba1ab]">
            Sin fechas de nacimiento cargadas. Se completan en la ficha de cada empleado.
          </p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {resumen.cumpleanos.map(c => (
              <li key={c.id} className="flex items-center gap-2.5">
                <Avatar nombre={c.nombre} url={c.foto_url} size={34} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{c.nombre}</span>
                  <span className="block text-[11px] text-[#8a909c]">
                    {fechaLarga(c.fecha).replace(/ \d{4}$/, '')}
                    {c.dias === 0 ? ' · ¡hoy!' : ` (${c.dias} día${c.dias === 1 ? '' : 's'})`}
                  </span>
                </span>
                <Cake className="h-4 w-4 shrink-0 text-[#dc2626]" aria-hidden />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vacaciones */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Próximas vacaciones</h2>
          <button onClick={() => onIrA('vacaciones')} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver todas
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        {resumen.vacacionesProximas.length === 0 ? (
          <p className="py-3 text-[11.5px] leading-snug text-[#9ba1ab]">
            No hay vacaciones aprobadas por venir.
          </p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {resumen.vacacionesProximas.map(v => (
              <li key={v.id} className="flex items-center gap-2.5">
                <Avatar nombre={v.nombre} url={v.foto_url} size={34} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{v.nombre}</span>
                  <span className="num block text-[11px] text-[#8a909c]">
                    {String(v.fecha_inicio).slice(8, 10)}/{String(v.fecha_inicio).slice(5, 7)}/{String(v.fecha_inicio).slice(0, 4)}
                    {' - '}
                    {String(v.fecha_fin).slice(8, 10)}/{String(v.fecha_fin).slice(5, 7)}/{String(v.fecha_fin).slice(0, 4)}
                  </span>
                </span>
                <span className="num shrink-0 rounded-md bg-[#fff4ec] px-2 py-0.5 text-[10.5px] font-semibold text-[#c2410c]">
                  {v.dias || 0} días
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
