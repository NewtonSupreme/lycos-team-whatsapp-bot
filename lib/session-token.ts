/**
 * Cookie de sesión firmada.
 *
 * Antes `lycos_session` guardaba el nombre de usuario tal cual: bastaba con
 * escribir `lycos_session=<usuario>` en el navegador para entrar como esa
 * persona, admin incluido. Ahora lleva `usuario.firma` (HMAC-SHA256 con un
 * secreto del servidor) y una cookie sin firma válida no abre nada.
 *
 * Secreto: SESSION_SECRET; si no está, se deriva de la service role key (que
 * tampoco sale nunca del servidor). Cambiarlo cierra todas las sesiones.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function secreto(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Falta SESSION_SECRET para firmar la sesión');
  return s;
}

function firma(username: string): string {
  return createHmac('sha256', secreto()).update(`lycos:${username}`).digest('base64url');
}

/** Valor a guardar en la cookie para este usuario. */
export function firmarSesion(username: string): string {
  return `${username}.${firma(username)}`;
}

/** Usuario de la cookie, o null si falta o la firma no cuadra. */
export function leerSesion(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const i = valor.lastIndexOf('.');
  if (i <= 0) return null;
  const username = valor.slice(0, i);
  const dada = Buffer.from(valor.slice(i + 1));
  let esperada: Buffer;
  try { esperada = Buffer.from(firma(username)); } catch { return null; }
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  return username;
}
