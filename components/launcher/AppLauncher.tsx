'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Star, X } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { glyphFor } from './glyphs';
import { MODULES, searchModules, type AppModule } from '@/lib/modules';

const FAVORITES_KEY = 'lycos_launcher_favoritos';
const RECENTS_KEY = 'lycos_launcher_recientes';
const MAX_RECENTS = 6;

function readList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Columnas reales de la retícula: las flechas deben moverse por donde se ve. */
function useColumnCount(): number {
  const [cols, setCols] = useState(6);
  useEffect(() => {
    const queries: [string, number][] = [
      ['(min-width: 1024px)', 6],
      ['(min-width: 640px)', 5],
      ['(min-width: 0px)', 4],
    ];
    const mqls = queries.map(([q]) => window.matchMedia(q));
    const update = () => {
      const i = mqls.findIndex(m => m.matches);
      setCols(i >= 0 ? queries[i]![1] : 4);
    };
    update();
    mqls.forEach(m => m.addEventListener('change', update));
    return () => mqls.forEach(m => m.removeEventListener('change', update));
  }, []);
  return cols;
}

/**
 * Lanzador de módulos.
 *
 * Retícula plana, sin encabezados de grupo: los módulos ya se distinguen por
 * su glifo, y seis títulos intermedios costaban una pantalla entera de alto
 * para ordenar algo que el color ya ordena. Los favoritos suben al principio,
 * que es la única jerarquía que el usuario pidió de verdad.
 *
 * Entra completo en una pantalla sin scroll: las medidas bajan por tramos de
 * altura de ventana en vez de fijarse, porque recortar contenido para que
 * "quepa" es peor que dejarlo desplazar.
 *
 * El foco se trata como en un selector de perfiles de consola: la baldosa
 * crece, se levanta y proyecta un halo del color del módulo.
 */
