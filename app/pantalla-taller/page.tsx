'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, AudioWaveform, Battery, Boxes, Check, CheckCircle2, ChevronRight, CircleDot, Clock, Cog, Cylinder,
  Delete, Disc3, Droplet, Droplets, Fuel, Funnel, Gauge, Hammer, Hand, Lightbulb, Link2, Loader2, Maximize2,
  Minus, Package, PenLine, Play, Plus, RefreshCw, Search, ShoppingCart, Sparkles, Spline, Trash2, Wind, Wrench, X, Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  coincide, type ArticuloPantalla, type OrdenPantalla, type PersonaPantalla, type TableroTaller, type TipoCarga,
} from '@/lib/taller/pantalla';

/**
 * Pantalla del taller — TV o PC del piso, cuenta «Taller».
 *
 * Tablero de boxes: dos carriles (Entrada / En taller), placas como placas de
 * verdad, cuánto lleva cada carro y lo que tiene cargado. Para cargar trabajo
 * hay un asistente de tres pasos que SIEMPRE pregunta quién eres (la pantalla
 * es de todos): ¿quién eres? → ¿qué hiciste? → revisar y guardar. Se busca en
 * el almacén y en los trabajos de siempre mientras se escribe, se pueden cargar
 * varias cosas de una vez y el precio se marca con un teclado en pantalla.
 */

