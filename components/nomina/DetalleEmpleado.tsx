'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, CalendarDays, Check, ChevronDown, FileDown,
  Loader2, Search, Sparkle, Wallet, X,
} from 'lucide-react';
import ModalPortal from '@/components/ui/modal-portal';
import { cn } from '@/lib/utils';
import { zonaLabel } from '@/lib/nomina/reglas';
import type { CommissionRule, EmployeeEarnings, JobAssignment } from '@/types';

interface ReglaLegible extends CommissionRule { explicacion: string; avisos: string[] }

interface Pago {
  id: string; recibo_numero: string | null; periodo_inicio: string; periodo_fin: string;
  total_pagar: number; metodo_pago: string | null; estado: string; created_at: string;
}

interface Perfil {
  id: string; nombre: string; alias: string | null; cedula: string | null; rol: string;
  especialidad: string | null; cargo: string | null; area: string | null;
  tipo_contrato: string | null; fecha_ingreso: string | null; activo: boolean;
}

interface Resumen {
  trabajos: number; comisionTotal: number; pendiente: number; cobrado: number;
  desde: string | null; hasta: string | null;
  porZona: { zona: string; trabajos: number; comision: number; manoObra: number }[];
  porMes: { mes: string; trabajos: number; comision: number }[];
}

interface Datos {
  perfil: Perfil;
  reglas: ReglaLegible[];
  sinReglas: boolean;
  periodo: EmployeeEarnings | null;
  trabajos: JobAssignment[];
  pagos: Pago[];
  resumen: Resumen;
}

interface Props {
  empleadoId: string;
  sedeId: string | null;
  range: { inicio: string; fin: string };
  /** Etiqueta del período que se está viendo, para no repetir fechas sueltas. */
  periodoLabel?: string;
  onClose: () => void;
  onHoja?: (e: EmployeeEarnings) => void;
  onLiquidar?: (e: EmployeeEarnings) => void;
}

/** El estado del trabajo no está en el tipo público, pero sí en la fila. */
type JobConEstado = JobAssignment & { estado?: string };

const usd = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso?: string | null) =>
  iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(2, 4)}` : '—';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] || '?'} ${m.slice(2, 4)}`;

type Pestana = 'resumen' | 'trabajos' | 'reglas' | 'pagos';

/**
 * La hoja de una persona: lo que le toca y por qué.
 *
 * Nace de una pregunta concreta del taller: si a alguien se le configuraron
 * reglas de pago y se le asignaron trabajos, tiene que poder verse su parte y
 * el historial de los servicios en los que estuvo. Antes el detalle mostraba
 * solo los trabajos de la semana en curso, sin las reglas y sin nada anterior:
 * si la cifra no cuadraba, no había forma de rastrear de dónde salía.
 *
 * Aquí las tres piezas van juntas —reglas, período e historial completo— y cada
 * trabajo dice a qué orden pertenece, con qué regla se calculó y si ya se pagó.
 */
