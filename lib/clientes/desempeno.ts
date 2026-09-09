/**
 * Clasificar a los clientes por lo que valen para el taller.
 *
 * Una lista de 1.261 clientes ordenada por fecha de alta no dice nada: no se
 * distingue al que viene cada mes del que vino una vez hace dos años. Y lo que
 * hace falta saber no es solo cuánto ha gastado, sino **si sigue viniendo**.
 *
 * Se miran tres cosas, y las tres importan por separado:
 *
 *   · Cuántos servicios lleva. Es la lealtad demostrada.
 *   · Cuándo fue el último. Un buen cliente que no aparece en ocho meses es un
 *     problema, no un logro.
 *   · Con qué frecuencia viene. Cinco servicios en un año no es lo mismo que
 *     cinco en seis años.
 *
 * De ahí sale el segmento. El que más valor tiene para el taller no es «VIP»
 * —a ese ya lo tienen— sino **«en riesgo»**: el que era bueno y está dejando de
 * venir. Ese es el que hay que llamar hoy, y es el que una lista por fecha de
 * alta esconde por completo.
 */

export type Segmento =
  | 'vip'          // muchos servicios y sigue viniendo
  | 'frecuente'    // viene con regularidad
  | 'ocasional'    // ha vuelto, pero poco
  | 'nuevo'        // acaba de llegar; aún no se sabe
  | 'una_vez'      // vino una sola vez y no ha vuelto
  | 'en_riesgo'    // era bueno y lleva demasiado sin venir
  | 'dormido'      // demasiado tiempo sin aparecer
  | 'sin_servicios'; // registrado y nunca atendido

export interface MetaSegmento {
  id: Segmento;
  label: string;
  /** Qué significa, en una frase, para quien mira la pantalla. */
  descripcion: string;
  /** Si conviene hacer algo con él ahora. */
  accionable: boolean;
  claseChip: string;
  claseTexto: string;
}

export const SEGMENTOS: Record<Segmento, MetaSegmento> = {
  vip: {
    id: 'vip', label: 'VIP',
    descripcion: 'Muchos servicios y sigue viniendo. Cuídalo.',
    accionable: false,
    claseChip: 'bg-[#fef3c7] text-[#92400e] border-[#fcd34d]',
    claseTexto: 'text-[#92400e]',
  },
  frecuente: {
    id: 'frecuente', label: 'Frecuente',
    descripcion: 'Vuelve con regularidad.',
    accionable: false,
    claseChip: 'bg-[#dcfce7] text-[#15803d] border-[#86efac]',
    claseTexto: 'text-[#15803d]',
  },
  ocasional: {
    id: 'ocasional', label: 'Ocasional',
    descripcion: 'Ha venido pocas veces. Hay margen para que vuelva más.',
    accionable: true,
    claseChip: 'bg-[#e0f2fe] text-[#0369a1] border-[#7dd3fc]',
    claseTexto: 'text-[#0369a1]',
  },
  nuevo: {
    id: 'nuevo', label: 'Nuevo',
    descripcion: 'Primer servicio reciente. Aún se está ganando.',
    accionable: true,
    claseChip: 'bg-[#ede9fe] text-[#6d28d9] border-[#c4b5fd]',
    claseTexto: 'text-[#6d28d9]',
  },
  una_vez: {
    id: 'una_vez', label: 'Vino una vez',
    descripcion: 'Un solo servicio y no ha vuelto. Es el grupo con más margen.',
    accionable: true,
    claseChip: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]',
    claseTexto: 'text-[#854d0e]',
  },
  en_riesgo: {
    id: 'en_riesgo', label: 'En riesgo',
    descripcion: 'Venía seguido y lleva demasiado sin aparecer. Llámalo.',
    accionable: true,
    claseChip: 'bg-[#ffedd5] text-[#c2410c] border-[#fdba74]',
    claseTexto: 'text-[#c2410c]',
  },
  dormido: {
    id: 'dormido', label: 'Dormido',
    descripcion: 'Más de un año sin volver.',
    accionable: true,
    claseChip: 'bg-[#f1f5f9] text-[#475569] border-[#cbd5e1]',
    claseTexto: 'text-[#475569]',
  },
  sin_servicios: {
    id: 'sin_servicios', label: 'Sin servicios',
    descripcion: 'Registrado pero nunca atendido.',
    accionable: true,
    claseChip: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]',
    claseTexto: 'text-[#94a3b8]',
  },
};

/** Lo que se sabe de la actividad de un cliente. */
export interface ActividadCliente {
  cliente_id: string;
  servicios: number;
  /** Suma de lo facturado, en dólares. */
  total: number;
  /** Fecha del primer y del último servicio (YYYY-MM-DD). */
  primero: string | null;
  ultimo: string | null;
  vehiculos: number;
}

export interface DesempenoCliente extends ActividadCliente {
  segmento: Segmento;
  /** Días desde el último servicio; `null` si nunca vino. */
  diasSinVenir: number | null;
  /** Servicios por año de relación. Mide el ritmo, no el volumen. */
  serviciosPorAno: number;
  /** Ticket medio. */
  ticketMedio: number;
  /**
   * Puntuación de 0 a 100 para poder ordenar.
   *
   * Mezcla volumen, dinero y ritmo, y penaliza el tiempo sin venir. Sirve para
   * ordenar la lista, no para etiquetar a nadie: la etiqueta es el segmento.
   */
  puntos: number;
}

