import React from 'react';
import { cn, estadoColor, tipoServicioColor, tipoServicioLabel, estadoServicioLabel } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  type?: 'estado' | 'tipo' | 'vehiculo' | 'conversacion';
  size?: 'sm' | 'md';
}

const labelMap: Record<string, Record<string, string>> = {
  estado: {
    pendiente: 'Pendiente', en_proceso: 'En taller', finalizado: 'Finalizado',
    cancelado: 'Cancelado', confirmada: 'Confirmada', completada: 'Completada',
  },
  tipo: tipoServicioLabel,
  vehiculo: { activo: 'Activo', en_servicio: 'En Servicio', listo: 'Listo', inactivo: 'Inactivo' },
  conversacion: { activa: 'Activa', cerrada: 'Cerrada', bot: 'Bot IA', humano: 'Humano' },
};

export default function StatusBadge({ status, type = 'estado', size = 'sm' }: StatusBadgeProps) {
  const colorClass = type === 'tipo' ? tipoServicioColor[status] : estadoColor[status];
  const label = labelMap[type]?.[status] || status;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
      colorClass || 'text-gray-400 bg-gray-400/10'
    )}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
