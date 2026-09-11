'use client';

import { useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import ModalBase, { BotonPrincipal, BotonSecundario, Campo, CLASE_INPUT } from '@/components/ui/modales/ModalBase';
import { cn } from '@/lib/utils';
import type { ProveedorFila } from '@/lib/proveedores/tipos';

interface Props {
  abierto: boolean;
  proveedor: ProveedorFila;
  onCerrar: () => void;
  onGuardado: () => void;
}

const EJES = [
  { id: 'calidad', label: 'Calidad', ayuda: '¿La pieza vino bien y duró?' },
  { id: 'puntualidad', label: 'Puntualidad', ayuda: '¿Llegó cuando dijo?' },
  { id: 'precio', label: 'Precio', ayuda: '¿Está bien comparado con otros?' },
] as const;

/**
 * Evaluar a un proveedor.
 *
 * Las tres notas van separadas porque no significan lo mismo: uno puede tener
 * el mejor precio y ser el que siempre llega tarde. Con una sola nota media esa
 * diferencia se pierde, y es justo la que decide a quién llamar cuando corre
 * prisa y a quién cuando lo que importa es el costo.
 */
export default function ModalEvaluacion({ abierto, proveedor, onCerrar, onGuardado }: Props) {
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (Object.keys(notas).length === 0) {
      setError('Pon al menos una nota.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const r = await fetch('/api/proveedores/evaluaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: proveedor.id,
          calidad: notas.calidad ?? null,
          puntualidad: notas.puntualidad ?? null,
          precio: notas.precio ?? null,
          comentario: comentario.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      onGuardado();
      onCerrar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      bloqueado={guardando}
      titulo={`Evaluar a ${proveedor.nombre}`}
      subtitulo="Un proveedor barato que entrega tarde sale caro. Aquí queda constancia."
      icono={<Star className="h-5 w-5" aria-hidden />}
      pie={(
        <>
          <BotonSecundario onClick={onCerrar} disabled={guardando}>Cancelar</BotonSecundario>
          <BotonPrincipal onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : 'Guardar evaluación'}
          </BotonPrincipal>
        </>
      )}
    >
      <div className="space-y-3">
        {EJES.map(eje => (
          <div key={eje.id}>
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px] font-semibold text-[#16181d]">{eje.label}</span>
              <span className="text-[11px] text-[#8a909c]">{eje.ayuda}</span>
            </div>
            <div className="mt-1 flex gap-1" role="group" aria-label={`Nota de ${eje.label}`}>
              {[1, 2, 3, 4, 5].map(n => {
                const puesta = (notas[eje.id] ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${eje.label}: ${n} de 5`}
                    aria-pressed={notas[eje.id] === n}
                    onClick={() => setNotas(s => ({ ...s, [eje.id]: n }))}
                    className={cn(
                      'flex h-[38px] flex-1 items-center justify-center rounded-lg border transition-colors',
                      puesta
                        ? 'border-[#f59e0b] bg-[#fffbeb] text-[#f59e0b]'
                        : 'border-[#e2e5ea] text-[#d5d9e0] hover:bg-[#fafbfc]',
                    )}
                  >
                    <Star className={cn('h-[18px] w-[18px]', puesta && 'fill-current')} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <Campo label="¿Algo que recordar?">
          <input
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            placeholder="Se tardó dos semanas con las mangueras…"
            className={CLASE_INPUT}
          />
        </Campo>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12.5px] text-[#b91c1c]">
          {error}
        </p>
      )}
    </ModalBase>
  );
}
