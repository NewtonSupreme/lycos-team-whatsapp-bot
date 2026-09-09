import { redirect } from 'next/navigation';

/**
 * Aquí vivió la maqueta del punto de venta mientras se fijaba el diseño.
 *
 * Ese diseño ya es el real y corre sobre datos de Supabase en
 * /dashboard/silenciadores, así que esta ruta solo redirige: dejar una maqueta
 * con datos inventados en pie invita a confundirla con el punto de venta.
 */
export default function NuevaVentaPage() {
  redirect('/dashboard/silenciadores');
}
