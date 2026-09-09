'use client';

import { AlertTriangle, ExternalLink, Pencil, Trash2, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PartidaCalculada } from '@/lib/ficha/vehiculo';

const TIPO_LABEL: Record<string, string> = {
  repuesto: 'Repuesto', mano_obra: 'Mano de obra', servicio: 'Servicio', insumo: 'Insumo',
};

const PAGO_TINTE: Record<string, string> = {
  pagado: 'bg-[#e8f7ee] text-[#15803d]',
  por_pagar: 'bg-[#fdeaea] text-[#dc2626]',
  parcial: 'bg-[#fdf5e2] text-[#a16207]',
  no_aplica: 'bg-[#f2f3f5] text-[#8a909c]',
};

const PAGO_LABEL: Record<string, string> = {
  pagado: 'Pagado', por_pagar: 'Se le debe', parcial: 'Abonado', no_aplica: '—',
};

const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  partidas: readonly PartidaCalculada[];
  canEdit: boolean;
  onEditar: (p: PartidaCalculada) => void;
  onBorrar: (p: PartidaCalculada) => void;
  onMarcarPagado: (p: PartidaCalculada) => void;
}

/**
 * La hoja del vehículo, renglón por renglón.
 *
 * Reproduce lo que administración escribe a mano: qué se puso, qué costó, en
 * cuánto se vendió y quién lo vendió. Las dos columnas de dinero van juntas a
 * propósito, porque la comparación entre ellas es todo el punto de la hoja.
 */
export default function TablaPartidas({ partidas, canEdit, onEditar, onBorrar, onMarcarPagado }: Props) {
  if (partidas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#d5d9e0] py-12 text-center">
        <Wrench className="mb-2 h-8 w-8 text-[#d5d9e0]" aria-hidden />
        <p className="text-[13px] font-medium text-[#8a909c]">Este vehículo aún no tiene renglones</p>
        <p className="text-[12px] text-[#9ba1ab]">Agrega lo que se le hizo y lo que costó para ver la ganancia.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#e8eaed]">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className="border-b border-[#e8eaed] bg-[#fafbfc]">
            <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#5b616e]">Concepto</th>
            <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#5b616e]">Origen</th>
            <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#5b616e]">Proveedor</th>
            <th scope="col" className="px-3 py-2.5 text-center text-[11px] font-semibold text-[#5b616e]">Cant.</th>
            <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-semibold text-[#5b616e]">Costo</th>
            <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-semibold text-[#5b616e]">Se cobra</th>
            <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-semibold text-[#5b616e]">Ganancia</th>
            <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#5b616e]">Pago</th>
            {canEdit && <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#5b616e]" />}
          </tr>
        </thead>

        <tbody>
          {partidas.map(p => (
            <tr key={p.id} className={cn('border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]', p.utilidad < 0 && 'bg-[#fffafa]')}>
              <td className="px-3 py-2.5">
                <span className="block text-[12.5px] font-medium leading-tight text-[#16181d]">{p.descripcion}</span>
                <span className="num block text-[10.5px] text-[#9ba1ab]">
                  {TIPO_LABEL[p.tipo] || p.tipo} · {String(p.fecha).slice(8, 10)}/{String(p.fecha).slice(5, 7)}/{String(p.fecha).slice(0, 4)}
                </span>
              </td>

              <td className="px-3 py-2.5">
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[10.5px] font-medium',
                  p.origen === 'cliente' ? 'bg-[#e7f0fe] text-[#1d4ed8]' : 'bg-[#f2f3f5] text-[#5b616e]',
                )}>
                  {p.origen === 'cliente' ? <User className="h-3 w-3" aria-hidden /> : <Wrench className="h-3 w-3" aria-hidden />}
                  {p.origen === 'cliente' ? 'Lo trajo' : 'Taller'}
                </span>
              </td>

              <td className="px-3 py-2.5 text-[12px] text-[#3d4350]">
                {p.origen === 'cliente' ? <span className="text-[#c2c7d0]">—</span> : (
                  <span className="flex items-center gap-1">
                    {p.proveedor || <span className="text-[#dc2626]">Sin indicar</span>}
                    {p.enlace && (
                      <a href={p.enlace} target="_blank" rel="noreferrer" aria-label="Abrir enlace de la compra" className="text-[#2563eb] hover:underline">
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </span>
                )}
              </td>

              <td className="num px-3 py-2.5 text-center text-[12px] text-[#5b616e]">{p.cantidad}</td>
              <td className="num px-3 py-2.5 text-right text-[12px] text-[#5b616e]">
                {p.total_costo > 0 ? money(p.total_costo) : <span className="text-[#c2c7d0]">—</span>}
              </td>
              <td className="num px-3 py-2.5 text-right text-[12.5px] font-semibold text-[#16181d]">
                {p.total_venta > 0 ? money(p.total_venta) : <span className="text-[#dc2626]">Sin precio</span>}
              </td>
              <td className={cn('num px-3 py-2.5 text-right text-[12.5px] font-bold', p.utilidad < 0 ? 'text-[#dc2626]' : 'text-[#16a34a]')}>
                {money(p.utilidad)}
                {p.total_venta > 0 && <span className="block text-[10px] font-normal text-[#9ba1ab]">{p.margen}%</span>}
              </td>

              <td className="px-3 py-2.5">
                <span className={cn('inline-block rounded-md px-2 py-[3px] text-[10.5px] font-medium', PAGO_TINTE[p.estado_pago])}>
                  {PAGO_LABEL[p.estado_pago]}
                </span>
                {p.saldo_proveedor > 0 && (
                  <span className="num mt-0.5 block text-[10px] font-semibold text-[#dc2626]">
                    debe {money(p.saldo_proveedor)}
                  </span>
                )}
                {p.fecha_vencimiento && p.saldo_proveedor > 0 && (
                  <span className="num mt-0.5 flex items-center gap-0.5 text-[10px] text-[#c2410c]">
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                    {String(p.fecha_vencimiento).slice(8, 10)}/{String(p.fecha_vencimiento).slice(5, 7)}
                  </span>
                )}
              </td>

              {canEdit && (
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {p.saldo_proveedor > 0 && (
                      <button
                        onClick={() => onMarcarPagado(p)}
                        title="Marcar como pagado al proveedor"
                        className="h-[26px] rounded-md border border-[#bbf7d0] bg-[#e8f7ee] px-2 text-[10.5px] font-semibold text-[#15803d] hover:bg-[#d6f0e0]"
                      >
                        Pagar
                      </button>
                    )}
                    <button
                      onClick={() => onEditar(p)}
                      aria-label={`Editar ${p.descripcion}`}
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      onClick={() => onBorrar(p)}
                      aria-label={`Borrar ${p.descripcion}`}
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#dc2626] hover:bg-[#fdeaea]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
