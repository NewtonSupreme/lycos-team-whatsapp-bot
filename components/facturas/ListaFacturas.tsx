'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Eye,
  Loader2, MoreHorizontal, Search, SlidersHorizontal, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ESTADO_LABEL, ESTADO_TINTE, TIPO_LABEL, bs, fecha, normaliza,
  type Factura, type ResumenFacturas,
} from './tipos';

type Pestana = 'todas' | 'pagadas' | 'pendientes' | 'anuladas' | 'notas';

interface Props {
  facturas: readonly Factura[];
  conteos: ResumenFacturas['conteos'];
  cargando: boolean;
  seleccionada: string | null;
  canEdit: boolean;
  onSeleccionar: (f: Factura) => void;
  onPdf: (f: Factura) => void;
  onAnular: (f: Factura) => void;
  onExportar: (lista: readonly Factura[]) => void;
}

/**
 * El listado de facturas.
 *
 * Filtra en memoria sobre lo que ya vino del servidor: son cientos de filas y
 * una tabla que reconsulta a cada tecla se siente peor de lo que rinde. Las
 * pestañas y el buscador se combinan, así que «Pendientes» + un nombre da las
 * pendientes de ese cliente.
 */
export default function ListaFacturas({
  facturas, conteos, cargando, seleccionada, canEdit,
  onSeleccionar, onPdf, onAnular, onExportar,
}: Props) {
  const [pestana, setPestana] = useState<Pestana>('todas');
  const [busca, setBusca] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [verFechas, setVerFechas] = useState(false);
  const [porPagina, setPorPagina] = useState(10);
  const [paginaPedida, setPagina] = useState(1);
  const [menu, setMenu] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = normaliza(busca.trim());
    return facturas.filter(f => {
      if (pestana === 'pagadas' && f.estado !== 'pagado') return false;
      if (pestana === 'pendientes' && f.estado !== 'pendiente') return false;
      if (pestana === 'anuladas' && f.estado !== 'anulado' && f.estado !== 'anulada') return false;
      if (pestana === 'notas' && f.tipo !== 'nota_credito') return false;
      if (desde && (f.fecha_emision || '') < desde) return false;
      if (hasta && (f.fecha_emision || '') > hasta) return false;
      if (!q) return true;
      return normaliza(
        `${f.correlativo || ''} ${f.cliente || ''} ${f.vehiculo || ''} ${f.emitido_por || ''}`,
      ).includes(q);
    });
  }, [facturas, pestana, busca, desde, hasta]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  // La página se acota al calcular: sincronizarla desde un efecto añadiría un
  // render extra en cada filtrado.
  const pagina = Math.min(paginaPedida, totalPaginas);
  const inicio = (pagina - 1) * porPagina;
  const visibles = filtradas.slice(inicio, inicio + porPagina);

  const pestanas: { id: Pestana; label: string; n: number }[] = [
    { id: 'todas', label: 'Todas', n: conteos.todas },
    { id: 'pagadas', label: 'Pagadas', n: conteos.pagadas },
    { id: 'pendientes', label: 'Pendientes', n: conteos.pendientes },
    { id: 'anuladas', label: 'Anuladas', n: conteos.anuladas },
    { id: 'notas', label: 'Notas de crédito', n: conteos.notasCredito },
  ];

  const hayFiltros = busca.trim() !== '' || desde !== '' || hasta !== '';

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      {/* ── Pestañas ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-4" role="tablist">
        {pestanas.map(p => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => { setPestana(p.id); setPagina(1); }}
            className={cn(
              'num h-[32px] rounded-lg px-3 text-[12.5px] font-medium transition-colors',
              pestana === p.id
                ? 'bg-[#f97316] font-semibold text-white'
                : 'bg-[#f4f5f7] text-[#5b616e] hover:bg-[#e8eaed]',
            )}
          >
            {p.label} ({p.n})
          </button>
        ))}
      </div>

      {/* ── Buscador ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
          <input
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por cliente, Nº de factura, vehículo o servicio..."
            aria-label="Buscar factura"
            className="h-[42px] w-full rounded-lg border border-[#e2e5ea] pl-10 pr-3 text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316]"
          />
        </div>

        <button
          onClick={() => setVerFechas(v => !v)}
          aria-expanded={verFechas}
          className={cn(
            'flex h-[42px] shrink-0 items-center gap-2 rounded-lg border px-3.5 text-[12.5px] font-medium transition-colors',
            verFechas || hayFiltros
              ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]'
              : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9]',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtros
        </button>

        <button
          onClick={() => onExportar(filtradas)}
          aria-label="Exportar esta vista"
          title={`Exportar las ${filtradas.length} facturas de esta vista`}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
        >
          <Download className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {verFechas && (
        <div className="flex flex-wrap items-end gap-2.5 border-t border-[#f2f3f5] px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#5b616e]">Desde</span>
            <input
              type="date" value={desde}
              onChange={e => { setDesde(e.target.value); setPagina(1); }}
              className="num h-[38px] rounded-lg border border-[#e2e5ea] px-2.5 text-[12.5px] outline-none focus:border-[#f97316]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#5b616e]">Hasta</span>
            <input
              type="date" value={hasta}
              onChange={e => { setHasta(e.target.value); setPagina(1); }}
              className="num h-[38px] rounded-lg border border-[#e2e5ea] px-2.5 text-[12.5px] outline-none focus:border-[#f97316]"
            />
          </label>
          <button
            onClick={() => { setBusca(''); setDesde(''); setHasta(''); setPagina(1); }}
            disabled={!hayFiltros}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-40"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Limpiar
          </button>
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
              {['Nº Factura', 'Fecha', 'Cliente', 'Vehículo', 'Total', 'Estado', 'Acciones'].map(h => (
                <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e] first:pl-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {cargando && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
                  <span className="mt-2 block text-[12.5px] text-[#8a909c]">Cargando facturas…</span>
                </td>
              </tr>
            )}

            {!cargando && visibles.map(f => (
              <tr
                key={f.id}
                onClick={() => onSeleccionar(f)}
                className={cn(
                  'cursor-pointer border-b border-[#f2f3f5] last:border-0 transition-colors',
                  seleccionada === f.id ? 'bg-[#fff4ec]' : 'hover:bg-[#fafbfc]',
                )}
              >
                <td className="num py-2 pl-4 pr-3 text-[12px] font-semibold text-[#16181d]">
                  {f.correlativo || '—'}
                </td>
                <td className="num px-3 py-2 text-[12px] text-[#5b616e]">{fecha(f.fecha_emision)}</td>
                <td className="max-w-[150px] truncate px-3 py-2 text-[12px] text-[#3d4350]">
                  {f.cliente || 'Consumidor Final'}
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 text-[12px] text-[#8a909c]">
                  {f.vehiculo || '—'}
                </td>
                <td className="num px-3 py-2 text-[12px] font-semibold text-[#16181d]">
                  {bs(f.total_bs_real)}
                </td>
                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex rounded-md px-2 py-[3px] text-[11px] font-medium',
                    ESTADO_TINTE[f.estado || ''] || 'bg-[#f2f3f5] text-[#8a909c]',
                  )}>
                    {ESTADO_LABEL[f.estado || ''] || f.estado || '—'}
                  </span>
                </td>
                <td className="relative px-3 py-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setMenu(m => (m === f.id ? null : f.id))}
                    aria-label={`Acciones para ${f.correlativo || 'la factura'}`}
                    aria-expanded={menu === f.id}
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>

                  {menu === f.id && (
                    <div className="absolute right-3 top-[42px] z-20 w-[196px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                      <Opcion
                        icono={<Eye className="h-4 w-4" aria-hidden />}
                        label="Ver en la vista previa"
                        onClick={() => { setMenu(null); onSeleccionar(f); }}
                      />
                      <Opcion
                        icono={<Download className="h-4 w-4" aria-hidden />}
                        label="Descargar PDF"
                        onClick={() => { setMenu(null); onPdf(f); }}
                      />
                      <Opcion
                        icono={<XCircle className="h-4 w-4" aria-hidden />}
                        label="Anular factura"
                        peligro
                        disabled={!canEdit || f.estado === 'anulado' || f.estado === 'anulada'}
                        onClick={() => { setMenu(null); onAnular(f); }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-[#8a909c]">
                  {facturas.length === 0
                    ? 'No hay facturas emitidas todavía.'
                    : 'Ninguna factura coincide con esos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[#f2f3f5] px-4 py-3">
        <p className="num min-w-0 flex-1 text-[12px] text-[#8a909c]">
          {filtradas.length === 0
            ? 'Sin facturas que mostrar'
            : `Mostrando ${inicio + 1} a ${inicio + visibles.length} de ${filtradas.length} facturas`}
        </p>

        <nav className="flex items-center gap-1.5" aria-label="Paginación de facturas">
          <BotonPag onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} label="Anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </BotonPag>
          {paginasVisibles(pagina, totalPaginas).map((n, i) =>
            n === 0 ? (
              <span key={`e${i}`} className="px-1 text-[12px] text-[#c3c8d0]" aria-hidden>…</span>
            ) : (
              <button
                key={n}
                onClick={() => setPagina(n)}
                aria-current={n === pagina ? 'page' : undefined}
                className={cn(
                  'num h-[32px] min-w-[32px] rounded-lg border px-2 text-[12.5px] font-medium transition-colors',
                  n === pagina
                    ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]'
                    : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
                )}
              >
                {n}
              </button>
            ))}
          <BotonPag onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} label="Siguiente">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </BotonPag>
        </nav>

        <div className="relative shrink-0">
          <select
            value={porPagina}
            onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}
            aria-label="Facturas por página"
            className="h-[34px] appearance-none rounded-lg border border-[#e2e5ea] pl-2.5 pr-7 text-[12px] font-medium text-[#3d4350] outline-none focus:border-[#f97316]"
          >
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} por página</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
        </div>
      </div>
    </section>
  );
}

/** Primeras, últimas y las de alrededor. El 0 marca los puntos suspensivos. */
function paginasVisibles(actual: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, actual - 1, actual, actual + 1, total - 1, total]);
  const orden = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: number[] = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) out.push(0);
    out.push(n);
  });
  return out;
}

function Opcion({
  icono, label, onClick, disabled, peligro,
}: {
  icono: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; peligro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors disabled:opacity-40 disabled:hover:bg-transparent',
        peligro
          ? 'border-t border-[#f2f3f5] text-[#dc2626] hover:bg-[#fdeaea]'
          : 'text-[#3d4350] hover:bg-[#f6f7f9]',
      )}
    >
      {icono}
      {label}
    </button>
  );
}

function BotonPag({
  children, onClick, disabled, label,
}: {
  children: React.ReactNode; onClick: () => void; disabled: boolean; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-[32px] w-[32px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] transition-colors hover:bg-[#f6f7f9] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Se exporta para que la cabecera pueda mostrar el tipo del documento. */
export { TIPO_LABEL };
