import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Lo que de verdad hace Lycos Team, sacado de las órdenes de los últimos 6 meses.
 *
 * El bot conocía una lista escrita a mano; aquí aprende de los trabajos reales (aire
 * acondicionado, bomba de gasolina, bobinas, tripoides, pintura, escaneo…) para no decirle a
 * un cliente «eso no lo hacemos» cuando sí se hace. Va SIN precios: los precios salen solo de
 * la lista oficial; para lo demás se invita a la revisión gratuita o al asesor.
 */

const AREAS: Array<[string, RegExp]> = [
  ['Escape y silenciadores', /SILENC|RESONAD|INTERMEDIO|FLEXIBLE|ESCAPE|TUBERIA|COLA|BAJANTE|GOMA|SOLDADURA|CATALIZ|FLOW|MOFLE|EMPACADURA DE BAJANTE|GANCHO/],
  ['Alineación, balanceo y cauchos', /ALINEA|BALANCE|CAUCHO|MONTURA|ROTACION|VALVULA DE CAUCHO|PARCHE/],
  ['Mecánica', /MOTOR|ACEITE|FILTRO|BUJIA|CORREA|POLEA|TENSOR|EMBRAGUE|CLUTCH|CAJA|TRIPOIDE|TRICETA|ROTULA|TERMINAL|MESETA|AMORTIGU|BASE DE|BOMBA|RADIADOR|REFRIGERANTE|EMPACADURA|TAPA VALVULA|CADENA|TIEMPO|VOLANTE|BUJE|CARDAN|DIFERENCIAL|SUSPENSION|TREN DELANTERO/],
  ['Frenos', /FRENO|PASTILLA|BANDA|DISCO|RECTIFICACION|LIGA DE FRENO|BOMBIN/],
  ['Electricidad, inyección y diagnóstico', /ESCANEO|ESCANER|DIAGNOST|INYECTOR|SENSOR|BOBINA|CABLE|BATERIA|ALTERNADOR|ARRANQUE|ELECTRIC|TPS|IAC|COMPUTADORA|LUCES|FUSIBLE|ELECTROVENTIL|CONECTOR/],
  ['Aire acondicionado', /AIRE ACONDICIONADO|A C\b|COMPRESOR|GAS REFRIGERANTE|CONDENSADOR/],
  ['Latonería, pintura y estética', /PINTURA|LATONER|PULITURA|PULIDO|PARACHOQUE|FAROS|ESTETICA|VENTANA|TAPICER/],
  ['Autolavado', /LAVADO|ASPIRADO|ENCERADO/],
];

const norm = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Lo que no es un servicio: nombres de mecánicos, mano de obra genérica, garantías.
const NO_ES = /^(MANO (DE )?OBRA|GARANTIA|REVISION|SERVICIO|TRABAJO|OTRO|VARIOS|FREDDY|FREDY|BRIAN|JIM|JUAN|INSTALACION)$/;

let cache: { texto: string; en: number } | null = null;

export async function catalogoServiciosBot(db: SupabaseClient): Promise<string> {
  if (cache && Date.now() - cache.en < 6 * 3600_000) return cache.texto;
  const desde = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from('servicios').select('items').gte('fecha', desde).limit(3000);
  const cuenta = new Map<string, number>();
  for (const s of data || []) {
    for (const it of (Array.isArray(s.items) ? s.items : []) as Array<{ descripcion?: string }>) {
      const k = norm(it.descripcion).replace(/\b\d+([.,]\d+)?\s*(L|LT|LTS|CM|MM|X\d+)?\b/g, '').replace(/\s+/g, ' ').trim();
      if (k.length < 4 || NO_ES.test(k)) continue;
      // Nombres de servicio, no notas: hasta 4 palabras (6 si se repite) y sin nombres de personas.
      const palabras = k.split(' ').length;
      if (palabras > 6 || /\b(CESAR|LANDAETA|FREDDY|FREDY|BRIAN|JIM|SE |COSTO POR|OTRA FICHA|ESTE VEHICULO)\b/.test(k)) continue;
      if (palabras > 4) { cuenta.set(`~${k}`, (cuenta.get(`~${k}`) || 0) + 1); continue; }
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
  }
  const porArea = new Map<string, Array<[string, number]>>();
  for (const [kk, n] of cuenta) {
    if (kk.startsWith('~') && n < 2) continue;
    const k = kk.replace(/^~/, '');
    const area = AREAS.find(([, re]) => re.test(k))?.[0];
    if (!area) continue;
    (porArea.get(area) || porArea.set(area, []).get(area)!).push([k, n]);
  }
  const lineas = AREAS.map(([area]) => {
    const l = (porArea.get(area) || []).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k]) => k.toLowerCase());
    return l.length ? `- ${area}: ${l.join(', ')}` : '';
  }).filter(Boolean);
  if (!lineas.length) return '';
  const texto = `TRABAJOS QUE LYCOS TEAM HACE DE VERDAD (de las órdenes de los últimos 6 meses, de más a menos frecuente):
${lineas.join('\n')}
Si el cliente pregunta por algo de esta lista, SÍ lo hacemos. Precios: solo los de la lista oficial y tu conocimiento; si no está ahí, NO inventes: invítalo a la revisión gratuita o pásalo al asesor.`;
  cache = { texto, en: Date.now() };
  return texto;
}
