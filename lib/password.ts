/**
 * Claves de acceso.
 *
 * Hasta el 2026-10-20 la columna `password_hash` guardaba la clave tal cual:
 * cualquiera con acceso a la base las leía todas. Ahora se guarda
 * `scrypt$<sal>$<hash>` (sal aleatoria de 16 bytes, clave derivada de 64).
 *
 * `verificarClave` acepta también el formato viejo (texto plano) para que nadie
 * se quede fuera: si coincide, avisa con `migrar` y quien llama lo reemplaza
 * por el hash en ese mismo momento.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;
const PREFIJO = 'scrypt$';

/**
 * Lo que se guarda a quien no inicia sesión (personal de nómina). La columna
 * no admite vacío, y esto nunca coincide con una clave: `verificarClave`
 * rechaza todo lo que empieza por «!».
 */
export const SIN_CLAVE = '!sin-acceso';

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = await scrypt(clave, sal, 64);
  return `${PREFIJO}${sal.toString('base64')}$${derivada.toString('base64')}`;
}

export function esHash(guardada: string | null | undefined): boolean {
  return typeof guardada === 'string' && guardada.startsWith(PREFIJO);
}

export async function verificarClave(clave: string, guardada: string | null | undefined): Promise<{ ok: boolean; migrar: boolean }> {
  if (!guardada || guardada.startsWith('!') || typeof clave !== 'string' || !clave) return { ok: false, migrar: false };
  if (!esHash(guardada)) {
    // Formato viejo: texto plano. Comparación de tiempo constante igualmente.
    const a = Buffer.from(clave); const b = Buffer.from(guardada);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    return { ok, migrar: ok };
  }
  const [, salB64, hashB64] = guardada.split('$');
  if (!salB64 || !hashB64) return { ok: false, migrar: false };
  const esperado = Buffer.from(hashB64, 'base64');
  const derivada = await scrypt(clave, Buffer.from(salB64, 'base64'), esperado.length);
  return { ok: derivada.length === esperado.length && timingSafeEqual(derivada, esperado), migrar: false };
}
