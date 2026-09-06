'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, MapPin, Search, Star, X } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

/**
 * Lanzador de módulos.
 *
 * Cada módulo tiene un color fijo: en una cuadrícula de veintipico destinos el
 * color es lo que deja encontrar el que buscás sin leer las etiquetas. Es
 * identidad, no adorno — y por eso ese tono se queda en la baldosa y no entra
 * a la pantalla del módulo.
 *
 * Se opera entero con el teclado porque quien lo usa todos los días no debería
 * necesitar el ratón: escribís y se filtra, las flechas mueven, Enter abre.
 */
export default function AppLauncher() {
  const router = useRouter();
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();

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

  const allowed = useMemo(
    () => MODULES.filter(m => !m.permKey || can(m.permKey)),
    [can],
  );

  const results = useMemo(() => searchModules(allowed, query), [allowed, query]);
  const searching = query.trim().length > 0;

  /** Al buscar la cuadrícula es plana; en reposo se agrupa por dominio. */
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
      key: g,
      label: GROUP_LABEL[g],
      items: allowed.filter(m => m.group === g),
    })).filter(s => s.items.length > 0);

    return [
      ...(favItems.length ? [{ key: 'favoritos', label: 'Favoritos', items: favItems }] : []),
      ...(recentItems.length ? [{ key: 'recientes', label: 'Usados recientemente', items: recentItems }] : []),
      ...grouped,
    ];
  }, [searching, results, allowed, favorites, recents]);

  /** Orden lineal para que las flechas recorran lo mismo que se ve. */
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
    const cols = 4;
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

  const hora = new Date().getHours();
  let index = -1;

  return (
    <div
      onKeyDown={onKeyDown}
      className="relative min-h-dvh overflow-hidden bg-background"
    >
      {/* Ambiente: un halo tenue tras el contenido, no un degradado sobre él. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-56 -right-24 h-[32rem] w-[32rem] rounded-full bg-info/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border border-border">
              <AvatarImage src={user?.avatar_url} alt="" />
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {mounted && user ? getInitials(user.nombre) : '—'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{saludo(hora)},</p>
              <h1 className="truncate text-3xl font-bold tracking-tight">
                {mounted ? (user?.nombre ?? 'Bienvenido') : 'Bienvenido'}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {currentSede?.nombre ?? 'Sin sede'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar módulo…"
              aria-label="Buscar módulo"
              autoFocus
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-9 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-primary"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </header>

        <div className="mt-10 space-y-9">
          {sections.map(section => (
            <section key={section.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
                <span className="num ml-2 font-normal normal-case tracking-normal opacity-70">
                  {section.items.length}
                </span>
              </h2>

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {section.items.map(m => {
                  index += 1;
                  const i = index;
                  const Icon = m.icon;
                  const isFav = favorites.includes(m.id);
                  return (
                    <li key={`${section.key}-${m.id}`} className="relative">
                      <Link
                        ref={el => { tileRefs.current[i] = el; }}
                        href={m.href}
                        onClick={() => remember(m.id)}
                        onFocus={() => setCursor(i)}
                        style={{ ['--tint' as string]: m.tint }}
                        className={cn(
                          'group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4',
                          'shadow-sm transition-[transform,box-shadow,border-color] duration-200',
                          'hover:-translate-y-1 hover:border-[hsl(var(--tint)/0.45)] hover:shadow-lg',
                          'focus-visible:-translate-y-1 focus-visible:border-[hsl(var(--tint)/0.55)] focus-visible:shadow-lg',
                        )}
                      >
                        <span
                          className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-[1.06]"
                          style={{
                            backgroundColor: 'hsl(var(--tint) / 0.14)',
                            color: 'hsl(var(--tint))',
                            boxShadow: 'inset 0 0 0 1px hsl(var(--tint) / 0.22)',
                          }}
                        >
                          <Icon className="h-6 w-6" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold leading-tight">{m.label}</span>
                          <span className="mt-1 block text-xs leading-snug text-muted-foreground line-clamp-2">
                            {m.description}
                          </span>
                        </span>
                      </Link>

                      <button
                        onClick={() => toggleFavorite(m.id)}
                        aria-label={isFav ? `Quitar ${m.label} de favoritos` : `Fijar ${m.label} en favoritos`}
                        aria-pressed={isFav}
                        className={cn(
                          'absolute right-2 top-2 rounded-lg p-1.5 transition-colors',
                          isFav
                            ? 'text-warning'
                            : 'text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0',
                        )}
                      >
                        <Star className={cn('h-4 w-4', isFav && 'fill-current')} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {searching && results.length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Ningún módulo coincide con «{query}».
            </p>
          )}
        </div>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          Escribí para filtrar · flechas para moverte · Enter para abrir · Esc para limpiar
        </p>
      </div>
    </div>
  );
}
