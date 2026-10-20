'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Clock, Hammer, Loader2, Maximize2, Minus, Package, Play, Plus, RefreshCw,
  Search, Wrench, X,
} from 'lucide-react';
import type { OrdenPantalla, PersonaPantalla, TableroTaller, TipoCarga } from '@/lib/taller/pantalla';

/**
 * Pantalla del taller.
 *
 * Para la TV o la PC del piso, con la cuenta «Taller». Se lee de lejos (placas
 * grandes, cuánto lleva cada carro) y se toca con el dedo. El mecánico no tiene
 * usuario: toca su nombre, dice qué hizo y cuánto vale, y queda en la orden y
 * en su nómina. Se actualiza sola cada 30 segundos.
 */

const usd = (x: number) => `$${(Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const REFRESCO_MS = 30_000;
const RECORDAR_QUIEN_MS = 3 * 60_000;

function hace(iso: string): { texto: string; tono: 'ok' | 'aviso' | 'mal' } {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return { texto: `${min} min`, tono: 'ok' };
  const h = Math.round(min / 60);
  if (h < 24) return { texto: `${h} h`, tono: h >= 8 ? 'aviso' : 'ok' };
  const d = Math.floor(h / 24);
  return { texto: `${d} d${h % 24 ? ` ${h % 24} h` : ''}`, tono: d >= 3 ? 'mal' : 'aviso' };
}

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

type Filtro = 'todos' | 'entrada' | 'taller';
type Paso =
  | { modo: 'cargar'; orden: OrdenPantalla; persona: PersonaPantalla | null }
  | { modo: 'empezar' | 'terminado'; orden: OrdenPantalla; persona: PersonaPantalla | null };

export default function PantallaTaller() {
  const [datos, setDatos] = useState<TableroTaller | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscar, setBuscar] = useState('');
  const [deQuien, setDeQuien] = useState<string>('');
  const [paso, setPaso] = useState<Paso | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; bien: boolean } | null>(null);
  const [reloj, setReloj] = useState(() => new Date());
  const pasoRef = useRef(paso);
  pasoRef.current = paso;

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const r = await fetch('/api/taller/tablero', { cache: 'no-store' });
      if (r.status === 401) { window.location.href = '/login?from=/pantalla-taller'; return; }
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'No se pudo cargar el taller.'); return; }
      setDatos(j); setError(null);
    } catch {
      setError('Sin conexión. Reintentando…');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    // Se refresca sola, pero no mientras alguien está cargando un trabajo.
    const t = setInterval(() => { if (!pasoRef.current) void cargar(true); }, REFRESCO_MS);
    const r = setInterval(() => setReloj(new Date()), 15_000);
    const vis = () => { if (document.visibilityState === 'visible') void cargar(true); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); clearInterval(r); document.removeEventListener('visibilitychange', vis); };
  }, [cargar]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 5000); return () => clearTimeout(t); }, [aviso]);

  const ordenes = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (datos?.ordenes || [])
      .filter(o => filtro === 'todos' || o.columna === filtro)
      .filter(o => !deQuien || o.encargados.some(e => e.id === deQuien))
      .filter(o => !q || `${o.placa} ${o.vehiculo} ${o.cliente} ${o.trabajo}`.toLowerCase().includes(q))
      // Primero lo que acaba de entrar; luego, en el taller, lo que se movió hace
      // menos (lo que se está trabajando de verdad), y al final lo olvidado.
      .sort((a, b) => (a.columna === b.columna ? Date.parse(b.movida) - Date.parse(a.movida) : a.columna === 'entrada' ? -1 : 1));
  }, [datos, filtro, buscar, deQuien]);

  const nEntrada = datos?.ordenes.filter(o => o.columna === 'entrada').length || 0;
  const nTaller = datos?.ordenes.filter(o => o.columna === 'taller').length || 0;

  // Quién está usando la pantalla: se recuerda unos minutos para no elegirse a
  // cada rato, y luego se olvida (la pantalla es de todos).
  const recordado = (): PersonaPantalla | null => {
    try {
      const g = JSON.parse(sessionStorage.getItem('taller:quien') || 'null');
      if (g && Date.now() - g.t < RECORDAR_QUIEN_MS) return datos?.personal.find(p => p.id === g.id) || null;
    } catch { /* sin almacenamiento: se elige cada vez */ }
    return null;
  };
  const recordar = (p: PersonaPantalla) => {
    try { sessionStorage.setItem('taller:quien', JSON.stringify({ id: p.id, t: Date.now() })); } catch { /* nada */ }
  };

  return (
    <div className="min-h-dvh bg-[#0a0e16] text-slate-100 antialiased [color-scheme:dark]">
      {/* Cabecera */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0e16]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black italic tracking-tight"><span className="text-orange-500">LYCOS</span> TEAM</span>
            <span className="hidden rounded-lg bg-white/5 px-2.5 py-1 text-sm font-semibold text-slate-400 sm:inline">Pantalla del taller</span>
          </div>
          <div className="flex items-center gap-3">
            <Contador etiqueta="Entrada" valor={nEntrada} color="text-amber-400" />
            <Contador etiqueta="En taller" valor={nTaller} color="text-violet-400" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-3xl font-black tabular-nums">{reloj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="text-xs capitalize text-slate-400">{reloj.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </div>
            <button type="button" onClick={() => void cargar()} aria-label="Actualizar"
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10">
              <RefreshCw className={`h-5 w-5 ${cargando ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label="Pantalla completa"
              className="hidden h-12 w-12 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 sm:flex">
              <Maximize2 className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
          {([['todos', 'Todos'], ['entrada', 'Entrada'], ['taller', 'En taller']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={`h-11 rounded-xl px-4 text-base font-bold ${filtro === k ? 'bg-orange-500 text-black' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
              {t}
            </button>
          ))}
          <select value={deQuien} onChange={e => setDeQuien(e.target.value)}
            className="h-11 rounded-xl border-0 bg-white/5 px-3 text-base font-semibold text-slate-200 outline-none">
            <option value="">Todos los mecánicos</option>
            {(datos?.personal || []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-xl bg-white/5 px-3 sm:max-w-xs">
            <Search className="h-5 w-5 text-slate-500" aria-hidden />
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar placa o carro"
              className="w-full bg-transparent text-base outline-none placeholder:text-slate-500" />
          </label>
        </div>
      </header>

      {error && <p className="mx-4 mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-base text-red-300 sm:mx-6">{error}</p>}

      {/* Vehículos */}
      <main className="grid grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {cargando && !datos && <div className="col-span-full flex justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-slate-500" aria-hidden /></div>}
        {datos && ordenes.length === 0 && (
          <p className="col-span-full py-24 text-center text-xl text-slate-500">No hay vehículos {filtro === 'entrada' ? 'en Entrada' : filtro === 'taller' ? 'en el taller' : 'en curso'} con ese filtro.</p>
        )}
        {ordenes.map(o => (
          <Tarjeta key={o.id} o={o}
            onCargar={() => setPaso({ modo: 'cargar', orden: o, persona: recordado() })}
            onEmpezar={() => setPaso({ modo: 'empezar', orden: o, persona: recordado() })}
            onTerminar={() => setPaso({ modo: 'terminado', orden: o, persona: recordado() })}
          />
        ))}
      </main>

      {paso && datos && (
        <Panel
          paso={paso}
          personal={datos.personal}
          sugerencias={datos.sugerencias}
          onElegir={p => { recordar(p); setPaso({ ...paso, persona: p }); }}
          onCambiar={() => { try { sessionStorage.removeItem('taller:quien'); } catch { /* nada */ } setPaso({ ...paso, persona: null }); }}
          onCerrar={() => setPaso(null)}
          onListo={(texto) => { setPaso(null); setAviso({ texto, bien: true }); void cargar(true); }}
          onError={(texto) => setAviso({ texto, bien: false })}
        />
      )}

      {aviso && (
        <div className={`fixed inset-x-4 bottom-6 z-50 mx-auto max-w-xl rounded-2xl px-5 py-4 text-lg font-bold shadow-2xl ${aviso.bien ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`} role="status">
          {aviso.texto}
        </div>
      )}
    </div>
  );
}

function Contador({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-1.5 leading-tight">
      <div className={`text-2xl font-black tabular-nums ${color}`}>{valor}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{etiqueta}</div>
    </div>
  );
}

function Tarjeta({ o, onCargar, onEmpezar, onTerminar }: { o: OrdenPantalla; onCargar: () => void; onEmpezar: () => void; onTerminar: () => void }) {
  const t = hace(o.desde);
  const entrada = o.columna === 'entrada';
  const visibles = o.renglones.slice(-5);
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121826]">
      <div className={`h-1.5 ${entrada ? 'bg-amber-400' : 'bg-violet-500'}`} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-3xl font-black tracking-wider text-white">{o.placa}</div>
            <div className="truncate text-base font-semibold text-slate-300">{o.vehiculo}</div>
            <div className="text-sm text-slate-500">{o.cliente}{o.puesto ? ` · Puesto ${o.puesto}` : ''}</div>
          </div>
          <div className="shrink-0 text-right">
            <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-black uppercase tracking-wider ${entrada ? 'bg-amber-400/15 text-amber-300' : 'bg-violet-500/15 text-violet-300'}`}>
              {entrada ? 'Entrada' : 'En taller'}
            </span>
            <div className={`mt-1.5 flex items-center justify-end gap-1 text-sm font-bold ${t.tono === 'mal' ? 'text-red-400' : t.tono === 'aviso' ? 'text-amber-300' : 'text-slate-400'}`}>
              <Clock className="h-4 w-4" aria-hidden /> {t.texto}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-lg font-semibold leading-snug text-slate-100">{o.trabajo}</p>

        {o.encargados.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {o.encargados.map((e, i) => (
              <span key={i} className="rounded-lg bg-white/5 px-2 py-1 text-sm font-semibold text-slate-200">
                <Wrench className="mr-1 inline h-3.5 w-3.5 text-orange-400" aria-hidden />{e.nombre.split(/\s+/).slice(0, 2).join(' ')}
              </span>
            ))}
          </div>
        )}

        <div className="rounded-xl bg-black/25 p-3">
          {o.renglones.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay trabajos cargados.</p>
          ) : (
            <ul className="space-y-1">
              {o.renglones.length > visibles.length && <li className="text-xs text-slate-500">+{o.renglones.length - visibles.length} anteriores</li>}
              {visibles.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span className="min-w-0 truncate text-slate-300">
                    {r.esManoObra ? <Hammer className="mr-1.5 inline h-3.5 w-3.5 text-orange-400" aria-hidden /> : <Package className="mr-1.5 inline h-3.5 w-3.5 text-sky-400" aria-hidden />}
                    {r.descripcion}{r.cantidad > 1 ? ` × ${r.cantidad}` : ''}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{usd(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">Total</span>
            <span className="text-2xl font-black tabular-nums">{usd(o.total)}</span>
          </div>
        </div>

        {o.ultimo && <p className="line-clamp-1 text-xs text-slate-500">Último: {o.ultimo}</p>}

        <div className="mt-auto grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={onCargar}
            className="flex h-14 items-center justify-center gap-2 rounded-xl bg-orange-500 text-lg font-black text-black active:scale-[0.98]">
            <Plus className="h-6 w-6" aria-hidden /> Cargar trabajo
          </button>
          {entrada ? (
            <button type="button" onClick={onEmpezar}
              className="flex h-14 items-center gap-2 rounded-xl bg-violet-500/20 px-4 text-base font-bold text-violet-200 active:scale-[0.98]">
              <Play className="h-5 w-5" aria-hidden /> Empecé
            </button>
          ) : (
            <button type="button" onClick={onTerminar}
              className="flex h-14 items-center gap-2 rounded-xl bg-emerald-500/20 px-4 text-base font-bold text-emerald-200 active:scale-[0.98]">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Terminé
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

const TIPOS: Array<{ id: TipoCarga; texto: string; icono: React.ReactNode }> = [
  { id: 'mano_obra', texto: 'Mano de obra', icono: <Hammer className="h-6 w-6" aria-hidden /> },
  { id: 'repuesto', texto: 'Repuesto', icono: <Package className="h-6 w-6" aria-hidden /> },
  { id: 'otro', texto: 'Otro', icono: <Wrench className="h-6 w-6" aria-hidden /> },
];
const PRECIOS_RAPIDOS = [5, 10, 15, 20, 25, 30, 40, 50];

function Panel({ paso, personal, sugerencias, onElegir, onCambiar, onCerrar, onListo, onError }: {
  paso: Paso; personal: PersonaPantalla[]; sugerencias: TableroTaller['sugerencias'];
  onElegir: (p: PersonaPantalla) => void; onCambiar: () => void; onCerrar: () => void; onListo: (t: string) => void; onError: (t: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoCarga>('mano_obra');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const p = paso.persona;
  const o = paso.orden;
  const total = (Number(precio) || 0) * cantidad;

  const enviar = async () => {
    if (!p) return;
    setEnviando(true);
    try {
      const r = paso.modo === 'cargar'
        ? await fetch('/api/taller/trabajo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servicio_id: o.id, empleado_id: p.id, tipo, descripcion, cantidad, precio: Number(precio) || 0 }),
        })
        : await fetch('/api/taller/estado', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servicio_id: o.id, empleado_id: p.id, accion: paso.modo }),
        });
      const j = await r.json().catch(() => null);
      if (!r.ok) { onError(j?.error || 'No se pudo guardar.'); return; }
      onListo(paso.modo === 'cargar'
        ? `✓ ${o.placa}: ${j.renglon} · ${usd(total)}${j.nomina ? ` · ${j.nomina}` : ''}`
        : paso.modo === 'empezar' ? `✓ ${o.placa} pasó a En taller` : `✓ ${o.placa}: avisado que está listo`);
    } catch {
      onError('Sin conexión: no se guardó. Inténtalo de nuevo.');
    } finally { setEnviando(false); }
  };

  const valido = paso.modo !== 'cargar' || (descripcion.trim().length >= 3 && precio !== '' && Number(precio) >= 0);
  const titulo = paso.modo === 'cargar' ? 'Cargar trabajo' : paso.modo === 'empezar' ? 'Empezar trabajo' : 'Avisar que terminé';

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={onCerrar}>
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#121826] sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold uppercase tracking-wider text-orange-400">{titulo}</div>
            <div className="truncate text-2xl font-black"><span className="font-mono">{o.placa}</span> <span className="text-lg font-semibold text-slate-400">· {o.vehiculo}</span></div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!p ? (
            <>
              <p className="mb-3 text-xl font-bold">¿Quién eres?</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {personal.map(x => (
                  <button key={x.id} type="button" onClick={() => onElegir(x)}
                    className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-white/5 p-3 text-left hover:bg-white/10 active:scale-[0.98]">
                    {x.foto
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={x.foto} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                      : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-lg font-black text-orange-300">{iniciales(x.nombre)}</span>}
                    <span className="text-lg font-bold leading-tight">{x.corto}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-lg">Como <b>{p.nombre}</b></span>
                <button type="button" onClick={onCambiar} className="text-base font-semibold text-orange-400">No soy yo</button>
              </div>

              {paso.modo === 'cargar' ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-2">
                    {TIPOS.map(t => (
                      <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                        className={`flex h-20 flex-col items-center justify-center gap-1 rounded-2xl text-base font-bold ${tipo === t.id ? 'bg-orange-500 text-black' : 'bg-white/5 text-slate-200'}`}>
                        {t.icono}{t.texto}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-base font-semibold text-slate-300" htmlFor="desc">¿Qué hiciste?</label>
                    <input id="desc" value={descripcion} onChange={e => setDescripcion(e.target.value)} autoComplete="off"
                      placeholder={tipo === 'repuesto' ? 'Ej.: Abrazadera 2 pulgadas' : 'Ej.: Soldadura de tubo de escape'}
                      className="h-14 w-full rounded-2xl bg-black/30 px-4 text-xl outline-none ring-orange-500 focus:ring-2" />
                    {tipo === 'mano_obra' && sugerencias.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sugerencias.slice(0, 10).map(s => (
                          <button key={s.descripcion} type="button"
                            onClick={() => { setDescripcion(s.descripcion); if (s.precio > 0) setPrecio(String(s.precio)); }}
                            className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                            {s.descripcion}{s.precio > 0 ? ` · ${usd(s.precio)}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
                    <div>
                      <span className="mb-1.5 block text-base font-semibold text-slate-300">Cantidad</span>
                      <div className="flex h-14 items-center gap-2">
                        <button type="button" onClick={() => setCantidad(c => Math.max(1, c - 1))} aria-label="Menos" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5"><Minus className="h-6 w-6" aria-hidden /></button>
                        <span className="w-12 text-center text-2xl font-black tabular-nums">{cantidad}</span>
                        <button type="button" onClick={() => setCantidad(c => Math.min(100, c + 1))} aria-label="Más" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5"><Plus className="h-6 w-6" aria-hidden /></button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-base font-semibold text-slate-300" htmlFor="precio">Precio (en dólares)</label>
                      <input id="precio" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
                        placeholder="0.00" className="h-14 w-full rounded-2xl bg-black/30 px-4 text-2xl font-bold tabular-nums outline-none ring-orange-500 focus:ring-2" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PRECIOS_RAPIDOS.map(v => (
                      <button key={v} type="button" onClick={() => setPrecio(String(v))}
                        className={`h-12 min-w-[64px] rounded-xl px-3 text-lg font-bold ${Number(precio) === v ? 'bg-orange-500 text-black' : 'bg-white/5 text-slate-200'}`}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xl leading-relaxed text-slate-200">
                  {paso.modo === 'empezar'
                    ? 'El carro pasa a «En taller» y queda anotado que tú empezaste.'
                    : 'Queda anotado que terminaste y que el carro está listo para entregar y cobrar. Cobranza o el jefe de taller lo cierran.'}
                </p>
              )}
            </>
          )}
        </div>

        {p && (
          <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
            {paso.modo === 'cargar' && (
              <div className="mr-auto leading-tight">
                <div className="text-sm text-slate-400">Total</div>
                <div className="text-3xl font-black tabular-nums">{usd(total)}</div>
              </div>
            )}
            <button type="button" disabled={!valido || enviando} onClick={enviar}
              className="ml-auto flex h-16 min-w-[200px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 text-xl font-black text-black disabled:opacity-40">
              {enviando ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <CheckCircle2 className="h-6 w-6" aria-hidden />}
              {paso.modo === 'cargar' ? 'Guardar' : paso.modo === 'empezar' ? 'Empecé' : 'Terminé'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
