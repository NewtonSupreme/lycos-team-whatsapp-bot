/** Piezas compartidas del panel de Configuración. */

export interface UsuarioConfig {
  id: string;
  username: string;
  nombre: string;
  email: string | null;
  rol: string;
  rolLabel: string;
  sede: string;
  activo: boolean;
  foto: string | null;
  telefono: string | null;
  creado: string;
  /** Última vez que entró de verdad, de `intentos_acceso`. */
  ultimoAcceso: string | null;
}

export interface RolConfig {
  nombre: string;
  label: string;
  descripcion: string;
  usuarios: number;
}

export interface KpisConfig {
  total: number;
  activos: number;
  rolesCreados: number;
  rolesDefinidos: number;
  altasEsteMes: number;
  variacionPct: number | null;
  ultimoAcceso: string | null;
  ultimoAccesoQuien: string | null;
  intentosFallidos24h: number;
  hayHistorialAccesos: boolean;
}

export interface Ajustes {
  seguridad: {
    dosFactores: boolean;
    avisoInicioSesion: boolean;
    bloqueoPorIntentos: boolean;
    intentosMaximos: number;
    expiraEnMinutos: number;
  };
  contrasenas: {
    minimoCaracteres: number;
    exigeMayuscula: boolean;
    exigeMinuscula: boolean;
    exigeNumero: boolean;
    exigeEspecial: boolean;
    caducaEnDias: number;
  };
  general: {
    nombreTaller: string;
    lema: string;
    moneda: string;
    zonaHoraria: string;
  };
}

export const TABS_CONFIG = [
  { id: 'general', label: 'General' },
  { id: 'usuarios', label: 'Usuarios y accesos' },
  { id: 'roles', label: 'Roles y permisos' },
  { id: 'taller', label: 'Taller' },
  { id: 'sucursales', label: 'Sucursales' },
  { id: 'cuentas', label: 'Cuentas bancarias' },
  { id: 'bot', label: 'Bot de WhatsApp' },
  { id: 'notificaciones', label: 'Notificaciones' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'respaldos', label: 'Respaldos' },
  { id: 'personalizacion', label: 'Personalización' },
  { id: 'planes', label: 'Planes' },
] as const;

export type TabConfig = typeof TABS_CONFIG[number]['id'];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "Hoy, 10:24" · "Ayer, 05:43" · "Hace 5 días" · "12 mar".
 *
 * Es como lo lee una persona: lo de hoy por la hora, lo de esta semana por los
 * días que hace, y lo viejo por su fecha. Un ISO crudo no dice nada de un
 * vistazo.
 */
export function cuando(iso: string | null | undefined): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const hoy = new Date();
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(d)) / 86400000);
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (dias === 0) return `Hoy, ${hora}`;
  if (dias === 1) return `Ayer, ${hora}`;
  if (dias < 7) return `Hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** Quita acentos para que "Rodriguez" encuentre a "Rodríguez". */
export const normaliza = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
