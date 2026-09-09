/**
 * Reconocer al mismo cliente escrito de formas distintas.
 *
 * La base tiene 1.261 clientes para 1.170 nombres distintos, y el desajuste no
 * es casual. Salió de dos cosas concretas:
 *
 *   1) El teléfono se guarda en cuatro formatos —«04127419438», «+584127419438»,
 *      «584127419438», «4127419438»— y la búsqueda comparaba el texto tal cual.
 *      El mismo número no se encontraba, así que se creaba otra ficha.
 *
 *   2) El nombre llega con dedazos y acentos sueltos: «ali arguinzones» /
 *      «ali arguizones», «belkis» / «belquis», «josefina» / «josegina».
 *
 * Lo que NO se puede hacer es dar por buena la identidad solo por el teléfono.
 * Hay 59 números compartidos por gente distinta —el del taller, el de la
 * esposa, el de la oficina—: uno de ellos tiene siete clientes colgando.
 * Deduplicar por teléfono fundiría a siete personas en una, que es peor que
 * tener duplicados.
 *
 * Así que aquí el teléfono sirve para CONFIRMAR un nombre parecido, nunca para
 * decidir por sí solo.
 */

export interface ClienteIdentificable {
  id: string;
  nombre: string | null;
  apellido?: string | null;
  telefono?: string | null;
  cedula?: string | null;
}

/** Números de relleno que no identifican a nadie. */
const TELEFONOS_VACIOS = new Set(['', 's/n', 'sn', 'na', 'n/a', '0', '00000000', '000000000', '0000000000']);

/** Textos que la gente y el bot escriben cuando no hay cédula. */
const CEDULAS_VACIAS = new Set([
  '', 'na', 'n/a', 'sn', 's/n', 'no', 'ninguna', 'ninguno', 'nada', 'sin',
  'sincedula', 'desconocido', 'desconocida', 'null', 'undefined', '0',
]);

/**
 * La cédula reducida a lo que identifica: la letra de nacionalidad y el número.
 *
 * En la base convive «11464383» con «V-19734521» y con 18 filas que dicen
 * literalmente «N/A». Sin normalizar, la misma cédula escrita de dos formas son
 * dos clientes, y «N/A» pasa por un documento válido compartido por 18
 * personas.
 *
 * Devuelve `V12345678` o `E12345678`; la nacionalidad se asume venezolana
 * cuando no viene, que es el caso de casi toda la base.
 */
export function claveCedula(cedula?: string | null): string | null {
  const bruto = String(cedula || '').trim();
  const plano = sinAcentos(bruto).replace(/[^a-z0-9]/g, '');
  if (CEDULAS_VACIAS.has(plano)) return null;

  const digitos = plano.replace(/\D/g, '');
  // Una cédula venezolana tiene entre 6 y 9 dígitos. Menos es un teclazo y más
  // es otra cosa (un RIF, un teléfono pegado por error).
  if (digitos.length < 6 || digitos.length > 9) return null;
  // Todo el número igual —111111— es relleno, no un documento.
  if (/^(\d)\1+$/.test(digitos)) return null;

  const letra = /^[ve]/.test(plano) ? plano[0].toUpperCase() : 'V';
  // Sin ceros a la izquierda: «V-06250756» y «V-6250756» son la misma persona.
  return `${letra}${String(Number(digitos))}`;
}

/** La cédula tal y como debe guardarse: normalizada y legible. */
export function formatearCedula(cedula?: string | null): string | null {
  const k = claveCedula(cedula);
  if (!k) return null;
  return `${k[0]}-${k.slice(1)}`;
}

/**
 * El número reducido a lo que de verdad lo identifica: sus últimos 10 dígitos.
 *
 * En Venezuela el móvil son 10 dígitos (0412…) y con el prefijo del país se
 * escriben 12 (58412…). Quedarse con los diez últimos hace que todas las
 * variantes del mismo número coincidan.
 */
export function claveTelefono(telefono?: string | null): string | null {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (TELEFONOS_VACIOS.has(digitos)) return null;
  if (digitos.length < 10) return null;
  // Un número de solo ceros o de un dígito repetido es relleno, no un teléfono.
  const ultimos = digitos.slice(-10);
  if (/^(\d)\1{9}$/.test(ultimos)) return null;
  return ultimos;
}

export const sinAcentos = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El nombre reducido a comparable: sin acentos, sin dobles espacios, sin ruido. */
export function claveNombre(nombre?: string | null, apellido?: string | null): string {
  return sinAcentos(`${nombre || ''} ${apellido || ''}`)
    // El «—» que se usa como apellido vacío no es parte del nombre.
    .replace(/[—–-]+/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de edición, cortada en `max`: solo interesa «casi igual». */
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
    if (mejor > max) return max + 1;
    previa = fila;
  }
  return previa[b.length];
}

export type Certeza = 'exacta' | 'probable' | 'dudosa';

export interface Coincidencia<T> {
  cliente: T;
  certeza: Certeza;
  motivo: string;
}

