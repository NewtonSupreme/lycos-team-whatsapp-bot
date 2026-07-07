import type { Metadata } from 'next';
import './globals.css';
import LoadingScreen from '@/components/layout/LoadingScreen';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { AlertToastBridge } from '@/components/providers/AlertToastBridge';

export const metadata: Metadata = {
  title: 'Lycos Team — Sistema de Gestión Automotriz',
  description: 'Plataforma SaaS completa para taller automotriz.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{
          __html: `(function(){var d=document;function r(){var a=d.querySelectorAll('[bis_skin_checked]');for(var i=0;i<a.length;i++){a[i].removeAttribute('bis_skin_checked')}}if(typeof MutationObserver!=='undefined'){var o=new MutationObserver(function(m){m.forEach(function(mut){if(mut.type==='attributes'&&mut.attributeName==='bis_skin_checked'){mut.target.removeAttribute('bis_skin_checked')}})});o.observe(d.documentElement,{attributes:true,subtree:true,attributeFilter:['bis_skin_checked']});r();setTimeout(function(){o.disconnect()},3000)}else{r()}})();`
        }} />
        
        {/* PWA Support */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b141a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Lycos CRM" />
        <link rel="apple-touch-icon" href="/Nuevo_Lycos_LOGO copy.png" />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LoadingScreen />
          {children}
          <Toaster />
          <AlertToastBridge />
        </ThemeProvider>
      </body>
    </html>
  );
}
