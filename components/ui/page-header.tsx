import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Contexto secundario: sede, rol, fecha. Va debajo de la descripcion. */
  meta?: ReactNode;
  /** Acciones de la pantalla. La primaria va ultima, a la derecha. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Encabezado unico para todas las pantallas.
 *
 * Existe para que ninguna pagina vuelva a inventar su propio titulo con
 * `style={{fontFamily}}` inline y su propia escala de tamanos. Una pantalla,
 * un h1, una jerarquia.
 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
        {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