const REFRESCO_MS = 30_000;
const QUIETO_DIAS = 7;
const usd = (x: number) => `$${(Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const diasDesde = (iso: string) => (Date.now() - Date.parse(iso)) / 86_400_000;

function tiempo(iso: string): { texto: string; tono: 'ok' | 'aviso' | 'mal' } {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return { texto: `${min} min`, tono: 'ok' };
  const h = Math.round(min / 60);
  if (h < 24) return { texto: `${h} h`, tono: h >= 8 ? 'aviso' : 'ok' };
  const d = Math.floor(h / 24);
  return { texto: `${d} d${d < 3 && h % 24 ? ` ${h % 24} h` : ''}`, tono: d >= 3 ? 'mal' : 'aviso' };
}

const CATEGORIAS: Record<string, string> = {
  silenciador: 'Silenciadores', resonador: 'Resonadores', flexible: 'Flexibles', cola_cromada: 'Colas cromadas',
  filtro_aceite: 'Filtros de aceite', filtro_gasolina: 'Filtros de gasolina', liquido: 'Líquidos', general: 'General',
};
const nombreCategoria = (c: string) => CATEGORIAS[c] || c.replace(/_/g, ' ').replace(/^\w/, x => x.toUpperCase());

/*
 * Un icono para cada pieza: primero por lo que dice su nombre (una «goma» o
 * unos «guantes» viven en la categoría General, pero no se parecen), y si no,
 * por su categoría. Iconos de línea, finos; nada de emojis.
 */
const ICONO_NOMBRE: Array<[RegExp, LucideIcon]> = [
  [/filtro.*(combust|gasolin)|(combust|gasolin).*filtro/, Fuel],
  [/filtro/, Funnel],
  [/silenciador|mofle/, Wind],
  [/resonador/, AudioWaveform],
  [/flexible/, Spline],
  [/cola|cromad|punta/, Sparkles],
  [/aceite|lubric|mineral|sintetic/, Droplet],
  [/liquido|sellador|refriger|anticongel|grasa/, Droplets],
  [/empacadura|junta|disco/, Disc3],
  [/goma|caucho|buje/, CircleDot],
  [/tirra|abrazadera|grapa|precinto/, Link2],
  [/guante/, Hand],
  [/tubo|tuberia|codo/, Cylinder],
  [/bujia|cable/, Zap],
  [/bombillo|luz|luces|faro/, Lightbulb],
  [/correa|banda/, Link2],
  [/bateria/, Battery],
  [/tripoide|rolinera|rodamiento|engranaje/, Cog],
  [/sensor|medidor/, Gauge],
];
const ICONO_CATEGORIA: Record<string, LucideIcon> = {
  silenciador: Wind, resonador: AudioWaveform, flexible: Spline, cola_cromada: Sparkles,
  filtro_aceite: Funnel, filtro_gasolina: Fuel, liquido: Droplets, general: Boxes,
};
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function iconoPieza(nombre: string, categoria?: string): LucideIcon {
  const n = sinAcentos(nombre || '');
  return ICONO_NOMBRE.find(([re]) => re.test(n))?.[1] || (categoria && ICONO_CATEGORIA[categoria]) || Package;
}

type Filtro = 'todos' | 'entrada' | 'taller' | 'quietos';
type Accion = 'cargar' | 'empezar' | 'terminado';

interface Linea {
  clave: string;
  tipo: TipoCarga;
  descripcion: string;
  cantidad: number;
  precio: string;            // texto: se edita con el teclado
  inventarioId?: string;
  stock?: number;
  categoria?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PantallaTaller() {
  const [datos, setDatos] = useState<TableroTaller | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscar, setBuscar] = useState('');
  const [deQuien, setDeQuien] = useState<string>('');
  const [asistente, setAsistente] = useState<{ accion: Accion; orden: OrdenPantalla } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; bien: boolean } | null>(null);
  const [reloj, setReloj] = useState(() => new Date());
  const abierto = useRef(false);
  abierto.current = !!asistente;

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const r = await fetch('/api/taller/tablero', { cache: 'no-store' });
      if (r.status === 401) { window.location.href = '/login?from=/pantalla-taller'; return; }
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'No se pudo cargar el taller.'); return; }
      setDatos(j); setError(null);
    } catch {
      setError('Sin conexión. Se reintenta solo…');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => { if (!abierto.current) void cargar(true); }, REFRESCO_MS);
    const r = setInterval(() => setReloj(new Date()), 15_000);
    const vis = () => { if (document.visibilityState === 'visible' && !abierto.current) void cargar(true); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); clearInterval(r); document.removeEventListener('visibilitychange', vis); };
  }, [cargar]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);

  const todas = useMemo(() => datos?.ordenes || [], [datos]);
  const visibles = useMemo(() => todas
    .filter(o => filtro === 'todos' || (filtro === 'quietos' ? esQuieta(o) : o.columna === filtro))
    .filter(o => !deQuien || o.encargados.some(e => e.id === deQuien))
    .filter(o => !buscar.trim() || coincide(buscar, o.placa, o.vehiculo, o.cliente, o.trabajo) > 0),
  [todas, filtro, deQuien, buscar]);
  // En el taller: primero lo que se movió hace menos; lo olvidado, al final.
  const entrada = visibles.filter(o => o.columna === 'entrada').sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde));
  const enTaller = visibles.filter(o => o.columna === 'taller').sort((a, b) => Date.parse(b.movida) - Date.parse(a.movida));
  const activas = enTaller.filter(o => !esQuieta(o));
  const quietas = enTaller.filter(esQuieta);

  const nEntrada = todas.filter(o => o.columna === 'entrada').length;
  const nTaller = todas.filter(o => o.columna === 'taller').length;
  const nQuietos = todas.filter(esQuieta).length;

  const abrir = (accion: Accion, orden: OrdenPantalla) => setAsistente({ accion, orden });
  // Sin carros en Entrada, el taller ocupa todo el ancho: una columna más.
  const columnas = entrada.length ? "sm:grid-cols-2 2xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className="piso min-h-dvh">
      <div className="franja h-1.5" aria-hidden />

      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[var(--linea)] bg-[rgba(11,13,16,.88)] backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="display text-[34px] font-black uppercase leading-none tracking-tight">
              <span className="text-[var(--naranja)]">Lycos</span> Team
            </span>
            <span className="display hidden text-xl font-semibold uppercase tracking-[0.18em] text-[var(--tenue)] md:inline">Taller</span>
          </div>

          <div className="flex items-stretch gap-2">
            <Indicador etiqueta="Entrada" valor={nEntrada} color="var(--amarillo)" activo={filtro === 'entrada'} onClick={() => setFiltro(f => (f === 'entrada' ? 'todos' : 'entrada'))} />
            <Indicador etiqueta="En taller" valor={nTaller} color="var(--cian)" activo={filtro === 'taller'} onClick={() => setFiltro(f => (f === 'taller' ? 'todos' : 'taller'))} />
            <Indicador etiqueta={`Quietos +${QUIETO_DIAS} d`} valor={nQuietos} color="var(--rojo)" activo={filtro === 'quietos'} onClick={() => setFiltro(f => (f === 'quietos' ? 'todos' : 'quietos'))} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-none">
              <div className="display text-[44px] font-black tabular-nums">{reloj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
              <div className="mt-1 text-sm capitalize text-[var(--tenue)]">{reloj.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </div>
            <BotonIcono etiqueta="Actualizar" onClick={() => void cargar()}><RefreshCw className={`h-6 w-6 ${cargando ? 'animate-spin' : ''}`} aria-hidden /></BotonIcono>
            <BotonIcono etiqueta="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="hidden sm:flex"><Maximize2 className="h-6 w-6" aria-hidden /></BotonIcono>
          </div>
        </div>

        {/* Filtros: búsqueda y mecánicos (tocar uno muestra solo sus carros). */}
        <div className="flex items-center gap-3 overflow-x-auto px-4 pb-3 sm:px-6">
          <label className="flex h-14 w-[280px] shrink-0 items-center gap-2.5 rounded-2xl border border-[var(--linea)] bg-[var(--panel)] px-4 focus-within:border-[var(--naranja)]">
            <Search className="h-5 w-5 text-[var(--tenue)]" aria-hidden />
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Placa, carro o cliente"
              className="w-full bg-transparent text-lg outline-none placeholder:text-[var(--apagado)]" aria-label="Buscar vehículo" />
            {buscar && <button type="button" onClick={() => setBuscar('')} aria-label="Borrar búsqueda"><X className="h-5 w-5 text-[var(--tenue)]" aria-hidden /></button>}
          </label>
          <div className="h-10 w-px shrink-0 bg-[var(--linea)]" aria-hidden />
          <ChipPersona activo={!deQuien} onClick={() => setDeQuien('')} etiqueta="Todos" />
          {(datos?.personal || []).map(p => (
            <ChipPersona key={p.id} activo={deQuien === p.id} onClick={() => setDeQuien(d => (d === p.id ? '' : p.id))} etiqueta={p.corto} persona={p} />
          ))}
        </div>
      </header>

      {error && <p className="mx-4 mt-4 rounded-2xl border border-[var(--rojo)]/30 bg-[var(--rojo)]/10 px-5 py-3 text-lg text-[#ffb3b3] sm:mx-6">{error}</p>}

      {/* ── Tablero ──────────────────────────────────────────────────── */}
      {cargando && !datos ? (
        <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-[var(--apagado)]" aria-hidden /></div>
      ) : (
        <main className={`grid gap-6 p-4 sm:p-6 ${entrada.length ? 'xl:grid-cols-[minmax(340px,26%)_1fr]' : ''}`}>
          {entrada.length ? (
            <Carril titulo="Entrada" subtitulo="Recién llegados" color="var(--amarillo)" n={entrada.length} vacio="">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {entrada.map((o, i) => <Tarjeta key={o.id} o={o} i={i} onAccion={abrir} />)}
              </div>
            </Carril>
          ) : (
            // Entrada vacía: una franja, y todo el ancho para lo que está en el taller.
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-[var(--amarillo)]/30 px-5 py-3">
              <span className="display text-3xl font-black uppercase text-[var(--amarillo)]">Entrada</span>
              <span className="display rounded-lg bg-[var(--panel-2)] px-2.5 text-2xl font-extrabold">0</span>
              <span className="text-lg text-[var(--tenue)]">Nada esperando: los carros que lleguen aparecen aquí.</span>
            </div>
          )}

          <Carril titulo="En taller" subtitulo="Trabajándose ahora" color="var(--cian)" n={activas.length + quietas.length}
            vacio="No hay carros en el taller con ese filtro.">
            <div className={`grid gap-4 ${columnas}`}>
              {activas.map((o, i) => <Tarjeta key={o.id} o={o} i={i} onAccion={abrir} />)}
            </div>
            {quietas.length > 0 && (
              <>
                <div className="mb-3 mt-8 flex flex-wrap items-center gap-3">
                  <span className="display text-xl font-extrabold uppercase tracking-wider text-[var(--rojo)]">Sin movimiento hace más de {QUIETO_DIAS} días</span>
                  <span className="h-px flex-1 bg-[var(--rojo)]/25" />
                  <span className="text-sm text-[var(--tenue)]">¿Siguen aquí? Avísale al jefe de taller</span>
                </div>
                <div className={`grid gap-4 ${columnas}`}>
                  {quietas.map((o, i) => <Tarjeta key={o.id} o={o} i={i} quieta onAccion={abrir} />)}
                </div>
              </>
            )}
          </Carril>
        </main>
      )}

      {asistente && datos && (
        <Asistente
          accion={asistente.accion}
          orden={asistente.orden}
          datos={datos}
          onCerrar={() => setAsistente(null)}
          onListo={(texto) => { setAsistente(null); setAviso({ texto, bien: true }); void cargar(true); }}
        />
      )}

      {aviso && (
        <div role="status" className={`sube fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-2xl items-center gap-3 rounded-2xl px-6 py-4 text-xl font-bold shadow-2xl ${aviso.bien ? 'bg-[var(--verde)] text-black' : 'bg-[var(--rojo)] text-white'}`}>
          {aviso.bien ? <CheckCircle2 className="h-7 w-7 shrink-0" aria-hidden /> : <X className="h-7 w-7 shrink-0" aria-hidden />}
          <span>{aviso.texto}</span>
        </div>
      )}
    </div>
  );
}

function esQuieta(o: OrdenPantalla) { return o.columna === 'taller' && diasDesde(o.movida) > QUIETO_DIAS; }

// ── Piezas del tablero ──────────────────────────────────────────────────────

function Indicador({ etiqueta, valor, color, activo, onClick }: { etiqueta: string; valor: number; color: string; activo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`min-w-[104px] rounded-2xl border px-4 py-2 text-left transition-colors ${activo ? 'bg-[var(--panel-2)]' : 'border-[var(--linea)] bg-[var(--panel)] hover:bg-[var(--panel-2)]'}`}
      style={activo ? { borderColor: color } : undefined}>
      <div className="display text-[34px] font-black leading-none tabular-nums" style={{ color }}>{valor}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--tenue)]">{etiqueta}</div>
    </button>
  );
}

function BotonIcono({ etiqueta, onClick, children, className = '' }: { etiqueta: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={etiqueta} title={etiqueta}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--linea)] bg-[var(--panel)] hover:bg-[var(--panel-2)] ${className}`}>
      {children}
    </button>
  );
}

