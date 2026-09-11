/**
 * El vehículo, escrito como lo dice la gente.
 *
 * En el taller nadie dicta «marca: Dodge, modelo: Forza, año: 2015». Dicen
 * «el Dodge Forza 2015 placa AI741DG», y eso llega como una sola línea de texto
 * a la orden de servicio y al bot. Aquí se parte esa línea en los campos que la
 * ficha del vehículo necesita.
 *
 * Antes cada sitio lo partía a su manera y el año se adivinaba: si no venía en
 * el texto se ponía el año EN CURSO, así que un Forza 2015 quedaba registrado
 * como 2026 y nadie lo notaba. Ahora, si no se sabe el año, se deja vacío —un
 * dato que falta se ve y se corrige; uno inventado se queda mal para siempre—.
 */

/** El año más antiguo que tiene sentido para un carro en circulación. */
const ANIO_MIN = 1950;
/** Un poco por delante del actual: los modelos salen antes que su año. */
const anioMax = () => new Date().getFullYear() + 2;

/**
 * El año que aparece dentro de un texto libre.
 *
 * Devuelve `null` cuando no hay ninguno: es la diferencia entre «no se sabe» y
 * «se inventó uno».
 */
export function anioDeTexto(texto?: string | null): number | null {
  const t = String(texto || '');
  // Se recorren TODOS los candidatos y se toma el último plausible: en
  // «Forza 2015 placa 2024AB» el año del carro es el primero, pero en
  // «Chevrolet Aveo, modelo 2008» viene al final. El filtro de rango es lo que
  // descarta lo que no puede ser un año.
  const candidatos = t.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  const validos = candidatos
    .map(Number)
    .filter(n => n >= ANIO_MIN && n <= anioMax());
  return validos.length > 0 ? validos[0] : null;
}

/** Un año válido, venga de donde venga. `null` si no lo es. */
export function anioValido(v: unknown): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < ANIO_MIN || n > anioMax()) return null;
  return n;
}

export interface VehiculoPartido {
  marca: string;
  modelo: string;
  /** `null` cuando el texto no lo dice. Nunca se inventa. */
  anio: number | null;
}

/**
 * Parte «Dodge Forza 2015» en marca, modelo y año.
 *
 * La primera palabra es la marca y el resto el modelo, que es como se dicta.
 * El año se quita del modelo: si no, quedaba «Forza 2015» como nombre de modelo
 * y el mismo carro salía distinto según quién lo escribiera.
 */
export function partirVehiculo(texto?: string | null): VehiculoPartido {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  const anio = anioDeTexto(limpio);

  const sinAnio = limpio
    .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const partes = sinAnio.split(' ').filter(Boolean);
  return {
    marca: partes[0] || '',
    modelo: partes.slice(1).join(' '),
    anio,
  };
}

/** La placa reducida a comparable: sin guiones, espacios ni minúsculas. */
export const clavePlaca = (placa?: string | null): string =>
  String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const PLACAS_VACIAS = new Set(['', 'SINPLACA', 'SIN', 'NA', 'NATURAL', 'NOAPLICA', 'NODEFINIDO']);

/** ¿Esta placa identifica a un vehículo, o es un relleno? */
export function placaValida(placa?: string | null): boolean {
  const k = clavePlaca(placa);
  if (PLACAS_VACIAS.has(k)) return false;
  // Las placas de relleno que genera el sistema cuando no hay ninguna.
  if (/^SP\d+$/.test(k)) return false;
  return k.length >= 5 && k.length <= 9 && /\d/.test(k);
}

/**
 * Lo que hay que cambiarle a la ficha del vehículo para que diga lo que dice
 * la orden.
 *
 * Devuelve solo los campos que DIFIEREN, y nunca borra: un texto vacío en la
 * orden no significa «no tiene marca», significa «aquí no se escribió». Esa
 * distinción es la que evitaba que corregir una orden vaciara la ficha.
 */
export function cambiosDeVehiculo(
  actual: { marca?: string | null; modelo?: string | null; anio?: number | null; placa?: string | null },
  deseado: { marca?: string | null; modelo?: string | null; anio?: number | null; placa?: string | null },
): Record<string, string | number> {
  const cambios: Record<string, string | number> = {};
  const igual = (a: unknown, b: unknown) =>
    String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

  const marca = String(deseado.marca || '').trim();
  if (marca && !igual(marca, actual.marca)) cambios.marca = marca;

  const modelo = String(deseado.modelo || '').trim();
  if (modelo && !igual(modelo, actual.modelo)) cambios.modelo = modelo;

  const anio = anioValido(deseado.anio);
  if (anio !== null && anio !== anioValido(actual.anio)) cambios.anio = anio;

  const placa = clavePlaca(deseado.placa);
  if (placaValida(placa) && placa !== clavePlaca(actual.placa)) cambios.placa = placa;

  return cambios;
}