const DIA = 24 * 60 * 60 * 1000;

const diasEntre = (desde: string, hasta: Date) => {
  const d = new Date(`${desde.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((hasta.getTime() - d.getTime()) / DIA));
};

/**
 * Umbrales, en un solo sitio y con su razón.
 *
 * Están puestos para un taller de coches, donde lo normal es venir cada pocos
 * meses (cambio de aceite, cauchos, revisión). Con esa cadencia, 120 días sin
 * aparecer aún es normal; 240 ya es que se fue a otro lado.
 */
export const UMBRALES = {
  /** Servicios para considerarlo un cliente hecho. */
  vip: 5,
  frecuente: 3,
  /** Días sin venir a partir de los cuales deja de contar como activo. */
  activo: 120,
  /** …y a partir de los cuales se le da por perdido. */
  perdido: 365,
  /**
   * Un primer servicio es «nuevo» durante estos días.
   *
   * Con 45 y no con 90 por lo que dicen los datos: de 388 clientes con
   * actividad, 322 vinieron UNA sola vez. Con el umbral en 90 días el 81% caía
   * en «Nuevo» y la clasificación no distinguía nada. A los mes y medio ya no
   * es que sea nuevo: es que vino una vez y no volvió, que es un cliente
   * distinto y el que de verdad hay que trabajar.
   */
  nuevo: 45,
};

export function calcularDesempeno(a: ActividadCliente, hoy = new Date()): DesempenoCliente {
  const servicios = Math.max(0, Number(a.servicios) || 0);
  const total = Math.max(0, Number(a.total) || 0);
  const diasSinVenir = a.ultimo ? diasEntre(a.ultimo, hoy) : null;
  const antiguedadDias = a.primero ? (diasEntre(a.primero, hoy) ?? 0) : 0;
  // Al menos un mes de relación, para que el primer servicio no dé un ritmo
  // absurdo de 365 servicios al año.
  const anosRelacion = Math.max(30, antiguedadDias) / 365;
  const serviciosPorAno = servicios > 0 ? servicios / anosRelacion : 0;
  const ticketMedio = servicios > 0 ? total / servicios : 0;

  const segmento = clasificar({ servicios, diasSinVenir, antiguedadDias });

  // ── Puntos ────────────────────────────────────────────────────────────────
  // Nada de esto pretende ser exacto; es una forma de ordenar la lista para que
  // arriba salga lo que merece atención.
  const porVolumen = Math.min(35, servicios * 7);
  const porDinero = Math.min(30, total / 40);
  const porRitmo = Math.min(20, serviciosPorAno * 6);
  // La frescura pesa mucho: un cliente que no viene no vale lo que valía.
  const frescura = diasSinVenir === null
    ? 0
    : Math.max(0, 15 * (1 - Math.min(1, diasSinVenir / UMBRALES.perdido)));

  const puntos = Math.round(Math.min(100, porVolumen + porDinero + porRitmo + frescura));

  return {
    ...a,
    servicios,
    total,
    segmento,
    diasSinVenir,
    serviciosPorAno: Math.round(serviciosPorAno * 10) / 10,
    ticketMedio: Math.round(ticketMedio * 100) / 100,
    puntos,
  };
}

function clasificar(
  { servicios, diasSinVenir, antiguedadDias }:
  { servicios: number; diasSinVenir: number | null; antiguedadDias: number },
): Segmento {
  if (servicios === 0 || diasSinVenir === null) return 'sin_servicios';

  if (diasSinVenir > UMBRALES.perdido) return 'dormido';

  // Era un cliente hecho y lleva demasiado sin venir: esto es lo que hay que
  // ver, y es justo lo que una lista por fecha de alta esconde.
  if (diasSinVenir > UMBRALES.activo && servicios >= UMBRALES.frecuente) return 'en_riesgo';

  // Uno o dos servicios y ya lleva más de cuatro meses sin aparecer: se está
  // perdiendo, aunque todavía no lleve un año.
  if (diasSinVenir > UMBRALES.activo) return 'dormido';

  // De aquí abajo, todos están activos.
  if (servicios >= UMBRALES.vip) return 'vip';
  if (servicios >= UMBRALES.frecuente) return 'frecuente';

  if (servicios === 1) {
    // Un servicio recién hecho aún no dice si volverá; pasado mes y medio, sí
    // dice algo: que no ha vuelto.
    return antiguedadDias <= UMBRALES.nuevo ? 'nuevo' : 'una_vez';
  }
  return 'ocasional';
}

/** Cuántos clientes hay en cada segmento. */
export function contarSegmentos(
  lista: readonly DesempenoCliente[],
): Record<Segmento, number> {
  const base = Object.fromEntries(
    (Object.keys(SEGMENTOS) as Segmento[]).map(k => [k, 0]),
  ) as Record<Segmento, number>;
  lista.forEach(x => { base[x.segmento] += 1; });
  return base;
}

/** Cómo se lee «hace cuánto vino» sin hacer cuentas mentales. */
export function textoUltimaVisita(dias: number | null): string {
  if (dias === null) return 'Nunca';
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const anos = Math.floor(dias / 365);
  const resto = Math.round((dias % 365) / 30);
  if (resto === 0) return `Hace ${anos} ${anos === 1 ? 'año' : 'años'}`;
  return `Hace ${anos} a. ${resto} m.`;
}