function Avatar({ p, size = 44 }: { p: PersonaPantalla; size?: number }) {
  return p.foto
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={p.foto} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : (
      <span className="display flex shrink-0 items-center justify-center rounded-full bg-[var(--naranja)]/15 font-black text-[var(--naranja)] ring-1 ring-[var(--naranja)]/30"
        style={{ width: size, height: size, fontSize: size * 0.42 }}>
        {iniciales(p.nombre)}
      </span>
    );
}

function ChipPersona({ activo, onClick, etiqueta, persona }: { activo: boolean; onClick: () => void; etiqueta: string; persona?: PersonaPantalla }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`flex h-14 shrink-0 items-center gap-2.5 rounded-2xl border px-3 pr-4 text-base font-semibold transition-colors ${activo ? 'border-[var(--naranja)] bg-[var(--naranja)]/15 text-white' : 'border-[var(--linea)] bg-[var(--panel)] text-[var(--tenue)] hover:text-white'}`}>
      {persona ? <Avatar p={persona} size={36} /> : <Wrench className="ml-1 h-5 w-5" aria-hidden />}
      {etiqueta}
    </button>
  );
}

function Carril({ titulo, subtitulo, color, n, vacio, children }: { titulo: string; subtitulo: string; color: string; n: number; vacio: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="min-w-0">
      <div className="mb-4 flex items-end gap-3 border-b-2 pb-2" style={{ borderColor: color }}>
        <h2 className="display text-[40px] font-black uppercase leading-none" style={{ color }}>{titulo}</h2>
        <span className="display mb-0.5 rounded-lg bg-[var(--panel-2)] px-2.5 py-0.5 text-2xl font-extrabold tabular-nums">{n}</span>
        <span className="mb-1 ml-auto text-sm text-[var(--tenue)]">{subtitulo}</span>
      </div>
      {n === 0 ? <p className="rounded-2xl border border-dashed border-[var(--linea)] px-6 py-12 text-center text-lg text-[var(--apagado)]">{vacio}</p> : children}
    </section>
  );
}

/** La placa como placa: fondo blanco, «VENEZUELA» arriba, letras de cartel. */
function Placa({ texto, grande }: { texto: string; grande?: boolean }) {
  const sin = /sin/i.test(texto);
  return (
    <div className={`inline-flex shrink-0 flex-col items-center rounded-lg border-[3px] border-[#1b1b1b] bg-[#f5f3ec] shadow-[0_2px_0_rgba(0,0,0,.35)] ${grande ? 'px-4 pb-1 pt-0.5' : 'px-3 pb-0.5'}`}>
      <span className={`font-bold uppercase tracking-[0.3em] text-[#1d4ed8] ${grande ? 'text-[10px]' : 'text-[8px]'}`}>Venezuela</span>
      <span className={`display font-black uppercase leading-none tracking-[0.06em] ${sin ? 'text-[#8a8a8a]' : 'text-[#111]'} ${grande ? 'text-[42px]' : 'text-[34px]'}`}>
        {sin ? 'SIN PLACA' : texto}
      </span>
    </div>
  );
}

