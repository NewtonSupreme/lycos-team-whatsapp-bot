/**
 * Traduce el nombre escrito a mano en una orden al empleado real que lo hizo.
 *
 * Durante mucho tiempo la pantalla de Taller guardó al encargado como texto
 * suelto dentro de `notas` ("Encargados: TECNICO ALINEACION. RAFAEL"), sin
 * enlazarlo a ningún usuario. El resultado son 357 órdenes con una persona
 * escrita y solo 21 comisiones generadas: el trabajo se hizo, se cobró, y a
 * nadie se le pagó por él.
 *
 * Rescatar eso exige leer como lee una persona. En las notas reales aparecen:
 *
 *   FREDDY · TECNICO FREDDY · Fredd
 *   TECNICO ALINEACION. RAFAEL · RAFAEL · RAFEL
 *   TECNICO BALANCEO Y ROTACION NELSON · MECANICO ROGER
 *
 * Todas son la misma persona escrita de seis maneras. Aquí se le quita el
 * cargo y la zona al texto, se corrige el dedazo de una letra y se elige
 * siempre la ficha activa: hay fichas duplicadas e inactivas creadas por el
 * propio buscador, y apuntar a una de ellas es pagarle a nadie.
 */

export interface PersonaResoluble {
  id: string;
  nombre: string;
  alias?: string | null;
  activo?: boolean | null;
}

export interface Resolucion<T> {
  persona: T;
  /** Cómo se llegó a ella; se muestra para poder discutir la propuesta. */
  motivo: string;
  /** `exacta` no necesita revisión; `aproximada` sí. */
  certeza: 'exacta' | 'aproximada';
}

/** Palabras que describen el puesto o la zona, no a la persona. */
const RUIDO = new Set([
  'tecnico', 'tecnica', 'mecanico', 'mecanica', 'jefe', 'ayudante', 'encargado',
  'encargada', 'sr', 'señor', 'senor', 'personal', 'taller', 'maestro', 'obrero',
  'alineacion', 'balanceo', 'rotacion', 'cauchera', 'caucho', 'cauchos', 'escape',
  'escapes', 'silenciador', 'silenciadores', 'latoneria', 'pintura', 'lavado',
  'autolavado', 'frenos', 'suspension', 'electricidad', 'electrico', 'de', 'del',
  'la', 'el', 'los', 'las', 'y', 'e',
]);

export const sinAcentos = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Deja solo lo que puede ser un nombre: sin cargo, sin zona, sin puntuación.
 * "TECNICO ALINEACION. RAFAEL" → "rafael"
 */
export function limpiarNombre(texto: string): string {
  return sinAcentos(texto)
    .replace(/\(.*?\)/g, ' ')       // el rol entre paréntesis: "(Mecánico)"
    .replace(/[.:;,/\\|_-]+/g, ' ')
    .split(/\s+/)
    .filter(p => p.length > 1 && !RUIDO.has(p))
    .join(' ')
    .trim();
}

/** Distancia de edición, cortada en `max`: solo interesa "casi igual". */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + coste);
      if (fila[j] < mejor) mejor = fila[j];
    }
    // Si toda la fila ya supera el tope, no hay forma de bajar de ahí.
    if (mejor > max) return max + 1;
    previa = fila;
  }
  return previa[b.length];
}

/** Las formas bajo las que se puede reconocer a una persona. */
function clavesDe(p: PersonaResoluble): string[] {
  const nombre = sinAcentos(p.nombre).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const partes = nombre.split(' ').filter(Boolean);
  const claves = [nombre, partes[0] || ''];
  if (partes.length > 1) claves.push(`${partes[0]} ${partes[1]}`);
  if (p.alias) claves.push(sinAcentos(p.alias));
  // La misma limpieza que se le aplica al texto de la orden. Sin esto, la ficha
  // "EL SHIVAS" no coincide con la nota "EL SHIVAS": al texto se le quita el
  // artículo y a la ficha no, y quedan siendo dos cosas distintas.
  claves.push(limpiarNombre(p.nombre));
  if (p.alias) claves.push(limpiarNombre(p.alias));
  return claves.filter(Boolean);
}

/**
 * Encuentra a quién se refiere el texto.
 *
 * El orden importa: primero lo que coincide tal cual, y solo después lo que se
 * parece. Una ficha inactiva nunca gana a una activa aunque el texto se le
 * parezca más — esas fichas son duplicados, y pagarle a una es no pagarle a
 * nadie.
 */
export function resolverEncargado<T extends PersonaResoluble>(
  texto: string,
  personas: readonly T[],
): Resolucion<T> | null {
  const limpio = limpiarNombre(texto);
  if (!limpio) return null;

  // Las activas primero: ante dos coincidencias igual de buenas, gana la que
  // corresponde a alguien que de verdad trabaja aquí.
  const orden = [...personas].sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false));
  const palabras = limpio.split(' ');

  for (const p of orden) {
    for (const clave of clavesDe(p)) {
      if (clave === limpio) return { persona: p, motivo: `La orden dice «${texto.trim()}»`, certeza: 'exacta' };
    }
  }

  // El nombre aparece dentro del texto: "TECNICO FREDDY" → "freddy".
  for (const p of orden) {
    for (const clave of clavesDe(p)) {
      if (clave.length >= 4 && palabras.includes(clave)) {
        return { persona: p, motivo: `La orden dice «${texto.trim()}»`, certeza: 'exacta' };
      }
    }
  }

  // Dedazo de una letra o nombre cortado: "Fredd", "RAFEL", "Bra".
  let mejor: { p: T; clave: string; d: number } | null = null;
  for (const p of orden) {
    for (const clave of clavesDe(p)) {
      if (clave.length < 4) continue;
      for (const palabra of palabras) {
        if (palabra.length < 3) continue;
        // Nombre cortado: "fredd" es principio de "freddy".
        if (palabra.length >= 4 && clave.startsWith(palabra)) {
          const d = clave.length - palabra.length;
          if (!mejor || d < mejor.d) mejor = { p, clave, d };
          continue;
        }
        const d = distancia(palabra, clave, 1);
        if (d <= 1 && (!mejor || d < mejor.d)) mejor = { p, clave, d };
      }
    }
  }

  if (mejor) {
    return {
      persona: mejor.p,
      motivo: `«${texto.trim()}» parece ser ${mejor.p.nombre}: confírmalo`,
      certeza: 'aproximada',
    };
  }

  return null;
}

/** Los nombres que vienen tras "Encargados:" en las notas de una orden. */
export function encargadosDeNotas(notas?: string | null): string[] {
  const m = /encargad[oa]s?\s*:?\s*([^\n|]+)/i.exec(notas || '');
  if (!m) return [];
  return m[1]
    .split(/[,·]+|\sy\s/)
    .map(x => x.trim())
    .filter(x => x.length > 2);
}
