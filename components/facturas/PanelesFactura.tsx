'use client';

import { CreditCard, FileSpreadsheet, FileText, Link2, PieChart, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLORES, METODO_LABEL, bs, type ResumenFacturas } from './tipos';

/**
 * Los tres paneles del pie: cómo pagaron, en qué moneda y qué documentos
 * cuelgan de las facturas.
 *
 * Todo sale del mes en curso. Cuando un panel no tiene nada que enseñar lo dice
 * en vez de pintar un gráfico vacío que se lee como si estuviera roto.
 */
export default function PanelesFactura({
  metodos, monedas, relacionados, onIr,
}: {
  metodos: ResumenFacturas['metodos'];
  monedas: ResumenFacturas['monedas'];
  relacionados: ResumenFacturas['relacionados'];
  onIr: (ruta: string) => void;
}) {
  return (
    <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
      {/* ── Métodos de pago ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#16181d]">
          <CreditCard className="h-4 w-4 text-[#f97316]" aria-hidden />
          Métodos de pago (este mes)
        </h2>

        {metodos.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[#8a909c]">
            Ninguna factura de este mes tiene el método de pago clasificado.
          </p>
        ) : (
          <ul className="space-y-2">
            {metodos.slice(0, 6).map((m, i) => (
              <li key={m.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-[9px] w-[9px] shrink-0 rounded-sm"
                    style={{ background: COLORES[i % COLORES.length] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#3d4350]">
                    {METODO_LABEL[m.id] || m.id}
                  </span>
                  <span className="num shrink-0 text-[12px] font-semibold text-[#16181d]">{bs(m.monto)}</span>
                  <span className="num w-[34px] shrink-0 text-right text-[11px] text-[#8a909c]">{m.pct}%</span>
                </div>
                <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#f2f3f5]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(m.pct, 1.5)}%`, background: COLORES[i % COLORES.length] }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Ventas por moneda ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#16181d]">
          <PieChart className="h-4 w-4 text-[#f97316]" aria-hidden />
          Ventas por moneda
        </h2>

        {monedas.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[#8a909c]">Sin facturas este mes.</p>
        ) : (
          <div className="flex items-center gap-4">
            <Anillo partes={monedas.map((m, i) => ({ pct: m.pct, color: COLORES[i % COLORES.length] }))} />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {monedas.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span
                    className="h-[9px] w-[9px] shrink-0 rounded-full"
                    style={{ background: COLORES[i % COLORES.length] }}
                    aria-hidden
                  />
                  <span className="w-[30px] shrink-0 text-[11.5px] font-semibold text-[#16181d]">{m.id}</span>
                  <span className="num min-w-0 flex-1 truncate text-[11.5px] text-[#5b616e]">{bs(m.monto)}</span>
                  <span className="num shrink-0 text-[11.5px] font-semibold text-[#16181d]">{m.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Documentos relacionados ────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#16181d]">
          <Link2 className="h-4 w-4 text-[#f97316]" aria-hidden />
          Documentos relacionados
        </h2>

        <div className="grid grid-cols-3 gap-2.5">
          <Doc
            icono={<FileSpreadsheet className="h-[19px] w-[19px]" aria-hidden />}
            tinte="bg-[#e7f0fe] text-[#2563eb]"
            label="Presupuestos"
            n={relacionados.presupuestos}
            onClick={() => onIr('/dashboard/presupuestos')}
          />
          <Doc
            icono={<FileText className="h-[19px] w-[19px]" aria-hidden />}
            tinte="bg-[#f0eafc] text-[#7c3aed]"
            label="Órdenes de servicio"
            n={relacionados.servicios}
            onClick={() => onIr('/dashboard/servicios')}
          />
          <Doc
            icono={<StickyNote className="h-[19px] w-[19px]" aria-hidden />}
            tinte="bg-[#fdeaea] text-[#dc2626]"
            label="Notas de crédito"
            n={relacionados.notasCredito}
          />
        </div>

        <p className="mt-3 text-[11px] leading-snug text-[#9ba1ab]">
          Cada factura recuerda de dónde salió. Toca un grupo para abrir su módulo.
        </p>
      </section>
    </div>
  );
}

function Doc({
  icono, tinte, label, n, onClick,
}: {
  icono: React.ReactNode; tinte: string; label: string; n: number; onClick?: () => void;
}) {
  const Etiqueta = onClick ? 'button' : 'div';
  return (
    <Etiqueta
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg border border-[#e8eaed] p-3 text-center transition-colors',
        onClick && 'hover:border-[#f97316] hover:bg-[#fffaf6]',
      )}
    >
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tinte)}>{icono}</span>
      <span className="text-[11px] font-medium leading-tight text-[#3d4350]">{label}</span>
      <span className="num text-[15px] font-extrabold text-[#16181d]">{n}</span>
    </Etiqueta>
  );
}

/**
 * Anillo dibujado a mano con `stroke-dasharray`.
 *
 * No hace falta una librería de gráficos para tres porciones, y una menos es
 * un kilo menos de JavaScript que carga el navegador.
 */
function Anillo({ partes }: { partes: { pct: number; color: string }[] }) {
  const R = 34;
  const C = 2 * Math.PI * R;

  // El desplazamiento de cada porción se calcula ANTES de pintar. Acumularlo
  // dentro del `map` sería mutar durante el render, y React no garantiza que
  // ese recorrido ocurra una sola vez.
  const arcos = partes.reduce<{ pct: number; color: string; desde: number }[]>((acc, p) => {
    const desde = acc.length === 0 ? 0 : acc[acc.length - 1].desde + acc[acc.length - 1].pct;
    return [...acc, { ...p, desde }];
  }, []);

  return (
    <svg
      viewBox="0 0 88 88"
      className="h-[88px] w-[88px] shrink-0 -rotate-90"
      role="img"
      aria-label={`Reparto por moneda: ${partes.map(p => `${p.pct}%`).join(', ')}`}
    >
      <circle cx="44" cy="44" r={R} fill="none" stroke="#f2f3f5" strokeWidth="14" />
      {arcos.map((a, i) => {
        const largo = (a.pct / 100) * C;
        return (
          <circle
            key={i}
            cx="44" cy="44" r={R}
            fill="none"
            stroke={a.color}
            strokeWidth="14"
            strokeDasharray={`${largo} ${C - largo}`}
            strokeDashoffset={-(a.desde / 100) * C}
          />
        );
      })}
    </svg>
  );
}
