'use client';

import { AlertTriangle, Clock, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cuando, type KpisConfig as Kpis } from './tipos';

/**
 * Las cinco cifras de cabecera del panel.
 *
 * Todas salen de datos reales. El último acceso y los intentos fallidos vienen
 * del registro de accesos, que es nuevo: mientras no haya historia lo dicen en
 * vez de mostrar un cero que se lee como "nadie ha fallado nunca".
 */
export default function KpisConfig({ k }: { k: Kpis }) {
  const pctActivos = k.total > 0 ? Math.round((k.activos / k.total) * 100) : 0;

  const tarjetas = [
    {
      icono: <Users className="h-[18px] w-[18px]" aria-hidden />,
      tinte: 'bg-[#e7f0fe] text-[#2563eb]',
      titulo: 'Usuarios totales',
      valor: String(k.total),
      pie: k.altasEsteMes > 0
        ? `↑ ${k.altasEsteMes} alta${k.altasEsteMes === 1 ? '' : 's'} este mes`
        : 'Sin altas este mes',
      pieTono: k.altasEsteMes > 0 ? 'text-[#16a34a]' : 'text-[#9ba1ab]',
    },
    {
      icono: <UserCheck className="h-[18px] w-[18px]" aria-hidden />,
      tinte: 'bg-[#e8f7ee] text-[#16a34a]',
      titulo: 'Usuarios activos',
      valor: String(k.activos),
      pie: `${pctActivos}% del total`,
      pieTono: 'text-[#16a34a]',
    },
    {
      icono: <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />,
      tinte: 'bg-[#f0eafc] text-[#7c3aed]',
      titulo: 'Roles en uso',
      valor: String(k.rolesCreados),
      pie: `${k.rolesDefinidos} definidos`,
      pieTono: 'text-[#9ba1ab]',
    },
    {
      icono: <Clock className="h-[18px] w-[18px]" aria-hidden />,
      tinte: 'bg-[#e4f6f6] text-[#0d9488]',
      titulo: 'Último acceso',
      valor: k.ultimoAcceso ? cuando(k.ultimoAcceso) : 'Sin registro',
      pie: k.ultimoAccesoQuien || (k.hayHistorialAccesos ? '—' : 'Se registra desde ahora'),
      pieTono: 'text-[#9ba1ab]',
      pequeno: true,
    },
    {
      icono: <AlertTriangle className="h-[18px] w-[18px]" aria-hidden />,
      tinte: k.intentosFallidos24h > 0 ? 'bg-[#fdeaea] text-[#dc2626]' : 'bg-[#f2f3f5] text-[#8a909c]',
      titulo: 'Intentos fallidos',
      valor: k.hayHistorialAccesos ? String(k.intentosFallidos24h) : '—',
      pie: k.hayHistorialAccesos ? 'En las últimas 24 horas' : 'Aún sin historial',
      pieTono: k.intentosFallidos24h > 0 ? 'text-[#dc2626]' : 'text-[#9ba1ab]',
    },
  ];

  return (
    <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {tarjetas.map(t => (
        <section key={t.titulo} className="rounded-xl border border-[#e8eaed] bg-white p-4">
          <div className="flex items-start gap-2.5">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', t.tinte)}>
              {t.icono}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[12px] text-[#8a909c]">{t.titulo}</h3>
              <p className={cn(
                'num mt-0.5 font-extrabold tracking-tight text-[#16181d]',
                t.pequeno ? 'text-[15px]' : 'text-[22px] leading-none',
              )}>
                {t.valor}
              </p>
              <p className={cn('mt-1 truncate text-[11px]', t.pieTono)}>{t.pie}</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
