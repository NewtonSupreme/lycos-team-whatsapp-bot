/**
 * Tipos de datos para el módulo de Suspensión y Kill Switch del Sistema Lycos.
 */

export interface EstadoSuspension {
  suspendido: boolean;
  motivo?: string;
  fecha_suspension?: string | null;
  suspendido_por?: string | null;
  updated_at?: string;
}

export interface RespuestaSuspension {
  ok: boolean;
  estado: EstadoSuspension;
  mensaje?: string;
  error?: string;
}

export interface OpcionesCambioSuspension {
  suspendido: boolean;
  usuario: string;
  motivo?: string;
}
