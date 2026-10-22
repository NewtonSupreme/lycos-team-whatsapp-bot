'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Delete, Hammer, IdCard, Loader2, Lock, LogOut, Search, ShieldCheck, X } from 'lucide-react';
import { coincide, type PersonaPantalla } from '@/lib/taller/pantalla';
import type { CuentaTrabajador, PeriodoCuenta, TrabajoCuenta } from '@/lib/taller/cuenta';

/*
 * «Mi cuenta» en la TV del taller. Cada trabajador ve lo que cargó y lo que
 * se cobró, pero solo con el código de su carnet: los montos son privados.
 * La cuenta se cierra sola al minuto sin tocar nada, para que el siguiente
 * que pase frente a la TV no vea lo del otro.
 */

const CIERRE_S = 60;
const usd = (x: number) => `$${(Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });

type Vista = 'hoy' | 'semana' | 'semanaPasada';

export default function MiCuenta({ personal, onCerrar }: { personal: PersonaPantalla[]; onCerrar: () => void }) {
  const [persona, setPersona] = useState<PersonaPantalla | null>(null);
  const [cuenta, setCuenta] = useState<CuentaTrabajador | null>(null);
  const [vista, setVista] = useState<Vista>('hoy');
  const [quedan, setQuedan] = useState(CIERRE_S);
  const ultimoToque = useRef(0);

  // Cualquier toque reinicia la cuenta regresiva; sin tocar, se cierra sola.
  const tocar = useCallback(() => { ultimoToque.current = Date.now(); setQuedan(CIERRE_S); }, []);
  useEffect(() => {
    ultimoToque.current = Date.now();
    const t = setInterval(() => {
      const q = CIERRE_S - Math.floor((Date.now() - ultimoToque.current) / 1000);
      if (q <= 0) onCerrar(); else setQuedan(q);
    }, 1000);
    return () => clearInterval(t);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-40 flex bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Mi cuenta"
      onPointerDown={tocar} onKeyDown={tocar}>
      <div className="sube relative flex h-full w-full flex-col overflow-hidden border-[var(--linea)] bg-[var(--fondo)] lg:m-6 lg:h-[calc(100%-3rem)] lg:rounded-[28px] lg:border">
        <div className="franja h-1.5 shrink-0" aria-hidden />
        <div className="flex items-center gap-4 border-b border-[var(--linea)] px-5 py-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--naranja)]/15 text-[var(--naranja)]"><IdCard className="h-8 w-8" strokeWidth={1.75} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="display text-[34px] font-black uppercase leading-none">Mi cuenta</div>
            <div className="mt-1 flex items-center gap-1.5 text-base text-[var(--tenue)]"><Lock className="h-4 w-4" aria-hidden /> Privada: entra con el código de tu carnet</div>
          </div>
          <Cuenta quedan={quedan} />
          <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--linea)] bg-[var(--panel)] hover:bg-[var(--panel-2)]">
            <X className="h-7 w-7" aria-hidden />
          </button>
        </div>

        {!persona && <Quien personal={personal} onElegir={p => { setPersona(p); tocar(); }} />}
        {persona && !cuenta && <Codigo persona={persona} onAtras={() => setPersona(null)} onEntrar={c => { setCuenta(c); setVista('hoy'); }} />}
        {persona && cuenta && <Resumen cuenta={cuenta} vista={vista} setVista={setVista} onSalir={onCerrar} />}
      </div>
    </div>
  );
}

function Cuenta({ quedan }: { quedan: number }) {
  // Anillo que se vacía: cuánto falta para que se cierre sola.
  const r = 22, c = 2 * Math.PI * r, urge = quedan <= 10;
  return (
    <div className="relative hidden h-14 w-14 shrink-0 sm:block" title={`Se cierra sola en ${quedan} s`} aria-label={`Se cierra sola en ${quedan} segundos`}>
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={urge ? 'var(--rojo)' : 'var(--naranja)'} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - quedan / CIERRE_S)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <span className={`display absolute inset-0 flex items-center justify-center text-xl font-black tabular-nums ${urge ? 'text-[var(--rojo)]' : ''}`}>{quedan}</span>
    </div>
  );
}

function Avatar({ p, size }: { p: { nombre: string; foto: string | null }; size: number }) {
  return p.foto
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={p.foto} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : (
      <span className="display flex shrink-0 items-center justify-center rounded-full bg-[var(--naranja)]/15 font-black text-[var(--naranja)] ring-1 ring-[var(--naranja)]/30"
        style={{ width: size, height: size, fontSize: size * 0.42 }}>{iniciales(p.nombre)}</span>
    );
}

// ── 1. ¿Quién eres? ─────────────────────────────────────────────────────────

function Quien({ personal, onElegir }: { personal: PersonaPantalla[]; onElegir: (p: PersonaPantalla) => void }) {
  const [q, setQ] = useState('');
  const lista = personal.filter(p => !q.trim() || coincide(q, p.nombre, p.corto) > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 py-6 sm:px-10">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <h3 className="display text-[56px] font-black uppercase leading-none">¿Quién eres?</h3>
        <span className="mb-2 text-lg text-[var(--tenue)]">Toca tu nombre</span>
        {personal.length > 9 && (
          <label className="mb-1 ml-auto flex h-14 w-full items-center gap-2.5 rounded-2xl border border-[var(--linea)] bg-[var(--panel)] px-4 sm:w-[320px]">
            <Search className="h-5 w-5 text-[var(--tenue)]" aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tu nombre" className="w-full bg-transparent text-lg outline-none placeholder:text-[var(--apagado)]" aria-label="Buscar nombre" />
          </label>
        )}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto pb-2 md:grid-cols-3 xl:grid-cols-4">
        {lista.map((p, i) => (
          <button key={p.id} type="button" onClick={() => onElegir(p)}
            className="entra flex min-h-[112px] items-center gap-4 rounded-3xl border border-[var(--linea)] bg-[var(--panel)] p-4 text-left transition-colors hover:border-[var(--naranja)] active:scale-[0.98]"
            style={{ animationDelay: `${i * 30}ms` }}>
            <Avatar p={p} size={64} />
            <span className="display block text-[28px] font-black uppercase leading-[0.95]">{p.corto}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 2. El código del carnet ─────────────────────────────────────────────────

function Codigo({ persona, onAtras, onEntrar }: { persona: PersonaPantalla; onAtras: () => void; onEntrar: (c: CuentaTrabajador) => void }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [sacude, setSacude] = useState(0);

  const entrar = useCallback(async (c: string) => {
    setEnviando(true); setError(null);
    try {
      const r = await fetch('/api/taller/mi-cuenta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empleado_id: persona.id, codigo: c }) });
      const j = await r.json().catch(() => null);
      if (r.ok) { onEntrar(j); return; }
      setError(j?.error || 'No se pudo abrir.'); setBloqueado(j?.motivo === 'bloqueado' || j?.motivo === 'sin_codigo');
      setCodigo(''); setSacude(s => s + 1);
    } catch {
      setError('Sin conexión.'); setCodigo('');
    } finally { setEnviando(false); }
  }, [persona.id, onEntrar]);

  const poner = (d: string) => {
    if (enviando || bloqueado) return;
    setError(null);
    const n = (codigo + d).slice(0, 4);
    setCodigo(n);
    if (n.length === 4) void entrar(n);
  };

  // También con teclado físico (PC del taller).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) poner(e.key);
      else if (e.key === 'Backspace') setCodigo(c => c.slice(0, -1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1fr_minmax(420px,520px)]">
      <div className="flex flex-col justify-center gap-6 px-6 py-8 sm:px-12">
        <button type="button" onClick={onAtras} className="flex w-fit items-center gap-2 rounded-xl text-lg font-bold text-[var(--tenue)] hover:text-white">
          <ArrowLeft className="h-6 w-6" aria-hidden /> No soy yo
        </button>
        <div className="flex items-center gap-6">
          <Avatar p={persona} size={120} />
          <div className="min-w-0">
            <div className="text-lg font-semibold uppercase tracking-[0.2em] text-[var(--tenue)]">Hola,</div>
            <div className="display text-[72px] font-black uppercase leading-[0.9]">{persona.corto}</div>
          </div>
        </div>
        <p className="max-w-xl text-2xl leading-snug text-[var(--tenue)]">
          Escribe los <b className="text-white">4 números</b> de tu carnet. Son solo tuyos: no se los pases a nadie.
        </p>

        <div key={sacude} className={`flex gap-4 ${sacude ? 'pt-sacude' : ''}`} aria-live="polite" aria-label={`${codigo.length} de 4 números`}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} className={`flex h-24 w-20 items-center justify-center rounded-2xl border-2 transition-colors ${
              error ? 'border-[var(--rojo)] bg-[var(--rojo)]/10' : i < codigo.length ? 'border-[var(--naranja)] bg-[var(--naranja)]/10' : i === codigo.length ? 'border-white/40 bg-[var(--panel)]' : 'border-[var(--linea)] bg-[var(--panel)]'}`}>
              {i < codigo.length && <span className="h-6 w-6 rounded-full bg-[var(--naranja)]" />}
            </span>
          ))}
          {enviando && <Loader2 className="ml-2 h-10 w-10 animate-spin self-center text-[var(--tenue)]" aria-hidden />}
        </div>
        {error && <p role="alert" className="text-2xl font-bold text-[#ff8f8f]">{error}</p>}
      </div>

      <div className="grid grid-cols-3 content-center gap-3 border-t border-[var(--linea)] bg-[var(--panel)] p-6 lg:border-l lg:border-t-0">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" onClick={() => poner(d)} disabled={enviando || bloqueado}
            className="display h-24 rounded-2xl bg-[var(--panel-2)] text-5xl font-black hover:bg-white/10 active:scale-[0.97] disabled:opacity-40">{d}</button>
        ))}
        <button type="button" onClick={() => { setCodigo(''); setError(null); }} disabled={enviando}
          className="h-24 rounded-2xl text-xl font-bold text-[var(--tenue)] hover:bg-white/5">Borrar</button>
        <button type="button" onClick={() => poner('0')} disabled={enviando || bloqueado}
          className="display h-24 rounded-2xl bg-[var(--panel-2)] text-5xl font-black hover:bg-white/10 active:scale-[0.97] disabled:opacity-40">0</button>
        <button type="button" onClick={() => setCodigo(c => c.slice(0, -1))} disabled={enviando} aria-label="Quitar el último"
          className="flex h-24 items-center justify-center rounded-2xl text-[var(--tenue)] hover:bg-white/5"><Delete className="h-9 w-9" aria-hidden /></button>
      </div>
    </div>
  );
}

// ── 3. La cuenta ────────────────────────────────────────────────────────────

function Resumen({ cuenta, vista, setVista, onSalir }: { cuenta: CuentaTrabajador; vista: Vista; setVista: (v: Vista) => void; onSalir: () => void }) {
  // En la semana se puede tocar un día para ver solo lo de ese día.
  const [dia, setDia] = useState<string | null>(null);
  const base: PeriodoCuenta = cuenta[vista];
  const p: PeriodoCuenta = dia ? (() => {
    const t = base.trabajos.filter(x => x.fecha === dia);
    return { ...base, trabajos: t, cantidad: t.length, total: Math.round(t.reduce((a, x) => a + x.monto, 0) * 100) / 100 };
  })() : base;
  const pendiente = p.trabajos.filter(t => t.estado === 'pendiente').reduce((a, t) => a + t.monto, 0);
  const pagado = p.total - pendiente;
  const porDia = new Map<string, TrabajoCuenta[]>();
  p.trabajos.forEach(t => porDia.set(t.fecha, [...(porDia.get(t.fecha) || []), t]));

  const pestanas: Array<{ id: Vista; texto: string; sub: string; n: number }> = [
    { id: 'hoy', texto: 'Hoy', sub: fechaCorta(cuenta.hoy.desde), n: cuenta.hoy.cantidad },
    { id: 'semana', texto: 'Esta semana', sub: `desde el lun ${fechaCorta(cuenta.semana.desde)}`, n: cuenta.semana.cantidad },
    { id: 'semanaPasada', texto: 'Semana pasada', sub: `${fechaCorta(cuenta.semanaPasada.desde)} – ${fechaCorta(cuenta.semanaPasada.hasta)}`, n: cuenta.semanaPasada.cantidad },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--linea)] px-5 py-4 sm:px-8">
        <Avatar p={cuenta.persona} size={64} />
        <div className="min-w-0">
          <div className="display truncate text-[40px] font-black uppercase leading-none">{cuenta.persona.nombre}</div>
          <div className="mt-1 flex items-center gap-1.5 text-base font-semibold text-[var(--verde)]"><ShieldCheck className="h-5 w-5" aria-hidden /> Código correcto{cuenta.persona.cargo ? <span className="font-normal text-[var(--tenue)]"> · {cuenta.persona.cargo}</span> : null}</div>
        </div>
        <div className="ml-auto flex gap-2" role="tablist">
          {pestanas.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={vista === t.id} onClick={() => { setVista(t.id); setDia(null); }}
              className={`rounded-2xl border px-5 py-2.5 text-left transition-colors ${vista === t.id ? 'border-[var(--naranja)] bg-[var(--naranja)]/15' : 'border-[var(--linea)] bg-[var(--panel)] hover:bg-[var(--panel-2)]'}`}>
              <span className="flex items-baseline gap-2">
                <span className="display text-2xl font-black uppercase">{t.texto}</span>
                <span className={`display rounded-md px-1.5 text-lg font-extrabold ${vista === t.id ? 'bg-[var(--naranja)] text-black' : 'bg-[var(--panel-2)] text-[var(--tenue)]'}`}>{t.n}</span>
              </span>
              <span className="block text-xs text-[var(--tenue)]">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(360px,32%)_1fr]">
        {/* Números grandes */}
        <aside className="flex flex-col gap-5 border-b border-[var(--linea)] p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--tenue)]">{dia ? `Cobrado el ${fechaLarga(dia)}` : 'Cobrado por tus trabajos'}</div>
            <div key={`${vista}:${dia}`} className="entra display mt-1 text-[88px] font-black leading-none tabular-nums text-[var(--naranja)]">{usd(p.total)}</div>
            <div className="mt-2 text-xl text-[var(--tenue)]">{p.cantidad} trabajo{p.cantidad === 1 ? '' : 's'} cargado{p.cantidad === 1 ? '' : 's'}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Cifra etiqueta="Por liquidar" valor={usd(pendiente)} color="var(--amarillo)" />
            <Cifra etiqueta="Ya liquidado" valor={usd(pagado)} color="var(--verde)" />
          </div>
          {vista !== 'hoy' && <Semana periodo={base} dia={dia} onDia={d => setDia(x => (x === d ? null : d))} />}
          <p className="mt-auto text-sm leading-relaxed text-[var(--apagado)]">
            Es lo que se cobró al cliente por cada trabajo que cargaste. Si algo no cuadra, avísale al jefe de taller antes del pago.
          </p>
        </aside>

        {/* Lo cargado, día por día */}
        <section className="min-h-0 p-5 sm:p-8">
          {dia && (
            <button type="button" onClick={() => setDia(null)}
              className="mb-5 flex items-center gap-2 rounded-full border border-[var(--naranja)]/40 bg-[var(--naranja)]/10 px-4 py-2 text-lg font-bold text-[var(--naranja)]">
              Solo el {fechaLarga(dia)} <X className="h-5 w-5" aria-hidden /> <span className="font-semibold text-[var(--tenue)]">ver toda la semana</span>
            </button>
          )}
          {p.cantidad === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <Hammer className="h-14 w-14 text-[var(--apagado)]" strokeWidth={1.5} aria-hidden />
              <p className="text-2xl text-[var(--tenue)]">{dia ? 'Ese día no cargaste trabajos.' : vista === 'hoy' ? 'Hoy todavía no has cargado trabajos.' : 'No hay trabajos cargados en esta semana.'}</p>
            </div>
          ) : (
            <div className="space-y-7">
              {[...porDia.entries()].map(([dia, ts]) => (
                <div key={dia}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <span className="display text-2xl font-extrabold uppercase">{fechaLarga(dia)}</span>
                    <span className="h-px flex-1 bg-[var(--linea)]" />
                    <span className="display text-2xl font-black tabular-nums text-[var(--tenue)]">{usd(ts.reduce((a, t) => a + t.monto, 0))}</span>
                  </div>
                  <ul className="space-y-2">
                    {ts.map((t, i) => (
                      <li key={t.id} className="entra flex items-center gap-4 rounded-2xl border border-[var(--linea)] bg-[var(--panel)] px-4 py-3" style={{ animationDelay: `${i * 25}ms` }}>
                        <span className="w-14 shrink-0 text-base tabular-nums text-[var(--apagado)]">{t.hora || ''}</span>
                        {t.placa
                          ? <span className="display shrink-0 rounded-md bg-[#f4f1ea] px-2 py-0.5 text-xl font-black tracking-wide text-[#111]">{t.placa}</span>
                          : <span className="shrink-0 rounded-md border border-[var(--linea)] px-2 py-0.5 text-sm text-[var(--apagado)]">Sin placa</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xl font-semibold">{t.descripcion}</span>
                          {t.vehiculo && <span className="block truncate text-sm text-[var(--tenue)]">{t.vehiculo}</span>}
                        </span>
                        <Estado estado={t.estado} />
                        {t.monto
                          ? <span className="display w-32 shrink-0 text-right text-3xl font-black tabular-nums">{usd(t.monto)}</span>
                          : <span className="w-32 shrink-0 text-right text-base font-semibold text-[var(--apagado)]">Sin precio</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--linea)] bg-[var(--panel)] px-5 py-4">
        <span className="flex items-center gap-2 text-base text-[var(--tenue)]"><Lock className="h-5 w-5" aria-hidden /> Al terminar, sal: así nadie más ve tu cuenta.</span>
        <button type="button" onClick={onSalir}
          className="display ml-auto flex h-16 min-w-[220px] items-center justify-center gap-3 rounded-2xl bg-[var(--naranja)] px-8 text-2xl font-black uppercase text-black">
          <LogOut className="h-7 w-7" aria-hidden /> Salir
        </button>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, color }: { etiqueta: string; valor: string; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--linea)] bg-[var(--panel)] px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--tenue)]"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{etiqueta}</div>
      <div className="display mt-1 text-3xl font-black tabular-nums">{valor}</div>
    </div>
  );
}

function Estado({ estado }: { estado: TrabajoCuenta['estado'] }) {
  return estado === 'liquidado'
    ? <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--verde)]/15 px-3 py-1 text-sm font-bold text-[var(--verde)] sm:flex"><Check className="h-4 w-4" strokeWidth={3} aria-hidden />Liquidado</span>
    : <span className="hidden shrink-0 rounded-full bg-[var(--amarillo)]/15 px-3 py-1 text-sm font-bold text-[var(--amarillo)] sm:block">Por liquidar</span>;
}

/** Los siete días de la semana: cuánto se cargó cada uno. Tocar un día muestra solo ese día. */
function Semana({ periodo, dia, onDia }: { periodo: PeriodoCuenta; dia: string | null; onDia: (d: string) => void }) {
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${periodo.desde}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const ts = periodo.trabajos.filter(t => t.fecha === iso);
    return { iso, etiqueta: DIAS[i], num: d.getUTCDate(), total: ts.reduce((a, t) => a + t.monto, 0), n: ts.length, futuro: iso > periodo.hasta };
  });
  const max = Math.max(1, ...dias.map(d => d.total));
  return (
    <div className="rounded-2xl border border-[var(--linea)] bg-[var(--panel)] p-3">
      <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-[var(--tenue)]">Día por día · toca un día</div>
      <div className="grid grid-cols-7 gap-1.5">
        {dias.map(d => {
          const activo = dia === d.iso;
          return (
            <button key={d.iso} type="button" onClick={() => onDia(d.iso)} disabled={d.futuro} aria-pressed={activo}
              title={`${d.etiqueta} ${d.num}: ${d.n} trabajo(s), ${usd(d.total)}`}
              className={`flex h-36 flex-col items-center justify-end gap-1 rounded-xl border px-0.5 pb-2 pt-1.5 transition-colors disabled:opacity-30 ${activo ? 'border-[var(--naranja)] bg-[var(--naranja)]/15' : 'border-transparent hover:bg-white/5'}`}>
              <span className="display text-lg font-black tabular-nums leading-none">{d.n || ''}</span>
              <span className="flex w-full flex-1 items-end justify-center px-1">
                <span className={`w-full max-w-[28px] rounded-t-md ${d.n ? (activo ? 'bg-[var(--naranja)]' : 'bg-[#b8591a]') : 'bg-[var(--panel-2)]'}`}
                  style={{ height: d.futuro ? 0 : `${Math.max(6, (d.total / max) * 100)}%` }} />
              </span>
              <span className={`text-xs font-bold ${activo ? 'text-[var(--naranja)]' : 'text-[var(--tenue)]'}`}>{d.etiqueta}</span>
              <span className="text-[11px] tabular-nums text-[var(--apagado)]">{d.num}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
