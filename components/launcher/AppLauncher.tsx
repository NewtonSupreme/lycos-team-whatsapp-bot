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
import {
  GROUP_LABEL, GROUP_ORDER, MODULES, searchModules,
  type AppModule, type ModuleGroup,
} from '@/lib/modules';

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

/** Columnas reales de la retícula: las flechas tienen que moverse por donde se ve. */
function useColumnCount(): number {
  const [cols, setCols] = useState(6);
  useEffect(() => {
    const queries: [string, number][] = [
      ['(min-width: 1024px)', 6],
      ['(min-width: 640px)', 5],
      ['(min-width: 0px)', 3],
    ];
    const mqls = queries.map(([q]) => window.matchMedia(q));
    const update = () => {
      const hit = queries.find(([, ], i) => mqls[i]!.matches);
      setCols(hit ? hit[1] : 3);
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
 * Retícula de baldosas al estilo de un cajón de aplicaciones: cuadrado claro,
 * glifo de colores planos y etiqueta debajo. El color vive en el glifo y no
 * en el fondo, que es lo que deja reconocer un módulo sin leerlo y a la vez
 * mantiene la pantalla en calma.
 *
 * El foco se trata como en un selector de perfiles de consola: la baldosa
 * crece, se levanta y proyecta un halo del color del módulo. Se opera entero
 * con el teclado porque quien entra todos los días no debería tocar el ratón.
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
  const results = useMemo(() => searchModules(allowed, query), [allowed, query]);
  const searching = query.trim().length > 0;

  const sections = useMemo(() => {
    if (searching) return [{ key: 'resultados', label: 'Resultados', items: results }];

    const favItems = favorites
      .map(id => allowed.find(m => m.id === id))
      .filter((m): m is AppModule => Boolean(m));
    const recentItems = recents
      .map(id => allowed.find(m => m.id === id))
      .filter((m): m is AppModule => Boolean(m))
      .filter(m => !favorites.includes(m.id))
      .slice(0, MAX_RECENTS);

    const grouped = GROUP_ORDER.map((g: ModuleGroup) => ({
      key: g as string,
      label: GROUP_LABEL[g],
      items: allowed.filter(m => m.group === g),
    })).filter(s => s.items.length > 0);

    return [
      ...(favItems.length ? [{ key: 'favoritos', label: 'Favoritos', items: favItems }] : []),
      ...(recentItems.length ? [{ key: 'recientes', label: 'Recientes', items: recentItems }] : []),
      ...grouped,
    ];
  }, [searching, results, allowed, favorites, recents]);

  const flat = useMemo(() => sections.flatMap(s => s.items), [sections]);

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
    if (flat.length === 0) return;
    let next = cursor;
    if (e.key === 'ArrowRight') next = Math.min(cursor + 1, flat.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(cursor - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(cursor + cols, flat.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(cursor - cols, 0);
    else if (e.key === 'Enter') {
      const target = flat[cursor];
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

  let index = -1;

  return (
    <div onKeyDown={onKeyDown} className="relative min-h-dvh overflow-hidden bg-surface-sunken">
      {/* Ambiente: halo difuso detrás del contenido, nunca encima. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-52 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[130px]" />
        <div className="absolute -bottom-60 -right-32 h-[34rem] w-[34rem] rounded-full bg-info/[0.07] blur-[130px]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center px-5 py-12 sm:py-16">
        {/* Identidad: quién entra y a qué sede. */}
        <Avatar className="h-16 w-16 border border-border shadow-sm">
          <AvatarImage src={user?.avatar_url} alt="" />
          <AvatarFallback className="bg-card text-lg font-semibold text-primary">
            {mounted && user ? getInitials(user.nombre) : '—'}
          </AvatarFallback>
        </Avatar>

        <p className="mt-4 text-sm text-muted-foreground">{saludo(new Date().getHours())},</p>
        <h1 className="mt-0.5 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          {mounted ? (user?.nombre ?? 'Bienvenido') : 'Bienvenido'}
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {currentSede?.nombre ?? 'Sin sede'}
          <span className="mx-2 opacity-40">·</span>
          {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        <div className="relative mt-7 w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar módulo…"
            aria-label="Buscar módulo"
            autoFocus
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-primary"
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

        <div className="mt-11 w-full space-y-10">
          {sections.map(section => (
            <section key={section.key}>
              <h2 className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {section.label}
              </h2>

              <ul className="mx-auto grid grid-cols-3 justify-items-center gap-x-3 gap-y-7 sm:grid-cols-5 lg:grid-cols-6">
                {section.items.map(m => {
                  index += 1;
                  const i = index;
                  const Glyph = glyphFor(m.id);
                  const isFav = favorites.includes(m.id);
                  return (
                    <li key={`${section.key}-${m.id}`} className="group relative w-full max-w-[6.5rem]">
                      <Link
                        ref={el => { tileRefs.current[i] = el; }}
                        href={m.href}
                        onClick={() => remember(m.id)}
                        onFocus={() => setCursor(i)}
                        title={m.description}
                        style={{ ['--tint' as string]: m.tint }}
                        className="flex flex-col items-center gap-2.5 rounded-2xl outline-none"
                      >
                        {/* Baldosa: el color vive en el glifo, no en el fondo. */}
                        <span
                          className={cn(
                            'flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.375rem]',
                            'border border-border bg-card shadow-sm',
                            'transition-[transform,box-shadow] duration-200 ease-out',
                            'group-hover:-translate-y-1.5 group-hover:scale-[1.06]',
                            'group-focus-visible:-translate-y-1.5 group-focus-visible:scale-[1.06]',
                            'group-hover:shadow-[0_14px_30px_-10px_hsl(var(--tint)/0.55)]',
                            'group-focus-visible:shadow-[0_14px_30px_-10px_hsl(var(--tint)/0.65)]',
                            'group-focus-visible:ring-2 group-focus-visible:ring-[hsl(var(--tint))] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[hsl(var(--surface-sunken))]',
                          )}
                        >
                          <Glyph className="h-10 w-10" />
                        </span>
                        <span className="line-clamp-2 text-center text-[0.8125rem] font-medium leading-tight text-foreground transition-colors group-hover:text-primary">
                          {m.label}
                        </span>
                      </Link>

                      <button
                        onClick={() => toggleFavorite(m.id)}
                        aria-label={isFav ? `Quitar ${m.label} de favoritos` : `Fijar ${m.label} en favoritos`}
                        aria-pressed={isFav}
                        className={cn(
                          'absolute -right-0.5 -top-0.5 rounded-full border border-border bg-card p-1.5 shadow-sm transition-opacity',
                          isFav
                            ? 'text-warning opacity-100'
                            : 'text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                        )}
                      >
                        <Star className={cn('h-3.5 w-3.5', isFav && 'fill-current')} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {searching && results.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              Ningún módulo coincide con «{query}».
            </p>
          )}
        </div>

        <p className="mt-14 text-center text-xs text-muted-foreground">
          Escribí para filtrar · flechas para moverte · Enter para abrir · Esc para limpiar
        </p>
      </div>
    </div>
  );
}
