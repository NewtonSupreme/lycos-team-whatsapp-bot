import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = '$') {
  return `${currency}${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getLocalISODate(date?: Date) {
  const d = date || new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(date));
}

export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins}m`;
  if (hours < 24) return `hace ${hours}h`;
  if (days < 7) return `hace ${days}d`;
  return formatDate(date);
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const tipoServicioLabel: Record<string, string> = {
  mecanica: 'Mecánica',
  electronica: 'Electrónica',
  cerrajeria: 'Cerrajería',
  diagnostico: 'Diagnóstico',
  motor: 'Motor',
  emergencia: 'Emergencia',
  otro: 'Otro',
};

export const estadoServicioLabel: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En Proceso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

export const estadoVehiculoLabel: Record<string, string> = {
  activo: 'Activo',
  en_servicio: 'En Servicio',
  listo: 'Listo',
  inactivo: 'Inactivo',
};

export const tipoServicioColor: Record<string, string> = {
  mecanica: 'text-blue-400 bg-blue-400/10',
  electronica: 'text-purple-400 bg-purple-400/10',
  cerrajeria: 'text-yellow-400 bg-yellow-400/10',
  diagnostico: 'text-cyan-400 bg-cyan-400/10',
  motor: 'text-red-400 bg-red-400/10',
  emergencia: 'text-orange-400 bg-orange-400/10',
  otro: 'text-gray-400 bg-gray-400/10',
};

export type DesgloseItem = { descripcion: string; cantidad: number; precio_unitario: number; total: number };

/**
 * Converts a service description string like
 * "Revisión de tren delantero: Bujes de meseta grandes dañados + Base de caja trasera dañada"
 * into individual line items for invoicing/desglose.
 * – Text before ": " → labor/service line (gets totalPrecio)
 * – Each "+" component → separate repair/part line at $0 (to be priced later)
 */
export function parseDescripcionItems(descripcion: string, totalPrecio = 0): DesgloseItem[] {
  const raw = (descripcion || '').trim();
  if (!raw) return [{ descripcion: 'Servicio General', cantidad: 1, precio_unitario: totalPrecio, total: totalPrecio }];

  const colonIdx = raw.indexOf(': ');
  let serviceLabel = '';
  let componentStr = raw;

  if (colonIdx > 0) {
    serviceLabel = raw.substring(0, colonIdx).trim();
    componentStr = raw.substring(colonIdx + 2).trim();
  }

  const parts = componentStr.split(' + ').map(p => p.trim()).filter(Boolean);

  if (parts.length <= 1 && !serviceLabel) {
    return [{ descripcion: raw, cantidad: 1, precio_unitario: totalPrecio, total: totalPrecio }];
  }

  const result: DesgloseItem[] = [];
  if (serviceLabel) {
    result.push({ descripcion: serviceLabel, cantidad: 1, precio_unitario: totalPrecio, total: totalPrecio });
    for (const part of parts) result.push({ descripcion: part, cantidad: 1, precio_unitario: 0, total: 0 });
  } else {
    for (let i = 0; i < parts.length; i++) {
      const p = i === 0 ? totalPrecio : 0;
      result.push({ descripcion: parts[i], cantidad: 1, precio_unitario: p, total: p });
    }
  }
  return result;
}

export const estadoColor: Record<string, string> = {
  pendiente: 'text-yellow-400 bg-yellow-400/10',
  en_proceso: 'text-blue-400 bg-blue-400/10',
  finalizado: 'text-green-400 bg-green-400/10',
  cancelado: 'text-red-400 bg-red-400/10',
  activo: 'text-green-400 bg-green-400/10',
  en_servicio: 'text-blue-400 bg-blue-400/10',
  listo: 'text-emerald-400 bg-emerald-400/10',
  inactivo: 'text-gray-400 bg-gray-400/10',
  confirmada: 'text-green-400 bg-green-400/10',
  completada: 'text-emerald-400 bg-emerald-400/10',
  bot: 'text-violet-400 bg-violet-400/10',
  humano: 'text-orange-400 bg-orange-400/10',
  cerrada: 'text-gray-400 bg-gray-400/10',
  activa: 'text-green-400 bg-green-400/10',
};
