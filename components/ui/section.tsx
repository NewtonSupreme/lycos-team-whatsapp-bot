import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Sin marco: para agrupar sin encerrar (p. ej. una grilla de tarjetas). */
  bare?: boolean;
  className?: string;
}

/**
 * Bloque de contenido con su encabezado. Da el ritmo vertical de las
 * pantallas para que dos paginas distintas no inventen dos espaciados.
 */
export function Section({ title, description, actions, children, bare, className }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-0.5">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {bare ? children : (
        <div className="rounded-xl border border-border bg-card shadow-sm">{children}</div>
      )}
    </section>
  );
}