export default function AppLauncher() {
  const router = useRouter();
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const cols = useColumnCount();

  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tileRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
    setFavorites(readList(FAVORITES_KEY));
    setRecents(readList(RECENTS_KEY));
  }, []);

  const allowed = useMemo(() => MODULES.filter(m => !m.permKey || can(m.permKey)), [can]);
  const searching = query.trim().length > 0;

  /** Favoritos primero, luego el orden natural por dominio de trabajo. */
  const tiles: AppModule[] = useMemo(() => {
    const found = searchModules(allowed, query);
    if (searching) return found;
    const fav = favorites
      .map(id => found.find(m => m.id === id))
      .filter((m): m is AppModule => Boolean(m));
    const rest = found.filter(m => !favorites.includes(m.id));
    return [...fav, ...rest];
  }, [allowed, query, searching, favorites]);

  useEffect(() => setCursor(0), [query]);

  const remember = useCallback((id: string) => {
    setRecents(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, MAX_RECENTS);
      try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* modo privado */ }
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* modo privado */ }
      return next;
    });
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (tiles.length === 0) return;
    let next = cursor;
    if (e.key === 'ArrowRight') next = Math.min(cursor + 1, tiles.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(cursor - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(cursor + cols, tiles.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(cursor - cols, 0);
    else if (e.key === 'Enter') {
      const target = tiles[cursor];
      if (target) { remember(target.id); router.push(target.href); }
      return;
    } else if (e.key === 'Escape') {
      setQuery('');
      searchRef.current?.focus();
      return;
    } else return;

    e.preventDefault();
    setCursor(next);
    tileRefs.current[next]?.focus();
  }

  const recentSet = useMemo(() => new Set(recents.slice(0, 3)), [recents]);

  return (
    <div
      onKeyDown={onKeyDown}
      className="relative flex min-h-dvh flex-col overflow-hidden bg-surface-sunken"
    >
      {/* Ambiente: halo difuso detrás del contenido, nunca encima. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-52 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[130px]" />
        <div className="absolute -bottom-64 -right-40 h-[34rem] w-[34rem] rounded-full bg-info/[0.07] blur-[130px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[64rem] flex-1 flex-col items-center justify-center px-5 py-4 [@media(min-height:900px)]:py-10">
        {/* Identidad */}
        <Avatar className="h-11 w-11 border border-border shadow-sm [@media(min-height:900px)]:h-14 [@media(min-height:900px)]:w-14">
          <AvatarImage src={user?.avatar_url} alt="" />
          <AvatarFallback className="bg-card font-semibold text-primary">
            {mounted && user ? getInitials(user.nombre) : '—'}
          </AvatarFallback>
        </Avatar>

        <h1 className="mt-2.5 text-center text-lg font-bold tracking-tight [@media(min-height:900px)]:text-2xl [@media(min-height:900px)]:mt-3">
          <span className="font-normal text-muted-foreground">{saludo(new Date().getHours())}, </span>
          {mounted ? (user?.nombre ?? 'Bienvenido') : 'Bienvenido'}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {currentSede?.nombre ?? 'Sin sede'}
          <span className="mx-2 opacity-40">·</span>
          {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        {/* Búsqueda */}
        <div className="relative mt-3 w-full max-w-sm [@media(min-height:900px)]:mt-6">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar módulo…"
            aria-label="Buscar módulo"
            autoFocus
            className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-primary"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        {/* Retícula plana */}
        <ul
          className={cn(
            'mt-5 grid w-full grid-cols-4 justify-items-center gap-x-2 gap-y-3.5',
            'sm:grid-cols-5 lg:grid-cols-6',
            '[@media(min-height:900px)]:mt-9 [@media(min-height:900px)]:gap-y-6',
          )}
        >
          {tiles.map((m, i) => {
            const Glyph = glyphFor(m.id);
            const isFav = favorites.includes(m.id);
            const isRecent = !searching && !isFav && recentSet.has(m.id);
            return (
              <li key={m.id} className="group relative w-full max-w-[6rem]">
                <Link
                  ref={el => { tileRefs.current[i] = el; }}
                  href={m.href}
                  onClick={() => remember(m.id)}
                  onFocus={() => setCursor(i)}
                  title={m.description}
                  style={{ ['--tint' as string]: m.tint }}
                  className="flex flex-col items-center gap-2 rounded-2xl outline-none"
                >
                  <span
                    className={cn(
                      'relative flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-[1.15rem]',
                      'border border-border bg-card shadow-sm',
                      'transition-[transform,box-shadow] duration-200 ease-out',
                      'group-hover:-translate-y-1.5 group-hover:scale-[1.07]',
                      'group-focus-visible:-translate-y-1.5 group-focus-visible:scale-[1.07]',
                      'group-hover:shadow-[0_14px_28px_-10px_hsl(var(--tint)/0.55)]',
                      'group-focus-visible:shadow-[0_14px_28px_-10px_hsl(var(--tint)/0.65)]',
                      'group-focus-visible:ring-2 group-focus-visible:ring-[hsl(var(--tint))] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[hsl(var(--surface-sunken))]',
                      '[@media(min-height:900px)]:h-[4.25rem] [@media(min-height:900px)]:w-[4.25rem]',
                    )}
                  >
                    <Glyph className="h-8 w-8 [@media(min-height:900px)]:h-10 [@media(min-height:900px)]:w-10" />
                    {/* Punto discreto: estuviste aquí hace poco. */}
                    {isRecent && (
                      <span
                        className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--tint))]"
                        aria-label="Usado recientemente"
                      />
                    )}
                  </span>
                  <span className="line-clamp-2 text-center text-xs font-medium leading-tight text-foreground transition-colors group-hover:text-primary">
                    {m.label}
                  </span>
                </Link>

                <button
                  onClick={() => toggleFavorite(m.id)}
                  aria-label={isFav ? `Quitar ${m.label} de favoritos` : `Fijar ${m.label} en favoritos`}
                  aria-pressed={isFav}
                  className={cn(
                    'absolute -right-1 -top-1 rounded-full border border-border bg-card p-1 shadow-sm transition-opacity',
                    isFav
                      ? 'text-warning opacity-100'
                      : 'text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                  )}
                >
                  <Star className={cn('h-3 w-3', isFav && 'fill-current')} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>

        {searching && tiles.length === 0 && (
          <p className="mt-10 w-full rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Ningún módulo coincide con «{query}».
          </p>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground [@media(min-height:900px)]:mt-9">
          Escribí para filtrar · flechas para moverte · Enter para abrir
          <span className="mx-1.5 opacity-40">·</span>
          <Star className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          fijá tus favoritos al principio
        </p>
      </div>
    </div>
  );
}
