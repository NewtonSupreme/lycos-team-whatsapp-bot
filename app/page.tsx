import { redirect } from 'next/navigation';

/**
 * La redirección raíz es manejada por el middleware.
 * Si hay sesión, el middleware redirige a /dashboard.
 * Si no hay sesión, el middleware redirige a /login.
 */
export default function Home() { 
  redirect('/dashboard'); 
}
