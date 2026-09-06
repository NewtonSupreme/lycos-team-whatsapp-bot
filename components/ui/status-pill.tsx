import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

interface StatusPillProps {
  children: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
}

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  success: 'bg-success-subtle text-success border-success/25',
  warning: 'bg-warning-subtle text-warning border-warning/25',
  danger: 'bg-danger-subtle text-danger border-danger/25',
  info: 'bg-info-subtle text-info border-info/25',
  brand: 'bg-primary-subtle text-primary border-primary/25',
};

/**
 * Etiqueta de estado.
 *
 * Solo seis tonos, cada uno con un significado fijo. No existe un tono
 * "morado" ni "rosa" porque un estado no es una decision estetica: si algo
 * necesita un color nuevo, es que le falta un significado, no un tono.
 */
export function StatusPill({ children, tone = 'neutral', icon, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
