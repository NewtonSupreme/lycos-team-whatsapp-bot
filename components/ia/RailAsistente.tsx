'use client';

import {
  BarChart3, BookOpen, CalendarDays, ChevronRight, FileText, Headphones,
  HelpCircle, Lightbulb, MessageCircle, Package, PlayCircle, Scissors,
  Settings, Users, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEMAS, type TemaId } from '@/lib/ia/guias';

/**
 * Un icono de línea por tema, con su tinte.
 *
 * Van con iconos y no con emojis a propósito: los emojis los dibuja cada
 * sistema operativo a su manera, así que el mismo tema se ve distinto en
 * Windows, en el móvil y en el Mac. Un icono vectorial se ve igual en todos y
 * hereda el color de la marca.
 */
const ICONO_TEMA: Record<TemaId, { icono: React.ReactNode; tinte: string }> = {
  clientes: { icono: <Users className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  servicios: { icono: <Scissors className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
  ventas: { icono: <Wallet className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#fff1e7] text-[#f97316]' },
  facturacion: { icono: <FileText className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
  inventario: { icono: <Package className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e4f6f6] text-[#0d9488]' },
  agenda: { icono: <CalendarDays className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#fdeaea] text-[#dc2626]' },
  nomina: { icono: <Wallet className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#fdf5e2] text-[#ca8a04]' },
  reportes: { icono: <BarChart3 className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  whatsapp: { icono: <MessageCircle className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
  configuracion: { icono: <Settings className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#eef1f5] text-[#5b616e]' },
};

/**
 * Consejos que se rotan por día del año.
 *
 * Todos apuntan a algo que el sistema hace de verdad; nada de frases genéricas
 * de asistente. Si un consejo no se puede seguir, sobra.
 */
const CONSEJOS: readonly string[] = [
  'Puedes escribir tus preguntas en lenguaje natural. Por ejemplo: «Muéstrame las ventas de esta semana».',
  'Al cobrar en bolívares, revisa la tasa: el BCV y el de Binance P2P no dan lo mismo, y el reporte del día lo nota.',
  'Si un vehículo ya tiene una orden abierta, agrégale el trabajo en vez de crear otra: el sistema no permite duplicados.',
  'En Nómina → Sin asignar sale el trabajo que se cobró pero al que nadie le puso técnico.',
  'Una regla de comisión en 0 % coincide igual y deja el pago en cero, tapando cualquier otra. Revísalas.',
  'Desde WhatsApp puedes registrar un servicio con una foto de la placa y una nota de voz: el bot las combina.',
  'Para dar de baja a alguien, desactívalo en vez de borrarlo: así conserva su historial de trabajos y comisiones.',
  'La ficha del vehículo compara lo cobrado contra lo gastado renglón por renglón, y te da la utilidad real.',
];

export function consejoDelDia(): string {
  const dia = Math.floor(Date.now() / 86400000);
  return CONSEJOS[dia % CONSEJOS.length];
}

interface Props {
  onTema: (t: TemaId) => void;
  onGuiaPlataforma: () => void;
  onVideo: () => void;
  onFaq: () => void;
  onSoporte: () => void;
  /** Solo se ofrecen los temas de módulos a los que se tiene acceso. */
  puedeVer: (permiso?: string) => boolean;
}

/**
 * La columna derecha del asistente: los cuatro atajos, los temas y el consejo.
 *
 * Cada atajo hace algo real: la guía abre el índice completo, el vídeo abre el
 * tutorial que está en el servidor, las preguntas frecuentes son las guías más
 * consultadas y soporte abre WhatsApp con el número del taller.
 */
export default function RailAsistente({
  onTema, onGuiaPlataforma, onVideo, onFaq, onSoporte, puedeVer,
}: Props) {
  const atajos = [
    {
      icono: <BookOpen className="h-[19px] w-[19px]" aria-hidden />,
      tinte: 'text-[#2563eb]',
      titulo: 'Guía de la plataforma',
      pie: 'Explora todas las funciones',
      onClick: onGuiaPlataforma,
    },
    {
      icono: <PlayCircle className="h-[19px] w-[19px]" aria-hidden />,
      tinte: 'text-[#f97316]',
      titulo: 'Video tutorial',
      pie: 'Aprende paso a paso',
      onClick: onVideo,
    },
    {
      icono: <HelpCircle className="h-[19px] w-[19px]" aria-hidden />,
      tinte: 'text-[#7c3aed]',
      titulo: 'Preguntas frecuentes',
      pie: 'Resuelve dudas comunes',
      onClick: onFaq,
    },
    {
      icono: <Headphones className="h-[19px] w-[19px]" aria-hidden />,
      tinte: 'text-[#16a34a]',
      titulo: 'Contactar soporte',
      pie: 'Habla con un humano',
      onClick: onSoporte,
    },
  ];

  const temas = TEMAS.filter(t => puedeVer(t.id));

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto xl:w-[344px]">
      {/* ── Acciones rápidas ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <h2 className="mb-3 text-[15px] font-bold text-[#16181d]">Acciones rápidas</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {atajos.map(a => (
            <button
              key={a.titulo}
              onClick={a.onClick}
              className="flex flex-col items-start gap-1.5 rounded-lg border border-[#e8eaed] p-3 text-left transition-colors hover:border-[#f97316] hover:bg-[#fffaf6]"
            >
              <span className={a.tinte}>{a.icono}</span>
              <span className="block text-[12.5px] font-semibold leading-tight text-[#16181d]">{a.titulo}</span>
              <span className="block text-[10.5px] leading-tight text-[#8a909c]">{a.pie}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Temas sugeridos ──────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
        <header className="flex items-center gap-2 px-4 pb-1 pt-4">
          <h2 className="flex-1 text-[15px] font-bold text-[#16181d]">Temas sugeridos</h2>
          <button
            onClick={onGuiaPlataforma}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[#f97316] hover:underline"
          >
            Ver todos
            <ChevronRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        <ul className="px-2 py-2">
          {temas.map(t => {
            const ic = ICONO_TEMA[t.id];
            return (
              <li key={t.id}>
                <button
                  onClick={() => onTema(t.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#fafbfc]"
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', ic.tinte)}>
                    {ic.icono}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{t.titulo}</span>
                    <span className="block truncate text-[11px] text-[#8a909c]">{t.resumen}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#c3c8d0]" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>

        {temas.length === 0 && (
          <p className="px-4 py-6 text-center text-[12.5px] text-[#8a909c]">
            Tu rol no tiene acceso a ningún módulo con guía.
          </p>
        )}
      </section>

      {/* ── Consejo del día ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] p-4">
        <h2 className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-bold text-[#9a3412]">
          <Lightbulb className="h-4 w-4" aria-hidden />
          Consejo del día
        </h2>
        <p className="text-[12px] leading-relaxed text-[#9a5b2c]">{consejoDelDia()}</p>
      </section>
    </div>
  );
}
