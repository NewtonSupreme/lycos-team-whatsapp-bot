'use client';
import React from 'react';
import { LucideIcon, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  /**
   * Tono del indicador. Azul, morado y cian eran decorativos y ahora caen a
   * neutro a propósito: en una tarjeta de métrica lo que se mira es el número,
   * y un color sin significado solo compite con él.
   */
  color?: 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'cyan';
  /** Solo indica si subir es bueno. Sin esto el verde puede mentir. */
  goodWhen?: 'up' | 'down';
  delay?: number;
}

const ICON_TONE: Record<NonNullable<StatCardProps['color']>, string> = {
  orange: 'bg-primary-subtle text-primary',
  green: 'bg-success-subtle text-success',
  red: 'bg-danger-subtle text-danger',
  blue: 'bg-muted text-muted-foreground',
  purple: 'bg-muted text-muted-foreground',
  cyan: 'bg-muted text-muted-foreground',
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  color = 'orange',
  goodWhen = 'up',
  delay = 0,
}: StatCardProps) {
  const hasTrend = trend !== undefined && Number.isFinite(trend);
  const rising = hasTrend && trend! > 0;
  const flat = hasTrend && trend === 0;
  const good = goodWhen === 'up' ? rising : !rising;
  const TrendIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-border-strong"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            ICON_TONE[color],
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>

      <p className="num mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>

      {(subtitle || hasTrend || trendLabel) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {hasTrend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-danger',
              )}
            >
              {/* La flecha va además del color: el color solo no comunica. */}
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              <span className="num">{Math.abs(trend!)}%</span>
            </span>
          )}
          {subtitle && <span className="text-muted-foreground">{subtitle}</span>}
          {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
