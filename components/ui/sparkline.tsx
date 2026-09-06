import { cn } from '@/lib/utils';

interface SparklineProps {
  data: readonly number[];
  className?: string;
  /** Tono de la línea. Por defecto hereda el color del texto. */
  tone?: 'brand' | 'success' | 'danger' | 'info' | 'muted';
  height?: number;
}

const TONE: Record<NonNullable<SparklineProps['tone']>, string> = {
  brand: 'text-primary',
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
  muted: 'text-muted-foreground',
};

/**
 * Curva de tendencia para una tarjeta de métrica.
 *
 * Se dibuja a mano en SVG en vez de montar recharts: a este tamaño no hay
 * ejes, ni leyenda, ni tooltip que justifiquen el peso de una librería, y un
 * gráfico de 40px de alto que tarda en montar se siente peor que uno que ya
 * está ahí.
 *
 * No es interactivo a propósito. El número grande es el dato; esto solo dice
 * si viene subiendo o bajando.
 */
export function Sparkline({ data, className, tone = 'muted', height = 32 }: SparklineProps) {
  const points = data.filter(n => Number.isFinite(n));
  if (points.length < 2) {
    return <div className={cn('h-8', className)} aria-hidden />;
  }

  const w = 100;
  const h = height;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  // Una serie plana debe verse como una recta al medio, no dividir por cero.
  const span = max - min || 1;

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gradientId = `spark-${points.length}-${Math.round(min)}-${Math.round(max)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn('w-full', TONE[tone], className)}
      style={{ height }}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
