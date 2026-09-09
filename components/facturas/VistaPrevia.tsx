'use client';

import {
  CheckCircle2, ChevronDown, Download, Eye, Mail, MessageCircle, Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ESTADO_LABEL, ESTADO_TINTE, METODO_LABEL, TIPO_LABEL,
  bs, fecha, usd, type Factura,
} from './tipos';

/** Datos fiscales del taller. Salen de la sede activa. */
export interface DatosEmisor {
  nombre: string;
  rif: string;
  direccion: string;
  telefono: string;
  web: string;
}

interface Props {
  factura: Factura | null;
  emisor: DatosEmisor;
  canEdit: boolean;
  onEditar: () => void;
  onPdf: () => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onMarcarPagada: () => void;
  ocupado?: boolean;
}

/**
 * La factura tal como se va a imprimir.
 *
 * Es una vista previa de verdad: los renglones, el subtotal, el IVA y el total
 * salen de la factura guardada, no de un maquetado con cifras de ejemplo. Si el
 * documento no lleva IVA, esa línea no aparece —enseñar «IVA Bs. 0,00» en una
 * nota de entrega confunde a quien la revisa—.
 */
export default function VistaPrevia({
  factura, emisor, canEdit, onEditar, onPdf, onWhatsApp, onEmail, onMarcarPagada, ocupado,
}: Props) {
  const [masOpciones, setMasOpciones] = useState(false);

  if (!factura) {
    return (
      <section className="flex w-full shrink-0 flex-col rounded-xl border border-[#e8eaed] bg-white xl:w-[382px]">
        <header className="flex items-center gap-2 border-b border-[#eef0f3] px-4 py-3">
          <h2 className="flex-1 text-[15px] font-bold text-[#16181d]">Vista previa</h2>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f2f3f5] text-[#c3c8d0]">
            <Eye className="h-[22px] w-[22px]" aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-medium text-[#5b616e]">Ninguna factura seleccionada</p>
          <p className="mt-1 max-w-[240px] text-[12px] leading-snug text-[#9ba1ab]">
            Toca una factura del listado para verla aquí, o crea una nueva.
          </p>
        </div>
      </section>
    );
  }

  const f = factura;
  const items = Array.isArray(f.items) ? f.items : [];
  const enBs = f.total_bs_real || 0;
  const tasa = Number(f.tasa_cambio) || 0;

  // El subtotal se deriva del total: es lo que garantiza que las tres cifras
  // cuadren aunque los renglones se hayan guardado con otro redondeo.
  const totalUsd = Number(f.total) || 0;
  const subtotalUsd = f.con_iva ? Math.round((totalUsd / 1.16) * 100) / 100 : totalUsd;
  const ivaUsd = Math.round((totalUsd - subtotalUsd) * 100) / 100;

  const aBs = (n: number) => (tasa > 0 ? n * tasa : 0);
  const ver = (n: number) => (tasa > 0 ? bs(aBs(n)) : usd(n));

  const metodos = Object.entries(f.metodos_pago || {})
    .filter(([, v]) => (Number(v) || 0) > 0)
    .map(([k]) => METODO_LABEL[k] || k);

  return (
    <section className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white xl:w-[382px]">
      <header className="flex items-center gap-2 border-b border-[#eef0f3] px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[15px] font-bold text-[#16181d]">Vista previa</h2>
        <span className="flex items-center gap-1.5 rounded-lg bg-[#fff1e7] px-2.5 py-1 text-[11.5px] font-semibold text-[#f97316]">
          <Eye className="h-3.5 w-3.5" aria-hidden />
          Vista previa
        </span>
        <button
          onClick={onEditar}
          disabled={!canEdit}
          className="flex h-[30px] items-center gap-1 rounded-lg border border-[#e2e5ea] px-2.5 text-[11.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-45"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Editar
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* ── El documento ──────────────────────────────────────────── */}
        <article className="overflow-hidden rounded-xl border border-[#e8eaed]">
          <div className="flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#16181d] text-[13px] font-black text-[#f97316]" aria-hidden>
              LT
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold leading-tight text-[#16181d]">{emisor.nombre}</p>
              <p className="text-[9.5px] uppercase tracking-widest text-[#8a909c]">Taller automotriz</p>
            </div>
            <div className="shrink-0 text-right text-[9px] leading-snug text-[#8a909c]">
              <p className="num">RIF: {emisor.rif}</p>
              <p>{emisor.direccion}</p>
              <p className="num">{emisor.telefono}</p>
              <p>{emisor.web}</p>
            </div>
          </div>

          <div className="px-4">
            <p className="text-right text-[15px] font-extrabold tracking-tight text-[#16181d]">
              {(TIPO_LABEL[f.tipo || ''] || 'Factura').toUpperCase()}
            </p>
            <p className="num mt-1 text-right">
              <span className="inline-block rounded-md bg-[#f97316] px-2.5 py-1 text-[12px] font-bold text-white">
                Nº {f.correlativo || '—'}
              </span>
            </p>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 px-4 text-[10px]">
            <Par k="Fecha de emisión" v={fecha(f.fecha_emision)} />
            <Par k="Vehículo" v={f.vehiculo || '—'} />
            <Par k="Cliente" v={f.cliente || 'Consumidor Final'} />
            <Par k="Moneda" v={f.moneda || 'USD'} />
            <Par k="Emitida por" v={f.emitido_por || '—'} />
            <Par k="Tasa" v={tasa > 0 ? `${tasa.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Bs/$` : '—'} />
          </dl>

          <div className="mt-3 overflow-x-auto px-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
                  <th scope="col" className="py-1.5 pr-2 text-left text-[9px] font-semibold text-[#5b616e]">Descripción</th>
                  <th scope="col" className="px-1 py-1.5 text-center text-[9px] font-semibold text-[#5b616e]">Cant.</th>
                  <th scope="col" className="px-1 py-1.5 text-right text-[9px] font-semibold text-[#5b616e]">P. Unitario</th>
                  <th scope="col" className="py-1.5 pl-1 text-right text-[9px] font-semibold text-[#5b616e]">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-[10.5px] italic text-[#9ba1ab]">
                      Esta factura no tiene el desglose guardado.
                    </td>
                  </tr>
                ) : items.map((it, i) => (
                  <tr key={i} className="border-b border-[#f4f5f7] last:border-0">
                    <td className="py-1.5 pr-2 text-[10px] leading-snug text-[#16181d]">{it.descripcion}</td>
                    <td className="num px-1 py-1.5 text-center text-[10px] text-[#5b616e]">{it.cantidad}</td>
                    <td className="num px-1 py-1.5 text-right text-[10px] text-[#5b616e]">{ver(Number(it.precio_unitario) || 0)}</td>
                    <td className="num py-1.5 pl-1 text-right text-[10px] font-medium text-[#16181d]">{ver(Number(it.total) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-2 space-y-1 px-4">
            <Linea k="Subtotal" v={ver(subtotalUsd)} />
            {/* Sin IVA no se enseña la línea: un «IVA Bs. 0,00» en una nota de
                entrega hace dudar de si se olvidó aplicarlo. */}
            {f.con_iva && <Linea k="IVA (16%)" v={ver(ivaUsd)} />}
            <div className="mt-1.5 flex items-center justify-between rounded-lg bg-[#fff4ec] px-2.5 py-1.5">
              <dt className="text-[11.5px] font-bold text-[#c2410c]">Total</dt>
              <dd className="num text-[12.5px] font-extrabold text-[#c2410c]">
                {tasa > 0 ? bs(enBs) : usd(totalUsd)}
              </dd>
            </div>
            {tasa > 0 && (
              <p className="num text-right text-[9.5px] text-[#9ba1ab]">Equivale a {usd(totalUsd)}</p>
            )}
          </dl>

          <dl className="mt-2.5 space-y-0.5 px-4 text-[10px]">
            <div className="flex gap-1.5">
              <dt className="font-semibold text-[#16181d]">Método de pago:</dt>
              <dd className="text-[#5b616e]">{metodos.join(', ') || '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold text-[#16181d]">Estado:</dt>
              <dd>
                <span className={cn('rounded px-1.5 py-px text-[9.5px] font-semibold', ESTADO_TINTE[f.estado || ''] || 'bg-[#f2f3f5] text-[#8a909c]')}>
                  {ESTADO_LABEL[f.estado || ''] || f.estado || '—'}
                </span>
              </dd>
            </div>
          </dl>

          <div className="mt-3 bg-[#fff7ed] px-4 py-3 text-center">
            <p className="text-[11px] font-bold text-[#16181d]">¡Gracias por confiar en {emisor.nombre}!</p>
            <p className="text-[9.5px] text-[#9a5b2c]">Tu vehículo, en las mejores manos.</p>
          </div>
        </article>

        {/* ── Acciones ──────────────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <Accion icono={<Download className="h-4 w-4" aria-hidden />} label="Descargar PDF" onClick={onPdf} />
          <Accion icono={<MessageCircle className="h-4 w-4" aria-hidden />} label="Enviar por WhatsApp" onClick={onWhatsApp} verde />
          <Accion icono={<Mail className="h-4 w-4" aria-hidden />} label="Enviar por email" onClick={onEmail} />
        </div>

        {f.estado !== 'pagado' && (
          <button
            onClick={onMarcarPagada}
            disabled={!canEdit || ocupado}
            className="mt-2 flex h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#16a34a] text-[13px] font-semibold text-white transition-colors hover:bg-[#15803d] disabled:opacity-45"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Marcar como pagada
          </button>
        )}

        <div className="relative mt-2">
          <button
            onClick={() => setMasOpciones(v => !v)}
            aria-expanded={masOpciones}
            className="flex h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-[#e2e5ea] text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            Más opciones
            <ChevronDown className={cn('h-4 w-4 transition-transform', masOpciones && 'rotate-180')} aria-hidden />
          </button>

          {masOpciones && (
            <div className="mt-2 space-y-1 rounded-lg border border-[#e8eaed] p-2">
              <dl className="space-y-1 text-[11.5px]">
                <Meta k="Origen" v={f.modulo_origen || '—'} />
                <Meta k="Documento" v={TIPO_LABEL[f.tipo || ''] || f.tipo || '—'} />
                {f.notas && <Meta k="Notas" v={f.notas} />}
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Par({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt className="shrink-0 text-[#8a909c]">{k}:</dt>
      <dd className="num min-w-0 truncate font-medium text-[#16181d]">{v}</dd>
    </div>
  );
}

function Linea({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-[10.5px]">
      <dt className="text-[#5b616e]">{k}</dt>
      <dd className="num font-medium text-[#16181d]">{v}</dd>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-[#8a909c]">{k}:</dt>
      <dd className="min-w-0 flex-1 break-words text-[#3d4350]">{v}</dd>
    </div>
  );
}

function Accion({
  icono, label, onClick, verde,
}: {
  icono: React.ReactNode; label: string; onClick: () => void; verde?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[42px] items-center justify-center gap-2 rounded-lg border text-[12.5px] font-medium transition-colors',
        verde
          ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d] hover:bg-[#dcfce7]'
          : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9]',
      )}
    >
      {icono}
      {label}
    </button>
  );
}
