'use client';

import { useState } from 'react';
import type { BankBin } from '@/lib/reporte/ventas-mapping';

/**
 * La marca de cada banco o medio de pago.
 *
 * En el taller se cobra por seis cuentas distintas y hay que elegir la correcta:
 * si el dinero cae en la columna equivocada, el reporte del día no cuadra. Con
 * los nombres recortados —"PM…", "P.B…"— nadie distingue una de otra de un
 * vistazo, así que cada medio lleva su marca en su color real.
 *
 * Si en `public/bancos/` existe el logo oficial (`banesco.png`, `bnc.svg`, …),
 * se usa ese. Mientras no esté, se dibuja el monograma en el color de la marca:
 * es reconocible y no inventa un logo que no tenemos.
 */

interface Marca {
  /** Iniciales que se dibujan si no hay archivo de logo. */
  sigla: string;
  fondo: string;
  texto: string;
  /** Nombre del archivo esperado en `public/bancos/`, sin extensión. */
  archivo: string;
}

const MARCAS: Record<BankBin, Marca> = {
  pago_movil_banesco: { sigla: 'B', fondo: '#00944A', texto: '#ffffff', archivo: 'banesco' },
  punto_banesco: { sigla: 'B', fondo: '#00944A', texto: '#ffffff', archivo: 'banesco' },
  bnc: { sigla: 'BNC', fondo: '#EE7203', texto: '#ffffff', archivo: 'bnc' },
  punto_bancamiga: { sigla: 'BA', fondo: '#00A0DF', texto: '#ffffff', archivo: 'bancamiga' },
  pago_movil_exterior: { sigla: 'BE', fondo: '#0B3B7A', texto: '#ffffff', archivo: 'exterior' },
  efectivo_bs: { sigla: 'Bs', fondo: '#eef1f5', texto: '#5b616e', archivo: 'bs' },
  dolares: { sigla: '$', fondo: '#e8f7ee', texto: '#15803d', archivo: 'dolar' },
  zelle: { sigla: 'Z', fondo: '#6D1ED4', texto: '#ffffff', archivo: 'zelle' },
  binance: { sigla: 'B', fondo: '#F0B90B', texto: '#1e1e1e', archivo: 'binance' },
  cashea: { sigla: 'C', fondo: '#7C3AED', texto: '#ffffff', archivo: 'cashea' },
};

/** Extensiones que se prueban, en orden, antes de caer al monograma. */
const EXTENSIONES = ['svg', 'png', 'webp'] as const;

export default function LogoBanco({ id, size = 28 }: { id: BankBin; size?: number }) {
  const marca = MARCAS[id];
  // Se avanza por las extensiones a medida que fallan; al agotarlas, monograma.
  const [intento, setIntento] = useState(0);

  if (!marca) return null;

  if (intento < EXTENSIONES.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- el logo es opcional y su carga puede fallar a propósito
      <img
        src={`/bancos/${marca.archivo}.${EXTENSIONES[intento]}`}
        alt=""
        width={size}
        height={size}
        onError={() => setIntento(i => i + 1)}
        // `contain` y no `cover`: varios de estos logos son redondos —las
        // banderas de Bs y del dólar— y recortarlos en cuadrado les comería el
        // borde. Sobre blanco porque unos traen fondo propio y otros son
        // transparentes, y el blanco es el único que le sienta bien a los dos.
        className="shrink-0 rounded-md bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md font-bold"
      style={{
        width: size,
        height: size,
        background: marca.fondo,
        color: marca.texto,
        fontSize: marca.sigla.length > 2 ? size * 0.3 : size * 0.42,
        letterSpacing: marca.sigla.length > 1 ? '-0.02em' : 0,
      }}
    >
      {marca.sigla}
    </span>
  );
}
