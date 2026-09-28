'use client';

import {
  AlertTriangle, CheckCircle2, ClipboardList, DollarSign, Lock,
  Pencil, Plus, Trash2, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItemOrden, PartidaCalculada, ServicioFicha } from '@/lib/ficha/vehiculo';

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO_TINTE: Record<string, string> = {
  pendiente: 'bg-[#fdf5e2] text-[#a16207]',
  en_proceso: 'bg-[#e7f0fe] text-[#1d4ed8]',
  en_revision: 'bg-[#f3e8ff] text-[#7e22ce]',
  confirmada: 'bg-[#e7f0fe] text-[#1d4ed8]',
  completada: 'bg-[#e8f7ee] text-[#15803d]',
  finalizado: 'bg-[#e8f7ee] text-[#15803d]',
  cancelada: 'bg-[#fdeaea] text-[#dc2626]',
};

interface Props {
  servicio: ServicioFicha;
  /** Los renglones de la ficha, para localizar el que costea cada item. */
  partidas: readonly PartidaCalculada[];
  canEdit: boolean;
  /** Anotar en la ficha lo que costó este renglón. */
  onCostear: (it: ItemOrden) => void;
  /** Editar el renglón de la ficha que ya costea este item. */
  onEditarPartida: (p: PartidaCalculada) => void;
  /** Sacar el renglón de la orden: deja de cobrársele al cliente. */
  onQuitar: (it: ItemOrden) => void;
  /** Añadir un renglón nuevo a esta orden. */
  onAgregar: () => void;
}

/**
 * La orden de trabajo del servicio elegido.
 *
 * Es el lado que faltaba de la ficha. La ficha enseñaba los costos del taller,
 * pero lo que se le COBRA al cliente vivía solo en la orden y no se podía tocar
 * desde aquí: un renglón mal anotado se cobraba igual, y los renglones que la
 * ficha ofrecía añadir solo se podían aceptar, nunca descartar.
 *
 * Ahora las dos mitades están una junto a la otra y se editan en el mismo
 * sitio: cada renglón dice lo que se cobra y si ya tiene costo anotado. Quitarlo
 * baja el precio de la orden en el acto.
 */
