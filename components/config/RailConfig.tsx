'use client';

import {
  ArrowRight, BadgeCheck, Briefcase, Clock, Crown, KeyRound, Lock,
  ShieldCheck, UserPlus, Users, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RolConfig } from './tipos';

/** Un icono y un color por rol, para reconocerlos sin leer. */
const PINTA: Record<string, { icono: React.ReactNode; tinte: string }> = {
  admin: { icono: <Crown className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#fff1e7] text-[#f97316]' },
  gerente: { icono: <Briefcase className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
  jefe_taller: { icono: <Wrench className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#fff4ec] text-[#ea580c]' },
  supervisor: { icono: <BadgeCheck className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
  mecanico: { icono: <ShieldCheck className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
  atencion_cliente: { icono: <Users className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#e4f6f6] text-[#0d9488]' },
  cobranza: { icono: <KeyRound className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#faf5ff] text-[#9333ea]' },
  registrador: { icono: <UserPlus className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#eef1f5] text-[#5b616e]' },
};

const POR_DEFECTO = { icono: <ShieldCheck className="h-[17px] w-[17px]" aria-hidden />, tinte: 'bg-[#eef1f5] text-[#5b616e]' };

interface Props {
  roles: readonly RolConfig[];
  onGestionarRoles: () => void;
  onNuevoUsuario: () => void;
  onNuevoRol: () => void;
  onHistorial: () => void;
  onPolitica: () => void;
}

/**
 * La columna de la derecha: qué roles hay y los cuatro atajos que se usan a
 * diario. Cada uno lleva a un sitio real; ninguno es decorativo.
 */
export default function RailConfig({
  roles, onGestionarRoles, onNuevoUsuario, onNuevoRol, onHistorial, onPolitica,
}: Props) {
  const conGente = roles.filter(r => r.usuarios > 0);
  const lista = conGente.length > 0 ? conGente : roles.slice(0, 6);

  const atajos = [
    { icono: <UserPlus className="h-[19px] w-[19px]" aria-hidden />, label: 'Nuevo usuario', tinte: 'text-[#2563eb]', onClick: onNuevoUsuario },
    { icono: <ShieldCheck className="h-[19px] w-[19px]" aria-hidden />, label: 'Nuevo rol', tinte: 'text-[#f97316]', onClick: onNuevoRol },
    { icono: <Clock className="h-[19px] w-[19px]" aria-hidden />, label: 'Historial de accesos', tinte: 'text-[#7c3aed]', onClick: onHistorial },
    { icono: <Lock className="h-[19px] w-[19px]" aria-hidden />, label: 'Política de seguridad', tinte: 'text-[#16a34a]', onClick: onPolitica },
  ];

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 lg:w-[330px]">
      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
        <header className="flex items-center gap-2 px-4 pb-1 pt-4">
          <h2 className="flex-1 text-[15px] font-bold text-[#16181d]">Roles y permisos</h2>
          <button
            onClick={onGestionarRoles}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[#f97316] hover:underline"
          >
            Ver todos
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        <ul className="px-2 py-2">
          {lista.map(r => {
            const p = PINTA[r.nombre] || POR_DEFECTO;
            return (
              <li key={r.nombre}>
                <button
                  onClick={onGestionarRoles}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#fafbfc]"
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', p.tinte)}>
                    {p.icono}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{r.label}</span>
                    <span className="block truncate text-[11px] text-[#8a909c]">{r.descripcion || 'Sin descripción'}</span>
                  </span>
                  <span className="num shrink-0 text-[11px] text-[#8a909c]">
                    {r.usuarios} usuario{r.usuarios === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-4 pb-4">
          <button
            onClick={onGestionarRoles}
            className="flex h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-[#e2e5ea] text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Gestionar roles y permisos
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <h2 className="mb-3 text-[15px] font-bold text-[#16181d]">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {atajos.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="flex h-[86px] flex-col items-center justify-center gap-2 rounded-lg border border-[#e8eaed] px-2 text-center transition-colors hover:border-[#f97316] hover:bg-[#fffaf6]"
            >
              <span className={a.tinte}>{a.icono}</span>
              <span className="text-[11.5px] font-medium leading-tight text-[#3d4350]">{a.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
