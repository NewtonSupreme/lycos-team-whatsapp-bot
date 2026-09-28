import { resolverEncargado } from '@/lib/nomina/encargados';

/**
 * Registra en una orden de servicio el trabajo que dicta el bot por WhatsApp.
 *
 * Nace de tres fallos que se veían juntos en la misma conversación:
 *
 *  1. El encargado ("TÉCNICO BRAYAN") se guardaba como texto dentro de `notas`
 *     y no llegaba nunca al campo de personal asignado ni a nómina.
 *  2. Al agregar trabajo a una orden existente, se tomaba literalmente la frase
 *     con la que se pidió —"registrar nuevo trabajo a…"— como si fuera el
 *     trabajo, en vez del trabajo de verdad.
 *  3. El precio dictado ("costo de soldadura 15$") no se sumaba al total ni
 *     aparecía desglosado en ningún renglón: quedaba solo en la frase.
 *
 * Todo eso se arregla en un único sitio para que el registro por voz y el
 * registro a mano acaben produciendo exactamente la misma orden.
 */

export interface RenglonServicio {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

export interface EncargadoEnlazado {
  empleado_id: string;
  nombre: string;
  texto_original: string;
}

/**
 * Frases con las que se PIDE registrar algo, que no son el trabajo en sí.
 *
 * El bot recibe "agregar a este trabajo costo de soldadura, 15$" y guardaba la
 * orden entera como descripción. Lo que hay que quedarse es "costo de
 * soldadura": el verbo es la instrucción, no el servicio prestado.
 */
const PREFIJOS_INSTRUCCION = [
  /^(por\s+favor,?\s+)?(me\s+)?(puedes?\s+|podr[ií]as?\s+)?/i,
  /^(favor\s+(de\s+)?)/i,
  /^(registr(a|ar|ame|é|e)|ingres(a|ar|ame|e)|anot(a|ar|ame|e)|agreg(a|ar|ame|ue|uele)|añad(e|ir|ele)|coloc(a|ar|ale|le)|pon(er|le|)|sum(a|ar|ale)|carg(a|ar|ale)|actualiz(a|ar|ame|e)|mete(r|le)?)\b/i,
  /^(un\s+|el\s+|la\s+|los\s+|las\s+|los?\s+)?(nuevo|nueva|otro|otra)?\s*(trabajo|servicio|item|ítem|renglón|renglon|concepto)\s*(de[l]?\s+)?/i,
  /^(a|al|en|para|de|del)\s+(este|esta|ese|esa|dicho|dicha)?\s*(trabajo|servicio|veh[ií]culo|orden|carro)\b/i,
  /^(a|al|en|para)\s+/i,
  /^(este|esta|ese|esa|dicho|dicha)\s+(trabajo|servicio|orden)\b/i,
  /^[,:;.\s-]+/,
];

/** Restos que quedan al final y tampoco son el trabajo. */
const SUFIJOS_RUIDO = [
  /[,;.\s]*(por\s+favor|porfa|gracias|ok|listo)\s*$/i,
  /[,:;.\s-]+$/,
];

/**
 * Deja solo el trabajo, sin la orden con la que se pidió registrarlo.
 *
 * Se aplica en pasadas porque las frases se encadenan: "agregar a este trabajo
 * costo de soldadura" lleva verbo, preposición y sustantivo antes del trabajo.
 * Si al limpiar no queda nada aprovechable, se devuelve el texto original: es
 * preferible una descripción con ruido a una orden sin descripción.
 */
export function limpiarDescripcionTrabajo(texto: string): string {
  const original = String(texto || '').trim();
  if (!original) return '';

  let out = original;
  // Varias pasadas: cada prefijo puede destapar al siguiente.
  for (let vuelta = 0; vuelta < 4; vuelta += 1) {
    const antes = out;
    for (const re of PREFIJOS_INSTRUCCION) out = out.replace(re, '').trim();
    if (out === antes) break;
  }
  for (const re of SUFIJOS_RUIDO) out = out.replace(re, '').trim();

  // Si quedó demasiado corto o vacío, la limpieza se pasó de lista.
  if (out.length < 3) return original;

  // Se respeta la mayúscula inicial solo si el original la traía.
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Palabras tras las cuales un número suelto es un precio.
 *
 * Sin esto, «mano de obra 250» no daba precio y la orden quedaba en cero: el
 * taller casi nunca escribe el símbolo. No vale para cualquier número —«2
 * cauchos» es una cantidad, no un cobro— así que hace falta que lo anteceda una
 * palabra de dinero o de mano de obra.
 */
const ANTES_DE_PRECIO =
  // La palabra tiene que ser una palabra entera: «son» se encontraba dentro de
  // «NELSON» y el teléfono que venía detrás («TELÉFONO 4123295511») acabó como
  // un renglón de $4.123.295. Entre la palabra y el número no puede haber otro
  // dato con número propio (teléfono, cédula, año), y el número no puede seguir
  // con más cifras: eso es un teléfono cortado, no un precio.
  /(?:^|[^a-záéíóúñ])(?:mano\s+de\s+(?:obra|trabajo)|mano\s+de\s+obra\s+de|costo|precio|monto|cobr(?:o|a|ar)|vale|sale\s+en|queda\s+en|son)\b(?:(?!tel|c[eé]dula|\bci\b|\bid\b|a[nñ]o)[^0-9]){0,24}?(\d{1,6}(?:[.,]\d{1,2})?)(?!\d)/i;

/** Ningún trabajo del taller se dicta por más de esto: lo demás es otro número. */
const PRECIO_MAXIMO = 20000;

/**
 * Precio dictado dentro de la frase.
 *
 * Reconoce «soldadura 15$», «$65», «40 dolares» y también «mano de obra 250»,
 * donde no hay símbolo pero sí una palabra que anuncia dinero.
 */
export function precioDeTexto(texto: string): number | null {
  const t = String(texto || '');

  const aNumero = (bruto: string | undefined): number | null => {
    if (bruto == null) return null;
    const n = parseFloat(String(bruto).replace(',', '.'));
    return Number.isFinite(n) && n > 0 && n <= PRECIO_MAXIMO ? Math.round(n * 100) / 100 : null;
  };

  // Primero lo que lleva símbolo o moneda: es inequívoco.
  const conSimbolo = t.match(/(?:\$\s*(\d+(?:[.,]\d{1,2})?))|(?:(\d+(?:[.,]\d{1,2})?)\s*(?:\$|d[oó]lares?|usd))/i);
  if (conSimbolo) return aNumero(conSimbolo[1] ?? conSimbolo[2]);

  // Y solo después el número anunciado por una palabra de dinero.
  const anunciado = t.match(ANTES_DE_PRECIO);
  return anunciado ? aNumero(anunciado[1]) : null;
}

/** Quita el precio del texto para que no quede repetido dentro del renglón. */
export function sinPrecio(texto: string): string {
  return String(texto || '')
    .replace(/(?:\$\s*\d+(?:[.,]\d{1,2})?)|(?:\d+(?:[.,]\d{1,2})?\s*(?:\$|d[oó]lares?|usd))/gi, '')
    // El número sin símbolo que anuncia una palabra de dinero: se quita el
    // número y se deja el concepto. «Mano de obra 250» → «Mano de obra».
    .replace(/(mano\s+de\s+(?:obra|trabajo)[^0-9]{0,24}?)\d{1,7}(?:[.,]\d{1,2})?/gi, '$1')
    .replace(/\b(?:costo|precio|monto)\s*(?:de\s*)?\d{1,7}(?:[.,]\d{1,2})?/gi, '')
    // El precio suele venir entre paréntesis —"resonador ($40)"—; al quitarlo
    // quedaban unos paréntesis vacíos colgando del nombre del trabajo.
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,;\s]*(costo|precio|monto)\s*(de)?\s*$/i, '')
    .replace(/[,:;.\s-]+$/, '')
    .trim();
}

