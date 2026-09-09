'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CalendarClock, Check, ChevronDown, Coins,
  Handshake, Layers, Loader2, Percent, Users, Wallet, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ZONAS_TRABAJO, type CommissionRule } from '@/types';
import {
  BASES, FORMAS_PAGO, MONEDAS, TIPOS_SUGERIDOS, avisosRegla, describirRegla,
  reglaNueva, simular, validarRegla, type TipoRegla,
} from '@/lib/nomina/reglas';

interface Persona { id: string; nombre: string; cargo?: string | null }

interface Props {
  regla?: CommissionRule | null;
  personas: readonly Persona[];
  /** Persona preseleccionada al abrir desde su tarjeta. */
  empleadoId?: string | null;
  otrasReglas: readonly CommissionRule[];
  sedeId: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const ICONO: Record<TipoRegla, typeof Percent> = {
  porcentaje: Percent,
  fijo_semanal: Wallet,
  override_cascada: Layers,
  tarifa_flat: Coins,
};

const usd = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Constructor de reglas de comisión.
 *
 * La regla se arma respondiendo preguntas en español y se lee como una frase
 * mientras se edita; al lado, un simulador muestra qué pasaría con un trabajo
 * concreto. Nadie debería tener que saber qué es `base: mano_obra` para
 * configurar cuánto cobra su gente.
 */
export default function ConstructorRegla({
  regla, personas, empleadoId, otrasReglas, sedeId, onCerrar, onGuardado,
}: Props) {
  const editando = Boolean(regla?.id);

  const [r, setR] = useState<Partial<CommissionRule>>(
    () => regla ? { ...regla } : reglaNueva('porcentaje', empleadoId ?? null),
  );
  const [avanzado, setAvanzado] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Trabajo de ejemplo del simulador.
  const [ingreso, setIngreso] = useState('100');
  const [manoObra, setManoObra] = useState('40');

  const set = <K extends keyof CommissionRule>(k: K, v: CommissionRule[K]) =>
    setR(p => ({ ...p, [k]: v }));

  const forma = FORMAS_PAGO.find(f => f.id === r.tipo_regla) || FORMAS_PAGO[0];
  const persona = personas.find(p => p.id === r.empleado_id);
  const quien = persona?.nombre || (r.empleado_id ? 'Esta persona' : 'Cualquier técnico');

  const tipos = useMemo(
    () => ((r.condiciones as { tipos?: string[] } | undefined)?.tipos) || [],
    [r.condiciones],
  );
  const setTipos = (t: string[]) =>
    set('condiciones', (t.length ? { ...(r.condiciones || {}), tipos: t } : {}) as CommissionRule['condiciones']);

  const frase = describirRegla(r, quien);
  const sim = simular(r, { ingreso: Number(ingreso) || 0, manoObra: Number(manoObra) || 0 });
  const problema = validarRegla(r);
  const avisos = avisosRegla(r, otrasReglas as CommissionRule[]);

  const cambiarTipo = (t: TipoRegla) => {
    // Se conservan persona y zona; el resto vuelve a los valores propios del tipo.
    const base = reglaNueva(t, r.empleado_id ?? null);
    setR(p => ({ ...base, id: p.id, empleado_id: p.empleado_id, zona: p.zona, descripcion: p.descripcion, activo: p.activo }));
  };

  const guardar = async () => {
    if (problema) { setError(problema); return; }
    setGuardando(true);
    setError('');
    try {
      const cuerpo: Record<string, unknown> = {
        empleado_id: r.empleado_id || null,
        zona: r.zona || 'general',
        tipo_regla: r.tipo_regla,
        base: r.base || 'ingreso_total',
        valor: Number(r.valor) || 0,
        moneda: r.moneda || 'USD',
        aplica_monedas: r.aplica_monedas?.length ? r.aplica_monedas : null,
        proveedor_pct: Number(r.proveedor_pct) || 0,
        proveedor_nombre: r.proveedor_nombre?.trim() || null,
        prioridad: Number(r.prioridad) || 20,
        condiciones: r.condiciones || {},
        descripcion: (r.descripcion || '').trim() || frase,
        activo: r.activo !== false,
        vigencia_hasta: r.vigencia_hasta || null,
        sede_id: sedeId,
      };
      const res = await fetch(editando ? `/api/nomina/rules/${regla!.id}` : '/api/nomina/rules', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar');
      onGuardado();
      onCerrar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fff1e7] text-[#f97316]">
            <Percent className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-[#16181d]">
              {editando ? 'Editar cómo se le paga' : 'Nueva forma de pago'}
            </h2>
            <p className="text-[11.5px] text-[#8a909c]">Arma la regla respondiendo y míra abajo cuánto cobraría.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_300px]">
          {/* ── Formulario ──────────────────────────────────────────────── */}
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
            {/* 1 · A quién */}
            <Paso n={1} titulo="¿A quién se le paga?">
              <select
                value={r.empleado_id || ''}
                onChange={e => set('empleado_id', (e.target.value || null) as CommissionRule['empleado_id'])}
                className={INPUT}
              >
                <option value="">Cualquier técnico (regla general)</option>
                {personas.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.cargo ? ` — ${p.cargo}` : ''}</option>
                ))}
              </select>
              {!r.empleado_id && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-[#8a909c]">
                  <Users className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  Una regla general aplica a quien no tenga una propia. Las reglas de una persona siempre ganan.
                </p>
              )}
            </Paso>

            {/* 2 · Cómo */}
            <Paso n={2} titulo="¿Cómo se le paga?">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FORMAS_PAGO.map(f => {
                  const Icono = ICONO[f.id];
                  const activo = r.tipo_regla === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => cambiarTipo(f.id)}
                      aria-pressed={activo}
                      className={cn(
                        'flex gap-2.5 rounded-lg border p-3 text-left transition-colors',
                        activo ? 'border-[#f97316] bg-[#fff8f3]' : 'border-[#e2e5ea] hover:bg-[#fafbfc]',
                      )}
                    >
                      <span className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        activo ? 'bg-[#f97316] text-white' : 'bg-[#f2f3f5] text-[#5b616e]',
                      )}>
                        <Icono className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold leading-tight text-[#16181d]">{f.titulo}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[#8a909c]">{f.resumen}</span>
                        <span className="mt-1 block text-[10.5px] italic leading-snug text-[#9ba1ab]">{f.ejemplo}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Paso>

            {/* 3 · Cuánto */}
            <Paso n={3} titulo="¿Cuánto?">
              {forma.pidePorcentaje && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="number" step="0.5" min="0" max="100"
                        value={r.valor ?? ''}
                        onChange={e => set('valor', Number(e.target.value) as CommissionRule['valor'])}
                        className="num h-[52px] w-[120px] rounded-lg border border-[#e2e5ea] pl-3 pr-9 text-[22px] font-extrabold outline-none focus:border-[#f97316]"
                        aria-label="Porcentaje"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-[#9ba1ab]">%</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[7, 20, 25, 30, 40, 50, 100].map(v => (
                        <button
                          key={v}
                          onClick={() => set('valor', v as CommissionRule['valor'])}
                          className={cn(
                            'h-[28px] rounded-md px-2.5 text-[11.5px] font-medium transition-colors',
                            Number(r.valor) === v ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
                          )}
                        >
                          {v} %
                        </button>
                      ))}
                    </div>
                  </div>

