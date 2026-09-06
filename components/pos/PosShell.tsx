'use client';

import type { ReactNode } from 'react';
import {
  Bell, Calendar, Car, ChevronDown, ChevronRight, DollarSign, FileSpreadsheet,
  LayoutDashboard, MapPin, Moon, Package, Receipt, Search, Settings, ShoppingBag,
  ShoppingCart, Users, UsersRound, Wallet, Wrench, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: LucideIcon;
  badge?: string;
  expandable?: boolean;
  active?: boolean;
  children?: { label: string; active?: boolean }[];
}

/**
 * Navegación tal como está en el diseño de referencia: grupos colapsables y el
 * módulo activo abierto mostrando sus sub-secciones.
 */
const NAV: readonly NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Agenda', icon: Calendar },
  { label: 'Clientes', icon: Users },
  { label: 'Vehículos', icon: Car },
  { label: 'Servicios', icon: Wrench, expandable: true },
  { label: 'Inventario', icon: Package },
  { label: 'Compras', icon: ShoppingBag },
  {
    label: 'Ventas',
    icon: ShoppingCart,
    active: true,
    children: [
      { label: 'Nueva venta', active: true },
      { label: 'Historial de ventas' },
      { label: 'Notas de entrega' },
      { label: 'Devoluciones' },
      { label: 'Cotizaciones' },
    ],
  },
  { label: 'Facturación', icon: Receipt },
  { label: 'Presupuestos', icon: FileSpreadsheet },
  { label: 'WhatsApp', icon: WhatsAppIcon as unknown as LucideIcon, badge: '3' },
  { label: 'Nómina', icon: Wallet, expandable: true },
  { label: 'Reportes', icon: ChartIcon as unknown as LucideIcon, expandable: true },
  { label: 'Finanzas', icon: DollarSign },
  { label: 'RRHH', icon: UsersRound },
  { label: 'Configuración', icon: Settings },
];

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.42 1.27 4.86L2 22l5.28-1.24A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm0 18.2c-1.6 0-3.09-.46-4.35-1.26l-.31-.19-3.13.73.75-3.05-.2-.32A8.14 8.14 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2Z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" fill="currentColor" stroke="none" rx="1" />
      <rect x="12" y="8" width="3" height="10" fill="currentColor" stroke="none" rx="1" />
      <rect x="17" y="5" width="3" height="13" fill="currentColor" stroke="none" rx="1" />
    </svg>
  );
}

export default function PosShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#f6f7f9] text-[#16181d]">
      {/* ── Barra lateral ─────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col bg-[#17181c] text-[#c9ccd3] lg:flex">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <img src="/Nuevo_Lycos_LOGO.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0 leading-none">
            <p className="text-[17px] font-extrabold tracking-tight text-white">
              Lycos <span className="text-[#f97316]">Team</span>
            </p>
            <p className="mt-1 text-[9px] font-medium tracking-[0.14em] text-[#6f7480]">
              ERP AUTOMOTRIZ
            </p>
          </div>
        </div>

        <nav className="mt-1 flex-1 overflow-y-auto px-2.5 pb-3">
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label}>
                <button
                  className={cn(
                    'flex h-[34px] w-full items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors',
                    item.active
                      ? 'bg-[#f97316] font-semibold text-white'
                      : 'text-[#c9ccd3] hover:bg-white/[0.06] hover:text-white',
                  )}
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {item.badge && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f97316] px-1 text-[10.5px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                  {item.expandable && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
                </button>

                {item.children && (
                  <div className="mb-1 mt-0.5">
                    {item.children.map(child => (
                      <button
                        key={child.label}
                        className={cn(
                          'flex h-[28px] w-full items-center rounded-md pl-[42px] pr-3 text-left text-[12.5px] transition-colors',
                          child.active
                            ? 'font-semibold text-[#f97316]'
                            : 'text-[#9ba0aa] hover:text-white',
                        )}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Tarjeta de marca. Sin la foto original queda el fondo oscuro. */}
        <div className="mx-3 mb-3 overflow-hidden rounded-xl bg-[#0f1013]">
          <div className="relative h-[132px] bg-gradient-to-br from-[#1c1e24] via-[#141519] to-[#0f1013]">
            <div className="absolute inset-x-0 top-0 p-3.5">
              <p className="text-[12.5px] font-semibold leading-snug text-white">
                Más que un taller,
                <br />
                un aliado en el camino.
              </p>
            </div>
            <div className="absolute bottom-0 right-0 h-16 w-full bg-[radial-gradient(ellipse_at_bottom_right,rgba(249,115,22,0.22),transparent_65%)]" />
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-white/[0.07] px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
            N
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-medium text-white">Lycos Team ERP</p>
            <p className="text-[10.5px] text-[#6f7480]">v2.0.0</p>
          </div>
        </div>
      </aside>

      {/* ── Contenido ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-[220px]">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-[#e8eaed] bg-white px-4">
          <div className="relative w-full max-w-[520px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
            <input
              placeholder="Buscar clientes, vehículos, productos, servicios, facturas..."
              aria-label="Búsqueda global"
              className="h-[38px] w-full rounded-lg bg-[#f2f3f5] pl-9 pr-16 text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:ring-2 focus:ring-[#f97316]/30"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#9ba1ab]">
              Ctrl + K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f2f3f5]">
              <MapPin className="h-4 w-4 text-[#f97316]" aria-hidden />
              San Antonio de los Altos
              <ChevronDown className="h-3.5 w-3.5 text-[#9ba1ab]" aria-hidden />
            </button>

            <button className="relative rounded-lg p-2 text-[#5b616e] hover:bg-[#f2f3f5]" aria-label="Notificaciones">
              <Bell className="h-[18px] w-[18px]" aria-hidden />
              <span className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#f97316] px-[3px] text-[9.5px] font-bold text-white">
                3
              </span>
            </button>

            <button className="rounded-lg p-2 text-[#5b616e] hover:bg-[#f2f3f5]" aria-label="Cambiar tema">
              <Moon className="h-[18px] w-[18px]" aria-hidden />
            </button>

            <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-[#f2f3f5]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f97316] text-[13px] font-bold text-white">
                A
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-[12.5px] font-semibold text-[#16181d]">Administrador</span>
                <span className="block text-[10.5px] text-[#9ba1ab]">Administrador</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#9ba1ab]" aria-hidden />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

export { ChevronRight };
