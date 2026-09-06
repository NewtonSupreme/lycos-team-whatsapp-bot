'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Como se pinta la celda. */
  cell: (row: T) => ReactNode;
  /** Valor para ordenar. Si falta, la columna no se ordena. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  /** Columnas secundarias que se ocultan en pantallas chicas. */
  hideBelow?: 'sm' | 'md' | 'lg';
  width?: string;
}

interface DataTableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: string; action?: ReactNode };
  /** Fila de totales, fijada abajo. */
  footer?: ReactNode;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

/**
 * Tabla de datos del ERP.
 *
 * Trae lo que casi siempre falta y luego se echa de menos: cabecera fija al
 * hacer scroll, ordenamiento anunciado con `aria-sort` (no solo una flecha
 * pintada), estado vacio con salida, esqueleto de carga en vez de un marco en
 * blanco, y scroll horizontal contenido para que la pagina nunca se desborde.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  onRowClick,
  empty,
  footer,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'es') * dir;
    });
  }, [rows, sort, columns]);

  function toggle(key: string) {
    setSort(prev =>
      prev?.key === key
        ? prev.dir === 'asc'
          ? { key, dir: 'desc' }
          : null
        : { key, dir: 'asc' },
    );
  }

  if (!loading && rows.length === 0 && empty) {
    return <EmptyState icon={Inbox} {...empty} className={className} />;
  }

  return (
    <div className={cn('w-full overflow-x-auto rounded-xl border border-border bg-card', className)}>
      <table className="w-full min-w-[38rem] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border">
            {columns.map(col => {
              const sortable = Boolean(col.sortValue);
              const active = sort?.key === col.key;
              const Icon = !active ? ChevronsUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
                  className={cn(
                    'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    ALIGN[col.align ?? 'left'],
                    col.hideBelow && HIDE[col.hideBelow],
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground',
                        col.align === 'right' && 'flex-row-reverse',
                        active && 'text-foreground',
                      )}
                    >
                      {col.header}
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map(col => (
                    <td key={col.key} className={cn('px-4 py-3', col.hideBelow && HIDE[col.hideBelow])}>
                      <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map(row => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-accent/50',
                  )}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 align-middle',
                        ALIGN[col.align ?? 'left'],
                        col.hideBelow && HIDE[col.hideBelow],
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>

        {footer && (
          <tfoot className="border-t border-border bg-muted/40 font-medium">{footer}</tfoot>
        )}
      </table>
    </div>
  );
}
