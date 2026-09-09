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

/** Precio dictado dentro de la frase: "soldadura 15$", "$65", "40 dolares". */
export function precioDeTexto(texto: string): number | null {
  const t = String(texto || '');
  const m = t.match(/(?:\$\s*(\d+(?:[.,]\d{1,2})?))|(?:(\d+(?:[.,]\d{1,2})?)\s*(?:\$|d[oó]lares?|usd))/i);
  if (!m) return null;
  const bruto = m[1] ?? m[2];
  const n = parseFloat(String(bruto).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Quita el precio del texto para que no quede repetido dentro del renglón. */
export function sinPrecio(texto: string): string {
  return String(texto || '')
    .replace(/(?:\$\s*\d+(?:[.,]\d{1,2})?)|(?:\d+(?:[.,]\d{1,2})?\s*(?:\$|d[oó]lares?|usd))/gi, '')
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

/**
 * Enlaza los nombres dictados con las fichas del personal.
 *
 * Devuelve también los que no se pudieron enlazar, para poder decirlo en vez de
 * dejarlos caer en silencio: un técnico que no queda registrado es un técnico
 * al que no se le paga.
 */
export async function enlazarPersonal(
  // Solo se le pide leer `usuarios`; el cliente concreto lo pone quien llama.
  db: { from: (tabla: string) => { select: (cols: string) => PromiseLike<{ data: unknown }> } },
  nombres: readonly string[],
): Promise<{ enlazados: EncargadoEnlazado[]; sinFicha: string[] }> {
  const limpios = nombres.map(n => String(n || '').trim()).filter(n => n.length > 1);
  if (limpios.length === 0) return { enlazados: [], sinFicha: [] };

  const { data } = await db.from('usuarios').select('id, nombre, alias, activo');
  const personal = (data || []) as { id: string; nombre: string; alias: string | null; activo: boolean | null }[];

  const enlazados: EncargadoEnlazado[] = [];
  const sinFicha: string[] = [];
  for (const nombre of limpios) {
    const hit = resolverEncargado(nombre, personal);
    if (!hit) { sinFicha.push(nombre); continue; }
    if (enlazados.some(e => e.empleado_id === hit.persona.id)) continue;
    enlazados.push({ empleado_id: hit.persona.id, nombre: hit.persona.nombre, texto_original: nombre });
  }
  return { enlazados, sinFicha };
}

/** Los nombres sueltos dentro de un campo tipo "Brayan, Freddy" o "Brayan y Jim". */
export function nombresDePersonal(texto?: string | null): string[] {
  return String(texto || '')
    .split(/[,;·]+|\sy\s/)
    .map(s => s.replace(/\(.*?\)/g, '').trim())
    .filter(s => s.length > 1);
}
