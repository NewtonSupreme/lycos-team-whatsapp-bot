import type { Metadata } from 'next';
import './globals.css';
import LoadingScreen from '@/components/layout/LoadingScreen';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Lycos Team — Sistema de Gestión Automotriz',
  description: 'Plataforma SaaS completa para taller automotriz.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <LoadingScreen />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
