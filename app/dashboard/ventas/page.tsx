import { redirect } from 'next/navigation';

/**
 * La pantalla de ventas se retiró: sus funciones —abonos, saldos y detalle de
 * venta— viven en el punto de venta.
 *
 * Queda como redirección y no borrada del todo para que ningún enlace guardado
 * ni marcador quede muerto.
 */
export default function VentasPage() {
  redirect('/dashboard/silenciadores');
}
