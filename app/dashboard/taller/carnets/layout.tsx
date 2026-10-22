import { Barlow, Big_Shoulders } from 'next/font/google';

// Las mismas letras de la pantalla del taller: el carnet se dibuja con ellas.
const display = Big_Shoulders({ subsets: ['latin'], weight: ['800', '900'], variable: '--font-display', display: 'swap' });
const texto = Barlow({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-texto', display: 'swap' });

export default function LayoutCarnets({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${texto.variable} carnets-fuentes`}>{children}</div>;
}
