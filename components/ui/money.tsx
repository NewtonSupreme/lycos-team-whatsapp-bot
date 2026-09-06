import { cn } from '@/lib/utils';

type Currency = 'USD' | 'VES';

interface MoneyProps {
  amount: number | null | undefined;
  currency?: Currency;
  /** Equivalente en la otra moneda, mostrado en segundo plano. */
  secondary?: { amount: number; currency: Currency } | null;
  /** Colorea segun signo. Solo donde el signo importa (utilidad, saldo). */
  signed?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES: Record<NonNullable<MoneyProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
};

const SYMBOL: Record<Currency, string> = { USD: '$', VES: 'Bs.' };

export function formatMoney(amount: number, currency: Currency = 'USD'): string {
  const n = amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${n}` : `Bs. ${n}`;
}

/**
 * Toda cifra de dinero del sistema pasa por aca.
 *
 * Usa numerales tabulares para que las columnas no bailen cuando cambia un
 * valor, y muestra el equivalente en la otra moneda como dato subordinado —
 * que es como realmente se opera con doble moneda y tasa volatil.
 */
export function Money({
  amount,
  currency = 'USD',
  secondary,
  signed = false,
  size = 'md',
  className,
}: MoneyProps) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return <span className={cn('text-muted-foreground', SIZES[size], className)}>—</span>;
  }

  const tone = signed
    ? amount > 0
      ? 'text-success'
      : amount < 0
        ? 'text-danger'
        : 'text-foreground'
    : 'text-foreground';

  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className={cn('num font-semibold', SIZES[size], tone)}>
        {signed && amount > 0 ? '+' : ''}
        {formatMoney(amount, currency)}
      </span>
      {secondary && (
        <span className="num text-xs font-normal text-muted-foreground">
          {formatMoney(secondary.amount, secondary.currency)}
        </span>
      )}
    </span>
  );
}

export { SYMBOL as CURRENCY_SYMBOL };
