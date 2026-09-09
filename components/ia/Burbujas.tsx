'use client';

import { ArrowUpRight, Check, Copy, ExternalLink, ImageIcon, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import type { Guia } from '@/lib/ia/guias';

export interface Mensaje {
  id: string;
  quien: 'yo' | 'ia';
  texto: string;
  hora: string;
  /** Si la respuesta salió de una guía, se pintan sus pasos y sus botones. */
  guia?: Guia;
  /** Datos reales que acompañan a la respuesta, cuando los hay. */
  datos?: { etiqueta: string; valor: string }[];
}

/** Convierte los **negritas** del texto en elementos reales. */
function conNegritas(texto: string): React.ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((trozo, i) => {
    if (trozo.startsWith('**') && trozo.endsWith('**')) {
      return <strong key={i} className="font-semibold text-[#16181d]">{trozo.slice(2, -2)}</strong>;
    }
    return <span key={i}>{trozo}</span>;
  });
}

export function Avatar({ quien }: { quien: 'yo' | 'ia' }) {
  if (quien === 'yo') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-[12px] font-bold text-white" aria-hidden>
        A
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- retrato del asistente, local y de tamaño fijo
    <img
      src="/asistente/robot.png"
      alt=""
      className="h-8 w-8 shrink-0 rounded-full bg-[#f2f3f5] object-cover"
    />
  );
}

/**
 * Una respuesta del asistente.
 *
 * Cuando viene de una guía se pintan los pasos numerados y los botones de
 * acción; cuando viene del modelo, el texto tal cual. La diferencia importa: los
 * pasos de una guía están verificados contra el código, y los del modelo no.
 */
export default function Burbuja({
  m, onGuiaVisual, onVideo, onIrAlModulo,
}: {
  m: Mensaje;
  onGuiaVisual: (g: Guia) => void;
  onVideo: () => void;
  onIrAlModulo: (ruta: string) => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(m.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch { /* sin portapapeles no pasa nada grave */ }
  };

  if (m.quien === 'yo') {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-[#f97316] px-4 py-2.5">
          <p className="text-[13px] leading-relaxed text-white">{m.texto}</p>
          <p className="num mt-1 text-right text-[10px] text-white/75">{m.hora}</p>
        </div>
        <Avatar quien="yo" />
      </div>
    );
  }

  const g = m.guia;

  return (
    <div className="flex items-start gap-2.5">
      <Avatar quien="ia" />

      <div className="min-w-0 max-w-[86%]">
        <div className="group rounded-2xl rounded-tl-md bg-[#f4f5f7] px-4 py-3">
          {g ? (
            <>
              <p className="text-[13px] leading-relaxed text-[#16181d]">{conNegritas(g.intro)}</p>

              <ol className="mt-2.5 space-y-2">
                {g.pasos.map((p, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="num mt-px flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-[#f97316] text-[10.5px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug text-[#3d4350]">{conNegritas(p.texto)}</span>
                      {p.nota && (
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-[#8a909c]">{p.nota}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>

              {g.cierre && (
                <p className="mt-2.5 border-t border-[#e2e5ea] pt-2.5 text-[12px] leading-relaxed text-[#5b616e]">
                  {conNegritas(g.cierre)}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {m.texto.split('\n').filter(Boolean).map((linea, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-[#16181d]">{conNegritas(linea)}</p>
              ))}
            </div>
          )}

          {m.datos && m.datos.length > 0 && (
            <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-[#e2e5ea] pt-2.5 sm:grid-cols-3">
              {m.datos.map(d => (
                <div key={d.etiqueta} className="rounded-lg bg-white px-2.5 py-1.5">
                  <dt className="text-[10px] uppercase tracking-wide text-[#9ba1ab]">{d.etiqueta}</dt>
                  <dd className="num text-[13px] font-bold text-[#16181d]">{d.valor}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-2 flex items-center gap-2">
            <p className="num flex-1 text-[10px] text-[#9ba1ab]">{m.hora}</p>
            <button
              onClick={copiar}
              aria-label="Copiar respuesta"
              className="flex items-center gap-1 text-[10.5px] text-[#9ba1ab] opacity-0 transition-opacity hover:text-[#5b616e] group-hover:opacity-100"
            >
              {copiado
                ? <><Check className="h-3 w-3" aria-hidden /> Copiado</>
                : <><Copy className="h-3 w-3" aria-hidden /> Copiar</>}
            </button>
          </div>
        </div>

        {/* Los botones solo salen si hay algo real detrás de cada uno. */}
        {g && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => onGuiaVisual(g)}
              className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]"
            >
              <ImageIcon className="h-4 w-4" aria-hidden />
              Mostrar guía visual
            </button>
            <button
              onClick={onVideo}
              className="flex h-[38px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[12.5px] font-medium text-[#3d4350] transition-colors hover:bg-[#f6f7f9]"
            >
              <PlayCircle className="h-4 w-4" aria-hidden />
              Ver video tutorial
            </button>
            {g.ruta && (
              <button
                onClick={() => onIrAlModulo(g.ruta!)}
                className="flex h-[38px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[12.5px] font-medium text-[#3d4350] transition-colors hover:bg-[#f6f7f9]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Ir al módulo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Los tres puntos mientras el asistente piensa. */
export function Escribiendo() {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar quien="ia" />
      <div className="flex h-[38px] items-center gap-1.5 rounded-2xl rounded-tl-md bg-[#f4f5f7] px-4">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="h-[6px] w-[6px] animate-bounce rounded-full bg-[#9ba1ab]"
            style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
          />
        ))}
        <span className="sr-only">El asistente está escribiendo</span>
      </div>
    </div>
  );
}

/** Enlace para «Ver todos los temas», reutilizado en la cabecera del índice. */
export function EnlaceIndice({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[12px] font-medium text-[#f97316] hover:underline"
    >
      {texto}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </button>
  );
}
