'use client';

import Link from 'next/link';
import {
  Calendar, Car, FileSpreadsheet, MessageSquare, Receipt, ShoppingCart, UserPlus, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import type { Permisos } from '@/types';

interface Action {
  href: string;
  label: string;
  icon: LucideIcon;
  permKey?: keyof Permisos;
}

/**
 * Lo que de verdad se hace veinte veces al día, en el orden del flujo del
 * taller: entra un cliente, se registra el carro, se abre la orden, se cobra.
 */
const ACTIONS: readonly Action[] = [
  { href: '/dashboard/clientes', label: 'Nuevo cliente', icon: UserPlus, permKey: 'clientes' },
  { href: '/dashboard/vehiculos', label: 'Registrar vehículo', icon: Car, permKey: 'vehiculos' },
  { href: '/dashboard/servicios', label: 'Orden de servicio', icon: Wrench, permKey: 'servicios' },
  { href: '/dashboard/agenda', label: 'Agendar cita', icon: Calendar, permKey: 'agenda' },
  { href: '/dashboard/silenciadores', label: 'Cobrar venta', icon: ShoppingCart, permKey: 'ventas' },
  { href: '/dashboard/presupuestos', label: 'Nuevo presupuesto', icon: FileSpreadsheet, permKey: 'presupuestos' },
  { href: '/dashboard/facturas', label: 'Generar factura', icon: Receipt, permKey: 'ventas' },
  { href: '/dashboard/whatsapp', label: 'Abrir WhatsApp', icon: MessageSquare, permKey: 'whatsapp' },
];

export default function QuickActions() {
  const { can } = useRolePermissions();
  const visible = ACTIONS.filter(a => !a.permKey || can(a.permKey));

  if (visible.length === 0) return null;

  return (
    <nav aria-label="Acciones rápidas" className="grid grid-cols-2 gap-2">
      {visible.map(({ href, label, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:border-border-strong hover:bg-accent"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