export default function OrdenDeTrabajo({
  servicio, partidas, canEdit, onCostear, onEditarPartida, onQuitar, onAgregar,
}: Props) {
  const editable = canEdit && servicio.abierto;

  /** El renglón de la ficha que costea este item de la orden. */
  const partidaDe = (it: ItemOrden) =>
    partidas.find(p =>
      (p.clave_item || p.descripcion).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim() === it.clave
      && (p.servicio_id === servicio.id || !p.servicio_id)) || null;

  // Lo que suman los renglones contra lo que la orden dice cobrar. Deberían ser
  // lo mismo: `costo_estimado` se recalcula desde los renglones en cada cambio.
  // Que difieran significa que a la orden le tocaron el total a mano.
  const descuadre = Math.abs(servicio.totalItems - servicio.monto) >= 0.5
    && servicio.monto > 0 && servicio.items.length > 0;

  return (
    <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-[#eef0f3] px-4 py-3.5">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#e7f0fe] text-[#2563eb]">
          <ClipboardList className="h-[19px] w-[19px]" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-extrabold text-[#16181d]">
            {servicio.descripcion || servicio.tipo_personalizado || servicio.tipo || 'Orden de trabajo'}
          </h2>
          <p className="num flex flex-wrap items-center gap-x-2 text-[11.5px] text-[#8a909c]">
            <span>{servicio.fecha ? String(servicio.fecha).slice(0, 10) : 'sin fecha'}</span>
            <span
              className={cn(
                'rounded-md px-1.5 py-px text-[10.5px] font-semibold',
                ESTADO_TINTE[String(servicio.estado || '').toLowerCase()] || 'bg-[#f2f3f5] text-[#5b616e]',
              )}
            >
              {String(servicio.estado || 'sin estado').replace('_', ' ')}
            </span>
            <span>{servicio.items.length} renglón(es)</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10.5px] text-[#8a909c]">Se le cobra al cliente</p>
          <p className="num text-[19px] font-extrabold leading-tight text-[#16181d]">
            {money(servicio.totalItems || servicio.monto)}
          </p>
        </div>

        {editable && (
          <button
            onClick={onAgregar}
            className="flex h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Renglón
          </button>
        )}
      </header>

      {/* Un trabajo cerrado no se toca: cambiarle el precio es reescribir algo
          que ya se cobró y se asentó en caja. */}
      {canEdit && !servicio.abierto && (
        <p className="flex items-start gap-2 border-b border-[#eef0f3] bg-[#fafbfc] px-4 py-2.5 text-[11.5px] leading-snug text-[#5b616e]">
          <Lock className="mt-px h-3.5 w-3.5 shrink-0 text-[#8a909c]" aria-hidden />
          Este trabajo está <strong className="font-semibold">{String(servicio.estado).replace('_', ' ')}</strong>,
          así que sus renglones no se editan desde aquí: el precio ya se le cobró al cliente.
          Ábrelo en Servicios si de verdad hay que corregirlo. Los costos del taller sí
          se pueden seguir anotando en la ficha.
        </p>
      )}

      {descuadre && (
        <p className="flex items-start gap-2 border-b border-[#eef0f3] bg-[#fff8f3] px-4 py-2.5 text-[11.5px] leading-snug text-[#9a3412]">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Los renglones suman <strong className="num font-semibold">{money(servicio.totalItems)}</strong> pero
          la orden dice <strong className="num font-semibold">{money(servicio.monto)}</strong>. El total se
          escribió a mano; al tocar cualquier renglón se recalculará desde el desglose.
        </p>
      )}

      {servicio.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <ClipboardList className="mb-2 h-8 w-8 text-[#d5d9e0]" aria-hidden />
          <p className="text-[13px] font-medium text-[#8a909c]">Esta orden no tiene desglose</p>
          <p className="mt-0.5 max-w-xs text-[11.5px] text-[#9ba1ab]">
            {editable
              ? 'Agrega los renglones y el precio de la orden se irá calculando solo.'
              : 'Se registró con un monto total, sin detallar qué se hizo.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-b border-[#e8eaed] bg-[#fafbfc]">
                <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-[#5b616e]">Renglón de la orden</th>
                <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-[#5b616e]">Cant.</th>
                <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-[#5b616e]">Precio u.</th>
                <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-[#5b616e]">Se cobra</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-[#5b616e]">Costo del taller</th>
                {canEdit && <th scope="col" className="px-4 py-2 text-right text-[11px] font-semibold text-[#5b616e]">Acciones</th>}
              </tr>
            </thead>

            <tbody>
              {servicio.items.map((it, i) => {
                const cantidad = Number(it.cantidad) || 1;
                const unidad = Number(it.precio_unitario) || 0;
                const total = Number(it.total) || cantidad * unidad;
                const pt = it.enFicha ? partidaDe(it) : null;

                return (
                  <tr key={`${it.clave}-${i}`} className="border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]">
                    <td className="px-4 py-2.5">
                      <span className="block text-[12.5px] font-medium leading-tight text-[#16181d]">
                        {it.descripcion}
                      </span>
                      <span className="num block text-[10.5px] text-[#9ba1ab]">
                        {it.es_mano_obra ? 'Mano de obra'
                          : it.inventario_id ? 'Del inventario' : 'Renglón libre'}
                        {Number(it.stock_descontado) > 0 && ` · ${it.stock_descontado} descontada(s) del almacén`}
                      </span>
                    </td>

                    <td className="num px-3 py-2.5 text-center text-[12px] text-[#5b616e]">{cantidad}</td>
                    <td className="num px-3 py-2.5 text-right text-[12px] text-[#5b616e]">{money(unidad)}</td>
                    <td className="num px-3 py-2.5 text-right text-[12.5px] font-semibold text-[#16181d]">
                      {total > 0 ? money(total) : <span className="text-[#dc2626]">Sin precio</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      {pt ? (
                        <span className="inline-flex items-center gap-1 text-[11.5px]">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#16a34a]" aria-hidden />
                          <span className="num font-semibold text-[#16181d]">{money(pt.total_costo)}</span>
                          <span className={cn('num', pt.utilidad < 0 ? 'text-[#dc2626]' : 'text-[#16a34a]')}>
                            ({pt.utilidad >= 0 ? '+' : ''}{money(pt.utilidad)})
                          </span>
                        </span>
                      ) : it.es_mano_obra ? (
                        <span className="text-[11.5px] text-[#9ba1ab]">No lleva costo</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#fdf5e2] px-2 py-[3px] text-[10.5px] font-medium text-[#a16207]">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Falta el costo
                        </span>
                      )}
                    </td>

                    {canEdit && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {pt ? (
                            <button
                              onClick={() => onEditarPartida(pt)}
                              aria-label={`Editar el costo de ${it.descripcion}`}
                              title="Editar costo, proveedor y precio"
                              className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : (
                            <button
                              onClick={() => onCostear(it)}
                              title="Anotar cuánto costó al taller"
                              className="flex h-[26px] items-center gap-1 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 text-[10.5px] font-semibold text-[#c2410c] hover:bg-[#ffedd5]"
                            >
                              <DollarSign className="h-3 w-3" aria-hidden />
                              Costear
                            </button>
                          )}

                          {/* El botón que faltaba: sacar el renglón de la orden. */}
                          <button
                            onClick={() => onQuitar(it)}
                            disabled={!editable}
                            aria-label={`Quitar ${it.descripcion} de la orden`}
                            title={editable
                              ? 'Quitar de la orden: deja de cobrársele al cliente'
                              : 'El trabajo está cerrado; ábrelo en Servicios para corregirlo'}
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#dc2626] hover:bg-[#fdeaea] disabled:cursor-not-allowed disabled:border-[#eef0f3] disabled:text-[#c3c8d0] disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t border-[#e8eaed] bg-[#fafbfc]">
                <td colSpan={3} className="px-4 py-2.5 text-[11.5px] font-semibold text-[#5b616e]">
                  Total de la orden
                </td>
                <td className="num px-3 py-2.5 text-right text-[14px] font-extrabold text-[#16181d]">
                  {money(servicio.totalItems)}
                </td>
                <td className="num px-3 py-2.5 text-[11.5px] text-[#5b616e]">
                  {servicio.costoFicha > 0 ? `costó ${money(servicio.costoFicha)}` : ''}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Mano de obra y nómina: quién hizo el trabajo y cuánto le quedó. */}
      <div className="border-t border-[#e8eaed] px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Wrench className="h-4 w-4 text-[#f97316]" aria-hidden />
          <h3 className="text-[12.5px] font-bold text-[#16181d]">Mano de obra y nómina</h3>
          {servicio.nomina.length > 0 && (
            <span className="num ml-auto text-[11.5px] text-[#5b616e]">
              Mecánicos <strong className="text-[#16181d]">{money(servicio.comisiones)}</strong>
              {' · '}le queda al taller{' '}
              <strong className="text-[#15803d]">
                {money(Math.max(0, servicio.totalItems - servicio.costoFicha - servicio.comisiones))}
              </strong>
            </span>
          )}
        </div>
        {servicio.nomina.length === 0 ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-[#fff4ec] px-3 py-2 text-[11.5px] text-[#c2410c]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Esta orden no tiene mecánico asignado en la nómina: nadie cobra comisión por ella.
            Asígnalo en la orden de servicio.
          </p>
        ) : (
          <ul className="divide-y divide-[#f2f3f5] rounded-lg border border-[#eef0f3]">
            {servicio.nomina.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[12px]">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-[#16181d]">{t.empleado}</span>
                  {t.esOverride && <span className="ml-1.5 rounded bg-[#f0eafc] px-1 text-[10px] font-bold text-[#7c3aed]">SUPERVISIÓN</span>}
                  <span className="block truncate text-[11px] text-[#8a909c]" title={t.regla || undefined}>
                    {t.descripcion || 'Trabajo de la orden'}{t.regla ? ` · ${t.regla}` : ''}
                  </span>
                </span>
                <span className="num text-[11.5px] text-[#5b616e]">mano de obra {money(t.manoObra)}</span>
                <span className={cn('num font-bold', t.comision > 0 ? 'text-[#16181d]' : 'text-[#c2410c]')}>
                  {t.comision > 0 ? `le quedó ${money(t.comision)}` : 'comisión sin definir'}
                </span>
                <span className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold',
                  t.estado === 'liquidado' ? 'bg-[#e8f7ee] text-[#15803d]'
                    : servicio.abierto ? 'bg-[#f2f3f5] text-[#5b616e]' : 'bg-[#fdf5e2] text-[#a16207]',
                )}>
                  {t.estado === 'liquidado' ? 'Pagado' : servicio.abierto ? 'Al entregar' : 'Por pagar'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
