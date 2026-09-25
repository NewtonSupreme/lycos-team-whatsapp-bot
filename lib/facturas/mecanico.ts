import { encargadosDeNotas } from '@/lib/nomina/encargados';

/**
 * Quién hizo el trabajo, para imprimirlo en la factura.
 *
 * El dato vive en tres sitios, y se miran en orden de fiabilidad:
 *
 *   1. Los trabajos de nómina de la orden (`job_assignments`): es a quien se le
 *      paga la comisión, así que es quien lo hizo.
 *   2. El «Encargados: Freddy (Mecánico)» que la orden guarda en sus notas.
 *   3. La línea «Encargado asignado: …» del seguimiento.
 *
 * Si solo consta que lo hizo «el taller» —sin persona— se dice eso. Y si no
 * consta nada se devuelve `null`: la factura escribe «Sin asignar» en vez de
 * callarlo, para que se note el hueco.
 */
export interface FuentesMecanico {
  trabajos?: Array<{ empleado_nombre?: string | null; es_taller?: boolean | null }>;
  notas?: string | null;
  seguimiento?: unknown;
}

/** «Freddy (Mecánico)» → «Freddy». */
const sinRol = (s: string) => s.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();

function unicos(nombres: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nombres) {
    const limpio = sinRol(n);
    const k = limpio.toLowerCase();
    if (!limpio || vistos.has(k)) continue;
    vistos.add(k);
    out.push(limpio);
  }
  return out;
}

export function mecanicoDeOrden(f: FuentesMecanico): string | null {
  const trabajos = f.trabajos || [];
  const personas = unicos(trabajos
    .filter(t => !t.es_taller && t.empleado_nombre)
    .map(t => String(t.empleado_nombre)));
  if (personas.length) return personas.join(', ');

  const deNotas = unicos(encargadosDeNotas(f.notas));
  if (deNotas.length) return deNotas.join(', ');

  if (Array.isArray(f.seguimiento)) {
    const deSeguimiento = unicos(
      (f.seguimiento as Array<{ accion?: string }>)
        .map(e => /encargad[oa]\s+asignad[oa]\s*:\s*(.+)/i.exec(String(e?.accion || ''))?.[1] || '')
        .filter(Boolean),
    );
    if (deSeguimiento.length) return deSeguimiento.join(', ');
  }

  if (trabajos.some(t => t.es_taller)) return 'Taller Lycos Team';
  return null;
}

/** El id de la orden escondido en las notas de una venta: `[ServicioID: …]`. */
export function servicioDeNotas(notas?: string | null): string | null {
  const m = /\[ServicioID:\s*([0-9a-f-]{36})\]/i.exec(String(notas || ''));
  return m ? m[1] : null;
}