function Tarjeta({ o, i, quieta, onAccion }: { o: OrdenPantalla; i: number; quieta?: boolean; onAccion: (a: Accion, o: OrdenPantalla) => void }) {
  const t = tiempo(o.desde);
  const enEntrada = o.columna === 'entrada';
  const color = enEntrada ? 'var(--amarillo)' : 'var(--cian)';
  const ultimos = o.renglones.slice(-4);
  const quietoHace = Math.floor(diasDesde(o.movida));
  return (
    <article className={`entra relative flex flex-col overflow-hidden rounded-3xl border border-[var(--linea)] bg-[var(--panel)] ${quieta ? 'opacity-70 saturate-50' : ''}`}
      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} aria-hidden />
      <div className="flex flex-1 flex-col gap-4 p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <Placa texto={o.placa} />
          <div className="flex flex-col items-end gap-1.5">
            <span className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-base font-bold tabular-nums ${t.tono === 'mal' ? 'bg-[var(--rojo)]/15 text-[#ff8f8f]' : t.tono === 'aviso' ? 'bg-[var(--amarillo)]/15 text-[var(--amarillo)]' : 'bg-[var(--verde)]/15 text-[var(--verde)]'}`}>
              <Clock className="h-4 w-4" aria-hidden /> {t.texto}
            </span>
            {o.puesto && <span className="text-sm font-semibold text-[var(--tenue)]">Puesto {o.puesto}</span>}
          </div>
        </div>

        <div className="min-w-0">
          <div className="truncate text-xl font-bold">{o.vehiculo}</div>
          <div className="truncate text-base text-[var(--tenue)]">{o.cliente}</div>
        </div>

        <p className="line-clamp-2 text-[19px] font-semibold leading-snug text-[var(--tinta)]">{o.trabajo}</p>

        {o.encargados.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {o.encargados.map((e, k) => (
              <span key={k} className="flex items-center gap-2 rounded-full bg-[var(--panel-2)] py-1 pl-1 pr-3 text-[15px] font-semibold">
                <span className="display flex h-7 w-7 items-center justify-center rounded-full bg-[var(--naranja)]/20 text-sm font-black text-[var(--naranja)]">{iniciales(e.nombre)}</span>
                {e.nombre.split(/\s+/).slice(0, 2).join(' ')}
              </span>
            ))}
          </div>
        )}

        <div className="rounded-2xl bg-black/30 p-4">
          {o.renglones.length === 0 ? (
            <p className="text-base text-[var(--apagado)]">Sin trabajos cargados todavía.</p>
          ) : (
            <ul className="space-y-1.5">
              {o.renglones.length > ultimos.length && <li className="text-sm text-[var(--apagado)]">+ {o.renglones.length - ultimos.length} más</li>}
              {ultimos.map((r, k) => (
                <li key={k} className="flex items-center justify-between gap-3 text-base">
                  <span className="flex min-w-0 items-center gap-2 text-[var(--tenue)]">
                    {r.esManoObra ? <Hammer className="h-4 w-4 shrink-0 text-[var(--naranja)]" strokeWidth={1.75} aria-hidden /> : React.createElement(iconoPieza(r.descripcion), { className: 'h-4 w-4 shrink-0 text-[var(--cian)]', strokeWidth: 1.75, 'aria-hidden': true })}
                    <span className="truncate">{r.descripcion}{r.cantidad > 1 ? ` × ${r.cantidad}` : ''}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{usd(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-baseline justify-between border-t border-[var(--linea)] pt-3">
            <span className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--tenue)]">Total</span>
            <span className="display text-[34px] font-black leading-none tabular-nums">{usd(o.total)}</span>
          </div>
        </div>

        {quieta ? (
          <p className="text-sm font-semibold text-[#ff8f8f]">Sin movimiento hace {quietoHace} días</p>
        ) : o.ultimo ? (
          <p className="line-clamp-1 text-sm text-[var(--apagado)]">{o.ultimo}</p>
        ) : null}

        <div className="mt-auto grid grid-cols-[1fr_auto] gap-2.5">
          <button type="button" onClick={() => onAccion('cargar', o)}
            className="display flex h-16 items-center justify-center gap-2 rounded-2xl bg-[var(--naranja)] text-2xl font-black uppercase tracking-wide text-black transition-transform active:scale-[0.97]">
            <Plus className="h-7 w-7" strokeWidth={3} aria-hidden /> Cargar trabajo
          </button>
          {enEntrada ? (
            <button type="button" onClick={() => onAccion('empezar', o)}
              className="flex h-16 items-center gap-2 rounded-2xl border border-[var(--cian)]/40 bg-[var(--cian)]/10 px-5 text-lg font-bold text-[var(--cian)] active:scale-[0.97]">
              <Play className="h-6 w-6" aria-hidden /> Empecé
            </button>
          ) : (
            <button type="button" onClick={() => onAccion('terminado', o)}
              className="flex h-16 items-center gap-2 rounded-2xl border border-[var(--verde)]/40 bg-[var(--verde)]/10 px-5 text-lg font-bold text-[var(--verde)] active:scale-[0.97]">
              <CheckCircle2 className="h-6 w-6" aria-hidden /> Terminé
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Asistente: ¿quién eres? → ¿qué hiciste? → revisar ──────────────────────

type Paso = 'quien' | 'que' | 'revisar' | 'guardando' | 'listo';

function Asistente({ accion, orden, datos, onCerrar, onListo }: {
  accion: Accion; orden: OrdenPantalla; datos: TableroTaller;
  onCerrar: () => void; onListo: (texto: string) => void;
}) {
  // Siempre empieza preguntando quién eres: la pantalla es de todo el taller.
  const [paso, setPaso] = useState<Paso>('quien');
  const [persona, setPersona] = useState<PersonaPantalla | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [resultados, setResultados] = useState<Array<{ texto: string; ok: boolean; detalle?: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const total = lineas.reduce((a, l) => a + (Number(l.precio) || 0) * l.cantidad, 0);
  const pasos = accion === 'cargar' ? ['¿Quién eres?', '¿Qué hiciste?', 'Revisar'] : ['¿Quién eres?', 'Confirmar'];
  const indice = paso === 'quien' ? 0 : paso === 'que' ? 1 : accion === 'cargar' ? 2 : 1;

  const guardarEstado = async () => {
    if (!persona) return;
    setPaso('guardando'); setError(null);
    try {
      const r = await fetch('/api/taller/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ servicio_id: orden.id, empleado_id: persona.id, accion }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setError(j?.error || 'No se pudo guardar.'); setPaso('revisar'); return; }
      onListo(accion === 'empezar' ? `${orden.placa} pasó a En taller · ${persona.corto}` : `${orden.placa}: avisado que está listo · ${persona.corto}`);
    } catch { setError('Sin conexión: no se guardó.'); setPaso('revisar'); }
  };

  const guardarTodo = async () => {
    if (!persona || !lineas.length) return;
    setPaso('guardando'); setError(null);
    const salida: typeof resultados = [];
    for (const l of lineas) {
      try {
        const r = await fetch('/api/taller/trabajo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servicio_id: orden.id, empleado_id: persona.id, tipo: l.tipo, descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio === '' ? undefined : Number(l.precio), inventario_id: l.inventarioId }),
        });
        const j = await r.json().catch(() => null);
        salida.push(r.ok
          ? { texto: `${l.descripcion}${l.cantidad > 1 ? ` × ${l.cantidad}` : ''}`, ok: true, detalle: [j?.nomina, ...(j?.avisos || [])].filter(Boolean).join(' · ') || undefined }
          : { texto: l.descripcion, ok: false, detalle: j?.error || 'No se guardó' });
      } catch {
        salida.push({ texto: l.descripcion, ok: false, detalle: 'Sin conexión' });
      }
      setResultados([...salida]);
    }
    setPaso('listo');
  };

  const todoBien = resultados.length > 0 && resultados.every(r => r.ok);
  useEffect(() => {
    if (paso !== 'listo' || !todoBien) return;
    const t = setTimeout(() => onListo(`${orden.placa}: ${resultados.length} cargado${resultados.length > 1 ? 's' : ''} por ${persona?.corto} · ${usd(total)}`), 3500);
    return () => clearTimeout(t);
  }, [paso, todoBien, resultados.length, onListo, orden.placa, persona?.corto, total]);

  return (
    <div className="fixed inset-0 z-40 flex bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={pasos[indice]}>
      <div className="sube flex h-full w-full flex-col overflow-hidden border-[var(--linea)] bg-[var(--fondo)] lg:m-6 lg:h-[calc(100%-3rem)] lg:rounded-[28px] lg:border">
        {/* Encabezado del asistente */}
        <div className="flex items-center gap-4 border-b border-[var(--linea)] px-5 py-4">
          <Placa texto={orden.placa} grande />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold">{orden.vehiculo}</div>
            <div className="truncate text-base text-[var(--tenue)]">{orden.trabajo}</div>
          </div>
          <ol className="hidden items-center gap-2 lg:flex" aria-label="Pasos">
            {pasos.map((p, k) => (
              <li key={p} className="flex items-center gap-2">
                <span className={`display flex h-9 w-9 items-center justify-center rounded-full text-lg font-black ${k < indice ? 'bg-[var(--verde)] text-black' : k === indice ? 'bg-[var(--naranja)] text-black' : 'bg-[var(--panel-2)] text-[var(--apagado)]'}`}>
                  {k < indice ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden /> : k + 1}
                </span>
                <span className={`text-base font-semibold ${k === indice ? 'text-white' : 'text-[var(--apagado)]'}`}>{p}</span>
                {k < pasos.length - 1 && <ChevronRight className="h-5 w-5 text-[var(--apagado)]" aria-hidden />}
              </li>
            ))}
          </ol>
          <BotonIcono etiqueta="Cerrar" onClick={onCerrar}><X className="h-7 w-7" aria-hidden /></BotonIcono>
        </div>

        {paso === 'quien' && (
          <PasoQuien personal={datos.personal} encargados={orden.encargados.map(e => e.id || '')}
            onElegir={p => { setPersona(p); setPaso(accion === 'cargar' ? 'que' : 'revisar'); }} />
        )}

        {paso === 'que' && persona && (
          <PasoQue persona={persona} datos={datos} lineas={lineas} setLineas={setLineas}
            onAtras={() => setPaso('quien')} onSiguiente={() => setPaso('revisar')} />
        )}

        {(paso === 'revisar' || paso === 'guardando') && persona && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-10">
              <Quien persona={persona} onCambiar={() => setPaso('quien')} />
              {accion === 'cargar' ? (
                <>
                  <h3 className="display mb-4 mt-6 text-3xl font-black uppercase">Vas a cargar</h3>
                  <ul className="divide-y divide-[var(--linea)] rounded-3xl border border-[var(--linea)] bg-[var(--panel)]">
                    {lineas.map(l => (
                      <li key={l.clave} className="flex items-center gap-4 px-5 py-4">
                        <IconoTipo tipo={l.tipo} pieza={l.tipo === 'repuesto' ? iconoPieza(l.descripcion, l.categoria) : undefined} />
                        <span className="min-w-0 flex-1 truncate text-xl font-semibold">{l.descripcion}</span>
                        <span className="text-lg text-[var(--tenue)]">× {l.cantidad}</span>
                        <span className="display w-32 text-right text-3xl font-black tabular-nums">{usd((Number(l.precio) || 0) * l.cantidad)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-8 max-w-3xl text-2xl leading-relaxed">
                  {accion === 'empezar'
                    ? <>El carro pasa a <b className="text-[var(--cian)]">En taller</b> y queda anotado que tú empezaste.</>
                    : <>Queda anotado que <b className="text-[var(--verde)]">terminaste</b> y que el carro está listo. Cobranza o el jefe de taller lo entregan y cobran.</>}
                </p>
              )}
              {error && <p className="mt-5 rounded-2xl bg-[var(--rojo)]/15 px-5 py-3 text-lg text-[#ffb3b3]">{error}</p>}
            </div>
            <Pie>
              <button type="button" onClick={() => setPaso(accion === 'cargar' ? 'que' : 'quien')} disabled={paso === 'guardando'}
                className="flex h-16 items-center gap-2 rounded-2xl border border-[var(--linea)] px-6 text-lg font-bold text-[var(--tenue)] disabled:opacity-40">
                <ArrowLeft className="h-6 w-6" aria-hidden /> Atrás
              </button>
              {accion === 'cargar' && (
                <div className="ml-auto mr-2 text-right leading-none">
                  <div className="text-sm font-bold uppercase tracking-wider text-[var(--tenue)]">Total</div>
                  <div className="display text-[44px] font-black tabular-nums">{usd(total)}</div>
                </div>
              )}
              <button type="button" onClick={accion === 'cargar' ? guardarTodo : guardarEstado} disabled={paso === 'guardando'}
                className={`display flex h-16 min-w-[240px] items-center justify-center gap-3 rounded-2xl bg-[var(--verde)] px-8 text-2xl font-black uppercase text-black disabled:opacity-60 ${accion === 'cargar' ? '' : 'ml-auto'}`}>
                {paso === 'guardando' ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden /> : <Check className="h-7 w-7" strokeWidth={3} aria-hidden />}
                {accion === 'cargar' ? 'Guardar todo' : accion === 'empezar' ? 'Empecé' : 'Terminé'}
              </button>
            </Pie>
          </div>
        )}

        {paso === 'listo' && persona && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10 text-center">
            {todoBien ? (
              <span className="pulso flex h-28 w-28 items-center justify-center rounded-full bg-[var(--verde)] text-black"><Check className="h-16 w-16" strokeWidth={3} aria-hidden /></span>
            ) : (
              <span className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--amarillo)] text-black"><X className="h-16 w-16" strokeWidth={3} aria-hidden /></span>
            )}
            <h3 className="display text-[56px] font-black uppercase leading-none">{todoBien ? `¡Listo, ${persona.corto.split(' ')[0]}!` : 'Algo no se guardó'}</h3>
            <ul className="w-full max-w-2xl space-y-2 text-left">
              {resultados.map((r, k) => (
                <li key={k} className={`flex items-start gap-3 rounded-2xl px-5 py-3 text-lg ${r.ok ? 'bg-[var(--verde)]/10' : 'bg-[var(--rojo)]/15'}`}>
                  {r.ok ? <Check className="mt-0.5 h-6 w-6 shrink-0 text-[var(--verde)]" aria-hidden /> : <X className="mt-0.5 h-6 w-6 shrink-0 text-[var(--rojo)]" aria-hidden />}
                  <span><b>{r.texto}</b>{r.detalle && <span className="block text-base text-[var(--tenue)]">{r.detalle}</span>}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => onListo(`${orden.placa}: cargado por ${persona.corto}`)}
              className="display mt-2 h-16 rounded-2xl bg-[var(--panel-2)] px-10 text-2xl font-black uppercase">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Pie({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-t border-[var(--linea)] bg-[var(--panel)] px-5 py-4">{children}</div>;
}

function Quien({ persona, onCambiar }: { persona: PersonaPantalla; onCambiar: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-[var(--linea)] bg-[var(--panel)] px-5 py-4">
      <Avatar p={persona} size={56} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold uppercase tracking-wider text-[var(--tenue)]">Cargando como</div>
        <div className="display truncate text-3xl font-black uppercase">{persona.nombre}</div>
      </div>
      <button type="button" onClick={onCambiar} className="rounded-xl px-4 py-3 text-lg font-bold text-[var(--naranja)]">No soy yo</button>
    </div>
  );
}

function IconoTipo({ tipo, pieza: Pieza }: { tipo: TipoCarga; pieza?: LucideIcon }) {
  const c = tipo === 'mano_obra' ? { i: <Hammer className="h-6 w-6" strokeWidth={1.75} aria-hidden />, b: 'bg-[var(--naranja)]/15 text-[var(--naranja)]' }
    : tipo === 'repuesto' ? { i: Pieza ? <Pieza className="h-6 w-6" strokeWidth={1.75} aria-hidden /> : <Package className="h-6 w-6" strokeWidth={1.75} aria-hidden />, b: 'bg-[var(--cian)]/15 text-[var(--cian)]' }
      : { i: <PenLine className="h-6 w-6" aria-hidden />, b: 'bg-white/10 text-white' };
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${c.b}`}>{c.i}</span>;
}

