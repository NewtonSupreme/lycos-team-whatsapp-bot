'use client';
import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  color?: 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'cyan';
  delay?: number;
}

const colorMap = {
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', glow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]' },
  green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.1)]' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', glow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.1)]' },
};

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendLabel, color = 'orange', delay = 0 }: StatCardProps) {
  const colors = colorMap[color];
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <div
      className={cn('stat-card border transition-all duration-300 cursor-default', colors.glow)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle gradient bg */}
      <div className={cn('absolute inset-0 opacity-30 rounded-xl', colors.bg)} />

      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{title}</p>
          <p className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
            {value}
          </p>
          {(subtitle || trend !== undefined) && (
            <div className="flex items-center gap-2 mt-1.5">
              {trend !== undefined && (
                <div className={cn('flex items-center gap-0.5 text-xs font-medium', isPositive ? 'text-green-400' : 'text-red-400')}>
                  {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{Math.abs(trend)}%</span>
                </div>
              )}
              {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
              {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
            </div>
          )}
        </div>
        <div className={cn('flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center', colors.bg, colors.border, 'border')}>
          <Icon className={cn('w-5 h-5', colors.text)} />
        </div>
      </div>
    </div>
  );
}
