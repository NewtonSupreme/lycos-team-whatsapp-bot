'use client';

import { cn } from '@/lib/utils';

/**
 * El retrato de una persona, con sus iniciales cuando no hay foto.
 *
 * Va con `<img>` a propósito. Las fotos las sube cada quien, así que la URL
 * puede apuntar a cualquier sitio, y `next/image` exige declarar de antemano
 * cada dominio permitido: una foto de un dominio no previsto no se rompería
 * bonito, simplemente no saldría. Para un retrato de 34 px la optimización no
 * compensa perder la foto de alguien.
 *
 * La excusa está escrita UNA vez aquí en lugar de repetida en las seis
 * pantallas que muestran personal.
 */
export default function Avatar({
  nombre, url, size = 34, className,
}: {
  nombre?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const iniciales = String(nombre || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase() || '?';

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario, de dominio arbitrario; ver comentario del componente
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[#eef1f5] font-semibold text-[#8a909c]',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
    >
      {iniciales}
    </span>
  );
}
