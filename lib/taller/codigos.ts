import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * El código de 4 dígitos de cada trabajador del taller: lo pide la pantalla
 * del taller para abrir «Mi cuenta» (lo que cargó y cuánto cobró), y va
 * impreso en su carnet.
 *
 * Se guarda CIFRADO (AES-256-GCM con el secreto del servidor) en una sola fila
 * de `configuracion`: así el carnet se puede reimprimir sin cambiar el código,
 * y quien lea la tabla desde el navegador no saca nada. Sin migración.
 */

const CLAVE = 'codigos_taller';
const INTENTOS = 5;
const BLOQUEO_MIN = 5;

interface Registro {
  c: string;               // código cifrado: iv.tag.datos en base64url
  creado: string;
  fallos?: number;
  bloqueadoHasta?: string | null;
}
type Tabla = Record<string, Registro>;

function llave(): Buffer {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Falta SESSION_SECRET para cifrar los códigos del taller');
  return createHash('sha256').update(`${s}:codigos-taller`).digest();
}

function cifrar(codigo: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(), iv);
  const datos = Buffer.concat([c.update(codigo, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map(b => b.toString('base64url')).join('.');
}

function descifrar(guardado: string): string | null {
  try {
    const [iv, tag, datos] = guardado.split('.').map(p => Buffer.from(p, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', llave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function leer(db: SupabaseClient): Promise<{ id: string | null; tabla: Tabla }> {
  const { data } = await db.from('configuracion').select('id, valor').eq('clave', CLAVE).is('sede_id', null)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return { id: data?.id ?? null, tabla: (data?.valor as Tabla) || {} };
}

async function guardar(db: SupabaseClient, id: string | null, tabla: Tabla) {
  const ahora = new Date().toISOString();
  const { error } = id
    ? await db.from('configuracion').update({ valor: tabla, updated_at: ahora }).eq('id', id)
    : await db.from('configuracion').insert({ clave: CLAVE, valor: tabla, sede_id: null, updated_at: ahora });
  if (error) throw new Error(error.message);
}

/** Cuatro dígitos que no se adivinan a la primera (ni 1234, ni 0000, ni 1212) y que nadie más tiene. */
function nuevoCodigo(usados: Set<string>): string {
  const obvio = (c: string) => /^(\d)\1{3}$/.test(c) || /^(\d\d)\1$/.test(c) || '0123456789'.includes(c) || '9876543210'.includes(c);
  for (;;) {
    const c = String(randomInt(0, 10000)).padStart(4, '0');
    if (!obvio(c) && !usados.has(c)) return c;
  }
}

/** Los códigos en claro, para los carnets. Solo para el Usuario Maestro. */
export async function codigosEnClaro(db: SupabaseClient): Promise<Record<string, { codigo: string; creado: string }>> {
  const { tabla } = await leer(db);
  const salida: Record<string, { codigo: string; creado: string }> = {};
  for (const [id, r] of Object.entries(tabla)) {
    const codigo = descifrar(r.c);
    if (codigo) salida[id] = { codigo, creado: r.creado };
  }
  return salida;
}

/** Da código a los que se indiquen (uno nuevo aunque ya tuvieran). Devuelve los asignados. */
export async function asignarCodigos(db: SupabaseClient, empleados: string[]): Promise<Record<string, string>> {
  const { id, tabla } = await leer(db);
  const usados = new Set(Object.values(tabla).map(r => descifrar(r.c)).filter((c): c is string => !!c));
  const nuevos: Record<string, string> = {};
  for (const e of empleados) {
    const anterior = tabla[e] && descifrar(tabla[e].c);
    if (anterior) usados.delete(anterior);
    const c = nuevoCodigo(usados);
    usados.add(c);
    tabla[e] = { c: cifrar(c), creado: new Date().toISOString() };
    nuevos[e] = c;
  }
  await guardar(db, id, tabla);
  return nuevos;
}

export type ResultadoCodigo =
  | { ok: true }
  | { ok: false; motivo: 'sin_codigo' | 'incorrecto' | 'bloqueado'; quedan?: number; minutos?: number };

/**
 * Revisa el código de un trabajador. Tras 5 fallos seguidos su cuenta queda
 * cerrada 5 minutos: con 4 dígitos, eso hace inútil probar al azar.
 */
export async function verificarCodigo(db: SupabaseClient, empleadoId: string, codigo: string): Promise<ResultadoCodigo> {
  const { id, tabla } = await leer(db);
  const r = tabla[empleadoId];
  if (!r) return { ok: false, motivo: 'sin_codigo' };
  const ahora = Date.now();
  if (r.bloqueadoHasta && Date.parse(r.bloqueadoHasta) > ahora) {
    return { ok: false, motivo: 'bloqueado', minutos: Math.ceil((Date.parse(r.bloqueadoHasta) - ahora) / 60000) };
  }
  if (descifrar(r.c) === String(codigo)) {
    if (r.fallos || r.bloqueadoHasta) { tabla[empleadoId] = { c: r.c, creado: r.creado }; await guardar(db, id, tabla); }
    return { ok: true };
  }
  const fallos = (r.bloqueadoHasta ? 0 : r.fallos || 0) + 1;
  const bloquea = fallos >= INTENTOS;
  tabla[empleadoId] = { ...r, fallos: bloquea ? 0 : fallos, bloqueadoHasta: bloquea ? new Date(ahora + BLOQUEO_MIN * 60000).toISOString() : null };
  await guardar(db, id, tabla);
  return bloquea ? { ok: false, motivo: 'bloqueado', minutos: BLOQUEO_MIN } : { ok: false, motivo: 'incorrecto', quedan: INTENTOS - fallos };
}
