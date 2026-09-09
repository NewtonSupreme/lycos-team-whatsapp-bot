'use client';
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Package, Wrench } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import {
  candidatosDeTexto, precioBcvDe, precioEfectivoDe, type ProductoInventario,
} from '@/components/inventario/SelectorRepuesto';

/**
 * El aviso que impide vender mercancía del almacén escribiéndola a mano.
 *
 * Es el punto flojo de todo el circuito: basta con teclear «silenciador cl40»
 * en un renglón para que la venta quede registrada y el stock intacto. El
 * inventario deja de servir para nada a los dos días.
 *
 * La forma obvia de atajarlo sería un «¿seguro que no es un repuesto?» de sí o
 * no. No sirve: quien dice «sí, seguro» sigue sin enlazarlo, y quien se
 * equivoca tiene que cerrar, buscar el producto y volver a escribirlo. El aviso
 * le da trabajo en vez de quitárselo.
 *
 * Así que aquí no se pregunta: se resuelve. Para cada renglón sospechoso se
 * enseñan los artículos del almacén que se le parecen y basta un clic para
 * enlazarlo, con su precio y su costo. Y la salida —«es mano de obra»— es una
 * respuesta explícita que se recuerda en el renglón, para no volver a
 * preguntar por lo mismo cada vez que se guarde la orden.
 */

export interface RenglonSospechoso {
  indice: number;
  descripcion: string;
  cantidad: number;
  candidatos: ProductoInventario[];
}

/**
 * Los renglones escritos a mano que se parecen a algo del almacén.
 *
 * Se ignoran los que ya están enlazados, los que alguien declaró mano de obra
 * y los que se desligaron a propósito: sobre esos ya hay una decisión tomada.
 */
export function detectarRepuestosSueltos(
  items: readonly {
    descripcion: string; cantidad?: number;
    inventario_id?: string | null; es_mano_obra?: boolean; sin_descuento?: boolean;
  }[],
  productos: readonly ProductoInventario[],
): RenglonSospechoso[] {
  if (productos.length === 0) return [];
  const fuera: RenglonSospechoso[] = [];
  items.forEach((it, indice) => {
    if (it.inventario_id || it.es_mano_obra || it.sin_descuento) return;
    const desc = (it.descripcion || '').trim();
    if (!desc) return;
    const candidatos = candidatosDeTexto(productos, desc);
    if (candidatos.length === 0) return;
    fuera.push({ indice, descripcion: desc, cantidad: Number(it.cantidad) || 1, candidatos });
  });
  return fuera;
}

interface Props {
  abierto: boolean;
  sospechosos: readonly RenglonSospechoso[];
  tasa?: number;
  /** Enlazar ese renglón con ese producto del almacén. */
  onEnlazar: (indice: number, p: ProductoInventario) => void;
  /** Dejarlo como mano de obra: no es mercancía y no descuenta. */
  onEsManoDeObra: (indice: number) => void;
  /** Cancela el guardado para seguir corrigiendo. */
  onVolver: () => void;
  /** Guarda con lo decidido. */
  onContinuar: () => void;
}

