// ─────────────────────────────────────────────────────────────────────────────
// Action Guard — integridad de las acciones del bot de WhatsApp (Modo Dios).
//
// El texto de respuesta lo redacta la IA (Gemini); las escrituras en BD sólo
// ocurren si el rol del operador pasa el chequeo de permisos. Sin este guard, si
// el permiso falla el tag se descarta en silencio pero el "✅ registrado" de la
// IA igual se envía, dejando al operador con un éxito que nunca pasó.
//
// Este módulo son funciones PURAS (sin BD) para que el webhook las orqueste y
// para poder probarlas de forma aislada.
// ─────────────────────────────────────────────────────────────────────────────

export type ModuloEscritura =
  | 'inventario' | 'servicios' | 'agenda' | 'clientes' | 'vehiculos' | 'ventas';

export interface WriteTagSpec {
  /** Detecta el tag en el texto de la IA. */
  re: RegExp;
  modulo: ModuloEscritura;
  accion: 'crear' | 'editar' | 'eliminar';
  /** Acción sensible: exige confirmación explícita antes de aplicarse. */
  sensible: boolean;
  /** Etiqueta legible para los mensajes al operador. */
  label: string;
}

export const WRITE_TAGS: WriteTagSpec[] = [
  { re: /\[STOCK_?UPSERT:\s*[^\]]+\]/i, modulo: 'inventario', accion: 'editar', sensible: true, label: 'inventario / precios' },
  { re: /\[STOCK_DELETE:\s*[^\]]+\]/i, modulo: 'inventario', accion: 'eliminar', sensible: true, label: 'eliminar producto' },
  { re: /\[SERVICIO_UPSERT:\s*[^\]]+\]/i, modulo: 'servicios', accion: 'crear', sensible: false, label: 'servicios' },
  { re: /\[CITA_UPSERT:\s*[^\]]+\]/i, modulo: 'agenda', accion: 'crear', sensible: false, label: 'citas' },
  { re: /\[CITA_DELETE:\s*[^\]]+\]/i, modulo: 'agenda', accion: 'eliminar', sensible: true, label: 'eliminar cita' },
  { re: /\[CLIENTE_UPSERT:\s*[^\]]+\]/i, modulo: 'clientes', accion: 'crear', sensible: false, label: 'clientes' },
  { re: /\[VEHICULO_UPSERT:\s*[^\]]+\]/i, modulo: 'vehiculos', accion: 'crear', sensible: false, label: 'vehículos' },
  { re: /\[ACTION:\s*registrar_venta_completa[^\]]*\]/i, modulo: 'ventas', accion: 'crear', sensible: true, label: 'registrar venta' },
];

/**
 * Frases con las que la IA afirma (en pasado / participio) haber concretado una
 * acción.
 *
 * Faltaban las de "añadir" y las perífrasis con "he/ha" ("he añadido el costo",
 * "ha sido ajustado"), que es justo como redacta cuando se le pide agregar algo
 * a un trabajo existente. Sin ellas el guard dejaba pasar un "✅ Servicio
 * actualizado" aunque no se hubiera escrito nada: el operador se iba pensando
 * que el trabajo quedó cobrado.
 */
const CLAIM_RE = /\b(regist(?:r[eé]|rad[oa]s?|ramos)|qued[oó]\s+(?:regist|guard|agend)|guard[eé]|guardad[oa]s?|actualic[eé]|actualizad[oa]s?|elimin[eé]|eliminad[oa]s?|borr[eé]|cre[eé]|cread[oa]s?|agregu[eé]|agregad[oa]s?|a[ñn]ad[ií]|a[ñn]adid[oa]s?|incorpor[eé]|incorporad[oa]s?|inclu[ií]|inclu(?:id[oa]s?|y[oó])|sum[eé]|sumad[oa]s?|ajust[eé]|ajustad[oa]s?|asign[eé]|asignad[oa]s?|anot[eé]|anotad[oa]s?|modifiqu[eé]|modificad[oa]s?|a[ñn]adiendo|ha\s+sido\s+(?:ajustad|actualizad|registrad|guardad|a[ñn]adid|modificad)|han\s+sido\s+(?:ajustad|actualizad|registrad)|list[oa]\s*✅|hecho\s*✅)(?![a-záéíóúñ])/i;
/** La IA está preguntando / ofreciendo, no afirmando. */
const ASKING_RE = /\b(deseas|quieres|prefieres|confirmas|te\s+gustar[ií]a|puedo|proced(?:emos|o)|\bser[íi]a\b)\b/i;

export function aiClaimsSuccess(text: string): boolean {
  if (!text) return false;
  const hasClaim = CLAIM_RE.test(text) || (/✅/.test(text) && /\b(servicio|orden|veh[ií]culo|producto|precio|stock|cita|cliente|venta|registr)/i.test(text));
  return hasClaim && !ASKING_RE.test(text);
}

