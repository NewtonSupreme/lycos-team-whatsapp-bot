import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Variacion respecto al periodo anterior, en porcentaje. */
  delta?: number | null;
  /** Que significa que el numero suba. Determina si el verde es bueno. */
  deltaGoodWhen?: 'up' | 'down';
  hint?: string;
  href?: string;
  className?: string;
}

/**
 * Tarjeta de metrica.
 *
 * Sin degradados ni iconos fantasma de fondo: el dato es lo que se mira, y
 * todo lo demas compite con el. El unico color aqui viene de la variacion,
 * y siempre acompanado de una flecha — el color solo no comunica nada a
 * quien no lo distingue.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaGoodWhen = 'up',
  hint,
  href,
  className,
}: StatCardProps) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const rising = hasDelta && delta! > 0;
  const flat = hasDelta && delta === 0;
  const good = deltaGoodWhen === 'up' ? rising : !rising;

  const DeltaIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-2xl font-bold tracking-tight text-foreground">{value}</span>
      </div>
      {(hasDelta || hint) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-danger',
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
              <span className="num">{Math.abs(delta!).toFixed(1)}%</span>
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      )}
    </>
  );

  const classes = cn(
    'rounded-xl border border-border bg-card p-4 shadow-sm transition-colors',
    href && 'hover:border-border-strong hover:bg-accent/40',
    className,
  );

  if (href) {
    return (
      <a href={href} className={cn(classes, 'block focus-visible:outline-none')}>
        {body}
      </a>
    );
  }
  return <div className={classes}>{body}</div>;
}
