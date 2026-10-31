'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProveedorModales from '@/components/ui/modales/ProveedorModales';
import AlertaPagoProveedor from '@/components/alertas/AlertaPagoProveedor';
import AlertaAtencionCliente from '@/components/alertas/AlertaAtencionCliente';
import ActivadorPush from '@/components/notificaciones/ActivadorPush';

/**
 * El proveedor de modales envuelve TODO el panel.
 *
 * Va aquí y no dentro de `DashboardLayout` porque las pantallas con armazón
 * propio —nómina, punto de venta, facturación— no pasan por él, y también
 * necesitan poder confirmar antes de borrar algo.
 *
 * La alerta de pagos a proveedores va al mismo nivel por la misma razón: tiene
 * que saltar en cualquier pantalla del panel, no solo en las que llevan el
 * armazón normal. Se monta una sola vez, así que al navegar entre pantallas no
 * vuelve a preguntar —solo al recargar, que es lo que se pidió—.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorModales>
      <DashboardLayout>{children}</DashboardLayout>
      <AlertaPagoProveedor />
      <AlertaAtencionCliente />
      <ActivadorPush />
    </ProveedorModales>
  );
}
