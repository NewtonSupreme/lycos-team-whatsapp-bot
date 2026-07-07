'use client';

import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * Toaster premium global para Lycos CRM.
 * Estilo glass/dark coherente con el resto del dashboard, colores ricos
 * para éxito/error/advertencia y animaciones suaves.
 */
export function Toaster(props: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <SonnerToaster
      theme={theme as ToasterProps['theme']}
      position="top-right"
      richColors
      closeButton
      expand
      duration={4000}
      gap={10}
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            'group toast rounded-2xl border backdrop-blur-xl shadow-2xl !font-sans',
          title: 'text-sm font-bold',
          description: 'text-xs opacity-90',
          actionButton: 'rounded-lg text-xs font-bold',
          cancelButton: 'rounded-lg text-xs font-bold',
          closeButton: 'rounded-lg',
        },
        style: {
          fontFamily: 'DM Sans, sans-serif',
        },
      }}
      {...props}
    />
  );
}