/**
 * Busca a quién corresponde un nombre y un teléfono entre los clientes ya
 * registrados.
 *
 * Devuelve las coincidencias ordenadas de más a menos segura, para que quien
 * registra decida. `exacta` se puede dar por buena sola; `probable` y `dudosa`
 * hay que confirmarlas, porque acertar de más es fundir dos personas.
 */
export function buscarCliente<T extends ClienteIdentificable>(
  nombreEscrito: string,
  telefonoEscrito: string | null | undefined,
  clientes: readonly T[],
  cedulaEscrita?: string | null,
): Coincidencia<T>[] {
  const qn = claveNombre(nombreEscrito);
  const qt = claveTelefono(telefonoEscrito);
  const qc = claveCedula(cedulaEscrita);
  if (!qn && !qt && !qc) return [];

  const fuera: Coincidencia<T>[] = [];

  // La cédula manda sobre todo lo demás: es el único dato que identifica a una
  // persona y solo a una. Un teléfono se comparte y un nombre se escribe mal,
  // pero dos cédulas iguales son la misma persona. Si hay coincidencia por
  // cédula no se mira nada más — así se evita crear otra ficha por un dedazo en
  // el apellido cuando el documento ya dice quién es.
  if (qc) {
    const porCedula = clientes
      .filter(c => claveCedula(c.cedula) === qc)
      .map(c => ({
        cliente: c,
        certeza: 'exacta' as Certeza,
        motivo: `Misma cédula (${formatearCedula(c.cedula)}).`,
      }));
    if (porCedula.length > 0) return porCedula.slice(0, 6);
  }

  for (const c of clientes) {
    const cn = claveNombre(c.nombre, c.apellido);
    const ct = claveTelefono(c.telefono);
    const mismoTelefono = !!qt && !!ct && qt === ct;

    const cc = claveCedula(c.cedula);
    // Dos cédulas distintas son dos personas, aunque se llamen igual. Sin esto,
    // el segundo «Juan Anchundia» se enlazaría al primero y se le cargarían
    // servicios que no son suyos.
    const cedulaContradice = !!qc && !!cc && qc !== cc;

    if (qn && cn === qn) {
      if (cedulaContradice) {
        fuera.push({
          cliente: c,
          certeza: 'dudosa',
          motivo: `Mismo nombre pero otra cédula (${formatearCedula(c.cedula)}): parecen dos personas distintas.`,
        });
        continue;
      }
      fuera.push({
        cliente: c,
        certeza: 'exacta',
        motivo: mismoTelefono
          ? 'Mismo nombre y mismo teléfono.'
          : 'Mismo nombre ya registrado.',
      });
      continue;
    }

    if (cedulaContradice) continue;   // ni parecidos ni teléfono: es otro.

    if (!qn) {
      // Solo hay teléfono. Nunca es exacta: un número puede ser de varios.
      if (mismoTelefono) {
        fuera.push({ cliente: c, certeza: 'dudosa', motivo: 'Ese teléfono ya está en esta ficha.' });
      }
      continue;
    }

    // Nombre parecido: dedazo de una o dos letras según lo largo que sea.
    const tope = qn.length >= 12 ? 2 : 1;
    const d = distancia(qn, cn, tope);
    const parecido = d <= tope;

    // Solo el nombre de pila igual y el teléfono también: casi seguro la misma
    // persona con el apellido puesto a medias.
    const pilaIgual = qn.split(' ')[0] === cn.split(' ')[0] && qn.split(' ')[0].length >= 3;

    if (parecido && mismoTelefono) {
      const comoEsta = `${c.nombre || ''} ${c.apellido || ''}`.trim();
      fuera.push({ cliente: c, certeza: 'probable', motivo: `Se escribe casi igual («${comoEsta}») y el teléfono coincide.` });
    } else if (parecido) {
      fuera.push({ cliente: c, certeza: 'probable', motivo: 'El nombre se escribe casi igual; puede ser un dedazo.' });
    } else if (pilaIgual && mismoTelefono) {
      fuera.push({ cliente: c, certeza: 'probable', motivo: 'Mismo nombre de pila y mismo teléfono.' });
    } else if (mismoTelefono) {
      // Mismo número, nombre distinto. Puede ser familia o el teléfono del
      // taller; se enseña para que se vea, pero no se da por bueno.
      fuera.push({ cliente: c, certeza: 'dudosa', motivo: 'Otro cliente con ese mismo teléfono.' });
    }
  }

  const peso: Record<Certeza, number> = { exacta: 0, probable: 1, dudosa: 2 };
  return fuera.sort((a, b) => peso[a.certeza] - peso[b.certeza]).slice(0, 6);
}

/**
 * La coincidencia que se puede aplicar sin preguntar.
 *
 * Solo cuando hay UNA exacta. Con dos fichas de nombre idéntico ya hay que
 * elegir, y elegir por su cuenta es cómo se le cargan servicios al cliente
 * equivocado.
 */
export function coincidenciaSegura<T extends ClienteIdentificable>(
  coincidencias: readonly Coincidencia<T>[],
): T | null {
  const exactas = coincidencias.filter(c => c.certeza === 'exacta');
  return exactas.length === 1 ? exactas[0].cliente : null;
}
