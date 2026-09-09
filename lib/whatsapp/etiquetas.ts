/**
 * La etiqueta que lleva cada conversación en la lista.
 *
 * Sirve para saber, sin abrir el chat, cuál espera un presupuesto y cuál tiene
 * el carro dentro. Sale de lo que hay en el sistema —órdenes abiertas, citas,
 * presupuestos, ventas— y NO del texto del mensaje: buscar palabras da «cita» a
 * quien escribió «no puedo ir a la cita», que es justo lo contrario.
 *
 * Solo se pone UNA etiqueta, la más urgente. Tres chips en una fila de lista no
 * se leen, y si todo está marcado nada destaca.
 */

export type Etiqueta = 'en_taller' | 'cita' | 'presupuesto' | 'venta' | 'cliente' | 'nuevo';

export interface MetaEtiqueta {
  id: Etiqueta;
  label: string;
  /** Clases del chip; los colores son los mismos del resto del sistema. */
  clase: string;
  ayuda: string;
}

export const ETIQUETAS: Record<Etiqueta, MetaEtiqueta> = {
  en_taller: {
    id: 'en_taller', label: 'En taller',
    clase: 'bg-orange-500/12 text-orange-600 dark:text-orange-400 border-orange-500/25',
    ayuda: 'Tiene una orden de servicio abierta ahora mismo.',
  },
  cita: {
    id: 'cita', label: 'Cita',
    clase: 'bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/25',
    ayuda: 'Tiene una cita de hoy en adelante.',
  },
  presupuesto: {
    id: 'presupuesto', label: 'Presupuesto',
    clase: 'bg-violet-500/12 text-violet-600 dark:text-violet-400 border-violet-500/25',
    ayuda: 'Tiene un presupuesto sin cerrar.',
  },
  venta: {
    id: 'venta', label: 'Venta',
    clase: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    ayuda: 'Le compró en los últimos 30 días.',
  },
  cliente: {
    id: 'cliente', label: 'Cliente',
    clase: 'bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/25',
    ayuda: 'Cliente registrado, sin nada pendiente.',
  },
  nuevo: {
    id: 'nuevo', label: 'Nuevo',
    clase: 'bg-primary/12 text-primary border-primary/25',
    ayuda: 'Este número todavía no tiene ficha de cliente.',
  },
};

/** Los conjuntos que devuelve `/api/whatsapp/etiquetas`, ya como `Set`. */
export interface IndiceEtiquetas {
  enTaller: Set<string>;
  conCita: Set<string>;
  conPresupuesto: Set<string>;
  conVenta: Set<string>;
}

export const indiceVacio = (): IndiceEtiquetas => ({
  enTaller: new Set(), conCita: new Set(), conPresupuesto: new Set(), conVenta: new Set(),
});

/**
 * Decide la etiqueta de una conversación.
 *
 * El orden es de más a menos urgente: un carro dentro del taller manda sobre
 * una cita futura, y una cita sobre un presupuesto. Así el primer vistazo a la
 * lista dice qué hay que atender antes.
 */
export function etiquetaDe(clienteId: string | null | undefined, i: IndiceEtiquetas): Etiqueta {
  if (!clienteId) return 'nuevo';
  if (i.enTaller.has(clienteId)) return 'en_taller';
  if (i.conCita.has(clienteId)) return 'cita';
  if (i.conPresupuesto.has(clienteId)) return 'presupuesto';
  if (i.conVenta.has(clienteId)) return 'venta';
  return 'cliente';
}
