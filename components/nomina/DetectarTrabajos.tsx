'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, Loader2, Search, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIAS_VENTA, categoriaToZona } from '@/lib/categorias';

interface Propuesta {
  origen: 'servicio' | 'venta';
  id: string;
  fecha: string;
  titulo: string;
  descripcion: string;
  cliente: string | null;
  placa: string | null;
  monto: number;
  manoObra: number;
  categoria: string;
  zona: string;
  categoriaOrigen: 'guardada' | 'detectada';
  empleado_id: string | null;
  empleado_nombre: string | null;
  motivoTecnico: string;
  confianza: 'confirmada' | 'supuesta' | 'ninguna';
  comision: number;
  regla: string | null;
  sinRegla: boolean;
  porDefinir: boolean;
}

interface Persona { id: string; nombre: string; es_tecnico?: boolean }

interface Props {
  range: { inicio: string; fin: string };
  sedeId: string | null;
  onListo: () => void;
}

const usd = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dm = (iso: string) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;

/**
 * Rescate del trabajo que se cobró pero nunca entró a nómina.
 *
 * Lee las órdenes y las ventas del período que no tienen comisión, las
 * clasifica con el mismo criterio que el resto del sistema, propone quién lo
 * hizo y calcula lo que cobraría con sus reglas reales. Todo es editable y
 * nada se guarda hasta confirmar: la propuesta es un punto de partida, no una
 * decisión tomada por el sistema.
 */