function PasoQuien({ personal, encargados, onElegir }: { personal: PersonaPantalla[]; encargados: string[]; onElegir: (p: PersonaPantalla) => void }) {
  const [q, setQ] = useState('');
  // Los que ya trabajan en este carro, primero.
  const lista = personal
    .filter(p => !q.trim() || coincide(q, p.nombre, p.corto) > 0)
    .sort((a, b) => Number(encargados.includes(b.id)) - Number(encargados.includes(a.id)) || a.nombre.localeCompare(b.nombre));
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
            className="entra relative flex min-h-[112px] items-center gap-4 rounded-3xl border border-[var(--linea)] bg-[var(--panel)] p-4 text-left transition-colors hover:border-[var(--naranja)] active:scale-[0.98]"
            style={{ animationDelay: `${i * 30}ms` }}>
            <Avatar p={p} size={64} />
            <span className="min-w-0">
              <span className="display block text-[28px] font-black uppercase leading-[0.95]">{p.corto}</span>
              {encargados.includes(p.id) && <span className="mt-1 block text-sm font-semibold text-[var(--naranja)]">Ya trabaja en este carro</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Paso 2: ¿qué hiciste? ───────────────────────────────────────────────────

const TIPOS: Array<{ id: TipoCarga; texto: string; ayuda: string }> = [
  { id: 'mano_obra', texto: 'Mano de obra', ayuda: 'Lo que hiciste con tus manos' },
  { id: 'repuesto', texto: 'Repuesto', ayuda: 'Del almacén, con su stock' },
  { id: 'otro', texto: 'Otro', ayuda: 'Algo que no está en la lista' },
];

function PasoQue({ persona, datos, lineas, setLineas, onAtras, onSiguiente }: {
  persona: PersonaPantalla; datos: TableroTaller; lineas: Linea[]; setLineas: React.Dispatch<React.SetStateAction<Linea[]>>;
  onAtras: () => void; onSiguiente: () => void;
}) {
  const [tipo, setTipo] = useState<TipoCarga>('mano_obra');
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [editando, setEditando] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => { entrada.current?.focus(); }, [tipo]);

  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    datos.inventario.forEach(a => c.set(a.categoria, (c.get(a.categoria) || 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [datos.inventario]);

  const articulos = useMemo(() => datos.inventario
    .filter(a => !categoria || a.categoria === categoria)
    .map(a => ({ a, s: coincide(q, a.nombre, a.codigo, a.marca, nombreCategoria(a.categoria)) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s || Number(y.a.stock > 0) - Number(x.a.stock > 0) || x.a.nombre.localeCompare(y.a.nombre))
    .slice(0, 60).map(x => x.a), [datos.inventario, q, categoria]);

  const trabajos = useMemo(() => datos.sugerencias
    .map(s => ({ s, p: coincide(q, s.descripcion) }))
    .filter(x => x.p > 0).sort((a, b) => b.p - a.p || b.s.veces - a.s.veces).slice(0, 24).map(x => x.s), [datos.sugerencias, q]);

  const agregar = (l: Omit<Linea, 'clave'>) => {
    const igual = lineas.find(x => (l.inventarioId ? x.inventarioId === l.inventarioId : !x.inventarioId && x.descripcion.toLowerCase() === l.descripcion.toLowerCase()));
    if (igual) {
      setLineas(ls => ls.map(x => (x.clave === igual.clave ? { ...x, cantidad: Math.min(100, x.cantidad + 1) } : x)));
    } else {
      const nueva = { ...l, clave: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
      setLineas(ls => [...ls, nueva]);
      // Sin precio, el teclado se abre solo para ponérselo.
      if (!l.precio) setEditando(nueva.clave);
    }
    setQ('');
  };
  const texto = q.trim();
  const exacto = trabajos.some(s => s.descripcion.toLowerCase() === texto.toLowerCase());
  const linea = lineas.find(l => l.clave === editando) || null;

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_440px]">
      {/* Buscar y elegir */}
      <div className="flex min-h-0 flex-col border-[var(--linea)] px-5 py-5 sm:px-8 lg:border-r">
        <div className="grid grid-cols-3 gap-3">
          {TIPOS.map(t => (
            <button key={t.id} type="button" onClick={() => { setTipo(t.id); setQ(''); setCategoria(''); }} aria-pressed={tipo === t.id}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${tipo === t.id ? 'border-[var(--naranja)] bg-[var(--naranja)] text-black' : 'border-[var(--linea)] bg-[var(--panel)] hover:bg-[var(--panel-2)]'}`}>
              <span className={tipo === t.id ? '' : 'text-[var(--naranja)]'}>
                {t.id === 'mano_obra' ? <Hammer className="h-7 w-7" aria-hidden /> : t.id === 'repuesto' ? <Package className="h-7 w-7" aria-hidden /> : <PenLine className="h-7 w-7" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="display block text-2xl font-black uppercase leading-none">{t.texto}</span>
                <span className={`hidden text-sm sm:block ${tipo === t.id ? 'text-black/70' : 'text-[var(--tenue)]'}`}>{t.ayuda}</span>
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 flex h-[68px] items-center gap-3 rounded-2xl border-2 border-[var(--linea)] bg-[var(--panel)] px-5 focus-within:border-[var(--naranja)]">
          <Search className="h-7 w-7 text-[var(--tenue)]" aria-hidden />
          <input ref={entrada} value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter' && texto.length >= 3 && tipo !== 'repuesto') agregar({ tipo, descripcion: texto, cantidad: 1, precio: '' }); }}
            placeholder={tipo === 'repuesto' ? 'Busca el repuesto: nombre, código o marca' : tipo === 'mano_obra' ? 'Escribe el trabajo: soldadura, alineación…' : 'Describe lo que hiciste'}
            className="w-full bg-transparent text-2xl outline-none placeholder:text-[var(--apagado)]" aria-label="Buscar" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Borrar"><X className="h-6 w-6 text-[var(--tenue)]" aria-hidden /></button>}
        </label>

        {tipo === 'repuesto' && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Pastilla activa={!categoria} onClick={() => setCategoria('')} icono={Boxes}>Todo el almacén · {datos.inventario.length}</Pastilla>
            {categorias.map(([c, n]) => <Pastilla key={c} activa={categoria === c} onClick={() => setCategoria(x => (x === c ? '' : c))} icono={ICONO_CATEGORIA[c] || Package}>{nombreCategoria(c)} · {n}</Pastilla>)}
          </div>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-2">
          {tipo === 'repuesto' ? (
            articulos.length === 0 ? (
              <Nada texto={`No hay «${texto}» en el almacén.`} accion={texto.length >= 3 ? { etiqueta: `Cargar «${texto}» como otro`, onClick: () => agregar({ tipo: 'otro', descripcion: texto, cantidad: 1, precio: '' }) } : undefined} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {articulos.map(a => <TarjetaArticulo key={a.id} a={a} enLista={lineas.find(l => l.inventarioId === a.id)?.cantidad || 0}
                  onClick={() => agregar({ tipo: 'repuesto', descripcion: a.nombre, cantidad: 1, precio: a.precio ? String(a.precio) : '', inventarioId: a.id, stock: a.stock, categoria: a.categoria })} />)}
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {texto.length >= 3 && !exacto && (
                <button type="button" onClick={() => agregar({ tipo, descripcion: texto, cantidad: 1, precio: '' })}
                  className="flex min-h-[84px] items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--naranja)] bg-[var(--naranja)]/10 px-4 text-left active:scale-[0.98]">
                  <Plus className="h-8 w-8 shrink-0 text-[var(--naranja)]" aria-hidden />
                  <span><span className="block text-sm font-bold uppercase tracking-wider text-[var(--naranja)]">Agregar</span><span className="block text-xl font-bold">«{texto}»</span></span>
                </button>
              )}
              {tipo === 'mano_obra' && trabajos.map(s => (
                <button key={s.descripcion} type="button" onClick={() => agregar({ tipo: 'mano_obra', descripcion: s.descripcion, cantidad: 1, precio: s.precio ? String(s.precio) : '' })}
                  className="flex min-h-[84px] items-center justify-between gap-3 rounded-2xl border border-[var(--linea)] bg-[var(--panel)] px-4 text-left hover:border-[var(--naranja)] active:scale-[0.98]">
                  <span className="flex min-w-0 items-center gap-3"><Hammer className="h-6 w-6 shrink-0 text-[var(--naranja)]" aria-hidden /><span className="line-clamp-2 text-lg font-semibold leading-tight">{s.descripcion}</span></span>
                  {s.precio > 0 && <span className="display shrink-0 text-2xl font-black tabular-nums text-[var(--tenue)]">{usd(s.precio)}</span>}
                </button>
              ))}
              {tipo === 'mano_obra' && trabajos.length === 0 && texto.length < 3 && <Nada texto="Escribe lo que hiciste. Los trabajos de siempre aparecen solos con su precio." />}
              {tipo === 'otro' && texto.length < 3 && <Nada texto="Escribe lo que hiciste y tócalo para agregarlo." />}
            </div>
          )}
        </div>
      </div>

      {/* Lista de esta carga */}
      <aside className="flex min-h-0 flex-col border-t border-[var(--linea)] bg-[var(--panel)] lg:border-t-0">
        <div className="flex items-center gap-3 px-5 pt-5">
          <Avatar p={persona} size={40} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--tenue)]">Carga de</div>
            <div className="truncate text-lg font-bold">{persona.nombre}</div>
          </div>
          <button type="button" onClick={onAtras} className="text-base font-bold text-[var(--naranja)]">No soy yo</button>
        </div>
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <ShoppingCart className="h-5 w-5 text-[var(--tenue)]" aria-hidden />
          <span className="display text-2xl font-black uppercase">Lo que vas a cargar</span>
          <span className="display ml-auto rounded-lg bg-[var(--panel-2)] px-2.5 text-xl font-black">{lineas.length}</span>
        </div>
        <div className="min-h-[120px] flex-1 overflow-y-auto px-5 pb-3">
          {lineas.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--linea)] px-4 py-8 text-center text-base text-[var(--apagado)]">Toca un trabajo o un repuesto para agregarlo aquí. Puedes cargar varios de una vez.</p>
          ) : (
            <ul className="space-y-2.5">
              {lineas.map(l => (
                <li key={l.clave} className={`rounded-2xl border p-3 ${editando === l.clave ? 'border-[var(--naranja)] bg-[var(--panel-2)]' : 'border-[var(--linea)] bg-[var(--fondo)]'}`}>
                  <div className="flex items-start gap-3">
                    <IconoTipo tipo={l.tipo} pieza={l.tipo === 'repuesto' ? iconoPieza(l.descripcion, l.categoria) : undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-base font-semibold leading-tight">{l.descripcion}</div>
                      {l.inventarioId && <div className={`text-sm ${(l.stock ?? 0) < l.cantidad ? 'text-[#ff8f8f]' : 'text-[var(--tenue)]'}`}>En el almacén: {l.stock ?? 0}</div>}
                    </div>
                    <button type="button" onClick={() => { setLineas(ls => ls.filter(x => x.clave !== l.clave)); if (editando === l.clave) setEditando(null); }} aria-label={`Quitar ${l.descripcion}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--apagado)] hover:bg-[var(--rojo)]/15 hover:text-[var(--rojo)]">
                      <Trash2 className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" aria-label="Menos" onClick={() => setLineas(ls => ls.map(x => (x.clave === l.clave ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x)))}
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--panel-2)]"><Minus className="h-5 w-5" aria-hidden /></button>
                    <span className="display w-10 text-center text-3xl font-black tabular-nums">{l.cantidad}</span>
                    <button type="button" aria-label="Más" onClick={() => setLineas(ls => ls.map(x => (x.clave === l.clave ? { ...x, cantidad: Math.min(100, x.cantidad + 1) } : x)))}
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--panel-2)]"><Plus className="h-5 w-5" aria-hidden /></button>
                    <button type="button" onClick={() => setEditando(e => (e === l.clave ? null : l.clave))}
                      className={`ml-auto flex h-12 min-w-[132px] items-center justify-end rounded-xl border-2 px-3 ${l.precio === '' ? 'border-[var(--amarillo)] text-[var(--amarillo)]' : editando === l.clave ? 'border-[var(--naranja)]' : 'border-transparent bg-[var(--panel-2)]'}`}
                      aria-label={`Precio de ${l.descripcion}`}>
                      <span className="display text-3xl font-black tabular-nums">{l.precio === '' ? 'Precio?' : `$${l.precio}`}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {linea && (
          <Teclado valor={linea.precio} onCambio={v => setLineas(ls => ls.map(x => (x.clave === linea.clave ? { ...x, precio: v } : x)))} onListo={() => setEditando(null)} />
        )}
        <div className="flex items-center gap-3 border-t border-[var(--linea)] px-5 py-4">
          <div className="leading-none">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--tenue)]">Total</div>
            <div className="display text-[40px] font-black tabular-nums">{usd(lineas.reduce((a, l) => a + (Number(l.precio) || 0) * l.cantidad, 0))}</div>
          </div>
          <button type="button" onClick={onSiguiente} disabled={!lineas.length || lineas.some(l => l.precio === '')}
            className="display ml-auto flex h-16 items-center gap-2 rounded-2xl bg-[var(--naranja)] px-6 text-2xl font-black uppercase text-black disabled:opacity-35">
            Revisar <ChevronRight className="h-7 w-7" strokeWidth={3} aria-hidden />
          </button>
        </div>
      </aside>
    </div>
  );
}