                  {forma.pideBase && (
                    <div className="mt-3">
                      <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">¿Sobre qué monto?</span>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {BASES.map(b => (
                          <button
                            key={b.id}
                            onClick={() => set('base', b.id as CommissionRule['base'])}
                            aria-pressed={r.base === b.id}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-left transition-colors',
                              r.base === b.id ? 'border-[#f97316] bg-[#fff8f3]' : 'border-[#e2e5ea] hover:bg-[#fafbfc]',
                            )}
                          >
                            <span className="block text-[12.5px] font-semibold text-[#16181d]">{b.titulo}</span>
                            <span className="block text-[11px] text-[#8a909c]">{b.ayuda}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {forma.pideMonto && (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] font-bold text-[#9ba1ab]">$</span>
                    <input
                      type="number" step="1" min="0"
                      value={r.valor ?? ''}
                      onChange={e => set('valor', Number(e.target.value) as CommissionRule['valor'])}
                      className="num h-[52px] w-[150px] rounded-lg border border-[#e2e5ea] pl-8 pr-3 text-[22px] font-extrabold outline-none focus:border-[#f97316]"
                      aria-label="Monto semanal"
                    />
                  </div>
                  <span className="text-[12.5px] text-[#5b616e]">por semana</span>
                </div>
              )}

              {r.tipo_regla === 'tarifa_flat' && (
                <p className="rounded-lg bg-[#f6f7f9] px-3 py-2.5 text-[12px] leading-snug text-[#5b616e]">
                  El monto de cada servicio se define en el <strong>catálogo de tarifas</strong>, más abajo en esta
                  misma pantalla. Esta regla solo dice que a esta persona se le paga por tarifa y no por porcentaje.
                </p>
              )}
            </Paso>

