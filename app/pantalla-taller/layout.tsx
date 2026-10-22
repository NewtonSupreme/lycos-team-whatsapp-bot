import type { Metadata, Viewport } from 'next';
import { Barlow, Big_Shoulders } from 'next/font/google';

/*
 * La pantalla del taller tiene su propia tipografía: se lee a varios metros,
 * en una TV, con luz de taller. Big Shoulders (condensada, de cartel) para
 * placas, montos y títulos; Barlow para el texto, que es legible a lo lejos.
 */
const display = Big_Shoulders({ subsets: ['latin'], weight: ['600', '800', '900'], variable: '--font-display', display: 'swap' });
const texto = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-texto', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pantalla del taller · Lycos Team',
  description: 'Vehículos en curso y carga de trabajos de los mecánicos',
};

export const viewport: Viewport = { themeColor: '#0b0d10' };

export default function LayoutPantallaTaller({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${texto.variable} pantalla-taller`}>
      <style>{`
        .pantalla-taller {
          --fondo: #0b0d10; --panel: #13171d; --panel-2: #1a1f27; --linea: rgba(255,255,255,.08);
          --tinta: #f2efe9; --tenue: #9aa3ad; --apagado: #5f6873;
          --naranja: #ff7a1a; --amarillo: #ffc61a; --cian: #2fd3e6; --verde: #34d17a; --rojo: #ff4d4d;
          font-family: var(--font-texto), system-ui, sans-serif;
          background: var(--fondo); color: var(--tinta); color-scheme: dark;
        }
        .pantalla-taller .display { font-family: var(--font-display), var(--font-texto), sans-serif; letter-spacing: .01em; }
        /* Piso del taller: retícula tenue y un halo naranja arriba. */
        .pantalla-taller .piso {
          background:
            radial-gradient(1200px 500px at 15% -10%, rgba(255,122,26,.10), transparent 60%),
            radial-gradient(900px 400px at 100% 0%, rgba(47,211,230,.06), transparent 60%),
            linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px) 0 0 / 48px 48px,
            linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px) 0 0 / 48px 48px,
            var(--fondo);
        }
        .pantalla-taller .franja { background: repeating-linear-gradient(-45deg, var(--naranja) 0 14px, #111 14px 28px); }
        @keyframes pt-entra { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes pt-sube { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @keyframes pt-pulso { 0%,100% { box-shadow: 0 0 0 0 rgba(52,209,122,.55); } 50% { box-shadow: 0 0 0 10px rgba(52,209,122,0); } }
        .pantalla-taller .entra { animation: pt-entra .45s cubic-bezier(.2,.7,.2,1) both; }
        .pantalla-taller .sube { animation: pt-sube .35s cubic-bezier(.2,.7,.2,1) both; }
        .pantalla-taller .pulso { animation: pt-pulso 2.2s ease-in-out infinite; }
        @keyframes pt-sacude { 0%,100% { transform: none; } 20%,60% { transform: translateX(-12px); } 40%,80% { transform: translateX(12px); } }
        .pantalla-taller .pt-sacude { animation: pt-sacude .4s ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
          .pantalla-taller .entra, .pantalla-taller .sube, .pantalla-taller .pulso, .pantalla-taller .pt-sacude { animation: none; }
        }
        .pantalla-taller ::-webkit-scrollbar { width: 10px; height: 10px; }
        .pantalla-taller ::-webkit-scrollbar-thumb { background: #2a313b; border-radius: 10px; }
      `}</style>
      {children}
    </div>
  );
}