export default function AvisoRepuestosSueltos({
  abierto, sospechosos, tasa = 0, onEnlazar, onEsManoDeObra, onVolver, onContinuar,
}: Props) {
  // Lo resuelto en esta pasada, para que la fila se vea zanjada al instante
  // aunque la lista de sospechosos la recalcule el formulario de fuera.
  const [resueltos, setResueltos] = useState<Record<number, string>>({});

  const pendientes = useMemo(
    () => sospechosos.filter(s => !resueltos[s.indice]).length,
    [sospechosos, resueltos],
  );

  const enlazar = (indice: number, p: ProductoInventario) => {
    setResueltos(r => ({ ...r, [indice]: p.nombre }));
    onEnlazar(indice, p);
  };

  const manoDeObra = (indice: number) => {
    setResueltos(r => ({ ...r, [indice]: 'mano de obra' }));
    onEsManoDeObra(indice);
  };

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onVolver}
      titulo="Esto puede salir del almacén"
      subtitulo={
        pendientes > 0
          ? `${pendientes} renglón(es) sin decidir. Si es mercancía, enlázala para que se descuente.`
          : 'Todo decidido. Ya se puede guardar.'
      }
      icono={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden />}
      tinteIcono="bg-[#fffbeb] text-[#b45309]"
      ancho="lg"
      pie={
        <>
          <button
            type="button"
            onClick={onVolver}
            className="h-10 rounded-xl px-4 text-[12.5px] font-bold text-[#5b616e] hover:bg-[#f6f7f9]"
          >
            Volver a la orden
          </button>
          <button
            type="button"
            onClick={onContinuar}
            className="h-10 rounded-xl bg-[#f97316] px-5 text-[12.5px] font-bold text-white hover:bg-[#ea6a0c]"
          >
            {pendientes > 0 ? `Guardar así (${pendientes} sin enlazar)` : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <p className="rounded-xl bg-[#fffbeb] px-3 py-2 text-[11.5px] leading-snug text-[#92400e]">
          Escrito a mano, el repuesto se cobra pero <strong>no baja del inventario</strong> ni queda
          cargado como gasto de ese vehículo. Enlázalo y el sistema hace las dos cosas solo.
        </p>

        {sospechosos.map(s => {
          const resuelto = resueltos[s.indice];
          return (
            <div
              key={s.indice}
              className={`rounded-xl border px-3 py-2.5 ${
                resuelto ? 'border-[#86efac] bg-[#f0f9f4]' : 'border-[#e8eaed] bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {resuelto
                  ? <Check className="h-4 w-4 shrink-0 text-[#15803d]" aria-hidden />
                  : <AlertTriangle className="h-4 w-4 shrink-0 text-[#b45309]" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-[#16181d]">
                    «{s.descripcion}»
                  </span>
                  <span className="block text-[10.5px] text-[#8a909c]">
                    {resuelto
                      ? resuelto === 'mano de obra'
                        ? 'Marcado como mano de obra: no descuenta stock.'
                        : `Enlazado con ${resuelto}.`
                      : `Cantidad ${s.cantidad} · escrito a mano`}
                  </span>
                </span>
              </div>

              {!resuelto && (
                <div className="mt-2 space-y-1">
                  {s.candidatos.map(p => {
                    const efec = precioEfectivoDe(p);
                    const bcv = precioBcvDe(p);
                    const falta = s.cantidad > (Number(p.stock) || 0);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => enlazar(s.indice, p)}
                        className="flex w-full items-center gap-2 rounded-lg border border-[#eef0f3] px-2.5 py-1.5 text-left transition-colors hover:border-[#f97316] hover:bg-[#fff8f3]"
                      >
                        <Package className="h-3.5 w-3.5 shrink-0 text-[#f97316]" aria-hidden />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[12px] font-semibold text-[#16181d]">
                            {p.nombre}
                          </span>
                          <span className="block truncate text-[10px] text-[#8a909c]">
                            {[p.marca, p.codigo].filter(Boolean).join(' · ') || 'Sin código'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right leading-tight">
                          <span className="block text-[11.5px] font-black tabular-nums text-[#16181d]">
                            ${efec.toFixed(2)}
                            {Math.abs(efec - bcv) > 0.009 && (
                              <span className="ml-1 font-bold text-[#0d9488]">/ ${bcv.toFixed(2)}</span>
                            )}
                          </span>
                          {tasa > 0 && (
                            <span className="block text-[9.5px] tabular-nums text-[#9ba1ab]">
                              Bs. {(bcv * tasa).toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                            Number(p.stock) <= 0 ? 'bg-[#fdeaea] text-[#dc2626]'
                              : falta ? 'bg-[#fffbeb] text-[#b45309]'
                                : 'bg-[#f0f9f4] text-[#15803d]'
                          }`}
                        >
                          {Number(p.stock) || 0}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => manoDeObra(s.indice)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#cbd0d8] px-2.5 py-1.5 text-[11.5px] font-bold text-[#5b616e] transition-colors hover:border-[#5b616e] hover:bg-[#f6f7f9]"
                  >
                    <Wrench className="h-3.5 w-3.5" aria-hidden />
                    No es del inventario — es mano de obra
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ModalBase>
  );
}
