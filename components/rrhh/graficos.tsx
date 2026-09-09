'use client';

import { COLORES } from './tipos';

export interface Porcion {
  label: string;
  valor: number;
  color: string;
}

/**
 * Anillo de proporciones, dibujado a mano en SVG.
 *
 * No se monta una librería de gráficos para esto: son arcos sobre un círculo y
 * recharts exige un contenedor de alto definido que se rompe en cuanto la
 * tarjeta cambia de tamaño. Aquí el tamaño lo fija el `viewBox` y ya.
 */
export function Anillo({
  porciones, total, titulo, subtitulo, size = 132, grosor = 18,
}: {
  porciones: readonly Porcion[];
  total: number;
  titulo: string;
  subtitulo: string;
  size?: number;
  grosor?: number;
}) {
  const r = (size - grosor) / 2;
  const c = size / 2;
  const circunferencia = 2 * Math.PI * r;
  const suma = porciones.reduce((s, p) => s + p.valor, 0);

  let acumulado = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden focusable="false">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef1f5" strokeWidth={grosor} />
        {suma > 0 && porciones.map((p, i) => {
          const largo = (p.valor / suma) * circunferencia;
          const offset = -acumulado;
          acumulado += largo;
          if (p.valor <= 0) return null;
          return (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={grosor}
              strokeDasharray={`${largo} ${circunferencia - largo}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="num text-[22px] font-extrabold text-[#16181d]">{titulo}</span>
        <span className="text-[10.5px] text-[#8a909c]">{subtitulo}</span>
      </div>

      {/* La proporción también en texto: el color solo no puede ser el dato. */}
      <span className="sr-only">
        {porciones.map(p => `${p.label}: ${p.valor} de ${total}`).join('. ')}
      </span>
    </div>
  );
}

/** Barras verticales de antigüedad, con la escala a la izquierda. */
export function Barras({ datos }: { datos: readonly { label: string; total: number }[] }) {
  const max = Math.max(1, ...datos.map(d => d.total));
  // Escala redondeada hacia arriba para que la cuadrícula caiga en enteros.
  const tope = Math.max(2, Math.ceil(max / 2) * 2);
  const marcas = [tope, Math.round(tope * 0.75), Math.round(tope / 2), Math.round(tope * 0.25), 0];

  return (
    <div className="flex gap-2">
      <div className="flex w-[18px] shrink-0 flex-col justify-between py-1 text-right">
        {marcas.map(m => (
          <span key={m} className="num text-[9.5px] leading-none text-[#9ba1ab]">{m}</span>
        ))}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-5 items-end gap-2" style={{ height: 128 }}>
        {datos.map(d => (
          <div key={d.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
            <span className="num text-[11px] font-bold text-[#16181d]">{d.total}</span>
            <div
              className="w-full rounded-t-md bg-[#f9a366]"
              style={{ height: `${Math.max(d.total > 0 ? 6 : 2, (d.total / tope) * 100)}%` }}
              role="img"
              aria-label={`${d.label}: ${d.total} empleados`}
            />
            <span className="w-full truncate text-center text-[9.5px] leading-tight text-[#8a909c]">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Convierte la distribución por área en porciones con su color estable. */
export function porcionesDeAreas(distribucion: readonly { area: string; total: number }[]): Porcion[] {
  return distribucion.map((d, i) => ({
    label: d.area,
    valor: d.total,
    color: COLORES[i % COLORES.length],
  }));
}