/**
 * Convierte lo dictado en renglones con su precio.
 *
 * Un trabajo por línea o separado por " + ", como ya los escribe el panel. El
 * precio va en el renglón que lo menciona; si solo hay uno y viene un costo
 * suelto, ese costo es suyo.
 */
export function renglonesDeTexto(texto: string, costoTotal?: number | null): RenglonServicio[] {
  const raw = String(texto || '').trim();
  if (!raw) return [];

  let pedazos = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (pedazos.length === 1) {
    pedazos = pedazos[0].split(/\s\+\s|\s*;\s*|\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  }
  if (pedazos.length === 0) pedazos = [raw];

  const renglones = pedazos.map(p => {
    const precio = precioDeTexto(p);
    const desc = precio != null ? sinPrecio(p) : p;
    const monto = precio ?? 0;
    return {
      descripcion: limpiarDescripcionTrabajo(desc) || desc,
      cantidad: 1,
      precio_unitario: monto,
      total: monto,
    };
  });

  // Un solo renglón sin precio propio y un costo dictado aparte: es el suyo.
  const sinNinguno = renglones.every(r => r.total === 0);
  if (renglones.length === 1 && sinNinguno && costoTotal && costoTotal > 0) {
    renglones[0].precio_unitario = costoTotal;
    renglones[0].total = costoTotal;
  }
  return renglones;
}

/** Suma de los renglones que ya traen precio. */
export const totalRenglones = (rs: readonly RenglonServicio[]) =>
  Math.round(rs.reduce((s, r) => s + (Number(r.total) || 0), 0) * 100) / 100;

/** Un nombre que se parece a alguien, pero no lo suficiente para darlo por hecho. */
export interface PersonalDudoso {
  texto_original: string;
  /** A quién se parece, para poder preguntarlo por su nombre. */
  candidato: string;
  candidato_id: string;
}

/**
 * Enlaza los nombres dictados con las fichas del personal.
 *
 * Tres cubos, y la diferencia importa:
 *
 *   · `enlazados` — coincidencia exacta. Estos entran a la orden y a nómina.
 *   · `porConfirmar` — se parece a alguien pero no es seguro. NO se enlazan.
 *   · `sinFicha` — no se parece a nadie del taller.
 *
 * Antes valía cualquier coincidencia, incluida la aproximada, y eso costó un
 * caso real: «Se la entregué a Juan Pablo» quedó registrado con JUAN ANCHUNDIA
 * como encargado del trabajo. No existe ningún Juan Pablo en el taller; casó
 * por el nombre de pila. Enlazar por parecido no es un detalle de interfaz: es
 * la comisión de ese trabajo yendo al bolsillo equivocado.
 *
 * Los tres cubos se devuelven para poder decirlos. Un técnico que no queda
 * registrado es un técnico al que no se le paga, y eso hay que avisarlo en vez
 * de dejarlo caer en silencio.
 */
export async function enlazarPersonal(
  // Solo se le pide leer `usuarios`; el cliente concreto lo pone quien llama.
  db: { from: (tabla: string) => { select: (cols: string) => PromiseLike<{ data: unknown }> } },
  nombres: readonly string[],
): Promise<{
  enlazados: EncargadoEnlazado[];
  porConfirmar: PersonalDudoso[];
  sinFicha: string[];
}> {
  const limpios = nombres.map(n => String(n || '').trim()).filter(n => n.length > 1);
  if (limpios.length === 0) return { enlazados: [], porConfirmar: [], sinFicha: [] };

  const { data } = await db.from('usuarios').select('id, nombre, alias, activo');
  const personal = (data || []) as { id: string; nombre: string; alias: string | null; activo: boolean | null }[];

  const enlazados: EncargadoEnlazado[] = [];
  const porConfirmar: PersonalDudoso[] = [];
  const sinFicha: string[] = [];

  for (const nombre of limpios) {
    const hit = resolverEncargado(nombre, personal);
    if (!hit) { sinFicha.push(nombre); continue; }

    if (hit.certeza !== 'exacta') {
      porConfirmar.push({
        texto_original: nombre,
        candidato: hit.persona.nombre,
        candidato_id: hit.persona.id,
      });
      continue;
    }

    if (enlazados.some(e => e.empleado_id === hit.persona.id)) continue;
    enlazados.push({ empleado_id: hit.persona.id, nombre: hit.persona.nombre, texto_original: nombre });
  }

  return { enlazados, porConfirmar, sinFicha };
}

/** Los nombres sueltos dentro de un campo tipo "Brayan, Freddy" o "Brayan y Jim". */
export function nombresDePersonal(texto?: string | null): string[] {
  return String(texto || '')
    .split(/[,;·]+|\sy\s/)
    .map(s => s.replace(/\(.*?\)/g, '').trim())
    .filter(s => s.length > 1);
}