export default function DetectarTrabajos({ range, sedeId, onListo }: Props) {
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [marcadas, setMarcadas] = useState<readonly string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resumen, setResumen] = useState<{ total: number; comisionTotal: number } | null>(null);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'confirmada' | 'supuesta' | 'ninguna'>('todos');
  const [desde, setDesde] = useState(range.inicio);
  const [hasta, setHasta] = useState(range.fin);

  useEffect(() => {
    fetch(`/api/nomina/technicians${sedeId ? `?sede=${sedeId}` : ''}`)
      .then(r => r.json())
      .then(d => {
        const lista: Persona[] = d.technicians || [];
        lista.sort((a, b) => Number(!!b.es_tecnico) - Number(!!a.es_tecnico) || a.nombre.localeCompare(b.nombre));
        setPersonas(lista);
      })
      .catch(() => setPersonas([]));
  }, [sedeId]);

  const buscar = useCallback(async () => {
    setBuscando(true);
    setError('');
    setHecho('');
    try {
      const r = await fetch('/api/nomina/detectar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inicio: desde, fin: hasta, sede: sedeId, limite: 150 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo revisar el período');
      setPropuestas(d.propuestas || []);
      setResumen({ total: d.total, comisionTotal: d.comisionTotal });
      // Solo se marcan las que la propia orden confirma. Lo deducido "porque
      // es el único de esa zona" puede estar mal —si ese día lo hizo otro—, y
      // dejarlo marcado sería decidir por el usuario sobre el pago de alguien.
      setMarcadas((d.propuestas || [])
        .filter((p: Propuesta) => p.confianza === 'confirmada' && p.comision > 0)
        .map((p: Propuesta) => p.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al revisar');
      setPropuestas([]);
    } finally {
      setBuscando(false);
    }
  }, [desde, hasta, sedeId]);

  const actualizar = (id: string, patch: Partial<Propuesta>) =>
    setPropuestas(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)));

  /** Recalcula la comisión de una fila con las reglas reales. */
  const recalcular = useCallback(async (p: Propuesta) => {
    if (!p.empleado_id) { actualizar(p.id, { comision: 0, regla: null, sinRegla: false }); return; }
    const r = await fetch('/api/nomina/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sede: sedeId,
        jobs: [{
          ref: p.id, empleado_id: p.empleado_id, es_taller: false, zona: p.zona,
          tipo_trabajo: p.titulo, descripcion: p.descripcion,
          ingreso_total: p.monto, mano_obra: p.manoObra, moneda: 'USD',
        }],
      }),
    });
    const d = await r.json();
    const x = (d.preview || [])[0];
    if (x) actualizar(p.id, { comision: x.comision_usd || 0, regla: x.regla_descripcion, sinRegla: !!x.sin_regla, porDefinir: !!x.por_definir });
  }, [sedeId]);

  const visibles = useMemo(
    () => (filtro === 'todos' ? propuestas : propuestas.filter(p => p.confianza === filtro)),
    [propuestas, filtro],
  );

  const seleccionadas = propuestas.filter(p => marcadas.includes(p.id) && p.empleado_id);
  const totalSeleccion = seleccionadas.reduce((s, p) => s + p.comision, 0);

  const registrar = async () => {
    if (seleccionadas.length === 0) return;
    if (!confirm(
      `Se van a registrar ${seleccionadas.length} trabajo(s) por ${usd(totalSeleccion)} en comisiones.\n\n` +
      'Quedan pendientes de liquidar, así que todavía puedes revisarlos antes de pagar.',
    )) return;

    setGuardando(true);
    setError('');
    let ok = 0;
    let fallos = 0;

    // De uno en uno: cada trabajo cuelga de su propia orden o venta, y si uno
    // falla los demás ya registrados quedan firmes.
    for (const p of seleccionadas) {
      try {
        const r = await fetch('/api/nomina/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sede: sedeId,
            jobs: [{
              empleado_id: p.empleado_id, es_taller: false, zona: p.zona,
              tipo_trabajo: p.titulo, descripcion: p.descripcion,
              ingreso_total: p.monto, mano_obra: p.manoObra, cantidad: 1, moneda: 'USD',
              referencia_tabla: p.origen === 'servicio' ? 'servicios' : 'ventas_dia',
              referencia_id: p.id, fecha: p.fecha,
            }],
          }),
        });
        if (r.ok) ok += 1; else fallos += 1;
      } catch { fallos += 1; }
    }

    setGuardando(false);
    setHecho(`${ok} trabajo(s) registrados${fallos ? ` · ${fallos} fallaron` : ''}.`);
    setPropuestas(ps => ps.filter(p => !seleccionadas.some(s => s.id === p.id)));
    setMarcadas([]);
    onListo();
  };

  return (
    <div className="space-y-3.5">
      {/* Buscador */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
            <Search className="h-[20px] w-[20px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#16181d]">Trabajo cobrado sin comisión</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#8a909c]">
              Busca órdenes y ventas del período que se cobraron pero a las que nunca se les asignó técnico.
              Se clasifican con el mismo criterio del sistema y se calcula lo que cobraría cada quien con
              sus reglas reales. <strong className="text-[#3d4350]">Nada se guarda hasta que confirmes.</strong>
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-[#5b616e]">Desde</span>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="num h-[38px] rounded-lg border border-[#e2e5ea] px-2.5 text-[12.5px] outline-none focus:border-[#f97316]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-[#5b616e]">Hasta</span>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="num h-[38px] rounded-lg border border-[#e2e5ea] px-2.5 text-[12.5px] outline-none focus:border-[#f97316]" />
              </label>
              <button
                onClick={buscar}
                disabled={buscando}
                className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:opacity-50"
              >
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                {buscando ? 'Revisando…' : 'Revisar período'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">{error}</p>
      )}
      {hecho && (
        <p className="flex items-center gap-2 rounded-lg border border-[#bbf7d0] bg-[#e8f7ee] px-3.5 py-2.5 text-[13px] text-[#15803d]">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {hecho}
        </p>
      )}

      {resumen && propuestas.length === 0 && !buscando && !hecho && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#e8eaed] bg-white py-14 text-center">
          <CheckCircle2 className="mb-3 h-10 w-10 text-[#16a34a]" aria-hidden />
          <p className="text-[14px] font-semibold text-[#16181d]">Todo el trabajo del período ya tiene comisión</p>
        </div>
      )}

      {propuestas.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {[
              { l: 'Encontrados', v: String(resumen?.total ?? propuestas.length) },
              { l: 'La orden dice quién fue', v: String(propuestas.filter(p => p.confianza === 'confirmada').length) },
              { l: 'Supuestos por la zona', v: String(propuestas.filter(p => p.confianza === 'supuesta').length) },
              { l: 'Comisión a generar', v: usd(propuestas.reduce((s, p) => s + p.comision, 0)) },
            ].map(k => (
              <article key={k.l} className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3">
                <p className="text-[11.5px] text-[#8a909c]">{k.l}</p>
                <p className="num text-[20px] font-extrabold leading-tight text-[#16181d]">{k.v}</p>
              </article>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
            <header className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  ['todos', 'Todos'],
                  ['confirmada', 'La orden dice quién'],
                  ['supuesta', 'Supuestos'],
                  ['ninguna', 'Sin asignar'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setFiltro(id)}
                    aria-pressed={filtro === id}
                    className={cn(
                      'h-[28px] rounded-md px-2.5 text-[11.5px] font-medium transition-colors',
                      filtro === id ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="num min-w-0 flex-1 text-right text-[12px] text-[#8a909c]">
                {seleccionadas.length} seleccionado(s) · {usd(totalSeleccion)}
              </span>
              <button
                onClick={registrar}
                disabled={guardando || seleccionadas.length === 0}
                className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {guardando ? 'Registrando…' : `Registrar ${seleccionadas.length}`}
              </button>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse">
                <thead>
                  <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
                    <th scope="col" className="w-[40px] px-3 py-2.5" />
                    {['Fecha', 'Trabajo', 'Zona', 'Monto', 'Mano de obra', 'Quién lo hizo', 'Comisión'].map(h => (
                      <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(p => {
                    const marcada = marcadas.includes(p.id);
                    return (
                      <tr key={p.id} className={cn('border-b border-[#f2f3f5] last:border-0', marcada && 'bg-[#fffaf6]')}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={marcada}
                            disabled={!p.empleado_id}
                            onChange={() => setMarcadas(m => m.includes(p.id) ? m.filter(x => x !== p.id) : [...m, p.id])}
                            aria-label={`Registrar ${p.titulo}`}
                            className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316] disabled:opacity-30"
                          />
                        </td>

                        <td className="num px-3 py-2 text-[12px] text-[#5b616e]">{dm(p.fecha)}</td>

                        <td className="px-3 py-2">
                          <span className="block max-w-[240px] truncate text-[12.5px] font-medium text-[#16181d]">
                            {p.descripcion || p.titulo}
                          </span>
                          <span className="block text-[10.5px] text-[#9ba1ab]">
                            {p.origen === 'servicio' ? 'Orden de servicio' : 'Venta de mostrador'}
                            {p.placa ? ` · ${p.placa}` : ''}{p.cliente ? ` · ${p.cliente}` : ''}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <select
                            value={p.categoria}
                            onChange={e => {
                              const cat = e.target.value;
                              const zona = categoriaToZona(cat);
                              actualizar(p.id, { categoria: cat, zona, categoriaOrigen: 'guardada' });
                              recalcular({ ...p, categoria: cat, zona });
                            }}
                            className="h-[30px] w-[132px] rounded-md border border-[#e2e5ea] px-1.5 text-[11.5px] outline-none focus:border-[#f97316]"
                          >
                            {CATEGORIAS_VENTA.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                          {p.categoriaOrigen === 'detectada' && (
                            <span className="mt-0.5 block text-[10px] text-[#c2410c]">detectada del texto</span>
                          )}
                        </td>

                        <td className="num px-3 py-2 text-[12px] text-[#16181d]">{usd(p.monto)}</td>

                        <td className="px-3 py-2">
                          <input
                            type="number" step="0.01" min="0"
                            value={p.manoObra}
                            onChange={e => actualizar(p.id, { manoObra: Number(e.target.value) || 0 })}
                            onBlur={() => recalcular(p)}
                            aria-label="Mano de obra"
                            className="num h-[30px] w-[84px] rounded-md border border-[#e2e5ea] px-2 text-right text-[12px] outline-none focus:border-[#f97316]"
                          />
                        </td>

                        <td className="px-3 py-2">
                          <select
                            value={p.empleado_id || ''}
                            onChange={e => {
                              const id = e.target.value || null;
                              const nombre = personas.find(x => x.id === id)?.nombre || null;
                              actualizar(p.id, { empleado_id: id, empleado_nombre: nombre, motivoTecnico: 'Elegido a mano' });
                              recalcular({ ...p, empleado_id: id });
                              if (!id) setMarcadas(m => m.filter(x => x !== p.id));
                            }}
                            className="h-[30px] w-[176px] rounded-md border border-[#e2e5ea] px-1.5 text-[11.5px] outline-none focus:border-[#f97316]"
                          >
                            <option value="">— Sin asignar —</option>
                            {personas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                          </select>
                          <span className={cn(
                            'mt-0.5 flex max-w-[176px] items-center gap-1 truncate text-[10px]',
                            p.confianza === 'confirmada' ? 'text-[#15803d]'
                              : p.confianza === 'supuesta' ? 'text-[#c2410c]' : 'text-[#9ba1ab]',
                          )}>
                            {p.confianza === 'confirmada' && <Check className="h-2.5 w-2.5 shrink-0" aria-hidden />}
                            {p.confianza === 'supuesta' && <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden />}
                            <span className="truncate">{p.motivoTecnico}</span>
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <span className={cn('num block text-[13px] font-bold', p.comision > 0 ? 'text-[#16a34a]' : 'text-[#9ba1ab]')}>
                            {usd(p.comision)}
                          </span>
                          {p.sinRegla && p.empleado_id && (
                            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-[#dc2626]">
                              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                              sin regla en esta zona
                            </span>
                          )}
                          {p.porDefinir && (
                            <span className="mt-0.5 block text-[10px] text-[#c2410c]">por definir</span>
                          )}
                          {p.regla && !p.sinRegla && !p.porDefinir && (
                            <span className="mt-0.5 block max-w-[150px] truncate text-[10px] text-[#9ba1ab]">{p.regla}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!resumen && !buscando && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d5d9e0] bg-white py-14 text-center">
          <Wrench className="mb-3 h-10 w-10 text-[#d5d9e0]" aria-hidden />
          <p className="text-[14px] font-semibold text-[#16181d]">Elige el período y revisa</p>
          <p className="mt-1 max-w-md text-[12.5px] text-[#8a909c]">
            Verás cada trabajo cobrado que quedó sin comisión, con quién lo hizo y cuánto le tocaría.
          </p>
        </div>
      )}
    </div>
  );
}