function Pastilla({ activa, onClick, icono: Icono, children }: { activa: boolean; onClick: () => void; icono?: LucideIcon; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-base font-semibold ${activa ? 'border-[var(--cian)] bg-[var(--cian)]/15 text-white' : 'border-[var(--linea)] bg-[var(--panel)] text-[var(--tenue)]'}`}>
      {Icono && <Icono className={`h-[18px] w-[18px] ${activa ? 'text-[var(--cian)]' : ''}`} strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  );
}

function TarjetaArticulo({ a, enLista, onClick }: { a: ArticuloPantalla; enLista: number; onClick: () => void }) {
  const agotado = a.stock <= 0;
  return (
    <button type="button" onClick={onClick}
      className={`relative flex min-h-[104px] flex-col justify-between gap-2 rounded-2xl border bg-[var(--panel)] p-4 text-left transition-colors active:scale-[0.98] ${enLista ? 'border-[var(--cian)]' : 'border-[var(--linea)] hover:border-[var(--cian)]/60'}`}>
      {enLista > 0 && <span className="display absolute -right-2 -top-2 flex h-9 min-w-9 items-center justify-center rounded-full bg-[var(--cian)] px-2 text-xl font-black text-black">{enLista}</span>}
      <span className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${agotado ? 'border-[var(--linea)] text-[var(--apagado)]' : 'border-[var(--cian)]/25 bg-[var(--cian)]/10 text-[var(--cian)]'}`}>
          {React.createElement(iconoPieza(a.nombre, a.categoria), { className: 'h-6 w-6', strokeWidth: 1.5, 'aria-hidden': true })}
        </span>
        <span className="line-clamp-2 pt-0.5 text-lg font-bold leading-tight">{a.nombre}</span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="min-w-0 text-sm text-[var(--tenue)]">
          {[a.codigo, a.marca].filter(Boolean).join(' · ') || nombreCategoria(a.categoria)}
          <span className={`mt-1 block w-fit rounded-md px-2 py-0.5 text-xs font-bold ${agotado ? 'bg-[var(--rojo)]/15 text-[#ff8f8f]' : a.stock <= 2 ? 'bg-[var(--amarillo)]/15 text-[var(--amarillo)]' : 'bg-[var(--verde)]/15 text-[var(--verde)]'}`}>
            {agotado ? 'Sin stock' : `${a.stock} en stock`}
          </span>
        </span>
        <span className="text-right leading-none">
          <span className="display block text-3xl font-black tabular-nums">{usd(a.precio)}</span>
          {a.precioBcv && a.precioBcv !== a.precio ? <span className="text-xs text-[var(--apagado)]">BCV {usd(a.precioBcv)}</span> : null}
        </span>
      </span>
    </button>
  );
}

