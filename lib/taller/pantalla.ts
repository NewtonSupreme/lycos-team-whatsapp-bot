// ─────────────────────────────────────────────────────────────────────────────
// Pantalla del taller (TV o PC del piso).
//
// La usa la cuenta «Taller»: muestra los vehículos en Entrada y En taller y deja
// que cada mecánico cargue lo que va haciendo —mano de obra, repuesto u otro—
// con su precio. Los mecánicos no son usuarios del sistema: eligen su nombre en
// la pantalla y el trabajo queda a su nombre en la orden y en la nómina.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS_PANTALLA = ['pendiente', 'confirmada', 'en_revision', 'en_proceso', 'en_progreso'] as const;
export const ESTADOS_ENTRADA = ['pendiente', 'confirmada'];

export type TipoCarga = 'mano_obra' | 'repuesto' | 'otro';

export interface RenglonPantalla {
  descripcion: string;
  cantidad: number;
  total: number;
  esManoObra: boolean;
}

export interface OrdenPantalla {
  id: string;
  placa: string;
  vehiculo: string;
  cliente: string;
  trabajo: string;
  estado: string;
  columna: 'entrada' | 'taller';
  desde: string;          // created_at
  movida: string;         // updated_at
  renglones: RenglonPantalla[];
  total: number;
  encargados: Array<{ id: string | null; nombre: string }>;
  ultimo: string | null;  // último movimiento de la bitácora
  puesto: string | null;
}

export interface PersonaPantalla { id: string; nombre: string; corto: string; foto: string | null }

export interface TableroTaller {
  ordenes: OrdenPantalla[];
  personal: PersonaPantalla[];
  sugerencias: Array<{ descripcion: string; precio: number; veces: number }>;
  generado: string;
}

/** «María José Pérez» → «María José P.»: en una TV del taller basta con eso. */
export function nombreCorto(nombre: string): string {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return p[0] || 'Cliente';
  if (p.length === 2) return `${p[0]} ${p[1][0]}.`;
  return `${p[0]} ${p[1]} ${p[2][0]}.`;
}
