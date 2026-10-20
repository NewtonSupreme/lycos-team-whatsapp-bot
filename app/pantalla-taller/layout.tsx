import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pantalla del taller · Lycos Team',
  description: 'Vehículos en curso y carga de trabajos de los mecánicos',
};

export default function LayoutPantallaTaller({ children }: { children: React.ReactNode }) {
  return children;
}