function Nada({ texto, accion }: { texto: string; accion?: { etiqueta: string; onClick: () => void } }) {
  return (
    <div className="col-span-full flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[var(--linea)] px-6 py-12 text-center">
      <p className="text-lg text-[var(--apagado)]">{texto}</p>
      {accion && <button type="button" onClick={accion.onClick} className="rounded-xl bg-[var(--panel-2)] px-5 py-3 text-lg font-bold">{accion.etiqueta}</button>}
    </div>
  );
}

/** Teclado numérico en pantalla: para TVs táctiles sin teclado. */
function Teclado({ valor, onCambio, onListo }: { valor: string; onCambio: (v: string) => void; onListo: () => void }) {
  const tocar = (t: string) => {
    if (t === 'borrar') return onCambio(valor.slice(0, -1));
    if (t === '.' && (valor.includes('.') || !valor)) return;
    const base = valor === '0' && t !== '.' ? '' : valor;
    let nuevo = base + t;
    // Como mucho dos decimales.
    const dec = nuevo.split('.')[1];
    if (dec && dec.length > 2) nuevo = nuevo.slice(0, nuevo.indexOf('.') + 3);
    if (Number(nuevo) > 5000 || nuevo === valor) return;
    onCambio(nuevo);
  };
  return (
    <div className="sube border-t border-[var(--linea)] bg-[var(--panel-2)] px-5 py-3">
      <div className="mb-2 flex flex-wrap gap-2">
        {[5, 10, 15, 20, 25, 30, 40, 50].map(v => (
          <button key={v} type="button" onClick={() => onCambio(String(v))}
            className={`display h-11 min-w-[60px] rounded-xl px-2 text-xl font-black ${valor === String(v) ? 'bg-[var(--naranja)] text-black' : 'bg-[var(--fondo)]'}`}>${v}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {['7', '8', '9', 'borrar', '4', '5', '6', 'listo', '1', '2', '3', '', '0', '.', '00', ''].map((t, k) => {
          if (!t) return <span key={k} aria-hidden />;
          if (t === 'listo') return (
            <button key={k} type="button" onClick={onListo} className="display row-span-2 flex items-center justify-center rounded-xl bg-[var(--verde)] text-2xl font-black uppercase text-black">Listo</button>
          );
          return (
            <button key={k} type="button" onClick={() => tocar(t)} aria-label={t === 'borrar' ? 'Borrar' : t}
              className="display flex h-14 items-center justify-center rounded-xl bg-[var(--fondo)] text-3xl font-black active:bg-[var(--naranja)] active:text-black">
              {t === 'borrar' ? <Delete className="h-7 w-7" aria-hidden /> : t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
