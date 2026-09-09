'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProveedorModales from '@/components/ui/modales/ProveedorModales';

/**
 * El proveedor de modales envuelve TODO el panel.
 *
 * Va aquí y no dentro de `DashboardLayout` porque las pantallas con armazón
 * propio —nómina, punto de venta, facturación— no pasan por él, y también
 * necesitan poder confirmar antes de borrar algo.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorModales>
      <DashboardLayout>{children}</DashboardLayout>
    </ProveedorModales>
  );
}