export default function DetalleEmpleado({
  empleadoId, sedeId, range, periodoLabel, onClose, onHoja, onLiquidar,
}: Props) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Pestana>('resumen');
  const [busca, setBusca] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const q = new URLSearchParams({ id: empleadoId, inicio: range.inicio, fin: range.fin });
      if (sedeId) q.set('sede', sedeId);
      const r = await fetch(`/api/nomina/empleado?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar la ficha');
      setDatos(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, [empleadoId, sedeId, range.inicio, range.fin]);

  useEffect(() => { cargar(); }, [cargar]);

  // Cerrar con Escape: en un modal casi a pantalla completa el botón queda lejos.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const trabajos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (datos?.trabajos || []).filter(j => {
      if (soloPendientes && (j as JobConEstado).estado === 'liquidado') return false;
      if (!q) return true;
      const texto = [
        j.descripcion, j.tipo_trabajo, j.zona,
        j.desglose?.cliente, j.desglose?.vehiculo, j.desglose?.placa,
      ].filter(Boolean).join(' ').toLowerCase();
      return texto.includes(q);
    });
  }, [datos, busca, soloPendientes]);

  const p = datos?.perfil;
  const periodo = datos?.periodo;
  const reglasActivas = (datos?.reglas || []).filter(r => r.activo !== false);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6">
        <div className="flex min-h-0 w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          style={{ maxHeight: 'calc(100vh - 48px)' }}>

          {/* ── Cabecera ─────────────────────────────────────────────── */}
          <header className="flex shrink-0 items-start gap-3 border-b border-[#eef0f3] px-5 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[13px] font-bold text-[#f97316]" aria-hidden>
              {(p?.nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] font-extrabold tracking-tight text-[#16181d]">
                {p?.nombre || 'Cargando…'}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#8a909c]">
                {p?.cargo && <span>{p.cargo}</span>}
                {p?.area && <span>· {p.area}</span>}
                {p?.cedula && <span className="num">· C.I. {p.cedula}</span>}
                {p?.fecha_ingreso && <span>· desde {fecha(p.fecha_ingreso)}</span>}
                {p && !p.activo && <span className="font-semibold text-[#dc2626]">· inactivo</span>}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {periodo && onHoja && (
                <button
                  onClick={() => onHoja(periodo)}
                  className="hidden h-[34px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] sm:flex"
                >
                  <FileDown className="h-4 w-4" aria-hidden />
                  Hoja de pago
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          {/* ── Pestañas ─────────────────────────────────────────────── */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#eef0f3] px-4" aria-label="Secciones de la ficha">
            {([
              ['resumen', 'Resumen', null],
              ['trabajos', 'Trabajos', datos?.resumen.trabajos ?? null],
              ['reglas', 'Cómo se le paga', reglasActivas.length || null],
              ['pagos', 'Pagos', datos?.pagos.length || null],
            ] as const).map(([id, label, cuenta]) => (
              <button
                key={id}
                onClick={() => setTab(id as Pestana)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                  tab === id
                    ? 'border-[#f97316] text-[#f97316]'
                    : 'border-transparent text-[#5b616e] hover:text-[#16181d]',
                )}
              >
                {label}
                {cuenta != null && (
                  <span className={cn(
                    'num rounded px-1.5 py-px text-[10.5px] font-semibold',
                    tab === id ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#8a909c]',
                  )}>
                    {cuenta}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* ── Cuerpo ───────────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-5 py-4">
            {cargando && (
              <div className="py-16 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
                <p className="mt-2 text-[12.5px] text-[#8a909c]">Reuniendo su historial…</p>
              </div>
            )}

            {!cargando && error && (
              <div className="flex items-start gap-2 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[13px] text-[#b91c1c]">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            {!cargando && !error && datos && (
              <>
                {/* ───────────── Resumen ───────────── */}
                {tab === 'resumen' && (
                  <div className="space-y-3.5">
                    {datos.sinReglas && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-[#fed7aa] bg-[#fff7ed] p-3.5">
                        <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden />
                        <p className="text-[12.5px] leading-snug text-[#7c2d12]">
                          <strong className="font-semibold">Sin reglas de pago.</strong> Los trabajos que se le
                          asignen no van a generar comisión hasta que se defina cómo se le paga.
                        </p>
                      </div>
                    )}

                    <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-[14px] font-bold text-[#16181d]">Le toca en este período</h3>
                        <span className="flex items-center gap-1 text-[11.5px] text-[#8a909c]">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                          {periodoLabel || `${fecha(range.inicio)} — ${fecha(range.fin)}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <Cifra k="Sueldo base" v={usd(periodo?.sueldo_base ?? 0)} />
                        <Cifra k="Comisiones" v={usd((periodo?.total_comisiones ?? 0) + (periodo?.total_flat ?? 0))} />
                        <Cifra k="Override" v={usd(periodo?.total_overrides ?? 0)} morado={(periodo?.total_overrides ?? 0) > 0} />
                        <Cifra k="Neto a pagar" v={usd(periodo?.total_pagar ?? 0)} fuerte />
                      </div>

                      {(periodo?.deducciones ?? 0) > 0 && (
                        <p className="mt-2.5 text-[12px] text-[#dc2626]">
                          Ya se le descontaron {usd(periodo!.deducciones)} en adelantos.
                        </p>
                      )}

                      <p className="mt-3 text-[12px] leading-snug text-[#8a909c]">
                        {(periodo?.jobs.length ?? 0) === 0
                          ? 'No tiene trabajos asignados en este período.'
                          : `Sale de ${periodo!.jobs.length} trabajo(s) del período. El historial completo está en la pestaña Trabajos.`}
                      </p>

                      {periodo && (onHoja || onLiquidar) && (
                        <div className="mt-3.5 flex flex-wrap gap-2">
                          {onHoja && (
                            <button
                              onClick={() => onHoja(periodo)}
                              className="flex h-[34px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
                            >
                              <FileDown className="h-4 w-4" aria-hidden />
                              Descargar hoja
                            </button>
                          )}
                          {onLiquidar && periodo.total_pagar > 0 && (
                            <button
                              onClick={() => onLiquidar(periodo)}
                              className="flex h-[34px] items-center gap-1.5 rounded-lg bg-[#15803d] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#166534]"
                            >
                              <Wallet className="h-4 w-4" aria-hidden />
                              Liquidar {usd(periodo.total_pagar)}
                            </button>
                          )}
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
                      <h3 className="text-[14px] font-bold text-[#16181d]">Todo su historial</h3>
                      <p className="mt-0.5 text-[12px] text-[#8a909c]">
                        {datos.resumen.trabajos === 0
                          ? 'Todavía no tiene ningún trabajo registrado.'
                          : `${datos.resumen.trabajos} trabajos entre ${fecha(datos.resumen.desde)} y ${fecha(datos.resumen.hasta)}.`}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        <Cifra k="Comisión acumulada" v={usd(datos.resumen.comisionTotal)} />
                        <Cifra k="Ya cobrado" v={usd(datos.resumen.cobrado)} />
                        <Cifra k="Pendiente de pago" v={usd(datos.resumen.pendiente)} fuerte={datos.resumen.pendiente > 0} />
                      </div>

                      {datos.resumen.porZona.length > 0 && (
                        <div className="mt-4">
                          <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9ba1ab]">
                            En qué trabaja
                          </h4>
                          <ul className="space-y-1.5">
                            {datos.resumen.porZona.map(z => {
                              const pct = datos.resumen.comisionTotal > 0
                                ? (z.comision / datos.resumen.comisionTotal) * 100 : 0;
                              return (
                                <li key={z.zona}>
                                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                                    <span className="truncate text-[#3d4350]">{zonaLabel(z.zona)}</span>
                                    <span className="num shrink-0 text-[#8a909c]">
                                      {z.trabajos} · <span className="font-semibold text-[#16181d]">{usd(z.comision)}</span>
                                    </span>
                                  </div>
                                  <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#f2f3f5]">
                                    <div className="h-full rounded-full bg-[#f97316]" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {datos.resumen.porMes.length > 1 && (
                        <div className="mt-4">
                          <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9ba1ab]">
                            Comisión por mes
                          </h4>
                          <Barras datos={datos.resumen.porMes} />
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {/* ───────────── Trabajos ───────────── */}
                {tab === 'trabajos' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[200px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
                        <input
                          value={busca}
                          onChange={e => setBusca(e.target.value)}
                          placeholder="Buscar por trabajo, cliente o placa…"
                          aria-label="Buscar en el historial"
                          className="h-[38px] w-full rounded-lg border border-[#e2e5ea] bg-white pl-9 pr-3 text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316]"
                        />
                      </div>
                      <label className="flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] text-[#3d4350]">
                        <input
                          type="checkbox"
                          checked={soloPendientes}
                          onChange={e => setSoloPendientes(e.target.checked)}
                          className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
                        />
                        Solo lo que no se le ha pagado
                      </label>
                    </div>

                    {trabajos.length === 0 ? (
                      <p className="rounded-xl border border-[#e8eaed] bg-white px-4 py-10 text-center text-[13px] text-[#8a909c]">
                        {datos.trabajos.length === 0
                          ? 'No tiene trabajos registrados. Si hizo trabajo que no aparece aquí, búscalo en «Sin asignar».'
                          : 'Ningún trabajo coincide con esa búsqueda.'}
                      </p>
                    ) : (
                      <ul className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
                        {trabajos.map(j => {
                          const liquidado = (j as JobConEstado).estado === 'liquidado';
                          const abierto = abierta === j.id;
                          return (
                            <li key={j.id} className="border-b border-[#f2f3f5] last:border-0">
                              <button
                                onClick={() => setAbierta(abierto ? null : j.id)}
                                aria-expanded={abierto}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fafbfc]"
                              >
                                <span className="num w-[46px] shrink-0 text-[11.5px] text-[#9ba1ab]">{fecha(j.fecha)}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12.5px] font-medium text-[#16181d]">
                                    {j.es_override ? 'Override sobre el trabajo del equipo' : (j.descripcion || j.tipo_trabajo || 'Trabajo')}
                                  </span>
                                  <span className="block truncate text-[11px] text-[#8a909c]">
                                    {zonaLabel(j.zona)}
                                    {j.desglose?.cliente ? ` · ${j.desglose.cliente}` : ''}
                                    {j.desglose?.vehiculo ? ` · ${j.desglose.vehiculo}` : ''}
                                  </span>
                                </span>
                                <span className="num hidden w-[80px] shrink-0 text-right text-[12px] text-[#8a909c] sm:block">
                                  {usd(j.mano_obra_usd)}
                                </span>
                                <span className="num w-[76px] shrink-0 text-right text-[12.5px] font-semibold text-[#16181d]">
                                  {usd(j.comision_usd)}
                                </span>
                                <span className={cn(
                                  'hidden shrink-0 rounded-md px-2 py-[3px] text-[10.5px] font-medium sm:inline-flex sm:items-center sm:gap-1',
                                  liquidado ? 'bg-[#e8f7ee] text-[#15803d]' : 'bg-[#fff4ec] text-[#c2410c]',
                                )}>
                                  {liquidado && <Check className="h-2.5 w-2.5" aria-hidden />}
                                  {liquidado ? 'Pagado' : 'Pendiente'}
                                </span>
                                <ChevronDown className={cn('h-4 w-4 shrink-0 text-[#9ba1ab] transition-transform', abierto && 'rotate-180')} aria-hidden />
                              </button>

                              {abierto && (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#f2f3f5] bg-[#fafbfc] px-4 py-3 sm:grid-cols-4">
                                  <Dato k="Cobrado al cliente" v={usd(j.ingreso_usd)} />
                                  <Dato k="Mano de obra" v={usd(j.mano_obra_usd)} />
                                  <Dato k="Su comisión" v={usd(j.comision_usd)} />
                                  <Dato k="Queda para el taller" v={usd(j.lycos_neto ?? 0)} />
                                  <Dato k="Regla aplicada" v={reglaTexto(j)} ancho />
                                  <Dato
                                    k="Viene de"
                                    v={j.referencia_tabla === 'servicios' ? 'Orden de servicio'
                                      : j.referencia_tabla === 'ventas_dia' ? 'Venta de mostrador'
                                      : j.referencia_tabla === 'manual' ? 'Captura manual' : '—'}
                                    ancho
                                  />
                                  {j.moneda !== 'USD' && (
                                    <Dato k="Cobrado en" v={`${j.moneda} · tasa ${j.tasa_cambio}`} ancho />
                                  )}
                                  {j.proveedor_nombre && (
                                    <Dato k="Proveedor" v={`${j.proveedor_nombre} · ${usd(j.proveedor_monto_usd)}`} ancho />
                                  )}
                                  {j.referencia_tabla === 'servicios' && j.referencia_id && (
                                    <a
                                      href={`/dashboard/servicios?id=${j.referencia_id}`}
                                      className="col-span-2 flex items-center gap-1 text-[12px] font-medium text-[#f97316] hover:underline sm:col-span-4"
                                    >
                                      Ver la orden completa
                                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                                    </a>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {trabajos.length > 0 && (
                      <p className="num text-right text-[12.5px] text-[#8a909c]">
                        {trabajos.length} trabajo(s) ·{' '}
                        <strong className="font-semibold text-[#16181d]">
                          {usd(trabajos.reduce((s, j) => s + (j.comision_usd || 0), 0))}
                        </strong>{' '}
                        en comisiones
                      </p>
                    )}
                  </div>
                )}

                {/* ───────────── Reglas ───────────── */}
                {tab === 'reglas' && (
                  <div className="space-y-2.5">
                    {datos.reglas.length === 0 ? (
                      <div className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-8 text-center">
                        <p className="text-[13px] font-semibold text-[#7c2d12]">Nadie ha definido cómo se le paga.</p>
                        <p className="mx-auto mt-1 max-w-[420px] text-[12.5px] leading-snug text-[#9a5b2c]">
                          Sin al menos una regla, sus trabajos entran a nómina con comisión $0.00. Las reglas se
                          crean en Configuración → Reglas de pago.
                        </p>
                      </div>
                    ) : datos.reglas.map(r => (
                      <article
                        key={r.id}
                        className={cn(
                          'rounded-xl border bg-white p-4',
                          r.activo === false ? 'border-[#eef0f3] opacity-60' : 'border-[#e8eaed]',
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fff1e7] text-[#f97316]">
                            <Sparkle className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-snug text-[#16181d]">{r.explicacion}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[#8a909c]">
                              <span>Prioridad {r.prioridad}</span>
                              {r.vigencia_desde && <span>· desde {fecha(r.vigencia_desde)}</span>}
                              {r.vigencia_hasta && <span>· hasta {fecha(r.vigencia_hasta)}</span>}
                              {r.proveedor_pct > 0 && (
                                <span>· {r.proveedor_pct}% a {r.proveedor_nombre || 'proveedor'}</span>
                              )}
                            </p>
                            {r.descripcion && (
                              <p className="mt-1 text-[11.5px] italic text-[#9ba1ab]">{r.descripcion}</p>
                            )}
                            {(r.avisos || []).map(a => (
                              <p key={a} className="mt-1.5 flex items-start gap-1.5 rounded-md bg-[#fff7ed] px-2 py-1.5 text-[11.5px] leading-snug text-[#9a3412]">
                                <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                                {a}
                              </p>
                            ))}
                          </div>
                          {r.activo === false && (
                            <span className="shrink-0 rounded-md bg-[#f2f3f5] px-2 py-[3px] text-[10.5px] font-medium text-[#8a909c]">
                              Desactivada
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {/* ───────────── Pagos ───────────── */}
                {tab === 'pagos' && (
                  datos.pagos.length === 0 ? (
                    <p className="rounded-xl border border-[#e8eaed] bg-white px-4 py-10 text-center text-[13px] text-[#8a909c]">
                      Todavía no se le ha liquidado ningún período.
                    </p>
                  ) : (
                    <ul className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
                      {datos.pagos.map(g => (
                        <li key={g.id} className="flex items-center gap-3 border-b border-[#f2f3f5] px-4 py-2.5 last:border-0">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-[#16181d]">
                              {fecha(g.periodo_inicio)} — {fecha(g.periodo_fin)}
                            </span>
                            <span className="num block truncate text-[11px] text-[#8a909c]">
                              {g.recibo_numero || 'Sin número'}{g.metodo_pago ? ` · ${g.metodo_pago}` : ''}
                            </span>
                          </span>
                          <span className="num shrink-0 text-[12.5px] font-semibold text-[#16181d]">
                            {usd(g.total_pagar)}
                          </span>
                          <span className={cn(
                            'shrink-0 rounded-md px-2 py-[3px] text-[10.5px] font-medium',
                            g.estado === 'anulado' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#e8f7ee] text-[#15803d]',
                          )}>
                            {g.estado === 'anulado' ? 'Anulado' : 'Pagado'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Con qué se calculó la comisión, dicho en una línea. */
function reglaTexto(j: JobAssignment): string {
  if (j.es_override) return 'Override en cascada';
  switch (j.tipo_regla) {
    case 'porcentaje': {
      const base = j.mano_obra_usd || j.ingreso_usd;
      const pct = base > 0 ? Math.round((j.comision_usd / base) * 1000) / 10 : 0;
      return `Porcentaje · ${pct}% de ${usd(base)}`;
    }
    case 'tarifa_flat': return `Tarifa fija por trabajo · ${usd(j.comision_usd)}`;
    case 'fijo_semanal': return 'Sueldo fijo del período';
    case 'override_cascada': return 'Override en cascada';
    default: return 'Sin regla: quedó en $0.00';
  }
}

function Cifra({ k, v, fuerte, morado }: { k: string; v: string; fuerte?: boolean; morado?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2',
      fuerte ? 'border-[#bbf7d0] bg-[#f0fdf4]' : morado ? 'border-[#ddd6fe] bg-[#faf5ff]' : 'border-[#eef0f3] bg-[#fafbfc]',
    )}>
      <div className="text-[10.5px] uppercase tracking-wide text-[#9ba1ab]">{k}</div>
      <div className={cn(
        'num mt-0.5 text-[15px] font-bold',
        fuerte ? 'text-[#15803d]' : morado ? 'text-[#7c3aed]' : 'text-[#16181d]',
      )}>
        {v}
      </div>
    </div>
  );
}

function Dato({ k, v, ancho }: { k: string; v: string; ancho?: boolean }) {
  return (
    <div className={cn(ancho && 'col-span-2')}>
      <div className="text-[10.5px] uppercase tracking-wide text-[#9ba1ab]">{k}</div>
      <div className="num mt-px text-[12px] text-[#3d4350]">{v}</div>
    </div>
  );
}

/** Barras por mes, dibujadas a mano: no vale traer una librería para esto. */
function Barras({ datos }: { datos: { mes: string; trabajos: number; comision: number }[] }) {
  const max = Math.max(...datos.map(d => d.comision), 1);
  return (
    <div
      className="flex items-end gap-1.5 overflow-x-auto pb-1"
      role="img"
      aria-label={`Comisión por mes: ${datos.map(d => `${mesLabel(d.mes)} ${usd(d.comision)}`).join(', ')}`}
    >
      {datos.map(d => (
        <div key={d.mes} className="flex min-w-[38px] flex-1 flex-col items-center gap-1">
          <span className="num text-[9.5px] text-[#8a909c]">{Math.round(d.comision)}</span>
          <div
            className="w-full rounded-t bg-[#f97316]"
            style={{ height: `${Math.max((d.comision / max) * 64, 3)}px` }}
            title={`${mesLabel(d.mes)}: ${usd(d.comision)} en ${d.trabajos} trabajo(s)`}
          />
          <span className="text-[9.5px] text-[#9ba1ab]">{mesLabel(d.mes)}</span>
        </div>
      ))}
    </div>
  );
}