/** ¿El mensaje del operador es una confirmación afirmativa? */
export function esAfirmacion(text: string): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[.,!¡¿?]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(s[ií]|dale+|ok|okay|okey|correcto|confirmo|confirmado|de acuerdo|hazlo|apl[ií]calo|proc[eé]d[ea]|procede|listo|exacto|as[ií] es|va|vale|perfecto|adelante)(?![a-záéíóúñ])/i.test(t);
}

/** ¿El mensaje del operador cancela la acción pendiente? */
export function esNegacion(text: string): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[.,!¡¿?]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(no|nel|negativo|cancela|cancelar|dej[ao]lo|olv[ií]dalo|mejor no|as[ií] no|detente|stop|espera|aun no|todav[ií]a no)(?![a-záéíóúñ])/i.test(t);
}

export interface AccionPendiente {
  tipo: string;            // 'stock_upsert' | 'stock_delete' | ...
  payloadRaw: string;      // contenido crudo del tag (entre : y ])
  resumen: string;         // resumen legible que se le mostró al operador
  sedeId?: string;
  creadoAt: number;        // Date.now()
}

const PENDIENTE_TTL_MS = 10 * 60 * 1000;

export function pendienteVigente(p?: AccionPendiente | null): boolean {
  return !!p && typeof p.creadoAt === 'number' && (Date.now() - p.creadoAt) < PENDIENTE_TTL_MS;
}

export interface ReconcileInput {
  /** Texto de la IA ya sin tags de acción. */
  texto: string;
  /** Módulos cuya escritura pidió la IA pero el rol NO tiene permiso. */
  modulosDenegados: string[];
  /** ¿Alguna acción se aplicó realmente? */
  algoAplicado: boolean;
  /** ¿Alguna acción falló con error? */
  algunError: boolean;
}

/**
 * Ajusta el texto final para que jamás afirme un éxito que no ocurrió.
 * - Si la IA dijo "registré/actualicé..." y no se aplicó nada → se elimina esa
 *   afirmación y se explica el estado real.
 */
export function reconciliarTexto(input: ReconcileInput): string {
  let out = (input.texto || '').trim();
  const claim = aiClaimsSuccess(out);

  if (input.modulosDenegados.length > 0) {
    if (claim) out = quitarLineasDeExito(out);
    const lista = Array.from(new Set(input.modulosDenegados)).join(', ');
    out += `\n\n🔒 Tu rol no tiene permiso para modificar: ${lista}. No se realizó ningún cambio en el sistema. Solicítalo a un administrador.`;
    return out.trim();
  }

  if (claim && !input.algoAplicado) {
    out = quitarLineasDeExito(out);
    if (input.algunError) {
      out += `\n\n❌ No se pudo completar la acción en el sistema. Vuelve a intentarlo o repórtalo a un administrador.`;
    } else {
      out += `\n\n⚠️ No apliqué ningún cambio: faltan datos o la acción requiere confirmación. Dime exactamente qué registrar y confírmame para proceder.`;
    }
  }
  return out.trim();
}

/** Elimina líneas que suenan a confirmación de éxito, dejando el resto del mensaje. */
export function quitarLineasDeExito(text: string): string {
  return text
    .split('\n')
    .filter(l => {
      const t = l.trim();
      if (!t) return true;
      if (/^✅/.test(t)) return false;
      if (CLAIM_RE.test(t) && !ASKING_RE.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Resumen legible de un cambio de precio/stock para el diálogo de confirmación. */
export function resumenCambioStock(opts: {
  nombre: string;
  existe: boolean;
  precioAnterior?: number | null;
  precioNuevo?: number | null;
  stockAnterior?: number | null;
  stockNuevo?: number | null;
}): string {
  const { nombre, existe } = opts;
  if (!existe) {
    return `Vas a CREAR el producto "${nombre}"${opts.precioNuevo != null ? ` con precio $${opts.precioNuevo}` : ''}${opts.stockNuevo != null ? ` y stock ${opts.stockNuevo}` : ''}.`;
  }
  const cambios: string[] = [];
  if (opts.precioNuevo != null && opts.precioNuevo !== opts.precioAnterior) {
    cambios.push(`precio $${opts.precioAnterior ?? '—'} → $${opts.precioNuevo}`);
  }
  if (opts.stockNuevo != null && opts.stockNuevo !== opts.stockAnterior) {
    cambios.push(`stock ${opts.stockAnterior ?? '—'} → ${opts.stockNuevo}`);
  }
  if (cambios.length === 0) return `Vas a actualizar "${nombre}" (sin cambios de precio ni stock detectados).`;
  return `Vas a actualizar "${nombre}": ${cambios.join(', ')}.`;
}

/** ¿El cambio de precio es tan grande que conviene remarcarlo? (>60% arriba o abajo) */
export function cambioPrecioSospechoso(anterior?: number | null, nuevo?: number | null): boolean {
  if (anterior == null || nuevo == null || anterior <= 0 || nuevo <= 0) return false;
  const ratio = nuevo / anterior;
  return ratio >= 1.6 || ratio <= 0.4;
}