            {/* 4 · Cuándo */}
            {r.tipo_regla !== 'fijo_semanal' && (
              <Paso n={4} titulo="¿En qué trabajos aplica?">
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Zona del taller</span>
                  <select
                    value={r.zona || 'general'}
                    onChange={e => set('zona', e.target.value as CommissionRule['zona'])}
                    className={INPUT}
                  >
                    <option value="all">Todas las zonas</option>
                    {ZONAS_TRABAJO.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
                  </select>
                </label>

                <div className="mt-3">
                  <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
                    Solo ciertos servicios <span className="font-normal text-[#9ba1ab]">(opcional)</span>
                  </span>
                  <p className="mb-1.5 text-[11px] leading-snug text-[#8a909c]">
                    Si dejas esto vacío, la regla aplica a todo lo de esa zona. Si escribes palabras, solo aplica
                    cuando el trabajo las mencione — así Nelson cobra 30 % en reparación y 40 % en rotación.
                  </p>

                  {tipos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {tipos.map(t => (
                        <span key={t} className="flex items-center gap-1 rounded-md bg-[#fff1e7] px-2 py-1 text-[11.5px] font-medium text-[#c2410c]">
                          {t}
                          <button
                            onClick={() => setTipos(tipos.filter(x => x !== t))}
                            aria-label={`Quitar ${t}`}
                            className="text-[#c2410c] hover:text-[#7c2d12]"
                          >
                            <X className="h-3 w-3" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <input
                      value={nuevoTipo}
                      onChange={e => setNuevoTipo(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && nuevoTipo.trim()) {
                          e.preventDefault();
                          const t = nuevoTipo.trim().toLowerCase();
                          if (!tipos.includes(t)) setTipos([...tipos, t]);
                          setNuevoTipo('');
                        }
                      }}
                      placeholder="revisión, rotación, soldadura… y Enter"
                      className={INPUT}
                    />
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {TIPOS_SUGERIDOS.filter(t => !tipos.includes(t)).slice(0, 8).map(t => (
                      <button
                        key={t}
                        onClick={() => setTipos([...tipos, t])}
                        className="h-[24px] rounded-md bg-[#f2f3f5] px-2 text-[11px] text-[#5b616e] hover:bg-[#e8eaed]"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              </Paso>
            )}

            {/* Avanzado */}
            <div className="rounded-lg border border-[#eef0f3]">
              <button
                onClick={() => setAvanzado(v => !v)}
                aria-expanded={avanzado}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[#fafbfc]"
              >
                <Handshake className="h-4 w-4 text-[#8a909c]" aria-hidden />
                <span className="flex-1 text-[12.5px] font-semibold text-[#16181d]">
                  Reparto con proveedor, moneda y vigencia
                </span>
                <span className="text-[11px] text-[#9ba1ab]">opcional</span>
                <ChevronDown className={cn('h-4 w-4 text-[#9ba1ab] transition-transform', avanzado && 'rotate-180')} aria-hidden />
              </button>

              {avanzado && (
                <div className="space-y-3 border-t border-[#eef0f3] px-3 py-3">
                  {r.tipo_regla === 'porcentaje' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">% para el proveedor</span>
                        <input
                          type="number" step="1" min="0" max="100"
                          value={r.proveedor_pct ?? 0}
                          onChange={e => set('proveedor_pct', Number(e.target.value) as CommissionRule['proveedor_pct'])}
                          className={INPUT}
                        />
                        <span className="mt-1 block text-[10.5px] leading-snug text-[#9ba1ab]">
                          Se calcula sobre el total del trabajo, aunque la comisión vaya sobre la mano de obra.
                        </span>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">¿A quién?</span>
                        <input
                          value={r.proveedor_nombre || ''}
                          onChange={e => set('proveedor_nombre', e.target.value as CommissionRule['proveedor_nombre'])}
                          placeholder="Proveedor puente de alineación"
                          className={INPUT}
                        />
                      </label>
                    </div>
                  )}

                  <div>
                    <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">
                      Solo si el trabajo se cobró en… <span className="font-normal text-[#9ba1ab]">(vacío = cualquier moneda)</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {MONEDAS.map(m => {
                        const sel = r.aplica_monedas?.includes(m.id) ?? false;
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              const act = r.aplica_monedas || [];
                              const next = sel
                                ? act.filter(x => x !== m.id)
                                : [...act, m.id];
                              set('aplica_monedas', (next.length ? next : null) as CommissionRule['aplica_monedas']);
                            }}
                            aria-pressed={sel}
                            className={cn(
                              'h-[30px] rounded-md border px-2.5 text-[11.5px] font-medium transition-colors',
                              sel ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
                            )}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Deja de aplicar el</span>
                      <input
                        type="date"
                        value={r.vigencia_hasta || ''}
                        onChange={e => set('vigencia_hasta', (e.target.value || null) as CommissionRule['vigencia_hasta'])}
                        className={INPUT}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Prioridad</span>
                      <input
                        type="number" step="1" min="1"
                        value={r.prioridad ?? 20}
                        onChange={e => set('prioridad', Number(e.target.value) as CommissionRule['prioridad'])}
                        className={INPUT}
                      />
                      <span className="mt-1 block text-[10.5px] leading-snug text-[#9ba1ab]">
                        Si dos reglas aplican al mismo trabajo, gana la del número más bajo.
                      </span>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
                      Cómo llamarla <span className="font-normal text-[#9ba1ab]">(si lo dejas vacío se usa la frase de arriba)</span>
                    </span>
                    <input
                      value={r.descripcion || ''}
                      onChange={e => set('descripcion', e.target.value as CommissionRule['descripcion'])}
                      placeholder="Alineación 25 % en divisa"
                      className={INPUT}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ── Vista previa y simulador ─────────────────────────────────── */}
          <aside className="min-h-0 space-y-3 overflow-y-auto border-t border-[#e8eaed] bg-[#fafbfc] px-4 py-4 lg:border-l lg:border-t-0">
            <div className="rounded-lg border border-[#e8eaed] bg-white p-3">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#9ba1ab]">Queda así</p>
              <p className="text-[13px] font-medium leading-snug text-[#16181d]">{frase}</p>
            </div>

            <div className="rounded-lg border border-[#e8eaed] bg-white p-3">
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-[#9ba1ab]">Pruébala</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[#5b616e]">El trabajo deja</span>
                  <input
                    type="number" min="0" value={ingreso}
                    onChange={e => setIngreso(e.target.value)}
                    className="num h-[34px] w-full rounded-md border border-[#e2e5ea] px-2 text-[13px] outline-none focus:border-[#f97316]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[#5b616e]">De eso, mano de obra</span>
                  <input
                    type="number" min="0" value={manoObra}
                    onChange={e => setManoObra(e.target.value)}
                    className="num h-[34px] w-full rounded-md border border-[#e2e5ea] px-2 text-[13px] outline-none focus:border-[#f97316]"
                  />
                </label>
              </div>

              <dl className="mt-3 space-y-1.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[#5b616e]">{persona?.nombre.split(' ')[0] || 'El técnico'} cobra</dt>
                  <dd className="num text-[17px] font-extrabold text-[#16a34a]">{usd(sim.comision)}</dd>
                </div>
                {sim.proveedor > 0 && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-[#5b616e]">{r.proveedor_nombre || 'Proveedor'}</dt>
                    <dd className="num font-semibold text-[#7c3aed]">{usd(sim.proveedor)}</dd>
                  </div>
                )}
                {r.tipo_regla !== 'fijo_semanal' && r.tipo_regla !== 'tarifa_flat' && (
                  <div className="flex items-baseline justify-between gap-2 border-t border-[#f2f3f5] pt-1.5">
                    <dt className="text-[#5b616e]">Le queda al taller</dt>
                    <dd className={cn('num font-bold', sim.taller < 0 ? 'text-[#dc2626]' : 'text-[#16181d]')}>
                      {usd(sim.taller)}
                    </dd>
                  </div>
                )}
              </dl>

              {sim.nota && (
                <p className="mt-2 rounded-md bg-[#f6f7f9] px-2.5 py-2 text-[11px] leading-snug text-[#5b616e]">
                  {sim.nota}
                </p>
              )}
            </div>

            {avisos.map((a, i) => (
              <p key={i} className="flex items-start gap-1.5 rounded-lg border border-[#ffd9bd] bg-[#fff8f3] px-2.5 py-2 text-[11.5px] leading-snug text-[#7c2d12]">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                {a}
              </p>
            ))}

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e8eaed] bg-white px-3 py-2.5 text-[12.5px] text-[#3d4350]">
              <input
                type="checkbox"
                checked={r.activo !== false}
                onChange={e => set('activo', e.target.checked as CommissionRule['activo'])}
                className="h-[16px] w-[16px] rounded border-[#cfd4dc] accent-[#f97316]"
              />
              Regla activa
              <CalendarClock className="ml-auto h-3.5 w-3.5 text-[#9ba1ab]" aria-hidden />
            </label>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-[#e8eaed] px-5 py-3.5">
          {(error || problema) && (
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-1.5 text-[12px] text-[#b91c1c]">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
              {error || problema}
            </p>
          )}
          <div className={cn('flex items-center gap-2', !(error || problema) && 'ml-auto')}>
            <button onClick={onCerrar} className="h-[38px] rounded-lg border border-[#e2e5ea] px-4 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || Boolean(problema)}
              className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear regla'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const INPUT = 'h-[40px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316]';

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-[#16181d]">
        <span className="num flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[#16181d] text-[10.5px] font-bold text-white">
          {n}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}
