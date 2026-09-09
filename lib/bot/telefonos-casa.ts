/**
 * Los teléfonos que son del taller y nunca pueden quedar como cliente.
 *
 * Cuando un admin registra un vehículo por WhatsApp y no dicta el teléfono del
 * dueño, lo único que el sistema tiene a mano es el número desde el que llega
 * el mensaje: el suyo. Si ese número entra a `clientes`, el vehículo queda a
 * nombre del admin —y el siguiente vehículo que registre se le pega al mismo
 * cliente, porque la búsqueda es por teléfono—. Al cabo de unas semanas el
 * admin figura como dueño de media flota.
 *
 * La comprobación vive aquí y no en quien llama a propósito: el punto donde se
 * crea el cliente es el último sitio por el que pasa el dato, y es el único que
 * garantiza que no se cuele por otro camino.
 */

/** Solo los dígitos, que es como se comparan los números venezolanos. */
export const soloDigitos = (t?: string | null) => String(t || '').replace(/[^0-9]/g, '');

/**
 * Los últimos 10 dígitos: es lo que identifica al abonado sin importar si el
 * número viene con +58, con 0058 o pelado.
 */
export const ultimos10 = (t?: string | null) => soloDigitos(t).slice(-10);

/** Marcadores que ya significan "sin teléfono". */
const SIN_TELEFONO = new Set(['', '00000000', '0000000000', '00000000000', '000000000000']);

export const esTelefonoVacio = (t?: string | null) => SIN_TELEFONO.has(soloDigitos(t));

export interface CasaTelefonos {
  /** Números fijos de administración, del código. */
  fijos: readonly string[];
  /** Números del personal registrado, de la tabla `usuarios`. */
  personal: readonly string[];
}

/** Junta los números del taller: los del código y los del personal. */
export async function cargarTelefonosDeLaCasa(
  db: { from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown }> } } | null,
  fijos: readonly string[],
): Promise<CasaTelefonos> {
  const personal: string[] = [];
  if (db) {
    try {
      const { data } = await db.from('usuarios').select('telefono');
      for (const u of (data || []) as { telefono?: string | null }[]) {
        const n = ultimos10(u.telefono);
        if (n.length >= 7) personal.push(n);
      }
    } catch { /* si no se puede leer, quedan los fijos */ }
  }
  return { fijos: fijos.map(ultimos10).filter(n => n.length >= 7), personal };
}

/** ¿Este número es de alguien de la casa? */
export function esTelefonoDeLaCasa(telefono: string | null | undefined, casa: CasaTelefonos): boolean {
  const n = ultimos10(telefono);
  if (n.length < 7) return false;
  return casa.fijos.includes(n) || casa.personal.includes(n);
}

/**
 * El teléfono con el que se puede registrar a un cliente.
 *
 * Devuelve `null` cuando el número es del taller: sin teléfono el cliente se
 * crea igual, con su nombre y su vehículo, y queda pendiente de completar. Es
 * infinitamente preferible a que el vehículo acabe colgando del admin.
 */
export function telefonoParaCliente(
  telefono: string | null | undefined,
  casa: CasaTelefonos,
): string | null {
  if (esTelefonoVacio(telefono)) return null;
  if (esTelefonoDeLaCasa(telefono, casa)) return null;
  return String(telefono).trim() || null;
}
